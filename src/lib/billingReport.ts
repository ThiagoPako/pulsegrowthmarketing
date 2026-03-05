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

/**
 * Generates a personalized delivery report for a client based on their plan.
 * Fetches delivery_records, social_media_deliveries, and the client's plan
 * to build a warm, human message showing only metrics relevant to the plan.
 */
export async function generateDeliveryReport(
  clientId: string,
  planId: string | null | undefined,
  referenceMonth?: string // 'YYYY-MM' format, defaults to current month
): Promise<DeliveryReport> {
  const now = new Date();
  const year = referenceMonth ? parseInt(referenceMonth.split('-')[0]) : now.getFullYear();
  const month = referenceMonth ? parseInt(referenceMonth.split('-')[1]) - 1 : now.getMonth();

  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Fetch plan, deliveries, and social deliveries in parallel
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

  // Calculate stats
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

  const lines: string[] = [];

  // Always show recording info if recordings happened
  if (gravacoes > 0) {
    lines.push(`Estivemos juntos durante *${recordingHours}h de gravação* em ${gravacoes} sessão${gravacoes > 1 ? 'ões' : ''} 📹`);
  }
  if (videos > 0) {
    lines.push(`Produzimos *${videos} vídeos* para sua marca 🎬`);
  }

  // Show metrics based on plan
  if (plan) {
    if (plan.reels_qty > 0 && totalReels > 0) {
      lines.push(`Publicamos *${totalReels} reels* no seu perfil 🎥`);
    }
    if (plan.stories_qty > 0 && totalStories > 0) {
      lines.push(`Estivemos presentes nos stories com *${totalStories} publicações* 📱`);
    }
    if (plan.arts_qty > 0 && artes > 0) {
      lines.push(`Criamos *${artes} artes* para seus canais 🎨`);
    }
    if (plan.creatives_qty > 0 && criativos > 0) {
      lines.push(`Desenvolvemos *${criativos} criativos* para suas campanhas ✨`);
    }
  } else {
    // No plan — show all non-zero stats
    if (totalReels > 0) lines.push(`Publicamos *${totalReels} reels* no seu perfil 🎥`);
    if (totalStories > 0) lines.push(`Estivemos presentes nos stories com *${totalStories} publicações* 📱`);
    if (artes > 0) lines.push(`Criamos *${artes} artes* para seus canais 🎨`);
    if (criativos > 0) lines.push(`Desenvolvemos *${criativos} criativos* para suas campanhas ✨`);
  }

  if (extras > 0) {
    lines.push(`Ainda entregamos *${extras} conteúdos extras* além do contratado ➕`);
  }

  if (lines.length > 0) {
    return { text: `\n\nEsse mês foi incrível e fizemos muita coisa juntos! 💪\n\n${lines.join('\n')}` };
  }

  return { text: '' };
}
