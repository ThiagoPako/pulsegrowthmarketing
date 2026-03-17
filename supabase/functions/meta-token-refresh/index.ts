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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all active Meta integrations
    const { data: integrations } = await supabase
      .from("api_integrations")
      .select("*")
      .eq("provider", "meta_ads")
      .eq("status", "ativo");

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active Meta integrations found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: any[] = [];

    for (const integration of integrations) {
      const config = integration.config || {};
      const currentToken = config.meta_page_token_encrypted || config.meta_page_token;
      const appId = config.meta_app_id;
      const appSecret = config.meta_app_secret_encrypted || config.meta_app_secret;

      if (!currentToken || !appId || !appSecret) {
        results.push({ id: integration.id, status: "skipped", reason: "missing credentials" });
        continue;
      }

      try {
        // Exchange for a new long-lived token
        const params = new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: currentToken,
        });

        const response = await fetch(
          `${META_API_BASE}/oauth/access_token?${params.toString()}`
        );
        const data = await response.json();

        if (data.access_token) {
          // Update config with new token
          const updatedConfig = {
            ...config,
            meta_page_token_encrypted: data.access_token,
            token_refreshed_at: new Date().toISOString(),
            token_expires_in: data.expires_in,
          };

          await supabase.from("api_integrations").update({
            config: updatedConfig,
            last_checked_at: new Date().toISOString(),
            last_error: null,
            status: "ativo",
          }).eq("id", integration.id);

          await supabase.from("api_integration_logs").insert({
            integration_id: integration.id,
            action: "token renovado automaticamente",
            status: "success",
            details: { expires_in: data.expires_in },
          });

          results.push({ id: integration.id, status: "refreshed" });
        } else {
          const errorMsg = data.error?.message || "Failed to refresh token";

          await supabase.from("api_integrations").update({
            last_error: errorMsg,
            last_checked_at: new Date().toISOString(),
            status: "erro",
          }).eq("id", integration.id);

          await supabase.from("api_integration_logs").insert({
            integration_id: integration.id,
            action: "falha na renovação de token",
            status: "error",
            details: { error: errorMsg },
          });

          results.push({ id: integration.id, status: "error", error: errorMsg });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.push({ id: integration.id, status: "error", error: msg });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Token refresh error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
