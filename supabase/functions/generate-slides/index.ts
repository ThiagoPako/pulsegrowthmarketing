import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_KEY) throw new Error("GOOGLE_GEMINI_API_KEY is not configured");

    const { content, title } = await req.json();
    if (!content || typeof content !== "string" || content.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Conteúdo muito curto" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Você é um designer de apresentações profissionais. Analise o conteúdo abaixo e crie slides para uma apresentação de treinamento comercial.

Título da apresentação: ${title || "Treinamento"}

Conteúdo para transformar em slides:
${content.substring(0, 8000)}

REGRAS:
- Crie entre 3 e 15 slides dependendo da quantidade de conteúdo
- O primeiro slide deve ser a capa com o título principal
- Cada slide deve ter conteúdo conciso e impactante
- Use bullet points (com •) para listas no campo content
- Escolha o layout mais adequado para cada slide
- Layouts disponíveis: "title_only" (capas/divisões), "title_content" (título + texto), "image_left", "image_right", "image_full"
- Sugira cores de fundo variadas usando valores HSL no formato "H S% L%" (ex: "217 91% 60%", "142 71% 45%", "262 83% 58%")
- text_color deve ser "0 0% 100%" (branco) para fundos escuros ou "0 0% 15%" (escuro) para fundos claros

Responda APENAS com JSON válido:
{
  "slides": [
    {
      "title": "Título do slide",
      "subtitle": "Subtítulo opcional",
      "content": "• Ponto 1\\n• Ponto 2\\n• Ponto 3",
      "layout_type": "title_content",
      "background_color": "217 91% 60%",
      "text_color": "0 0% 100%"
    }
  ]
}`;

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Você é um especialista em apresentações corporativas. Responda APENAS com JSON válido.\n\n" + prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI slides error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro ao gerar slides" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = aiContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("generate-slides error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
