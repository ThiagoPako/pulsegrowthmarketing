import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import FinancialQuickNav from '@/components/financial/FinancialQuickNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Hammer, Plus, Pencil, Trash2, Layers, CalendarRange, Info } from 'lucide-react';
import { toast } from 'sonner';

const ALL = '__all__';

/** Categorias fixas de investimento em estrutura (não são categorias de despesa). */
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'reforma', label: 'Reforma / Obra' },
  { value: 'mao_de_obra', label: 'Mão de obra' },
  { value: 'materiais', label: 'Materiais' },
  { value: 'equipamentos', label: 'Equipamentos' },
  { value: 'mobiliario', label: 'Mobiliário' },
  { value: 'ponto_comercial', label: 'Ponto comercial' },
  { value: 'tecnologia', label: 'Tecnologia / TI' },
  { value: 'outros', label: 'Outros' },
];

const categoryLabel = (value: string) =>
  CATEGORIES.find(c => c.value === value)?.label || value || '—';

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Normaliza datas vindas do banco (DATE ou ISO) para YYYY-MM-DD. */
const normalizeDate = (value: string | null | undefined): string => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

interface StructureInvestment {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string | null;
  responsible: string | null;
}

interface InvestmentForm {
  date: string;
  amount: number;
  category: string;
  description: string;
  responsible: string;
}

const emptyForm = (): InvestmentForm => ({
  date: new Date().toISOString().split('T')[0],
  amount: 0,
  category: 'reforma',
  description: '',
  responsible: '',
});

export default function FinancialInvestments() {
  const navigate = useNavigate();

  const [items, setItems] = useState<StructureInvestment[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StructureInvestment | null>(null);
  const [form, setForm] = useState<InvestmentForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('structure_investments')
      .select('*')
      .order('date', { ascending: false });
    if (error) {
      console.error('[FinancialInvestments] load error:', error);
      toast.error('Não foi possível carregar os investimentos');
      setItems([]);
    } else {
      setItems(
        (data || []).map((row: any) => ({
          id: row.id,
          date: normalizeDate(row.date),
          amount: Number(row.amount || 0),
          category: row.category || 'outros',
          description: row.description ?? '',
          responsible: row.responsible ?? '',
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(e => {
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      if (categoryFilter !== ALL && e.category !== categoryFilter) return false;
      if (term) {
        const haystack = `${e.description || ''} ${e.responsible || ''} ${categoryLabel(e.category)}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [items, from, to, categoryFilter, search]);

  const total = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount || 0), 0), [filtered]);
  const totalGeral = useMemo(() => items.reduce((s, e) => s + Number(e.amount || 0), 0), [items]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(e => map.set(e.category, (map.get(e.category) || 0) + Number(e.amount || 0)));
    return Array.from(map.entries())
      .map(([id, value]) => ({ id, name: categoryLabel(id), value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (e: StructureInvestment) => {
    setEditing(e);
    setForm({
      date: e.date,
      amount: Number(e.amount || 0),
      category: e.category,
      description: e.description || '',
      responsible: e.responsible || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.category || !form.amount || !form.date) {
      toast.error('Preencha data, valor e categoria');
      return;
    }
    setSaving(true);
    const payload = {
      date: form.date,
      amount: Number(form.amount),
      category: form.category,
      description: form.description || null,
      responsible: form.responsible || null,
    };
    const { error } = editing
      ? await supabase.from('structure_investments').update(payload as any).eq('id', editing.id)
      : await supabase.from('structure_investments').insert(payload as any);
    setSaving(false);
    if (error) {
      console.error('[FinancialInvestments] save error:', error);
      toast.error('Não foi possível salvar o investimento');
      return;
    }
    toast.success(editing ? 'Investimento atualizado' : 'Investimento registrado');
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm());
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este investimento?')) return;
    const { error } = await supabase.from('structure_investments').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir');
      return;
    }
    toast.success('Investimento excluído');
    load();
  };

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setCategoryFilter(ALL);
    setSearch('');
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')} aria-label="Voltar">
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Hammer size={20} className="text-primary" />
            Investimentos em Estrutura
          </h1>
          <p className="text-xs text-muted-foreground">
            Reformas, mão de obra, materiais e equipamentos do escritório e das unidades
          </p>
        </div>
        <Button onClick={openNew} className="gap-1.5">
          <Plus size={16} />
          Novo
        </Button>
      </div>

      <FinancialQuickNav />

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 mb-4">
        <Info size={14} className="text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Registro apenas para controle patrimonial. <strong>Não gera despesa</strong> e não afeta o
          fluxo de caixa nem os relatórios financeiros.
        </p>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total no filtro</p>
            <p className="text-2xl font-bold text-primary">{currency(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total investido (geral)</p>
            <p className="text-2xl font-bold">{currency(totalGeral)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Registros</p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-4">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs flex items-center gap-1"><CalendarRange size={12} /> De</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Layers size={12} /> Categoria</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Descrição ou responsável" />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={clearFilters}>Limpar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Por categoria */}
      {byCategory.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {byCategory.map(c => (
            <Badge key={c.id} variant="secondary" className="text-xs">
              {c.name}: <span className="ml-1 font-semibold">{currency(c.value)}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Lista */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum investimento registrado neste filtro</TableCell></TableRow>
              )}
              {filtered.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {e.date ? e.date.split('-').reverse().join('/') : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{e.description || '—'}</TableCell>
                  <TableCell className="text-sm">{categoryLabel(e.category)}</TableCell>
                  <TableCell className="text-sm">{e.responsible || '—'}</TableCell>
                  <TableCell className="text-right font-semibold whitespace-nowrap">{currency(Number(e.amount || 0))}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(e)} aria-label="Editar">
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)} aria-label="Excluir">
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Investimento' : 'Novo Investimento em Estrutura'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" min={0} step={0.01} value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Ex: Reforma da recepção - mão de obra" />
            </div>
            <div>
              <Label>Responsável</Label>
              <Input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} placeholder="Quem executou/pagou" />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Registrar investimento'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
