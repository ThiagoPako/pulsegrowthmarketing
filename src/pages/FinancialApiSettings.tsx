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
  CheckCircle, XCircle, Loader2, History, Zap, Info
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

const AI_PROVIDERS = [
  {
    value: 'gemini',
    label: 'Google Gemini',
    icon: '🔮',
    desc: 'IA do Google. Ótimo custo-benefício, suporte a texto e imagem.',
    keyName: 'GOOGLE_GEMINI_API_KEY',
    getKeyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    steps: [
      'Acesse <a href="https://aistudio.google.com/apikey" target="_blank" class="text-primary underline">Google AI Studio</a>',
      'Clique em <strong>"Create API Key"</strong>',
      'Copie a chave e cole abaixo',
    ],
    models: [
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', desc: 'Mais rápido e econômico' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Equilíbrio velocidade/qualidade' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Máxima qualidade e raciocínio' },
    ],
    defaultModel: 'gemini-2.5-flash-lite',
  },
  {
    value: 'openai',
    label: 'OpenAI (GPT)',
    icon: '🧠',
    desc: 'ChatGPT e GPT-4. Excelente raciocínio e precisão.',
    keyName: 'OPENAI_API_KEY',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
    steps: [
      'Acesse <a href="https://platform.openai.com/api-keys" target="_blank" class="text-primary underline">OpenAI Platform</a>',
      'Clique em <strong>"Create new secret key"</strong>',
      'Copie a chave e cole abaixo',
    ],
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Rápido e econômico' },
      { value: 'gpt-4o', label: 'GPT-4o', desc: 'Melhor custo-benefício' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: 'Alta performance' },
    ],
    defaultModel: 'gpt-4o-mini',
  },
  {
    value: 'claude',
    label: 'Anthropic Claude',
    icon: '🤖',
    desc: 'Claude da Anthropic. Excelente em textos longos e análise.',
    keyName: 'ANTHROPIC_API_KEY',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com',
    steps: [
      'Acesse <a href="https://console.anthropic.com/settings/keys" target="_blank" class="text-primary underline">Anthropic Console</a>',
      'Clique em <strong>"Create Key"</strong>',
      'Copie a chave e cole abaixo',
    ],
    models: [
      { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', desc: 'Mais rápido e barato' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', desc: 'Melhor equilíbrio' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus', desc: 'Máxima capacidade' },
    ],
    defaultModel: 'claude-3-haiku-20240307',
  },
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

  const [aiConfig, setAiConfig] = useState({
    model: 'google/gemini-2.5-flash-lite',
    active: false,
    integrationId: null as string | null,
  });

  const [form, setForm] = useState({
    name: '',
    provider: 'meta_ads',
    api_type: 'rest',
    endpoint_url: '',
    notes: '',
    metaAppId: '',
    metaAppSecret: '',
  });

  useEffect(() => { loadData(); loadAiConfig(); }, []);

  const loadAiConfig = async () => {
    const { data } = await supabase
      .from('api_integrations')
      .select('*')
      .eq('provider', 'lovable_ai')
      .limit(1)
      .single();
    if (data) {
      const d = data as any;
      setAiConfig({
        model: d.config?.ai_model || 'google/gemini-2.5-flash-lite',
        active: d.status === 'ativo',
        integrationId: d.id,
      });
    }
  };

  const handleSaveAiConfig = async (model: string) => {
    const payload: any = {
      name: 'Lovable AI',
      provider: 'lovable_ai',
      api_type: 'ai_gateway',
      endpoint_url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
      config: { ai_model: model },
      status: 'ativo',
      updated_at: new Date().toISOString(),
    };

    if (aiConfig.integrationId) {
      await supabase.from('api_integrations').update(payload).eq('id', aiConfig.integrationId);
    } else {
      payload.created_by = user?.id;
      const { data } = await supabase.from('api_integrations').insert(payload).select().single();
      if (data) setAiConfig(prev => ({ ...prev, integrationId: (data as any).id }));
    }
    setAiConfig(prev => ({ ...prev, model, active: true }));
    toast.success(`Modelo IA atualizado: ${AI_MODELS.find(m => m.value === model)?.label}`);
  };

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('api_integrations')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setIntegrations((data as ApiIntegration[]).filter(i => i.provider !== 'lovable_ai'));
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

  const storeMetaCredentialsSecurely = async (integrationId: string) => {
    const hasSecrets = form.metaAppSecret || form.metaAppId;
    if (!hasSecrets) return;

    try {
      const { data, error } = await supabase.functions.invoke('meta-store-credentials', {
        body: {
          integration_id: integrationId,
          meta_app_id: form.metaAppId || undefined,
          meta_app_secret: form.metaAppSecret || undefined,
        },
      });
      if (error) throw error;
      toast.success('Credenciais armazenadas com segurança no backend');
    } catch (err: any) {
      console.error('Error storing credentials:', err);
      toast.error('Erro ao armazenar credenciais: ' + (err.message || 'Erro desconhecido'));
    }
  };

  const handleTestConnection = async (integrationId: string) => {
    toast.info('Testando conexão com Meta...');
    try {
      const { data: integration } = await supabase
        .from('api_integrations')
        .select('config')
        .eq('id', integrationId)
        .single();

      const config = (integration as any)?.config;
      const token = config?.meta_page_token_encrypted || config?.meta_page_token;
      const igId = config?.meta_ig_business_id;

      if (!token || !igId) {
        toast.error('Credenciais incompletas');
        return;
      }

      const res = await fetch(`https://graph.facebook.com/v21.0/${igId}?fields=name,username,profile_picture_url&access_token=${token}`);
      const data = await res.json();

      if (data.error) {
        await supabase.from('api_integrations').update({
          status: 'erro',
          last_error: data.error.message,
          last_checked_at: new Date().toISOString(),
        } as any).eq('id', integrationId);
        toast.error('Erro: ' + data.error.message);
      } else {
        await supabase.from('api_integrations').update({
          status: 'ativo',
          last_error: null,
          last_checked_at: new Date().toISOString(),
        } as any).eq('id', integrationId);
        toast.success(`✅ Conectado: @${data.username || data.name}`);
      }

      await supabase.from('api_integration_logs').insert({
        integration_id: integrationId,
        action: 'teste de conexão',
        status: data.error ? 'error' : 'success',
        details: data.error ? { error: data.error.message } : { username: data.username, name: data.name },
        performed_by: user?.id,
      } as any);

      loadData();
    } catch (err: any) {
      toast.error('Falha no teste: ' + err.message);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.provider) {
      toast.error('Preencha nome e provedor');
      return;
    }
    if (form.provider === 'meta_ads' && !editingId) {
      if (!form.metaAppId || !form.metaAppSecret) {
        toast.error('Preencha App ID e App Secret');
        return;
      }
    }

    const configData: any = { notes: form.notes };
    if (form.provider === 'meta_ads') {
      configData.meta_app_id = form.metaAppId;
      if (form.metaAppSecret) configData.meta_app_secret = '••••' + form.metaAppSecret.slice(-4);
    }

    const payload: any = {
      name: form.name,
      provider: form.provider,
      api_type: form.api_type,
      endpoint_url: form.provider === 'meta_ads' ? 'https://graph.facebook.com/v21.0' : form.endpoint_url,
      config: configData,
      updated_at: new Date().toISOString(),
    };

    let savedId = editingId;

    if (editingId) {
      await supabase.from('api_integrations').update(payload).eq('id', editingId);
      await supabase.from('api_integration_logs').insert({
        integration_id: editingId,
        action: 'atualização',
        status: 'success',
        details: { fields: Object.keys(payload) },
        performed_by: user?.id,
      } as any);
    } else {
      payload.created_by = user?.id;
      const { data } = await supabase.from('api_integrations').insert(payload).select().single();
      if (data) {
        savedId = (data as any).id;
        await supabase.from('api_integration_logs').insert({
          integration_id: savedId,
          action: 'criação',
          status: 'success',
          details: { provider: form.provider },
          performed_by: user?.id,
        } as any);
      }
    }

    // Store sensitive credentials via secure edge function
    if (form.provider === 'meta_ads' && savedId) {
      await storeMetaCredentialsSecurely(savedId);
    }

    toast.success(editingId ? 'Integração atualizada' : 'Integração criada');
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
      metaAppId: integration.config?.meta_app_id || '',
      metaAppSecret: '',
    });
    setShowDialog(true);
  };

  const handleViewLogs = async (integration: ApiIntegration) => {
    setSelectedIntegration(integration);
    await loadLogs(integration.id);
    setShowLogsDialog(true);
  };

  const resetForm = () => {
    setForm({ name: '', provider: 'meta_ads', api_type: 'rest', endpoint_url: '', notes: '', metaAppId: '', metaAppSecret: '' });
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

      {/* AI Model Configuration */}
      <div className="glass-card p-5 border border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">🤖</div>
            <div>
              <h3 className="font-semibold text-sm">Inteligência Artificial (Gemini)</h3>
              <p className="text-[11px] text-muted-foreground">Modelo usado para gerar roteiros, legendas e chat financeiro</p>
            </div>
          </div>
          <Badge variant="outline" className={aiConfig.active ? 'text-emerald-500' : 'text-muted-foreground'}>
            {aiConfig.active ? '● Ativo' : '○ Inativo'}
          </Badge>
        </div>

        {/* Setup Tutorial */}
        <div className="p-4 rounded-lg bg-muted/50 border border-border mb-4">
          <p className="text-xs font-semibold mb-2 flex items-center gap-1">📘 Como configurar a IA (para VPS/Self-Hosted)</p>
          <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>Acesse <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">Google AI Studio → API Keys</a></li>
            <li>Clique em <strong>"Create API Key"</strong> e copie a chave gerada</li>
            <li>No seu servidor (VPS), adicione a variável de ambiente: <code className="bg-background px-1 py-0.5 rounded text-[10px]">GOOGLE_GEMINI_API_KEY=sua_chave_aqui</code></li>
            <li>Reinicie as Edge Functions do Supabase</li>
          </ol>
          <div className="mt-3 p-2 rounded bg-primary/5 border border-primary/10">
            <p className="text-[10px] text-muted-foreground">
              <strong className="text-foreground">💡 Nota:</strong> Na Lovable, o sistema usa automaticamente a <code className="bg-background px-1 rounded">LOVABLE_API_KEY</code>. 
              Em ambientes externos (VPS, Docker), configure a <code className="bg-background px-1 rounded">GOOGLE_GEMINI_API_KEY</code> como secret no Supabase. 
              O sistema detecta qual chave está disponível e usa automaticamente.
            </p>
          </div>
          <div className="flex gap-2 mt-3">
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="text-[11px] h-7">
                <Zap size={12} className="mr-1" /> Obter API Key
              </Button>
            </a>
            <a href="https://ai.google.dev/gemini-api/docs" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="text-[11px] h-7">
                <Info size={12} className="mr-1" /> Documentação
              </Button>
            </a>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {AI_MODELS.map(model => (
            <button
              key={model.value}
              onClick={() => handleSaveAiConfig(model.value)}
              className={`p-3 rounded-lg border text-left transition-all ${
                aiConfig.model === model.value
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <p className="text-sm font-medium">{model.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{model.desc}</p>
              {aiConfig.model === model.value && (
                <Badge className="mt-2 text-[10px]" variant="default">Selecionado</Badge>
              )}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1">
          <Info size={11} /> O modelo selecionado será usado automaticamente em todas as funcionalidades de IA do sistema.
        </p>
      </div>

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
                  {integration.provider === 'meta_ads' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTestConnection(integration.id)} title="Testar Conexão">
                      <Zap size={14} className="text-primary" />
                    </Button>
                  )}
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
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(integration.id)} title="Remover">
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

            {/* Meta-specific fields - Only App ID and Secret (global config) */}
            {form.provider === 'meta_ads' && (
              <>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs font-medium text-primary mb-3">📊 Configuração Global do App Meta</p>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">App ID *</Label>
                      <Input value={form.metaAppId} onChange={e => setForm({ ...form, metaAppId: e.target.value })} placeholder="Ex: 1234567890" />
                    </div>
                    <div>
                      <Label className="text-xs">App Secret *</Label>
                      <Input type="password" value={form.metaAppSecret} onChange={e => setForm({ ...form, metaAppSecret: e.target.value })} placeholder={editingId ? 'Deixe em branco para manter' : 'Ex: abc123def456...'} />
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                  <Info size={12} className="inline mr-1" />
                  Configure apenas App ID e App Secret aqui. As contas (Facebook Pages, Instagram) serão conectadas automaticamente via OAuth no cadastro de cada cliente.
                </div>
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  <AlertCircle size={12} className="inline mr-1" />
                  O App Secret será armazenado de forma segura no backend. Apenas os últimos 4 caracteres ficam visíveis.
                </div>
              </>
            )}

            {/* Generic fields for other providers */}
            {form.provider !== 'meta_ads' && (
              <>
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
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  <AlertCircle size={12} className="inline mr-1" />
                  Chaves de API e tokens são armazenados de forma segura no backend.
                </div>
              </>
            )}

            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Informações adicionais..." rows={2} />
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
