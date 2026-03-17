import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const META_API_BASE = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (await req.json().catch(() => ({}))).action;

    // ACTION 1: Generate OAuth URL for a client
    if (action === "get_oauth_url") {
      const body = await req.json().catch(() => ({}));
      const { client_id, redirect_uri } = body;

      // Fetch global Meta config
      const { data: metaIntegration } = await supabase
        .from("api_integrations")
        .select("config")
        .eq("provider", "meta_ads")
        .eq("status", "ativo")
        .limit(1)
        .single();

      if (!metaIntegration) {
        return new Response(
          JSON.stringify({ error: "Meta integration not configured. Please set up App ID and App Secret in API settings first." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const config = metaIntegration.config as any;
      const appId = config?.meta_app_id;

      if (!appId) {
        return new Response(
          JSON.stringify({ error: "Meta App ID not found in configuration" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const scopes = [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "instagram_basic",
        "instagram_content_publish",
      ].join(",");

      const state = JSON.stringify({ client_id });
      const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${scopes}&state=${encodeURIComponent(state)}&response_type=code`;

      return new Response(
        JSON.stringify({ oauth_url: oauthUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION 2: Exchange code for token and fetch accounts
    if (action === "exchange_code") {
      const body = await req.json().catch(() => ({}));
      const { code, redirect_uri, client_id } = body;

      if (!code || !redirect_uri || !client_id) {
        return new Response(
          JSON.stringify({ error: "Missing code, redirect_uri, or client_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch global Meta config
      const { data: metaIntegration } = await supabase
        .from("api_integrations")
        .select("config")
        .eq("provider", "meta_ads")
        .eq("status", "ativo")
        .limit(1)
        .single();

      if (!metaIntegration) {
        return new Response(
          JSON.stringify({ error: "Meta integration not configured" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const config = metaIntegration.config as any;
      const appId = config?.meta_app_id;
      const appSecret = config?.meta_app_secret_encrypted;

      if (!appId || !appSecret) {
        return new Response(
          JSON.stringify({ error: "Meta App ID or App Secret not found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 1: Exchange code for short-lived token
      const tokenRes = await fetch(
        `${META_API_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirect_uri)}&code=${code}`
      );
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        return new Response(
          JSON.stringify({ error: "Failed to exchange code: " + (tokenData.error.message || JSON.stringify(tokenData.error)) }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const shortToken = tokenData.access_token;

      // Step 2: Exchange for long-lived token
      const longTokenRes = await fetch(
        `${META_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
      );
      const longTokenData = await longTokenRes.json();
      const longToken = longTokenData.access_token || shortToken;

      // Step 3: Get user's pages
      const pagesRes = await fetch(
        `${META_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}&access_token=${longToken}`
      );
      const pagesData = await pagesRes.json();

      if (pagesData.error) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch pages: " + pagesData.error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pages = pagesData.data || [];
      const connectedAccounts: any[] = [];

      // Delete existing social accounts for this client
      await supabase.from("social_accounts").delete().eq("client_id", client_id);

      for (const page of pages) {
        // Save Facebook Page
        await supabase.from("social_accounts").insert({
          client_id,
          platform: "facebook",
          facebook_page_id: page.id,
          account_name: page.name,
          access_token: page.access_token, // Page-level long-lived token
          status: "connected",
          token_expiration: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // ~60 days
        });

        connectedAccounts.push({
          platform: "facebook",
          name: page.name,
          pageId: page.id,
        });

        // Save Instagram Business Account if linked
        if (page.instagram_business_account) {
          const ig = page.instagram_business_account;
          await supabase.from("social_accounts").insert({
            client_id,
            platform: "instagram",
            facebook_page_id: page.id,
            instagram_business_id: ig.id,
            account_name: ig.username || ig.name,
            access_token: page.access_token, // Uses page token
            status: "connected",
            token_expiration: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          });

          connectedAccounts.push({
            platform: "instagram",
            name: ig.username || ig.name,
            username: ig.username,
            businessId: ig.id,
            profilePicture: ig.profile_picture_url,
            pageId: page.id,
          });
        }

        // Log
        await supabase.from("integration_logs").insert({
          client_id,
          platform: "facebook",
          action: "oauth_connect",
          status: "success",
          message: `Página ${page.name} conectada via OAuth. ${page.instagram_business_account ? 'Instagram @' + (page.instagram_business_account.username || '') + ' vinculado.' : 'Sem Instagram vinculado.'}`,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          accounts: connectedAccounts,
          pages_found: pages.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'get_oauth_url' or 'exchange_code'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Meta OAuth error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
