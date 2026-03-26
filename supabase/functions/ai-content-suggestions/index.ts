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

    const body = await req.json();
    const { clientId, type, description } = body;

    // ===== System Modules Generation =====
    if (type === "system_modules" && description) {
      const modulePrompt = `Você é um arquiteto de sistemas. Com base na descrição abaixo, gere os módulos e entregas de um sistema/software.

Descrição das funções:
${description}

Responda APENAS com JSON válido:
{
  "modules": [
    { "name": "Nome do Módulo", "description": "O que ele faz em uma frase" }
  ],
  "deliverables": [
    { "name": "Nome da entrega", "description": "Detalhes" }
  ]
}

Gere entre 4 e 10 módulos relevantes e 3-6 entregas. Seja específico e profissional.`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Você é um arquiteto de software. Responda APENAS com JSON válido." },
            { role: "user", content: modulePrompt },
          ],
        }),
      });

      if (!aiRes.ok) {
        return new Response(JSON.stringify({ error: "Erro ao gerar módulos" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiRes.json();
      const aiContent = aiData.choices?.[0]?.message?.content || "";
      try {
        const cleaned = aiContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ modules: [], error: "Falha ao interpretar resposta da IA" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ===== Proposal Timeline Generation =====
    if (type === "proposal_timeline" && description) {
      const timelinePrompt = `Você é um gestor de projetos de uma agência de marketing digital chamada Pulse Growth Marketing. Com base na descrição abaixo, gere um cronograma completo de entregas para uma proposta comercial.

Descrição do projeto:
${description}

Responda APENAS com JSON válido:
{
  "projectName": "Nome sugerido para o projeto",
  "methodology": "Breve descrição da metodologia de trabalho (2-3 frases)",
  "deliverables": [
    {
      "name": "Nome do serviço/entrega",
      "description": "Descrição detalhada do que será feito",
      "category": "video|design|social_media|traffic|event|consulting|photography|other",
      "quantity": 1,
      "unitPrice": 500.00,
      "estimatedDays": 7,
      "phase": 1
    }
  ],
  "phases": [
    {
      "number": 1,
      "name": "Nome da Fase",
      "description": "O que acontece nesta fase",
      "durationDays": 15
    }
  ],
  "totalEstimatedDays": 60,
  "suggestedDiscount": 10
}

Gere entre 5 e 15 entregas relevantes organizadas em 2-4 fases. Os preços devem ser realistas para o mercado brasileiro de marketing digital. Cada entrega deve ter um valor unitário baseado na complexidade. Seja específico e profissional.`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Você é um gestor de projetos de marketing digital. Responda APENAS com JSON válido." },
            { role: "user", content: timelinePrompt },
          ],
        }),
      });

      if (!aiRes.ok) {
        return new Response(JSON.stringify({ error: "Erro ao gerar cronograma" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiRes.json();
      const aiContent = aiData.choices?.[0]?.message?.content || "";
      try {
        const cleaned = aiContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ deliverables: [], error: "Falha ao interpretar resposta da IA" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ===== Content Suggestions (original) =====
    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch client
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

    // Fetch recent scripts
    const { data: recentScripts } = await supabase
      .from("scripts")
      .select("title, video_type, content_format, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch recent content tasks
    const { data: recentTasks } = await supabase
      .from("content_tasks")
      .select("title, content_type, kanban_column, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20);

    const recentContent = [
      ...(recentScripts || []).map((s: any) => `Roteiro: "${s.title}" (${s.video_type}, ${s.content_format})`),
      ...(recentTasks || []).map((t: any) => `Tarefa: "${t.title}" (${t.content_type}, ${t.kanban_column})`),
    ].slice(0, 20).join("\n");

    const now = new Date();

    const prompt = `Você é um estrategista de conteúdo da agência Pulse Growth Marketing. Analise o histórico de conteúdos do cliente e sugira os próximos conteúdos.

Cliente: ${client.company_name}
Nicho: ${client.niche || "geral"}
${client.editorial ? `Linha Editorial: ${client.editorial.substring(0, 400)}` : ""}
Data atual: ${now.toLocaleDateString("pt-BR")}

CONTEÚDOS RECENTES (últimos produzidos):
${recentContent || "Nenhum conteúdo anterior encontrado."}

Com base no histórico, nicho e tendências atuais, sugira 5 próximos conteúdos que o cliente deveria produzir. Considere:
1. Variedade de tipos (vendas, institucional, bastidores, educacional, depoimento)
2. O que ainda não foi abordado recentemente
3. Tendências do setor/nicho
4. Datas sazonais próximas
5. Equilíbrio entre conteúdo de atração e conversão

Responda APENAS com JSON válido:
[
  {
    "title": "Sugestão de título",
    "video_type": "vendas|institucional|educacional|bastidores|depoimento|lancamento|reconhecimento",
    "content_format": "reels|story|criativo",
    "description": "Breve descrição do conteúdo e abordagem",
    "priority": "high|medium|low",
    "reasoning": "Por que esse conteúdo agora"
  }
]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um estrategista de conteúdo. Responda APENAS com JSON válido." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro ao gerar sugestões" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    try {
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const suggestions = JSON.parse(cleaned);
      return new Response(JSON.stringify({
        suggestions,
        context: {
          totalScripts: (recentScripts || []).length,
          totalTasks: (recentTasks || []).length,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (parseErr) {
      console.error("Parse error:", parseErr);
      return new Response(JSON.stringify({ suggestions: [], rawContent: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("ai-content-suggestions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
