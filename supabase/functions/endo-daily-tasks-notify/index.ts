import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const WHATSAPP_API_URL = 'https://api.atendeclique.com.br/api/messages/send'

function buildTaskMessage(partnerName: string, tasks: Array<{ clientName: string; taskType: string; duration: number }>, date: string): string {
  const taskTypeLabels: Record<string, string> = {
    presenca: '📍 Presença',
    gravacao: '🎬 Gravação',
    stories: '📱 Stories',
  }

  const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const taskLines = tasks.map((t, i) => {
    const emoji = taskTypeLabels[t.taskType] || `📋 ${t.taskType}`
    return `   ${i + 1}. ${emoji} — *${t.clientName}* (${t.duration}min)`
  }).join('\n')

  return `🌟 *Bom dia, ${partnerName}!* 🌟

☀️ Hoje é *${formattedDate}* e suas tarefas já estão te esperando! Vamos com tudo! 💪🔥

📋 *Suas tarefas de hoje:*

${taskLines}

✨ Você está fazendo um trabalho incrível! Cada entrega faz a diferença. 🚀

Qualquer dúvida, estamos por aqui! 😊

_Equipe Pulse Growth Marketing_ 🧡`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if called manually (with auth) or via cron (no auth)
    const authHeader = req.headers.get('Authorization')
    let requestedPartnerId: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      // Manual call — may include specific partner_id
      try {
        const body = await req.json()
        requestedPartnerId = body.partner_id || null
      } catch { /* no body = send to all */ }
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0]

    // Get WhatsApp config
    const { data: configData } = await supabase.from('whatsapp_config').select('api_token, integration_active').limit(1).single()
    if (!configData?.api_token || !configData.integration_active) {
      return new Response(JSON.stringify({ error: 'WhatsApp não configurado ou inativo' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get today's pending tasks with client info
    let tasksQuery = supabase
      .from('endomarketing_partner_tasks')
      .select('*, clients(company_name)')
      .eq('date', today)
      .eq('status', 'pendente')

    if (requestedPartnerId) {
      tasksQuery = tasksQuery.eq('partner_id', requestedPartnerId)
    }

    const { data: todayTasks } = await tasksQuery

    if (!todayTasks || todayTasks.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Sem tarefas para hoje', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Group tasks by partner_id
    const tasksByPartner = new Map<string, typeof todayTasks>()
    for (const task of todayTasks) {
      if (!task.partner_id) continue
      const arr = tasksByPartner.get(task.partner_id) || []
      arr.push(task)
      tasksByPartner.set(task.partner_id, arr)
    }

    // Get partner profiles + phone numbers
    const partnerIds = [...tasksByPartner.keys()]
    if (partnerIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Sem parceiros com tarefas', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: profiles } = await supabase.from('profiles').select('id, name, display_name').in('id', partnerIds)
    const { data: partners } = await supabase.from('partners').select('user_id, phone').in('user_id', partnerIds)

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
    const phoneMap = Object.fromEntries((partners || []).map(p => [p.user_id, p.phone]))

    let sentCount = 0
    const errors: string[] = []

    for (const [partnerId, partnerTasks] of tasksByPartner) {
      const phone = phoneMap[partnerId]
      if (!phone) {
        errors.push(`Parceiro ${partnerId}: sem WhatsApp cadastrado`)
        continue
      }

      const profile = profileMap[partnerId]
      const partnerName = profile?.display_name || profile?.name || 'Parceiro'

      const taskList = partnerTasks.map(t => ({
        clientName: (t.clients as any)?.company_name || 'Cliente',
        taskType: t.task_type,
        duration: t.duration_minutes,
      }))

      const message = buildTaskMessage(partnerName, taskList, today)

      try {
        const response = await fetch(WHATSAPP_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${configData.api_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: phone.replace(/\D/g, ''),
            body: message,
            userId: '',
            queueId: '',
            sendSignature: false,
            closeTicket: false,
          }),
        })

        if (response.ok) {
          sentCount++
          // Log message
          await supabase.from('whatsapp_messages').insert({
            phone_number: phone.replace(/\D/g, ''),
            message,
            status: 'sent',
            trigger_type: 'endo_daily_tasks',
            client_id: partnerTasks[0].client_id,
          })
        } else {
          errors.push(`Parceiro ${partnerName}: falha no envio (${response.status})`)
        }
      } catch (e) {
        errors.push(`Parceiro ${partnerName}: ${e.message}`)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sent: sentCount,
      total_partners: partnerIds.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('endo-daily-tasks-notify error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
