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

    // Get config
    const { data: config } = await supabase.from('whatsapp_config').select('*').limit(1).single()
    if (!config?.integration_active || !config?.api_token || !config?.auto_confirmation) {
      return new Response(JSON.stringify({ ok: true, skipped: 'disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find recordings scheduled for tomorrow that don't have a confirmation yet
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    const { data: recordings } = await supabase
      .from('recordings')
      .select('*, clients(*)')
      .eq('date', tomorrowStr)
      .eq('status', 'agendada')
      .eq('confirmation_status', 'pendente')

    if (!recordings || recordings.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check which ones already have a confirmation record
    const recordingIds = recordings.map((r: any) => r.id)
    const { data: existingConfirmations } = await supabase
      .from('whatsapp_confirmations')
      .select('recording_id')
      .in('recording_id', recordingIds)
      .eq('type', 'confirmation')

    const alreadySent = new Set((existingConfirmations || []).map((c: any) => c.recording_id))

    // Get videomaker names
    const vmIds = [...new Set(recordings.map((r: any) => r.videomaker_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', vmIds)
    const vmNames: Record<string, string> = {}
    ;(profiles || []).forEach((p: any) => { vmNames[p.id] = p.name })

    let sentCount = 0

    for (const recording of recordings) {
      if (alreadySent.has(recording.id)) continue
      
      const client = recording.clients
      if (!client?.whatsapp) continue

      const phoneNumber = client.whatsapp.replace(/\D/g, '')
      if (!phoneNumber) continue

      const templateVars = {
        nome_cliente: client.company_name,
        data_gravacao: recording.date,
        hora_gravacao: recording.start_time,
        videomaker: vmNames[recording.videomaker_id] || 'Equipe',
      }

      const message = applyTemplate(config.msg_confirmation, templateVars)

      // Create confirmation record
      await supabase.from('whatsapp_confirmations').insert({
        recording_id: recording.id,
        client_id: client.id,
        phone_number: phoneNumber,
        type: 'confirmation',
        status: 'pending',
        sent_at: new Date().toISOString(),
      })

      // Update recording confirmation status
      await supabase.from('recordings').update({
        confirmation_status: 'aguardando',
      }).eq('id', recording.id)

      // Send via WhatsApp API
      try {
        const apiBody = {
          number: phoneNumber,
          body: message,
          userId: config.default_user_id || '',
          queueId: config.default_queue_id || '',
          sendSignature: config.send_signature || false,
          closeTicket: false, // Don't close ticket - we need to receive response
        }

        const apiResponse = await fetch(WHATSAPP_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.api_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiBody),
        })

        const apiResult = await apiResponse.json()

        await supabase.from('whatsapp_messages').insert({
          phone_number: phoneNumber,
          message,
          status: apiResponse.ok ? 'sent' : 'failed',
          api_response: apiResult,
          client_id: client.id,
          trigger_type: 'auto_confirmation',
        })

        if (apiResponse.ok) sentCount++
      } catch (e) {
        console.error(`Error sending confirmation to ${client.company_name}:`, e)
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount, total: recordings.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('whatsapp-confirmation-cron error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
