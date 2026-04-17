import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Ticket, Phone, User, Loader2, Check, Tag, ShoppingBag, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const VPS_API = 'https://agenciapulse.tech/api';

interface Campaign {
  id: string;
  client_id: string;
  title: string;
  description: string;
  discount_type: string;
  discount_value: number;
  min_purchase_value: number;
  total_coupons: number;
  coupons_claimed: number;
  available_coupons: number;
  company_name: string;
  logo_url: string | null;
  color: string;
  expires_at: string | null;
}

function getCountdown(expiresAt: string | null) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { expired: true, d: 0, h: 0, m: 0, s: 0 };
  return {
    expired: false,
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

interface ClaimedCoupon {
  code: string;
  store_name: string;
}

export default function DiscountClub() {
  const { clientId } = useParams<{ clientId: string }>();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [claimedCoupon, setClaimedCoupon] = useState<ClaimedCoupon | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    loadCampaigns();
  }, [clientId]);

  // Live countdown tick every second
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const loadCampaigns = async () => {
    try {
      const res = await fetch(`${VPS_API}/discount-campaigns/${clientId}`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (campaignId: string) => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Preencha nome e telefone');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${VPS_API}/discount-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, name: name.trim(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao resgatar cupom');
        return;
      }
      setClaimedCoupon({ code: data.coupon.code, store_name: data.store_name });
      setShowRegister(null);
      loadCampaigns();
      toast.success('Cupom resgatado com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Erro de rede');
    } finally {
      setSubmitting(false);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const clientColor = campaigns[0]?.color || '217 91% 60%';
  const storeName = campaigns[0]?.company_name || '';
  const logoUrl = campaigns[0]?.logo_url;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${clientColor} / 0.3), transparent)` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#080810]" />
        <div className="relative max-w-2xl mx-auto px-4 pt-12 pb-8 text-center">
          {logoUrl && (
            <img src={logoUrl} alt={storeName} className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4 border-2 border-white/10" />
          )}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-white/70 mb-4">
            <Sparkles size={12} style={{ color: `hsl(${clientColor})` }} />
            Clube de Descontos
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{storeName}</h1>
          <p className="text-white/50 mt-2 text-sm">Resgate seus cupons de desconto exclusivos</p>
        </div>
      </div>

      {/* Claimed coupon success */}
      <AnimatePresence>
        {claimedCoupon && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setClaimedCoupon(null)}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              className="bg-[#12121a] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center"
              initial={{ y: 40 }}
              animate={{ y: 0 }}
            >
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: `hsl(${clientColor} / 0.2)` }}>
                <Check size={32} style={{ color: `hsl(${clientColor})` }} />
              </div>
              <h2 className="text-xl font-bold mb-2">Cupom Resgatado! 🎉</h2>
              <p className="text-white/50 text-sm mb-6">Apresente o código abaixo no caixa da <strong className="text-white">{claimedCoupon.store_name}</strong></p>
              <div className="bg-white/[0.06] border-2 border-dashed rounded-2xl py-6 px-4 mb-4" style={{ borderColor: `hsl(${clientColor} / 0.4)` }}>
                <p className="text-3xl font-mono font-bold tracking-[0.3em]" style={{ color: `hsl(${clientColor})` }}>
                  {claimedCoupon.code}
                </p>
              </div>
              <p className="text-xs text-white/30 mb-6">Você receberá uma confirmação no WhatsApp</p>
              <button
                onClick={() => setClaimedCoupon(null)}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
                style={{ background: `hsl(${clientColor})` }}
              >
                Entendi
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Campaigns */}
      <div className="max-w-2xl mx-auto px-4 pb-12 space-y-4">
        {campaigns.length === 0 && (
          <div className="text-center py-16">
            <Gift size={48} className="mx-auto text-white/10 mb-4" />
            <p className="text-white/40">Nenhum cupom disponível no momento</p>
          </div>
        )}

        {campaigns.map((camp) => {
          const discountLabel = camp.discount_type === 'percentage'
            ? `${camp.discount_value}%`
            : `R$ ${Number(camp.discount_value).toFixed(2)}`;
          const isRegistering = showRegister === camp.id;

          return (
            <motion.div
              key={camp.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag size={14} style={{ color: `hsl(${clientColor})` }} />
                      <span className="text-xs font-medium text-white/50">DESCONTO</span>
                    </div>
                    <h3 className="text-lg font-bold">{camp.title}</h3>
                    {camp.description && <p className="text-sm text-white/50 mt-1">{camp.description}</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" style={{ color: `hsl(${clientColor})` }}>
                      {discountLabel}
                    </div>
                    {camp.min_purchase_value > 0 && (
                      <p className="text-[10px] text-white/30 mt-1">acima de R$ {Number(camp.min_purchase_value).toFixed(2)}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-4 text-xs text-white/40">
                  <span className="flex items-center gap-1">
                    <Ticket size={12} />
                    {camp.available_coupons} disponíveis
                  </span>
                  <span className="flex items-center gap-1">
                    <ShoppingBag size={12} />
                    {camp.coupons_claimed} resgatados
                  </span>
                </div>

                {/* Countdown timer */}
                {(() => {
                  const cd = getCountdown(camp.expires_at);
                  if (!cd) return null;
                  if (cd.expired) {
                    return (
                      <div className="mt-4 py-2 px-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center text-xs font-semibold text-rose-300">
                        ⏱ Promoção encerrada
                      </div>
                    );
                  }
                  const Box = ({ v, l }: { v: number; l: string }) => (
                    <div className="flex flex-col items-center bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-1.5 min-w-[44px]">
                      <span className="text-base font-bold tabular-nums" style={{ color: `hsl(${clientColor})` }}>
                        {String(v).padStart(2, '0')}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-white/40">{l}</span>
                    </div>
                  );
                  return (
                    <div className="mt-4">
                      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2 text-center">⏱ Termina em</p>
                      <div className="flex items-center justify-center gap-1.5">
                        {cd.d > 0 && <Box v={cd.d} l="dias" />}
                        <Box v={cd.h} l="hrs" />
                        <Box v={cd.m} l="min" />
                        <Box v={cd.s} l="seg" />
                      </div>
                    </div>
                  );
                })()}


                {camp.available_coupons > 0 && !isRegistering && (
                  <button
                    onClick={() => { setShowRegister(camp.id); setName(''); setPhone(''); }}
                    className="w-full mt-4 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: `hsl(${clientColor})` }}
                  >
                    🎟️ Resgatar Cupom
                  </button>
                )}

                {camp.available_coupons === 0 && (
                  <div className="mt-4 py-3 rounded-xl text-center text-sm font-medium bg-white/[0.04] text-white/30">
                    Esgotado
                  </div>
                )}

                {/* Mini registration */}
                <AnimatePresence>
                  {isRegistering && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3 bg-white/[0.04] rounded-xl p-4 border border-white/[0.06]">
                        <p className="text-xs text-white/50 text-center">Preencha seus dados para resgatar</p>
                        <div className="relative">
                          <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                          <input
                            type="text"
                            placeholder="Seu nome"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2.5 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/20"
                          />
                        </div>
                        <div className="relative">
                          <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                          <input
                            type="tel"
                            placeholder="(00) 00000-0000"
                            value={phone}
                            onChange={e => setPhone(formatPhone(e.target.value))}
                            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2.5 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/20"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowRegister(null)}
                            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white/[0.06] hover:bg-white/10 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleClaim(camp.id)}
                            disabled={submitting}
                            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                            style={{ background: `hsl(${clientColor})` }}
                          >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                            Confirmar
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center pb-8">
        <p className="text-[10px] text-white/20">Powered by Pulse Growth Marketing</p>
      </div>
    </div>
  );
}
