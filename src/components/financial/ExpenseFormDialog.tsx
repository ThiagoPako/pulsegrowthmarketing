import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Users, Calendar, Star } from 'lucide-react';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';
import type { Expense, ExpenseCategory } from '@/hooks/useFinancialData';

interface TeamMember {
  id: string;
  name: string;
  display_name?: string;
  role: string;
}

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
  editingExpense: Expense | null;
  onSave: (form: any, editingId: string | null) => Promise<void>;
}

const emptyForm = { date: new Date().toISOString().split('T')[0], amount: 0, category_id: '', expense_type: 'fixa', description: '', responsible: '' };

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  videomaker: 'Videomaker',
  social_media: 'Social Media',
  designer: 'Designer',
  fotografo: 'Fotógrafo',
  endomarketing: 'Endomarketing',
  parceiro: 'Parceiro',
};

export default function ExpenseFormDialog({ open, onOpenChange, categories, editingExpense, onSave }: ExpenseFormDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [isSalaryMode, setIsSalaryMode] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState('');

  // Load team members
  useEffect(() => {
    supabase.from('profiles').select('id, name, display_name, role').then(({ data }) => {
      if (data) setTeamMembers(data);
    });
  }, []);

  // Find salary category
  const salaryCategory = useMemo(() => categories.find(c => c.name.toLowerCase() === 'salários'), [categories]);

  // Populate form when editing
  useEffect(() => {
    if (editingExpense) {
      setForm({
        date: editingExpense.date,
        amount: editingExpense.amount,
        category_id: editingExpense.category_id,
        expense_type: editingExpense.expense_type,
        description: editingExpense.description,
        responsible: editingExpense.responsible,
      });
      if (salaryCategory && editingExpense.category_id === salaryCategory.id) {
        setIsSalaryMode(true);
      }
    } else {
      setForm(emptyForm);
      setIsSalaryMode(false);
      setSelectedMember('');
    }
  }, [editingExpense, salaryCategory]);

  // When toggling salary mode
  useEffect(() => {
    if (isSalaryMode && salaryCategory) {
      setForm(f => ({ ...f, category_id: salaryCategory.id, expense_type: 'fixa' }));
    }
  }, [isSalaryMode, salaryCategory]);

  // When selecting a team member
  const handleMemberSelect = (memberId: string) => {
    setSelectedMember(memberId);
    const member = teamMembers.find(m => m.id === memberId);
    if (member) {
      const displayName = member.display_name || member.name;
      const roleLabel = ROLE_LABELS[member.role] || member.role;
      setForm(f => ({
        ...f,
        responsible: displayName,
        description: `Salário - ${displayName} (${roleLabel})`,
      }));
    }
  };

  // Quick date helpers
  const setQuickDate = (day: number) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    // If we're past the day already, use current month still (user might be registering)
    const d = new Date(year, month, day);
    setForm(f => ({ ...f, date: d.toISOString().split('T')[0] }));
  };

  const handleSave = async () => {
    if (!form.category_id || !form.amount) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    try {
      await onSave(form, editingExpense?.id || null);
      onOpenChange(false);
      setForm(emptyForm);
      setIsSalaryMode(false);
      setSelectedMember('');
    } catch (err) {
      console.error('[ExpenseFormDialog] save error:', err);
    }
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setForm(emptyForm);
      setIsSalaryMode(false);
      setSelectedMember('');
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingExpense ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Salary mode toggle */}
          {salaryCategory && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-primary" />
                <span className="text-sm font-medium">Cadastrar Salário</span>
              </div>
              <Switch checked={isSalaryMode} onCheckedChange={setIsSalaryMode} />
            </div>
          )}

          {/* Team member selector (salary mode) */}
          {isSalaryMode && (
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5">
                <Users size={14} />
                Membro da Equipe
              </Label>
              <Select value={selectedMember} onValueChange={handleMemberSelect}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {teamMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        {m.display_name || m.name}
                        <Badge variant="outline" className="text-[10px] ml-1">{ROLE_LABELS[m.role] || m.role}</Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quick date buttons */}
          <div>
            <Label className="flex items-center gap-1.5 mb-1.5">
              <Calendar size={14} />
              Data de Pagamento
            </Label>
            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                size="sm"
                variant={form.date.endsWith('-10') ? 'default' : 'outline'}
                className="flex-1 gap-1"
                onClick={() => setQuickDate(10)}
              >
                <Star size={12} className="text-amber-500" />
                Dia 10
                <Badge variant="secondary" className="text-[9px] ml-1">Principal</Badge>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.date.endsWith('-20') ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setQuickDate(20)}
              >
                Dia 20
              </Button>
            </div>
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <p className="text-[10px] text-muted-foreground mt-1">
              💡 Dia 10 é a data principal de pagamentos. Dia 20 é a data secundária.
            </p>
          </div>

          {/* Amount */}
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" min={0} step={0.01} value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} placeholder="0,00" />
          </div>

          {/* Category & Type (hidden category if salary mode) */}
          <div className="grid grid-cols-2 gap-3">
            {!isSalaryMode && (
              <div>
                <Label>Categoria</Label>
                <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className={isSalaryMode ? 'col-span-2' : ''}>
              <Label>Tipo</Label>
              <Select value={form.expense_type} onValueChange={v => setForm({ ...form, expense_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixa">Fixa</SelectItem>
                  <SelectItem value="variavel">Variável</SelectItem>
                  <SelectItem value="pontual">Pontual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div>
            <Label>Descrição</Label>
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={isSalaryMode ? 'Ex: Salário referente março/2026' : 'Descrição da despesa'} />
          </div>

          {/* Responsible (auto-filled in salary mode) */}
          {!isSalaryMode && (
            <div>
              <Label>Responsável</Label>
              <Input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} placeholder="Quem é responsável" />
            </div>
          )}

          <Button className="w-full" onClick={handleSave}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
