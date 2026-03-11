import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getNextDayOccurrencesForWeeks(dayName: string, selectedWeeks: number[]): string[] {
  const dayMap: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
  }
  const targetDay = dayMap[dayName]
  if (targetDay === undefined) return []

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  
  const allDates: string[] = []
  const current = new Date(year, month, 1)
  while (current.getMonth() === month) {
    if (current.getDay() === targetDay) {
      allDates.push(current.toISOString().split('T')[0])
    }
    current.setDate(current.getDate() + 1)
  }
  
  const todayStr = today.toISOString().split('T')[0]
  const dates = selectedWeeks
    .filter(w => w >= 1 && w <= allDates.length)
    .map(w => allDates[w - 1])
    .filter(d => d > todayStr)
  
  if (dates.length === 0) {
    const nextMonth = new Date(year, month + 1, 1)
    const nextAllDates: string[] = []
    const next = new Date(nextMonth)
    while (next.getMonth() === nextMonth.getMonth()) {
      if (next.getDay() === targetDay) {
        nextAllDates.push(next.toISOString().split('T')[0])
      }
      next.setDate(next.getDate() + 1)
    }
    return selectedWeeks
      .filter(w => w >= 1 && w <= nextAllDates.length)
      .map(w => nextAllDates[w - 1])
  }
  
  return dates
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const url = new URL(req.url)

  if (req.method === 'GET') {
    const clientId = url.searchParams.get('clientId')
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'Missing clientId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, company_name, responsible_person, logo_url, onboarding_completed, videomaker_id, fixed_day, fixed_time, backup_day, backup_time, monthly_recordings, accepts_extra, extra_content_types, extra_client_appears, plan_id, selected_weeks, client_type, photo_preference, has_photo_shoot, accepts_photo_shoot_cost, briefing_data')
      .eq('id', clientId)
      .single()

    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: videomakers } = await supabase
      .from('profiles')
      .select('id, name, display_name, avatar_url, bio, job_title')
      .eq('role', 'videomaker')

    const { data: settings } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .single()

    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, videomaker_id, fixed_day, fixed_time')
      .not('videomaker_id', 'is', null)

    let plan = null
    if (client.plan_id) {
      const { data: planData } = await supabase
        .from('plans')
        .select('id, name, recording_sessions')
        .eq('id', client.plan_id)
        .single()
      plan = planData
    }

    return new Response(JSON.stringify({
      client,
      videomakers: videomakers || [],
      settings,
      existingClients: existingClients || [],
      plan,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (req.method === 'POST') {
    const body = await req.json()
    const {
      clientId, videomaker_id, fixed_day, fixed_time, backup_day, backup_time,
      monthly_recordings, accepts_extra, extra_content_types, extra_client_appears,
      selected_weeks, photo_preference, has_photo_shoot, accepts_photo_shoot_cost,
      briefing_data,
    } = body

    if (!clientId || !videomaker_id || !fixed_day || !fixed_time) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const updatePayload: Record<string, unknown> = {
      videomaker_id,
      fixed_day,
      fixed_time,
      backup_day: backup_day || 'terca',
      backup_time: backup_time || '14:00',
      monthly_recordings: monthly_recordings || 4,
      accepts_extra: accepts_extra || false,
      extra_content_types: extra_content_types || [],
      extra_client_appears: extra_client_appears || false,
      selected_weeks: selected_weeks || [1, 2, 3, 4],
      onboarding_completed: true,
      photo_preference: photo_preference || 'nao_precisa',
      has_photo_shoot: has_photo_shoot || false,
      accepts_photo_shoot_cost: accepts_photo_shoot_cost || false,
    }

    if (briefing_data && Object.keys(briefing_data).length > 0) {
      updatePayload.briefing_data = briefing_data
      // Also save instagram credentials to client record
      if (briefing_data.instagram_login) updatePayload.client_login = briefing_data.instagram_login
      if (briefing_data.instagram_password) updatePayload.client_password = briefing_data.instagram_password
      if (briefing_data.niche) updatePayload.niche = briefing_data.niche
    }

    const { error } = await supabase
      .from('clients')
      .update(updatePayload)
      .eq('id', clientId)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Auto-complete the "cliente_novo" onboarding task and create "contrato" task
    try {
      const { data: existingTasks } = await supabase
        .from('onboarding_tasks')
        .select('id, stage, status')
        .eq('client_id', clientId)

      let clienteNovoTask = existingTasks?.find((t: any) => t.stage === 'cliente_novo' && t.status !== 'concluido')
      
      // If no cliente_novo task exists at all, create and complete it
      if (!existingTasks?.some((t: any) => t.stage === 'cliente_novo')) {
        const { data: created } = await supabase.from('onboarding_tasks').insert({
          client_id: clientId,
          stage: 'cliente_novo',
          title: 'Novo cliente - Onboarding concluído',
          status: 'concluido',
          completed_at: new Date().toISOString(),
        }).select('id').single()
        clienteNovoTask = null // already completed
        
        // Create contrato task
        const hasContratoTask = existingTasks?.some((t: any) => t.stage === 'contrato')
        if (!hasContratoTask) {
          await supabase.from('onboarding_tasks').insert({
            client_id: clientId,
            stage: 'contrato',
            title: 'Contrato - Assinatura',
            status: 'pendente',
          })
        }
      } else if (clienteNovoTask) {
        await supabase
          .from('onboarding_tasks')
          .update({ status: 'concluido', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', clienteNovoTask.id)

        // Create contrato task
        const hasContratoTask = existingTasks?.some((t: any) => t.stage === 'contrato')
        if (!hasContratoTask) {
          await supabase.from('onboarding_tasks').insert({
            client_id: clientId,
            stage: 'contrato',
            title: 'Contrato - Assinatura',
            status: 'pendente',
          })
        }
      }
    } catch (err) {
      console.error('Error updating onboarding tasks:', err)
    }

    const weeks = selected_weeks || [1, 2, 3, 4]
    const upcomingDates = getNextDayOccurrencesForWeeks(fixed_day, weeks)

    const recordingsToInsert = upcomingDates.map(date => ({
      client_id: clientId,
      videomaker_id,
      date,
      start_time: fixed_time,
      type: 'fixa',
      status: 'agendada',
      confirmation_status: 'pendente',
    }))

    if (recordingsToInsert.length > 0) {
      const { error: recError } = await supabase
        .from('recordings')
        .insert(recordingsToInsert)

      if (recError) {
        console.error('Error creating recordings:', recError.message)
      }
    }

    // Send welcome WhatsApp message
    try {
      const { data: clientData } = await supabase
        .from('clients')
        .select('company_name, responsible_person, whatsapp')
        .eq('id', clientId)
        .single()

      if (clientData?.whatsapp) {
        const { data: whatsConfig } = await supabase
          .from('whatsapp_config')
          .select('integration_active, api_token, default_user_id, default_queue_id, send_signature, close_ticket')
          .limit(1)
          .single()

        if (whatsConfig?.integration_active && whatsConfig?.api_token) {
          const clientName = clientData.responsible_person || clientData.company_name
          const welcomeMsg = `Olá, ${clientName}! 🎉\n\nSeja muito bem-vindo(a) à *Pulse Growth Marketing*! 🚀\n\nEstamos felizes em tê-lo(a) conosco! A partir de agora, você receberá:\n\n📅 *Lembrete 24h antes* de cada gravação agendada\n🎬 *Atualizações* quando seus vídeos entrarem em edição\n📲 *Link para aprovação* assim que o conteúdo estiver pronto\n\nNosso objetivo é manter você sempre informado(a) sobre o andamento dos seus conteúdos.\n\nQualquer dúvida, estamos à disposição!\n\nEquipe Pulse Growth Marketing 🚀`

          const WHATSAPP_API_URL = 'https://api.atendeclique.com.br/api/messages/send'
          const apiBody = {
            number: clientData.whatsapp.replace(/\D/g, ''),
            body: welcomeMsg,
            userId: whatsConfig.default_user_id || '',
            queueId: whatsConfig.default_queue_id || '',
            sendSignature: whatsConfig.send_signature || false,
            closeTicket: whatsConfig.close_ticket || false,
          }

          const apiResponse = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${whatsConfig.api_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(apiBody),
          })

          const apiResult = await apiResponse.json()

          await supabase.from('whatsapp_messages').insert({
            phone_number: clientData.whatsapp.replace(/\D/g, ''),
            message: welcomeMsg,
            status: apiResponse.ok ? 'sent' : 'failed',
            api_response: apiResult,
            client_id: clientId,
            trigger_type: 'auto_recording',
          })
        }
      }
    } catch (err) {
      console.error('Welcome WhatsApp error:', err)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders })
})
