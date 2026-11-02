// Financeiro → Pagamentos: a conta Efí Bank de cada cidade (pedido do usuário, 02/11/2026: "Vou trocar de banco, usar
// o Efí"). Client ID, Client Secret e o certificado .p12 vão cifrados para o servidor e nunca voltam (a tela vê só os
// 4 últimos caracteres e o nome do arquivo). Liga cidade por cidade, depois de testar a conexão. EfiMovementsPanel
// mostra os Pix recebidos do mês, com os que chegaram sem cobrança da Pulse em "conferir".
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, CreditCard, Landmark, Loader2, PlugZap, Upload, Webhook, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  EFI_STATUS_LABELS, fetchEfiCardLinks, fetchEfiMovements, fileToBase64, markEfiConferido, recheckEfiCardLink, registerEfiWebhook,
  saveEfiAccount, setEfiCard, testEfiAccount, testEfiCard, type EfiMovement, type EfiStatus, type PaymentAccount,
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
  const [agencia, setAgencia] = useState(efi.agencia);
  const [conta, setConta] = useState(efi.conta);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [cert, setCert] = useState<File | null>(null);
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'webhook' | 'toggle' | 'card-test' | 'card'>('');
  useEffect(() => { setEnv(efi.env); setPixKey(efi.pix_key); setAgencia(efi.agencia); setConta(efi.conta); }, [efi.env, efi.pix_key, efi.agencia, efi.conta]);

  const dirty = env !== efi.env || pixKey !== efi.pix_key || agencia !== efi.agencia || conta !== efi.conta || !!clientId || !!clientSecret || !!cert;
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
      efi_env: env, efi_pix_key: pixKey, efi_agencia: agencia, efi_conta: conta,
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
    toast.success(on ? `${account.label}: Pix da Efí com baixa automática a partir de agora` : `${account.label}: Pix pela chave, com o comprovante na página de pagamento`);
  });

  const cardTest = () => run('card-test', async () => {
    const r = await testEfiCard(account.city);
    if (r.ok) toast.success(`${account.label}: cartão da Efí conectado`);
    else toast.error(`${account.label}: ${r.error}`);
  });

  const cardToggle = (on: boolean) => run('card', async () => {
    await setEfiCard(account.city, on);
    toast.success(on ? `${account.label}: cartão pelo link da Efí a partir de agora` : `${account.label}: cobranças sem cartão`);
  });

  const canTurnOn = efi.status === 'pronto' || efi.status === 'ligado';

  return (
    <div className="rounded-md border px-3 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-1.5"><Landmark size={14} /> Efí Bank</p>
        <Badge variant="outline" className={EFI_STYLE[efi.status]}>{EFI_STATUS_LABELS[efi.status]}</Badge>
      </div>

      {/* só o Pix pela chave (usuário, 02/11/2026: "não é para usar o Pix com taxa"): sem o botão do Pix com cobrança da Efí */}
      <div className="rounded-md bg-muted/40 px-3 py-2">
        <p className="text-sm font-medium">Pix pela chave, sem taxa</p>
        <p className="text-[11px] text-muted-foreground">
          {canTurnOn || efi.status === 'pronto'
            ? 'A cobrança leva o Pix copia e cola da chave da Efí. O sistema confere na conta o Pix que caiu (na hora, pelo webhook, e de 5 em 5 min) e dá baixa quando ele bate com a mensalidade; o recibo vai na hora.'
            : 'Salve tudo e teste a conexão: com a conta testada, o sistema confere sozinho na conta o Pix que caiu.'}
        </p>
        {efi.active && (
          <button type="button" className="mt-2 text-[11px] font-medium text-destructive underline" disabled={busy !== ''} onClick={() => toggle(false)}>
            O Pix com cobrança da Efí (com taxa) ainda está ligado: desligar
          </button>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5"><CreditCard size={14} /> Cartão pela Efí</p>
          <p className="text-[11px] text-muted-foreground">
            {efi.card_test_ok
              ? 'Ligado: a cobrança leva o link de pagamento da Efí (até 12x), com a taxa do cartão repassada e o aviso discreto. Pagou, dá baixa sozinho.'
              : 'Salve o Client ID e o Client Secret, ligue a "API Cobranças" na aplicação da Efí e toque em "Testar cartão".'}
          </p>
        </div>
        <Switch checked={efi.card_active} disabled={!efi.card_test_ok || busy !== '' || dirty} onCheckedChange={cardToggle} aria-label={`Cartão pela Efí em ${account.label}`} />
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
        <div className="space-y-1.5">
          <Label htmlFor={`efi-ag-${account.city}`}>Agência (Pix Automático)</Label>
          <Input id={`efi-ag-${account.city}`} inputMode="numeric" value={agencia} placeholder="ex.: 0001" onChange={(e) => setAgencia(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`efi-ct-${account.city}`}>Conta (Pix Automático)</Label>
          <Input id={`efi-ct-${account.city}`} inputMode="numeric" value={conta} placeholder="número da conta Efí, com o dígito" onChange={(e) => setConta(e.target.value)} />
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
        <Button size="sm" variant="outline" onClick={cardTest} disabled={dirty || busy !== '' || !efi.has_client_id || !efi.has_client_secret}>
          {busy === 'card-test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard size={14} className="mr-1" />} Testar cartão
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
        {efi.card_test_at && (
          <p className="flex items-center gap-1">
            {efi.card_test_ok ? <CheckCircle2 size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-red-600" />}
            Cartão testado em {dataHora(efi.card_test_at)}{efi.card_test_ok ? ': a API Cobranças da Efí respondeu.' : `: ${efi.card_test_error}`}
          </p>
        )}
        {efi.scopes_missing.length > 0 && <p className="text-red-600">Faltam escopos na aplicação da Efí: {efi.scopes_missing.join(', ')}</p>}
        {efi.webhook_at && <p>Webhook cadastrado em {dataHora(efi.webhook_at)}.</p>}
        {efi.webhook_error && <p className="text-amber-700">Webhook: {efi.webhook_error}</p>}
        <p>
          O webhook avisa o Pix na hora; sem ele, a Pulse confere os Pix recebidos na Efí de 5 em 5 minutos e os links do cartão de 30 em 30. Client ID, Client Secret e
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

/** Links do cartão da Efí no mês (cobranças das duas cidades), com o botão de conferir o pagamento. */
export function EfiCardLinksPanel() {
  const queryClient = useQueryClient();
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
  const query = useQuery({ queryKey: ['efi-card-links', month], queryFn: () => fetchEfiCardLinks(month) });
  const [busy, setBusy] = useState('');
  if (!query.data?.links.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Cartão pela Efí · {month.slice(5)}/{month.slice(0, 4)}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {query.data.links.map((l) => (
          <div key={l.charge_id} className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={l.paid_at ? 'default' : 'outline'}>{l.paid_at ? 'pago' : l.status === 'link' ? 'aberto' : l.status}</Badge>
            <span>{l.client || 'cliente'} · {brl(Number(l.amount))} (no cartão {brl(Number(l.card_amount))}) · {l.city === 'uruacu' ? 'Uruaçu' : 'Minaçu'}</span>
            <a className="text-primary underline truncate max-w-[200px]" href={l.url} target="_blank" rel="noreferrer">{l.url}</a>
            {!l.paid_at && (
              <Button size="sm" variant="ghost" className="h-6 px-2" disabled={busy === l.charge_id} onClick={async () => {
                setBusy(l.charge_id);
                try {
                  const r = await recheckEfiCardLink(l.charge_id);
                  toast.success(r.paid ? 'Pago: receita baixada' : `Ainda não pago (${r.status || 'aberto'})`);
                  await queryClient.invalidateQueries({ queryKey: ['efi-card-links'] });
                } catch (error) {
                  toast.error((error as Error).message);
                } finally {
                  setBusy('');
                }
              }}>Conferir</Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
