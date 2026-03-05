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
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const refMonth = `${year}-${String(month).padStart(2, '0')}-01`;

    // Get active contracts
    const { data: contracts, error: contractsErr } = await supabase
      .from('financial_contracts')
      .select('*')
      .eq('status', 'ativo');

    if (contractsErr) throw contractsErr;
    if (!contracts?.length) {
      return new Response(JSON.stringify({ message: 'No active contracts', generated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get existing revenues for this month
    const { data: existing } = await supabase
      .from('revenues')
      .select('client_id')
      .eq('reference_month', refMonth);

    const existingClientIds = new Set((existing || []).map(r => r.client_id));

    // Build new revenues for contracts that don't have one yet
    const newRevenues = contracts
      .filter(c => !existingClientIds.has(c.client_id))
      .map(c => ({
        client_id: c.client_id,
        contract_id: c.id,
        reference_month: refMonth,
        amount: c.contract_value,
        due_date: `${year}-${String(month).padStart(2, '0')}-${String(c.due_day).padStart(2, '0')}`,
        status: 'prevista',
      }));

    if (newRevenues.length > 0) {
      const { error: insertErr } = await supabase.from('revenues').insert(newRevenues);
      if (insertErr) throw insertErr;

      // Log the activity
      await supabase.from('financial_activity_log').insert({
        action_type: 'geração_automática',
        entity_type: 'receita',
        description: `Cron gerou ${newRevenues.length} receita(s) recorrente(s) para ${year}-${String(month).padStart(2, '0')}`,
        details: { month: refMonth, count: newRevenues.length },
      });
    }

    return new Response(JSON.stringify({ generated: newRevenues.length, month: refMonth }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
