import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Lock, ShieldAlert, Ticket } from 'lucide-react';
import { validatePromoCode, promoAssetUrl } from '@/services/promoApi';

interface LookupResult {
  status: 'allowed' | 'redeemed' | 'confirmed' | 'invalid';
  code?: string;
  participant_name?: string | null;
  participant_phone?: string | null;
  prize?: { name: string; description: string; image_url: string | null } | null;
  redeemed_at?: string | null;
  redeemed_by?: string | null;
  error?: string;
}

function formatMoment(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Portal do atendimento: valida e confirma a entrega dos prêmios. */
export default function PromoValidate() {
  const { slug = '' } = useParams();
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [operator, setOperator] = useState('');
  const [code, setCode] = useState('');
  const [winnerName, setWinnerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function unlock() {
    setLoading(true);
    try {
      // Uma consulta vazia serve como teste de PIN: código ausente devolve 400, PIN errado devolve 401.
      await validatePromoCode({ slug, pin, code: '' });
      setUnlocked(true);
    } catch (error: any) {
      if (error?.status === 400) {
        setUnlocked(true);
      } else {
        toast.error(error?.message || 'PIN incorreto');
      }
    } finally {
      setLoading(false);
    }
  }

  async function lookup() {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await validatePromoCode({ slug, pin, code });
      setResult(data);
      // Pré-preenche com o nome já capturado no jogo, se houver.
      setWinnerName(data?.participant_name || '');
    } catch (error: any) {
      const payload = error?.payload;
      if (payload?.status === 'redeemed') setResult(payload);
      else toast.error(error?.message || 'Código inválido');
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelivery() {
    if (!winnerName.trim()) {
      toast.error('Informe o nome do cliente que está retirando o prêmio.');
      return;
    }
    setLoading(true);
    try {
      const data = await validatePromoCode({
        slug,
        pin,
        code,
        operator_name: operator,
        winner_name: winnerName.trim(),
        confirm: true,
      });
      setResult(data);
      toast.success('Entrega confirmada!');
      setCode('');
      setWinnerName('');
    } catch (error: any) {
      const payload = error?.payload;
      if (payload?.status === 'redeemed') setResult(payload);
      toast.error(error?.message || 'Não foi possível confirmar');
    } finally {
      setLoading(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-5 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8">
          <Lock className="mx-auto h-10 w-10 text-yellow-400" />
          <h1 className="mt-4 text-center text-xl font-bold">Validação de prêmios</h1>
          <p className="mt-1 text-center text-xs text-white/50">Digite o PIN do estabelecimento para acessar.</p>
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            className="mt-6 h-12 border-white/15 bg-black/40 text-center text-lg tracking-widest text-white"
          />
          <Button className="mt-4 h-12 w-full bg-yellow-500 font-bold text-black hover:bg-yellow-400" disabled={loading || !pin} onClick={unlock}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-5 py-10 text-white">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-2">
          <Ticket className="h-6 w-6 text-yellow-400" />
          <h1 className="text-lg font-bold">Validação de prêmios</h1>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <Label className="text-white/70">{operatorLabel}</Label>
            <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Seu nome" className="mt-1 border-white/15 bg-white/5 text-white" />
          </div>
          <div>
            <Label className="text-white/70">Código de resgate</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && lookup()}
              placeholder="A3P-8492"
              className="mt-1 h-14 border-white/15 bg-black/40 text-center text-2xl font-black tracking-widest text-white"
            />
          </div>
          <Button className="h-12 w-full bg-yellow-500 font-bold text-black hover:bg-yellow-400" disabled={loading} onClick={lookup}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Consultar código'}
          </Button>
        </div>

        {result?.status === 'allowed' ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/50 bg-emerald-500/10 p-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="mt-3 text-xs uppercase tracking-widest text-emerald-300">Liberado para entrega</p>
            {result.prize?.image_url ? (
              <img src={promoAssetUrl(result.prize.image_url)} alt={result.prize.name} className="mt-4 h-32 w-32 rounded-xl object-cover" />
            ) : null}
            <p className="mt-3 text-xl font-bold">{result.prize?.name || 'Prêmio'}</p>
            {result.prize?.description ? <p className="mt-1 text-sm text-white/60">{result.prize.description}</p> : null}
            {result.participant_phone ? <p className="mt-2 text-sm text-white/50">{result.participant_phone}</p> : null}
            <div className="mt-5">
              <Label className="text-white/70">Nome do cliente que está retirando</Label>
              <Input
                value={winnerName}
                onChange={(e) => setWinnerName(e.target.value)}
                placeholder="Nome completo"
                className="mt-1 h-12 border-white/15 bg-black/40 text-white"
              />
            </div>
            <Button
              className="mt-6 h-14 w-full bg-emerald-500 text-base font-bold text-black hover:bg-emerald-400"
              disabled={loading || !winnerName.trim()}
              onClick={confirmDelivery}
            >
              Confirmar entrega do prêmio
            </Button>
          </div>
        ) : null}

        {result?.status === 'confirmed' ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/50 bg-emerald-500/10 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="mt-3 text-lg font-bold">Entrega confirmada</p>
            <p className="mt-1 text-sm text-white/60">
              {result.prize?.name} — {result.participant_name ? `${result.participant_name} — ` : ''}
              {formatMoment(result.redeemed_at)} por {result.redeemed_by}
            </p>
          </div>
        ) : null}

        {result?.status === 'redeemed' ? (
          <div className="mt-8 rounded-2xl border border-red-500/50 bg-red-500/10 p-6">
            <ShieldAlert className="h-8 w-8 text-red-400" />
            <p className="mt-3 text-lg font-bold text-red-300">Prêmio já entregue</p>
            <p className="mt-1 text-sm text-white/70">
              {result.prize?.name} entregue em {formatMoment(result.redeemed_at)} por {result.redeemed_by || 'operador'}.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
