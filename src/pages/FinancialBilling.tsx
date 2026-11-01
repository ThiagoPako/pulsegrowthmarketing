import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BellRing, FileText, Loader2, MessageSquareText, RotateCcw } from 'lucide-react';
import FinancialQuickNav from '@/components/financial/FinancialQuickNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  BILLING_STEPS, MODE_LABELS, STEP_LABELS, STEP_STATUS_LABELS, TEMPLATE_VARS, fetchBillingAgenda, fetchBillingConfig,
  fetchBillingPreview, saveBillingConfig, fetchPaymentLinks, createTestLink, recheckPaymentLink, openBillingPdfPreview,
  type BillingAgendaItem, type BillingMode, type BillingStep,
} from '@/lib/billingIsis';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const STATUS_STYLE: Record<string, string> = {
  enviada: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  pago: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  previa: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  aguardando_relatorio: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  sem_whatsapp: 'bg-destructive/15 text-destructive border-destructive/30',
  conferir: 'bg-destructive/15 text-destructive border-destructive/30',
};
const thisMonth = () => new Date().toISOString().slice(0, 7);

/**
 * Cobranças da Ísis pelo Assistente PULSE (plano aprovado pelo usuário em 01/11/2026): agenda do mês com as 4
 * mensagens de cada cliente (dia 1, D−5, D, D+3), os textos editáveis e o modo (desligado, prévia, ativo).
 */
export default function FinancialBilling() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonth());
  const [open, setOpen] = useState<{ item: BillingAgendaItem; step: BillingStep; date: string; body: string | null; pdfUrl: string | null } | null>(null);
  const config = useQuery({ queryKey: ['billing-isis-config'], queryFn: fetchBillingConfig });
  const agenda = useQuery({ queryKey: ['billing-isis-agenda', month], queryFn: () => fetchBillingAgenda(month) });

  return (
    <div className="space-y-5">
      <FinancialQuickNav />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')}><ArrowLeft size={18} /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2"><BellRing size={22} /> Cobranças</h1>
          <p className="text-sm text-muted-foreground">A Ísis manda relatório, agradecimento, cobrança e lembrete pelo Assistente PULSE. Pix primeiro; o cartão pelo link da InfinitePay.</p>
        </div>
      </div>

      <Tabs defaultValue="agenda">
        <TabsList>
          <TabsTrigger value="agenda">Agenda do mês</TabsTrigger>
          <TabsTrigger value="mensagens">Mensagens e modo</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="space-y-3 mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mes-cobranca">Mês</Label>
              <Input id="mes-cobranca" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" />
            </div>
            {config.data && (
              <Badge variant="outline" className="mb-2">Modo: {MODE_LABELS[config.data.mode]}</Badge>
            )}
          </div>
          {agenda.isLoading && <Loader2 className="animate-spin text-muted-foreground" size={18} />}
          {agenda.error && <p className="text-sm text-destructive">{(agenda.error as Error).message}</p>}
          <div className="space-y-2">
            {agenda.data?.items.map((item) => (
              <Card key={item.contract_id} className={!item.billing_enabled ? 'opacity-60' : ''}>
                <CardContent className="p-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-[200px] flex-1">
                    <div className="font-medium">{item.client}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.plan || 'plano'} · {brl(item.amount)} · vence {br(item.due_date)}
                      {item.paid && <span className="text-emerald-500"> · pago</span>}
                      {!item.has_whatsapp && <span className="text-destructive"> · sem WhatsApp</span>}
                      {!item.billing_enabled && ' · cobrança pausada no contrato'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.steps.map((s) => (
                      <button
                        key={s.step}
                        type="button"
                        onClick={() => setOpen({ item, step: s.step, date: s.date, body: s.body, pdfUrl: s.pdf_url })}
                        className={`rounded-md border px-2 py-1 text-left text-[11px] leading-tight hover:bg-muted/60 ${STATUS_STYLE[s.status] || 'text-muted-foreground'}`}
                        title="Ver a mensagem"
                      >
                        <div className="font-medium">{STEP_LABELS[s.step]}</div>
                        <div>{br(s.date)} · {STEP_STATUS_LABELS[s.status] || s.status}</div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {agenda.data && !agenda.data.items.length && <p className="text-sm text-muted-foreground">Nenhum contrato ativo.</p>}
          </div>
        </TabsContent>

        <TabsContent value="mensagens" className="mt-4">
          {config.data ? <BillingSettings /> : <Loader2 className="animate-spin text-muted-foreground" size={18} />}
        </TabsContent>
      </Tabs>

      {open && <MessageDialog {...open} month={month} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MessageDialog({ item, step, date, body, pdfUrl, month, onClose }: {
  item: BillingAgendaItem; step: BillingStep; date: string; body: string | null; pdfUrl: string | null; month: string; onClose: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const openPdf = async () => {
    if (pdfUrl) { window.open(pdfUrl, '_blank', 'noopener'); return; }
    setOpening(true);
    try {
      await openBillingPdfPreview(item.contract_id, step, date, month);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOpening(false);
    }
  };
  // guardada (prévia/enviada) mostra o que saiu; senão monta agora com os dados de hoje, sem gravar nada
  const preview = useQuery({
    queryKey: ['billing-isis-preview', item.contract_id, step, date],
    queryFn: () => fetchBillingPreview(item.contract_id, step, date, month),
    enabled: !body,
  });
  const text = body || preview.data?.body;
  const skip = preview.data?.skip;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquareText size={18} /> {item.client} · {STEP_LABELS[step]}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{body ? 'Mensagem guardada pela Ísis.' : `Como sairia em ${br(date)} com os dados de agora (nada é enviado).`}</p>
        {preview.isLoading && !body && <Loader2 className="animate-spin text-muted-foreground" size={18} />}
        {skip === 'aguardando_relatorio' && <p className="text-sm text-amber-500">O relatório do mês ainda não foi aprovado (Relatórios → Relatório mensal): sem aprovação, essa mensagem não sai.</p>}
        {skip === 'pago' && <p className="text-sm text-emerald-500">Mensalidade paga: a cobrança não sai.</p>}
        {skip === 'conferir' && (
          <div className="text-sm text-destructive space-y-1">
            <p>Não bate com o Financeiro, então não sai (a Ísis avisa a equipe):</p>
            <ul className="list-disc pl-5">{preview.data?.problems?.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {preview.error && <p className="text-sm text-destructive">{(preview.error as Error).message}</p>}
        {text && <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md bg-muted/50 p-3 text-sm font-sans max-h-[60vh] overflow-y-auto">{text}</pre>}
        {text && (
          <Button variant="outline" size="sm" className="w-fit" onClick={openPdf} disabled={opening}>
            {opening ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileText size={14} className="mr-1" />}
            {pdfUrl ? 'Ver o PDF enviado' : 'Ver o PDF que vai junto'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BillingSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['billing-isis-config'], queryFn: fetchBillingConfig });
  const [mode, setMode] = useState<BillingMode>('desligado');
  const [handle, setHandle] = useState('');
  const [footer, setFooter] = useState('');
  const [contacts, setContacts] = useState<Record<'uruacu' | 'minacu', { name: string; phone: string }>>({ uruacu: { name: '', phone: '' }, minacu: { name: '', phone: '' } });
  const [templates, setTemplates] = useState<Record<BillingStep, string>>({ relatorio_mensal: '', pre_vencimento: '', cobranca: '', lembrete: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMode(data.mode);
    setHandle(data.infinitepay_handle || '');
    setFooter(data.footer ?? '');
    if (data.contacts) setContacts({
      uruacu: { name: data.contacts.uruacu.name, phone: data.contacts.uruacu.phone },
      minacu: { name: data.contacts.minacu.name, phone: data.contacts.minacu.phone },
    });
    setTemplates(data.templates);
  }, [data]);
  if (!data) return null;

  const save = async () => {
    setSaving(true);
    try {
      await saveBillingConfig({ mode, infinitepay_handle: handle, footer, contacts, templates });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['billing-isis-config'] }),
        queryClient.invalidateQueries({ queryKey: ['billing-isis-agenda'] }),
      ]);
      toast.success('Cobranças salvas');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Modo</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Select value={mode} onValueChange={(v) => setMode(v as BillingMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABELS) as BillingMode[]).map((m) => <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Desligado: a cobrança antiga (vencimento e +3 dias) segue igual. Prévia: a Ísis monta as 4 mensagens no dia certo e guarda aqui, ninguém recebe.
              Ativo: envia ao WhatsApp do cliente pelo número do Assistente PULSE (e a cobrança antiga para).
            </p>
            {!data.has_pix && <p className="text-xs text-destructive">Sem chave Pix em Financeiro → Config: a cobrança sai sem o Pix.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">InfinitePay (link do cartão)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-[260px_1fr] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="infinitetag">InfiniteTag</Label>
              <Input id="infinitetag" placeholder="agenciapulse (sem o $)" value={handle} onChange={(e) => setHandle(e.target.value)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              A tag do app da InfinitePay (não é senha). Com ela, cada mensalidade ganha um link no valor da mensalidade (a taxa do cartão a InfinitePay repassa na hora); pagou, a receita é baixada sozinha
              depois de conferida na InfinitePay. Sem ela, a cobrança sai só com o Pix.
            </p>
          </div>
          <PaymentLinksPanel />
        </CardContent>
      </Card>

      {BILLING_STEPS.map((step) => (
        <Card key={step}>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{STEP_LABELS[step]}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              disabled={templates[step] === data.defaults[step]}
              onClick={() => setTemplates((t) => ({ ...t, [step]: data.defaults[step] }))}
            >
              <RotateCcw size={14} className="mr-1" /> Texto aprovado
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Textarea rows={8} value={templates[step]} onChange={(e) => setTemplates((t) => ({ ...t, [step]: e.target.value }))} className="font-mono text-xs" />
            <p className="text-[11px] text-muted-foreground">
              Variáveis: {TEMPLATE_VARS[step].map((v) => `{${v}}`).join(' ')} · linha com variável vazia (ex.: sem link) não sai.
            </p>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Rodapé de todas as mensagens</CardTitle>
          <Button variant="ghost" size="sm" disabled={footer === data.default_footer} onClick={() => setFooter(data.default_footer)}>
            <RotateCcw size={14} className="mr-1" /> Texto aprovado
          </Button>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Textarea rows={3} value={footer} onChange={(e) => setFooter(e.target.value)} className="font-mono text-xs" />
          <p className="text-[11px] text-muted-foreground">
            Vai no fim do relatório, do agradecimento, da cobrança e do lembrete (e no rodapé do PDF): avisa que o número é automático e com quem
            falar. {'{contato_nome}'} e {'{contato_telefone}'} são o contato da cidade do cliente, abaixo. Vazio = sem rodapé.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 pt-2">
            {(['uruacu', 'minacu'] as const).map((city) => {
              const resolved = data.contacts?.[city]?.resolved;
              return (
                <div key={city} className="space-y-1.5 rounded-md border p-2">
                  <div className="text-xs font-semibold">{city === 'uruacu' ? 'Uruaçu' : 'Minaçu'}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder={resolved?.name || 'Nome'} value={contacts[city].name} onChange={(e) => setContacts((c) => ({ ...c, [city]: { ...c[city], name: e.target.value } }))} />
                    <Input placeholder={resolved?.phone || 'Telefone'} value={contacts[city].phone} onChange={(e) => setContacts((c) => ({ ...c, [city]: { ...c[city], phone: e.target.value } }))} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Sai como: {resolved?.name || '—'}{resolved?.phone ? ` · ${resolved.phone}` : ' · sem telefone (a linha do rodapé não sai)'}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="mr-1 animate-spin" />} Salvar cobranças</Button>
    </div>
  );
}

function PaymentLinksPanel() {
  const queryClient = useQueryClient();
  const month = thisMonth();
  const links = useQuery({ queryKey: ['infinitepay-links', month], queryFn: () => fetchPaymentLinks(month) });
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await queryClient.invalidateQueries({ queryKey: ['infinitepay-links'] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!links.data) return null;
  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy || !links.data.handle} onClick={() => run(async () => {
          const d = await createTestLink();
          window.open(d.url, '_blank', 'noopener');
        }, 'Link de teste criado (R$ 1,00)')}>
          Criar link de teste (R$ 1,00)
        </Button>
        <span className="text-[11px] text-muted-foreground">Webhook: {links.data.webhook_url}</span>
      </div>
      {links.data.links.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={l.status === 'pago' ? 'default' : 'outline'}>{l.status === 'pago' ? `pago${l.capture_method ? ` · ${l.capture_method}` : ''}` : 'aberto'}</Badge>
          <span>{l.client || 'teste'} · {brl(Number(l.amount))}</span>
          <a className="text-primary underline truncate max-w-[220px]" href={l.url} target="_blank" rel="noreferrer">{l.url}</a>
          {l.status !== 'pago' && (
            <Button size="sm" variant="ghost" className="h-6 px-2" disabled={busy} onClick={() => run(() => recheckPaymentLink(l.id), 'Conferido na InfinitePay')}>Conferir</Button>
          )}
        </div>
      ))}
    </div>
  );
}
