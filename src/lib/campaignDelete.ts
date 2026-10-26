import { supabase } from '@/lib/vpsDb';

/**
 * Apaga a campanha e os slots, desvinculando antes os roteiros (o diálogo promete isso).
 * Antes os roteiros ficavam com campaign_slot_id apontando para um slot que não existe
 * mais e continuavam com o selo de campanha (ZonaCriativa, Roteiros). Cada etapa confere
 * o erro: se desvincular falhar, nada é apagado.
 */
export async function deleteCampaignWithSlots(campaignId: string): Promise<void> {
  const { data: slots, error: slotsError } = await supabase
    .from('campaign_slots')
    .select('id')
    .eq('campaign_id', campaignId);
  if (slotsError) throw slotsError;

  const slotIds = ((slots as { id: string }[] | null) || []).map((slot) => slot.id);
  if (slotIds.length > 0) {
    // Só scripts grava campaign_slot_id hoje (content_tasks/design_tasks têm a coluna, sem uso).
    const { error: unlinkError } = await supabase
      .from('scripts')
      .update({ campaign_slot_id: null } as any)
      .in('campaign_slot_id', slotIds);
    if (unlinkError) throw unlinkError;

    const { error: deleteSlotsError } = await supabase.from('campaign_slots').delete().eq('campaign_id', campaignId);
    if (deleteSlotsError) throw deleteSlotsError;
  }

  const { error } = await supabase.from('campaigns').delete().eq('id', campaignId);
  if (error) throw error;
}
