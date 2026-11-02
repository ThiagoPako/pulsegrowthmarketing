// Financeiro → Pagamentos · InfinitePay (pedido do usuário, 01/11/2026: "um módulo no financeiro apenas para conexão
// da API da Infinit, certinho para conectar cada cidade"). Uma conta por cidade: InfiniteTag, chave Pix, recebedor,
// ativo e "Testar conexão" (link de R$ 1,00, ninguém é cobrado). É a única fonte dos dados de pagamento.
// Efí Bank (02/11/2026, "Vou trocar de banco, usar o Efí"): cada cidade liga a sua conta Efí (EfiAccountSection) e
// passa a cobrar com Pix dinâmico, com baixa automática e as movimentações em EfiMovementsPanel.
// Pix pela chave (02/11/2026, sem taxa): os comprovantes que os clientes mandam na página /pagar ficam em PixReceiptsPanel.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, PlugZap, XCircle } from 'lucide-react';
import FinancialQuickNav from '@/components/financial/FinancialQuickNav';
import { EfiAccountSection, EfiMovementsPanel } from '@/components/financial/EfiAccountSection';
import { PixReceiptsPanel } from '@/components/financial/PixReceiptsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { fetchPaymentLinks, recheckPaymentLink } from '@/lib/billingIsis';
import {
  STATUS_LABELS, fetchPaymentAccounts, savePaymentAccount, testPaymentAccount,
  type EfiMovement, type PaymentAccount, type PaymentAccountStatus,
} from '@/lib/paymentAccounts';

const STATUS_STYLE: Record<PaymentAccountStatus, string> = {
  conectado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  com_erro: 'bg-red-100 text-red-700 border-red-200',
  testar: 'bg-amber-100 text-amber-800 border-amber-200',
  desativado: 'bg-muted text-muted-foreground',
  nao_configurado: 'bg-muted text-muted-foreground',
};

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function FinancialPayments({ preview }: { preview?: { accounts: PaymentAccount[]; webhook_url: string; movements?: EfiMovement[] } }) {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['payment-accounts'], queryFn: fetchPaymentAccounts, enabled: !preview });
  const data = preview || query.data;

  return (
    <div className="space-y-5">
      <FinancialQuickNav />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')}><ArrowLeft size={18} /></Button>
        <div>
          <h1 className="text-xl font-bold">Pagamentos · Efí e InfinitePay</h1>
          <p className="text-xs text-muted-foreground">
            A conta de cada cidade. Com a <strong>Efí</strong> ligada, a cidade cobra com Pix dinâmico da Efí (o código já leva o valor e o pagamento é
            identificado sozinho); sem ela, a cidade cobra pelo Pix da chave (sem taxa), o cliente manda o comprovante na página de pagamento e a
            baixa sai pelo extrato do banco ou pela confirmação de vocês. O cartão continua pelo link da InfinitePay.
          </p>
        </div>
      </div>

      {query.error && <p className="text-sm text-destructive">{(query.error as Error).message === 'Admin access required' ? 'Só o administrador vê esta tela.' : (query.error as Error).message}</p>}
      {!data && !query.error && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>}

      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.accounts.map((acc) => <AccountCard key={acc.city} account={acc} demo={!!preview} />)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            A InfiniteTag é a tag do app da InfinitePay (não é senha). Cada cliente paga na conta da cidade dele; pagou pelo link, a receita é baixada sozinha
            depois de conferida na InfinitePay. Webhook: {data.webhook_url}
          </p>
          <PixReceiptsPanel preview={preview ? [] : undefined} />
          <EfiMovementsPanel preview={preview ? preview.movements || [] : undefined} />
          {!preview && <PaymentLinksPanel />}
        </>
      )}
    </div>
  );
}

function AccountCard({ account, demo }: { account: PaymentAccount; demo: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(account);
  const [busy, setBusy] = useState<'' | 'save' | 'test'>('');
  const [lastTest, setLastTest] = useState<{ ok: boolean; url?: string; error?: string } | null>(null);
  useEffect(() => setForm(account), [account]);

  const set = <K extends keyof PaymentAccount>(k: K, v: PaymentAccount[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = (['infinitepay_handle', 'pix_key', 'receiver_name', 'document', 'bank', 'active'] as const)
    .some((k) => form[k] !== account[k]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });

  const save = async () => {
    if (demo) return;
    setBusy('save');
    try {
      await savePaymentAccount(account.city, {
        infinitepay_handle: form.infinitepay_handle, pix_key: form.pix_key, receiver_name: form.receiver_name,
        document: form.document, bank: form.bank, active: form.active,
      });
      await refresh();
      toast.success(`${account.label}: salvo`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    if (demo) return;
    setBusy('test');
    try {
      const r = await testPaymentAccount(account.city);
      setLastTest(r);
      await refresh();
      if (r.ok) toast.success(`${account.label}: conectado à InfinitePay`);
      else toast.error(`${account.label}: ${r.error}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy('');
    }
  };


  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-base">{account.label}</CardTitle>
        <Badge variant="outline" className={STATUS_STYLE[account.status]}>{STATUS_LABELS[account.status]}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Conta ativa</p>
            <p className="text-[11px] text-muted-foreground">Desativada, a cidade fica sem Pix e sem link (a cobrança vai para "Conferir dados").</p>
          </div>
          <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="InfiniteTag" id={`tag-${account.city}`} value={form.infinitepay_handle} placeholder="tag da conta (sem o $)" onChange={(v) => set('infinitepay_handle', v)} />
          <Field label="Chave Pix" id={`pix-${account.city}`} value={form.pix_key} placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" onChange={(v) => set('pix_key', v)} />
          <Field label="Nome do recebedor" id={`rec-${account.city}`} value={form.receiver_name} onChange={(v) => set('receiver_name', v)} />
          <Field label="CPF ou CNPJ" id={`doc-${account.city}`} value={form.document} onChange={(v) => set('document', v)} />
          <Field label="Banco" id={`bank-${account.city}`} value={form.bank} onChange={(v) => set('bank', v)} />
        </div>


        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={!dirty || busy !== ''}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
          <Button size="sm" variant="outline" onClick={test} disabled={!account.infinitepay_handle || dirty || busy !== ''}>
            {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap size={14} className="mr-1" />} Testar InfinitePay
          </Button>
          {dirty && <span className="text-[11px] text-muted-foreground">Salve antes de testar.</span>}
        </div>

        <div className="space-y-1 text-[11px] text-muted-foreground">
          {account.last_test_at && (
            <p className="flex items-center gap-1">
              {account.last_test_ok ? <CheckCircle2 size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-red-600" />}
              Último teste em {dataHora(account.last_test_at)}{account.last_test_ok ? ': a InfinitePay respondeu e criou o link de R$ 1,00.' : `: ${account.last_test_error}`}
            </p>
          )}
          {lastTest?.ok && lastTest.url && <p>Link de teste: <a className="text-primary underline" href={lastTest.url} target="_blank" rel="noreferrer">{lastTest.url}</a> (ninguém é cobrado)</p>}
          {account.updated_at && <p>Última alteração em {dataHora(account.updated_at)}{account.updated_by ? ` · ${account.updated_by}` : ''}</p>}
        </div>

        <EfiAccountSection account={account} demo={demo} />
      </CardContent>
    </Card>
  );
}

function Field({ label, id, value, onChange, placeholder }: { label: string; id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Links da InfinitePay do mês (cobranças e testes), com o botão de conferir o pagamento. */
function PaymentLinksPanel() {
  const queryClient = useQueryClient();
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
  const links = useQuery({ queryKey: ['infinitepay-links', month], queryFn: () => fetchPaymentLinks(month) });
  const [busy, setBusy] = useState(false);
  if (!links.data) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Links do mês</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {!links.data.links.length && <p className="text-xs text-muted-foreground">Nenhum link neste mês.</p>}
        {links.data.links.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={l.status === 'pago' ? 'default' : 'outline'}>{l.status === 'pago' ? `pago${l.capture_method ? ` · ${l.capture_method}` : ''}` : 'aberto'}</Badge>
            <span>{l.client || 'teste'} · {brl(Number(l.amount))}{l.city ? ` · ${l.city === 'uruacu' ? 'Uruaçu' : 'Minaçu'}` : ''}</span>
            <a className="text-primary underline truncate max-w-[220px]" href={l.url} target="_blank" rel="noreferrer">{l.url}</a>
            {l.status !== 'pago' && (
              <Button size="sm" variant="ghost" className="h-6 px-2" disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                  await recheckPaymentLink(l.id);
                  toast.success('Conferido na InfinitePay');
                  await queryClient.invalidateQueries({ queryKey: ['infinitepay-links'] });
                } catch (error) {
                  toast.error((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}>Conferir</Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
