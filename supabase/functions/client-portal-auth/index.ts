import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Simple hash using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "pulse_portal_salt_2026");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { action, login, password, client_id, slug } = await req.json();

    // ACTION: login
    if (action === "login") {
      if (!login || !password) {
        return new Response(JSON.stringify({ error: "Login e senha obrigatórios" }), { status: 400, headers: corsHeaders });
      }

      const { data: client, error } = await adminClient
        .from("clients")
        .select("id, company_name, client_login, client_password_hash, color, logo_url")
        .eq("client_login", login.trim())
        .single();

      if (error || !client) {
        return new Response(JSON.stringify({ error: "Login não encontrado" }), { status: 404, headers: corsHeaders });
      }

      const passwordHash = await hashPassword(password);
      if (client.client_password_hash !== passwordHash) {
        return new Response(JSON.stringify({ error: "Senha incorreta" }), { status: 401, headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        success: true,
        client_id: client.id,
        company_name: client.company_name,
        color: client.color,
        logo_url: client.logo_url,
      }), { headers: corsHeaders });
    }

    // ACTION: register
    if (action === "register") {
      if (!client_id || !login || !password) {
        return new Response(JSON.stringify({ error: "Dados incompletos" }), { status: 400, headers: corsHeaders });
      }

      // Check if client already has credentials
      const { data: existing } = await adminClient
        .from("clients")
        .select("client_login, client_password_hash")
        .eq("id", client_id)
        .single();

      if (existing?.client_login && existing?.client_password_hash) {
        return new Response(JSON.stringify({ error: "Conta já existe" }), { status: 409, headers: corsHeaders });
      }

      // Check if login is taken
      const { data: taken } = await adminClient
        .from("clients")
        .select("id")
        .eq("client_login", login.trim())
        .neq("id", client_id)
        .maybeSingle();

      if (taken) {
        return new Response(JSON.stringify({ error: "Login já em uso" }), { status: 409, headers: corsHeaders });
      }

      const passwordHash = await hashPassword(password);
      const { error } = await adminClient
        .from("clients")
        .update({ client_login: login.trim(), client_password_hash: passwordHash })
        .eq("id", client_id);

      if (error) {
        return new Response(JSON.stringify({ error: "Erro ao criar conta" }), { status: 500, headers: corsHeaders });
      }

      const { data: clientData } = await adminClient
        .from("clients")
        .select("company_name")
        .eq("id", client_id)
        .single();

      return new Response(JSON.stringify({
        success: true,
        client_id,
        company_name: clientData?.company_name,
      }), { headers: corsHeaders });
    }

    // ACTION: get_client_info (public branding info only)
    if (action === "get_info") {
      if (!client_id && !slug) {
        return new Response(JSON.stringify({ error: "client_id or slug required" }), { status: 400, headers: corsHeaders });
      }

      let query = adminClient.from("clients").select("id, company_name, color, logo_url, client_login, client_password_hash");
      if (client_id) {
        query = query.eq("id", client_id);
      } else {
        query = query.ilike("company_name", slug.replace(/-/g, " "));
      }

      const { data, error } = await query.single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Cliente não encontrado" }), { status: 404, headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        id: data.id,
        company_name: data.company_name,
        color: data.color,
        logo_url: data.logo_url,
        has_credentials: !!(data.client_login && data.client_password_hash),
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("Portal auth error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
