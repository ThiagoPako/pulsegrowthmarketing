import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAiConfig(provider?: string, dbApiKey?: string) {
  const geminiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (provider === "gemini" && (geminiKey || dbApiKey)) return { key: geminiKey || dbApiKey!, provider: "gemini" as const };
  if (provider === "openai" && (openaiKey || dbApiKey)) return { key: openaiKey || dbApiKey!, provider: "openai" as const };
  if (provider === "claude" && (claudeKey || dbApiKey)) return { key: claudeKey || dbApiKey!, provider: "claude" as const };

  if (geminiKey) return { key: geminiKey, provider: "gemini" as const };
  if (openaiKey) return { key: openaiKey, provider: "openai" as const };
  if (claudeKey) return { key: claudeKey, provider: "claude" as const };

  throw new Error("Nenhuma API key de IA configurada.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scriptContent, clientName, niche, aiModel, aiProvider } = await req.json();

    if (!scriptContent) {
      return new Response(JSON.stringify({ error: "scriptContent is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch API key from DB if env vars not set
    let dbApiKey: string | undefined;
    if (aiProvider) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const providerMap: Record<string, string> = { gemini: "ai_gemini", openai: "ai_openai", claude: "ai_claude" };
      const { data: aiIntegration } = await supabase
        .from("api_integrations")
        .select("config")
        .eq("provider", providerMap[aiProvider] || "")
        .eq("status", "ativo")
        .limit(1)
        .single();
      if (aiIntegration?.config) {
        dbApiKey = (aiIntegration.config as any).api_key_encrypted;
      }
    }

    const ai = await getAiConfig(aiProvider, dbApiKey);
    const model = aiModel || "gemini-2.5-flash-lite";

    const prompt = `Você é um social media profissional brasileiro. Com base no roteiro de vídeo abaixo, gere uma LEGENDA curta para Instagram.

Regras:
- Máximo 200 caracteres
- Inclua CTA curta e direta
- Use 1-3 emojis estratégicos
- Seja envolvente e gere curiosidade
- NÃO inclua hashtags
- Coerente com o conteúdo do vídeo

${clientName ? `CLIENTE: ${clientName}` : ""}
${niche ? `NICHO: ${niche}` : ""}

ROTEIRO:
${scriptContent}

Responda APENAS com a legenda, sem explicações.`;

    let caption = "";

    if (ai.provider === "gemini") {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.key}`;
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini error [${response.status}]: ${errText}`);
      }
      const data = await response.json();
      caption = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    } else if (ai.provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.key}` },
        body: JSON.stringify({
          model, messages: [{ role: "user", content: prompt }], max_tokens: 300, temperature: 0.7,
        }),
      });
      if (!response.ok) { const e = await response.text(); throw new Error(`OpenAI error: ${e}`); }
      const data = await response.json();
      caption = data.choices?.[0]?.message?.content?.trim() || "";
    } else if (ai.provider === "claude") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ai.key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: 300, messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok) { const e = await response.text(); throw new Error(`Claude error: ${e}`); }
      const data = await response.json();
      caption = data.content?.[0]?.text?.trim() || "";
    }

    // Ensure max 200 chars
    if (caption.length > 200) caption = caption.slice(0, 197) + "...";

    return new Response(JSON.stringify({ caption }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Generate caption error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
