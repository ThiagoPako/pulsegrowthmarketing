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

    const { clientIds } = await req.json();

    // Fetch clients with their niches
    let query = supabase.from("clients").select("id, company_name, niche, briefing_data, editorial");
    if (clientIds?.length) {
      query = query.in("id", clientIds);
    }
    const { data: clients } = await query;

    if (!clients?.length) {
      return new Response(JSON.stringify({ alerts: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentYear = now.getFullYear();

    const allAlerts: any[] = [];

    // Process in batches of 5 clients
    const batchSize = 5;
    for (let i = 0; i < clients.length; i += batchSize) {
      const batch = clients.slice(i, i + batchSize);

      const clientDescriptions = batch.map((c: any) => {
        const nicheLabel = c.niche || "geral";
        const editorial = c.editorial ? `Linha editorial: ${c.editorial.substring(0, 200)}` : "";
        const briefing = c.briefing_data ? `Briefing: ${JSON.stringify(c.briefing_data).substring(0, 200)}` : "";
        return `- ${c.company_name} (nicho: ${nicheLabel}). ${editorial} ${briefing}`;
      }).join("\n");

      const prompt = `Você é um especialista em marketing sazonal brasileiro. Hoje é ${currentDay}/${currentMonth}/${currentYear}.

Para cada cliente abaixo, identifique datas sazonais, comemorativas e oportunidades de marketing relevantes para os próximos 60 dias. Considere:
1. Datas universais brasileiras (Dia das Mães, Natal, Black Friday, etc.)
2. Datas específicas do nicho de cada cliente
3. Tendências sazonais do setor
4. Campanhas de conscientização (Outubro Rosa, etc.)

Clientes:
${clientDescriptions}

IMPORTANTE: Retorne APENAS um JSON válido, sem markdown, sem texto extra. O formato deve ser:
[
  {
    "client_name": "nome da empresa",
    "client_id": "id do cliente",
    "dates": [
      {
        "label": "Nome da data",
        "date": "YYYY-MM-DD",
        "days_until": número,
        "urgency": "high|medium|low",
        "suggestion": "breve sugestão de conteúdo para essa data"
      }
    ]
  }
]

Urgência: high = menos de 10 dias, medium = 10-25 dias, low = 25-60 dias.
Inclua de 3 a 8 datas por cliente, priorizando as mais relevantes para o nicho.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Você é um assistente de marketing sazonal. Responda APENAS com JSON válido." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI error:", response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns minutos." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      try {
        // Clean markdown code blocks if present
        const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        const parsed = JSON.parse(cleaned);

        // Map client IDs back
        for (const item of parsed) {
          const matchedClient = batch.find((c: any) =>
            c.company_name === item.client_name || c.id === item.client_id
          );
          if (matchedClient) {
            allAlerts.push({
              clientId: matchedClient.id,
              clientName: matchedClient.company_name,
              niche: matchedClient.niche,
              dates: (item.dates || []).map((d: any) => ({
                ...d,
                date: d.date,
                days_until: d.days_until,
                urgency: d.urgency || "low",
                suggestion: d.suggestion || "",
              })),
            });
          }
        }
      } catch (parseErr) {
        console.error("JSON parse error:", parseErr, "Content:", content.substring(0, 500));
      }
    }

    return new Response(JSON.stringify({ alerts: allAlerts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seasonal-alerts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
