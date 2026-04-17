import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Check, X, Ticket, DollarSign, TrendingUp, ShoppingBag, Loader2, Tag, Clock } from 'lucide-react';
import { toast } from 'sonner';

const VPS_API = 'https://agenciapulse.tech/api';

interface DiscountStats {
  total_coupons_issued: number;
  total_claimed: number;
  total_used: number;
  total_available: number;
  total_discount_given: number;
  total_sales_from_coupons: number;
}

interface Coupon {
  id: string;
  campaign_id: string;
  code: string;
  status: string;
  claimed_by_name: string | null;
  claimed_by_phone: string | null;
  claimed_at: string | null;
  used_at: string | null;
  sale_value: number;
}

interface Campaign {
  id: string;
  title: string;
  discount_type: string;
  discount_value: number;
  total_coupons: number;
  coupons_claimed: number;
  is_active: boolean;
}

interface Props {
  clientId: string;
  clientColor: string;
}

export default function PortalDiscountClub({ clientId, clientColor }: Props) {
  const [stats, setStats] = useState<DiscountStats | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [saleValue, setSaleValue] = useState('');
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; coupon?: any; error?: string } | null>(null);

  useEffect(() => {
    loadStats();
  }, [clientId]);

  const loadStats = async () => {
    try {
      const res = await fetch(`${VPS_API}/discount-stats/${clientId}`);
      const data = await res.json();
      setStats(data.stats);
      setCoupons(data.coupons || []);
      setCampaigns(data.campaigns || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyCode.trim()) {
      toast.error('Digite o código do cupom');
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch(`${VPS_API}/discount-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: verifyCode.trim().toUpperCase(),
          client_id: clientId,
          sale_value: saleValue ? parseFloat(saleValue) : 0,
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setVerifyResult({ valid: true, coupon: data.coupon });
        toast.success('Cupom validado e utilizado com sucesso!');
        loadStats();
      } else {
        setVerifyResult({ valid: false, error: data.error });
      }
    } catch (e: any) {
      setVerifyResult({ valid: false, error: e.message || 'Erro de rede' });
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  const usedCoupons = coupons.filter(c => c.status === 'used');
  const claimedCoupons = coupons.filter(c => c.status === 'claimed');

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Cupons Emitidos', value: stats?.total_coupons_issued || 0, icon: Ticket, color: 'text-blue-400' },
          { label: 'Resgatados', value: stats?.total_claimed || 0, icon: Tag, color: 'text-amber-400' },
          { label: 'Utilizados', value: stats?.total_used || 0, icon: Check, color: 'text-emerald-400' },
          { label: 'Disponíveis', value: stats?.total_available || 0, icon: ShoppingBag, color: 'text-violet-400' },
        ].map(s => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4"
          >
            <s.icon size={16} className={`${s.color} mb-2`} />
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-[11px] text-white/40">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Financial stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-rose-400" />
            <span className="text-xs text-white/50">Total em Descontos</span>
          </div>
          <p className="text-2xl font-bold text-rose-400">
            R$ {(stats?.total_discount_given || 0).toFixed(2)}
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-emerald-400" />
            <span className="text-xs text-white/50">Vendas via Cupons</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            R$ {(stats?.total_sales_from_coupons || 0).toFixed(2)}
          </p>
        </motion.div>
      </div>

      {/* Verify coupon */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5"
      >
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Search size={16} style={{ color: `hsl(${clientColor})` }} />
          Verificar e Validar Cupom
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Código do cupom (6 dígitos)"
            value={verifyCode}
            onChange={e => setVerifyCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-sm font-mono tracking-[0.2em] uppercase placeholder:text-white/20 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-white/20"
          />
          <input
            type="number"
            placeholder="Valor da venda (R$)"
            value={saleValue}
            onChange={e => setSaleValue(e.target.value)}
            className="sm:w-40 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <button
            onClick={handleVerify}
            disabled={verifying || !verifyCode.trim()}
            className="px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: `hsl(${clientColor})` }}
          >
            {verifying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Validar
          </button>
        </div>

        {/* Result */}
        {verifyResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 p-4 rounded-xl border ${
              verifyResult.valid
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-rose-500/10 border-rose-500/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {verifyResult.valid ? (
                <>
                  <Check size={16} className="text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-400">Cupom validado com sucesso!</span>
                </>
              ) : (
                <>
                  <X size={16} className="text-rose-400" />
                  <span className="text-sm font-medium text-rose-400">{verifyResult.error}</span>
                </>
              )}
            </div>
            {verifyResult.coupon && (
              <div className="mt-2 text-xs text-white/50">
                Cliente: {verifyResult.coupon.claimed_by_name} • Tel: {verifyResult.coupon.claimed_by_phone}
              </div>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Recent coupons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5"
      >
        <h3 className="text-sm font-semibold mb-4">Cupons Recentes</h3>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {[...usedCoupons, ...claimedCoupons].slice(0, 50).map(coupon => {
            const camp = campaigns.find(c => c.id === coupon.campaign_id);
            return (
              <div
                key={coupon.id}
                className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/[0.03] border border-white/[0.04]"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${coupon.status === 'used' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <div>
                    <span className="font-mono text-sm font-bold tracking-wider">{coupon.code}</span>
                    <p className="text-[11px] text-white/40">
                      {coupon.claimed_by_name} • {coupon.claimed_by_phone}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-medium ${coupon.status === 'used' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {coupon.status === 'used' ? 'Utilizado' : 'Resgatado'}
                  </span>
                  {coupon.status === 'used' && coupon.sale_value > 0 && (
                    <p className="text-[11px] text-white/40">R$ {Number(coupon.sale_value).toFixed(2)}</p>
                  )}
                  {camp && (
                    <p className="text-[10px] text-white/30">{camp.title}</p>
                  )}
                </div>
              </div>
            );
          })}
          {coupons.filter(c => c.status !== 'available').length === 0 && (
            <div className="text-center py-8 text-white/30 text-sm">
              Nenhum cupom resgatado ainda
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
