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
import { Plus, Trash2, Save, Tag, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PLANS } from '@/data/plans';

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
  starts_at: string | null;
  ends_at: string | null;
};

const empty: Omit<Promo, 'id'> = {
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
};

export default function PlanPromotionsAdmin() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Omit<Promo, 'id'>>(empty);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  function startEdit(p: Promo) {
    setEditingId(p.id);
    const { id, ...rest } = p;
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

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/apresentacao')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Tag size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Promoções de Planos</h1>
          <p className="text-sm text-muted-foreground">Crie ofertas por cidade e plano (ex.: 30% off nos primeiros 6 meses no anual).</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Editar promoção' : 'Nova promoção'}</CardTitle>
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
          </div>
          <div className="space-y-2">
            <Label>Descrição (aparece no banner)</Label>
            <Textarea rows={2} value={form.description ?? ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Feche o anual e ganhe 30% off nos primeiros 6 meses." />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
            <span className="text-sm">Ativa</span>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              <Save size={16} /> {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar promoção'}
            </Button>
            {editingId && <Button variant="outline" onClick={resetForm}>Cancelar</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Promoções cadastradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma promoção cadastrada.</p>
          )}
          {items.map(p => (
            <div key={p.id} className="p-4 border border-border rounded-xl bg-muted/30 flex flex-col md:flex-row md:items-center gap-3 justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold">{p.title}</span>
                  {p.active
                    ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20">Ativa</Badge>
                    : <Badge variant="outline">Inativa</Badge>}
                  <Badge variant="outline">{p.city ?? 'Todas cidades'}</Badge>
                  <Badge variant="outline">{p.plan_key ? PLANS.find(x => x.key === p.plan_key)?.name : 'Todos planos'}</Badge>
                  <Badge variant="outline">{p.applies_to}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {p.discount_percent}% off por {p.duration_months} {p.duration_months === 1 ? 'mês' : 'meses'}
                  {p.description ? ` • ${p.description}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
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
