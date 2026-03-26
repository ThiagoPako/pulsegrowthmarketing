import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { supabase as vpsDb } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import pulseLogo from '@/assets/pulse_logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  FileText, Plus, Trash2, CalendarIcon, Download, Eye, Users, Rocket,
  CheckCircle2, Film, Palette, Scissors, Camera, Monitor, Share2, BarChart3,
  Clock, Gift, AlertTriangle, X, Link2, Copy, ExternalLink, List, Code, Megaphone,
  Sparkles, Loader2, UserPlus, DollarSign, Target, CalendarDays, ListChecks, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type ProposalType = 'marketing' | 'sistema' | 'endomarketing' | 'personalizada' | 'cronograma';

interface BonusService {
  id: string;
  name: string;
  value: number;
  description: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

interface SystemScopeItem {
  id: string;
  description: string;
}

interface SystemDeliverable {
  id: string;
  name: string;
  description: string;
}

interface TimelineDeliverable {
  id: string;
  name: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  estimatedDays: number;
  phase: number;
}

interface TimelinePhase {
  number: number;
  name: string;
  description: string;
  durationDays: number;
}

const IMPLEMENTATION_FEES = {
  adAccounts: { label: 'Implementação de contas de anúncios', value: 800 },
  profileRedesign: { label: 'Reformulação de perfil', value: 750 },
  internalIntegration: { label: 'Integração interna, editorial e portal do cliente', value: 1250 },
};

const INTERNAL_PROCESS_STEPS = [
  { icon: Camera, title: 'Captação de Conteúdo', description: 'Gravação profissional com videomaker dedicado conforme calendário' },
  { icon: Scissors, title: 'Edição Profissional', description: 'Edição de vídeos com tratamento de cor, legendas e efeitos' },
  { icon: Palette, title: 'Design Gráfico', description: 'Criação de artes, criativos e identidade visual para redes' },
  { icon: FileText, title: 'Roteirização', description: 'Planejamento estratégico de conteúdo e criação de roteiros' },
  { icon: Share2, title: 'Gestão de Redes', description: 'Publicação, programação e gerenciamento das redes sociais' },
  { icon: BarChart3, title: 'Tráfego Pago', description: 'Gestão de campanhas patrocinadas para aumentar resultados' },
  { icon: Monitor, title: 'Portal do Cliente', description: 'Acesso exclusivo para acompanhar aprovações e resultados' },
];

const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  marketing: 'Marketing Digital',
  sistema: 'Sistema / Software',
  endomarketing: 'Endomarketing',
  personalizada: 'Proposta Única',
  cronograma: 'Cronograma Completo',
};

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto Bancário' },
  { value: 'cartao', label: 'Cartão de Crédito' },
  { value: 'transferencia', label: 'Transferência Bancária' },
];

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
  return Promise.resolve();
}

export default function CommercialProposal() {
  const { user } = useAuth();
  const { users } = useApp();

  // Common fields
  const [proposalType, setProposalType] = useState<ProposalType>('marketing');
  const [clientName, setClientName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [validityDate, setValidityDate] = useState<Date>(addDays(new Date(), 7));
  const [bonusServices, setBonusServices] = useState<BonusService[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [customDiscount, setCustomDiscount] = useState(0);
  const [observations, setObservations] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [savingProposal, setSavingProposal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [showSavedProposals, setShowSavedProposals] = useState(false);
  const proposalRef = useRef<HTMLDivElement>(null);

  // Marketing fields
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [hasContract, setHasContract] = useState(true);
  const [newBonusName, setNewBonusName] = useState('');
  const [newBonusValue, setNewBonusValue] = useState('');
  const [newBonusDesc, setNewBonusDesc] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');

  // System fields
  const [systemScope, setSystemScope] = useState<SystemScopeItem[]>([]);
  const [systemDeliverables, setSystemDeliverables] = useState<SystemDeliverable[]>([]);
  const [systemValue, setSystemValue] = useState('');
  const [systemPaymentMethod, setSystemPaymentMethod] = useState('pix');
  const [systemInstallments, setSystemInstallments] = useState('1');
  const [systemAdditionalCosts, setSystemAdditionalCosts] = useState('');
  const [systemTimeline, setSystemTimeline] = useState('');
  const [newScopeItem, setNewScopeItem] = useState('');
  const [newDeliverableName, setNewDeliverableName] = useState('');
  const [newDeliverableDesc, setNewDeliverableDesc] = useState('');
  const [systemFunctionsDesc, setSystemFunctionsDesc] = useState('');
  const [generatingModules, setGeneratingModules] = useState(false);

  // Endomarketing fields
  const [endoPlan, setEndoPlan] = useState('');
  const [endoDaysPerWeek, setEndoDaysPerWeek] = useState('3');
  const [endoSessionDuration, setEndoSessionDuration] = useState('2');
  const [endoStoriesPerDay, setEndoStoriesPerDay] = useState('5');
  const [endoMonthlyValue, setEndoMonthlyValue] = useState('');
  const [endoDescription, setEndoDescription] = useState('');

  // Personalizada fields
  const [customVideos, setCustomVideos] = useState('');
  const [customStories, setCustomStories] = useState('');
  const [customEventCoverage, setCustomEventCoverage] = useState('');
  const [customSocialMedia, setCustomSocialMedia] = useState(false);
  const [customArts, setCustomArts] = useState('');
  const [customTrafficMgmt, setCustomTrafficMgmt] = useState(false);
  const [customMonthlyValue, setCustomMonthlyValue] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customPaymentMethod, setCustomPaymentMethod] = useState('pix');
  const [customInstallments, setCustomInstallments] = useState('1');
  const [customRecordings, setCustomRecordings] = useState('');

  // Cronograma fields
  const [cronogramaDesc, setCronogramaDesc] = useState('');
  const [cronogramaDeliverables, setCronogramaDeliverables] = useState<TimelineDeliverable[]>([]);
  const [cronogramaPhases, setCronogramaPhases] = useState<TimelinePhase[]>([]);
  const [cronogramaMethodology, setCronogramaMethodology] = useState('');
  const [cronogramaProjectName, setCronogramaProjectName] = useState('');
  const [cronogramaTotalDays, setCronogramaTotalDays] = useState('');
  const [cronogramaPaymentMethod, setCronogramaPaymentMethod] = useState('pix');
  const [cronogramaInstallments, setCronogramaInstallments] = useState('1');
  const [generatingTimeline, setGeneratingTimeline] = useState(false);
  const { data: plans = [] } = useQuery({
    queryKey: ['plans-proposal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').eq('status', 'ativo').order('price', { ascending: true });
      if (error) console.error('Plans query error:', error);
      return (data as any[]) || [];
    },
  });

  const { data: endoPackages = [] } = useQuery({
    queryKey: ['endo-packages-proposal'],
    queryFn: async () => {
      const { data } = await supabase.from('endomarketing_packages').select('*').order('package_name');
      return (data as any[]) || [];
    },
  });

  const { data: savedProposals = [], refetch: refetchProposals } = useQuery({
    queryKey: ['saved-proposals'],
    queryFn: async () => {
      const { data } = await vpsDb.from('commercial_proposals').select('*').order('created_at', { ascending: false });
      return (data as any[]) || [];
    },
  });

  const selectedPlan = plans.find((p: any) => p.id === selectedPlanId);

  const totalImplementation = !hasContract
    ? Object.values(IMPLEMENTATION_FEES).reduce((s, f) => s + f.value, 0)
    : 0;

  const bonusTotal = bonusServices.reduce((s, b) => s + b.value, 0);
  const planPrice = selectedPlan?.price || 0;
  const monthlyTotal = planPrice + bonusTotal;
  const sixMonthTotal = (monthlyTotal * 6) + totalImplementation;
  const annualTotal = monthlyTotal * 12;
  const annualWithDiscount = annualTotal * (1 - customDiscount / 100);

  const addBonus = () => {
    if (!newBonusName) return;
    setBonusServices(prev => [...prev, {
      id: crypto.randomUUID(),
      name: newBonusName,
      value: parseFloat(newBonusValue) || 0,
      description: newBonusDesc,
    }]);
    setNewBonusName(''); setNewBonusValue(''); setNewBonusDesc('');
  };

  const addTeamMember = () => {
    if (!newMemberName || !newMemberRole) return;
    setTeamMembers(prev => [...prev, {
      id: crypto.randomUUID(),
      name: newMemberName,
      role: newMemberRole,
    }]);
    setNewMemberName(''); setNewMemberRole('');
  };

  const toggleTeamMember = (userId: string) => {
    const u = users.find(x => x.id === userId);
    if (!u) return;
    const memberName = u.displayName || u.name;
    const existing = teamMembers.find(t => t.name === memberName);
    if (existing) {
      setTeamMembers(prev => prev.filter(t => t.name !== memberName));
    } else {
      const roleLabels: Record<string, string> = {
        admin: 'Gestor de Projetos', videomaker: 'Videomaker', social_media: 'Social Media',
        editor: 'Editor de Vídeo', designer: 'Designer Gráfico', fotografo: 'Fotógrafo',
        endomarketing: 'Endomarketing', parceiro: 'Parceiro',
      };
      setTeamMembers(prev => [...prev, {
        id: crypto.randomUUID(),
        name: memberName,
        role: u.jobTitle || roleLabels[u.role] || u.role,
        avatarUrl: u.avatarUrl,
      }]);
    }
  };

  const generateModulesWithAI = async () => {
    if (!systemFunctionsDesc.trim()) { toast.error('Descreva as funções do sistema'); return; }
    setGeneratingModules(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/ai-content-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          type: 'system_modules',
          description: systemFunctionsDesc,
        }),
      });
      const data = await res.json();
      if (data.modules && Array.isArray(data.modules)) {
        const newScope = data.modules.map((m: any) => ({
          id: crypto.randomUUID(),
          description: typeof m === 'string' ? m : `${m.name}: ${m.description}`,
        }));
        setSystemScope(prev => [...prev, ...newScope]);
        if (data.deliverables && Array.isArray(data.deliverables)) {
          const newDeliverables = data.deliverables.map((d: any) => ({
            id: crypto.randomUUID(),
            name: typeof d === 'string' ? d : d.name,
            description: typeof d === 'string' ? '' : d.description || '',
          }));
          setSystemDeliverables(prev => [...prev, ...newDeliverables]);
        }
        toast.success(`${newScope.length} módulos gerados pela IA!`);
      } else {
        toast.error('Não foi possível gerar módulos. Tente novamente.');
      }
    } catch {
      toast.error('Erro ao conectar com a IA');
    }
    setGeneratingModules(false);
  };

  const generateTimelineWithAI = async () => {
    if (!cronogramaDesc.trim()) { toast.error('Descreva o projeto para a IA gerar o cronograma'); return; }
    setGeneratingTimeline(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/ai-content-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ type: 'proposal_timeline', description: cronogramaDesc }),
      });
      const data = await res.json();
      if (data.deliverables && Array.isArray(data.deliverables)) {
        setCronogramaDeliverables(data.deliverables.map((d: any) => ({ ...d, id: crypto.randomUUID() })));
        if (data.phases) setCronogramaPhases(data.phases);
        if (data.methodology) setCronogramaMethodology(data.methodology);
        if (data.projectName) setCronogramaProjectName(data.projectName);
        if (data.totalEstimatedDays) setCronogramaTotalDays(String(data.totalEstimatedDays));
        if (data.suggestedDiscount) setCustomDiscount(data.suggestedDiscount);
        toast.success(`Cronograma gerado com ${data.deliverables.length} entregas!`);
      } else {
        toast.error('Não foi possível gerar o cronograma. Tente novamente.');
      }
    } catch {
      toast.error('Erro ao conectar com a IA');
    }
    setGeneratingTimeline(false);
  };

  const downloadPDF = useCallback(async () => {
    if (!proposalRef.current) return;
    toast.loading('Gerando PDF...');
    try {
      const el = proposalRef.current;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidthMM = 210;
      const ratio = pdfWidthMM / (canvas.width / 2);
      const pdfHeightMM = (canvas.height / 2) * ratio;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidthMM, pdfHeightMM] });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMM, pdfHeightMM);
      pdf.save(`proposta-${clientCompany || 'cliente'}.pdf`);
      toast.dismiss();
      toast.success('PDF gerado com sucesso!');
    } catch {
      toast.dismiss();
      toast.error('Erro ao gerar PDF');
    }
  }, [clientCompany]);

  const saveAndShareProposal = useCallback(async () => {
    if (!clientCompany) { toast.error('Preencha o nome da empresa'); return; }
    if (proposalType === 'marketing' && !selectedPlan) { toast.error('Selecione um plano'); return; }
    if (proposalType === 'sistema' && !systemValue) { toast.error('Preencha o valor do sistema'); return; }
    if (proposalType === 'endomarketing' && !endoMonthlyValue) { toast.error('Preencha o valor mensal'); return; }
    if (proposalType === 'personalizada' && !customMonthlyValue) { toast.error('Preencha o valor da proposta'); return; }
    if (proposalType === 'cronograma' && cronogramaDeliverables.length === 0) { toast.error('Gere ou adicione entregas ao cronograma'); return; }
    setSavingProposal(true);
    try {
      const systemData = proposalType === 'sistema' ? {
        scope: systemScope,
        deliverables: systemDeliverables,
        value: parseFloat(systemValue) || 0,
        paymentMethod: systemPaymentMethod,
        installments: parseInt(systemInstallments) || 1,
        additionalCosts: systemAdditionalCosts,
        timeline: systemTimeline,
      } : {};

      const endoData = proposalType === 'endomarketing' ? {
        plan: endoPlan,
        daysPerWeek: parseInt(endoDaysPerWeek) || 3,
        sessionDuration: parseInt(endoSessionDuration) || 2,
        storiesPerDay: parseInt(endoStoriesPerDay) || 5,
        monthlyValue: parseFloat(endoMonthlyValue) || 0,
        description: endoDescription,
      } : {};

      const customData = proposalType === 'personalizada' ? {
        videos: parseInt(customVideos) || 0,
        stories: parseInt(customStories) || 0,
        eventCoverage: parseInt(customEventCoverage) || 0,
        socialMedia: customSocialMedia,
        arts: parseInt(customArts) || 0,
        trafficManagement: customTrafficMgmt,
        monthlyValue: parseFloat(customMonthlyValue) || 0,
        description: customDescription,
        paymentMethod: customPaymentMethod,
        installments: parseInt(customInstallments) || 1,
        recordings: parseInt(customRecordings) || 0,
      } : {};

      const cronogramaData = proposalType === 'cronograma' ? {
        projectName: cronogramaProjectName,
        methodology: cronogramaMethodology,
        deliverables: cronogramaDeliverables,
        phases: cronogramaPhases,
        totalDays: parseInt(cronogramaTotalDays) || 60,
        paymentMethod: cronogramaPaymentMethod,
        installments: parseInt(cronogramaInstallments) || 1,
        totalValue: cronogramaDeliverables.reduce((s, d) => s + (d.unitPrice * d.quantity), 0),
      } : {};

      let saveSystemData: any = systemData;
      if (proposalType === 'personalizada') saveSystemData = customData;
      if (proposalType === 'cronograma') saveSystemData = cronogramaData;

      const { data, error } = await vpsDb.from('commercial_proposals').insert({
        client_name: clientName,
        client_company: clientCompany,
        plan_id: proposalType === 'marketing' ? selectedPlanId : null,
        plan_snapshot: proposalType === 'marketing' ? selectedPlan : null,
        bonus_services: bonusServices,
        team_members: teamMembers,
        has_contract: hasContract,
        custom_discount: customDiscount,
        observations,
        validity_date: format(validityDate, 'yyyy-MM-dd'),
        whatsapp_number: whatsappNumber,
        created_by: user?.id || null,
        proposal_type: proposalType,
        system_data: saveSystemData,
        endomarketing_data: endoData,
      } as any).select().single();
      if (error) throw error;
      const link = `${window.location.origin}/proposta/${(data as any).token}`;
      setShareLink(link);
      await copyToClipboard(link);
      toast.success('Proposta salva! Link copiado para a área de transferência.');
      refetchProposals();
    } catch (e: any) {
      toast.error('Erro ao salvar proposta: ' + e.message);
    }
    setSavingProposal(false);
  }, [clientName, clientCompany, selectedPlanId, selectedPlan, bonusServices, teamMembers, hasContract, customDiscount, observations, validityDate, whatsappNumber, user, proposalType, systemScope, systemDeliverables, systemValue, systemPaymentMethod, systemInstallments, systemAdditionalCosts, systemTimeline, endoPlan, endoDaysPerWeek, endoSessionDuration, endoStoriesPerDay, endoMonthlyValue, endoDescription]);

  const handleCopyLink = (link: string) => {
    copyToClipboard(link).then(() => toast.success('Link copiado!'));
  };

  // Generate revenues for an approved proposal
  const generateRevenuesForProposal = useCallback(async (proposal: any) => {
    try {
      const pType = proposal.proposal_type || 'marketing';
      let totalValue = 0;
      let installments = 1;
      let description = '';

      if (pType === 'marketing') {
        const plan = proposal.plan_snapshot || {};
        const bonus = (proposal.bonus_services || []).reduce((s: number, b: any) => s + (b.value || 0), 0);
        totalValue = (plan.price || 0) + bonus;
        const discount = proposal.custom_discount || 0;
        if (discount > 0) totalValue = totalValue * (1 - discount / 100);
        installments = 12; // Monthly recurring
        description = `Contrato Marketing - ${proposal.client_company}`;
      } else if (pType === 'sistema') {
        const sys = proposal.system_data || {};
        totalValue = sys.value || 0;
        const discount = proposal.custom_discount || 0;
        if (discount > 0) totalValue = totalValue * (1 - discount / 100);
        installments = sys.installments || 1;
        description = `Sistema/Software - ${proposal.client_company}`;
      } else if (pType === 'endomarketing') {
        const endo = proposal.endomarketing_data || {};
        totalValue = endo.monthlyValue || 0;
        const discount = proposal.custom_discount || 0;
        if (discount > 0) totalValue = totalValue * (1 - discount / 100);
        installments = 12;
        description = `Endomarketing - ${proposal.client_company}`;
      } else if (pType === 'personalizada') {
        const custom = proposal.system_data || {};
        totalValue = custom.monthlyValue || 0;
        const discount = proposal.custom_discount || 0;
        if (discount > 0) totalValue = totalValue * (1 - discount / 100);
        installments = custom.installments || 12;
        description = `Proposta Única - ${proposal.client_company}`;
      } else if (pType === 'cronograma') {
        const crono = proposal.system_data || {};
        totalValue = crono.totalValue || 0;
        const discount = proposal.custom_discount || 0;
        if (discount > 0) totalValue = totalValue * (1 - discount / 100);
        installments = crono.installments || 1;
        description = `Cronograma - ${proposal.client_company}`;
      }

      if (totalValue <= 0) return;

      const installmentValue = totalValue / installments;
      const startDate = new Date(proposal.client_response_at || new Date());
      const revenues = [];

      for (let i = 0; i < installments; i++) {
        const dueDate = addMonths(startDate, i);
        revenues.push({
          client_id: null,
          contract_id: null,
          reference_month: format(dueDate, 'yyyy-MM-01'),
          amount: Math.round(installmentValue * 100) / 100,
          due_date: format(dueDate, 'yyyy-MM-dd'),
          status: 'prevista',
          description: `${description} (${i + 1}/${installments})`,
        });
      }

      let inserted = 0;
      for (const rev of revenues) {
        const { error } = await vpsDb.from('revenues').insert(rev as any);
        if (!error) inserted++;
      }

      if (inserted > 0) {
        toast.success(`${inserted} receita(s) criada(s) para ${proposal.client_company}`);
        // Mark proposal as having revenues generated
        await vpsDb.from('commercial_proposals').update({
          observations: `${proposal.observations || ''}\n[RECEITAS GERADAS: ${inserted} parcelas de R$ ${installmentValue.toFixed(2)}]`.trim(),
        } as any).eq('id', proposal.id);
      }
    } catch (err) {
      console.error('[CommercialProposal] generateRevenues error:', err);
      toast.error('Erro ao gerar receitas');
    }
  }, []);

  // Check for newly approved proposals and generate revenues
  useEffect(() => {
    const approved = savedProposals.filter((p: any) =>
      p.status === 'aceita' &&
      !(p.observations || '').includes('[RECEITAS GERADAS')
    );
    approved.forEach((p: any) => generateRevenuesForProposal(p));
  }, [savedProposals, generateRevenuesForProposal]);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const statusColors: Record<string, string> = {
    pendente: 'bg-yellow-100 text-yellow-800',
    aceita: 'bg-green-100 text-green-800',
    recusada: 'bg-red-100 text-red-800',
  };

  const typeIcons: Record<string, any> = {
    marketing: Rocket,
    sistema: Code,
    endomarketing: Megaphone,
    personalizada: Target,
    cronograma: CalendarDays,
  };

  // ===== RENDER FORM SECTIONS =====

  const renderMarketingForm = () => (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Pacote</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {plans.map((p: any) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlanId(selectedPlanId === String(p.id) ? '' : String(p.id))}
                className={cn(
                  "relative rounded-xl border-2 p-3 text-left transition-all",
                  selectedPlanId === String(p.id) ? "border-primary bg-primary/10 shadow-md" : "border-border hover:border-primary/40 hover:bg-accent/30"
                )}
              >
                {selectedPlanId === String(p.id) && <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-primary" />}
                <p className="font-bold text-foreground">{p.name}</p>
                <p className="text-lg font-bold text-primary">{fmt(Number(p.price))}<span className="text-xs font-normal text-muted-foreground">/mês</span></p>
              </button>
            ))}
          </div>
          {selectedPlan && (
            <div className="bg-accent/50 rounded-lg p-3 text-sm space-y-1 animate-in fade-in-0 slide-in-from-top-2">
              <p><strong>Reels:</strong> {selectedPlan.reels_qty}/mês</p>
              <p><strong>Criativos:</strong> {selectedPlan.creatives_qty}/mês</p>
              <p><strong>Stories:</strong> {selectedPlan.stories_qty}/mês</p>
              <p><strong>Artes:</strong> {selectedPlan.arts_qty}/mês</p>
              <p><strong>Captações:</strong> {selectedPlan.recording_sessions}/mês</p>
              <p><strong>Tráfego Pago:</strong> ✅ Incluso</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Contrato e Valores</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Contrato de 6 meses</Label>
              <p className="text-xs text-muted-foreground">Sem contrato, taxas de implementação são aplicadas</p>
            </div>
            <Switch checked={hasContract} onCheckedChange={setHasContract} />
          </div>
          {!hasContract && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Taxas de implementação (sem contrato)
              </p>
              {Object.entries(IMPLEMENTATION_FEES).map(([k, f]) => (
                <p key={k} className="text-xs text-muted-foreground">• {f.label}: {fmt(f.value)}</p>
              ))}
              <p className="text-sm font-semibold text-destructive mt-1">Total: {fmt(totalImplementation)}</p>
            </div>
          )}
          <div>
            <Label>Desconto anual (%)</Label>
            <Input type="number" value={customDiscount} onChange={e => setCustomDiscount(Number(e.target.value))} min={0} max={30} />
          </div>
        </CardContent>
      </Card>
    </>
  );

  const renderSystemForm = () => (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Funções do Sistema (IA)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Descreva o que o sistema precisa fazer e a IA vai gerar os módulos automaticamente</p>
          <Textarea
            value={systemFunctionsDesc}
            onChange={e => setSystemFunctionsDesc(e.target.value)}
            placeholder="Ex: O sistema precisa gerenciar estoque, controlar vendas, emitir relatórios financeiros, ter cadastro de clientes com histórico de compras, controle de funcionários com ponto eletrônico..."
            rows={4}
          />
          <Button onClick={generateModulesWithAI} disabled={generatingModules || !systemFunctionsDesc.trim()} className="w-full">
            {generatingModules ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando módulos...</> : <><Sparkles className="h-4 w-4 mr-2" /> Gerar Módulos com IA</>}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Code className="h-4 w-4 text-primary" /> Escopo do Sistema</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Módulos e funcionalidades (adicione manualmente ou via IA)</p>
          {systemScope.map(item => (
            <div key={item.id} className="flex items-center justify-between bg-accent/30 rounded-lg p-2">
              <p className="text-sm">{item.description}</p>
              <Button size="icon" variant="ghost" onClick={() => setSystemScope(prev => prev.filter(x => x.id !== item.id))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input placeholder="Ex: Módulo de gestão financeira" value={newScopeItem} onChange={e => setNewScopeItem(e.target.value)} className="flex-1" />
            <Button size="sm" onClick={() => {
              if (!newScopeItem) return;
              setSystemScope(prev => [...prev, { id: crypto.randomUUID(), description: newScopeItem }]);
              setNewScopeItem('');
            }}><Plus className="h-3 w-3 mr-1" /> Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Entregas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {systemDeliverables.map(item => (
            <div key={item.id} className="flex items-center justify-between bg-accent/30 rounded-lg p-2">
              <div>
                <p className="font-medium text-sm">{item.name}</p>
                {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSystemDeliverables(prev => prev.filter(x => x.id !== item.id))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="border rounded-lg p-3 space-y-2">
            <Input placeholder="Nome da entrega" value={newDeliverableName} onChange={e => setNewDeliverableName(e.target.value)} />
            <Input placeholder="Descrição" value={newDeliverableDesc} onChange={e => setNewDeliverableDesc(e.target.value)} />
            <Button size="sm" onClick={() => {
              if (!newDeliverableName) return;
              setSystemDeliverables(prev => [...prev, { id: crypto.randomUUID(), name: newDeliverableName, description: newDeliverableDesc }]);
              setNewDeliverableName(''); setNewDeliverableDesc('');
            }}><Plus className="h-3 w-3 mr-1" /> Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Valores e Pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Valor total do projeto (R$)</Label>
            <Input type="number" value={systemValue} onChange={e => setSystemValue(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Forma de pagamento</Label>
            <Select value={systemPaymentMethod} onValueChange={setSystemPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Parcelas</Label>
            <Input type="number" value={systemInstallments} onChange={e => setSystemInstallments(e.target.value)} min={1} max={24} />
          </div>
          <div>
            <Label>Custos adicionais (se houver)</Label>
            <Textarea value={systemAdditionalCosts} onChange={e => setSystemAdditionalCosts(e.target.value)} placeholder="Ex: Hospedagem R$ 50/mês, Domínio R$ 40/ano..." rows={2} />
          </div>
          <div>
            <Label>Prazo de entrega</Label>
            <Input value={systemTimeline} onChange={e => setSystemTimeline(e.target.value)} placeholder="Ex: 45 dias úteis" />
          </div>
          <div>
            <Label>Desconto (%)</Label>
            <Input type="number" value={customDiscount} onChange={e => setCustomDiscount(Number(e.target.value))} min={0} max={50} />
          </div>
        </CardContent>
      </Card>
    </>
  );

  const renderEndoForm = () => (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /> Detalhes do Endomarketing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Tipo de plano</Label>
            <Select value={endoPlan} onValueChange={setEndoPlan}>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="presenca_completa">Presença Completa</SelectItem>
                <SelectItem value="gravacao_concentrada">Gravação Concentrada</SelectItem>
                {endoPackages.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.package_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Dias/semana</Label>
              <Input type="number" value={endoDaysPerWeek} onChange={e => setEndoDaysPerWeek(e.target.value)} min={1} max={5} />
            </div>
            <div>
              <Label>Horas/sessão</Label>
              <Input type="number" value={endoSessionDuration} onChange={e => setEndoSessionDuration(e.target.value)} min={1} max={8} />
            </div>
            <div>
              <Label>Stories/dia</Label>
              <Input type="number" value={endoStoriesPerDay} onChange={e => setEndoStoriesPerDay(e.target.value)} min={0} max={20} />
            </div>
          </div>
          <div>
            <Label>Valor mensal (R$)</Label>
            <Input type="number" value={endoMonthlyValue} onChange={e => setEndoMonthlyValue(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Desconto (%)</Label>
            <Input type="number" value={customDiscount} onChange={e => setCustomDiscount(Number(e.target.value))} min={0} max={50} />
          </div>
          <div>
            <Label>Descrição do serviço</Label>
            <Textarea value={endoDescription} onChange={e => setEndoDescription(e.target.value)} placeholder="Descreva o serviço de endomarketing oferecido..." rows={3} />
          </div>
        </CardContent>
      </Card>
    </>
  );

  const renderCustomForm = () => (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Serviços da Proposta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vídeos/mês</Label>
              <Input type="number" value={customVideos} onChange={e => setCustomVideos(e.target.value)} min={0} placeholder="0" />
            </div>
            <div>
              <Label>Stories/mês</Label>
              <Input type="number" value={customStories} onChange={e => setCustomStories(e.target.value)} min={0} placeholder="0" />
            </div>
            <div>
              <Label>Artes/mês</Label>
              <Input type="number" value={customArts} onChange={e => setCustomArts(e.target.value)} min={0} placeholder="0" />
            </div>
            <div>
              <Label>Captações/mês</Label>
              <Input type="number" value={customRecordings} onChange={e => setCustomRecordings(e.target.value)} min={0} placeholder="0" />
            </div>
            <div>
              <Label>Cobertura de eventos/mês</Label>
              <Input type="number" value={customEventCoverage} onChange={e => setCustomEventCoverage(e.target.value)} min={0} placeholder="0" />
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Social Media (Gestão de Redes)</Label>
                <p className="text-xs text-muted-foreground">Publicação, programação e gerenciamento</p>
              </div>
              <Switch checked={customSocialMedia} onCheckedChange={setCustomSocialMedia} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Gestão de Tráfego</Label>
                <p className="text-xs text-muted-foreground">Campanhas patrocinadas e anúncios</p>
              </div>
              <Switch checked={customTrafficMgmt} onCheckedChange={setCustomTrafficMgmt} />
            </div>
          </div>
          <Separator />
          <div>
            <Label>Descrição do serviço</Label>
            <Textarea value={customDescription} onChange={e => setCustomDescription(e.target.value)} placeholder="Descreva os detalhes do serviço personalizado..." rows={3} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Valores e Pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Valor total (R$)</Label>
            <Input type="number" value={customMonthlyValue} onChange={e => setCustomMonthlyValue(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Forma de pagamento</Label>
            <Select value={customPaymentMethod} onValueChange={setCustomPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Parcelas</Label>
            <Input type="number" value={customInstallments} onChange={e => setCustomInstallments(e.target.value)} min={1} max={24} />
          </div>
          <div>
            <Label>Desconto (%)</Label>
            <Input type="number" value={customDiscount} onChange={e => setCustomDiscount(Number(e.target.value))} min={0} max={50} />
          </div>
        </CardContent>
      </Card>
    </>
  );

  const CATEGORY_ICONS: Record<string, any> = {
    video: Film, design: Palette, social_media: Share2, traffic: BarChart3,
    event: Camera, consulting: FileText, photography: Camera, other: Layers,
  };

  const CATEGORY_LABELS: Record<string, string> = {
    video: 'Vídeo', design: 'Design', social_media: 'Social Media', traffic: 'Tráfego',
    event: 'Evento', consulting: 'Consultoria', photography: 'Fotografia', other: 'Outros',
  };

  const renderCronogramaForm = () => {
    const totalValue = cronogramaDeliverables.reduce((s, d) => s + (d.unitPrice * d.quantity), 0);
    const discountedVal = totalValue * (1 - customDiscount / 100);
    return (
      <>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Descrição do Projeto (IA)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Descreva o projeto e a IA vai gerar o cronograma completo com entregas, datas, valores e metodologia</p>
            <Textarea
              value={cronogramaDesc}
              onChange={e => setCronogramaDesc(e.target.value)}
              placeholder="Ex: Precisamos de uma campanha completa de marketing digital com 8 reels, 20 stories, cobertura de evento de inauguração, criação de identidade visual, gestão de redes sociais por 3 meses, gestão de tráfego pago..."
              rows={4}
            />
            <Button onClick={generateTimelineWithAI} disabled={generatingTimeline || !cronogramaDesc.trim()} className="w-full">
              {generatingTimeline ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando cronograma...</> : <><Sparkles className="h-4 w-4 mr-2" /> Gerar Cronograma com IA</>}
            </Button>
          </CardContent>
        </Card>

        {cronogramaProjectName && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> {cronogramaProjectName}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {cronogramaMethodology && (
                <div className="bg-accent/30 rounded-lg p-3">
                  <Label className="text-xs font-semibold">Metodologia</Label>
                  <p className="text-sm text-muted-foreground mt-1">{cronogramaMethodology}</p>
                </div>
              )}
              <div>
                <Label>Nome do projeto</Label>
                <Input value={cronogramaProjectName} onChange={e => setCronogramaProjectName(e.target.value)} />
              </div>
              <div>
                <Label>Metodologia de trabalho</Label>
                <Textarea value={cronogramaMethodology} onChange={e => setCronogramaMethodology(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Prazo total estimado (dias)</Label>
                <Input type="number" value={cronogramaTotalDays} onChange={e => setCronogramaTotalDays(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /> Fases do Projeto</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {cronogramaPhases.map((phase, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold bg-primary text-primary-foreground">{phase.number}</div>
                  <Input value={phase.name} onChange={e => {
                    const updated = [...cronogramaPhases];
                    updated[i] = { ...updated[i], name: e.target.value };
                    setCronogramaPhases(updated);
                  }} className="flex-1 h-8 text-sm font-semibold" />
                  <div className="flex items-center gap-1">
                    <Input type="number" value={phase.durationDays} onChange={e => {
                      const updated = [...cronogramaPhases];
                      updated[i] = { ...updated[i], durationDays: parseInt(e.target.value) || 1 };
                      setCronogramaPhases(updated);
                    }} className="w-16 h-8 text-xs text-center" min={1} />
                    <span className="text-xs text-muted-foreground">dias</span>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setCronogramaPhases(prev => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <Textarea value={phase.description} onChange={e => {
                  const updated = [...cronogramaPhases];
                  updated[i] = { ...updated[i], description: e.target.value };
                  setCronogramaPhases(updated);
                }} className="text-xs min-h-[40px] pl-8" rows={1} placeholder="Descrição da fase..." />
              </div>
            ))}
            <div className="border border-dashed rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Adicionar nova fase</p>
              <div className="flex gap-2">
                <Input placeholder="Nome da fase" id="new-phase-name" className="flex-1 h-8 text-sm" />
                <Input type="number" placeholder="Dias" id="new-phase-days" className="w-20 h-8 text-xs" min={1} defaultValue={7} />
                <Button size="sm" className="h-8" onClick={() => {
                  const nameEl = document.getElementById('new-phase-name') as HTMLInputElement;
                  const daysEl = document.getElementById('new-phase-days') as HTMLInputElement;
                  if (!nameEl?.value) return;
                  setCronogramaPhases(prev => [...prev, {
                    number: prev.length + 1,
                    name: nameEl.value,
                    description: '',
                    durationDays: parseInt(daysEl?.value) || 7,
                  }]);
                  nameEl.value = '';
                }}><Plus className="h-3 w-3 mr-1" /> Fase</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Entregas e Valores Unitários</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {cronogramaDeliverables.map((d, i) => {
              const CatIcon = CATEGORY_ICONS[d.category] || Layers;
              return (
                <div key={d.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <CatIcon className="h-4 w-4 text-primary shrink-0" />
                    <Input value={d.name} onChange={e => {
                      const updated = [...cronogramaDeliverables];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setCronogramaDeliverables(updated);
                    }} className="flex-1 h-7 text-sm font-semibold" />
                    <Select value={d.category} onValueChange={val => {
                      const updated = [...cronogramaDeliverables];
                      updated[i] = { ...updated[i], category: val };
                      setCronogramaDeliverables(updated);
                    }}>
                      <SelectTrigger className="w-32 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setCronogramaDeliverables(prev => prev.filter(x => x.id !== d.id))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea value={d.description} onChange={e => {
                    const updated = [...cronogramaDeliverables];
                    updated[i] = { ...updated[i], description: e.target.value };
                    setCronogramaDeliverables(updated);
                  }} className="text-xs min-h-[36px] pl-6" rows={1} placeholder="Descrição da entrega..." />
                  <div className="grid grid-cols-4 gap-2 pl-6">
                    <div>
                      <Label className="text-[10px]">Qtd</Label>
                      <Input type="number" value={d.quantity} onChange={e => {
                        const updated = [...cronogramaDeliverables];
                        updated[i] = { ...updated[i], quantity: parseInt(e.target.value) || 1 };
                        setCronogramaDeliverables(updated);
                      }} className="h-7 text-xs" min={1} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Valor Unit. (R$)</Label>
                      <Input type="number" value={d.unitPrice} onChange={e => {
                        const updated = [...cronogramaDeliverables];
                        updated[i] = { ...updated[i], unitPrice: parseFloat(e.target.value) || 0 };
                        setCronogramaDeliverables(updated);
                      }} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Subtotal</Label>
                      <p className="text-sm font-bold text-primary mt-1">{fmt(d.unitPrice * d.quantity)}</p>
                    </div>
                    <div>
                      <Label className="text-[10px]">Prazo (dias)</Label>
                      <Input type="number" value={d.estimatedDays} onChange={e => {
                        const updated = [...cronogramaDeliverables];
                        updated[i] = { ...updated[i], estimatedDays: parseInt(e.target.value) || 7 };
                        setCronogramaDeliverables(updated);
                      }} className="h-7 text-xs" />
                    </div>
                  </div>
                  <div className="pl-6">
                    <Label className="text-[10px]">Fase</Label>
                    <Select value={String(d.phase)} onValueChange={val => {
                      const updated = [...cronogramaDeliverables];
                      updated[i] = { ...updated[i], phase: parseInt(val) || 1 };
                      setCronogramaDeliverables(updated);
                    }}>
                      <SelectTrigger className="w-40 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {cronogramaPhases.length > 0 ? cronogramaPhases.map(p => (
                          <SelectItem key={p.number} value={String(p.number)}>Fase {p.number}: {p.name}</SelectItem>
                        )) : (
                          <SelectItem value="1">Fase 1</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
            {/* Add new deliverable manually */}
            <div className="border border-dashed rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Adicionar nova entrega</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Nome da entrega" id="new-deliv-name" className="h-8 text-sm" />
                <Select defaultValue="other">
                  <SelectTrigger className="h-8 text-xs" id="new-deliv-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" placeholder="Qtd" id="new-deliv-qty" className="h-8 text-xs" defaultValue={1} min={1} />
                <Input type="number" placeholder="Valor unit." id="new-deliv-price" className="h-8 text-xs" defaultValue={0} />
                <Input type="number" placeholder="Prazo (dias)" id="new-deliv-days" className="h-8 text-xs" defaultValue={7} />
              </div>
              <Button size="sm" className="h-8" onClick={() => {
                const nameEl = document.getElementById('new-deliv-name') as HTMLInputElement;
                const qtyEl = document.getElementById('new-deliv-qty') as HTMLInputElement;
                const priceEl = document.getElementById('new-deliv-price') as HTMLInputElement;
                const daysEl = document.getElementById('new-deliv-days') as HTMLInputElement;
                if (!nameEl?.value) return;
                setCronogramaDeliverables(prev => [...prev, {
                  id: crypto.randomUUID(),
                  name: nameEl.value,
                  description: '',
                  category: 'other',
                  quantity: parseInt(qtyEl?.value) || 1,
                  unitPrice: parseFloat(priceEl?.value) || 0,
                  estimatedDays: parseInt(daysEl?.value) || 7,
                  phase: 1,
                }]);
                nameEl.value = '';
              }}><Plus className="h-3 w-3 mr-1" /> Entrega</Button>
            </div>
            {cronogramaDeliverables.length > 0 && (
              <div className="border-t pt-3 flex items-center justify-between">
                <span className="font-bold text-sm">Total das Entregas</span>
                <span className="text-xl font-bold text-primary">{fmt(totalValue)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Valores e Pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-accent/30 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Total das entregas</span>
                <span className="font-bold">{fmt(totalValue)}</span>
              </div>
              {customDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Desconto ({customDiscount}%)</span>
                  <span className="font-bold">-{fmt(totalValue - discountedVal)}</span>
                </div>
              )}
              <div className="flex justify-between text-base border-t pt-1">
                <span className="font-bold">Valor final</span>
                <span className="font-bold text-primary">{fmt(discountedVal)}</span>
              </div>
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={cronogramaPaymentMethod} onValueChange={setCronogramaPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Parcelas</Label>
              <Input type="number" value={cronogramaInstallments} onChange={e => setCronogramaInstallments(e.target.value)} min={1} max={24} />
            </div>
            <div>
              <Label>Desconto (%)</Label>
              <Input type="number" value={customDiscount} onChange={e => setCustomDiscount(Number(e.target.value))} min={0} max={50} />
            </div>
          </CardContent>
        </Card>
      </>
    );
  };

  // ===== PREVIEW SECTIONS =====

  const renderSystemPreview = () => {
    const sysVal = parseFloat(systemValue) || 0;
    const discountedVal = sysVal * (1 - customDiscount / 100);
    const installmentVal = discountedVal / (parseInt(systemInstallments) || 1);
    return (
      <>
        {systemScope.length > 0 && (
          <div data-pdf-section className="p-8 md:p-12">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Code className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Escopo do Projeto
            </h2>
            <div className="space-y-2">
              {systemScope.map((item, i) => (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: 'hsl(16 82% 80%)' }}>
                  <div className="rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'hsl(16 82% 51%)' }}>{i + 1}</div>
                  <p className="text-sm text-gray-700">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {systemDeliverables.length > 0 && (
          <div data-pdf-section className="px-8 md:px-12 pb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Entregas</h2>
            <div className="space-y-2">
              {systemDeliverables.map(item => (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-accent/30">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'hsl(16 82% 51%)' }} />
                  <div>
                    <p className="font-medium text-sm text-gray-800">{item.name}</p>
                    {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div data-pdf-section className="px-8 md:px-12 pb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Investimento</h2>
          <div className="border-2 rounded-xl p-6" style={{ borderColor: 'hsl(16 82% 51%)' }}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Valor do projeto</span>
                <span className="text-xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(sysVal)}</span>
              </div>
              {customDiscount > 0 && (
                <div className="flex justify-between items-center text-green-600">
                  <span>Desconto ({customDiscount}%)</span>
                  <span className="font-bold">-{fmt(sysVal - discountedVal)}</span>
                </div>
              )}
              {customDiscount > 0 && (
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="font-bold text-gray-800">Total</span>
                  <span className="text-2xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(discountedVal)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Forma de pagamento</span>
                <span className="font-medium">{PAYMENT_METHODS.find(m => m.value === systemPaymentMethod)?.label}</span>
              </div>
              {parseInt(systemInstallments) > 1 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{systemInstallments}x de</span>
                  <span className="font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(installmentVal)}</span>
                </div>
              )}
              {systemTimeline && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Prazo de entrega</span>
                  <span className="font-medium">{systemTimeline}</span>
                </div>
              )}
            </div>
          </div>
          {systemAdditionalCosts && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-yellow-800 mb-1">Custos adicionais</p>
              <p className="text-sm text-yellow-700 whitespace-pre-wrap">{systemAdditionalCosts}</p>
            </div>
          )}
        </div>
      </>
    );
  };

  const renderEndoPreview = () => {
    const endoVal = parseFloat(endoMonthlyValue) || 0;
    const discountedVal = endoVal * (1 - customDiscount / 100);
    const planLabel = endoPlan === 'presenca_completa' ? 'Presença Completa' : endoPlan === 'gravacao_concentrada' ? 'Gravação Concentrada' : endoPackages.find((p: any) => p.id === endoPlan)?.package_name || endoPlan;
    return (
      <>
        <div data-pdf-section className="p-8 md:p-12">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Megaphone className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Plano de Endomarketing
          </h2>
          {planLabel && (
            <div className="rounded-xl p-4 mb-4" style={{ background: 'linear-gradient(135deg, hsl(16 82% 96%), hsl(16 82% 92%))' }}>
              <p className="font-bold text-lg text-gray-800">{planLabel}</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{endoDaysPerWeek}</p>
              <p className="text-xs text-gray-500">Dias/semana</p>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{endoSessionDuration}h</p>
              <p className="text-xs text-gray-500">Por sessão</p>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{endoStoriesPerDay}</p>
              <p className="text-xs text-gray-500">Stories/dia</p>
            </div>
          </div>
          {endoDescription && <p className="text-sm text-gray-600 mb-4">{endoDescription}</p>}
        </div>
        <div data-pdf-section className="px-8 md:px-12 pb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Investimento</h2>
          <div className="border-2 rounded-xl p-6" style={{ borderColor: 'hsl(16 82% 51%)' }}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Valor mensal</span>
                <span className="text-2xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(endoVal)}<span className="text-sm font-normal text-gray-500">/mês</span></span>
              </div>
              {customDiscount > 0 && (
                <>
                  <div className="flex justify-between items-center text-green-600">
                    <span>Desconto ({customDiscount}%)</span>
                    <span className="font-bold">-{fmt(endoVal - discountedVal)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="font-bold text-gray-800">Total mensal</span>
                    <span className="text-2xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(discountedVal)}<span className="text-sm font-normal text-gray-500">/mês</span></span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderCustomPreview = () => {
    const val = parseFloat(customMonthlyValue) || 0;
    const discountedVal = val * (1 - customDiscount / 100);
    const installs = parseInt(customInstallments) || 1;
    const installmentVal = discountedVal / installs;
    const services: { icon: any; value: string | number; label: string }[] = [];
    if (parseInt(customVideos) > 0) services.push({ icon: Film, value: customVideos, label: 'Vídeos/mês' });
    if (parseInt(customStories) > 0) services.push({ icon: Camera, value: customStories, label: 'Stories/mês' });
    if (parseInt(customArts) > 0) services.push({ icon: Palette, value: customArts, label: 'Artes/mês' });
    if (parseInt(customRecordings) > 0) services.push({ icon: Film, value: customRecordings, label: 'Captações/mês' });
    if (parseInt(customEventCoverage) > 0) services.push({ icon: Camera, value: customEventCoverage, label: 'Coberturas/mês' });
    if (customSocialMedia) services.push({ icon: Share2, value: '✓', label: 'Social Media' });
    if (customTrafficMgmt) services.push({ icon: BarChart3, value: '✓', label: 'Gestão de Tráfego' });

    return (
      <>
        {services.length > 0 && (
          <div data-pdf-section className="p-8 md:p-12">
            <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
              <Target className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Serviços Inclusos
            </h2>
            <p className="text-sm text-gray-500 mb-6">Proposta personalizada para sua empresa</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {services.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="border rounded-lg p-3 text-center">
                    <Icon className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                    <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {customDescription && (
          <div data-pdf-section className="px-8 md:px-12 pb-4">
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-4">{customDescription}</p>
          </div>
        )}
        <div data-pdf-section className="px-8 md:px-12 pb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Investimento</h2>
          <div className="border-2 rounded-xl p-6" style={{ borderColor: 'hsl(16 82% 51%)' }}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Valor total</span>
                <span className="text-xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(val)}</span>
              </div>
              {customDiscount > 0 && (
                <>
                  <div className="flex justify-between items-center text-green-600">
                    <span>Desconto ({customDiscount}%)</span>
                    <span className="font-bold">-{fmt(val - discountedVal)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="font-bold text-gray-800">Total</span>
                    <span className="text-2xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(discountedVal)}</span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Forma de pagamento</span>
                <span className="font-medium">{PAYMENT_METHODS.find(m => m.value === customPaymentMethod)?.label}</span>
              </div>
              {installs > 1 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{customInstallments}x de</span>
                  <span className="font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(installmentVal)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderCronogramaPreview = () => {
    const totalValue = cronogramaDeliverables.reduce((s, d) => s + (d.unitPrice * d.quantity), 0);
    const discountedVal = totalValue * (1 - customDiscount / 100);
    const installs = parseInt(cronogramaInstallments) || 1;
    const installmentVal = discountedVal / installs;
    return (
      <>
        {cronogramaMethodology && (
          <div data-pdf-section className="p-8 md:p-12">
            <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
              <CalendarDays className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> {cronogramaProjectName || 'Cronograma do Projeto'}
            </h2>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs font-semibold text-gray-600 mb-1">Metodologia</p>
              <p className="text-sm text-gray-700">{cronogramaMethodology}</p>
            </div>
            {cronogramaTotalDays && <p className="text-sm text-gray-500">⏱️ Prazo estimado: <strong>{cronogramaTotalDays} dias</strong></p>}
          </div>
        )}
        {cronogramaPhases.length > 0 && (
          <div data-pdf-section className="px-8 md:px-12 pb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Fases do Projeto</h2>
            <div className="space-y-2">
              {cronogramaPhases.map((phase, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: 'hsl(16 82% 80%)' }}>
                  <div className="rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'hsl(16 82% 51%)' }}>{phase.number}</div>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{phase.name} <span className="text-xs font-normal text-gray-500">({phase.durationDays} dias)</span></p>
                    <p className="text-xs text-gray-500">{phase.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {cronogramaDeliverables.length > 0 && (
          <div data-pdf-section className="px-8 md:px-12 pb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Entregas e Investimento</h2>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500" style={{ background: 'hsl(16 82% 96%)' }}>
                    <th className="p-3">Entrega</th>
                    <th className="p-3 text-center">Qtd</th>
                    <th className="p-3 text-right">Valor Unit.</th>
                    <th className="p-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {cronogramaDeliverables.map((d, i) => (
                    <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-3">
                        <p className="font-medium text-gray-800">{d.name}</p>
                        <p className="text-[10px] text-gray-500">{d.description}</p>
                      </td>
                      <td className="p-3 text-center font-medium">{d.quantity}</td>
                      <td className="p-3 text-right text-gray-600">{fmt(d.unitPrice)}</td>
                      <td className="p-3 text-right font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(d.unitPrice * d.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td colSpan={3} className="p-3 text-right text-gray-800">Total</td>
                    <td className="p-3 text-right text-lg" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        <div data-pdf-section className="px-8 md:px-12 pb-8">
          <div className="border-2 rounded-xl p-6" style={{ borderColor: 'hsl(16 82% 51%)' }}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Valor total</span>
                <span className="text-xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(totalValue)}</span>
              </div>
              {customDiscount > 0 && (
                <>
                  <div className="flex justify-between items-center text-green-600">
                    <span>Desconto ({customDiscount}%)</span>
                    <span className="font-bold">-{fmt(totalValue - discountedVal)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="font-bold text-gray-800">Valor final</span>
                    <span className="text-2xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(discountedVal)}</span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Forma de pagamento</span>
                <span className="font-medium">{PAYMENT_METHODS.find(m => m.value === cronogramaPaymentMethod)?.label}</span>
              </div>
              {installs > 1 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{cronogramaInstallments}x de</span>
                  <span className="font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(installmentVal)}</span>
                </div>
              )}
              {cronogramaTotalDays && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Prazo de entrega</span>
                  <span className="font-medium">{cronogramaTotalDays} dias</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderMarketingPreview = () => (
    <>
      {selectedPlan && (
        <div data-pdf-section className="p-8 md:p-12">
          <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
            <Rocket className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Pacote {selectedPlan.name}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{selectedPlan.description || 'Solução completa de marketing digital'}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {selectedPlan.reels_qty > 0 && (
              <div className="border rounded-lg p-3 text-center">
                <Film className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                <p className="text-2xl font-bold text-gray-800">{selectedPlan.reels_qty}</p>
                <p className="text-xs text-gray-500">Reels/mês</p>
              </div>
            )}
            {selectedPlan.creatives_qty > 0 && (
              <div className="border rounded-lg p-3 text-center">
                <Palette className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                <p className="text-2xl font-bold text-gray-800">{selectedPlan.creatives_qty}</p>
                <p className="text-xs text-gray-500">Criativos/mês</p>
              </div>
            )}
            {selectedPlan.stories_qty > 0 && (
              <div className="border rounded-lg p-3 text-center">
                <Camera className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                <p className="text-2xl font-bold text-gray-800">{selectedPlan.stories_qty}</p>
                <p className="text-xs text-gray-500">Stories/mês</p>
              </div>
            )}
            {selectedPlan.arts_qty > 0 && (
              <div className="border rounded-lg p-3 text-center">
                <Palette className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                <p className="text-2xl font-bold text-gray-800">{selectedPlan.arts_qty}</p>
                <p className="text-xs text-gray-500">Artes/mês</p>
              </div>
            )}
            {selectedPlan.recording_sessions > 0 && (
              <div className="border rounded-lg p-3 text-center">
                <Film className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                <p className="text-2xl font-bold text-gray-800">{selectedPlan.recording_sessions}</p>
                <p className="text-xs text-gray-500">Captações/mês</p>
              </div>
            )}
            <div className="border rounded-lg p-3 text-center">
              <BarChart3 className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
              <p className="text-2xl font-bold text-gray-800">✓</p>
              <p className="text-xs text-gray-500">Tráfego Pago</p>
            </div>
          </div>
        </div>
      )}

      {/* Internal Process */}
      <div data-pdf-section className="px-8 md:px-12 pb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Como Funciona</h2>
        <p className="text-sm text-gray-500 mb-6">Nosso processo interno para garantir resultados</p>
        <div className="space-y-3">
          {INTERNAL_PROCESS_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: 'hsl(16 82% 80%)' }}>
                <div className="rounded-full p-2 shrink-0" style={{ background: 'hsl(16 82% 96%)' }}>
                  <Icon className="h-4 w-4" style={{ color: 'hsl(16 82% 51%)' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-800 flex items-center gap-2">
                    {step.title}
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full text-white" style={{ background: 'hsl(16 82% 51%)' }}>Incluso no pacote</span>
                  </p>
                  <p className="text-xs text-gray-500">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pricing */}
      <div data-pdf-section className="px-8 md:px-12 pb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Investimento</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-800">Plano Semestral</h3>
            <p className="text-xs text-gray-500 mb-4">Contrato de 6 meses</p>
            <p className="text-3xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(monthlyTotal)}<span className="text-sm font-normal text-gray-500">/mês</span></p>
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <p>✅ Sem taxa de implementação</p>
              <p>✅ Todos os serviços do pacote</p>
              <p>✅ Tráfego pago incluso</p>
              {bonusServices.length > 0 && <p>✅ {bonusServices.length} bônus exclusivos</p>}
              <p>✅ Equipe dedicada</p>
              <p>✅ Portal do cliente</p>
            </div>
          </div>
          <div className="border-2 rounded-xl p-6 relative" style={{ borderColor: 'hsl(16 82% 51%)' }}>
            <div className="absolute -top-3 left-4 px-3 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: 'hsl(16 82% 51%)' }}>RECOMENDADO</div>
            <h3 className="text-lg font-bold text-gray-800 mt-2">Plano Anual</h3>
            <p className="text-xs text-gray-500 mb-4">Contrato de 12 meses{customDiscount > 0 ? ` com ${customDiscount}% de desconto` : ''}</p>
            <p className="text-3xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>
              {fmt(customDiscount > 0 ? monthlyTotal * (1 - customDiscount / 100) : monthlyTotal)}
              <span className="text-sm font-normal text-gray-500">/mês</span>
            </p>
            {customDiscount > 0 && <p className="text-xs text-gray-400 line-through">{fmt(monthlyTotal)}/mês</p>}
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <p>✅ Sem taxa de implementação</p>
              <p>✅ Todos os serviços do pacote</p>
              <p>✅ Tráfego pago incluso</p>
              {bonusServices.length > 0 && <p>✅ {bonusServices.length} bônus exclusivos</p>}
              <p>✅ Equipe dedicada</p>
              <p>✅ Portal do cliente</p>
            </div>
            {customDiscount > 0 && (
              <div className="mt-4 rounded-lg p-3 text-center" style={{ background: 'hsl(142 71% 95%)' }}>
                <p className="text-xs text-gray-500">Economia total no plano anual</p>
                <p className="text-xl font-bold" style={{ color: 'hsl(142 71% 35%)' }}>{fmt(annualTotal - annualWithDiscount)}</p>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 bg-gray-50 border rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">Sem contrato de fidelidade</p>
          <p className="text-xs text-gray-500 mb-2">Caso opte por não aderir ao contrato de 6 meses, serão cobradas as seguintes taxas de implementação:</p>
          <div className="space-y-1">
            {Object.entries(IMPLEMENTATION_FEES).map(([k, f]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-gray-600">{f.label}</span>
                <span className="font-semibold text-gray-800">{fmt(f.value)}</span>
              </div>
            ))}
            <div className="border-t pt-1 mt-1 flex justify-between text-sm">
              <span className="font-semibold text-gray-700">Total implementação</span>
              <span className="font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(Object.values(IMPLEMENTATION_FEES).reduce((s, f) => s + f.value, 0))}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <img src={pulseLogo} alt="Pulse" className="h-10 w-10 rounded-lg object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" /> Proposta Comercial
            </h1>
            <p className="text-sm text-muted-foreground">Crie propostas profissionais para novos clientes</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowSavedProposals(!showSavedProposals)}>
            <List className="h-4 w-4 mr-1" /> Propostas ({savedProposals.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="h-4 w-4 mr-1" /> {showPreview ? 'Editar' : 'Preview'}
          </Button>
          {showPreview && (
            <>
              <Button size="sm" onClick={downloadPDF}>
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button size="sm" onClick={saveAndShareProposal} disabled={savingProposal} className="bg-green-600 hover:bg-green-700">
                <Link2 className="h-4 w-4 mr-1" /> {savingProposal ? 'Salvando...' : 'Salvar & Enviar Link'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Share link banner */}
      {shareLink && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Link da proposta gerado!</p>
            <p className="text-xs text-green-700 truncate">{shareLink}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleCopyLink(shareLink)}>
            <Copy className="h-3 w-3 mr-1" /> Copiar
          </Button>
          <a href={shareLink} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline">
              <ExternalLink className="h-3 w-3 mr-1" /> Abrir
            </Button>
          </a>
        </div>
      )}

      {/* Saved proposals list */}
      {showSavedProposals && (
        <div className="space-y-4">
          {/* Approved proposals as tasks */}
          {savedProposals.filter((p: any) => p.status === 'aceita').length > 0 && (
            <Card className="border-emerald-200/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-emerald-700">
                  <Target className="h-4 w-4" /> Propostas Aprovadas — Tarefas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {savedProposals.filter((p: any) => p.status === 'aceita').map((p: any) => {
                    const pType = p.proposal_type || 'marketing';
                    const TypeIcon = typeIcons[pType] || Rocket;
                    const sys = p.system_data || {};
                    const timeline = sys.timeline || '';
                    const approvedAt = p.client_response_at ? format(new Date(p.client_response_at), 'dd/MM/yyyy') : '—';
                    const hasRevenues = (p.observations || '').includes('[RECEITAS GERADAS');

                    // Calculate value
                    let totalValue = 0;
                    if (pType === 'marketing') {
                      const plan = p.plan_snapshot || {};
                      const bonus = (p.bonus_services || []).reduce((s: number, b: any) => s + (b.value || 0), 0);
                      totalValue = (plan.price || 0) + bonus;
                    } else if (pType === 'sistema') {
                      totalValue = sys.value || 0;
                    } else if (pType === 'endomarketing') {
                      totalValue = (p.endomarketing_data || {}).monthlyValue || 0;
                    } else if (pType === 'personalizada') {
                      totalValue = sys.monthlyValue || 0;
                    } else if (pType === 'cronograma') {
                      totalValue = sys.totalValue || (sys.deliverables || []).reduce((s: number, d: any) => s + ((d.unitPrice || 0) * (d.quantity || 1)), 0);
                    }
                    const discount = p.custom_discount || 0;
                    if (discount > 0) totalValue = totalValue * (1 - discount / 100);

                    return (
                      <div key={p.id} className="bg-emerald-50/50 border border-emerald-200/50 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-4 w-4 text-emerald-600" />
                            <span className="font-bold text-sm">{p.client_company}</span>
                            <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                              {PROPOSAL_TYPE_LABELS[pType as ProposalType]}
                            </Badge>
                          </div>
                          <Badge className="bg-emerald-500 text-white text-[10px]">✅ Aprovada</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <CalendarIcon className="h-3 w-3" />
                            Aprovada em: {approvedAt}
                          </div>
                          {timeline && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Prazo: {timeline}
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <DollarSign className="h-3 w-3" />
                            Valor: {fmt(totalValue)}{pType !== 'sistema' ? '/mês' : ''}
                          </div>
                          <div className="flex items-center gap-1">
                            {hasRevenues ? (
                              <span className="text-emerald-600 font-medium">💰 Receitas geradas</span>
                            ) : (
                              <Button size="sm" variant="outline" className="h-6 text-[10px] border-emerald-300 text-emerald-700" onClick={() => generateRevenuesForProposal(p)}>
                                <DollarSign className="h-3 w-3 mr-0.5" /> Gerar Receitas
                              </Button>
                            )}
                          </div>
                        </div>
                        {p.client_response_note && (
                          <p className="text-xs text-muted-foreground italic">💬 "{p.client_response_note}"</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All proposals list */}
          <Card>
            <CardHeader><CardTitle className="text-base">Todas as Propostas</CardTitle></CardHeader>
            <CardContent>
            {savedProposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma proposta salva ainda.</p>
            ) : (
              <div className="space-y-2">
                {savedProposals.map((p: any) => {
                  const link = `${window.location.origin}/proposta/${p.token}`;
                  const TypeIcon = typeIcons[p.proposal_type] || Rocket;
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-accent/30 rounded-lg p-3">
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{p.client_company}</p>
                          <p className="text-xs text-muted-foreground">{p.client_name} · {format(new Date(p.created_at), 'dd/MM/yyyy')} · {PROPOSAL_TYPE_LABELS[p.proposal_type as ProposalType] || 'Marketing'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={statusColors[p.status] || ''}>
                          {p.status === 'aceita' ? '✅ Aceita' : p.status === 'recusada' ? '❌ Recusada' : '⏳ Pendente'}
                        </Badge>
                        <Button size="icon" variant="ghost" onClick={() => handleCopyLink(link)} title="Copiar link">
                          <Copy className="h-3 w-3" />
                        </Button>
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          <Button size="icon" variant="ghost" title="Abrir proposta">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          </Card>
        </div>
      )}

      {!showPreview ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Proposal Type Selector */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Tipo de Proposta</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {(['marketing', 'sistema', 'endomarketing', 'personalizada', 'cronograma'] as ProposalType[]).map(type => {
                  const Icon = typeIcons[type];
                  return (
                    <button
                      key={type}
                      onClick={() => setProposalType(type)}
                      className={cn(
                        "rounded-xl border-2 p-4 text-center transition-all",
                        proposalType === type ? "border-primary bg-primary/10 shadow-md" : "border-border hover:border-primary/40"
                      )}
                    >
                      <Icon className={cn("h-6 w-6 mx-auto mb-2", proposalType === type ? "text-primary" : "text-muted-foreground")} />
                      <p className="font-bold text-sm">{PROPOSAL_TYPE_LABELS[type]}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Client Info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Dados do Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Nome do responsável</Label>
                <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <Label>Empresa</Label>
                <Input value={clientCompany} onChange={e => setClientCompany(e.target.value)} placeholder="Nome da empresa" />
              </div>
              <div>
                <Label>WhatsApp para contato (com DDD)</Label>
                <Input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="5511999999999" />
              </div>
            </CardContent>
          </Card>

          {/* Type-specific form */}
          {proposalType === 'marketing' && renderMarketingForm()}
          {proposalType === 'sistema' && renderSystemForm()}
          {proposalType === 'endomarketing' && renderEndoForm()}
          {proposalType === 'personalizada' && renderCustomForm()}
          {proposalType === 'cronograma' && renderCronogramaForm()}

          {/* Bonus - available for all types */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" /> Bônus Exclusivos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Serviços extras disponíveis exclusivamente nesta proposta até a data de validade.
              </p>
              {bonusServices.map(b => (
                <div key={b.id} className="flex items-center justify-between bg-accent/30 rounded-lg p-2">
                  <div>
                    <p className="font-medium text-sm">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{b.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary">{b.value > 0 ? fmt(b.value) : 'Grátis'}</span>
                    <Button size="icon" variant="ghost" onClick={() => setBonusServices(prev => prev.filter(x => x.id !== b.id))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="border rounded-lg p-3 space-y-2">
                <Input placeholder="Nome do serviço" value={newBonusName} onChange={e => setNewBonusName(e.target.value)} />
                <Input placeholder="Valor (0 = grátis)" type="number" value={newBonusValue} onChange={e => setNewBonusValue(e.target.value)} />
                <Input placeholder="Descrição breve" value={newBonusDesc} onChange={e => setNewBonusDesc(e.target.value)} />
                <Button size="sm" onClick={addBonus} disabled={!newBonusName}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar Bônus
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Team */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Equipe do Projeto</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Clique nos membros para adicionar ou remover da proposta</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {users.map(u => {
                  const memberName = u.displayName || u.name;
                  const isSelected = teamMembers.some(t => t.name === memberName);
                  const roleLabels: Record<string, string> = {
                    admin: 'Gestor', videomaker: 'Videomaker', social_media: 'Social Media',
                    editor: 'Editor', designer: 'Designer', fotografo: 'Fotógrafo',
                    endomarketing: 'Endomarketing', parceiro: 'Parceiro',
                  };
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleTeamMember(u.id)}
                      className={cn(
                        "relative rounded-xl border-2 p-3 text-center transition-all",
                        isSelected ? "border-primary bg-primary/10 shadow-md" : "border-border hover:border-primary/40 hover:bg-accent/30"
                      )}
                    >
                      {isSelected && <CheckCircle2 className="absolute top-1.5 right-1.5 h-4 w-4 text-primary" />}
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={memberName} className="w-10 h-10 rounded-full mx-auto mb-1.5 object-cover border-2 border-border" />
                      ) : (
                        <div className="w-10 h-10 rounded-full mx-auto mb-1.5 flex items-center justify-center bg-primary text-primary-foreground font-bold text-xs">
                          {memberName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <p className="font-medium text-xs truncate">{memberName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{u.jobTitle || roleLabels[u.role] || u.role}</p>
                    </button>
                  );
                })}
              </div>
              {/* Manual add */}
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1 hover:text-foreground">
                  <UserPlus className="h-3 w-3" /> Adicionar membro externo manualmente
                </summary>
                <div className="border rounded-lg p-3 space-y-2 mt-2">
                  <Input placeholder="Nome" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} />
                  <Input placeholder="Função" value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)} />
                  <Button size="sm" onClick={addTeamMember} disabled={!newMemberName || !newMemberRole}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar
                  </Button>
                </div>
              </details>
            </CardContent>
          </Card>

          {/* Validity & Observations */}
          <Card>
            <CardHeader><CardTitle className="text-base">Validade e Observações</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Validade da proposta</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(validityDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={validityDate} onSelect={d => d && setValidityDate(d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={observations} onChange={e => setObservations(e.target.value)} placeholder="Notas adicionais para a proposta..." rows={3} />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ===== PROPOSAL PREVIEW ===== */
        <div className="flex justify-center">
          <div ref={proposalRef} className="bg-white w-full max-w-[800px] shadow-2xl rounded-xl overflow-hidden" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>

            {/* Header */}
            <div data-pdf-section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(16 82% 51%), hsl(16 82% 38%))' }}>
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full border-[40px] border-white/20" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full border-[30px] border-white/10" />
              </div>
              <div className="relative p-6 md:p-10 text-white">
                <img src={pulseLogo} alt="Pulse Growth Marketing" className="h-12 md:h-14 mb-4 drop-shadow-2xl" />
                <h1 className="text-2xl md:text-3xl font-bold mb-1">
                  {proposalType === 'sistema' ? 'Proposta de Sistema' : proposalType === 'endomarketing' ? 'Proposta de Endomarketing' : proposalType === 'cronograma' ? 'Cronograma Completo' : 'Proposta Comercial'}
                </h1>
                <p className="text-white/80 text-sm">Preparada exclusivamente para</p>
                <p className="text-xl font-bold mt-0.5">{clientCompany || 'Nome da Empresa'}</p>
                <p className="text-white/70 text-sm mt-0.5">Aos cuidados de {clientName || 'Nome do Cliente'}</p>
                <div className="mt-4 flex gap-4 text-xs text-white/60">
                  <span>📅 {format(new Date(), "dd/MM/yyyy")}</span>
                  <span>⏰ Válida até {format(validityDate, "dd/MM/yyyy")}</span>
                </div>
              </div>
            </div>

            {/* Type-specific preview */}
            {proposalType === 'marketing' && renderMarketingPreview()}
            {proposalType === 'sistema' && renderSystemPreview()}
            {proposalType === 'endomarketing' && renderEndoPreview()}
          {proposalType === 'personalizada' && renderCustomPreview()}
            {proposalType === 'cronograma' && renderCronogramaPreview()}

            {/* Bonus Section */}
            {bonusServices.length > 0 && (
              <div data-pdf-section className="px-8 md:px-12 pb-8">
                <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, hsl(16 82% 96%), hsl(16 82% 92%))' }}>
                  <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-1">
                    <Gift className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Bônus Exclusivos desta Proposta
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    ⚠️ Estes benefícios são exclusivos desta proposta e válidos até {format(validityDate, "dd/MM/yyyy")}
                  </p>
                  <div className="space-y-2">
                    {bonusServices.map(b => (
                      <div key={b.id} className="flex items-center justify-between bg-white/70 rounded-lg p-3">
                        <div>
                          <p className="font-medium text-sm text-gray-800">✨ {b.name}</p>
                          {b.description && <p className="text-xs text-gray-500">{b.description}</p>}
                        </div>
                        <Badge variant="secondary" className="font-bold" style={{ color: 'hsl(16 82% 51%)' }}>
                          {b.value > 0 ? fmt(b.value) : '🎁 GRÁTIS'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Team */}
            {teamMembers.length > 0 && (
              <div data-pdf-section className="px-8 md:px-12 pb-8">
                <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
                  <Users className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Sua Equipe Dedicada
                </h2>
                <p className="text-sm text-gray-500 mb-4">Profissionais envolvidos no seu projeto</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {teamMembers.map(m => (
                    <div key={m.id} className="border rounded-lg p-3 text-center">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.name} className="w-12 h-12 rounded-full mx-auto mb-2 object-cover border-2" style={{ borderColor: 'hsl(16 82% 80%)' }} />
                      ) : (
                        <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm" style={{ background: 'hsl(16 82% 51%)' }}>
                          {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <p className="font-semibold text-sm text-gray-800">{m.name}</p>
                      <p className="text-xs text-gray-500">{m.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Observations */}
            {observations && (
              <div data-pdf-section className="px-8 md:px-12 pb-8">
                <h2 className="text-lg font-bold text-gray-800 mb-2">Observações</h2>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{observations}</p>
              </div>
            )}

            {/* Footer */}
            <div data-pdf-section className="p-8 md:p-12 text-center" style={{ background: 'linear-gradient(135deg, hsl(16 82% 51%), hsl(16 82% 38%))' }}>
              <img src={pulseLogo} alt="Pulse" className="h-8 mx-auto mb-3 brightness-0 invert" />
              <p className="text-white/80 text-sm">Transformando marcas em movimentos.</p>
              <p className="text-white/60 text-xs mt-2">Proposta válida até {format(validityDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
              <p className="text-white/50 text-xs mt-1">© {new Date().getFullYear()} Pulse Growth Marketing. Todos os direitos reservados.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
