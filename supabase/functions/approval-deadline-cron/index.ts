import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const WHATSAPP_API_URL = 'https://api.atendeclique.com.br/api/messages/send'

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date().toISOString()
    let movedCount = 0

    // 1. Find content_tasks in 'envio' column with expired approval_deadline
    const { data: expiredTasks } = await supabase
      .from('content_tasks')
      .select('id, client_id, title, edited_video_link, approval_deadline')
      .eq('kanban_column', 'envio')
      .not('approval_deadline', 'is', null)
      .lt('approval_deadline', now)

    if (!expiredTasks || expiredTasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, moved: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get WhatsApp config
    const { data: config } = await supabase.from('whatsapp_config').select('*').limit(1).single()

    // Get clients info
    const clientIds = [...new Set(expiredTasks.map((t: any) => t.client_id))]
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, company_name, whatsapp, responsible_person')
      .in('id', clientIds)
    const clientsMap: Record<string, any> = {}
    ;(clientsData || []).forEach((c: any) => { clientsMap[c.id] = c })

    for (const task of expiredTasks) {
      // Move content_task to agendamentos
      await supabase.from('content_tasks').update({
        kanban_column: 'agendamentos',
        approved_at: now,
        updated_at: now,
      }).eq('id', task.id)

      // Update social_media_deliveries
      await supabase.from('social_media_deliveries').update({
        status: 'entregue',
      }).eq('content_task_id', task.id)

      // Notify social_media role
      const client = clientsMap[task.client_id]
      const clientName = client?.company_name || ''

      await supabase.rpc('notify_role', {
        _role: 'social_media',
        _title: 'Aprovação expirada',
        _message: `"${task.title}" (${clientName}) não foi aprovado pelo cliente em 6h. Movido para agendamento.`,
        _type: 'deadline',
        _link: '/entregas-social',
      })

      // Send WhatsApp to client about expired approval
      if (config?.integration_active && config?.api_token && client?.whatsapp) {
        const phoneNumber = client.whatsapp.replace(/\D/g, '')
        if (phoneNumber) {
          const msgTemplate = config.msg_approval_expired || 'Olá, {nome_cliente}! Para manter o fluxo de conteúdos, o vídeo "{titulo}" foi encaminhado para agendamento. Fique tranquilo, foi feita uma revisão interna!'
          
          const message = applyTemplate(msgTemplate, {
            nome_cliente: client.responsible_person || client.company_name,
            titulo: task.title,
          })

          try {
            const apiResponse = await fetch(WHATSAPP_API_URL, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${config.api_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                number: phoneNumber,
                body: message,
                userId: config.default_user_id || '',
                queueId: config.default_queue_id || '',
                sendSignature: config.send_signature || false,
                closeTicket: config.close_ticket || false,
              }),
            })

            const apiResult = await apiResponse.json()

            await supabase.from('whatsapp_messages').insert({
              phone_number: phoneNumber,
              message,
              status: apiResponse.ok ? 'sent' : 'failed',
              api_response: apiResult,
              client_id: task.client_id,
              trigger_type: 'auto_approval_expired',
            })
          } catch (e) {
            console.error(`Error sending approval expired msg to ${clientName}:`, e)
          }
        }
      }

      movedCount++
    }

    return new Response(JSON.stringify({ ok: true, moved: movedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('approval-deadline-cron error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
