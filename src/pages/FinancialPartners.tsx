import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Handshake, DollarSign, TrendingUp, Users } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';

interface PartnerPlan {
  id: string;
  name: string;
  price: number;
  partner_id: string;
  partner_cost: number;
}

interface PartnerData {
  id: string;
  user_id: string;
  company_name: string | null;
  service_function: string;
  fixed_rate: number;
  profileName?: string;
}

interface ContractWithPlan {
  id: string;
  client_id: string;
  plan_id: string | null;
  contract_value: number;
  status: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function FinancialPartners() {
  const { clients } = useApp();
  const [partners, setPartners] = useState<PartnerData[]>([]);
  const [partnerPlans, setPartnerPlans] = useState<PartnerPlan[]>([]);
  const [contracts, setContracts] = useState<ContractWithPlan[]>([]);
  const [revenues, setRevenues] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [partnersRes, plansRes, contractsRes, revenuesRes] = await Promise.all([
        supabase.from('partners').select('*'),
        supabase.from('plans').select('id, name, price, partner_id, partner_cost, is_partner_plan').eq('is_partner_plan', true),
        supabase.from('financial_contracts').select('*').eq('status', 'ativo'),
        supabase.from('revenues').select('*'),
      ]);

      let partnerData = (partnersRes.data || []) as PartnerData[];

      // Fetch profile names
      const userIds = partnerData.map(p => p.user_id);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, name, display_name').in('id', userIds);
        if (profiles) {
          const nameMap: Record<string, string> = {};
          profiles.forEach((p: any) => { nameMap[p.id] = p.display_name || p.name; });
          partnerData = partnerData.map(p => ({ ...p, profileName: nameMap[p.user_id] }));
        }
      }

      setPartners(partnerData);
      setPartnerPlans((plansRes.data || []) as PartnerPlan[]);
      setContracts((contractsRes.data || []) as ContractWithPlan[]);
      setRevenues(revenuesRes.data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const monthStart = useMemo(() => startOfMonth(new Date(selectedMonth + '-01T12:00:00')), [selectedMonth]);

  // Calculate financials per partner
  const partnerFinancials = useMemo(() => {
    const referenceMonth = format(monthStart, 'yyyy-MM-dd');

    return partners.map(partner => {
      // Plans associated with this partner
      const plans = partnerPlans.filter(p => p.partner_id === partner.id);
      const planIds = plans.map(p => p.id);

      // Active contracts using these plans
      const activeContracts = contracts.filter(c => c.plan_id && planIds.includes(c.plan_id));

      // Month revenues from these contracts
      const contractIds = activeContracts.map(c => c.id);
      const monthRevs = revenues.filter(r =>
        contractIds.includes(r.contract_id) && r.reference_month === referenceMonth
      );

      const totalRevenue = monthRevs.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
      const totalPaid = monthRevs.filter((r: any) => r.status === 'paga').reduce((sum: number, r: any) => sum + Number(r.amount), 0);

      // Partner cost based on plans
      let partnerEarnings = 0;
      activeContracts.forEach(c => {
        const plan = plans.find(p => p.id === c.plan_id);
        if (plan) partnerEarnings += Number(plan.partner_cost);
      });

      const profit = totalRevenue - partnerEarnings;
      const clientCount = activeContracts.length;

      return {
        partner,
        plans,
        clientCount,
        totalRevenue,
        totalPaid,
        partnerEarnings,
        profit,
        activeContracts,
      };
    });
  }, [partners, partnerPlans, contracts, revenues, monthStart]);

  const totals = useMemo(() => ({
    revenue: partnerFinancials.reduce((s, p) => s + p.totalRevenue, 0),
    partnerCost: partnerFinancials.reduce((s, p) => s + p.partnerEarnings, 0),
    profit: partnerFinancials.reduce((s, p) => s + p.profit, 0),
    clients: partnerFinancials.reduce((s, p) => s + p.clientCount, 0),
  }), [partnerFinancials]);

  const months = useMemo(() => {
    const m = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      m.push(format(d, 'yyyy-MM'));
    }
    return m;
  }, []);

  if (loading) return <p className="text-muted-foreground p-6">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Handshake size={24} /> Parceiros - Financeiro</h1>
          <p className="text-sm text-muted-foreground">Acompanhe faturamento, custos e lucro por parceiro</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {format(new Date(m + '-01T12:00:00'), 'MMMM yyyy', { locale: ptBR })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-info/10"><DollarSign size={20} className="text-info" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Faturamento Parceiros</p>
                  <p className="text-xl font-bold">R$ {totals.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10"><Handshake size={20} className="text-destructive" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Custo Parceiros</p>
                  <p className="text-xl font-bold">R$ {totals.partnerCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={2}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10"><TrendingUp size={20} className="text-success" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Lucro com Parceiros</p>
                  <p className="text-xl font-bold">R$ {totals.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3}>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><Users size={20} className="text-primary" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Clientes com Parceiro</p>
                  <p className="text-xl font-bold">{totals.clients}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Per-partner breakdown */}
      {partnerFinancials.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Handshake size={40} className="text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhum parceiro cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {partnerFinancials.map(({ partner, plans, clientCount, totalRevenue, partnerEarnings, profit }) => (
            <motion.div key={partner.id} variants={fadeUp} initial="hidden" animate="visible" custom={0}>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Handshake size={16} className="text-purple-600" />
                        {partner.company_name || partner.profileName || 'Parceiro'}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{partner.service_function} · {clientCount} cliente(s)</p>
                    </div>
                    <Badge variant="outline">R$ {Number(partner.fixed_rate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/serviço</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Faturamento</p>
                      <p className="text-lg font-bold">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Custo Parceiro</p>
                      <p className="text-lg font-bold text-destructive">R$ {partnerEarnings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lucro</p>
                      <p className={`text-lg font-bold ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                        R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  {plans.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {plans.map(p => (
                        <Badge key={p.id} variant="secondary" className="text-[10px]">{p.name}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
