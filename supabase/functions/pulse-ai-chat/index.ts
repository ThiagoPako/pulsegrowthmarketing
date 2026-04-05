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

    const { question, conversationHistory } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: "question é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Gather ALL company context in parallel ───
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

    const [
      clientsRes,
      plansRes,
      revenuesRes,
      expensesRes,
      contentTasksRes,
      designTasksRes,
      scriptsRes,
      recordingsRes,
      deliveriesRes,
      profilesRes,
      goalsRes,
      settingsRes,
      contractsRes,
      notificationsRes,
      proposalsRes,
      endoClientsRes,
    ] = await Promise.all([
      supabase.from("clients").select("id, company_name, niche, city, plan_id, client_type, contract_start_date, contract_duration_months, auto_renewal, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, presence_days, has_endomarketing, has_photo_shoot, has_vehicle_flyer, accepts_extra, onboarding_completed, created_at").limit(200),
      supabase.from("plans").select("id, name, price, reels_qty, creatives_qty, stories_qty, arts_qty, recording_sessions, periodicity, status, accepts_extra_content").eq("status", "ativo"),
      supabase.from("revenues").select("id, client_id, amount, due_date, status, payment_date, description, month_ref").gte("due_date", yearStart).limit(500),
      supabase.from("expenses").select("id, description, amount, date, category_id, status, recurrence_type").gte("date", yearStart).limit(500),
      supabase.from("content_tasks").select("id, title, kanban_column, content_type, client_id, assigned_to, editing_deadline, review_deadline, created_at, approved_at, editing_started_at").limit(300),
      supabase.from("design_tasks").select("id, title, kanban_column, client_id, assigned_to, priority, format_type, created_at, completed_at, time_spent_seconds").limit(300),
      supabase.from("scripts").select("id, title, client_id, video_type, content_format, status, created_at").limit(200),
      supabase.from("recordings").select("id, client_id, videomaker_id, recording_date, shift, status, videos_recorded").limit(200),
      supabase.from("delivery_records").select("id, client_id, date, reels_produced, creatives_produced, stories_produced, arts_produced, extras_produced, videos_recorded, delivery_status").gte("date", monthStart).limit(200),
      supabase.from("profiles").select("id, name, display_name, role, email, birthday"),
      supabase.from("goals").select("id, title, target_value, current_value, period, status, start_date, end_date"),
      supabase.from("company_settings").select("*").limit(1).single(),
      supabase.from("financial_contracts").select("id, client_id, plan_value, discount, payment_method, status, start_date, end_date").limit(200),
      supabase.from("notifications").select("id, title, type, read, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("commercial_proposals").select("id, client_company, client_name, status, proposal_type, plan_id, custom_discount, created_at, validity_date").limit(100),
      supabase.from("endomarketing_clientes").select("id, company_name, plan_type, presence_days_per_week, active, execution_type").limit(50),
    ]);

    const clients = clientsRes.data || [];
    const plans = plansRes.data || [];
    const revenues = revenuesRes.data || [];
    const expenses = expensesRes.data || [];
    const contentTasks = contentTasksRes.data || [];
    const designTasks = designTasksRes.data || [];
    const scripts = scriptsRes.data || [];
    const recordings = recordingsRes.data || [];
    const deliveries = deliveriesRes.data || [];
    const profiles = profilesRes.data || [];
    const goals = goalsRes.data || [];
    const settings = settingsRes.data;
    const contracts = contractsRes.data || [];
    const proposals = proposalsRes.data || [];
    const endoClients = endoClientsRes.data || [];

    // ─── Compute KPIs ───
    const totalClients = clients.length;
    const activeClients = clients.filter((c: any) => c.client_type !== 'inativo');
    const canceledClients = clients.filter((c: any) => c.client_type === 'inativo');
    const churnRate = totalClients > 0 ? ((canceledClients.length / totalClients) * 100).toFixed(1) : "0";

    const monthRevenues = revenues.filter((r: any) => r.due_date >= monthStart);
    const totalRevenueMonth = monthRevenues.reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const paidRevenueMonth = monthRevenues.filter((r: any) => r.status === 'pago').reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const overdueRevenues = monthRevenues.filter((r: any) => r.status !== 'pago' && new Date(r.due_date) < now);
    const totalOverdue = overdueRevenues.reduce((s: number, r: any) => s + (r.amount || 0), 0);

    const totalExpenseMonth = expenses.filter((e: any) => e.date >= monthStart).reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const grossProfitMonth = paidRevenueMonth - totalExpenseMonth;

    const yearRevenues = revenues.reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const yearExpenses = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);

    // Content pipeline
    const contentByColumn: Record<string, number> = {};
    contentTasks.forEach((t: any) => { contentByColumn[t.kanban_column] = (contentByColumn[t.kanban_column] || 0) + 1; });

    const designByColumn: Record<string, number> = {};
    designTasks.forEach((t: any) => { designByColumn[t.kanban_column] = (designByColumn[t.kanban_column] || 0) + 1; });

    // Overdue deadlines
    const overdueContent = contentTasks.filter((t: any) => {
      const dl = t.editing_deadline || t.review_deadline;
      return dl && new Date(dl) < now && !['concluido', 'aprovado', 'pronto'].includes(t.kanban_column);
    });

    // Delivery stats this month
    const monthDeliveries = deliveries;
    const totalReelsDelivered = monthDeliveries.reduce((s: number, d: any) => s + (d.reels_produced || 0), 0);
    const totalCreativesDelivered = monthDeliveries.reduce((s: number, d: any) => s + (d.creatives_produced || 0), 0);
    const totalStoriesDelivered = monthDeliveries.reduce((s: number, d: any) => s + (d.stories_produced || 0), 0);

    // Team summary
    const teamByRole: Record<string, string[]> = {};
    profiles.forEach((p: any) => {
      const role = p.role || 'outro';
      if (!teamByRole[role]) teamByRole[role] = [];
      teamByRole[role].push(p.display_name || p.name);
    });

    // Plan distribution
    const clientsByPlan: Record<string, number> = {};
    clients.forEach((c: any) => {
      const plan = plans.find((p: any) => p.id === c.plan_id);
      const name = plan?.name || 'Sem plano';
      clientsByPlan[name] = (clientsByPlan[name] || 0) + 1;
    });

    // Proposals stats
    const proposalsByStatus: Record<string, number> = {};
    proposals.forEach((p: any) => { proposalsByStatus[p.status] = (proposalsByStatus[p.status] || 0) + 1; });

    // Recordings this week
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekRecordings = recordings.filter((r: any) => r.recording_date && new Date(r.recording_date) >= weekStart);

    // Client niches
    const nicheCount: Record<string, number> = {};
    clients.forEach((c: any) => {
      const n = c.niche || 'Indefinido';
      nicheCount[n] = (nicheCount[n] || 0) + 1;
    });

    // ─── Build System Prompt ───
    const systemPrompt = `Você é o **Foguetinho 🚀**, o assistente de IA da **Pulse Growth Marketing**, uma agência de marketing digital sediada em Minaçu-GO com atendimento em todo o Brasil. Você é extremamente inteligente, analítico e proativo.

## SUA MISSÃO
Ajudar a equipe da Pulse a tomar decisões melhores, identificar problemas antes que se tornem crises, e encontrar oportunidades de crescimento. Você APRENDE com os dados e SUGERE melhorias proativas.

## DADOS EM TEMPO REAL DO SISTEMA (${now.toLocaleDateString('pt-BR')})

### 📊 VISÃO GERAL
- Total de clientes cadastrados: ${totalClients}
- Clientes ativos: ${activeClients.length}
- Clientes inativos/cancelados: ${canceledClients.length}
- Taxa de cancelamento (churn): ${churnRate}%
- Clientes de endomarketing: ${endoClients.filter((e: any) => e.active).length}

### 💰 FINANCEIRO (Mês Atual)
- Faturamento previsto: R$ ${totalRevenueMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Faturamento recebido: R$ ${paidRevenueMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Despesas: R$ ${totalExpenseMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Lucro bruto: R$ ${grossProfitMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Inadimplência: ${overdueRevenues.length} faturas vencidas totalizando R$ ${totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

### 💰 FINANCEIRO (Acumulado Ano)
- Receita total ano: R$ ${yearRevenues.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Despesa total ano: R$ ${yearExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Resultado líquido ano: R$ ${(yearRevenues - yearExpenses).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

### 📦 PACOTES DE SERVIÇOS
${plans.map((p: any) => `- **${p.name}**: R$ ${p.price} | ${p.reels_qty} reels, ${p.creatives_qty} criativos, ${p.stories_qty} stories, ${p.arts_qty} artes | ${clientsByPlan[p.name] || 0} clientes`).join('\n')}

### 🎯 DISTRIBUIÇÃO POR PLANO
${Object.entries(clientsByPlan).map(([name, count]) => `- ${name}: ${count} clientes`).join('\n')}

### 🏢 NICHOS DOS CLIENTES
${Object.entries(nicheCount).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 15).map(([niche, count]) => `- ${niche}: ${count}`).join('\n')}

### 🎬 PIPELINE DE CONTEÚDO
${Object.entries(contentByColumn).map(([col, count]) => `- ${col}: ${count} tarefas`).join('\n')}
- Tarefas com prazo vencido: ${overdueContent.length}
- Total de roteiros: ${scripts.length}

### 🎨 PIPELINE DE DESIGN
${Object.entries(designByColumn).map(([col, count]) => `- ${col}: ${count} tarefas`).join('\n')}

### 📦 ENTREGAS DO MÊS
- Reels produzidos: ${totalReelsDelivered}
- Criativos produzidos: ${totalCreativesDelivered}
- Stories produzidos: ${totalStoriesDelivered}

### 🎥 GRAVAÇÕES DA SEMANA
- Total agendadas: ${weekRecordings.length}
${weekRecordings.slice(0, 10).map((r: any) => {
  const client = clients.find((c: any) => c.id === r.client_id);
  return `- ${r.recording_date} | ${client?.company_name || 'N/A'} | ${r.status}`;
}).join('\n')}

### 👥 EQUIPE
${Object.entries(teamByRole).map(([role, names]) => `- **${role}**: ${(names as string[]).join(', ')}`).join('\n')}

### 📋 PROPOSTAS COMERCIAIS
${Object.entries(proposalsByStatus).map(([status, count]) => `- ${status}: ${count}`).join('\n')}

### 🎯 METAS
${goals.map((g: any) => `- ${g.title}: ${g.current_value}/${g.target_value} (${g.status})`).join('\n') || 'Nenhuma meta cadastrada'}

### 🔔 ÚLTIMAS NOTIFICAÇÕES
${(notificationsRes.data || []).slice(0, 10).map((n: any) => `- [${n.type}] ${n.title}`).join('\n')}

## LISTA DE CLIENTES ATIVOS (para consulta detalhada)
${activeClients.slice(0, 50).map((c: any) => {
  const plan = plans.find((p: any) => p.id === c.plan_id);
  const contract = contracts.find((ct: any) => ct.client_id === c.id && ct.status === 'ativo');
  return `- **${c.company_name}** (${c.niche || 'sem nicho'}) | Plano: ${plan?.name || 'N/A'} | Cidade: ${c.city} | Tipo: ${c.client_type} | ${c.weekly_reels} reels/sem | Início: ${c.contract_start_date || 'N/A'}`;
}).join('\n')}

## REGRAS DE COMPORTAMENTO
1. **Seja proativo**: Ao responder, sempre sugira melhorias e oportunidades baseadas nos dados.
2. **Identifique riscos**: Se notar padrões de cancelamento, inadimplência crescente ou gargalos, alerte imediatamente.
3. **Use dados reais**: Sempre baseie suas respostas nos dados acima, nunca invente números.
4. **Linguagem**: Fale de forma profissional mas acessível, como um consultor estratégico parceiro.
5. **Formatação**: Use markdown com emojis para organizar as respostas. Use tabelas quando fizer comparativos.
6. **Ações concretas**: Sempre termine com 2-3 sugestões práticas de "próximos passos".
7. **Tendências**: Compare períodos quando possível para mostrar evolução.
8. **Contexto da agência**: A Pulse trabalha com Instagram e Facebook (Meta), faz gravações presenciais, tem equipe de editores e designers.

## ANÁLISES QUE VOCÊ DEVE FAZER PROATIVAMENTE
- Se perguntarem sobre churn, analise o perfil dos cancelados vs ativos
- Se perguntarem sobre financeiro, calcule margem, ticket médio e projeções
- Se perguntarem sobre produção, identifique gargalos e sugira redistribuição
- Se perguntarem sobre clientes, analise saúde da conta (entregas x contrato)
- Se perguntarem algo genérico ("como tá a agência?"), faça um diagnóstico completo`;

    // ─── Build messages array ───
    const aiMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-15)) {
        aiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    aiMessages.push({ role: "user", content: question });

    // ─── Call AI ───
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
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
      return new Response(JSON.stringify({ error: "Erro na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "Não consegui gerar uma resposta.";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pulse-ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
