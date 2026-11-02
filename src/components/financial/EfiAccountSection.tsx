// Financeiro → Pagamentos: a conta Efí Bank de cada cidade (pedido do usuário, 02/11/2026: "Vou trocar de banco, usar
// o Efí"). Client ID, Client Secret e o certificado .p12 vão cifrados para o servidor e nunca voltam (a tela vê só os
// 4 últimos caracteres e o nome do arquivo). Liga cidade por cidade, depois de testar a conexão. EfiMovementsPanel
// mostra os Pix recebidos do mês, com os que chegaram sem cobrança da Pulse em "conferir".
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Landmark, Loader2, PlugZap, Upload, Webhook, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  EFI_STATUS_LABELS, fetchEfiMovements, fileToBase64, markEfiConferido, registerEfiWebhook, saveEfiAccount, testEfiAccount,
  type EfiMovement, type EfiStatus, type PaymentAccount,
} from '@/lib/paymentAccounts';

const EFI_STYLE: Record<EfiStatus, string> = {
  ligado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pronto: 'bg-sky-100 text-sky-700 border-sky-200',
  testar: 'bg-amber-100 text-amber-800 border-amber-200',
  com_erro: 'bg-red-100 text-red-700 border-red-200',
  incompleto: 'bg-amber-100 text-amber-800 border-amber-200',
  nao_configurado: 'bg-muted text-muted-foreground',
};

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function EfiAccountSection({ account, demo }: { account: PaymentAccount; demo: boolean }) {
  const queryClient = useQueryClient();
  const efi = account.efi;
  const [env, setEnv] = useState(efi.env);
  const [pixKey, setPixKey] = useState(efi.pix_key);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [cert, setCert] = useState<File | null>(null);
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'webhook' | 'toggle'>('');
  useEffect(() => { setEnv(efi.env); setPixKey(efi.pix_key); }, [efi.env, efi.pix_key]);

  const dirty = env !== efi.env || pixKey !== efi.pix_key || !!clientId || !!clientSecret || !!cert;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    if (demo) return;
    setBusy(kind);
    try {
      await fn();
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy('');
    }
  };

  const save = () => run('save', async () => {
    await saveEfiAccount(account.city, {
      efi_env: env, efi_pix_key: pixKey,
      ...(clientId.trim() ? { client_id: clientId.trim() } : {}),
      ...(clientSecret.trim() ? { client_secret: clientSecret.trim() } : {}),
      ...(cert ? { cert_base64: await fileToBase64(cert), cert_name: cert.name } : {}),
    });
    setClientId('');
    setClientSecret('');
    setCert(null);
    toast.success(`${account.label}: Efí salva. Agora teste a conexão.`);
  });

  const test = () => run('test', async () => {
    const r = await testEfiAccount(account.city);
    if (r.ok) toast.success(`${account.label}: conectado à Efí${r.saldo != null ? ` · saldo ${brl(Number(r.saldo))}` : ''}`);
    else toast.error(`${account.label}: ${r.error}`);
  });

  const webhook = () => run('webhook', async () => {
    const r = await registerEfiWebhook(account.city);
    if (r.ok) toast.success(`${account.label}: webhook cadastrado na Efí`);
    else toast.error(`${account.label}: ${r.error}`);
  });

  const toggle = (on: boolean) => run('toggle', async () => {
    await saveEfiAccount(account.city, { efi_active: on });
    toast.success(on ? `${account.label}: cobranças com Pix da Efí a partir de agora` : `${account.label}: Efí desligada (volta o Pix de antes)`);
  });

  const canTurnOn = efi.status === 'pronto' || efi.status === 'ligado';

  return (
    <div className="rounded-md border px-3 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-1.5"><Landmark size={14} /> Efí Bank · Pix</p>
        <Badge variant="outline" className={EFI_STYLE[efi.status]}>{EFI_STATUS_LABELS[efi.status]}</Badge>
      </div>

      <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
        <div>
          <p className="text-sm font-medium">Cobrar com a Efí</p>
          <p className="text-[11px] text-muted-foreground">
            {canTurnOn ? 'Ligada, a mensagem, o PDF e a página de pagamento levam o Pix da Efí (com o valor) e o pagamento dá baixa sozinho.'
              : 'Liga depois de salvar tudo e passar no teste. Até lá, esta cidade segue como hoje.'}
          </p>
        </div>
        <Switch checked={efi.active} disabled={!canTurnOn || busy !== '' || dirty} onCheckedChange={toggle} aria-label={`Cobrar com a Efí em ${account.label}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`efi-env-${account.city}`}>Ambiente</Label>
          <select id={`efi-env-${account.city}`} className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={env} onChange={(e) => setEnv(e.target.value as typeof env)}>
            <option value="producao">Produção (cobranças de verdade)</option>
            <option value="homologacao">Homologação (teste da Efí)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`efi-pix-${account.city}`}>Chave Pix da conta Efí</Label>
          <Input id={`efi-pix-${account.city}`} value={pixKey} placeholder="a chave cadastrada na Efí" onChange={(e) => setPixKey(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`efi-cid-${account.city}`}>Client ID</Label>
          <Input id={`efi-cid-${account.city}`} type="password" autoComplete="off" value={clientId}
            placeholder={efi.has_client_id ? `guardado · termina em ${efi.client_id_last4}` : 'Client_Id_… (fica cifrado)'} onChange={(e) => setClientId(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`efi-sec-${account.city}`}>Client Secret</Label>
          <Input id={`efi-sec-${account.city}`} type="password" autoComplete="new-password" value={clientSecret}
            placeholder={efi.has_client_secret ? `guardado · termina em ${efi.client_secret_last4}` : 'Client_Secret_… (fica cifrado)'} onChange={(e) => setClientSecret(e.target.value)} />
        </div>
        <div className="min-w-0 space-y-1.5 sm:col-span-2">
          <Label htmlFor={`efi-cert-${account.city}`}>Certificado (.p12)</Label>
          <label htmlFor={`efi-cert-${account.city}`} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
            <Upload size={14} className="shrink-0" />
            <span className="min-w-0 truncate">{cert ? cert.name : efi.has_cert ? `guardado · ${efi.cert_name}${efi.cert_uploaded_at ? ` (${dataHora(efi.cert_uploaded_at)})` : ''}` : 'escolher o arquivo .p12'}</span>
          </label>
          <input id={`efi-cert-${account.city}`} type="file" accept=".p12,.pfx,application/x-pkcs12" className="sr-only"
            onChange={(e) => setCert(e.target.files?.[0] || null)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={!dirty || busy !== ''}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Efí'}</Button>
        <Button size="sm" variant="outline" onClick={test} disabled={dirty || busy !== '' || efi.status === 'nao_configurado' || efi.status === 'incompleto'}>
          {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap size={14} className="mr-1" />} Testar conexão
        </Button>
        <Button size="sm" variant="outline" onClick={webhook} disabled={dirty || busy !== '' || !canTurnOn}>
          {busy === 'webhook' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook size={14} className="mr-1" />} Cadastrar webhook
        </Button>
        {dirty && <span className="text-[11px] text-muted-foreground">Salve antes de testar.</span>}
      </div>

      <div className="space-y-1 text-[11px] text-muted-foreground">
        {efi.last_test_at && (
          <p className="flex items-center gap-1">
            {efi.last_test_ok ? <CheckCircle2 size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-red-600" />}
            Último teste em {dataHora(efi.last_test_at)}{efi.last_test_ok ? ': token da Efí e consulta de cobranças funcionaram.' : `: ${efi.last_test_error}`}
          </p>
        )}
        {efi.scopes_missing.length > 0 && <p className="text-red-600">Faltam escopos na aplicação da Efí: {efi.scopes_missing.join(', ')}</p>}
        {efi.webhook_at && <p>Webhook cadastrado em {dataHora(efi.webhook_at)}.</p>}
        {efi.webhook_error && <p className="text-amber-700">Webhook: {efi.webhook_error}</p>}
        <p>
          Sem webhook, a Pulse confere os Pix recebidos na Efí de 10 em 10 minutos. O cartão continua pelo link da InfinitePay. Client ID, Client Secret e
          certificado vão cifrados para o servidor e nunca voltam para a tela.
        </p>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<EfiMovement['status'], string> = { conciliado: 'mensalidade', conferir: 'conferir', conferido: 'conferido' };

/** Pix recebidos na Efí no mês, das duas cidades: conciliados com a mensalidade ou "conferir" (sem cobrança da Pulse). */
export function EfiMovementsPanel({ preview }: { preview?: EfiMovement[] }) {
  const queryClient = useQueryClient();
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
  const query = useQuery({ queryKey: ['efi-movements', month], queryFn: () => fetchEfiMovements(month), enabled: !preview });
  const data = preview ? { month, movements: preview, saldo: {} } : query.data;
  if (!data || (!data.movements.length && !Object.keys(data.saldo).length)) return null;
  const conferir = data.movements.filter((m) => m.status === 'conferir').length;
  const total = data.movements.filter((m) => !m.refunded).reduce((s, m) => s + Number(m.amount), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pix recebidos na Efí · {month.slice(5)}/{month.slice(0, 4)}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {brl(total)} em {data.movements.length} Pix{conferir ? ` · ${conferir} para conferir` : ''}
          {Object.entries(data.saldo).filter(([, v]) => v != null && !Number.isNaN(v)).map(([c, v]) => ` · saldo ${c === 'uruacu' ? 'Uruaçu' : 'Minaçu'} ${brl(Number(v))}`).join('')}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.movements.map((m) => (
          <div key={m.e2e_id} className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={m.status === 'conferir' ? 'destructive' : m.status === 'conciliado' ? 'default' : 'outline'}>
              {m.refunded ? 'devolvido' : STATUS_TEXT[m.status]}
            </Badge>
            <span className="font-medium">{brl(Number(m.amount))}</span>
            <span className="text-muted-foreground">
              {m.client || m.payer_name || 'pagador não informado'} · {m.city === 'uruacu' ? 'Uruaçu' : 'Minaçu'} · {dataHora(m.received_at)}
            </span>
            {m.status === 'conferir' && !preview && (
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={async () => {
                try {
                  await markEfiConferido(m.e2e_id);
                  await queryClient.invalidateQueries({ queryKey: ['efi-movements'] });
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}>Marcar conferido</Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
