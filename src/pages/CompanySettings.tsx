import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { DAY_LABELS } from '@/types';
import type { DayOfWeek } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Clock, CalendarClock, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ALL_DAYS: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

const RESET_TABLES = [
  'active_recordings', 'billing_messages', 'cash_reserve_movements',
  'client_endomarketing_contracts', 'client_portal_comments', 'client_portal_contents',
  'content_tasks', 'delivery_records', 'design_task_history', 'design_tasks',
  'endomarketing_agendamentos', 'endomarketing_clientes', 'endomarketing_logs',
  'endomarketing_packages', 'endomarketing_partner_tasks', 'endomarketing_profissionais',
  'financial_activity_log', 'financial_contracts', 'goals', 'integration_logs',
  'kanban_tasks', 'notifications', 'onboarding_tasks', 'revenues', 'expenses',
  'recordings', 'scripts', 'social_media_deliveries', 'social_accounts', 'clients', 'plans', 'partners',
] as const;

export default function CompanySettings() {
  const { settings, updateSettings, currentUser } = useApp();
  const [form, setForm] = useState(settings);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const handleSystemReset = async () => {
    if (confirmText !== 'RESETAR TUDO') return;
    setResetting(true);
    try {
      for (const table of RESET_TABLES) {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) console.error(`Erro ao limpar ${table}:`, error.message);
      }
      toast.success('Sistema resetado com sucesso. Todos os dados foram removidos.');
      setConfirmText('');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error('Erro ao resetar o sistema.');
    } finally {
      setResetting(false);
    }
  };

  const toggleDay = (day: DayOfWeek) => {
    const days = form.workDays.includes(day) ? form.workDays.filter(d => d !== day) : [...form.workDays, day];
    setForm({ ...form, workDays: days });
  };

  const handleSave = () => {
    updateSettings(form);
    toast.success('Configurações salvas');
  };

  const formatDeadlineLabel = (hours: number) => {
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const remaining = hours % 24;
    return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`;
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-display font-bold">Configurações</h1>

      {/* Reset do Sistema — Admin Only (Topo para fácil acesso) */}
      {isAdmin && (
        <div className="glass-card p-6 space-y-4 border-2 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle size={24} className="text-destructive" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-destructive">⚠️ ZONA DE PERIGO — Reset Total do Sistema</h2>
              <p className="text-xs text-destructive/80">Esta ação é IRREVERSÍVEL e apagará TODOS os dados do sistema.</p>
            </div>
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 space-y-2">
            <p className="text-sm font-semibold text-destructive">O que será apagado:</p>
            <ul className="text-xs text-destructive/90 space-y-1 list-disc list-inside">
              <li>Todos os clientes, gravações, roteiros e tarefas</li>
              <li>Todo o conteúdo do portal do cliente</li>
              <li>Todos os contratos e dados financeiros</li>
              <li>Todas as entregas, metas e relatórios</li>
              <li>Todos os dados de endomarketing</li>
              <li>Todas as notificações e logs</li>
              <li>Todos os planos e parceiros</li>
            </ul>
            <p className="text-xs font-bold text-destructive mt-2">
              ⚡ Use APENAS se deseja limpar completamente o sistema e começar do zero.
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full gap-2 font-bold text-sm" size="lg">
                <Trash2 size={18} />
                RESETAR TODO O SISTEMA (WIPE COMPLETO)
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle size={20} />
                  Confirmação de Reset Total
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <span className="block font-semibold text-destructive">
                    Esta ação apagará PERMANENTEMENTE todos os dados do sistema. Não será possível recuperar nenhuma informação após esta operação.
                  </span>
                  <span className="block text-sm">
                    Para confirmar, digite <strong className="text-destructive">RESETAR TUDO</strong> no campo abaixo:
                  </span>
                  <Input
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="Digite RESETAR TUDO"
                    className="border-destructive/50 focus:border-destructive"
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmText('')}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleSystemReset}
                  disabled={confirmText !== 'RESETAR TUDO' || resetting}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                >
                  {resetting ? 'Resetando...' : 'CONFIRMAR RESET'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Turnos e Expediente */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <Clock size={18} />
          <h2 className="text-base font-semibold">Turnos e Expediente</h2>
        </div>

        {/* Turno A */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-primary">Turno A (Manhã)</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Início</Label>
              <Input type="time" value={form.shiftAStart} onChange={e => setForm({ ...form, shiftAStart: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Fim</Label>
              <Input type="time" value={form.shiftAEnd} onChange={e => setForm({ ...form, shiftAEnd: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Turno B */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-primary">Turno B (Tarde)</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Início</Label>
              <Input type="time" value={form.shiftBStart} onChange={e => setForm({ ...form, shiftBStart: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Fim</Label>
              <Input type="time" value={form.shiftBEnd} onChange={e => setForm({ ...form, shiftBEnd: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Dias de Funcionamento</Label>
          <div className="grid grid-cols-2 gap-2">
            {ALL_DAYS.map(day => (
              <label key={day} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.workDays.includes(day)} onCheckedChange={() => toggleDay(day)} />
                <span className="text-sm">{DAY_LABELS[day]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Duração da Gravação (minutos)</Label>
          <Input
            type="number"
            min={30}
            max={480}
            step={15}
            value={form.recordingDuration}
            onChange={e => setForm({ ...form, recordingDuration: Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">Duração padrão de cada sessão de gravação</p>
        </div>
      </div>

      {/* Prazos de Tarefas */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <CalendarClock size={18} />
          <h2 className="text-base font-semibold">Prazos de Tarefas</h2>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Defina os prazos automáticos para cada etapa do fluxo de produção de conteúdo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Editing Deadline */}
          <div className="space-y-1.5 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">🎬 Prazo de Edição</Label>
              <span className="text-xs font-mono text-primary font-semibold">{formatDeadlineLabel(form.editingDeadlineHours)}</span>
            </div>
            <Input
              type="number"
              min={1}
              max={720}
              value={form.editingDeadlineHours}
              onChange={e => setForm({ ...form, editingDeadlineHours: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">
              Tempo para o editor concluir a edição após receber o material
            </p>
          </div>

          {/* Review Deadline */}
          <div className="space-y-1.5 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">👁 Prazo de Revisão</Label>
              <span className="text-xs font-mono text-primary font-semibold">{formatDeadlineLabel(form.reviewDeadlineHours)}</span>
            </div>
            <Input
              type="number"
              min={1}
              max={720}
              value={form.reviewDeadlineHours}
              onChange={e => setForm({ ...form, reviewDeadlineHours: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">
              Tempo para a social media revisar o conteúdo editado
            </p>
          </div>

          {/* Alteration Deadline */}
          <div className="space-y-1.5 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">✏️ Prazo de Alteração</Label>
              <span className="text-xs font-mono text-primary font-semibold">{formatDeadlineLabel(form.alterationDeadlineHours)}</span>
            </div>
            <Input
              type="number"
              min={1}
              max={720}
              value={form.alterationDeadlineHours}
              onChange={e => setForm({ ...form, alterationDeadlineHours: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">
              Tempo para o editor aplicar os ajustes solicitados
            </p>
          </div>

          {/* Approval Deadline */}
          <div className="space-y-1.5 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">✅ Prazo de Aprovação</Label>
              <span className="text-xs font-mono text-primary font-semibold">{formatDeadlineLabel(form.approvalDeadlineHours)}</span>
            </div>
            <Input
              type="number"
              min={1}
              max={720}
              value={form.approvalDeadlineHours}
              onChange={e => setForm({ ...form, approvalDeadlineHours: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">
              Tempo para o cliente aprovar o conteúdo enviado
            </p>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} className="w-full">Salvar Configurações</Button>
    </div>
  );
}
