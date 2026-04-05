import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAY_MS = 24 * 60 * 60 * 1000;

type ClientRow = {
  id: string;
  company_name: string;
  niche: string | null;
  logo_url: string | null;
  color: string | null;
  briefing_data?: unknown;
  editorial?: string | null;
};

type SeasonalAlertDate = {
  label: string;
  date: string;
  days_until: number;
  urgency: "high" | "medium" | "low";
  suggestion: string;
};

type SeasonalAlertItem = {
  clientId: string;
  clientName: string;
  niche: string;
  clientLogo: string | null;
  clientColor: string | null;
  dates: SeasonalAlertDate[];
};

type SeasonalTemplate = {
  label: string;
  month?: number;
  day?: number;
  niches?: string[];
  suggestion: string;
  computeDate?: (year: number) => Date;
};

const healthNiches = ["saude", "farmacia", "odontologia", "beleza", "barbearia", "emagrecimento", "clinica_veterinaria"];
const retailNiches = ["varejo", "mercado", "moda", "moveis", "infantil", "joalheria", "otica", "construcao", "grafica", "outro"];
const foodNiches = ["alimentacao", "confeitaria", "mercado"];

const seasonalTemplates: SeasonalTemplate[] = [
  {
    label: "Dia Mundial da Saúde",
    month: 4,
    day: 7,
    niches: healthNiches,
    suggestion: "Crie uma campanha educativa com dica prática, prova social e CTA para atendimento ou compra.",
  },
  {
    label: "Dia do Trabalhador",
    month: 5,
    day: 1,
    suggestion: "Mostre bastidores, equipe e ofertas com linguagem humana para conectar marca e rotina do cliente.",
  },
  {
    label: "Dia das Mães",
    computeDate: (year) => getNthWeekdayOfMonth(year, 5, 0, 2),
    niches: [...retailNiches, ...foodNiches, "farmacia", "saude", "beleza", "barbearia", "turismo", "pet"],
    suggestion: "Antecipe kits, combos, presentes e campanhas emocionais com oferta por tempo limitado.",
  },
  {
    label: "Dia dos Namorados",
    month: 6,
    day: 12,
    niches: [...retailNiches, ...foodNiches, "turismo", "beleza", "barbearia", "otica"],
    suggestion: "Trabalhe desejo e presenteável com vitrine especial, combo e CTA direto no WhatsApp.",
  },
  {
    label: "Férias de Julho",
    month: 7,
    day: 1,
    niches: ["infantil", "educacao", "turismo", "alimentacao", "confeitaria", "moveis"],
    suggestion: "Monte conteúdos temáticos, roteiro leve e ofertas de férias para aumentar movimento e lembrança.",
  },
  {
    label: "Dia dos Pais",
    computeDate: (year) => getNthWeekdayOfMonth(year, 8, 0, 2),
    niches: [...retailNiches, "automotivo", "veiculos", "barbearia", "saude", "farmacia", "alimentacao"],
    suggestion: "Destaque presente ideal, urgência de compra e prova social para acelerar conversão.",
  },
  {
    label: "Dia do Cliente",
    month: 9,
    day: 15,
    suggestion: "Use recompensa, condição especial e campanha de relacionamento para fidelizar e reativar clientes.",
  },
  {
    label: "Dia das Crianças",
    month: 10,
    day: 12,
    niches: ["infantil", "varejo", "mercado", "alimentacao", "confeitaria", "educacao"],
    suggestion: "Crie oferta temática, linguagem divertida e ação visual forte para aumentar engajamento e vendas.",
  },
  {
    label: "Black Friday",
    computeDate: (year) => getLastWeekdayOfMonth(year, 11, 5),
    suggestion: "Planeje aquecimento, lista de espera e quebra de objeção com comunicação de oportunidade real.",
  },
  {
    label: "Natal",
    month: 12,
    day: 25,
    suggestion: "Trabalhe emoção, presentes, kits e fechamento de ano com forte apelo visual e CTA direto.",
  },
];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysUntil(baseDate: Date, targetDate: Date) {
  return Math.round((startOfDay(targetDate).getTime() - startOfDay(baseDate).getTime()) / DAY_MS);
}

function normalizeNiche(value: string | null | undefined) {
  return (value || "outro").trim().toLowerCase();
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  const date = new Date(year, month - 1, 1);
  let count = 0;

  while (date.getMonth() === month - 1) {
    if (date.getDay() === weekday) {
      count += 1;
      if (count === nth) return new Date(date);
    }
    date.setDate(date.getDate() + 1);
  }

  return new Date(year, month - 1, 1);
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const date = new Date(year, month, 0);
  while (date.getDay() !== weekday) {
    date.setDate(date.getDate() - 1);
  }
  return new Date(date);
}

function getUrgency(days: number): "high" | "medium" | "low" {
  if (days <= 7) return "high";
  if (days <= 20) return "medium";
  return "low";
}

function resolveTemplateDate(template: SeasonalTemplate, today: Date) {
  let resolved = template.computeDate
    ? template.computeDate(today.getFullYear())
    : new Date(today.getFullYear(), (template.month || 1) - 1, template.day || 1);

  if (daysUntil(today, resolved) < 0) {
    resolved = template.computeDate
      ? template.computeDate(today.getFullYear() + 1)
      : new Date(today.getFullYear() + 1, (template.month || 1) - 1, template.day || 1);
  }

  return resolved;
}

function matchesNiche(template: SeasonalTemplate, niche: string) {
  if (!template.niches?.length) return true;
  return template.niches.includes(niche);
}

function buildFallbackAlerts(clients: ClientRow[], today: Date): SeasonalAlertItem[] {
  return clients.map((client) => {
    const niche = normalizeNiche(client.niche);
    const relevantEvents = seasonalTemplates
      .map((template) => {
        const targetDate = resolveTemplateDate(template, today);
        const remaining = daysUntil(today, targetDate);
        return { template, targetDate, remaining };
      })
      .filter(({ template, remaining }) => remaining >= 0 && remaining <= 60 && matchesNiche(template, niche))
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, 5)
      .map(({ template, targetDate, remaining }) => ({
        label: template.label,
        date: formatDate(targetDate),
        days_until: remaining,
        urgency: getUrgency(remaining),
        suggestion: template.suggestion,
      }));

    const backupEvents = seasonalTemplates
      .map((template) => {
        const targetDate = resolveTemplateDate(template, today);
        const remaining = daysUntil(today, targetDate);
        return { template, targetDate, remaining };
      })
      .filter(({ remaining }) => remaining >= 0 && remaining <= 60)
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, 3)
      .map(({ template, targetDate, remaining }) => ({
        label: template.label,
        date: formatDate(targetDate),
        days_until: remaining,
        urgency: getUrgency(remaining),
        suggestion: template.suggestion,
      }));

    const dates = relevantEvents.length ? relevantEvents : backupEvents;

    return {
      clientId: client.id,
      clientName: client.company_name,
      niche,
      clientLogo: client.logo_url || null,
      clientColor: client.color || null,
      dates,
    };
  }).filter((alert) => alert.dates.length > 0);
}

function sanitizeAIDates(rawDates: any[], client: ClientRow, today: Date): SeasonalAlertDate[] {
  return (Array.isArray(rawDates) ? rawDates : [])
    .map((item) => {
      if (!item?.date || !item?.label) return null;
      const safeDate = new Date(`${item.date}T12:00:00`);
      if (Number.isNaN(safeDate.getTime())) return null;
      const remaining = daysUntil(today, safeDate);
      if (remaining < 0 || remaining > 60) return null;

      return {
        label: String(item.label).trim(),
        date: formatDate(safeDate),
        days_until: remaining,
        urgency: item.urgency === "high" || item.urgency === "medium" || item.urgency === "low"
          ? item.urgency
          : getUrgency(remaining),
        suggestion: String(item.suggestion || `Crie uma campanha contextualizada para ${client.company_name} com CTA direto e gancho visual forte.`).trim(),
      } satisfies SeasonalAlertDate;
    })
    .filter((value): value is SeasonalAlertDate => Boolean(value))
    .sort((a, b) => a.days_until - b.days_until)
    .slice(0, 8);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { clientIds } = await req.json();

    // Fetch clients with their niches
    let query = supabase.from("clients").select("id, company_name, niche, logo_url, color, briefing_data, editorial");
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
    const clientRows = clients as ClientRow[];
    const fallbackAlerts = buildFallbackAlerts(clientRows, now);

    if (!GOOGLE_GEMINI_API_KEY) {
      return new Response(JSON.stringify({ alerts: fallbackAlerts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentYear = now.getFullYear();
    const allAlerts: SeasonalAlertItem[] = [];

    const batchSize = 5;
    for (let i = 0; i < clientRows.length; i += batchSize) {
      const batch = clientRows.slice(i, i + batchSize);
      const batchFallback = buildFallbackAlerts(batch, now);
      const matchedIds = new Set<string>();

      const clientDescriptions = batch.map((client) => {
        const nicheLabel = client.niche || "geral";
        const editorial = client.editorial ? `Linha editorial: ${client.editorial.substring(0, 200)}` : "";
        const briefing = client.briefing_data ? `Briefing: ${JSON.stringify(client.briefing_data).substring(0, 200)}` : "";
        return `- ${client.company_name} (client_id: ${client.id}, nicho: ${nicheLabel}). ${editorial} ${briefing}`;
      }).join("\n");

      const prompt = `Você é um especialista em marketing sazonal brasileiro. Hoje é ${currentDay}/${currentMonth}/${currentYear}.

Para cada cliente abaixo, identifique datas sazonais relevantes para os próximos 60 dias.
Priorize datas brasileiras fortes, campanhas do nicho e oportunidades comerciais realistas.

Clientes:
${clientDescriptions}

Responda APENAS com um JSON válido no formato:
[
  {
    "client_id": "uuid",
    "client_name": "nome",
    "dates": [
      {
        "label": "Nome da data",
        "date": "YYYY-MM-DD",
        "urgency": "high|medium|low",
        "suggestion": "sugestão curta de campanha"
      }
    ]
  }
]

Inclua de 3 a 6 datas por cliente.`;

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.4,
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("Gemini seasonal-alerts error:", response.status, errText);
          allAlerts.push(...batchFallback);
          continue;
        }

        const data = await response.json();
        const content = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("") || "";
        const parsed = JSON.parse(content.trim());

        for (const item of Array.isArray(parsed) ? parsed : []) {
          const matchedClient = batch.find((client) => client.id === item?.client_id || client.company_name === item?.client_name);
          if (!matchedClient) continue;

          const safeDates = sanitizeAIDates(item?.dates, matchedClient, now);
          if (!safeDates.length) continue;

          matchedIds.add(matchedClient.id);
          allAlerts.push({
            clientId: matchedClient.id,
            clientName: matchedClient.company_name,
            niche: normalizeNiche(matchedClient.niche),
            clientLogo: matchedClient.logo_url || null,
            clientColor: matchedClient.color || null,
            dates: safeDates,
          });
        }

        for (const fallbackAlert of batchFallback) {
          if (!matchedIds.has(fallbackAlert.clientId)) {
            allAlerts.push(fallbackAlert);
          }
        }
      } catch (error) {
        console.error("seasonal-alerts AI parse error:", error);
        allAlerts.push(...batchFallback);
      }
    }

    return new Response(JSON.stringify({ alerts: allAlerts.length ? allAlerts : fallbackAlerts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seasonal-alerts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
