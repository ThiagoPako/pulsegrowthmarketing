import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Gift, Loader2, ShieldCheck, Ticket, Volume2, VolumeX } from 'lucide-react';
import RouletteWheel from '@/components/promo/RouletteWheel';
import ScratchCard from '@/components/promo/ScratchCard';
import {
  fetchPromoTicketState,
  playPromoTicket,
  type PromoPlayResult,
  promoAssetUrl,
  type PromoPublicState,
} from '@/services/promoApi';

type Step = 'loading' | 'blocked' | 'lead' | 'choose' | 'roulette' | 'scratch' | 'voucher';

function celebrate() {
  confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors: ['#FACC15', '#E11D48', '#ffffff'] });
  setTimeout(() => confetti({ particleCount: 90, spread: 110, origin: { y: 0.4 } }), 350);
}

function playChime(muted: boolean) {
  if (muted) return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    /* som é opcional */
  }
}

export default function PromoGame() {
  const { slug = '', token = '' } = useParams();
  const [state, setState] = useState<PromoPublicState | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [blockedMessage, setBlockedMessage] = useState('');
  const [muted, setMuted] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PromoPlayResult | null>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [wheelPhase, setWheelPhase] = useState<'idle' | 'spinning' | 'stopping'>('idle');
  const [form, setForm] = useState({ name: '', phone: '', document: '', lgpd: false });

  const campaign = state?.campaign;
  const accent = campaign?.accent_color || '#E11D48';

  const wheelSlices = useMemo(() => {
    const prizes = (state?.prizes || []).map((p) => ({ id: p.id, label: p.name, imageUrl: p.image_url ? promoAssetUrl(p.image_url) : null }));
    const filler = { id: 'retry', label: 'Tente novamente' };
    const base = prizes.length ? prizes : [filler];
    return base.length < 6 ? [...base, ...Array.from({ length: 6 - base.length }, (_, i) => ({ ...filler, id: `retry-${i}` }))] : base;
  }, [state?.prizes]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPromoTicketState(slug, token);
        if (cancelled) return;
        setState(data);
        if (!data.ticket) {
          setBlockedMessage('Este QR Code não é válido. Abasteça na rede para garantir um novo bilhete!');
          setStep('blocked');
        } else if (data.ticket.status === 'playable') {
          setStep(data.campaign.require_lead_capture ? 'lead' : 'choose');
        } else if (data.ticket.status === 'revealed' || data.ticket.status === 'redeemed') {
          setResult({
            won: !!data.ticket.prize,
            prize: data.ticket.prize
              ? { id: '', name: data.ticket.prize.name, description: data.ticket.prize.description, image_url: data.ticket.prize.image_url }
              : null,
            redemption_code: data.ticket.redemption_code || null,
          });
          setStep('voucher');
        } else {
          setBlockedMessage('Este QR Code já foi utilizado. Abasteça na rede para garantir um novo bilhete!');
          setStep('blocked');
        }
      } catch (error: any) {
        if (cancelled) return;
        setBlockedMessage(error?.message || 'Não foi possível abrir este sorteio.');
        setStep('blocked');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  async function startGame(game: 'roulette' | 'scratch') {
    if (submitting) return;
    setSubmitting(true);
    try {
      const played = await playPromoTicket({
        slug,
        token,
        game_type: game,
        name: form.name,
        phone: form.phone,
        document: form.document,
        lgpd_accepted: form.lgpd,
      });
      setResult(played);
      if (game === 'roulette') {
        const index = played.prize
          ? Math.max(0, wheelSlices.findIndex((s) => s.id === played.prize?.id))
          : wheelSlices.findIndex((s) => s.id.startsWith('retry'));
        // O resultado já está decidido no servidor, mas só revelamos quando o
        // jogador clicar em "Parar" — assim ele sente que controla a roleta.
        setPendingIndex(index >= 0 ? index : 0);
        setTargetIndex(null);
        setWheelPhase('idle');
        setStep('roulette');
      } else {
        setStep('scratch');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível jogar agora.');
      if (error?.status === 409) {
        setBlockedMessage('Este QR Code já foi utilizado. Abasteça na rede para garantir um novo bilhete!');
        setStep('blocked');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function finishReveal() {
    playChime(muted);
    if (result?.won) celebrate();
    setStep('voucher');
  }

  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen bg-[#0a0a0a] text-white" style={{ backgroundImage: `radial-gradient(circle at 50% 0%, ${accent}33, transparent 60%)` }}>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {campaign?.logo_url ? (
              <img src={promoAssetUrl(campaign.logo_url)} alt={campaign.title} className="h-9 w-auto" />
            ) : (
              <Ticket className="h-6 w-6" style={{ color: accent }} />
            )}
            <span className="text-sm font-semibold tracking-wide text-white/80">Sorteios de Prêmios</span>
          </div>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="rounded-full border border-white/15 p-2 text-white/70"
            aria-label={muted ? 'Ativar som' : 'Desativar som'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </header>
        {content}
        {campaign?.rules_text ? (
          <button type="button" onClick={() => setRulesOpen(true)} className="mt-8 text-center text-xs text-white/50 underline">
            Ler o regulamento completo
          </button>
        ) : null}
      </div>

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Regulamento</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{campaign?.rules_text}</p>
          {campaign?.lgpd_terms_text ? (
            <p className="whitespace-pre-wrap border-t pt-3 text-xs text-muted-foreground">{campaign.lgpd_terms_text}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );

  if (step === 'loading') {
    return shell(
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (step === 'blocked') {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-5 rounded-full border border-white/10 bg-white/5 p-5">
          <Ticket className="h-10 w-10 text-white/60" />
        </div>
        <h1 className="text-xl font-bold">Cupom indisponível</h1>
        <p className="mt-3 text-sm text-white/60">{blockedMessage}</p>
      </div>
    );
  }

  if (step === 'lead') {
    return shell(
      <div className="flex flex-1 flex-col justify-center">
        {campaign?.banner_url ? <img src={promoAssetUrl(campaign.banner_url)} alt="" className="mb-6 w-full rounded-2xl" /> : null}
        <h1 className="text-2xl font-extrabold leading-tight">{campaign?.title}</h1>
        <p className="mt-2 text-sm text-white/60">Preencha seus dados para liberar o seu bilhete da sorte.</p>
        <div className="mt-6 space-y-4">
          <div>
            <Label className="text-white/70">Nome completo</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 border-white/15 bg-white/5 text-white" placeholder="Seu nome" />
          </div>
          <div>
            <Label className="text-white/70">WhatsApp</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 border-white/15 bg-white/5 text-white" placeholder="(00) 00000-0000" inputMode="tel" />
          </div>
          {campaign?.require_document ? (
            <div>
              <Label className="text-white/70">CPF</Label>
              <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} className="mt-1 border-white/15 bg-white/5 text-white" placeholder="000.000.000-00" inputMode="numeric" />
            </div>
          ) : null}
          <label className="flex items-start gap-3 text-xs text-white/70">
            <Checkbox checked={form.lgpd} onCheckedChange={(v) => setForm({ ...form, lgpd: v === true })} className="mt-0.5 border-white/30" />
            <span>
              Concordo em receber novidades e promoções nos termos da LGPD.{' '}
              <button type="button" className="underline" onClick={() => setRulesOpen(true)}>
                Ler termos
              </button>
            </span>
          </label>
          <Button
            className="h-12 w-full text-base font-bold"
            style={{ backgroundColor: accent }}
            disabled={!form.name || !form.phone || !form.lgpd}
            onClick={() => setStep('choose')}
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'choose') {
    return shell(
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-2xl font-extrabold leading-tight">Escolha como quer ganhar</h1>
        <p className="mt-2 text-sm text-white/60">Você tem 1 chance com este cupom. Boa sorte!</p>
        <div className="mt-8 space-y-4">
          <button
            type="button"
            disabled={submitting}
            onClick={() => startGame('roulette')}
            className="w-full rounded-2xl border border-yellow-500/40 bg-gradient-to-br from-black to-neutral-900 p-6 text-left transition-transform active:scale-[.98]"
          >
            <span className="text-3xl">🎡</span>
            <p className="mt-3 text-lg font-bold">Girar a Roleta</p>
            <p className="text-xs text-white/50">Gire e veja onde a sorte para.</p>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => startGame('scratch')}
            className="w-full rounded-2xl border border-yellow-500/40 bg-gradient-to-br from-black to-neutral-900 p-6 text-left transition-transform active:scale-[.98]"
          >
            <span className="text-3xl">🎟️</span>
            <p className="mt-3 text-lg font-bold">Raspadinha da Sorte</p>
            <p className="text-xs text-white/50">Raspe com o dedo e descubra o prêmio.</p>
          </button>
        </div>
        {submitting ? <p className="mt-6 text-center text-xs text-white/50">Preparando seu bilhete…</p> : null}
      </div>
    );
  }

  if (step === 'roulette') {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center">
        <h1 className="mb-6 text-center text-xl font-extrabold">
          {wheelPhase === 'idle' ? 'É sua vez! Toque em GIRAR' : wheelPhase === 'spinning' ? 'Girando… toque em PARAR!' : 'A roleta está parando…'}
        </h1>
        <RouletteWheel
          slices={wheelSlices}
          targetIndex={targetIndex}
          continuousSpin={wheelPhase === 'spinning'}
          accentColor={accent}
          onSpinEnd={finishReveal}
        />
        <div className="mt-8 flex w-full justify-center">
          {wheelPhase === 'idle' ? (
            <button
              type="button"
              onClick={() => {
                setWheelPhase('spinning');
                if (navigator.vibrate) navigator.vibrate(15);
              }}
              className="h-20 w-40 rounded-2xl text-xl font-black uppercase tracking-widest text-black shadow-[0_10px_40px_rgba(250,204,21,.35)] transition-transform active:scale-95"
              style={{ background: 'linear-gradient(180deg,#FDE68A,#FACC15 45%,#B45309)' }}
            >
              Girar
            </button>
          ) : wheelPhase === 'spinning' ? (
            <button
              type="button"
              onClick={() => {
                setWheelPhase('stopping');
                setTargetIndex(pendingIndex ?? 0);
                if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
              }}
              className="h-20 w-40 animate-pulse rounded-2xl text-xl font-black uppercase tracking-widest text-white shadow-[0_10px_40px_rgba(225,29,72,.45)] transition-transform active:scale-95"
              style={{ background: 'linear-gradient(180deg,#FB7185,#E11D48 45%,#7F1D1D)' }}
            >
              Parar
            </button>
          ) : (
            <p className="text-xs text-white/50">Prendendo a respiração…</p>
          )}
        </div>
      </div>
    );
  }

  if (step === 'scratch') {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center">
        <h1 className="mb-6 text-center text-xl font-extrabold">Raspe para descobrir</h1>
        <ScratchCard className="h-64 w-full border border-yellow-500/40" onRevealed={finishReveal}>
          <div className="flex h-64 w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-neutral-900 to-black p-6 text-center">
            {result?.prize?.image_url ? (
              <img src={promoAssetUrl(result.prize.image_url)} alt={result.prize.name} className="h-24 w-24 rounded-xl object-cover" />
            ) : (
              <Gift className="h-12 w-12" style={{ color: accent }} />
            )}
            <p className="text-lg font-bold">{result?.won ? result?.prize?.name : 'Não foi dessa vez!'}</p>
          </div>
        </ScratchCard>
        <p className="mt-5 text-xs text-white/50">Passe o dedo sobre a camada dourada.</p>
      </div>
    );
  }

  // Voucher
  return shell(
    <div className="flex flex-1 flex-col justify-center">
      {result?.won ? (
        <div className="rounded-3xl border border-yellow-500/50 bg-gradient-to-b from-neutral-900 to-black p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">Você ganhou</p>
          {result.prize?.image_url ? (
            <img src={promoAssetUrl(result.prize.image_url)} alt={result.prize.name} className="mx-auto mt-4 h-36 w-36 rounded-2xl object-cover" />
          ) : (
            <Gift className="mx-auto mt-4 h-16 w-16" style={{ color: accent }} />
          )}
          <h1 className="mt-4 text-2xl font-extrabold">{result.prize?.name}</h1>
          {result.prize?.description ? <p className="mt-2 text-sm text-white/60">{result.prize.description}</p> : null}

          <div className="mt-6 rounded-2xl border border-dashed border-yellow-500/60 bg-yellow-500/10 p-5">
            <p className="text-xs uppercase tracking-widest text-yellow-300">Código de resgate</p>
            <p className="mt-1 text-4xl font-black tracking-widest text-yellow-300">{result.redemption_code}</p>
            <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-yellow-200/80">
              <ShieldCheck className="h-3.5 w-3.5" /> Código de segurança validado
            </p>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-white/60">
            Atenção: apresente este código ao frentista ou no caixa da conveniência para retirar seu prêmio.
            Não é possível resgatar sem o código de validação!
          </p>
          <Button className="mt-6 h-12 w-full font-bold" style={{ backgroundColor: accent }} onClick={() => window.print()}>
            Salvar comprovante
          </Button>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-4xl">🍀</p>
          <h1 className="mt-4 text-xl font-bold">Não foi dessa vez!</h1>
          <p className="mt-2 text-sm text-white/60">Abasteça novamente e ganhe um novo bilhete para tentar a sorte.</p>
        </div>
      )}
    </div>
  );
}
