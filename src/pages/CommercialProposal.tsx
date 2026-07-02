import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
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
  Sparkles, Loader2, UserPlus, DollarSign, Target, CalendarDays, ListChecks, Layers, Pencil
} from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ScopeDescription from '@/components/ScopeDescription';

type ProposalType = 'marketing' | 'sistema' | 'endomarketing' | 'personalizada' | 'cronograma' | 'videos';

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
  videos: 'Vídeos Avulsos',
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

// Serviços fixos inclusos no contrato mensal (sem cobrança extra)
const INCLUDED_SERVICES = [
  { id: 'social_media', name: 'Social Media', icon: Share2, desc: 'Planejamento editorial mensal, gestão estratégica das redes, copywriting persuasivo e publicações otimizadas para o algoritmo de cada plataforma.' },
  { id: 'campanhas', name: 'Criação de Campanhas de Marketing', icon: Megaphone, desc: 'Campanhas sazonais e promocionais desenhadas sob medida para gerar autoridade, engajamento e conversão para o seu negócio.' },
  { id: 'gestao_projetos', name: 'Gestão de Projetos', icon: ListChecks, desc: 'Acompanhamento próximo com gestor dedicado, prazos controlados, fluxo de aprovação organizado e relatórios periódicos de resultado.' },
  { id: 'roteiros', name: 'Roteiros', icon: FileText, desc: 'Roteiros estratégicos baseados em copywriting, gatilhos mentais e funil de vendas — pensados para o público-alvo do seu segmento.' },
  { id: 'captacao', name: 'Captação', icon: Camera, desc: 'Videomaker especializado em direcionamento de gravação, com foco em qualidade de cena, áudio limpo e enquadramento profissional no local do cliente.' },
  { id: 'edicao', name: 'Edição Profissional', icon: Scissors, desc: 'Edição premium com tratamento de cor, motion graphics, legendas dinâmicas, sound design e identidade visual da marca.' },
  { id: 'designer', name: 'Designer', icon: Palette, desc: 'Artes estáticas, criativos para feed e stories, carrosséis e materiais gráficos seguindo a identidade visual da marca.' },
  { id: 'meta_ads', name: 'Gestão de Tráfego Meta Ads', icon: BarChart3, desc: 'Gestão especializada de campanhas no Facebook e Instagram Ads: segmentação avançada, criativos testados, otimização diária e foco em ROAS.' },
  { id: 'google_ads', name: 'Gestão de Tráfego Google Ads', icon: Target, desc: 'Campanhas de Pesquisa, Display, YouTube e Performance Max — palavras-chave estratégicas, lances inteligentes e foco em lead qualificado.' },
  { id: 'portal_cliente', name: 'Portal do Cliente', icon: Monitor, desc: 'Acesso exclusivo 24h para acompanhar agenda de gravações, aprovar conteúdos, ver entregas e métricas de performance em tempo real.' },
  { id: 'reuniao_mensal', name: 'Reunião Mensal', icon: CalendarDays, desc: 'Reunião estratégica mensal de alinhamento — análise de resultados, ajustes de rota e planejamento das próximas ações.' },
  { id: 'google_ads_setup', name: 'Implementação Conta Google Ads', icon: Target, desc: 'Criação e configuração completa da conta Google Ads: estrutura de campanhas, pixels de conversão, públicos e integrações — gratuito para clientes do contrato.' },
  { id: 'meta_ads_setup', name: 'Implementação Conta Meta Ads', icon: Target, desc: 'Criação e configuração do Gerenciador de Negócios Meta: conta de anúncios, pixel, eventos de conversão e integrações com Instagram/Facebook — gratuito para clientes do contrato.' },
];

// Adicionais opcionais cobrados à parte (fora do valor fixo mensal)
const ADDITIONAL_SERVICES = [
  { id: 'google_negocio', name: 'Google Meu Negócio', price: 500, icon: Target },
  { id: 'landing_page', name: 'Criação de Landing Page', price: 1500, icon: Code },
  { id: 'site_promocoes', name: 'Site com Sistema de Promoções', price: 3500, icon: Sparkles },
  { id: 'identidade_visual', name: 'Identidade Visual', price: 2000, icon: Palette },
];

export default function CommercialProposal() {
  const { user } = useAuth();
  const { users: appUsers } = useApp();

  // Load profiles DIRECTLY from the profiles table (same as Team page) to
  // guarantee avatar_url is populated. AppContext.users sometimes returns
  // without avatar_url on the VPS, which broke the proposal photos.
  const { data: directProfiles = [] } = useQuery({
    queryKey: ['proposal-direct-profiles'],
    queryFn: async () => {
      const { data } = await vpsDb.from('profiles').select('*');
      return ((data as any[]) || []).map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        avatarUrl: p.avatar_url,
        displayName: p.display_name,
        jobTitle: p.job_title,
      }));
    },
  });

  // Merge: prefer fresh avatar from direct profiles fetch.
  const users = useMemo(() => {
    if (!directProfiles.length) return appUsers;
    const byId = new Map(directProfiles.map(p => [p.id, p]));
    const merged = appUsers.map(u => {
      const fresh = byId.get(u.id);
      return fresh?.avatarUrl ? { ...u, avatarUrl: fresh.avatarUrl } : u;
    });
    // Include any profile not in appUsers (edge case)
    directProfiles.forEach(p => {
      if (!merged.find(u => u.id === p.id)) merged.push(p as any);
    });
    return merged;
  }, [appUsers, directProfiles]);

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
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
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
  const [contractDuration, setContractDuration] = useState<'semestral' | 'anual'>('semestral');
  const [selectedBaseServices, setSelectedBaseServices] = useState<string[]>([]); // adicionais (fora do contrato)
  const [selectedIncludedServices, setSelectedIncludedServices] = useState<string[]>([]); // inclusos no contrato
  const [additionalServices, setAdditionalServices] = useState<{ id: string; name: string; price: number }[]>([]);
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
  const [cronogramaPricingMode, setCronogramaPricingMode] = useState<'individual' | 'total'>('individual');
  const [cronogramaTotalCustomValue, setCronogramaTotalCustomValue] = useState('');
  const [generatingTimeline, setGeneratingTimeline] = useState(false);

  // ── Clear proposal ──
  const DRAFT_KEY = 'pulse_proposal_draft';
  const clearProposal = useCallback(() => {
    setClientName('');
    setClientCompany('');
    setValidityDate(addDays(new Date(), 7));
    setBonusServices([]);
    setTeamMembers([]);
    setCustomDiscount(0);
    setObservations('');
    setWhatsappNumber('');
    setShareLink('');
    setShowPreview(false);
    setSelectedPlanId('');
    setHasContract(true);
    setNewBonusName(''); setNewBonusValue(''); setNewBonusDesc('');
    setNewMemberName(''); setNewMemberRole('');
    setSystemScope([]); setSystemDeliverables([]); setSystemValue('');
    setSystemPaymentMethod('pix'); setSystemInstallments('1');
    setSystemAdditionalCosts(''); setSystemTimeline('');
    setNewScopeItem(''); setNewDeliverableName(''); setNewDeliverableDesc('');
    setSystemFunctionsDesc('');
    setEndoPlan(''); setEndoDaysPerWeek('3'); setEndoSessionDuration('2');
    setEndoStoriesPerDay('5'); setEndoMonthlyValue(''); setEndoDescription('');
    setCustomVideos(''); setCustomStories(''); setCustomEventCoverage('');
    setCustomSocialMedia(false); setCustomArts(''); setCustomTrafficMgmt(false);
    setCustomMonthlyValue(''); setCustomDescription('');
    setCustomPaymentMethod('pix'); setCustomInstallments('1'); setCustomRecordings('');
    setCronogramaDesc(''); setCronogramaDeliverables([]); setCronogramaPhases([]);
    setCronogramaMethodology(''); setCronogramaProjectName('');
    setCronogramaTotalDays(''); setCronogramaPaymentMethod('pix'); setCronogramaInstallments('1');
    setCronogramaPricingMode('individual'); setCronogramaTotalCustomValue('');
    setEditingProposalId(null);
    setShareLink('');
    localStorage.removeItem(DRAFT_KEY);
    toast.success('Proposta limpa com sucesso!');
  }, []);

  // Load an existing proposal into the form for editing
  const loadProposalForEdit = useCallback((p: any) => {
    try {
      setEditingProposalId(p.id);
      setProposalType((p.proposal_type as ProposalType) || 'marketing');
      setClientName(p.client_name || '');
      setClientCompany(p.client_company || '');
      setWhatsappNumber(p.whatsapp_number || '');
      if (p.validity_date) {
        try {
          const d = new Date(String(p.validity_date).slice(0, 10) + 'T00:00:00');
          if (!isNaN(d.getTime())) setValidityDate(d);
        } catch { /* ignore */ }
      }
      setBonusServices(Array.isArray(p.bonus_services) ? p.bonus_services : []);
      setTeamMembers(Array.isArray(p.team_members) ? p.team_members : []);
      setCustomDiscount(Number(p.custom_discount) || 0);
      setObservations(p.observations || '');
      setHasContract(p.has_contract !== false);
      setSelectedPlanId(p.plan_id || '');
      // System
      const sys = p.system_data || {};
      if (p.proposal_type === 'sistema') {
        setSystemScope(Array.isArray(sys.scope) ? sys.scope : []);
        setSystemDeliverables(Array.isArray(sys.deliverables) ? sys.deliverables : []);
        setSystemValue(sys.value != null ? String(sys.value) : '');
        setSystemPaymentMethod(sys.paymentMethod || 'pix');
        setSystemInstallments(String(sys.installments || '1'));
        setSystemAdditionalCosts(sys.additionalCosts || '');
        setSystemTimeline(sys.timeline || '');
      }
      // Endo
      const endo = p.endomarketing_data || {};
      setEndoPlan(endo.plan || '');
      setEndoDaysPerWeek(String(endo.daysPerWeek || '3'));
      setEndoSessionDuration(String(endo.sessionDuration || '2'));
      setEndoStoriesPerDay(String(endo.storiesPerDay || '5'));
      setEndoMonthlyValue(endo.monthlyValue != null ? String(endo.monthlyValue) : '');
      setEndoDescription(endo.description || '');
      // Personalizada
      if (p.proposal_type === 'personalizada') {
        setCustomVideos(sys.videos != null ? String(sys.videos) : '');
        setCustomStories(sys.stories != null ? String(sys.stories) : '');
        setCustomEventCoverage(sys.eventCoverage != null ? String(sys.eventCoverage) : '');
        setCustomSocialMedia(!!sys.socialMedia);
        setCustomArts(sys.arts != null ? String(sys.arts) : '');
        setCustomTrafficMgmt(!!sys.trafficManagement);
        setCustomMonthlyValue(sys.monthlyValue != null ? String(sys.monthlyValue) : '');
        setCustomDescription(sys.description || '');
        setCustomPaymentMethod(sys.paymentMethod || 'pix');
        setCustomInstallments(String(sys.installments || '1'));
        setCustomRecordings(sys.recordings != null ? String(sys.recordings) : '');
        setContractDuration(sys.contractDuration || 'semestral');
        setSelectedBaseServices(Array.isArray(sys.selectedBaseServices) ? sys.selectedBaseServices : []);
        setSelectedIncludedServices(Array.isArray(sys.selectedIncludedServices) ? sys.selectedIncludedServices : []);
        setAdditionalServices(Array.isArray(sys.additionalServices) ? sys.additionalServices : []);
      }
      // Cronograma
      if (p.proposal_type === 'cronograma') {
        setCronogramaProjectName(sys.projectName || '');
        setCronogramaMethodology(sys.methodology || '');
        setCronogramaDeliverables(Array.isArray(sys.deliverables) ? sys.deliverables : []);
        setCronogramaPhases(Array.isArray(sys.phases) ? sys.phases : []);
        setCronogramaTotalDays(sys.totalDays != null ? String(sys.totalDays) : '');
        setCronogramaPaymentMethod(sys.paymentMethod || 'pix');
        setCronogramaInstallments(String(sys.installments || '1'));
        setCronogramaPricingMode(sys.pricingMode || 'individual');
        setCronogramaTotalCustomValue(sys.totalValue != null ? String(sys.totalValue) : '');
        setSelectedIncludedServices(Array.isArray(sys.selectedIncludedServices) ? sys.selectedIncludedServices : []);
        setContractDuration(sys.contractDuration || 'semestral');
      }
      if (p.token) setShareLink(`${window.location.origin}/proposta/${p.token}`);
      setShowSavedProposals(false);
      setShowPreview(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success(`Editando proposta de ${p.client_company || p.client_name || ''}`);
    } catch (err: any) {
      console.error('[loadProposalForEdit] erro:', err, p);
      toast.error('Falha ao carregar proposta: ' + (err?.message || 'erro desconhecido'));
    }
  }, []);


  // ── Auto-save draft to localStorage ──

  // Restore draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (d.proposalType) setProposalType(d.proposalType);
      if (d.clientName) setClientName(d.clientName);
      if (d.clientCompany) setClientCompany(d.clientCompany);
      if (d.validityDate) setValidityDate(new Date(d.validityDate));
      if (d.bonusServices?.length) setBonusServices(d.bonusServices);
      if (d.teamMembers?.length) setTeamMembers(d.teamMembers);
      if (d.customDiscount) setCustomDiscount(d.customDiscount);
      if (d.observations) setObservations(d.observations);
      if (d.whatsappNumber) setWhatsappNumber(d.whatsappNumber);
      if (d.selectedPlanId) setSelectedPlanId(d.selectedPlanId);
      if (d.hasContract !== undefined) setHasContract(d.hasContract);
      // System
      if (d.systemScope?.length) setSystemScope(d.systemScope);
      if (d.systemDeliverables?.length) setSystemDeliverables(d.systemDeliverables);
      if (d.systemValue) setSystemValue(d.systemValue);
      if (d.systemPaymentMethod) setSystemPaymentMethod(d.systemPaymentMethod);
      if (d.systemInstallments) setSystemInstallments(d.systemInstallments);
      if (d.systemAdditionalCosts) setSystemAdditionalCosts(d.systemAdditionalCosts);
      if (d.systemTimeline) setSystemTimeline(d.systemTimeline);
      // Endo
      if (d.endoPlan) setEndoPlan(d.endoPlan);
      if (d.endoDaysPerWeek) setEndoDaysPerWeek(d.endoDaysPerWeek);
      if (d.endoSessionDuration) setEndoSessionDuration(d.endoSessionDuration);
      if (d.endoStoriesPerDay) setEndoStoriesPerDay(d.endoStoriesPerDay);
      if (d.endoMonthlyValue) setEndoMonthlyValue(d.endoMonthlyValue);
      if (d.endoDescription) setEndoDescription(d.endoDescription);
      // Personalizada
      if (d.customVideos) setCustomVideos(d.customVideos);
      if (d.customStories) setCustomStories(d.customStories);
      if (d.customEventCoverage) setCustomEventCoverage(d.customEventCoverage);
      if (d.customSocialMedia) setCustomSocialMedia(d.customSocialMedia);
      if (d.customArts) setCustomArts(d.customArts);
      if (d.customTrafficMgmt) setCustomTrafficMgmt(d.customTrafficMgmt);
      if (d.customMonthlyValue) setCustomMonthlyValue(d.customMonthlyValue);
      if (d.customDescription) setCustomDescription(d.customDescription);
      if (d.customPaymentMethod) setCustomPaymentMethod(d.customPaymentMethod);
      if (d.customInstallments) setCustomInstallments(d.customInstallments);
      if (d.customRecordings) setCustomRecordings(d.customRecordings);
      if (d.contractDuration) setContractDuration(d.contractDuration);
      if (d.selectedBaseServices) setSelectedBaseServices(d.selectedBaseServices);
      if (d.selectedIncludedServices) setSelectedIncludedServices(d.selectedIncludedServices);
      if (d.additionalServices) setAdditionalServices(d.additionalServices);
      // Cronograma
      if (d.cronogramaDesc) setCronogramaDesc(d.cronogramaDesc);
      if (d.cronogramaDeliverables?.length) setCronogramaDeliverables(d.cronogramaDeliverables);
      if (d.cronogramaPhases?.length) setCronogramaPhases(d.cronogramaPhases);
      if (d.cronogramaMethodology) setCronogramaMethodology(d.cronogramaMethodology);
      if (d.cronogramaProjectName) setCronogramaProjectName(d.cronogramaProjectName);
      if (d.cronogramaTotalDays) setCronogramaTotalDays(d.cronogramaTotalDays);
      if (d.cronogramaPaymentMethod) setCronogramaPaymentMethod(d.cronogramaPaymentMethod);
      if (d.cronogramaInstallments) setCronogramaInstallments(d.cronogramaInstallments);
      if (d.cronogramaPricingMode) setCronogramaPricingMode(d.cronogramaPricingMode);
      if (d.cronogramaTotalCustomValue) setCronogramaTotalCustomValue(d.cronogramaTotalCustomValue);
    } catch { /* ignore corrupt data */ }
  }, []);

  // Auto-apply 5% discount when annual contract is selected (custom proposal)
  useEffect(() => {
    if (proposalType !== 'personalizada') return;
    setCustomDiscount(contractDuration === 'anual' ? 5 : 0);
  }, [contractDuration, proposalType]);

  // Keep team member avatars in sync with the latest users list so that the
  // photo shown in the preview is exactly the one persisted to the public link.
  useEffect(() => {
    if (!users.length) return;
    setTeamMembers(prev => {
      let changed = false;
      const next = prev.map(m => {
        const match = users.find(u => (u.displayName || u.name) === m.name);
        const freshAvatar = match?.avatarUrl;
        if (freshAvatar && freshAvatar !== m.avatarUrl) {
          changed = true;
          return { ...m, avatarUrl: freshAvatar };
        }
        return m;
      });
      return changed ? next : prev;
    });
  }, [users]);


  // Save draft on every change (debounced via effect)
  useEffect(() => {
    const draft = {
      proposalType, clientName, clientCompany, validityDate: validityDate.toISOString(),
      bonusServices, teamMembers, customDiscount, observations, whatsappNumber,
      selectedPlanId, hasContract,
      systemScope, systemDeliverables, systemValue, systemPaymentMethod, systemInstallments, systemAdditionalCosts, systemTimeline,
      endoPlan, endoDaysPerWeek, endoSessionDuration, endoStoriesPerDay, endoMonthlyValue, endoDescription,
      customVideos, customStories, customEventCoverage, customSocialMedia, customArts, customTrafficMgmt, customMonthlyValue, customDescription, customPaymentMethod, customInstallments, customRecordings,
      cronogramaDesc, cronogramaDeliverables, cronogramaPhases, cronogramaMethodology, cronogramaProjectName, cronogramaTotalDays, cronogramaPaymentMethod, cronogramaInstallments, cronogramaPricingMode, cronogramaTotalCustomValue,
      contractDuration, selectedBaseServices, selectedIncludedServices, additionalServices
    };
    const timer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* quota */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [proposalType, clientName, clientCompany, validityDate, bonusServices, teamMembers, customDiscount, observations, whatsappNumber, selectedPlanId, hasContract, systemScope, systemDeliverables, systemValue, systemPaymentMethod, systemInstallments, systemAdditionalCosts, systemTimeline, endoPlan, endoDaysPerWeek, endoSessionDuration, endoStoriesPerDay, endoMonthlyValue, endoDescription, customVideos, customStories, customEventCoverage, customSocialMedia, customArts, customTrafficMgmt, customMonthlyValue, customDescription, customPaymentMethod, customInstallments, customRecordings, cronogramaDesc, cronogramaDeliverables, cronogramaPhases, cronogramaMethodology, cronogramaProjectName, cronogramaTotalDays, cronogramaPaymentMethod, cronogramaInstallments, cronogramaPricingMode, cronogramaTotalCustomValue, contractDuration, selectedBaseServices, selectedIncludedServices, additionalServices]);
  const { data: plans = [] } = useQuery({
    queryKey: ['plans-proposal'],
    queryFn: async () => {
      const { data, error } = await vpsDb.from('plans').select('*').eq('status', 'ativo').order('price', { ascending: true });
      if (error) console.error('Plans query error:', error);
      return (data as any[]) || [];
    },
  });

  const { data: endoPackages = [] } = useQuery({
    queryKey: ['endo-packages-proposal'],
    queryFn: async () => {
      const { data } = await vpsDb.from('endomarketing_packages').select('*').order('package_name');
      return (data as any[]) || [];
    },
  });

  const { data: savedProposals = [], refetch: refetchProposals } = useQuery({
    queryKey: ['saved-proposals'],
    queryFn: async () => {
      const { data, error } = await vpsDb.from('commercial_proposals').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Saved proposals query error:', error);
        toast.error('Erro ao carregar propostas salvas: ' + (error.message || 'falha desconhecida'));
        return [];
      }
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || `Erro ${res.status} ao gerar módulos`);
        setGeneratingModules(false);
        return;
      }
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || `Erro ${res.status} ao gerar cronograma`);
        setGeneratingTimeline(false);
        return;
      }
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
    const el = proposalRef.current;
    // Verificação de segurança: oculta colunas Qtd/Unit/Subtotal durante a captura
    // quando a proposta estiver em 'Valor total único', mesmo que o DOM esteja inconsistente.
    const isTotalMode = proposalType === 'cronograma' && cronogramaPricingMode === 'total';
    const hiddenNodes: HTMLElement[] = [];
    if (isTotalMode) {
      el.querySelectorAll<HTMLElement>('[data-pdf-unit-price]').forEach(node => {
        hiddenNodes.push(node);
        node.dataset.prevDisplay = node.style.display;
        node.style.display = 'none';
      });
    }
    try {
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
    } finally {
      hiddenNodes.forEach(node => { node.style.display = node.dataset.prevDisplay || ''; });
    }
  }, [clientCompany, proposalType, cronogramaPricingMode]);

  const saveAndShareProposal = useCallback(async () => {
    if (!clientCompany) { toast.error('Preencha o nome da empresa'); return; }
    if (proposalType === 'marketing' && !selectedPlan) { toast.error('Selecione um plano'); return; }
    if (proposalType === 'sistema' && !systemValue) { toast.error('Preencha o valor do sistema'); return; }
    if (proposalType === 'endomarketing' && !endoMonthlyValue) { toast.error('Preencha o valor mensal'); return; }
    if (proposalType === 'personalizada' && !customMonthlyValue) { toast.error('Preencha o valor da proposta'); return; }
    if (proposalType === 'cronograma' && cronogramaDeliverables.length === 0) { toast.error('Gere ou adicione entregas ao cronograma'); return; }
    if (proposalType === 'cronograma' && cronogramaPricingMode === 'total' && !cronogramaTotalCustomValue) { toast.error('Informe o valor total do serviço'); return; }
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
        contractDuration,
        selectedBaseServices,
        selectedIncludedServices,
        additionalServices
      } : {};

      const cronogramaSumValue = cronogramaDeliverables.reduce((s, d) => s + (d.unitPrice * d.quantity), 0);
      const cronogramaTotalCustom = parseFloat(cronogramaTotalCustomValue) || 0;
      const cronogramaResolvedTotal = cronogramaPricingMode === 'total' ? cronogramaTotalCustom : cronogramaSumValue;
      const cronogramaData = proposalType === 'cronograma' ? {
        projectName: cronogramaProjectName,
        methodology: cronogramaMethodology,
        deliverables: cronogramaDeliverables,
        phases: cronogramaPhases,
        totalDays: parseInt(cronogramaTotalDays) || 60,
        paymentMethod: cronogramaPaymentMethod,
        installments: parseInt(cronogramaInstallments) || 1,
        pricingMode: cronogramaPricingMode,
        totalValue: cronogramaResolvedTotal,
        selectedIncludedServices,
        contractDuration,
      } : {};

      let saveSystemData: any = systemData;
      if (proposalType === 'personalizada') saveSystemData = customData;
      if (proposalType === 'cronograma') saveSystemData = cronogramaData;

      // Enrich team members with the freshest avatarUrl from current users list
      // to guarantee that the photos rendered in the preview also persist on the
      // public viewer link (integrity between preview and shared proposal).
      const enrichedTeamMembers = teamMembers.map(m => {
        if (m.avatarUrl) return m;
        const match = users.find(u => (u.displayName || u.name) === m.name);
        return match?.avatarUrl ? { ...m, avatarUrl: match.avatarUrl } : m;
      });

      const payload = {
        client_name: clientName,
        client_company: clientCompany,
        plan_id: proposalType === 'marketing' ? selectedPlanId : null,
        plan_snapshot: proposalType === 'marketing' ? selectedPlan : null,
        bonus_services: bonusServices,
        team_members: enrichedTeamMembers,
        has_contract: hasContract,
        custom_discount: customDiscount,
        observations,
        validity_date: format(validityDate, 'yyyy-MM-dd'),
        whatsapp_number: whatsappNumber,
        created_by: user?.id || null,
        proposal_type: proposalType,
        system_data: saveSystemData,
        endomarketing_data: endoData,
      } as any;

      let data: any;
      if (editingProposalId) {
        const res = await vpsDb.from('commercial_proposals').update(payload).eq('id', editingProposalId).select('*').single();
        if (res.error) throw res.error;
        data = res.data;
      } else {
        const res = await vpsDb.from('commercial_proposals').insert(payload).select('*').single();
        if (res.error) throw res.error;
        data = res.data;
      }

      let token = data?.token;
      if (!token && editingProposalId) {
        // Update response may omit the token; fetch it from the existing record
        const refetch = await vpsDb.from('commercial_proposals').select('token').eq('id', editingProposalId).single();
        token = refetch.data?.token;
      }
      if (!token) throw new Error('Proposta salva sem token de compartilhamento.');

      const link = `${window.location.origin}/proposta/${token}`;
      setShareLink(link);
      await copyToClipboard(link);
      toast.success(editingProposalId ? 'Proposta atualizada! Link copiado.' : 'Proposta salva! Link copiado para a área de transferência.');
      localStorage.removeItem(DRAFT_KEY);
      refetchProposals();
    } catch (e: any) {
      const message = e?.message || e?.error?.message || e?.details || 'Falha desconhecida ao salvar proposta';
      toast.error('Erro ao salvar proposta: ' + message);
    }
    setSavingProposal(false);
  }, [editingProposalId, clientName, clientCompany, selectedPlanId, selectedPlan, bonusServices, teamMembers, users, hasContract, customDiscount, observations, validityDate, whatsappNumber, user, proposalType, systemScope, systemDeliverables, systemValue, systemPaymentMethod, systemInstallments, systemAdditionalCosts, systemTimeline, endoPlan, endoDaysPerWeek, endoSessionDuration, endoStoriesPerDay, endoMonthlyValue, endoDescription, customVideos, customStories, customEventCoverage, customSocialMedia, customArts, customTrafficMgmt, customMonthlyValue, customDescription, customPaymentMethod, customInstallments, customRecordings, cronogramaProjectName, cronogramaMethodology, cronogramaDeliverables, cronogramaPhases, cronogramaTotalDays, cronogramaPaymentMethod, cronogramaInstallments, copyToClipboard, refetchProposals]);

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

  const renderCustomForm = () => {
    const adicionaisPredefTotal = ADDITIONAL_SERVICES
      .filter(s => selectedBaseServices.includes(s.id))
      .reduce((sum, s) => sum + s.price, 0);

    const additionalTotal = additionalServices.reduce((sum, s) => sum + s.price, 0);
    const adicionaisTotal = adicionaisPredefTotal + additionalTotal;
    const monthlyTotalBeforeDiscount = parseFloat(customMonthlyValue) || 0;

    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Tempo de Contrato</span>
              <Badge variant={contractDuration === 'anual' ? 'default' : 'outline'} className={cn(contractDuration === 'anual' && "bg-green-500")}>
                {contractDuration === 'anual' ? '5% de Desconto Ativado' : 'Sem desconto'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button 
              type="button" 
              variant={contractDuration === 'semestral' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setContractDuration('semestral')}
            >
              Semestral
            </Button>
            <Button 
              type="button" 
              variant={contractDuration === 'anual' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setContractDuration('anual')}
            >
              Anual (5% OFF)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Serviços Inclusos no Contrato</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Serviços fixos inclusos no valor mensal do contrato</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {INCLUDED_SERVICES.map(service => {
                const Icon = service.icon;
                const isSelected = selectedIncludedServices.includes(service.id);
                return (
                  <Button
                    key={service.id}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    className={cn("h-auto py-3 px-2 flex flex-col items-center gap-1 text-center", isSelected && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                    onClick={() => {
                      setSelectedIncludedServices(prev =>
                        isSelected ? prev.filter(id => id !== service.id) : [...prev, service.id]
                      );
                    }}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[11px] font-bold leading-tight">{service.name}</span>
                    {isSelected && <CheckCircle2 className="h-3 w-3" />}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adicionais</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Serviços opcionais cobrados à parte, fora do valor fixo mensal do contrato</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {ADDITIONAL_SERVICES.map(service => {
                const Icon = service.icon;
                const isSelected = selectedBaseServices.includes(service.id);
                return (
                  <Button
                    key={service.id}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    className={cn("h-auto py-3 px-4 flex flex-col items-center gap-1 text-center", isSelected && "bg-primary/90")}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedBaseServices(prev => prev.filter(id => id !== service.id));
                      } else {
                        setSelectedBaseServices(prev => [...prev, service.id]);
                      }
                    }}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-bold leading-tight">{service.name}</span>
                    <span className="text-[10px] opacity-70">{fmt(service.price)} (à parte)</span>
                  </Button>
                );
              })}
            </div>

            
            <Separator />
            
            <div className="space-y-3">
              <Label>Serviços Unitários Adicionais</Label>
              <div className="grid grid-cols-1 gap-2">
                {additionalServices.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-accent/30 p-2 rounded-lg border">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground">{fmt(s.price)}</span>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setAdditionalServices(prev => prev.filter(x => x.id !== s.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Input id="add-service-name" placeholder="Nome do serviço" className="flex-1 h-9 text-sm" />
                <Input id="add-service-price" type="number" placeholder="Valor" className="w-24 h-9 text-sm" />
                <Button size="sm" onClick={() => {
                  const nameEl = document.getElementById('add-service-name') as HTMLInputElement;
                  const priceEl = document.getElementById('add-service-price') as HTMLInputElement;
                  const name = nameEl.value;
                  const price = parseFloat(priceEl.value) || 0;
                  if (name) {
                    setAdditionalServices(prev => [...prev, { id: crypto.randomUUID(), name, price }]);
                    nameEl.value = '';
                    priceEl.value = '';
                  }
                }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Reels/mês</Label>
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
            </div>

            <Separator />
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Social Media (Gestão de Redes)</Label>
                <Switch checked={customSocialMedia} onCheckedChange={setCustomSocialMedia} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Gestão de Tráfego</Label>
                <Switch checked={customTrafficMgmt} onCheckedChange={setCustomTrafficMgmt} />
              </div>
            </div>
            
            <Separator />
            
            <div>
              <Label>Descrição Adicional do Escopo</Label>
              <Textarea value={customDescription} onChange={e => setCustomDescription(e.target.value)} placeholder="Descreva outros detalhes específicos..." rows={3} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Valores e Pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-accent/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Valor mensal do contrato</span>
                <span>{fmt(monthlyTotalBeforeDiscount)}</span>
              </div>
              {customDiscount > 0 && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>Desconto ({customDiscount}%)</span>
                  <span>-{fmt(monthlyTotalBeforeDiscount * (customDiscount / 100))}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t pt-1">
                <span>Total mensal</span>
                <span className="text-primary">{fmt(monthlyTotalBeforeDiscount * (1 - customDiscount / 100))}</span>
              </div>
              {adicionaisTotal > 0 && (
                <div className="flex justify-between text-[11px] text-muted-foreground border-t pt-1 italic">
                  <span>+ Adicionais à parte</span>
                  <span>{fmt(adicionaisTotal)}</span>
                </div>
              )}
            </div>


            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor Base Customizado</Label>
                <Input type="number" value={customMonthlyValue} onChange={e => setCustomMonthlyValue(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>Desconto Manual (%)</Label>
                <Input type="number" value={customDiscount} onChange={e => setCustomDiscount(Number(e.target.value))} min={0} max={100} />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Forma de Pagamento</Label>
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
            </div>
          </CardContent>
        </Card>
      </>
    );
  };

  const CATEGORY_ICONS: Record<string, any> = {
    video: Film, design: Palette, social_media: Share2, traffic: BarChart3,
    event: Camera, consulting: FileText, photography: Camera, other: Layers,
  };

  const CATEGORY_LABELS: Record<string, string> = {
    video: 'Vídeo', design: 'Design', social_media: 'Social Media', traffic: 'Tráfego',
    event: 'Evento', consulting: 'Consultoria', photography: 'Fotografia', other: 'Outros',
  };

  const renderCronogramaForm = () => {
    const sumValue = cronogramaDeliverables.reduce((s, d) => s + (d.unitPrice * d.quantity), 0);
    const customTotal = parseFloat(cronogramaTotalCustomValue) || 0;
    const totalValue = cronogramaPricingMode === 'total' ? customTotal : sumValue;
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
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Entregas e Valores</CardTitle>
            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                variant={cronogramaPricingMode === 'individual' ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setCronogramaPricingMode('individual')}
              >
                Valor por entrega
              </Button>
              <Button
                size="sm"
                variant={cronogramaPricingMode === 'total' ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setCronogramaPricingMode('total')}
              >
                Valor total único
              </Button>
            </div>
            {cronogramaPricingMode === 'total' && (
              <div className="pt-3 space-y-1">
                <Label className="text-xs">Valor total do serviço (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={cronogramaTotalCustomValue}
                  onChange={e => setCronogramaTotalCustomValue(e.target.value)}
                  placeholder="Ex: 12500"
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground">
                  As entregas abaixo serão exibidas sem valores individuais — apenas o valor total será mostrado ao cliente.
                </p>
              </div>
            )}
          </CardHeader>
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
                  <div className={`grid gap-2 pl-6 ${cronogramaPricingMode === 'total' ? 'grid-cols-2' : 'grid-cols-4'}`}>
                    <div>
                      <Label className="text-[10px]">Qtd</Label>
                      <Input type="number" value={d.quantity} onChange={e => {
                        const updated = [...cronogramaDeliverables];
                        updated[i] = { ...updated[i], quantity: parseInt(e.target.value) || 1 };
                        setCronogramaDeliverables(updated);
                      }} className="h-7 text-xs" min={1} />
                    </div>
                    {cronogramaPricingMode === 'individual' && (
                      <>
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
                      </>
                    )}
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
              <div className={`grid gap-2 ${cronogramaPricingMode === 'total' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <Input type="number" placeholder="Qtd" id="new-deliv-qty" className="h-8 text-xs" defaultValue={1} min={1} />
                {cronogramaPricingMode === 'individual' && (
                  <Input type="number" placeholder="Valor unit." id="new-deliv-price" className="h-8 text-xs" defaultValue={0} />
                )}
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
    const legacyExtraIds: string[] = [];
    if (customSocialMedia && !selectedIncludedServices.includes('social_media')) legacyExtraIds.push('social_media');
    if (customTrafficMgmt && !selectedIncludedServices.includes('meta_ads') && !selectedIncludedServices.includes('google_ads')) legacyExtraIds.push('meta_ads');
    const allIncludedIds = [...selectedIncludedServices, ...legacyExtraIds];
    const selectedIncluded = INCLUDED_SERVICES.filter(s => allIncludedIds.includes(s.id));

    const extraStats: { icon: any; value: string | number; label: string }[] = [];
    if (parseInt(customVideos) > 0) extraStats.push({ icon: Film, value: customVideos, label: 'Vídeos/mês' });
    if (parseInt(customStories) > 0) extraStats.push({ icon: Camera, value: customStories, label: 'Stories/mês' });
    if (parseInt(customArts) > 0) extraStats.push({ icon: Palette, value: customArts, label: 'Artes/mês' });
    if (parseInt(customRecordings) > 0) extraStats.push({ icon: Film, value: customRecordings, label: 'Captações/mês' });
    if (parseInt(customEventCoverage) > 0) extraStats.push({ icon: Camera, value: customEventCoverage, label: 'Coberturas/mês' });

    return (
      <>
        {(selectedIncluded.length > 0 || extraStats.length > 0) && (
          <div data-pdf-section className="p-8 md:p-12">
            <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
              <Target className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Serviços Inclusos no Contrato
            </h2>
            <p className="text-sm text-gray-500 mb-6">Tudo isto já está incluso no valor fixo mensal do contrato</p>

            {selectedIncluded.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {selectedIncluded.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.id} className="flex items-start gap-3 p-4 rounded-xl border-2 bg-emerald-50/60 border-emerald-200">
                      <div className="p-2 rounded-lg bg-emerald-100 shrink-0">
                        <Icon className="h-5 w-5 text-emerald-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-emerald-950 leading-tight">{s.name}</span>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">{s.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {extraStats.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {extraStats.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <div key={i} className="border rounded-lg p-3 text-center bg-white">
                      <Icon className="h-5 w-5 mx-auto mb-1" style={{ color: 'hsl(16 82% 51%)' }} />
                      <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {customDescription && (
          <div data-pdf-section className="px-8 md:px-12 pb-4">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Escopo dos Serviços</h2>
            <ScopeDescription text={customDescription} />
          </div>
        )}
        {(() => {
          const selectedAdicionaisPredef = ADDITIONAL_SERVICES.filter(s => selectedBaseServices.includes(s.id));
          const adicionaisPredefTotal = selectedAdicionaisPredef.reduce((sum, s) => sum + (s.price || 0), 0);
          const additionalTotal = additionalServices.reduce((sum, s) => sum + (s.price || 0), 0);
          const adicionaisTotal = adicionaisPredefTotal + additionalTotal;
          const hasAdicionais = selectedAdicionaisPredef.length > 0 || additionalServices.length > 0;

          return (
            <>
              {hasAdicionais && (
                <div data-pdf-section className="px-8 md:px-12 pb-6">
                  <div className="p-5 rounded-2xl border-2 border-dashed" style={{ borderColor: 'hsl(16 82% 51%)' }}>
                    <h3 className="text-sm font-bold text-gray-800 mb-1 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="h-4 w-4" style={{ color: 'hsl(16 82% 51%)' }} /> Adicionais Opcionais
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">Serviços extras cobrados à parte, fora do valor fixo mensal do contrato</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {selectedAdicionaisPredef.map((s, i) => {
                        const Icon = s.icon;
                        return (
                          <div key={`p-${i}`} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-gray-600" />
                              <span className="text-sm font-medium text-gray-700">{s.name}</span>
                            </div>
                            <span className="text-sm font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(s.price)}</span>
                          </div>
                        );
                      })}
                      {additionalServices.map((s, i) => (
                        <div key={`a-${i}`} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                          <span className="text-sm font-medium text-gray-700">{s.name}</span>
                          <span className="text-sm font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(s.price)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t text-xs text-gray-500">
                      <span>Total adicionais (à parte)</span>
                      <span className="font-bold">{fmt(adicionaisTotal)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div data-pdf-section className="px-8 md:px-12 pb-8">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Investimento Mensal</h2>
                <div className="border-2 rounded-2xl p-6" style={{ borderColor: 'hsl(16 82% 51%)' }}>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Valor do Contrato</span>
                      <span className="text-xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(val)}<span className="text-xs font-normal text-gray-500">/mês</span></span>
                    </div>
                    {customDiscount > 0 && (
                      <>
                        <div className="flex justify-between items-center text-green-600 text-sm">
                          <span>Desconto {contractDuration === 'anual' ? '(Fidelidade Anual)' : `(${customDiscount}%)`}</span>
                          <span className="font-bold">-{fmt(val - discountedVal)}</span>
                        </div>
                        <div className="flex justify-between items-center border-t pt-2">
                          <span className="font-bold text-gray-800">Total mensal</span>
                          <span className="text-2xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(discountedVal)}<span className="text-xs font-normal text-gray-500">/mês</span></span>
                        </div>
                      </>
                    )}
                    <Separator />
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Duração do Contrato</span>
                      <span className="font-bold uppercase tracking-tight" style={{ color: 'hsl(16 82% 51%)' }}>
                        {contractDuration === 'anual' ? 'Anual' : 'Semestral'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Forma de pagamento</span>
                      <span className="font-medium">{PAYMENT_METHODS.find(m => m.value === customPaymentMethod)?.label}</span>
                    </div>
                    {installs > 1 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">{customInstallments}x de</span>
                        <span className="font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(installmentVal)}</span>
                      </div>
                    )}

                    <Separator />
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="rounded-xl border-2 p-4 text-center" style={{ borderColor: contractDuration === 'semestral' ? 'hsl(16 82% 51%)' : '#e5e7eb' }}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Semestral</div>
                        <div className="text-xl font-bold mt-1" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(val)}<span className="text-xs font-normal text-gray-500">/mês</span></div>
                        <div className="text-[10px] text-gray-500 mt-1">Compromisso de 6 meses</div>
                      </div>
                      <div className="rounded-xl border-2 p-4 text-center relative" style={{ borderColor: contractDuration === 'anual' ? 'hsl(16 82% 51%)' : '#e5e7eb' }}>
                        <div className="absolute -top-2 right-2 bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">5% OFF</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Anual</div>
                        <div className="text-xl font-bold mt-1" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(val * 0.95)}<span className="text-xs font-normal text-gray-500">/mês</span></div>
                        <div className="text-[10px] text-green-600 font-semibold mt-1">Economia total de {fmt(val * 12 * 0.05)}</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 text-center pt-1">O valor é pago mensalmente conforme a duração do contrato escolhida.</p>

                    {adicionaisTotal > 0 && (
                      <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs">
                        <div className="flex justify-between text-gray-600 italic">
                          <span>+ Adicionais opcionais (à parte)</span>
                          <span className="font-bold">{fmt(adicionaisTotal)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </>
    );
  };

  const renderCronogramaPreview = () => {
    const sumValue = cronogramaDeliverables.reduce((s, d) => s + (d.unitPrice * d.quantity), 0);
    const customTotal = parseFloat(cronogramaTotalCustomValue) || 0;
    const totalValue = cronogramaPricingMode === 'total' ? customTotal : sumValue;
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
            <h2 className="text-lg font-bold text-gray-800 mb-3">
              {cronogramaPricingMode === 'total' ? 'Escopo dos Serviços' : 'Entregas e Investimento'}
            </h2>
            {cronogramaPricingMode === 'total' ? (
              <div className="space-y-2">
                {cronogramaDeliverables.map((d) => (
                  <div key={d.id} className="flex items-start gap-3 p-3 rounded-lg border bg-white" style={{ borderColor: 'hsl(16 82% 80%)' }}>
                    <div className="rounded-full w-7 h-7 flex items-center justify-center shrink-0" style={{ background: 'hsl(16 82% 51%)' }}>
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-800">{d.name}</p>
                      {d.description && <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden" data-pdf-unit-price="table">
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
            )}
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
          <Button variant="destructive" size="sm" onClick={clearProposal}>
            <Trash2 className="h-4 w-4 mr-1" /> Limpar Proposta
          </Button>
          {showPreview && (
            <>
              <Button size="sm" onClick={downloadPDF}>
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button size="sm" onClick={saveAndShareProposal} disabled={savingProposal} className="bg-green-600 hover:bg-green-700">
                <Link2 className="h-4 w-4 mr-1" /> {savingProposal ? 'Salvando...' : editingProposalId ? 'Atualizar Proposta' : 'Salvar & Enviar Link'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Editing banner */}
      {editingProposalId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
          <Pencil className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Editando proposta existente</p>
            <p className="text-xs text-amber-700 truncate">As alterações serão salvas na mesma proposta (mesmo link público).</p>
          </div>
          <Button size="sm" variant="outline" onClick={clearProposal}>
            <X className="h-3 w-3 mr-1" /> Cancelar edição
          </Button>
        </div>
      )}

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
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">Todas as Propostas</CardTitle>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={async () => {
                  try {
                    let totalProposals = 0;
                    let totalPhotos = 0;
                    let errors = 0;
                    for (const p of savedProposals as any[]) {
                      const tm = Array.isArray(p.team_members) ? p.team_members : [];
                      if (!tm.length) continue;
                      let changed = false;
                      const updatedTeam = tm.map((m: any) => {
                        const memberName = m.name || m.displayName;
                        const u = users.find(x => (x.displayName || x.name) === memberName);
                        const freshAvatar = u?.avatarUrl;
                        if (freshAvatar && freshAvatar !== m.avatarUrl) {
                          changed = true;
                          totalPhotos++;
                          return { ...m, avatarUrl: freshAvatar };
                        }
                        return m;
                      });
                      if (changed) {
                        const res = await vpsDb.from('commercial_proposals')
                          .update({ team_members: updatedTeam })
                          .eq('id', p.id);
                        if (res.error) { errors++; console.error('Update failed', p.id, res.error); }
                        else totalProposals++;
                      }
                    }
                    if (totalProposals > 0) {
                      toast.success(`${totalPhotos} foto(s) atualizada(s) em ${totalProposals} proposta(s).${errors ? ` ${errors} falha(s).` : ''}`);
                      await refetchProposals();
                    } else {
                      toast.info('Todas as propostas já estão com as fotos atualizadas.');
                    }
                  } catch (e: any) {
                    toast.error('Erro: ' + (e?.message || 'falha desconhecida'));
                  }
                }}
              >
                <Users className="h-3 w-3 mr-1" /> Atualizar fotos em todas
              </Button>
            </CardHeader>
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
                        <Button size="icon" variant="ghost" onClick={() => loadProposalForEdit(p)} title="Editar proposta">
                          <Pencil className="h-3 w-3" />
                        </Button>
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
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Clique nos membros para adicionar ou remover da proposta</p>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    let updated = 0;
                    setTeamMembers(prev => prev.map(m => {
                      const u = users.find(x => (x.displayName || x.name) === m.name);
                      if (u?.avatarUrl && u.avatarUrl !== m.avatarUrl) {
                        updated++;
                        return { ...m, avatarUrl: u.avatarUrl };
                      }
                      return m;
                    }));
                    toast.success(updated > 0 ? `${updated} foto(s) atualizada(s). Salve a proposta.` : 'Todas as fotos já estão atualizadas.');
                  }}
                >
                  <Users className="h-3 w-3 mr-1" /> Atualizar fotos da equipe
                </Button>
              </div>
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
                    <div key={m.id} className="relative border rounded-lg p-3 text-center group">
                      <button
                        type="button"
                        onClick={() => setTeamMembers(prev => prev.filter(t => t.id !== m.id))}
                        data-html2canvas-ignore="true"
                        title="Remover da equipe"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow"
                      >
                        ×
                      </button>
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
