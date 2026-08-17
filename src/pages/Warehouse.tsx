import { useState, useEffect, useMemo } from 'react';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package, Search, Plus, User, Tag, ClipboardList, 
  Trash2, Pencil, CheckCircle, AlertTriangle, 
  Hammer, Wrench, History, ArrowRightLeft, 
  ArrowUpRight, ArrowDownLeft 
} from 'lucide-react';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WarehouseItem {
  id: string;
  name: string;
  type: string;
  tag_id: string;
  responsible_id: string;
  status: 'em_uso' | 'manutencao' | 'disponivel' | 'descartado';
  purchase_date: string;
  purchase_price: number;
  expense_id?: string;
  observations: string;
  created_at: string;
}

interface WarehouseMovement {
  id: string;
  item_id: string;
  type: 'entrada' | 'saida' | 'transferencia' | 'manutencao';
  from_responsible_id?: string;
  to_responsible_id?: string;
  observations: string;
  movement_date: string;
  created_at: string;
  item?: WarehouseItem;
}

const ITEM_TYPES = ['Equipamento', 'Mobiliário', 'Ferramenta', 'Eletrônico', 'Veículo', 'Outros'];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  em_uso: { label: 'Em Uso', color: 'bg-blue-500' },
  manutencao: { label: 'Manutenção', color: 'bg-amber-500' },
  disponivel: { label: 'Disponível', color: 'bg-emerald-500' },
  descartado: { label: 'Descartado', color: 'bg-slate-500' },
};

export default function Warehouse() {
  const { users } = useApp();
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [movements, setMovements] = useState<WarehouseMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);
  
  const [form, setForm] = useState({
    name: '',
    type: 'Equipamento',
    tag_id: '',
    responsible_id: '',
    status: 'disponivel',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_price: 0,
    observations: '',
  });

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('warehouse_items').select('*').order('created_at', { ascending: false });
    if (data) setItems(data as WarehouseItem[]);
    if (error) toast.error('Erro ao carregar almoxerifado');
    
    const { data: movs, error: movErr } = await supabase.from('warehouse_movements').select('*, item:warehouse_items(*)').order('created_at', { ascending: false });
    if (movs) setMovements(movs as WarehouseMovement[]);
    
    setLoading(false);
  };

  useMemo(() => fetchItems(), []);

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    i.tag_id?.toLowerCase().includes(search.toLowerCase()) ||
    i.type.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.name || !form.type) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    const payload = { ...form };
    let error;

    if (editingItem) {
      // Check if status or responsible changed to record a movement
      const statusChanged = editingItem.status !== form.status;
      const responsibleChanged = editingItem.responsible_id !== form.responsible_id;

      const res = await supabase.from('warehouse_items').update(payload as any).eq('id', editingItem.id);
      error = res.error;

      if (!error && (statusChanged || responsibleChanged)) {
        await supabase.from('warehouse_movements').insert({
          item_id: editingItem.id,
          type: responsibleChanged ? 'transferencia' : (form.status === 'manutencao' ? 'manutencao' : 'entrada'),
          from_responsible_id: editingItem.responsible_id,
          to_responsible_id: form.responsible_id,
          observations: `Alteração manual: ${statusChanged ? `Status ${editingItem.status} -> ${form.status}` : ''} ${responsibleChanged ? 'Responsável alterado' : ''}`,
          movement_date: new Date().toISOString().split('T')[0]
        } as any);
      }
    } else {
      const res = await supabase.from('warehouse_items').insert(payload as any).select();
      error = res.error;
      
      if (!error && res.data?.[0]) {
        await supabase.from('warehouse_movements').insert({
          item_id: res.data[0].id,
          type: 'entrada',
          to_responsible_id: form.responsible_id,
          observations: 'Entrada inicial no sistema',
          movement_date: new Date().toISOString().split('T')[0]
        } as any);
      }
    }

    if (!error) {
      toast.success(editingItem ? 'Item atualizado' : 'Item cadastrado');
      setOpen(false);
      setEditingItem(null);
      setForm({ name: '', type: 'Equipamento', tag_id: '', responsible_id: '', status: 'disponivel', purchase_date: new Date().toISOString().split('T')[0], purchase_price: 0, observations: '' });
      fetchItems();
    } else {
      toast.error('Erro ao salvar item');
    }
  };

  const handleEdit = (item: WarehouseItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      type: item.type,
      tag_id: item.tag_id || '',
      responsible_id: item.responsible_id || '',
      status: item.status,
      purchase_date: item.purchase_date || new Date().toISOString().split('T')[0],
      purchase_price: item.purchase_price || 0,
      observations: item.observations || '',
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este item do almoxerifado?')) return;
    const { error } = await supabase.from('warehouse_items').delete().eq('id', id);
    if (!error) {
      toast.success('Item excluído');
      fetchItems();
    } else {
      toast.error('Erro ao excluir item');
    }
  };

  const getResponsibleName = (id: string) => {
    const user = users.find(u => u.id === id);
    return user ? (user.displayName || user.name) : 'Não atribuído';
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="text-primary" />
            Almoxerifado
          </h1>
          <p className="text-muted-foreground text-sm">Gestão de ativos e equipamentos da empresa</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar item ou tag..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setEditingItem(null); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus size={16} /> Novo Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingItem ? 'Editar Item' : 'Cadastrar Item no Almoxerifado'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Nome do Item *</Label>
                  <Input 
                    value={form.name} 
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Câmera Sony A7III, Mesa de Escritório"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo *</Label>
                    <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Identificação (Tag/Patrimônio)</Label>
                    <Input 
                      value={form.tag_id} 
                      onChange={e => setForm({ ...form, tag_id: e.target.value })}
                      placeholder="Ex: PULSE-001"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Select value={form.responsible_id} onValueChange={v => setForm({ ...form, responsible_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {users.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.displayName || u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data de Compra</Label>
                    <Input 
                      type="date"
                      value={form.purchase_date} 
                      onChange={e => setForm({ ...form, purchase_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor de Aquisição (R$)</Label>
                    <Input 
                      type="number"
                      value={form.purchase_price} 
                      onChange={e => setForm({ ...form, purchase_price: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Input 
                    value={form.observations} 
                    onChange={e => setForm({ ...form, observations: e.target.value })}
                    placeholder="Detalhes extras, serial number, etc."
                  />
                </div>
                <Button onClick={handleSave} className="w-full mt-2">
                  {editingItem ? 'Atualizar Item' : 'Salvar Item'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="items" className="space-y-6">
        <TabsList>
          <TabsTrigger value="items" className="gap-2">
            <Package size={16} /> Itens
          </TabsTrigger>
          <TabsTrigger value="movements" className="gap-2">
            <History size={16} /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package size={16} className="text-blue-500" /> Total de Itens
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{items.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-500" /> Disponíveis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{items.filter(i => i.status === 'disponivel').length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ClipboardList size={16} className="text-blue-500" /> Em Uso
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{items.filter(i => i.status === 'em_uso').length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" /> Manutenção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{items.filter(i => i.status === 'manutencao').length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item / Tag</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Compra</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando almoxerifado...</TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum item encontrado.</TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.name}</div>
                          {item.tag_id && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase font-mono">
                              <Tag size={10} /> {item.tag_id}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">{item.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${STATUS_LABELS[item.status].color}`} />
                            <span className="text-xs">{STATUS_LABELS[item.status].label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs">
                            <User size={12} className="text-muted-foreground" />
                            {getResponsibleName(item.responsible_id)}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.purchase_date ? format(new Date(item.purchase_date), 'dd/MM/yyyy') : '—'}
                          <div className="font-medium text-foreground">
                            {item.purchase_price ? item.purchase_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)} className="h-8 w-8">
                              <Pencil size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="h-8 w-8 text-destructive">
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>De / Para</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando histórico...</TableCell>
                    </TableRow>
                  ) : movements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma movimentação registrada.</TableCell>
                    </TableRow>
                  ) : (
                    movements.map(mov => (
                      <TableRow key={mov.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(mov.movement_date), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-xs">{mov.item?.name || 'Item Excluído'}</div>
                          {mov.item?.tag_id && <span className="text-[10px] text-muted-foreground uppercase">{mov.item.tag_id}</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {mov.type === 'entrada' && <ArrowDownLeft size={12} className="text-emerald-500" />}
                            {mov.type === 'saida' && <ArrowUpRight size={12} className="text-rose-500" />}
                            {mov.type === 'transferencia' && <ArrowRightLeft size={12} className="text-blue-500" />}
                            {mov.type === 'manutencao' && <Wrench size={12} className="text-amber-500" />}
                            <span className="text-xs capitalize">{mov.type}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-[10px] gap-0.5">
                            {mov.from_responsible_id && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <span className="w-8">De:</span> {getResponsibleName(mov.from_responsible_id)}
                              </div>
                            )}
                            <div className="flex items-center gap-1 font-medium">
                              <span className="w-8 text-muted-foreground font-normal">Para:</span> {getResponsibleName(mov.to_responsible_id || '')}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground max-w-[200px] truncate">
                          {mov.observations}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}