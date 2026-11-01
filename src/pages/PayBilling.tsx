// Página pública de pagamento da cobrança (/pagar/<token>), pensada primeiro para o celular.
// Pedido do usuário (01/11/2026): "uma forma do cliente copiar o pagamento ou clicar para pagar ... aquele botão de
// clique para copiar". Mostra valor e vencimento, o botão de copiar o Pix copia e cola, o botão do checkout da
// InfinitePay (Pix ou cartão) e o passo a passo. Não abre o app do banco direto: não há padrão que sirva a todos.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { Check, Copy, CreditCard, Loader2 } from 'lucide-react';
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

            {!data.paid && data.card_link && (
              <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
                <a
                  href={data.card_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0E0E10] px-4 py-4 text-base font-bold text-white active:scale-[0.98]"
                >
                  <CreditCard className="h-5 w-5" /> Pagar agora (Pix ou cartão)
                </a>
                <p className="mt-2 text-center text-xs text-[#6B6B73]">Abre o pagamento seguro da InfinitePay. No cartão, em até 12x.</p>
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
