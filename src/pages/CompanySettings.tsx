import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { DAY_LABELS } from '@/types';
import type { DayOfWeek } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Clock, CalendarClock, AlertTriangle, Trash2, Rocket } from 'lucide-react';
import { supabase } from '@/lib/vpsDb';
import { supabase as supabaseCloud } from '@/integrations/supabase/client';
import { ASSISTANT_KEY } from '@/components/ProductionAssistant';

const ALL_DAYS: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

const RESET_TABLES = [
  'active_recordings', 'billing_messages', 'cash_reserve_movements',
  'client_endomarketing_contracts', 'client_portal_comments', 'client_portal_contents',
  'content_tasks', 'delivery_records', 'design_task_history', 'design_tasks',
  'endomarketing_agendamentos', 'endomarketing_clientes', 'endomarketing_logs',
  'endomarketing_packages', 'endomarketing_partner_tasks', 'endomarketing_profissionais',
  'financial_activity_log', 'financial_contracts', 'goals', 'integration_logs',
  'kanban_tasks', 'notifications', 'onboarding_tasks', 'revenues', 'expenses',
  'recordings', 'scripts', 'social_media_deliveries', 'social_accounts', 'clients',
  // 'plans' e equipe (profiles, user_roles, partners) são preservados
] as const;

export default function CompanySettings() {
  const { settings, updateSettings, currentUser } = useApp();
  const [form, setForm] = useState(settings);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [assistantEnabled, setAssistantEnabled] = useState(() => localStorage.getItem(ASSISTANT_KEY) !== 'false');
  const [pixelId, setPixelId] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    supabaseCloud
      .from('landing_page_settings')
      .select('title')
      .eq('section', 'facebook_pixel')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.title) setPixelId(data.title);
      });
  }, []);

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

      {/* Assistente de Produção */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Rocket size={18} />
          <h2 className="text-base font-semibold">Assistente de Produção (Foguetinho)</h2>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
          <div>
            <p className="text-sm font-medium">Ativar assistente</p>
            <p className="text-[11px] text-muted-foreground">O Foguetinho monitora prazos e cobra a equipe de forma divertida</p>
          </div>
          <Switch
            checked={assistantEnabled}
            onCheckedChange={(checked) => {
              setAssistantEnabled(checked);
              localStorage.setItem(ASSISTANT_KEY, String(checked));
              toast.success(checked ? 'Assistente ativado' : 'Assistente desativado');
            }}
          />
        </div>
      </div>

      {/* Facebook Pixel */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          <h2 className="text-base font-semibold">Facebook Pixel</h2>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Configure o Pixel do Facebook para rastrear eventos da landing page (PageView, Lead, etc).
        </p>
        <div className="space-y-1.5 p-3 rounded-lg border border-border bg-muted/30">
          <Label className="text-sm font-medium">Pixel ID</Label>
          <Input
            value={pixelId}
            onChange={e => setPixelId(e.target.value)}
            placeholder="Ex: 123456789012345"
          />
          <p className="text-[11px] text-muted-foreground">
            Encontre seu Pixel ID em{' '}
            <a href="https://business.facebook.com/events_manager" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Meta Events Manager
            </a>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const { data: existing } = await supabase
                .from('landing_page_settings')
                .select('id')
                .eq('section', 'facebook_pixel')
                .maybeSingle();
              if (existing) {
                await supabase
                  .from('landing_page_settings')
                  .update({ title: pixelId || null, updated_at: new Date().toISOString() })
                  .eq('id', existing.id);
              } else {
                await supabase
                  .from('landing_page_settings')
                  .insert({ section: 'facebook_pixel', title: pixelId || null });
              }
              toast.success('Pixel salvo com sucesso!');
            } catch {
              toast.error('Erro ao salvar pixel');
            }
          }}
          className="gap-2"
        >
          Salvar Pixel
        </Button>
      </div>

      <Button onClick={handleSave} className="w-full">Salvar Configurações</Button>

      {/* Zona de Perigo — Admin Only */}
      {isAdmin && (
        <>
          {!showDangerZone ? (
            <Button
              variant="outline"
              className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setShowDangerZone(true)}
            >
              <AlertTriangle size={16} />
              Exibir Zona de Perigo
            </Button>
          ) : (
            <div className="glass-card p-6 space-y-4 border-2 border-destructive/40 bg-destructive/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertTriangle size={24} className="text-destructive" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-destructive">⚠️ ZONA DE PERIGO — Reset Total do Sistema</h2>
                  <p className="text-xs text-destructive/80">Esta ação é IRREVERSÍVEL e apagará TODOS os dados do sistema. <strong>Planos e Equipe serão preservados.</strong></p>
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
                  <li className="text-green-600">✅ Planos e Equipe serão <strong>preservados</strong></li>
                </ul>
                <p className="text-xs font-bold text-destructive mt-2">
                  ⚡ Use APENAS se deseja limpar completamente o sistema e começar do zero.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowDangerZone(false)}>
                  Ocultar
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="flex-1 gap-2 font-bold text-sm" size="lg">
                      <Trash2 size={18} />
                      RESETAR SISTEMA
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
                          Esta ação apagará PERMANENTEMENTE todos os dados do sistema.
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
