import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Gift, Loader2, ArrowLeft, Ticket, Tag, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';

const VPS_API = 'https://agenciapulse.tech/api';

interface ClientWithCampaigns {
  client_id: string;
  company_name: string;
  logo_url: string | null;
  color: string;
  campaign_count: number;
  total_available: number;
}

export default function DiscountClubHome() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientWithCampaigns[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const res = await fetch(`${VPS_API}/discount-clubs`);
      const data = await res.json();
      setClients(data.clients || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-white/60 hover:text-white">
            <ArrowLeft size={18} />
          </Button>
          <Gift size={20} className="text-amber-400" />
          <h1 className="text-lg font-bold">Clube de Descontos Pulse</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
            <Tag size={14} className="text-amber-400" />
            <span className="text-xs font-medium text-amber-400">Descontos exclusivos</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Cupons de Desconto
          </h2>
          <p className="text-white/50 max-w-md mx-auto">
            Escolha uma loja parceira e resgate seu cupom de desconto exclusivo
          </p>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : clients.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Store size={48} className="mx-auto text-white/20 mb-4" />
            <p className="text-white/40 text-lg">Nenhuma loja com cupons disponíveis no momento</p>
            <p className="text-white/25 text-sm mt-2">Volte em breve para novos descontos!</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client, i) => (
              <motion.div
                key={client.client_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => navigate(`/clube/${client.client_id}`)}
                className="group cursor-pointer bg-white/[0.04] border border-white/[0.06] rounded-2xl p-6 hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-300"
              >
                <div className="flex items-center gap-4 mb-4">
                  {client.logo_url ? (
                    <img
                      src={client.logo_url}
                      alt={client.company_name}
                      className="w-14 h-14 rounded-xl object-contain bg-white/10 p-1"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-white"
                      style={{ background: `hsl(${client.color})` }}
                    >
                      {client.company_name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate group-hover:text-amber-400 transition-colors">
                      {client.company_name}
                    </h3>
                    <p className="text-xs text-white/40">
                      {client.campaign_count} campanha{client.campaign_count !== 1 ? 's' : ''} ativa{client.campaign_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ticket size={14} className="text-emerald-400" />
                    <span className="text-sm text-emerald-400 font-medium">
                      {client.total_available} cupons disponíveis
                    </span>
                  </div>
                  <span className="text-xs text-white/30 group-hover:text-white/50 transition-colors">
                    Ver →
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
