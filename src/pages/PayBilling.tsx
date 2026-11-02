// Página pública de pagamento da cobrança (/pagar/<token>), pensada primeiro para o celular.
// Pedido do usuário (01/11/2026): "uma forma do cliente copiar o pagamento ou clicar para pagar ... aquele botão de
// clique para copiar". Mostra valor e vencimento, o botão de copiar o Pix copia e cola, o botão do checkout da
// InfinitePay (Pix ou cartão) e o passo a passo. Não abre o app do banco direto: não há padrão que sirva a todos.
// Pix pela chave (02/11/2026, "crie uma forma de autenticar esse pagamento"): depois de pagar, o cliente manda o
// comprovante aqui mesmo; o servidor lê e confere, e a baixa sai quando o dinheiro aparece no banco.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { Check, Copy, CreditCard, FileUp, Loader2 } from 'lucide-react';
import logo from '@/assets/pulse-logo-branco.png';

const VPS_API_BASE = 'https://agenciapulse.tech/api';

export interface PayPageData {
  client: string;
  plan: string | null;
  month: string;
  amount: number;
  due_date: string | null;
  paid: boolean;
  paid_at: string | null;
  pix_payload: string | null;
  pix_key: string | null;
  receiver: string | null;
  card_link: string | null;
  card_amount?: number | null;
  receipt_sent?: boolean;
  pix_auto?: { available: boolean; status: 'ativo' | 'aguardando' | null; dataInicial?: string | null; copiaECola?: string | null };
  pix_dynamic?: boolean;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesNome = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1] || ''} de ${m.slice(0, 4)}`;

/** Copia texto: Clipboard API e, onde ela não existe (navegador antigo, WebView), o jeito antigo com seleção. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
}

export default function PayBilling({ preview }: { preview?: PayPageData }) {
  const { token } = useParams();
  const [data, setData] = useState<PayPageData | null>(preview || null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');
  // depois de copiar o Pix, a página pergunta ao sistema se o Pix caiu (02/11/2026: "na hora que ele paga já recebe o
  // comprovante de recebido"); por até 15 min, de 25 em 25 s
  const [watchSince, setWatchSince] = useState<string | null>(null);
  const [watchMsg, setWatchMsg] = useState('');

  useEffect(() => {
    if (!watchSince || !token || preview || data?.paid) return;
    let stop = false;
    const started = Date.parse(watchSince);
    const tick = async () => {
      if (stop || Date.now() - started > 15 * 60000) return;
      try {
        const r = await fetch(`${VPS_API_BASE}/public/cobranca/${encodeURIComponent(token)}/conferir`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: watchSince }),
        });
        const body = await r.json().catch(() => ({}));
        if (body.paid) {
          setWatchMsg('Pagamento confirmado! O recibo chega pelo WhatsApp.');
          stop = true;
          window.setTimeout(() => window.location.reload(), 2500);
        }
      } catch { /* tenta de novo no próximo ciclo */ }
    };
    const first = window.setTimeout(tick, 20000);
    const timer = window.setInterval(tick, 25000);
    return () => { stop = true; window.clearTimeout(first); window.clearInterval(timer); };
  }, [watchSince, token, preview, data?.paid]);

  useEffect(() => {
    document.title = 'Pagamento · Agência Pulse';
    if (preview) return;
    fetch(`${VPS_API_BASE}/public/cobranca/${encodeURIComponent(token || '')}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || 'Cobrança não encontrada');
        setData(body);
      })
      .catch((e: Error) => setError(e.message));
  }, [token, preview]);

  useEffect(() => {
    if (!data?.pix_payload) return;
    QRCode.toDataURL(data.pix_payload, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(''));
  }, [data?.pix_payload]);

  const copy = async () => {
    if (!data?.pix_payload) return;
    const ok = await copyText(data.pix_payload);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 4000);
    if (ok && (data.pix_dynamic || data.pix_auto?.available) && !watchSince) {
      setWatchSince(new Date().toISOString());
      setWatchMsg('Assim que o seu Pix cair, a confirmação aparece aqui e o recibo vai para o WhatsApp.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F4F6] text-[#161616]" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <header className="bg-[#0E0E10] border-b-4 border-[#F15A24]">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <img src={logo} alt="Pulse" className="h-6" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F15A24]">Pagamento</span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-10 pt-5">
        {!data && !error && (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#F15A24]" /></div>
        )}
        {error && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="font-semibold">Não encontramos esta cobrança.</p>
            <p className="mt-1 text-sm text-[#6B6B73]">Confira o link ou fale com a gente pelo WhatsApp.</p>
          </div>
        )}

        {data && (
          <>
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-[#6B6B73]">{data.client}</p>
              <p className="mt-0.5 text-[15px] font-semibold">Mensalidade de {mesNome(data.month)}{data.plan ? ` · ${data.plan}` : ''}</p>
              <p className="mt-4 text-[40px] font-bold leading-none tracking-tight">{brl(data.amount)}</p>
              {data.paid ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#E8F6EE] px-3 py-1 text-sm font-semibold text-[#1F9D55]">
                  <Check className="h-4 w-4" /> Paga{data.paid_at ? ` em ${dataBr(data.paid_at)}` : ''}. Obrigada!
                </p>
              ) : (
                data.due_date && <p className="mt-3 text-sm text-[#6B6B73]">Vencimento em <b className="text-[#161616]">{dataBr(data.due_date)}</b></p>
              )}
            </section>

            {!data.paid && data.pix_payload && (
              <section className="mt-4 rounded-2xl border-2 border-[#F15A24] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-bold">Pix</p>
                  <span className="rounded-full bg-[#FFF1EB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#F15A24]">preferencial</span>
                </div>

                <button
                  type="button"
                  onClick={copy}
                  className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-base font-bold text-white transition active:scale-[0.98] ${copied ? 'bg-[#1F9D55]' : 'bg-[#F15A24]'}`}
                >
                  {copied ? <><Check className="h-5 w-5" /> Código copiado!</> : <><Copy className="h-5 w-5" /> Copiar código Pix</>}
                </button>
                <p className="mt-2 text-center text-xs text-[#6B6B73]" aria-live="polite">
                  {copied ? 'Agora é só colar no app do seu banco.' : 'O código já leva o valor da mensalidade.'}
                </p>

                <ol className="mt-4 space-y-2 text-sm">
                  {['Toque em “Copiar código Pix”.', 'Abra o app do seu banco e entre em Pix.', 'Escolha “Pix Copia e Cola”, cole e confirme.'].map((t, i) => (
                    <li key={t} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0E0E10] text-xs font-bold text-white">{i + 1}</span>
                      <span className="pt-0.5">{t}</span>
                    </li>
                  ))}
                </ol>

                <details className="mt-4 rounded-xl bg-[#F6F6F8] p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-[#6B6B73]">Ver o código e o QR Code</summary>
                  <p className="mt-2 break-all font-mono text-[11px] leading-relaxed">{data.pix_payload}</p>
                  {qr && <img src={qr} alt="QR Code do Pix" className="mx-auto mt-3 w-44" />}
                  <p className="mt-2 text-center text-[#6B6B73]">No computador? Escaneie o QR Code com o app do banco no celular.</p>
                </details>
                {data.pix_key && (
                  <p className="mt-3 text-xs text-[#6B6B73]">Chave: {data.pix_key}{data.receiver ? ` · ${data.receiver}` : ''}</p>
                )}
              </section>
            )}

            {data.pix_auto?.available && <PixAutoSection token={token || ''} info={data.pix_auto} demo={!!preview} />}

            {/* conta Efí conferida na API (sem taxa): o pagamento é confirmado sozinho, sem comprovante */}
            {!data.paid && data.pix_payload && (data.pix_dynamic || data.pix_auto?.available) && (
              <p aria-live="polite" className="mt-4 rounded-2xl bg-white p-4 text-center text-sm text-[#6B6B73] shadow-sm">
                {watchMsg || 'Pagou pelo Pix? A confirmação é automática em poucos minutos e o recibo chega pelo WhatsApp.'}
              </p>
            )}
            {!data.paid && data.pix_payload && !data.pix_dynamic && !data.pix_auto?.available && <ReceiptUpload token={token || ''} sent={!!data.receipt_sent} demo={!!preview} />}

            {!data.paid && data.card_link && (
              <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
                <a
                  href={data.card_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0E0E10] px-4 py-4 text-base font-bold text-white active:scale-[0.98]"
                >
                  <CreditCard className="h-5 w-5" /> Pagar no cartão
                </a>
                <p className="mt-2 text-center text-xs text-[#6B6B73]">
                  Abre o pagamento seguro da Efí. Em até 12x{data.card_amount ? ` · no cartão, ${brl(data.card_amount)}` : ''}.
                </p>
                <p className="mt-3 text-center text-[11px] leading-snug text-[#8C8C96]">
                  No cartão de crédito há a taxa da transação, cobrada pela facilitadora de pagamentos. A Pulse não cobra nenhum valor a mais.
                </p>
              </section>
            )}

            <p className="mt-6 text-center text-xs text-[#8C8C96]">
              {data.paid ? '' : 'Se já pagou, pode desconsiderar. '}Agência Pulse · @agenciapulse
            </p>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * "Já pagou?": o botão confere o Pix na conta na hora (API da Efí, sem cobrança) e, se não achar, o comprovante (foto
 * ou PDF) vai para a conferência. Pago, a página recarrega e mostra "Paga".
 */
function ReceiptUpload({ token, sent, demo }: { token: string; sent: boolean; demo: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'revisar' | 'erro'>(sent ? 'ok' : 'idle');
  const [message, setMessage] = useState(sent ? 'Comprovante recebido. Assim que o pagamento for confirmado, você recebe o recibo pelo WhatsApp.' : '');

  const send = async (file: File | undefined) => {
    if (!file || demo) return;
    setState('sending');
    setMessage('');
    try {
      const form = new FormData();
      form.append('arquivo', file);
      const r = await fetch(`${VPS_API_BASE}/public/cobranca/${encodeURIComponent(token)}/comprovante`, { method: 'POST', body: form });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Não deu para enviar. Tente de novo.');
      setState(body.status === 'revisar' ? 'revisar' : 'ok');
      setMessage(body.message || '');
      if (body.status === 'pago') window.setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      setState('erro');
      setMessage((e as Error).message);
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  const check = async () => {
    if (demo) return;
    setChecking(true);
    setMessage('');
    try {
      const r = await fetch(`${VPS_API_BASE}/public/cobranca/${encodeURIComponent(token)}/conferir`, { method: 'POST' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Não deu para conferir agora. Tente de novo.');
      setState(body.paid ? 'ok' : 'idle');
      setMessage(body.message || '');
      if (body.paid) window.setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      setState('erro');
      setMessage((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-[15px] font-bold">Já pagou?</p>
      <p className="mt-1 text-sm text-[#6B6B73]">Toque para conferirmos o seu Pix agora. Se preferir, envie o comprovante.</p>
      <button
        type="button"
        onClick={check}
        disabled={checking || state === 'sending'}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0E0E10] px-4 py-3.5 text-base font-bold text-white active:scale-[0.98] disabled:opacity-60"
      >
        {checking ? <><Loader2 className="h-5 w-5 animate-spin" /> Conferindo…</> : <><Check className="h-5 w-5" /> Já paguei</>}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => send(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={state === 'sending'}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#0E0E10] px-4 py-3.5 text-base font-bold active:scale-[0.98] disabled:opacity-60"
      >
        {state === 'sending' ? <><Loader2 className="h-5 w-5 animate-spin" /> Enviando…</> : <><FileUp className="h-5 w-5" /> {state === 'ok' ? 'Enviar outro comprovante' : 'Enviar comprovante'}</>}
      </button>
      {message && (
        <p aria-live="polite" className={`mt-3 text-center text-sm ${state === 'ok' ? 'text-[#1F9D55]' : 'text-[#B4232C]'}`}>
          {state === 'ok' && <Check className="mr-1 inline h-4 w-4" />}{message}
        </p>
      )}
      <p className="mt-2 text-center text-[11px] text-[#8C8C96]">Foto da tela (print) ou PDF do comprovante.</p>
    </section>
  );
}

/**
 * Pix Automático (02/11/2026): o cliente informa o titular da conta, recebe o código e autoriza no app do banco. O débito
 * é só no vencimento, a partir do mês seguinte; cancela quando quiser pelo próprio banco.
 */
function PixAutoSection({ token, info, demo }: {
  token: string; demo: boolean;
  info: { status: 'ativo' | 'aguardando' | null; dataInicial?: string | null; copiaECola?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState('');
  const [nome, setNome] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState(info.copiaECola || '');
  const [inicio, setInicio] = useState(info.dataInicial || '');
  const [copied, setCopied] = useState(false);

  if (info.status === 'ativo') {
    return (
      <section className="mt-4 rounded-2xl bg-[#E8F6EE] p-4 text-sm text-[#1F6B3E]">
        <p className="font-bold">Pix Automático ativo ✓</p>
        <p className="mt-1">A mensalidade é debitada só no dia do vencimento. Para cancelar, é pelo app do seu banco, quando quiser.</p>
      </section>
    );
  }

  const activate = async () => {
    if (demo) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${VPS_API_BASE}/public/cobranca/${encodeURIComponent(token)}/pix-automatico`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documento: doc, nome }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Não deu para ativar agora. Tente de novo.');
      setCode(body.copiaECola || '');
      setInicio(body.dataInicial || '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(code);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 4000);
  };

  return (
    <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <p className="text-[15px] font-bold">Pix Automático</p>
        <span className="rounded-full bg-[#EEF4FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#2B5BD7]">novo</span>
      </div>
      <p className="mt-1 text-sm text-[#6B6B73]">
        Não precisa pagar na mão todo mês: a mensalidade é debitada só no dia do vencimento. Você cancela quando quiser, pelo app do seu banco.
      </p>

      {code ? (
        <>
          <button type="button" onClick={copy}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-base font-bold text-white active:scale-[0.98] ${copied ? 'bg-[#1F9D55]' : 'bg-[#2B5BD7]'}`}>
            {copied ? <><Check className="h-5 w-5" /> Código copiado!</> : <><Copy className="h-5 w-5" /> Copiar código de autorização</>}
          </button>
          <ol className="mt-4 space-y-2 text-sm">
            {['Abra o app do seu banco e entre em Pix.', 'Escolha "Pix Copia e Cola" e cole o código.', 'Confira e autorize o Pix Automático.'].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0E0E10] text-xs font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>
          {inicio && (
            <p className="mt-3 text-xs text-[#6B6B73]">
              O primeiro débito é em {dataBr(inicio)}. A mensalidade deste mês continua pelo Pix acima.
            </p>
          )}
        </>
      ) : open ? (
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="font-semibold">CPF ou CNPJ do titular da conta</span>
            <input value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" autoComplete="off"
              className="mt-1 w-full rounded-xl border border-[#D9D9DE] px-3 py-3 text-base" placeholder="só os números" />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Nome do titular</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name"
              className="mt-1 w-full rounded-xl border border-[#D9D9DE] px-3 py-3 text-base" placeholder="como está no banco" />
          </label>
          <button type="button" onClick={activate} disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2B5BD7] px-4 py-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-60">
            {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Gerando…</> : 'Gerar código de autorização'}
          </button>
          {error && <p className="text-center text-sm text-[#B4232C]" aria-live="polite">{error}</p>}
          <p className="text-center text-[11px] text-[#8C8C96]">O CPF ou CNPJ vai só para o banco autorizar o débito.</p>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#2B5BD7] px-4 py-3.5 text-base font-bold text-[#2B5BD7] active:scale-[0.98]">
          Ativar Pix Automático
        </button>
      )}
    </section>
  );
}
