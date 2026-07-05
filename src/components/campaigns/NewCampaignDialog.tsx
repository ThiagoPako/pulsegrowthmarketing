import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { CAMPAIGN_TYPE_LABELS, CAMPAIGN_TYPE_DESCRIPTIONS, CampaignType, formatBrDate } from '@/lib/campaignsUtils';
import { buildCampaignSlots, RECOMMENDED_QUANTITIES } from '@/lib/campaignTemplates';
import {
  Sparkles, FileText, Palette, BookOpen, Megaphone, Users, Target, Calendar,
  Check, ChevronRight, ChevronLeft, Building2, Rocket, PartyPopper, Heart, Tag, CalendarDays, Sprout,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const TYPE_META: Record<CampaignType, { icon: any; color: string; accent: string }> = {
  institucional: { icon: Building2, color: 'from-sky-500/20 to-transparent', accent: '#38bdf8' },
  promocional: { icon: Tag, color: 'from-orange-500/20 to-transparent', accent: '#f97316' },
  sazonal: { icon: CalendarDays, color: 'from-emerald-500/20 to-transparent', accent: '#10b981' },
  lancamento: { icon: Rocket, color: 'from-fuchsia-500/20 to-transparent', accent: '#e879f9' },
  responsabilidade_social: { icon: Heart, color: 'from-rose-500/20 to-transparent', accent: '#f43f5e' },
  evento: { icon: PartyPopper, color: 'from-amber-500/20 to-transparent', accent: '#f59e0b' },
  agro: { icon: Sprout, color: 'from-lime-500/20 to-transparent', accent: '#84cc16' },
};

const STEPS = [
  { n: 1, title: 'Cliente', subtitle: 'Quem vai receber a campanha', icon: Users },
  { n: 2, title: 'Tipo', subtitle: 'Escolha o objetivo estratégico', icon: Target },
  { n: 3, title: 'Período', subtitle: 'Datas e volume de entregas', icon: Calendar },
  { n: 4, title: 'Revisão', subtitle: 'Tarefas geradas automaticamente', icon: Sparkles },
];

export default function NewCampaignDialog({ open, onOpenChange, onCreated }: Props) {
  const { clients } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<CampaignType>('institucional');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [videosQty, setVideosQty] = useState(4);
  const [creativesQty, setCreativesQty] = useState(2);
  const [objective, setObjective] = useState('');
  const [saving, setSaving] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const clientOptions = useMemo(
    () => [...clients]
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
      .filter((c) => !clientSearch || c.companyName.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch]
  );

  const selectedClient = clients.find((c) => c.id === clientId);
  const previewSlots = useMemo(
    () => (startDate && endDate ? buildCampaignSlots({ type, startDate, endDate, videosQty, creativesQty }) : []),
    [type, startDate, endDate, videosQty, creativesQty]
  );

  const reset = () => {
    setStep(1); setClientId(''); setName(''); setType('institucional');
    setStartDate(''); setEndDate(''); setVideosQty(4); setCreativesQty(2); setObjective(''); setClientSearch('');
  };

  const canNext = () => {
    if (step === 1) return !!clientId && !!name.trim();
    if (step === 2) return !!type;
    if (step === 3) return !!startDate && !!endDate && videosQty >= 0 && creativesQty >= 0 && startDate <= endDate;
    return true;
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          client_id: clientId,
          name: name.trim(),
          type,
          objective: objective.trim() || null,
          start_date: startDate,
          end_date: endDate,
          videos_qty: videosQty,
          creatives_qty: creativesQty,
          status: 'ativa',
          owner_id: user?.id || null,
        })
        .select()
        .single();

      if (error || !campaign) throw error || new Error('Falha ao criar campanha');

      const generated = buildCampaignSlots({ type, startDate, endDate, videosQty, creativesQty });
      const slots = generated.map((s) => ({ ...s, campaign_id: campaign.id }));

      if (slots.length > 0) {
        const { error: sErr } = await supabase.from('campaign_slots').insert(slots);
        if (sErr) throw sErr;
      }

      toast.success('Campanha criada!');
      onCreated?.();
      onOpenChange(false);
      reset();
      navigate(`/campanhas/${campaign.id}`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar campanha');
    } finally {
      setSaving(false);
    }
  };

  const activeType = TYPE_META[type];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden border-white/10 bg-[#0a0a0a] text-white">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-red-500/10 blur-3xl" />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl opacity-30 transition-colors duration-700"
            style={{ background: `radial-gradient(circle, ${activeType.accent}22 0%, transparent 70%)` }}
          />
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-[240px_1fr] min-h-[560px] max-h-[85vh]">
          {/* Sidebar steps */}
          <aside className="hidden md:flex flex-col border-r border-white/5 bg-black/40 p-6">
            <div className="flex items-center gap-2 mb-8">
              <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
                <Megaphone size={14} className="text-orange-400" />
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-orange-400">Pulse</div>
                <div className="text-xs font-bold">Nova Campanha</div>
              </div>
            </div>

            <div className="relative flex-1">
              <div className="absolute left-[15px] top-3 bottom-3 w-px bg-white/5" />
              <ol className="space-y-5 relative">
                {STEPS.map((s) => {
                  const active = step === s.n;
                  const done = step > s.n;
                  const Icon = s.icon;
                  return (
                    <li key={s.n} className="flex gap-3 items-start">
                      <div
                        className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border transition-all ${
                          done
                            ? 'bg-orange-500 border-orange-500 text-black'
                            : active
                            ? 'bg-orange-500/15 border-orange-500 text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.35)]'
                            : 'bg-white/[0.03] border-white/10 text-white/40'
                        }`}
                      >
                        {done ? <Check size={14} strokeWidth={3} /> : <Icon size={13} />}
                      </div>
                      <div className="flex-1 pt-1">
                        <div className={`text-[9px] font-black uppercase tracking-[0.2em] ${active ? 'text-orange-400' : done ? 'text-white/60' : 'text-white/30'}`}>
                          Etapa {s.n}
                        </div>
                        <div className={`text-sm font-bold leading-tight ${active || done ? 'text-white' : 'text-white/50'}`}>
                          {s.title}
                        </div>
                        <div className="text-[10px] text-white/40 leading-snug mt-0.5">{s.subtitle}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 mt-6">
              Playbook Pulse
            </div>
          </aside>

          {/* Main content */}
          <div className="relative flex flex-col overflow-hidden">
            <div className="px-8 pt-8 pb-4 border-b border-white/5">
              <div className="text-[9px] font-black uppercase tracking-[0.3em] text-orange-400 mb-2">
                Passo {step} de {STEPS.length}
              </div>
              <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none">
                {STEPS[step - 1].title}
              </h2>
              <p className="text-sm text-white/50 mt-1.5">{STEPS[step - 1].subtitle}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  {step === 1 && (
                    <div className="space-y-6">
                      <div>
                        <FieldLabel>Nome da campanha</FieldLabel>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ex: Black Friday 2026 · Lançamento coleção verão"
                          className="w-full mt-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder:text-white/30 outline-none focus:border-orange-500/60 focus:bg-white/[0.05] transition"
                        />
                      </div>

                      <div>
                        <FieldLabel>Cliente</FieldLabel>
                        <input
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          placeholder="Buscar cliente..."
                          className="w-full mt-2 mb-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/30 outline-none focus:border-orange-500/60 transition"
                        />
                        <div className="max-h-64 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                          {clientOptions.map((c) => {
                            const active = clientId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setClientId(c.id)}
                                className={`text-left p-3 rounded-xl border transition-all group ${
                                  active
                                    ? 'border-orange-500/60 bg-orange-500/[0.08] shadow-[0_0_20px_rgba(249,115,22,0.15)]'
                                    : 'border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${active ? 'bg-orange-500 text-black' : 'bg-white/5 text-white/60 group-hover:bg-white/10'}`}>
                                    {c.companyName.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold truncate">{c.companyName}</div>
                                    <div className="text-[10px] text-white/40 truncate">{(c as any).segment || 'Cliente Pulse'}</div>
                                  </div>
                                  {active && <Check size={14} className="text-orange-400 shrink-0" />}
                                </div>
                              </button>
                            );
                          })}
                          {clientOptions.length === 0 && (
                            <div className="col-span-full text-center text-xs text-white/40 py-6">Nenhum cliente encontrado.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(Object.keys(CAMPAIGN_TYPE_LABELS) as CampaignType[]).map((t) => {
                        const meta = TYPE_META[t];
                        const Icon = meta.icon;
                        const active = type === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setType(t)}
                            className={`relative overflow-hidden text-left p-5 rounded-2xl border transition-all group ${
                              active
                                ? 'border-white/30 bg-white/[0.06]'
                                : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                            }`}
                            style={active ? { boxShadow: `0 0 30px ${meta.accent}22, inset 0 0 0 1px ${meta.accent}55` } : undefined}
                          >
                            <div className={`absolute inset-0 bg-gradient-to-br ${meta.color} opacity-0 group-hover:opacity-100 ${active ? 'opacity-100' : ''} transition-opacity`} />
                            <div className="relative">
                              <div className="flex items-start justify-between mb-3">
                                <div
                                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                                  style={{ background: `${meta.accent}20`, color: meta.accent }}
                                >
                                  <Icon size={20} />
                                </div>
                                {t === 'evento' && (
                                  <span className="text-[8px] font-black uppercase tracking-[0.25em] px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400">
                                    Novo
                                  </span>
                                )}
                                {active && <Check size={18} style={{ color: meta.accent }} />}
                              </div>
                              <div className="text-base font-bold mb-1">{CAMPAIGN_TYPE_LABELS[t]}</div>
                              <div className="text-xs text-white/50 leading-relaxed">{CAMPAIGN_TYPE_DESCRIPTIONS[t]}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {step === 3 && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <DateField label="Data de início" value={startDate} onChange={setStartDate} />
                        <DateField label="Data final" value={endDate} onChange={setEndDate} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <NumberStepper label="Vídeos" value={videosQty} onChange={setVideosQty} icon={FileText} accent="#38bdf8" />
                        <NumberStepper label="Criativos" value={creativesQty} onChange={setCreativesQty} icon={Palette} accent="#e879f9" />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const rec = RECOMMENDED_QUANTITIES[type];
                          setVideosQty(rec.videos);
                          setCreativesQty(rec.creatives);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.06] text-orange-400 hover:bg-orange-500/10 transition group"
                      >
                        <Sparkles size={14} className="group-hover:rotate-12 transition-transform" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Usar recomendado · {RECOMMENDED_QUANTITIES[type].videos} vídeos + {RECOMMENDED_QUANTITIES[type].creatives} criativos
                        </span>
                      </button>

                      <div>
                        <FieldLabel>Objetivo comercial / observações</FieldLabel>
                        <textarea
                          value={objective}
                          onChange={(e) => setObjective(e.target.value)}
                          rows={3}
                          placeholder="Qual meta de venda / lead essa campanha precisa bater?"
                          className="w-full mt-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/30 outline-none focus:border-orange-500/60 focus:bg-white/[0.05] transition resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {step === 4 && (
                    <div className="space-y-5">
                      {/* Summary card */}
                      <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]">
                        <div className={`absolute inset-0 bg-gradient-to-br ${activeType.color} opacity-40`} />
                        <div className="relative p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                          <SummaryStat label="Cliente" value={selectedClient?.companyName || '—'} />
                          <SummaryStat label="Tipo" value={CAMPAIGN_TYPE_LABELS[type]} accent={activeType.accent} />
                          <SummaryStat label="Período" value={`${formatBrDate(startDate)} → ${formatBrDate(endDate)}`} />
                          <SummaryStat label="Entregas" value={`${videosQty}🎬 · ${creativesQty}🎨`} />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles size={14} className="text-orange-400" />
                          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">
                            Tarefas geradas automaticamente
                          </span>
                          <span className="text-[10px] text-white/40 ml-auto">{previewSlots.length} slots</span>
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                          {previewSlots.map((s, i) => {
                            const Icon = s.kind === 'editorial' ? BookOpen : s.kind === 'video' ? FileText : Palette;
                            const accent = s.kind === 'editorial' ? '#f97316' : s.kind === 'video' ? '#38bdf8' : '#e879f9';
                            return (
                              <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.02 }}
                                className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition"
                              >
                                <div
                                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                  style={{ background: `${accent}18`, color: accent }}
                                >
                                  <Icon size={15} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold truncate">{s.title}</div>
                                  <div className="text-[10px] text-white/40 uppercase tracking-wider mt-0.5">
                                    {s.kind} · postar em <span className="text-white/60">{formatBrDate(s.post_date)}</span>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                          {previewSlots.length === 0 && (
                            <div className="text-center text-sm text-white/40 py-8">Preencha o período para gerar as tarefas.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="border-t border-white/5 bg-black/40 px-8 py-4 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={step === 1 || saving}
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={14} /> Voltar
              </button>

              <div className="flex items-center gap-1.5">
                {STEPS.map((s) => (
                  <div
                    key={s.n}
                    className={`h-1 rounded-full transition-all ${
                      step === s.n ? 'w-8 bg-orange-500' : step > s.n ? 'w-4 bg-orange-500/60' : 'w-4 bg-white/10'
                    }`}
                  />
                ))}
              </div>

              {step < 4 ? (
                <button
                  type="button"
                  disabled={!canNext()}
                  onClick={() => setStep(step + 1)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-orange-500 text-black text-xs font-black uppercase tracking-wider hover:bg-orange-400 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-[0_0_20px_rgba(249,115,22,0.35)]"
                >
                  Próximo <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCreate}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-orange-500 text-black text-xs font-black uppercase tracking-wider hover:bg-orange-400 disabled:opacity-50 transition shadow-[0_0_25px_rgba(249,115,22,0.45)]"
                >
                  {saving ? 'Criando...' : <>Criar campanha <Sparkles size={14} /></>}
                </button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Helpers ----------
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/50">{children}</div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white outline-none focus:border-orange-500/60 focus:bg-white/[0.05] transition [color-scheme:dark]"
      />
    </div>
  );
}

function NumberStepper({
  label, value, onChange, icon: Icon, accent,
}: { label: string; value: number; onChange: (v: number) => void; icon: any; accent: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}20`, color: accent }}>
          <Icon size={13} />
        </div>
        <FieldLabel>{label}</FieldLabel>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-white/70 text-lg leading-none flex items-center justify-center transition"
        >
          −
        </button>
        <div className="text-3xl font-black italic tabular-nums" style={{ color: accent }}>
          {value}
        </div>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-white/70 text-lg leading-none flex items-center justify-center transition"
        >
          +
        </button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40 mb-1">{label}</div>
      <div className="text-sm font-bold truncate" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}
