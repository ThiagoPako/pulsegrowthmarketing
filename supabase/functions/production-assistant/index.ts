import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const { context } = await req.json();

    const systemPrompt = `Você é o "Foguetinho", mascote assistente da agência Pulse Growth Marketing.
Fale de forma curta (máx 2-3 frases), motivacional, brasileira, com 1 emoji.
Use markdown leve (**negrito**) para destacar nomes e números.
Foque em produtividade, prazos e clima de equipe. Nada genérico.`;

    const userPrompt = `Contexto atual:
- Colaborador: ${context.userName} (${context.userRole})
- Sexta-feira? ${context.isFriday ? "Sim 🎉" : "Não"}
- Tarefas atrasadas na agência: ${context.overdueCount}
- Minhas tarefas de conteúdo pendentes: ${context.myPendingContent}
- Minhas tarefas de design pendentes: ${context.myPendingDesign}
- Total de produção em andamento: ${context.totalPending}
${context.overdueTitles?.length ? `- Títulos atrasados: ${context.overdueTitles.join(", ")}` : ""}

Gere uma mensagem curta e personalizada para esse colaborador agora.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Lovable AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados. Adicione saldo em Settings > Workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content || "Bora produzir! 🚀";

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("production-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
