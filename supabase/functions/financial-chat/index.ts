import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Support both Lovable AI Gateway and Google Gemini API directly
function getAiConfig() {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const geminiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  
  if (lovableKey) {
    return {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: lovableKey,
      provider: "lovable" as const,
    };
  }
  if (geminiKey) {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: geminiKey,
      provider: "gemini" as const,
    };
  }
  throw new Error("Nenhuma API key de IA configurada. Configure LOVABLE_API_KEY ou GOOGLE_GEMINI_API_KEY.");
}

// Map model names between providers
function resolveModel(model: string, provider: "lovable" | "gemini"): string {
  if (provider === "gemini") {
    // Strip "google/" prefix for native Gemini API
    const map: Record<string, string> = {
      "google/gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
      "google/gemini-2.5-flash": "gemini-2.5-flash",
      "google/gemini-2.5-pro": "gemini-2.5-pro",
      "google/gemini-3-flash-preview": "gemini-3-flash-preview",
    };
    return map[model] || model.replace("google/", "");
  }
  return model;
}

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || profile.role !== "admin")
      throw new Error("Admin access required");

    const { question, conversationHistory, aiModel } = await req.json();
    if (!question) throw new Error("Question is required");

    const selectedModel = aiModel || "google/gemini-2.5-flash-lite";

    // Fetch financial data for context
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const startOfYear = `${now.getFullYear()}-01-01`;

    const [
      revenuesRes,
      expensesRes,
      contractsRes,
      clientsRes,
      cashRes,
      partnersRes,
    ] = await Promise.all([
      supabase
        .from("revenues")
        .select("*, clients(company_name)")
        .gte("due_date", startOfYear)
        .order("due_date", { ascending: false })
        .limit(500),
      supabase
        .from("expenses")
        .select("*, expense_categories(name)")
        .gte("date", startOfYear)
        .order("date", { ascending: false })
        .limit(500),
      supabase
        .from("financial_contracts")
        .select("*, clients(company_name), plans(name, price)")
        .eq("status", "ativo"),
      supabase
        .from("clients")
        .select("id, company_name, color, plan_id, weekly_reels, weekly_creatives, weekly_stories, weekly_goal, monthly_recordings"),
      supabase
        .from("cash_reserve_movements")
        .select("*")
        .gte("date", startOfYear)
        .order("date", { ascending: false })
        .limit(100),
      supabase
        .from("partners")
        .select("*, profiles:user_id(name)")
        .eq("active", true),
    ]);

    // Build financial context summary
    const revenues = revenuesRes.data || [];
    const expenses = expensesRes.data || [];
    const contracts = contractsRes.data || [];
    const clients = clientsRes.data || [];
    const cashMovements = cashRes.data || [];
    const partners = partnersRes.data || [];

    const totalRevenuePaid = revenues
      .filter((r: any) => r.status === "pago")
      .reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalRevenuePending = revenues
      .filter((r: any) => r.status === "pendente")
      .reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalRevenueOverdue = revenues
      .filter((r: any) => r.status === "vencido")
      .reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalExpenses = expenses.reduce(
      (s: number, e: any) => s + Number(e.amount),
      0
    );

    // Group expenses by category
    const expByCategory: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const cat = e.expense_categories?.name || "Sem categoria";
      expByCategory[cat] = (expByCategory[cat] || 0) + Number(e.amount);
    });

    // Group revenues by month
    const revByMonth: Record<string, { paid: number; pending: number }> = {};
    revenues.forEach((r: any) => {
      const m = r.due_date?.slice(0, 7) || "N/A";
      if (!revByMonth[m]) revByMonth[m] = { paid: 0, pending: 0 };
      if (r.status === "pago") revByMonth[m].paid += Number(r.amount);
      else revByMonth[m].pending += Number(r.amount);
    });

    // Group expenses by month
    const expByMonth: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const m = e.date?.slice(0, 7) || "N/A";
      expByMonth[m] = (expByMonth[m] || 0) + Number(e.amount);
    });

    // Top clients by revenue
    const revByClient: Record<string, number> = {};
    revenues.forEach((r: any) => {
      const name = (r as any).clients?.company_name || "N/A";
      revByClient[name] = (revByClient[name] || 0) + Number(r.amount);
    });

    const contextData = `
## Dados Financeiros da Agência Pulse (${now.getFullYear()})

### Resumo Geral
- Receitas pagas: R$ ${totalRevenuePaid.toLocaleString("pt-BR")}
- Receitas pendentes: R$ ${totalRevenuePending.toLocaleString("pt-BR")}
- Receitas vencidas: R$ ${totalRevenueOverdue.toLocaleString("pt-BR")}
- Despesas totais: R$ ${totalExpenses.toLocaleString("pt-BR")}
- Lucro bruto (pagas - despesas): R$ ${(totalRevenuePaid - totalExpenses).toLocaleString("pt-BR")}
- Contratos ativos: ${contracts.length}
- Clientes: ${clients.length}
- Parceiros ativos: ${partners.length}

### Receitas por Mês
${Object.entries(revByMonth)
  .sort(([a], [b]) => b.localeCompare(a))
  .slice(0, 12)
  .map(([m, v]) => `- ${m}: Pago R$ ${v.paid.toLocaleString("pt-BR")} | Pendente R$ ${v.pending.toLocaleString("pt-BR")}`)
  .join("\n")}

### Despesas por Mês
${Object.entries(expByMonth)
  .sort(([a], [b]) => b.localeCompare(a))
  .slice(0, 12)
  .map(([m, v]) => `- ${m}: R$ ${v.toLocaleString("pt-BR")}`)
  .join("\n")}

### Despesas por Categoria
${Object.entries(expByCategory)
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .map(([cat, val]) => `- ${cat}: R$ ${(val as number).toLocaleString("pt-BR")}`)
  .join("\n")}

### Receita por Cliente (Top 15)
${Object.entries(revByClient)
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .slice(0, 15)
  .map(([name, val]) => `- ${name}: R$ ${(val as number).toLocaleString("pt-BR")}`)
  .join("\n")}

### Contratos Ativos
${contracts
  .map(
    (c: any) =>
      `- ${c.clients?.company_name}: R$ ${Number(c.contract_value).toLocaleString("pt-BR")}/mês (${c.payment_method}) Dia ${c.due_day}`
  )
  .join("\n")}

### Parceiros
${partners
  .map(
    (p: any) =>
      `- ${(p as any).profiles?.name || "N/A"}: ${p.service_function} (R$ ${Number(p.fixed_rate).toLocaleString("pt-BR")})`
  )
  .join("\n")}

### Movimentações do Caixa (últimas)
${cashMovements
  .slice(0, 10)
  .map(
    (m: any) =>
      `- ${m.date}: ${m.type} R$ ${Number(m.amount).toLocaleString("pt-BR")} - ${m.description}`
  )
  .join("\n")}

### Clientes e Produção
${clients
  .slice(0, 20)
  .map(
    (c: any) =>
      `- ${c.company_name}: ${c.weekly_reels} reels/sem, ${c.weekly_creatives} criativos/sem, ${c.weekly_stories} stories/sem, ${c.monthly_recordings} gravações/mês`
  )
  .join("\n")}
`;

    // Build messages for AI
    const messages: any[] = [
      {
        role: "system",
        content: `Você é o assistente financeiro inteligente da Agência Pulse. Responda perguntas sobre dados financeiros e operacionais usando os dados abaixo. Seja preciso com números, use formato brasileiro (R$, vírgulas). Responda em português do Brasil. Use markdown para formatar.

Quando não tiver dados suficientes, diga claramente. Sempre contextualize com períodos (mês, ano). Sugira insights quando pertinente.

${contextData}`,
      },
    ];

    // Add conversation history
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: question });

    // Call AI (supports both Lovable Gateway and Google Gemini)
    const ai = getAiConfig();
    const resolvedModel = resolveModel(selectedModel, ai.provider);

    const aiResponse = await fetch(ai.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const err = await aiResponse.text();
      throw new Error(`AI Gateway error [${aiResponse.status}]: ${err}`);
    }

    const aiData = await aiResponse.json();
    const answer =
      aiData.choices?.[0]?.message?.content || "Não foi possível gerar uma resposta.";

    // Save messages to chat history
    await supabase.from("financial_chat_messages").insert([
      { user_id: user.id, role: "user", content: question },
      { user_id: user.id, role: "assistant", content: answer },
    ]);

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Financial chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
