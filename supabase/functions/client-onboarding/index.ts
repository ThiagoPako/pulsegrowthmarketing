import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getNextDayOccurrences(dayName: string, count: number): string[] {
  const dayMap: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
  }
  const targetDay = dayMap[dayName]
  if (targetDay === undefined) return []

  const dates: string[] = []
  const today = new Date()
  const current = new Date(today)
  // Start from tomorrow
  current.setDate(current.getDate() + 1)

  while (dates.length < count) {
    if (current.getDay() === targetDay) {
      dates.push(current.toISOString().split('T')[0])
    }
    current.setDate(current.getDate() + 1)
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
      .select('id, company_name, responsible_person, logo_url, onboarding_completed, videomaker_id, fixed_day, fixed_time, backup_day, backup_time, monthly_recordings, accepts_extra, extra_content_types, extra_client_appears, plan_id, selected_weeks')
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

    // Get existing client slot assignments for availability calculation
    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, videomaker_id, fixed_day, fixed_time')
      .not('videomaker_id', 'is', null)

    // Fetch plan info if client has a plan
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
    const { clientId, videomaker_id, fixed_day, fixed_time, backup_day, backup_time, monthly_recordings, accepts_extra, extra_content_types, extra_client_appears, selected_weeks } = body

    if (!clientId || !videomaker_id || !fixed_day || !fixed_time) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Update client record
    const { error } = await supabase
      .from('clients')
      .update({
        videomaker_id,
        fixed_day,
        fixed_time,
        backup_day: backup_day || 'terca',
        backup_time: backup_time || '14:00',
        monthly_recordings: monthly_recordings || 4,
        accepts_extra: accepts_extra || false,
        extra_content_types: extra_content_types || [],
        extra_client_appears: extra_client_appears || false,
        onboarding_completed: true,
      })
      .eq('id', clientId)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create upcoming recording entries in the agency schedule
    const recordingsCount = monthly_recordings || 4
    const upcomingDates = getNextDayOccurrences(fixed_day, recordingsCount)

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

    // Send welcome WhatsApp message after onboarding
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

          // Log the message
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
