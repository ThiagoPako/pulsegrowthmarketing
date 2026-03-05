import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const whatsappToken = Deno.env.get('WHATSAPP_API_TOKEN');
    
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Get active contracts
    const { data: contracts } = await supabase
      .from('financial_contracts')
      .select('*')
      .eq('status', 'ativo');

    if (!contracts?.length) {
      return new Response(JSON.stringify({ message: 'No active contracts' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get payment config
    const { data: paymentConfigs } = await supabase.from('payment_config').select('*').limit(1);
    const paymentConfig = paymentConfigs?.[0];

    // Get WhatsApp config
    const { data: whatsappConfigs } = await supabase.from('whatsapp_config').select('*').limit(1);
    const whatsappConfig = whatsappConfigs?.[0];

    const results = [];

    for (const contract of contracts) {
      // Check if today is the due day
      const isDueDay = currentDay === contract.due_day;
      
      // Check for overdue (3 days after)
      const dueDate = new Date(currentYear, currentMonth, contract.due_day);
      const daysSinceDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const isReminder = daysSinceDue === 3;

      if (!isDueDay && !isReminder) continue;

      // Get client info
      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', contract.client_id)
        .single();

      if (!clientData?.whatsapp) continue;

      // Check if revenue exists for this month
      const refMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const { data: existingRevenues } = await supabase
        .from('revenues')
        .select('*')
        .eq('client_id', contract.client_id)
        .eq('reference_month', refMonth);

      const revenue = existingRevenues?.[0];

      // Skip if already paid
      if (revenue?.status === 'recebida') continue;

      // Check if already sent billing message today
      const { data: existingMessages } = await supabase
        .from('billing_messages')
        .select('*')
        .eq('client_id', contract.client_id)
        .gte('sent_at', todayStr + 'T00:00:00')
        .lte('sent_at', todayStr + 'T23:59:59');

      if (existingMessages?.length) continue;

      // Get client's plan for personalized report
      let clientPlan = null;
      if (contract.plan_id) {
        const { data: planData } = await supabase
          .from('plans')
          .select('*')
          .eq('id', contract.plan_id)
          .single();
        clientPlan = planData;
      }

      // Also check client's plan_id if contract doesn't have one
      if (!clientPlan && clientData.plan_id) {
        const { data: planData } = await supabase
          .from('plans')
          .select('*')
          .eq('id', clientData.plan_id)
          .single();
        clientPlan = planData;
      }

      // Get delivery summary for the month
      const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
      const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      
      const { data: deliveries } = await supabase
        .from('delivery_records')
        .select('*')
        .eq('client_id', contract.client_id)
        .gte('date', monthStart)
        .lte('date', monthEnd);

      const { data: socialDeliveries } = await supabase
        .from('social_media_deliveries')
        .select('*')
        .eq('client_id', contract.client_id)
        .gte('delivered_at', monthStart)
        .lte('delivered_at', monthEnd);

      // Calculate delivery stats
      const stats = {
        reels: 0, stories: 0, artes: 0, criativos: 0, extras: 0, gravacoes: 0, videos: 0,
      };

      deliveries?.forEach(d => {
        stats.reels += d.reels_produced || 0;
        stats.stories += d.stories_produced || 0;
        stats.artes += d.arts_produced || 0;
        stats.criativos += d.creatives_produced || 0;
        stats.extras += d.extras_produced || 0;
        stats.gravacoes += 1;
        stats.videos += d.videos_recorded || 0;
      });

      const socialReels = socialDeliveries?.filter(d => d.content_type === 'reels' && d.status === 'postado').length || 0;
      const socialStories = socialDeliveries?.filter(d => d.content_type === 'story' && d.status === 'postado').length || 0;

      // Build personalized delivery report based on client's plan
      let deliverySummary = '';
      if (paymentConfig?.include_delivery_report !== false) {
        const totalReels = Math.max(socialReels, stats.reels);
        const totalStories = Math.max(socialStories, stats.stories);
        const totalArtes = stats.artes;
        const totalCriativos = stats.criativos;
        const recordingHours = stats.gravacoes * (clientPlan?.recording_hours || 2);

        const lines: string[] = [];

        // Always show recording hours if there were recordings
        if (stats.gravacoes > 0) {
          lines.push(`Estivemos juntos durante *${recordingHours}h de gravação* em ${stats.gravacoes} sessão${stats.gravacoes > 1 ? 'ões' : ''} 📹`);
        }
        if (stats.videos > 0) {
          lines.push(`Produzimos *${stats.videos} vídeos* para sua marca 🎬`);
        }

        // Only show metrics that exist in the client's plan
        if (clientPlan) {
          if (clientPlan.reels_qty > 0 && totalReels > 0) {
            lines.push(`Publicamos *${totalReels} reels* no seu perfil 🎥`);
          }
          if (clientPlan.stories_qty > 0 && totalStories > 0) {
            lines.push(`Estivemos presentes nos stories com *${totalStories} publicações* 📱`);
          }
          if (clientPlan.arts_qty > 0 && totalArtes > 0) {
            lines.push(`Criamos *${totalArtes} artes* para seus canais 🎨`);
          }
          if (clientPlan.creatives_qty > 0 && totalCriativos > 0) {
            lines.push(`Desenvolvemos *${totalCriativos} criativos* para suas campanhas ✨`);
          }
        } else {
          // No plan — show all non-zero stats
          if (totalReels > 0) lines.push(`Publicamos *${totalReels} reels* no seu perfil 🎥`);
          if (totalStories > 0) lines.push(`Estivemos presentes nos stories com *${totalStories} publicações* 📱`);
          if (totalArtes > 0) lines.push(`Criamos *${totalArtes} artes* para seus canais 🎨`);
          if (totalCriativos > 0) lines.push(`Desenvolvemos *${totalCriativos} criativos* para suas campanhas ✨`);
        }

        if (stats.extras > 0) {
          lines.push(`Ainda entregamos *${stats.extras} conteúdos extras* além do contratado ➕`);
        }

        if (lines.length > 0) {
          deliverySummary = `\n\nEsse mês foi incrível e fizemos muita coisa juntos! 💪\n\n${lines.join('\n')}`;
        }
      }

      // Payment info
      let paymentInfo = '';
      if (paymentConfig && (paymentConfig.pix_key || paymentConfig.receiver_name)) {
        const template = paymentConfig.msg_payment_data || '💳 *Dados para pagamento:*\nNome: {nome_recebedor}\nBanco: {banco}\nChave PIX: {chave_pix}\nCPF/CNPJ: {documento}';
        paymentInfo = template
          .replace(/\{nome_recebedor\}/g, paymentConfig.receiver_name || '')
          .replace(/\{banco\}/g, paymentConfig.bank || '')
          .replace(/\{chave_pix\}/g, paymentConfig.pix_key || '')
          .replace(/\{documento\}/g, paymentConfig.document || '');
      }

      const value = Number(contract.contract_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      let message: string;
      const applyVars = (tpl: string) => {
        let result = tpl
          .replace(/\{nome_cliente\}/g, clientData.company_name)
          .replace(/\{valor\}/g, value)
          .replace(/\{dia_vencimento\}/g, String(contract.due_day))
          .replace(/\{dados_pagamento\}/g, paymentInfo)
          .replace(/\{relatorio_entregas\}/g, deliverySummary);
        // If template doesn't have the variable but report exists, append it
        if (deliverySummary && !tpl.includes('{relatorio_entregas}')) {
          result += deliverySummary;
        }
        return result;
      };

      if (isReminder) {
        const template = paymentConfig?.msg_billing_overdue ||
          `Olá, {nome_cliente}! 😊\n\nEsperamos que esteja tudo bem! Passando aqui apenas para lembrar que identificamos uma pendência referente à mensalidade no valor de {valor}.\n\nSe já realizou o pagamento, por favor desconsidere esta mensagem.{dados_pagamento}\n\nQualquer dúvida, estamos à disposição!\n\nEquipe Pulse Growth Marketing 🚀`;
        message = applyVars(template);

        // Mark revenue as overdue
        if (revenue) {
          await supabase.from('revenues').update({ status: 'em_atraso' }).eq('id', revenue.id);
        }
      } else {
        const template = paymentConfig?.msg_billing_due ||
          `Olá, {nome_cliente}! 🚀\n\nAgradecemos a parceria neste mês!{relatorio_entregas}\n\n💰 *Mensalidade:* {valor}\n📅 *Vencimento:* Dia {dia_vencimento}{dados_pagamento}\n\nQualquer dúvida, estamos à disposição!\n\nEquipe Pulse Growth Marketing 🚀`;
        message = applyVars(template);
      }

      // Send via WhatsApp if configured
      if (whatsappToken && whatsappConfig?.integration_active) {
        try {
          const phoneNumber = clientData.whatsapp.replace(/\D/g, '');
          // Use the same send-whatsapp edge function
          const { error: sendError } = await supabase.functions.invoke('send-whatsapp', {
            body: {
              phone_number: phoneNumber,
              message,
              client_id: contract.client_id,
              trigger_type: isReminder ? 'cobranca_lembrete' : 'cobranca',
            },
          });

          // Log the billing message
          await supabase.from('billing_messages').insert({
            revenue_id: revenue?.id || null,
            client_id: contract.client_id,
            message_type: isReminder ? 'lembrete' : 'cobranca',
            status: sendError ? 'erro' : 'enviada',
          });

          results.push({ client: clientData.company_name, type: isReminder ? 'lembrete' : 'cobranca', status: 'sent' });
        } catch (err) {
          results.push({ client: clientData.company_name, type: isReminder ? 'lembrete' : 'cobranca', status: 'error', error: String(err) });
        }
      } else {
        results.push({ client: clientData.company_name, type: isReminder ? 'lembrete' : 'cobranca', status: 'skipped_no_whatsapp' });
      }
    }

    return new Response(JSON.stringify({ results, processed: results.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
