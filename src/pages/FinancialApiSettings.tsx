import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Settings, Plus, Plug, PlugZap, Trash2, RefreshCw, Eye, EyeOff, Clock, AlertCircle,
  CheckCircle, XCircle, Loader2, History, Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface ApiIntegration {
  id: string;
  name: string;
  provider: string;
  api_type: string;
  endpoint_url: string;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
  config: any;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiLog {
  id: string;
  integration_id: string;
  action: string;
  status: string;
  details: any;
  performed_by: string | null;
  created_at: string;
}

const PROVIDERS = [
  { value: 'meta_ads', label: 'Meta Ads (Facebook/Instagram)', icon: '📊' },
  { value: 'google_ads', label: 'Google Ads', icon: '🔍' },
  { value: 'google_analytics', label: 'Google Analytics', icon: '📈' },
  { value: 'stripe', label: 'Stripe', icon: '💳' },
  { value: 'custom', label: 'API Personalizada', icon: '🔧' },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  ativo: { label: 'Ativo', color: 'text-emerald-500', icon: CheckCircle },
  inativo: { label: 'Inativo', color: 'text-muted-foreground', icon: XCircle },
  erro: { label: 'Erro', color: 'text-red-500', icon: AlertCircle },
  verificando: { label: 'Verificando...', color: 'text-amber-500', icon: RefreshCw },
};

export default function FinancialApiSettings() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<ApiIntegration | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    provider: 'meta_ads',
    api_type: 'rest',
    endpoint_url: '',
    notes: '',
    metaAppId: '',
    metaAppSecret: '',
    metaPageToken: '',
    metaIgBusinessId: '',
    metaPageId: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('api_integrations')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setIntegrations(data as ApiIntegration[]);
    setLoading(false);
  };

  const loadLogs = async (integrationId: string) => {
    const { data } = await supabase
      .from('api_integration_logs')
      .select('*')
      .eq('integration_id', integrationId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setLogs(data as ApiLog[]);
  };

  const handleSave = async () => {
    if (!form.name || !form.provider) {
      toast.error('Preencha nome e provedor');
      return;
    }
    const payload: any = {
      name: form.name,
      provider: form.provider,
      api_type: form.api_type,
      endpoint_url: form.endpoint_url,
      config: { notes: form.notes },
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      await supabase.from('api_integrations').update(payload).eq('id', editingId);
      // Log
      await supabase.from('api_integration_logs').insert({
        integration_id: editingId,
        action: 'atualização',
        status: 'success',
        details: { fields: Object.keys(payload) },
        performed_by: user?.id,
      } as any);
      toast.success('Integração atualizada');
    } else {
      payload.created_by = user?.id;
      const { data } = await supabase.from('api_integrations').insert(payload).select().single();
      if (data) {
        await supabase.from('api_integration_logs').insert({
          integration_id: (data as any).id,
          action: 'criação',
          status: 'success',
          details: { provider: form.provider },
          performed_by: user?.id,
        } as any);
      }
      toast.success('Integração criada');
    }

    setShowDialog(false);
    resetForm();
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta integração?')) return;
    await supabase.from('api_integrations').delete().eq('id', id);
    toast.success('Integração removida');
    loadData();
  };

  const handleToggleStatus = async (integration: ApiIntegration) => {
    const newStatus = integration.status === 'ativo' ? 'inativo' : 'ativo';
    await supabase.from('api_integrations').update({
      status: newStatus,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', integration.id);

    await supabase.from('api_integration_logs').insert({
      integration_id: integration.id,
      action: `status alterado para ${newStatus}`,
      status: 'success',
      performed_by: user?.id,
    } as any);

    toast.success(`Integração ${newStatus === 'ativo' ? 'ativada' : 'desativada'}`);
    loadData();
  };

  const handleEdit = (integration: ApiIntegration) => {
    setEditingId(integration.id);
    setForm({
      name: integration.name,
      provider: integration.provider,
      api_type: integration.api_type,
      endpoint_url: integration.endpoint_url || '',
      notes: integration.config?.notes || '',
    });
    setShowDialog(true);
  };

  const handleViewLogs = async (integration: ApiIntegration) => {
    setSelectedIntegration(integration);
    await loadLogs(integration.id);
    setShowLogsDialog(true);
  };

  const resetForm = () => {
    setForm({ name: '', provider: 'meta_ads', api_type: 'rest', endpoint_url: '', notes: '' });
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Settings className="text-primary" size={24} /> Gerenciamento de APIs
          </h1>
          <p className="text-sm text-muted-foreground">Configure e monitore integrações com serviços externos</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true); }}>
          <Plus size={16} className="mr-2" /> Nova Integração
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-primary">{integrations.length}</p>
          <p className="text-xs text-muted-foreground">Total APIs</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-500">{integrations.filter(i => i.status === 'ativo').length}</p>
          <p className="text-xs text-muted-foreground">Ativas</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{integrations.filter(i => i.status === 'erro').length}</p>
          <p className="text-xs text-muted-foreground">Com Erro</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{integrations.filter(i => i.status === 'inativo').length}</p>
          <p className="text-xs text-muted-foreground">Inativas</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground"><Loader2 className="animate-spin mx-auto" /></div>
      ) : integrations.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Plug size={40} className="mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhuma integração configurada</p>
          <p className="text-xs text-muted-foreground mt-1">Adicione sua primeira API para começar</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {integrations.map(integration => {
            const statusCfg = STATUS_MAP[integration.status] || STATUS_MAP.inativo;
            const StatusIcon = statusCfg.icon;
            const providerInfo = PROVIDERS.find(p => p.value === integration.provider);

            return (
              <div key={integration.id} className="glass-card p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">
                  {providerInfo?.icon || '🔌'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{integration.name}</p>
                    <Badge variant="outline" className={`text-[10px] ${statusCfg.color}`}>
                      <StatusIcon size={10} className="mr-1" /> {statusCfg.label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {providerInfo?.label || integration.provider}
                    {integration.last_checked_at && ` · Verificado ${format(new Date(integration.last_checked_at), "dd/MM HH:mm", { locale: pt })}`}
                  </p>
                  {integration.last_error && (
                    <p className="text-[10px] text-red-400 mt-0.5 truncate">⚠️ {integration.last_error}</p>
                  )}
                </div>

                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewLogs(integration)} title="Logs">
                    <History size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleStatus(integration)}
                    title={integration.status === 'ativo' ? 'Desativar' : 'Ativar'}>
                    {integration.status === 'ativo' ? <PlugZap size={14} className="text-emerald-500" /> : <Plug size={14} />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(integration)} title="Editar">
                    <Settings size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(integration.id)} title="Remover">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Integração' : 'Nova Integração'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Integração *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Meta Ads - Conta Principal" />
            </div>
            <div>
              <Label>Provedor *</Label>
              <Select value={form.provider} onValueChange={v => setForm({ ...form, provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="flex items-center gap-2">{p.icon} {p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de API</Label>
              <Select value={form.api_type} onValueChange={v => setForm({ ...form, api_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rest">REST API</SelectItem>
                  <SelectItem value="graphql">GraphQL</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Endpoint URL</Label>
              <Input value={form.endpoint_url} onChange={e => setForm({ ...form, endpoint_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Informações adicionais..." rows={2} />
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
              <AlertCircle size={12} className="inline mr-1" />
              Chaves de API e tokens são armazenados de forma segura no backend. Configure-os na seção de segredos do sistema.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History size={18} /> Logs - {selectedIntegration?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Nenhum log registrado</p>
            ) : (
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] ${log.status === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                        {log.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{log.action}</p>
                    {log.details && (
                      <p className="text-[11px] text-muted-foreground mt-1">{JSON.stringify(log.details)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
