import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { clientId, topic, videoType, contentFormat, additionalContext } = await req.json();

    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch client data
    const { data: client } = await supabase
      .from("clients")
      .select("company_name, niche, editorial, briefing_data")
      .eq("id", clientId)
      .single();

    if (!client) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch previous scripts for this client (learning context)
    const { data: previousScripts } = await supabase
      .from("scripts")
      .select("title, content, video_type, content_format, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(15);

    // Build learning context from previous scripts
    const scriptExamples = (previousScripts || [])
      .filter((s: any) => s.content && s.content.length > 50)
      .slice(0, 10)
      .map((s: any, i: number) => {
        // Strip HTML tags for context
        const cleanContent = s.content
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .substring(0, 800);
        return `--- Roteiro ${i + 1}: "${s.title}" (${s.video_type || "geral"}, ${s.content_format || "reels"}) ---\n${cleanContent}`;
      })
      .join("\n\n");

    const hasExamples = scriptExamples.length > 0;
    const scriptCount = (previousScripts || []).length;

    const systemPrompt = `Você é um roteirista profissional de uma agência de marketing digital brasileira chamada Pulse Growth Marketing. Você cria roteiros para vídeos de redes sociais (Reels, Stories, etc).

${hasExamples ? `IMPORTANTE: Este cliente já tem ${scriptCount} roteiros anteriores. Analise o ESTILO, TOM DE VOZ, ESTRUTURA e LINGUAGEM dos roteiros abaixo para criar um novo roteiro que mantenha a mesma identidade e padrão de comunicação. Quanto mais roteiros existirem, mais preciso deve ser o estilo.

ROTEIROS ANTERIORES DO CLIENTE (use como referência de estilo):
${scriptExamples}
` : "Este é um novo cliente sem roteiros anteriores. Crie um roteiro profissional e envolvente baseado nas informações disponíveis."}

REGRAS DO ROTEIRO:
1. Use linguagem natural e conversacional
2. Inclua marcações de cena entre [colchetes]
3. Indique cortes com "CORTA PARA:"
4. Use emojis estrategicamente para engajamento
5. Mantenha frases curtas e impactantes
6. Inclua CTA (chamada para ação) no final
7. Adapte o tom ao nicho do cliente
8. O roteiro deve ser prático e filmável`;

    const userPrompt = `Crie um roteiro para o cliente "${client.company_name}".

Nicho: ${client.niche || "geral"}
${client.editorial ? `Linha Editorial: ${client.editorial.substring(0, 500)}` : ""}
${client.briefing_data ? `Dados do Briefing: ${JSON.stringify(client.briefing_data).substring(0, 500)}` : ""}

Tipo de vídeo: ${videoType || "vendas"}
Formato: ${contentFormat || "reels"}
${topic ? `Tema/Assunto: ${topic}` : "Sugira um tema relevante para o nicho"}
${additionalContext ? `Contexto adicional: ${additionalContext}` : ""}

Gere o roteiro completo em HTML (use tags <p>, <strong>, <em>). NÃO use markdown.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Aguarde alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro ao gerar roteiro" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const generatedScript = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({
      script: generatedScript,
      learningContext: {
        totalScripts: scriptCount,
        usedAsReference: Math.min(scriptCount, 10),
        hasLearningData: hasExamples,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-script-generator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
