import { useState, useEffect } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Input as InputBase } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Share2, Save, Loader2, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * Card de configuração da integração Meta (Instagram/Facebook) para postagens automáticas.
 * Salva as credenciais do App Meta da agência na tabela api_integrations (provider = 'meta_ads'),
 * usada pelo backend da VPS para gerar os links de conexão dos clientes.
 */
export default function MetaIntegrationCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [form, setForm] = useState({
    metaAppId: '',
    metaAppSecret: '',
    instagramAppId: '',
    instagramAppSecret: '',
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('api_integrations')
        .select('*')
        .eq('provider', 'meta_ads')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) {
        const d = data as any;
        setIntegrationId(d.id);
        setConfigured(d.status === 'ativo' && !!d.config?.meta_app_id);
        setForm({
          metaAppId: d.config?.meta_app_id || '',
          metaAppSecret: '',
          instagramAppId: d.config?.instagram_app_id || '',
          instagramAppSecret: '',
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!form.metaAppId.trim()) {
      toast.error('Preencha o App ID da Meta');
      return;
    }
    setSaving(true);
    try {
      const configData: any = {
        meta_app_id: form.metaAppId.trim(),
        instagram_app_id: form.instagramAppId.trim() || undefined,
      };

      const payload: any = {
        name: 'Meta (Postagens Automáticas)',
        provider: 'meta_ads',
        api_type: 'rest',
        endpoint_url: 'https://graph.facebook.com/v21.0',
        config: configData,
        status: 'ativo',
        updated_at: new Date().toISOString(),
      };

      let savedId = integrationId;
      if (integrationId) {
        // Merge with existing config to preserve other keys (tokens, etc.)
        const { data: current } = await supabase.from('api_integrations').select('config').eq('id', integrationId).single();
        payload.config = { ...((current as any)?.config || {}), ...configData };
        await supabase.from('api_integrations').update(payload).eq('id', integrationId);
      } else {
        const { data } = await supabase.from('api_integrations').insert(payload).select().single();
        if (data) savedId = (data as any).id;
      }

      // Armazena os secrets completos no backend (nunca exibidos no frontend)
      if (savedId && (form.metaAppSecret.trim() || form.instagramAppSecret.trim())) {
        const { error } = await supabase.functions.invoke('meta-store-credentials', {
          body: {
            integration_id: savedId,
            meta_app_secret: form.metaAppSecret.trim() || undefined,
            instagram_app_secret: form.instagramAppSecret.trim() || undefined,
          },
        });
        if (error) throw error;
      }

      setIntegrationId(savedId);
      setConfigured(true);
      setForm(f => ({ ...f, metaAppSecret: '', instagramAppSecret: '' }));
      toast.success('Integração Meta salva e ativada');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const secretType = showSecrets ? 'text' : 'password';

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Share2 size={18} />
          <h2 className="font-semibold">Integração Meta (Postagens Automáticas)</h2>
        </div>
        {!loading && (
          <Badge variant="outline" className={configured ? 'text-emerald-500 border-emerald-500/30' : 'text-amber-500 border-amber-500/30'}>
            {configured ? <><CheckCircle size={11} className="mr-1" /> Configurado</> : <><AlertCircle size={11} className="mr-1" /> Pendente</>}
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Credenciais do App Meta da agência (um único app para todos os clientes). Usadas para gerar o botão
        "Conectar Instagram" no cadastro de clientes e publicar automaticamente.
        Crie/edite o app em <span className="font-mono">developers.facebook.com</span> com os produtos
        <strong> Login do Instagram</strong> e permissões <span className="font-mono">instagram_business_basic</span> e{' '}
        <span className="font-mono">instagram_business_content_publish</span>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">App ID (Meta)</Label>
          <Input
            value={form.metaAppId}
            onChange={e => setForm({ ...form, metaAppId: e.target.value })}
            placeholder="Ex: 4269428196659273"
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">App Secret (Meta)</Label>
          <Input
            type={secretType}
            value={form.metaAppSecret}
            onChange={e => setForm({ ...form, metaAppSecret: e.target.value })}
            placeholder={integrationId ? 'Deixe vazio para manter o atual' : 'Cole o App Secret'}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Instagram App ID (opcional)</Label>
          <Input
            value={form.instagramAppId}
            onChange={e => setForm({ ...form, instagramAppId: e.target.value })}
            placeholder="Se for um app separado do Instagram"
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Instagram App Secret (opcional)</Label>
          <Input
            type={secretType}
            value={form.instagramAppSecret}
            onChange={e => setForm({ ...form, instagramAppSecret: e.target.value })}
            placeholder={integrationId ? 'Deixe vazio para manter o atual' : 'Cole o secret do Instagram'}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowSecrets(s => !s)} className="text-xs">
          {showSecrets ? <EyeOff size={13} className="mr-1" /> : <Eye size={13} className="mr-1" />}
          {showSecrets ? 'Ocultar secrets' : 'Mostrar secrets'}
        </Button>
        <Button onClick={handleSave} disabled={saving || loading} size="sm">
          {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
          Salvar Integração Meta
        </Button>
      </div>
    </div>
  );
}
