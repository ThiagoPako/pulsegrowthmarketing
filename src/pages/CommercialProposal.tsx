import { useState, useRef, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
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
  Clock, Gift, AlertTriangle, X
} from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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

export default function CommercialProposal() {
  const { users } = useApp();
  const [clientName, setClientName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [validityDate, setValidityDate] = useState<Date>(addDays(new Date(), 7));
  const [bonusServices, setBonusServices] = useState<BonusService[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [hasContract, setHasContract] = useState(true);
  const [customDiscount, setCustomDiscount] = useState(0);
  const [observations, setObservations] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [newBonusName, setNewBonusName] = useState('');
  const [newBonusValue, setNewBonusValue] = useState('');
  const [newBonusDesc, setNewBonusDesc] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const proposalRef = useRef<HTMLDivElement>(null);

  const { data: plans = [] } = useQuery({
    queryKey: ['plans-proposal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').eq('status', 'ativo').order('price', { ascending: true });
      if (error) console.error('Plans query error:', error);
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

  const addFromTeam = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const roleLabels: Record<string, string> = {
      admin: 'Gestor de Projetos', videomaker: 'Videomaker', social_media: 'Social Media',
      editor: 'Editor de Vídeo', designer: 'Designer Gráfico', fotografo: 'Fotógrafo',
      endomarketing: 'Endomarketing', parceiro: 'Parceiro',
    };
    if (teamMembers.find(t => t.name === (user.displayName || user.name))) {
      toast.error('Membro já adicionado'); return;
    }
    setTeamMembers(prev => [...prev, {
      id: crypto.randomUUID(),
      name: user.displayName || user.name,
      role: roleLabels[user.role] || user.role,
      avatarUrl: user.avatarUrl,
    }]);
  };

  const downloadPDF = useCallback(async () => {
    if (!proposalRef.current) return;
    toast.loading('Gerando PDF...');
    try {
      const el = proposalRef.current;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgW = canvas.width;
      const imgH = canvas.height;
      const ratio = pdfW / imgW;
      const scaledH = imgH * ratio;
      let position = 0;
      while (position < scaledH) {
        if (position > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -position, pdfW, scaledH);
        position += pdfH;
      }
      pdf.save(`proposta-${clientCompany || 'cliente'}.pdf`);
      toast.dismiss();
      toast.success('PDF gerado com sucesso!');
    } catch {
      toast.dismiss();
      toast.error('Erro ao gerar PDF');
    }
  }, [clientCompany]);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={pulseLogo} alt="Pulse" className="h-10 w-10 rounded-lg object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" /> Proposta Comercial
            </h1>
            <p className="text-sm text-muted-foreground">Crie propostas profissionais para novos clientes</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="h-4 w-4 mr-1" /> {showPreview ? 'Editar' : 'Preview'}
          </Button>
          {showPreview && (
            <Button onClick={downloadPDF}>
              <Download className="h-4 w-4 mr-1" /> Baixar PDF
            </Button>
          )}
        </div>
      </div>

      {!showPreview ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            </CardContent>
          </Card>

          {/* Plan */}
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
                      selectedPlanId === String(p.id)
                        ? "border-primary bg-primary/10 shadow-md"
                        : "border-border hover:border-primary/40 hover:bg-accent/30"
                    )}
                  >
                    {selectedPlanId === String(p.id) && (
                      <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-primary" />
                    )}
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
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bonus */}
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
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Equipe do Projeto</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Adicionar da equipe</Label>
                <Select onValueChange={addFromTeam}>
                  <SelectTrigger><SelectValue placeholder="Selecionar colaborador" /></SelectTrigger>
                  <SelectContent>
                    {users.filter(u => !teamMembers.find(t => t.name === (u.displayName || u.name))).map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.displayName || u.name} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {teamMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-secondary/50 rounded-lg p-2">
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.role}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setTeamMembers(prev => prev.filter(x => x.id !== m.id))}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="border rounded-lg p-3 space-y-2">
                <Input placeholder="Nome" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} />
                <Input placeholder="Função" value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)} />
                <Button size="sm" onClick={addTeamMember} disabled={!newMemberName || !newMemberRole}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar Manual
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Contract & Pricing */}
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

          {/* Summary */}
          <Card className="border-primary/30">
            <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Plano mensal:</span><span className="font-semibold">{fmt(planPrice)}</span></div>
              {bonusTotal > 0 && <div className="flex justify-between"><span>Bônus:</span><span className="font-semibold">+{fmt(bonusTotal)}</span></div>}
              <Separator />
              <div className="flex justify-between font-bold"><span>Total mensal:</span><span className="text-primary">{fmt(monthlyTotal)}</span></div>
              <div className="flex justify-between"><span>Semestral (6x):</span><span>{fmt(sixMonthTotal)}</span></div>
              <div className="flex justify-between">
                <span>Anual (12x){customDiscount > 0 ? ` -${customDiscount}%` : ''}:</span>
                <span>{fmt(annualWithDiscount)}</span>
              </div>
              {!hasContract && <div className="flex justify-between text-destructive"><span>+ Implementação:</span><span>{fmt(totalImplementation)}</span></div>}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ===== PROPOSAL PREVIEW ===== */
        <div className="flex justify-center">
          <div ref={proposalRef} className="bg-white w-full max-w-[800px] shadow-2xl rounded-xl overflow-hidden" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>

            {/* Header */}
            <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(16 82% 51%), hsl(16 82% 38%))' }}>
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full border-[40px] border-white/20" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full border-[30px] border-white/10" />
              </div>
              <div className="relative p-8 md:p-12 text-white">
                <img src={pulseLogo} alt="Pulse Growth Marketing" className="h-12 mb-6 brightness-0 invert" />
                <h1 className="text-3xl md:text-4xl font-bold mb-2">Proposta Comercial</h1>
                <p className="text-white/80 text-lg">Preparada exclusivamente para</p>
                <p className="text-2xl font-bold mt-1">{clientCompany || 'Nome da Empresa'}</p>
                <p className="text-white/70 mt-1">Aos cuidados de {clientName || 'Nome do Cliente'}</p>
                <div className="mt-6 flex gap-4 text-sm text-white/70">
                  <span>📅 {format(new Date(), "dd/MM/yyyy")}</span>
                  <span>⏰ Válida até {format(validityDate, "dd/MM/yyyy")}</span>
                </div>
              </div>
            </div>

            {/* Plan details */}
            {selectedPlan && (
              <div className="p-8 md:p-12">
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
                </div>
              </div>
            )}

            {/* Bonus Section */}
            {bonusServices.length > 0 && (
              <div className="px-8 md:px-12 pb-8">
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

            {/* Internal Process */}
            <div className="px-8 md:px-12 pb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-1">Como Funciona</h2>
              <p className="text-sm text-gray-500 mb-6">Nosso processo interno para garantir resultados</p>
              <div className="space-y-3">
                {INTERNAL_PROCESS_STEPS.map((step, i) => {
                  const Icon = step.icon;
                  const isInPlan = selectedPlan ? (
                    (step.title.includes('Captação') && selectedPlan.recording_sessions > 0) ||
                    (step.title.includes('Edição') && selectedPlan.reels_qty > 0) ||
                    (step.title.includes('Design') && (selectedPlan.creatives_qty > 0 || selectedPlan.arts_qty > 0)) ||
                    (step.title.includes('Roteirização')) ||
                    (step.title.includes('Gestão')) ||
                    (step.title.includes('Tráfego')) ||
                    (step.title.includes('Portal'))
                  ) : true;
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border" style={isInPlan ? { borderColor: 'hsl(16 82% 80%)' } : {}}>
                      <div className="rounded-full p-2 shrink-0" style={{ background: isInPlan ? 'hsl(16 82% 96%)' : '#f3f4f6' }}>
                        <Icon className="h-4 w-4" style={{ color: isInPlan ? 'hsl(16 82% 51%)' : '#9ca3af' }} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-800 flex items-center gap-2">
                          {step.title}
                          {isInPlan && <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full text-white" style={{ background: 'hsl(16 82% 51%)' }}>Incluso no pacote</span>}
                        </p>
                        <p className="text-xs text-gray-500">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Team */}
            {teamMembers.length > 0 && (
              <div className="px-8 md:px-12 pb-8">
                <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
                  <Users className="h-5 w-5" style={{ color: 'hsl(16 82% 51%)' }} /> Sua Equipe Dedicada
                </h2>
                <p className="text-sm text-gray-500 mb-4">Profissionais envolvidos no seu projeto</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {teamMembers.map(m => (
                    <div key={m.id} className="border rounded-lg p-3 text-center">
                      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm" style={{ background: 'hsl(16 82% 51%)' }}>
                        {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <p className="font-semibold text-sm text-gray-800">{m.name}</p>
                      <p className="text-xs text-gray-500">{m.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing */}
            <div className="px-8 md:px-12 pb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Investimento</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 6 months */}
                <div className="border-2 rounded-xl p-6 relative" style={{ borderColor: 'hsl(16 82% 51%)' }}>
                  <div className="absolute -top-3 left-4 px-3 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: 'hsl(16 82% 51%)' }}>
                    RECOMENDADO
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mt-2">Plano Semestral</h3>
                  <p className="text-xs text-gray-500 mb-4">Contrato de 6 meses</p>
                  <p className="text-3xl font-bold" style={{ color: 'hsl(16 82% 51%)' }}>{fmt(monthlyTotal)}<span className="text-sm font-normal text-gray-500">/mês</span></p>
                  <div className="mt-3 space-y-1 text-xs text-gray-500">
                    <p>✅ Sem taxa de implementação</p>
                    <p>✅ Todos os serviços do pacote</p>
                    {bonusServices.length > 0 && <p>✅ {bonusServices.length} bônus exclusivos</p>}
                    <p>✅ Equipe dedicada</p>
                    <p>✅ Portal do cliente</p>
                  </div>
                  <p className="mt-4 text-sm text-gray-600">Total semestral: <strong>{fmt(monthlyTotal * 6)}</strong></p>
                </div>

                {/* Annual */}
                <div className="border rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-800">Plano Anual</h3>
                  <p className="text-xs text-gray-500 mb-4">Contrato de 12 meses{customDiscount > 0 ? ` com ${customDiscount}% de desconto` : ''}</p>
                  <p className="text-3xl font-bold text-gray-800">
                    {fmt(customDiscount > 0 ? monthlyTotal * (1 - customDiscount / 100) : monthlyTotal)}
                    <span className="text-sm font-normal text-gray-500">/mês</span>
                  </p>
                  {customDiscount > 0 && <p className="text-xs text-gray-400 line-through">{fmt(monthlyTotal)}/mês</p>}
                  <div className="mt-3 space-y-1 text-xs text-gray-500">
                    <p>✅ Sem taxa de implementação</p>
                    <p>✅ Todos os serviços do pacote</p>
                    {customDiscount > 0 && <p>✅ Economia de {fmt(annualTotal - annualWithDiscount)}/ano</p>}
                    <p>✅ Equipe dedicada</p>
                    <p>✅ Portal do cliente</p>
                  </div>
                  <p className="mt-4 text-sm text-gray-600">Total anual: <strong>{fmt(annualWithDiscount)}</strong></p>
                </div>
              </div>

              {/* No contract warning */}
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

            {/* Observations */}
            {observations && (
              <div className="px-8 md:px-12 pb-8">
                <h2 className="text-lg font-bold text-gray-800 mb-2">Observações</h2>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{observations}</p>
              </div>
            )}

            {/* Footer */}
            <div className="p-8 md:p-12 text-center" style={{ background: 'linear-gradient(135deg, hsl(16 82% 51%), hsl(16 82% 38%))' }}>
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
