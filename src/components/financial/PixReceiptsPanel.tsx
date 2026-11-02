// Financeiro → Pagamentos · comprovantes do Pix pela chave (pedido do usuário, 02/11/2026: "crie uma forma de
// autenticar esse pagamento para confirmar no sistema que foi pago"). O cliente manda o comprovante na página /pagar,
// a IA lê e o servidor confere; aqui a gestão vê as conferências e dá a baixa de dois jeitos: importando o extrato do
// banco (.ofx, casa sozinho) ou tocando em "Confirmar recebimento" depois de ver o dinheiro no app do banco.
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, FileText, Loader2, Upload, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PaymentCity } from '@/lib/paymentAccounts';
import {
  confirmPixReceipt, fetchPixReceipts, importStatement, openPixReceiptFile, rejectPixReceipt, type PixReceipt,
} from '@/lib/pixReceipts';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const CITY: Record<string, string> = { uruacu: 'Uruaçu', minacu: 'Minaçu' };

const VERDICT: Record<PixReceipt['verdict'], { label: string; style: string }> = {
  conferido: { label: 'comprovante bate', style: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  conferir: { label: 'conferir', style: 'bg-amber-100 text-amber-800 border-amber-200' },
  recusado: { label: 'não bate', style: 'bg-red-100 text-red-700 border-red-200' },
};

export function PixReceiptsPanel({ preview }: { preview?: PixReceipt[] }) {
  const queryClient = useQueryClient();
  const [all, setAll] = useState(false);
  const query = useQuery({ queryKey: ['pix-receipts', all], queryFn: () => fetchPixReceipts(all), enabled: !preview });
  const receipts = preview || query.data?.receipts || [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pix-receipts'] });
  const waiting = receipts.filter((r) => r.status === 'aguardando').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Comprovantes do Pix pela chave</CardTitle>
        <p className="text-xs text-muted-foreground">
          O cliente manda o comprovante na página de pagamento e a IA confere valor, recebedor e o ID da transação. A baixa sai quando o
          dinheiro aparece: importe o extrato do banco (.ofx) ou confirme depois de olhar o app do banco. Comprovante sozinho não dá baixa.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['minacu', 'uruacu'] as PaymentCity[]).map((city) => <StatementButton key={city} city={city} demo={!!preview} onDone={refresh} />)}
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setAll((v) => !v)} disabled={!!preview}>
            {all ? 'Só os que aguardam' : 'Ver os últimos 60 dias'}
          </Button>
        </div>

        {query.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!query.isLoading && !receipts.length && (
          <p className="text-xs text-muted-foreground">{all ? 'Nenhum comprovante nos últimos 60 dias.' : 'Nenhum comprovante aguardando.'}</p>
        )}
        {!all && waiting > 0 && <p className="text-xs font-medium">{waiting} aguardando confirmação</p>}

        {receipts.map((r) => <ReceiptRow key={r.id} receipt={r} demo={!!preview} onDone={refresh} />)}
      </CardContent>
    </Card>
  );
}

function ReceiptRow({ receipt: r, demo, onDone }: { receipt: PixReceipt; demo: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    if (demo) return;
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onDone();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const v = VERDICT[r.verdict];

  return (
    <div className="space-y-2 rounded-md border p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={v.style}>{v.label}</Badge>
        {r.status !== 'aguardando' && <Badge variant={r.status === 'confirmado' ? 'default' : 'outline'}>{r.status}</Badge>}
        <span className="font-medium">{r.client_name || 'cliente'} · {brl(Number(r.amount))}</span>
        <span className="text-muted-foreground">
          {r.month ? `${r.month.slice(5)}/${r.month.slice(0, 4)}` : ''}{r.city ? ` · ${CITY[r.city] || r.city}` : ''} · enviado {dataHora(r.created_at)}
        </span>
      </div>

      {r.ai && (
        <p className="text-muted-foreground">
          Lido: {r.ai.valor != null ? brl(r.ai.valor) : 'valor ?'}{r.ai.pagador_nome ? ` · pagou ${r.ai.pagador_nome}` : ''}
          {r.ai.instituicao ? ` (${r.ai.instituicao})` : ''}{r.paid_at ? ` · Pix em ${dataHora(r.paid_at)}` : ''}
        </p>
      )}
      <ul className="space-y-0.5">
        {(r.checks || []).map((c) => (
          <li key={c.id} className="flex items-start gap-1">
            {c.ok ? <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={12} className="mt-0.5 shrink-0 text-red-600" />}
            <span>{c.label}{c.detail && !c.ok ? <span className="text-muted-foreground"> · {c.detail}</span> : null}</span>
          </li>
        ))}
      </ul>
      {r.status === 'confirmado' && <p className="text-muted-foreground">Confirmado por {r.confirmed_by} em {dataHora(r.confirmed_at)}</p>}
      {r.status === 'recusado' && r.reason && <p className="text-muted-foreground">Motivo: {r.reason}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-7" disabled={demo} onClick={() => openPixReceiptFile(r.id).catch((e) => toast.error((e as Error).message))}>
          <FileText size={13} className="mr-1" /> Ver comprovante
        </Button>
        {r.status === 'aguardando' && (
          <>
            <Button size="sm" className="h-7" disabled={busy} onClick={() => act(() => confirmPixReceipt(r.id), 'Recebimento confirmado. O recibo vai para o cliente.')}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirmar recebimento'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => {
              const motivo = window.prompt('Por que recusar este comprovante?') || '';
              if (motivo.trim()) act(() => rejectPixReceipt(r.id, motivo), 'Comprovante recusado');
            }}>Recusar</Button>
          </>
        )}
      </div>
    </div>
  );
}

function StatementButton({ city, demo, onDone }: { city: PaymentCity; demo: boolean; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const send = async (file: File | undefined) => {
    if (!file || demo) return;
    setBusy(true);
    try {
      const r = await importStatement(city, file);
      toast.success(`${CITY[city]}: ${r.novos} créditos novos · ${r.confirmados} confirmados${r.aguardando ? ` · ${r.aguardando} ainda aguardam` : ''}`);
      onDone();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <>
      <input ref={input} type="file" accept=".ofx,application/x-ofx,text/plain" className="hidden" onChange={(e) => send(e.target.files?.[0])} />
      <Button size="sm" variant="outline" className="h-8" disabled={busy || demo} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload size={14} className="mr-1" />} Extrato {CITY[city]} (.ofx)
      </Button>
    </>
  );
}
