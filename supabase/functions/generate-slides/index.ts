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

    const prompt = `Você é um designer sênior de apresentações corporativas premium. Crie uma apresentação de treinamento seguindo rigorosamente a identidade visual da agência Pulse Growth Marketing.

## IDENTIDADE VISUAL PULSE (OBRIGATÓRIO)
- Cor primária: Laranja vibrante HSL "16 82% 51%" — use em títulos, destaques e CTAs
- Fundo escuro principal: "220 15% 10%" (preto azulado elegante)
- Fundo escuro secundário: "220 13% 15%" (cinza escuro sofisticado)  
- Fundo claro: "0 0% 97%" (branco suave)
- Texto claro: "0 0% 100%" (branco) sobre fundos escuros
- Texto escuro: "220 10% 20%" sobre fundos claros
- Accent secundário: "200 80% 55%" (azul vibrante para informações)
- Sucesso/Destaque: "142 71% 45%" (verde para métricas positivas)
- Tipografia: Space Grotesk para títulos (bold), Inter para corpo

## ESTRUTURA DA APRESENTAÇÃO
- Slide 1: CAPA — fundo escuro "220 15% 10%" com título em laranja "16 82% 51%", subtítulo em branco
- Slides intermediários: Alternar entre fundo escuro e fundo claro para criar ritmo visual
- Use slides de "section_divider" (layout "title_only") com fundo laranja "16 82% 51%" para separar seções
- Slide final: ENCERRAMENTO com fundo escuro, mensagem de impacto

## REGRAS DE CONTEÚDO
- Analise profundamente o texto e extraia os pontos-chave
- Transforme parágrafos longos em bullet points concisos e impactantes (use •)
- Adicione emojis estratégicos (🚀 📈 🎯 💡 ⚡ 🔥 ✅ 💰) para dinamismo
- Crie títulos curtos e memoráveis (máx 6 palavras)
- Subtítulos complementam com contexto (máx 12 palavras)
- Máximo 5 bullet points por slide
- Cada bullet point com no máximo 15 palavras
- Crie entre 5 e 20 slides dependendo da densidade do conteúdo

## LAYOUTS DISPONÍVEIS
- "title_only": Capas, divisões de seção, frases de impacto (título grande, centralizado)
- "title_content": Título + bullets/texto (mais usado, informativo)
- "quote": Citação ou frase de destaque (título = frase, subtitle = autor/fonte)
- "metrics": Para dados e números (content com métricas formatadas)
- "closing": Slide final com CTA ou mensagem de encerramento

Título da apresentação: ${title || "Treinamento"}

Conteúdo para transformar em slides:
${content.substring(0, 12000)}

Responda APENAS com JSON válido:
{"slides":[{"title":"...","subtitle":"...","content":"...","layout_type":"title_content","background_color":"220 15% 10%","text_color":"0 0% 100%"}]}`;

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemini API error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "Erro na API Gemini: " + aiRes.status }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const finishReason = aiData.candidates?.[0]?.finishReason;
    const aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    console.log("Gemini finishReason:", finishReason, "content length:", aiContent.length);

    if (!aiContent) {
      console.error("Empty Gemini response. Full response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "Resposta vazia da IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
