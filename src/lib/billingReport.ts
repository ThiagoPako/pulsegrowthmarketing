import { supabase } from '@/integrations/supabase/client';

const DEFAULT_PAYMENT_TEMPLATE = '💳 *Dados para pagamento:*\nNome: {nome_recebedor}\nBanco: {banco}\nChave PIX: {chave_pix}\nCPF/CNPJ: {documento}';

export function resolvePaymentInfo(config: { pix_key?: string; receiver_name?: string; bank?: string; document?: string; msg_payment_data?: string } | null): string {
  if (!config || (!config.pix_key && !config.receiver_name)) return '';
  const template = config.msg_payment_data || DEFAULT_PAYMENT_TEMPLATE;
  return template
    .replace(/\{nome_recebedor\}/g, config.receiver_name || '')
    .replace(/\{banco\}/g, config.bank || '')
    .replace(/\{chave_pix\}/g, config.pix_key || '')
    .replace(/\{documento\}/g, config.document || '');
}

interface DeliveryReport {
  text: string;
}

const DEFAULT_DELIVERY_TEMPLATE = `Esse mês foi incrível e fizemos muita coisa juntos! 💪

Estivemos juntos durante *{horas_gravacao}h de gravação* em {sessoes} sessão(ões) 📹
Produzimos *{videos} vídeos* para sua marca 🎬
Publicamos *{reels} reels* no seu perfil 🎥
Estivemos presentes nos stories com *{stories} publicações* 📱
Criamos *{artes} artes* para seus canais 🎨
Desenvolvemos *{criativos} criativos* para suas campanhas ✨
Ainda entregamos *{extras} conteúdos extras* além do contratado ➕`;

/**
 * Generates a personalized delivery report for a client based on their plan.
 * Uses a customizable template. Lines containing metrics that are zero are removed.
 */
export async function generateDeliveryReport(
  clientId: string,
  planId: string | null | undefined,
  referenceMonth?: string,
  customTemplate?: string
): Promise<DeliveryReport> {
  const now = new Date();
  const year = referenceMonth ? parseInt(referenceMonth.split('-')[0]) : now.getFullYear();
  const month = referenceMonth ? parseInt(referenceMonth.split('-')[1]) - 1 : now.getMonth();

  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const planPromise = planId
    ? supabase.from('plans').select('*').eq('id', planId).single()
    : Promise.resolve({ data: null });

  const deliveriesPromise = supabase
    .from('delivery_records')
    .select('*')
    .eq('client_id', clientId)
    .gte('date', monthStart)
    .lte('date', monthEnd);

  const socialPromise = supabase
    .from('social_media_deliveries')
    .select('*')
    .eq('client_id', clientId)
    .gte('delivered_at', monthStart)
    .lte('delivered_at', monthEnd);

  const [planResult, deliveriesResult, socialResult] = await Promise.all([
    planPromise,
    deliveriesPromise,
    socialPromise,
  ]);

  const plan = planResult.data;
  const deliveries = deliveriesResult.data || [];
  const socialDeliveries = socialResult.data || [];

  let gravacoes = 0, videos = 0, reels = 0, stories = 0, artes = 0, criativos = 0, extras = 0;

  deliveries.forEach(d => {
    gravacoes += 1;
    videos += d.videos_recorded || 0;
    reels += d.reels_produced || 0;
    stories += d.stories_produced || 0;
    artes += d.arts_produced || 0;
    criativos += d.creatives_produced || 0;
    extras += d.extras_produced || 0;
  });

  const socialReels = socialDeliveries.filter(d => d.content_type === 'reels' && d.status === 'postado').length;
  const socialStories = socialDeliveries.filter(d => d.content_type === 'story' && d.status === 'postado').length;

  const totalReels = Math.max(socialReels, reels);
  const totalStories = Math.max(socialStories, stories);
  const recordingHours = gravacoes * (plan?.recording_hours || 2);

  // If no deliveries at all, return empty
  if (gravacoes === 0 && videos === 0 && totalReels === 0 && totalStories === 0 && artes === 0 && criativos === 0 && extras === 0) {
    return { text: '' };
  }

  const template = customTemplate || DEFAULT_DELIVERY_TEMPLATE;

  // Map of variable -> value (used to remove lines with zero metrics)
  const varMap: Record<string, number> = {
    '{horas_gravacao}': recordingHours,
    '{sessoes}': gravacoes,
    '{videos}': videos,
    '{reels}': totalReels,
    '{stories}': totalStories,
    '{artes}': artes,
    '{criativos}': criativos,
    '{extras}': extras,
  };

  // Filter by plan: hide metrics not in plan (if plan exists)
  const planFilter: Record<string, boolean> = {};
  if (plan) {
    planFilter['{reels}'] = plan.reels_qty > 0;
    planFilter['{stories}'] = plan.stories_qty > 0;
    planFilter['{artes}'] = plan.arts_qty > 0;
    planFilter['{criativos}'] = plan.creatives_qty > 0;
  }

  // Process template: replace vars, remove lines with zero values or filtered by plan
  const lines = template.split('\n').filter(line => {
    // Check if line contains any metric variable
    for (const [varKey, value] of Object.entries(varMap)) {
      if (line.includes(varKey)) {
        // Remove if value is 0 or plan doesn't include this metric
        if (value === 0) return false;
        if (plan && planFilter[varKey] === false) return false;
      }
    }
    return true;
  });

  let result = lines.join('\n');
  for (const [varKey, value] of Object.entries(varMap)) {
    result = result.replace(new RegExp(varKey.replace(/[{}]/g, '\\$&'), 'g'), String(value));
  }

  // Clean up: remove consecutive empty lines
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return { text: `\n\n${result}` };
}
