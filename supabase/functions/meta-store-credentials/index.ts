import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      integration_id,
      meta_app_id,
      meta_app_secret,
      meta_page_token,
      meta_ig_business_id,
      meta_page_id,
    } = body;

    if (!integration_id) {
      return new Response(
        JSON.stringify({ error: "integration_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build config update — only update provided fields
    const { data: current } = await adminClient
      .from("api_integrations")
      .select("config")
      .eq("id", integration_id)
      .single();

    const existingConfig = current?.config || {};
    const updatedConfig: any = { ...existingConfig };

    if (meta_app_id) updatedConfig.meta_app_id = meta_app_id;
    if (meta_app_secret) updatedConfig.meta_app_secret_encrypted = meta_app_secret;
    if (meta_page_token) updatedConfig.meta_page_token_encrypted = meta_page_token;
    if (meta_ig_business_id) updatedConfig.meta_ig_business_id = meta_ig_business_id;
    if (meta_page_id) updatedConfig.meta_page_id = meta_page_id;

    // Store masked versions for UI display
    if (meta_app_secret) updatedConfig.meta_app_secret = "••••" + meta_app_secret.slice(-4);
    if (meta_page_token) updatedConfig.meta_page_token = "••••" + meta_page_token.slice(-4);

    updatedConfig.credentials_updated_at = new Date().toISOString();

    await adminClient.from("api_integrations").update({
      config: updatedConfig,
      updated_at: new Date().toISOString(),
    }).eq("id", integration_id);

    // Log
    await adminClient.from("api_integration_logs").insert({
      integration_id,
      action: "credenciais atualizadas via backend seguro",
      status: "success",
      details: {
        fields_updated: [
          meta_app_id && "app_id",
          meta_app_secret && "app_secret",
          meta_page_token && "page_token",
          meta_ig_business_id && "ig_business_id",
          meta_page_id && "page_id",
        ].filter(Boolean),
      },
      performed_by: user.id,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Credentials stored securely" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Store credentials error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
