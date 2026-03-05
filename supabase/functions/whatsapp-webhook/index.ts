import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const WHATSAPP_API_URL = 'https://api.atendeclique.com.br/api/messages/send'

const CONFIRM_WORDS = ['1', 'confirmar', 'confirmado', 'ok', 'sim', 'quero aproveitar', 'quero']
const CANCEL_WORDS = ['2', 'cancelar', 'cancelado', 'não posso', 'nao posso', 'não', 'nao']

function classifyResponse(text: string): 'confirm' | 'cancel' | 'unknown' {
  const normalized = text.trim().toLowerCase().replace(/[^\w\sáéíóúãõâêîôûç]/g, '')
  if (CONFIRM_WORDS.some(w => normalized === w || normalized.startsWith(w))) return 'confirm'
  if (CANCEL_WORDS.some(w => normalized === w || normalized.startsWith(w))) return 'cancel'
  return 'unknown'
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}

// Extract phone and message from various webhook payload formats
function extractPayload(body: any): { phone: string; message: string } {
  let phone = ''
  let message = ''

  // Try common field names for phone number
  phone = body.from || body.number || body.phone || body.remoteJid || body.contact?.number || body.ticket?.contact?.number || ''
  
  // Try common field names for message text  
  message = body.body || body.message || body.text || body.msg || body.content || ''
  
  // If message is an object, try to get text from it
  if (typeof message === 'object' && message !== null) {
    message = message.body || message.text || message.content || message.conversation || ''
  }

  // Try nested structures (Whaticket/AtendeClique patterns)
  if (!phone && body.data) {
    phone = body.data.from || body.data.number || body.data.phone || body.data.remoteJid || ''
    if (!message) {
      message = body.data.body || body.data.message || body.data.text || ''
    }
  }

  // Try ticket-based structure
  if (!phone && body.ticket) {
    phone = body.ticket.contact?.number || body.ticket.number || ''
  }
  if (!message && body.ticket) {
    message = body.ticket.lastMessage || ''
  }

  // Clean phone number
  phone = phone.replace(/\D/g, '')
  // Remove @s.whatsapp.net or similar suffixes
  phone = phone.replace(/@.*/, '')
  
  return { phone, message: typeof message === 'string' ? message : '' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let body: any
    const rawBody = await req.text()
    
    // Log the raw payload for debugging
    console.log('=== WEBHOOK RECEIVED ===')
    console.log('Method:', req.method)
    console.log('Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())))
    console.log('Raw body:', rawBody)
    
    try {
      body = JSON.parse(rawBody)
    } catch {
      console.log('Failed to parse JSON, trying URL-encoded')
      body = Object.fromEntries(new URLSearchParams(rawBody))
    }

    console.log('Parsed body:', JSON.stringify(body))

    const { phone: phoneNumber, message: messageText } = extractPayload(body)
    
    console.log('Extracted phone:', phoneNumber)
    console.log('Extracted message:', messageText)

    if (!phoneNumber || !messageText) {
      console.log('No phone or message found in payload')
      return new Response(JSON.stringify({ ok: true, skipped: 'no_phone_or_message', raw_keys: Object.keys(body) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find pending confirmation for this phone number
    // Try with and without country code prefix
    const phoneVariants = [phoneNumber]
    if (phoneNumber.startsWith('55') && phoneNumber.length > 10) {
      phoneVariants.push(phoneNumber.slice(2)) // without country code
    } else {
      phoneVariants.push('55' + phoneNumber) // with country code
    }

    console.log('Searching confirmations for phone variants:', phoneVariants)

    const { data: confirmations, error: confError } = await supabase
      .from('whatsapp_confirmations')
      .select('*, recordings(*), clients(*)')
      .in('phone_number', phoneVariants)
      .eq('status', 'pending')
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)

    console.log('Confirmations query result:', JSON.stringify(confirmations), 'Error:', confError)

    if (!confirmations || confirmations.length === 0) {
      console.log('No pending confirmation found for these phone numbers')
      return new Response(JSON.stringify({ ok: true, skipped: 'no_pending_confirmation', phone: phoneNumber }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const confirmation = confirmations[0]
    const recording = confirmation.recordings
    const client = confirmation.clients
    const classification = classifyResponse(messageText)

    console.log('Classification:', classification, 'for message:', messageText)

    if (classification === 'unknown') {
      return new Response(JSON.stringify({ ok: true, skipped: 'unrecognized_response', message: messageText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get config for templates and API token
    const { data: configData } = await supabase.from('whatsapp_config').select('*').limit(1).single()
    if (!configData?.api_token) {
      return new Response(JSON.stringify({ ok: false, error: 'No API token configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const templateVars = {
      nome_cliente: client?.company_name || '',
      data_gravacao: recording?.date || '',
      hora_gravacao: recording?.start_time || '',
    }

    if (confirmation.type === 'confirmation') {
      if (classification === 'confirm') {
        await supabase.from('whatsapp_confirmations').update({
          status: 'confirmed',
          responded_at: new Date().toISOString(),
          response_message: messageText,
          updated_at: new Date().toISOString(),
        }).eq('id', confirmation.id)

        await supabase.from('recordings').update({
          confirmation_status: 'confirmada',
        }).eq('id', confirmation.recording_id)

        const replyMessage = applyTemplate(configData.msg_confirmation_confirmed, templateVars)
        await sendWhatsApp(configData, confirmation.phone_number, replyMessage, client?.id, 'auto_confirmation')
        console.log('Confirmation CONFIRMED for recording:', confirmation.recording_id)

      } else {
        await supabase.from('whatsapp_confirmations').update({
          status: 'cancelled',
          responded_at: new Date().toISOString(),
          response_message: messageText,
          updated_at: new Date().toISOString(),
        }).eq('id', confirmation.id)

        await supabase.from('recordings').update({
          status: 'cancelada',
          confirmation_status: 'cancelada',
        }).eq('id', confirmation.recording_id)

        const replyMessage = applyTemplate(configData.msg_confirmation_cancelled, templateVars)
        await sendWhatsApp(configData, confirmation.phone_number, replyMessage, client?.id, 'auto_confirmation')

        await initiateBackupFlow(supabase, configData, confirmation, recording)
        console.log('Confirmation CANCELLED for recording:', confirmation.recording_id)
      }
    } else if (confirmation.type === 'backup_invite') {
      if (classification === 'confirm') {
        await supabase.from('whatsapp_confirmations').update({
          status: 'confirmed',
          responded_at: new Date().toISOString(),
          response_message: messageText,
          updated_at: new Date().toISOString(),
        }).eq('id', confirmation.id)

        await supabase.from('recordings').update({
          client_id: confirmation.client_id,
          status: 'agendada',
          confirmation_status: 'confirmada',
          type: 'backup',
        }).eq('id', confirmation.recording_id)

        const replyMessage = applyTemplate(configData.msg_backup_confirmed, templateVars)
        await sendWhatsApp(configData, confirmation.phone_number, replyMessage, confirmation.client_id, 'auto_backup')

      } else {
        await supabase.from('whatsapp_confirmations').update({
          status: 'cancelled',
          responded_at: new Date().toISOString(),
          response_message: messageText,
          updated_at: new Date().toISOString(),
        }).eq('id', confirmation.id)

        const backupIds = confirmation.backup_client_ids || []
        const nextIndex = (confirmation.backup_index || 0) + 1
        
        if (nextIndex < backupIds.length) {
          await sendBackupInvite(supabase, configData, confirmation.recording_id, backupIds, nextIndex, recording)
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, classification, type: confirmation.type }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('whatsapp-webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function sendWhatsApp(config: any, number: string, message: string, clientId: string | null, triggerType: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const apiBody = {
      number: number.replace(/\D/g, ''),
      body: message,
      userId: config.default_user_id || '',
      queueId: config.default_queue_id || '',
      sendSignature: config.send_signature || false,
      closeTicket: config.close_ticket || false,
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
      phone_number: number.replace(/\D/g, ''),
      message,
      status: apiResponse.ok ? 'sent' : 'failed',
      api_response: apiResult,
      client_id: clientId || null,
      trigger_type: triggerType,
    })
  } catch (e) {
    console.error('sendWhatsApp error:', e)
  }
}

async function initiateBackupFlow(supabase: any, config: any, confirmation: any, recording: any) {
  if (!recording) return

  const { data: backupClients } = await supabase
    .from('clients')
    .select('id, company_name, whatsapp')
    .eq('accepts_extra', true)
    .eq('videomaker_id', recording.videomaker_id)
    .neq('id', recording.client_id)
    .not('whatsapp', 'eq', '')

  if (!backupClients || backupClients.length === 0) return

  const backupIds = backupClients.map((c: any) => c.id)
  await sendBackupInvite(supabase, config, recording.id, backupIds, 0, recording)
}

async function sendBackupInvite(supabase: any, config: any, recordingId: string, backupIds: string[], index: number, recording: any) {
  if (index >= backupIds.length) return

  const clientId = backupIds[index]
  const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!client || !client.whatsapp) return

  const templateVars = {
    nome_cliente: client.company_name,
    data_gravacao: recording?.date || '',
    hora_gravacao: recording?.start_time || '',
  }

  const message = applyTemplate(config.msg_backup_invite, templateVars)

  await supabase.from('whatsapp_confirmations').insert({
    recording_id: recordingId,
    client_id: clientId,
    phone_number: client.whatsapp.replace(/\D/g, ''),
    type: 'backup_invite',
    status: 'pending',
    sent_at: new Date().toISOString(),
    backup_client_ids: backupIds,
    backup_index: index,
  })

  await sendWhatsApp(config, client.whatsapp, message, clientId, 'auto_backup')
}
