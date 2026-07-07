import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Tag, ArrowLeft, Rocket, Zap, Check, Flame, Sparkles, Link2, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PLANS } from '@/data/plans';
import { motion } from 'framer-motion';

type Promo = {
  id: string;
  city: string | null;
  plan_key: string | null;
  applies_to: 'anual' | 'semestral' | 'ambos';
  title: string;
  description: string | null;
  discount_percent: number;
  duration_months: number;
  active: boolean;
  exclusive: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  redemptions_count: number;
};

type PresetDef = {
  id: string;
  icon: typeof Rocket;
  badge: string;
  title: string;
  subtitle: string;
  highlight?: boolean;
  payload: Omit<Promo, 'id' | 'redemptions_count'>;
};

const PRESETS: PresetDef[] = [
  {
    id: 'aceleracao-comercial-pulse',
    icon: Rocket,
    badge: '🔥 Em destaque',
    title: 'Aceleração Comercial Pulse',
    subtitle: 'Mantém os 10% do anual + 30% OFF nos primeiros 6 meses. Promoção de lançamento.',
    highlight: true,
    payload: {
      city: null,
      plan_key: null,
      applies_to: 'anual',
      title: 'Aceleração Comercial Pulse',
      description: 'Feche o plano anual e ganhe 30% OFF nos primeiros 6 meses + os 10% de desconto do contrato anual já inclusos.',
      discount_percent: 30,
      duration_months: 6,
      active: true,
      starts_at: null,
      ends_at: null,
      max_redemptions: null,
      exclusive: false,
    },
  },
  {
    id: 'lancamento-uruacu',
    icon: Flame,
    badge: '🎯 Por cidade',
    title: 'Lançamento Uruaçu — 10 primeiros',
    subtitle: '30% OFF nos primeiros 6 meses para os 10 primeiros clientes de Uruaçu.',
    payload: {
      city: 'uruacu',
      plan_key: null,
      applies_to: 'anual',
      title: 'Lançamento Uruaçu',
      description: 'Promoção de lançamento — 30% OFF nos primeiros 6 meses para os 10 primeiros clientes.',
      discount_percent: 30,
      duration_months: 6,
      active: true,
      starts_at: null,
      ends_at: null,
      max_redemptions: 10,
      exclusive: false,
    },
  },
  {
    id: 'semestral-10',
    icon: Zap,
    badge: '⚡ Tática',
    title: '10% OFF no semestral',
    subtitle: 'Desconto adicional para destravar quem ainda não fecha anual.',
    payload: {
      city: null,
      plan_key: null,
      applies_to: 'semestral',
      title: '10% OFF no semestral',
      description: 'Desconto adicional de 10% no contrato semestral por 6 meses.',
      discount_percent: 10,
      duration_months: 6,
      active: true,
      starts_at: null,
      ends_at: null,
      max_redemptions: null,
      exclusive: false,
    },
  },
];

const empty: Omit<Promo, 'id' | 'redemptions_count'> = {
  city: null,
  plan_key: null,
  applies_to: 'anual',
  title: '',
  description: '',
  discount_percent: 30,
  duration_months: 6,
  active: true,
  starts_at: null,
  ends_at: null,
  max_redemptions: null,
  exclusive: false,
};

export default function PlanPromotionsAdmin() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof empty>(empty);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('plan_promotions' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar: ' + error.message);
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Verifica se um preset está ativo (match por título)
  const isPresetActive = (preset: PresetDef) =>
    items.some(p => p.active && p.title.trim().toLowerCase() === preset.payload.title.trim().toLowerCase());

  // Presets que podem coexistir (anual + semestral). Ao ativar um deles,
  // outros nesse grupo NÃO são desativados.
  const COEXIST_IDS = new Set(['aceleracao-comercial-pulse', 'semestral-10']);

  async function activatePresetById(presetId: string, coexistWith: Set<string>) {
    const preset = PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const titleKey = preset.payload.title.trim().toLowerCase();
    // Desativa outras promoções ativas que NÃO estão no grupo de coexistência
    const others = items.filter(p =>
      p.active &&
      p.title.trim().toLowerCase() !== titleKey &&
      !PRESETS.some(pr => coexistWith.has(pr.id) && pr.payload.title.trim().toLowerCase() === p.title.trim().toLowerCase())
    );
    for (const a of others) {
      await supabase.from('plan_promotions' as any).update({ active: false }).eq('id', a.id);
    }
    const existing = items.filter(p => p.title.trim().toLowerCase() === titleKey);
    if (existing.length > 0) {
      await supabase.from('plan_promotions' as any)
        .update({ ...preset.payload, active: true })
        .eq('id', existing[0].id);
    } else {
      const { error } = await supabase.from('plan_promotions' as any).insert(preset.payload);
      if (error) throw error;
    }
  }

  async function activatePreset(preset: PresetDef) {
    setSaving(true);
    try {
      if (preset.id === 'aceleracao-comercial-pulse') {
        // Ativa Aceleração + bônus 10% no semestral juntos
        await activatePresetById('aceleracao-comercial-pulse', COEXIST_IDS);
        await activatePresetById('semestral-10', COEXIST_IDS);
        toast.success('Aceleração Pulse ativada + 10% OFF no semestral incluso');
      } else {
        await activatePresetById(preset.id, COEXIST_IDS);
        toast.success(`${preset.title} ativada`);
      }
      load();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivatePreset(preset: PresetDef) {
    const titles = [preset.payload.title.trim().toLowerCase()];
    // Se desativar a Aceleração, também desativa o bônus semestral
    if (preset.id === 'aceleracao-comercial-pulse') {
      const sem = PRESETS.find(p => p.id === 'semestral-10');
      if (sem) titles.push(sem.payload.title.trim().toLowerCase());
    }
    const existing = items.filter(p => titles.includes(p.title.trim().toLowerCase()) && p.active);
    if (existing.length === 0) return;
    setSaving(true);
    try {
      for (const e of existing) {
        await supabase.from('plan_promotions' as any).update({ active: false }).eq('id', e.id);
      }
      toast.success(`${preset.title} desativada`);
      load();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: Promo) {
    setEditingId(p.id);
    setShowCustom(true);
    const { id, redemptions_count, ...rest } = p;
    setForm(rest);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setForm(empty);
  }

  async function save() {
    if (!form.title.trim()) { toast.error('Informe um título'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        city: form.city || null,
        plan_key: form.plan_key || null,
        description: form.description || null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      };
      if (editingId) {
        const { error } = await supabase.from('plan_promotions' as any).update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Promoção atualizada');
      } else {
        const { error } = await supabase.from('plan_promotions' as any).insert(payload);
        if (error) throw error;
        toast.success('Promoção criada');
      }
      resetForm();
      load();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta promoção?')) return;
    const { error } = await supabase.from('plan_promotions' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Removida');
    load();
  }

  async function toggleActive(p: Promo) {
    const { error } = await supabase.from('plan_promotions' as any).update({ active: !p.active }).eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  async function updateRedemptions(p: Promo, value: number) {
    const safe = Math.max(0, Math.floor(value || 0));
    const { error } = await supabase.from('plan_promotions' as any)
      .update({ redemptions_count: safe })
      .eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Clientes fechados atualizado');
    setItems(prev => prev.map(it => it.id === p.id ? { ...it, redemptions_count: safe } : it));
  }

  async function copyExclusiveLink(p: Promo) {
    const city = p.city || 'uruacu';
    const url = `${window.location.origin}/p/planos?city=${city}&promo=${p.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link exclusivo copiado!', { description: url });
    } catch {
      toast.error('Copie manualmente: ' + url);
    }
  }


  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/apresentacao')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Tag size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Promoções de Planos</h1>
          <p className="text-sm text-muted-foreground">Escolha qual promoção fica ativa nas páginas de apresentação.</p>
        </div>
      </div>

      {/* PRESETS — seleção rápida */}
      {(() => {
        const hasActive = PRESETS.some(p => isPresetActive(p));
        const visiblePresets = hasActive ? PRESETS.filter(p => isPresetActive(p)) : PRESETS;
        return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {hasActive ? 'Promoção ativa' : 'Promoções prontas'}
          </h2>
          <span className="text-xs text-muted-foreground">
            {hasActive ? 'Desative para escolher outra' : 'Clique para ativar'}
          </span>
        </div>
        <div className={`grid gap-4 ${hasActive ? 'md:grid-cols-1 max-w-2xl' : 'md:grid-cols-3'}`}>
          {visiblePresets.map((preset) => {
            const active = isPresetActive(preset);
            const Icon = preset.icon;
            return (
              <motion.button
                key={preset.id}
                type="button"
                whileHover={{ y: -4 }}
                onClick={() => active ? deactivatePreset(preset) : activatePreset(preset)}
                disabled={saving}
                className={`relative text-left rounded-2xl p-5 border-2 transition-all overflow-hidden ${
                  active
                    ? 'border-primary bg-gradient-to-br from-primary/15 via-orange-500/10 to-primary/5 shadow-lg'
                    : preset.highlight
                    ? 'border-primary/30 bg-card hover:border-primary/60'
                    : 'border-border bg-card hover:border-primary/40'
                }`}
              >
                {active && (
                  <motion.div
                    className="absolute inset-0 -z-0 opacity-30"
                    animate={{ background: [
                      'radial-gradient(circle at 20% 20%, hsl(var(--primary)/.4), transparent 60%)',
                      'radial-gradient(circle at 80% 80%, hsl(var(--primary)/.4), transparent 60%)',
                      'radial-gradient(circle at 20% 20%, hsl(var(--primary)/.4), transparent 60%)',
                    ]}}
                    transition={{ duration: 4, repeat: Infinity }}
                  />
                )}
                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {active ? (
                      <Badge className="bg-emerald-500 text-white border-0">
                        <Check className="h-3 w-3 mr-1" /> Ativa
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">{preset.badge}</Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-base mb-1 leading-tight">{preset.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{preset.subtitle}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{preset.payload.discount_percent}% OFF</Badge>
                    <Badge variant="outline" className="text-[10px]">{preset.payload.duration_months} meses</Badge>
                    <Badge variant="outline" className="text-[10px]">{preset.payload.applies_to}</Badge>
                    {preset.payload.city && <Badge variant="outline" className="text-[10px]">{preset.payload.city}</Badge>}
                    {preset.payload.max_redemptions && <Badge variant="outline" className="text-[10px]">{preset.payload.max_redemptions} vagas</Badge>}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
        );
      })()}



      {/* Toggle Custom */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <h2 className="text-base font-semibold">Promoção personalizada</h2>
          <p className="text-xs text-muted-foreground">Crie uma oferta com regras específicas (cidade, plano, vagas, datas).</p>
        </div>
        <Button variant={showCustom ? 'secondary' : 'outline'} size="sm" onClick={() => { setShowCustom(s => !s); if (showCustom) resetForm(); }}>
          {showCustom ? 'Fechar' : <><Plus className="h-4 w-4 mr-1" /> Nova personalizada</>}
        </Button>
      </div>

      {showCustom && (
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Editar promoção' : 'Nova promoção personalizada'}</CardTitle>
          <CardDescription>Deixe cidade ou plano em branco para aplicar a todos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Promoção de Lançamento" />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Select value={form.city ?? 'all'} onValueChange={v => setForm({ ...form, city: v === 'all' ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as cidades</SelectItem>
                  <SelectItem value="minacu">Minaçu</SelectItem>
                  <SelectItem value="uruacu">Uruaçu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={form.plan_key ?? 'all'} onValueChange={v => setForm({ ...form, plan_key: v === 'all' ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os planos</SelectItem>
                  {PLANS.map(p => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Aplica-se ao contrato</Label>
              <Select value={form.applies_to} onValueChange={v => setForm({ ...form, applies_to: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anual">Apenas anual</SelectItem>
                  <SelectItem value="semestral">Apenas semestral</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Desconto adicional (%)</Label>
              <Input type="number" min={0} max={100} value={form.discount_percent}
                onChange={e => setForm({ ...form, discount_percent: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Duração do desconto (meses)</Label>
              <Input type="number" min={1} max={24} value={form.duration_months}
                onChange={e => setForm({ ...form, duration_months: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Início (opcional)</Label>
              <Input type="date" value={form.starts_at ?? ''} onChange={e => setForm({ ...form, starts_at: e.target.value || null })} />
            </div>
            <div className="space-y-2">
              <Label>Fim (opcional)</Label>
              <Input type="date" value={form.ends_at ?? ''} onChange={e => setForm({ ...form, ends_at: e.target.value || null })} />
            </div>
            <div className="space-y-2">
              <Label>Limite de clientes (vagas)</Label>
              <Input type="number" min={1} value={form.max_redemptions ?? ''}
                placeholder="Ex: 10 (vazio = ilimitado)"
                onChange={e => setForm({ ...form, max_redemptions: e.target.value ? Number(e.target.value) : null })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição (aparece no banner)</Label>
            <Textarea rows={2} value={form.description ?? ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Feche o anual e ganhe 30% off nos primeiros 6 meses." />
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
              <span className="text-sm">Ativa</span>
            </div>
            <div className="flex items-start gap-3">
              <Switch checked={form.exclusive} onCheckedChange={v => setForm({ ...form, exclusive: v })} />
              <div>
                <span className="text-sm flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-primary" /> Exclusiva de link</span>
                <p className="text-xs text-muted-foreground">Só aplica quando o cliente abrir o link específico com o ID desta promoção. Não interfere nas demais.</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              <Save size={16} /> {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar promoção'}
            </Button>
            {editingId && <Button variant="outline" onClick={resetForm}>Cancelar</Button>}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Lista de cadastradas (gerenciamento) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas as promoções cadastradas</CardTitle>
          <CardDescription>Histórico — você pode reativar, editar ou excluir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma promoção cadastrada ainda. Ative uma das promoções prontas acima.</p>
          )}
          {items.map(p => (
            <div key={p.id} className="p-3 border border-border rounded-xl bg-muted/30 flex flex-col md:flex-row md:items-center gap-3 justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{p.title}</span>
                  {p.exclusive
                    ? <Badge className="bg-primary/15 text-primary border-primary/30"><Lock className="h-3 w-3 mr-1" /> Exclusiva de link</Badge>
                    : p.active
                      ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20">Ativa</Badge>
                      : <Badge variant="outline">Inativa</Badge>}
                  <Badge variant="outline" className="text-[10px]">{p.city ?? 'Todas cidades'}</Badge>
                  <Badge variant="outline" className="text-[10px]">{p.plan_key ? PLANS.find(x => x.key === p.plan_key)?.name : 'Todos planos'}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.discount_percent}% off por {p.duration_months} {p.duration_months === 1 ? 'mês' : 'meses'}
                  {p.max_redemptions ? ` • ${p.redemptions_count}/${p.max_redemptions} vagas usadas` : ''}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Clientes fechados:</Label>
                  <Input
                    type="number"
                    min={0}
                    max={p.max_redemptions ?? undefined}
                    defaultValue={p.redemptions_count}
                    className="h-8 w-24"
                    onBlur={e => {
                      const v = Number(e.target.value);
                      if (v !== p.redemptions_count) updateRedemptions(p, v);
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyExclusiveLink(p)} className="gap-1">
                  <Link2 size={14} /> Link do cliente
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleActive(p)}>
                  {p.active ? 'Desativar' : 'Ativar'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => startEdit(p)}>Editar</Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(p.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}

        </CardContent>
      </Card>
    </div>
  );
}
