import { useState, useEffect } from 'react';
import { supabase } from '@/lib/vpsDb';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Share2, Save, Loader2, Eye, EyeOff, CheckCircle, AlertCircle, Stethoscope } from 'lucide-react';

interface MetaDiagnosis {
  redirect_uri: string;
  active_rows: number;
  instagram_app_id: string;
  instagram_app_id_source: string;
  instagram_secret: string;
  meta_secret: string;
  secret_used: string;
  secret_used_source: string;
  secret_check: { status: 'ok' | 'invalid' | 'inconclusive' | 'skipped'; message: string };
}

/**
 * Card de configuração da integração Meta (Instagram/Facebook) para postagens automáticas.
 * Lê e salva pela rota /api/meta-integration (só admin), na mesma linha de api_integrations
 * (provider = 'meta_ads') que o servidor usa no OAuth. Não passa pelo /api/db/query, que filtra
 * pela cidade (em Uruaçu o card mostrava "Pendente" e salvar criava uma segunda integração).
 */
export default function MetaIntegrationCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diag, setDiag] = useState<MetaDiagnosis | null>(null);
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
      const { data, error } = await invokeVpsFunction('meta-integration', { method: 'GET' });
      if (error) {
        toast.error('Erro ao carregar a Integração Meta: ' + error.message);
      } else if (data?.id) {
        setIntegrationId(data.id);
        setConfigured(!!data.configured);
        setForm({
          metaAppId: data.meta_app_id || '',
          metaAppSecret: '',
          instagramAppId: data.instagram_app_id || '',
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
    // App Secrets são 32 caracteres hexadecimais; tokens (EAA/IGAA/...ZDZD) não servem aqui.
    // Confere antes de gravar qualquer coisa (o servidor confere de novo).
    const secretOk = (s: string): boolean => !s || /^[a-f0-9]{32}$/i.test(s);
    if (!secretOk(form.metaAppSecret.trim()) || !secretOk(form.instagramAppSecret.trim())) {
      toast.error('O secret colado não é uma "Chave secreta do app" (deve ter 32 caracteres, letras a-f e números). Parece um token de acesso.');
      return;
    }
    setSaving(true);
    try {
      // Uma chamada só: App IDs e secrets vão juntos para a linha que o servidor usa no OAuth.
      const { data, error } = await invokeVpsFunction('meta-integration', {
        body: {
          meta_app_id: form.metaAppId.trim(),
          instagram_app_id: form.instagramAppId.trim(),
          meta_app_secret: form.metaAppSecret.trim() || undefined,
          instagram_app_secret: form.instagramAppSecret.trim() || undefined,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro desconhecido');

      setIntegrationId(data?.id || integrationId);
      setConfigured(true);
      setForm(f => ({ ...f, metaAppSecret: '', instagramAppSecret: '' }));
      toast.success('Integração Meta salva e ativada');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  /** Mostra qual App ID/secret o servidor usa (só os 4 últimos caracteres) e valida o par com a Meta. */
  const handleDiagnose = async () => {
    setDiagnosing(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth-diagnose', { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Falha no diagnóstico');
      setDiag(data as MetaDiagnosis);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDiagnosing(false);
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowSecrets(s => !s)} className="text-xs">
          {showSecrets ? <EyeOff size={13} className="mr-1" /> : <Eye size={13} className="mr-1" />}
          {showSecrets ? 'Ocultar secrets' : 'Mostrar secrets'}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDiagnose} disabled={diagnosing || loading} size="sm">
            {diagnosing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Stethoscope size={14} className="mr-1" />}
            Testar credenciais
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} size="sm">
            {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            Salvar Integração Meta
          </Button>
        </div>
      </div>

      {diag && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1 font-mono">
          <p className={diag.secret_check.status === 'ok' ? 'text-primary font-semibold' : diag.secret_check.status === 'invalid' ? 'text-destructive font-semibold' : 'text-muted-foreground font-semibold'}>
            {diag.secret_check.message}
          </p>
          <p>Instagram App ID usado: {diag.instagram_app_id} ({diag.instagram_app_id_source})</p>
          <p>Secret usado: {diag.secret_used} ({diag.secret_used_source})</p>
          <p>Instagram Secret salvo: {diag.instagram_secret} · Meta Secret salvo: {diag.meta_secret}</p>
          <p>Redirect: {diag.redirect_uri} · Configurações ativas: {diag.active_rows}</p>
        </div>
      )}
    </div>
  );
}
