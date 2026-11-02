// Financeiro → Pagamentos · InfinitePay (pedido do usuário, 01/11/2026: "um módulo no financeiro apenas para conexão
// da API da Infinit, certinho para conectar cada cidade"). Uma conta por cidade: InfiniteTag, chave Pix, recebedor,
// ativo e "Testar conexão" (link de R$ 1,00, ninguém é cobrado). É a única fonte dos dados de pagamento.
// Efí Bank (02/11/2026, "Vou trocar de banco, usar o Efí"): cada cidade liga a sua conta Efí (EfiAccountSection) e
// passa a cobrar com Pix dinâmico, com baixa automática e as movimentações em EfiMovementsPanel.
// Só a Efí (02/11/2026, "em pagamentos ainda tem coisas da Infinity, deixe tudo preparado apenas para a Efí"): saem a
// InfiniteTag, o teste e os links da InfinitePay; o cartão vai pelo link da Efí (EfiCardLinksPanel) e a chave Pix é a da
// conta Efí, no bloco da Efí.
// Pix pela chave (02/11/2026, sem taxa): os comprovantes que os clientes mandam na página /pagar ficam em PixReceiptsPanel.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import FinancialQuickNav from '@/components/financial/FinancialQuickNav';
import { EfiAccountSection, EfiCardLinksPanel, EfiMovementsPanel } from '@/components/financial/EfiAccountSection';
import { PixReceiptsPanel } from '@/components/financial/PixReceiptsPanel';
import { PixAutoPanel } from '@/components/financial/PixAutoPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  STATUS_LABELS, fetchPaymentAccounts, savePaymentAccount,
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
          <h1 className="text-xl font-bold">Pagamentos · Efí Bank</h1>
          <p className="text-xs text-muted-foreground">
            A conta Efí de cada cidade. <strong>Pix</strong>: com a baixa automática ligada, o Pix da Efí é identificado sozinho; desligada, sai pela chave
            (sem taxa) e o cliente manda o comprovante na página de pagamento. <strong>Cartão</strong>: link de pagamento da Efí, até 12x, com a taxa
            repassada e baixa automática.
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
          {!preview && <PixAutoPanel />}
          <PixReceiptsPanel preview={preview ? [] : undefined} />
          <EfiMovementsPanel preview={preview ? preview.movements || [] : undefined} />
          {!preview && <EfiCardLinksPanel />}
        </>
      )}
    </div>
  );
}

function AccountCard({ account, demo }: { account: PaymentAccount; demo: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(account);
  const [busy, setBusy] = useState<'' | 'save'>('');
  useEffect(() => setForm(account), [account]);

  const set = <K extends keyof PaymentAccount>(k: K, v: PaymentAccount[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = (['receiver_name', 'document', 'bank', 'active'] as const)
    .some((k) => form[k] !== account[k]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });

  const save = async () => {
    if (demo) return;
    setBusy('save');
    try {
      await savePaymentAccount(account.city, {
        receiver_name: form.receiver_name, document: form.document, bank: form.bank, active: form.active,
      });
      await refresh();
      toast.success(`${account.label}: salvo`);
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
            <p className="text-[11px] text-muted-foreground">Desativada, a cidade fica sem Pix e sem cartão (a cobrança vai para "Conferir dados").</p>
          </div>
          <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do recebedor" id={`rec-${account.city}`} value={form.receiver_name} onChange={(v) => set('receiver_name', v)} />
          <Field label="CPF ou CNPJ" id={`doc-${account.city}`} value={form.document} onChange={(v) => set('document', v)} />
          <Field label="Banco" id={`bank-${account.city}`} value={form.bank} placeholder="Efí Bank" onChange={(v) => set('bank', v)} />
        </div>


        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={!dirty || busy !== ''}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
        </div>

        <div className="space-y-1 text-[11px] text-muted-foreground">
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
