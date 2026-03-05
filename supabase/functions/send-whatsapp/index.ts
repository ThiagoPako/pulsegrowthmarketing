import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const WHATSAPP_API_URL = 'https://api.atendeclique.com.br/api/messages/send'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const userId = claimsData.claims.sub

    const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_API_TOKEN')
    if (!WHATSAPP_TOKEN) {
      return new Response(JSON.stringify({ error: 'WhatsApp API token not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const { number, message, userId: apiUserId, queueId, sendSignature, closeTicket, clientId, triggerType } = body

    if (!number || !message) {
      return new Response(JSON.stringify({ error: 'number and message are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Send to WhatsApp API
    const apiBody = {
      number: number.replace(/\D/g, ''),
      body: message,
      userId: apiUserId || '',
      queueId: queueId || '',
      sendSignature: sendSignature || false,
      closeTicket: closeTicket || false,
    }

    const apiResponse = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiBody),
    })

    const apiResult = await apiResponse.json()
    const status = apiResponse.ok ? 'sent' : 'failed'

    // Log message in database
    await supabase.from('whatsapp_messages').insert({
      phone_number: number.replace(/\D/g, ''),
      message,
      status,
      api_response: apiResult,
      sent_by: userId,
      client_id: clientId || null,
      trigger_type: triggerType || 'manual',
    })

    return new Response(JSON.stringify({ success: apiResponse.ok, status, apiResult }), {
      status: apiResponse.ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-whatsapp error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
