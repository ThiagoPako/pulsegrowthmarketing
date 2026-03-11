import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Building2, Users, Star, MessageSquare, Camera, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';

export default function ClientBriefing() {
  const { clientId } = useParams<{ clientId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [client, setClient] = useState<any>(null);

  // Briefing form
  const [companyHistory, setCompanyHistory] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [differentials, setDifferentials] = useState('');
  const [services, setServices] = useState('');
  const [communicationTone, setCommunicationTone] = useState('');
  const [useRealPhotos, setUseRealPhotos] = useState<string>('');

  useEffect(() => {
    if (!clientId) return;
    const fetch = async () => {
      const { data: clientData } = await supabase.from('clients').select('company_name, responsible_person, color, logo_url').eq('id', clientId).single();
      if (clientData) setClient(clientData);
      
      // Check if briefing already exists
      const { data: tasks } = await supabase.from('onboarding_tasks').select('*').eq('client_id', clientId).eq('stage', 'briefing');
      if (tasks && tasks.length > 0) {
        const t = tasks[0] as any;
        if (t.briefing_completed) setCompleted(true);
        if (t.briefing_data) {
          const bd = typeof t.briefing_data === 'string' ? JSON.parse(t.briefing_data) : t.briefing_data;
          setCompanyHistory(bd.companyHistory || '');
          setTargetAudience(bd.targetAudience || '');
          setDifferentials(bd.differentials || '');
          setServices(bd.services || '');
          setCommunicationTone(bd.communicationTone || '');
          setUseRealPhotos(bd.useRealPhotos || '');
        }
      }
      setLoading(false);
    };
    fetch();
  }, [clientId]);

  const handleSubmit = async () => {
    if (!companyHistory || !targetAudience || !communicationTone) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const briefingData = { companyHistory, targetAudience, differentials, services, communicationTone, useRealPhotos };
      
      // Update editorial on client
      await supabase.from('clients').update({
        editorial: `## História\n${companyHistory}\n\n## Público-Alvo\n${targetAudience}\n\n## Diferenciais\n${differentials}\n\n## Serviços\n${services}\n\n## Tom de Comunicação\n${communicationTone}`,
      } as any).eq('id', clientId);

      // Update onboarding task
      const { data: tasks } = await supabase.from('onboarding_tasks').select('id').eq('client_id', clientId).eq('stage', 'briefing');
      if (tasks && tasks.length > 0) {
        await supabase.from('onboarding_tasks').update({
          briefing_data: briefingData,
          briefing_completed: true,
          use_real_photos: useRealPhotos === 'real',
          status: 'concluido',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any).eq('id', (tasks[0] as any).id);
      }

      setCompleted(true);
      toast.success('Briefing enviado com sucesso!');
    } catch (err) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Carregando...</div>
    </div>
  );

  if (!client) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-lg font-semibold">Cliente não encontrado</p>
    </div>
  );

  if (completed) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Sonner />
      <div className="text-center space-y-4 max-w-md mx-auto px-6">
        <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Briefing enviado!</h1>
        <p className="text-muted-foreground">Obrigado por preencher as informações. Nossa equipe vai analisar e preparar tudo para sua marca.</p>
        <img src="/pulse_header.png" alt="Pulse Growth Marketing" className="h-8 mx-auto opacity-60 mt-8" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Sonner />
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <img src="/pulse_header.png" alt="Pulse Growth Marketing" className="h-8" />
          <Badge variant="secondary" className="text-xs">{client.company_name}</Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold">Briefing — {client.company_name} 📋</h1>
          <p className="text-sm text-muted-foreground">Preencha as informações abaixo para que possamos criar o melhor conteúdo para sua marca.</p>
        </div>

        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Building2 size={16} className="text-primary" /> História da Empresa *
            </Label>
            <Textarea value={companyHistory} onChange={e => setCompanyHistory(e.target.value)} rows={4}
              placeholder="Conte um pouco sobre como a empresa começou, sua trajetória e valores..." />
          </div>

          <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Users size={16} className="text-primary" /> Público-Alvo *
            </Label>
            <Textarea value={targetAudience} onChange={e => setTargetAudience(e.target.value)} rows={3}
              placeholder="Descreva o perfil do seu cliente ideal (idade, gênero, interesses, localização...)" />
          </div>

          <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Star size={16} className="text-primary" /> Diferenciais
            </Label>
            <Textarea value={differentials} onChange={e => setDifferentials(e.target.value)} rows={3}
              placeholder="O que diferencia a sua empresa da concorrência?" />
          </div>

          <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
            <Label className="text-sm font-semibold">Serviços / Produtos</Label>
            <Textarea value={services} onChange={e => setServices(e.target.value)} rows={3}
              placeholder="Liste os principais serviços ou produtos que sua empresa oferece" />
          </div>

          <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare size={16} className="text-primary" /> Tom de Comunicação *
            </Label>
            <Select value={communicationTone} onValueChange={setCommunicationTone}>
              <SelectTrigger><SelectValue placeholder="Como deseja se comunicar nas redes?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">Formal e Profissional</SelectItem>
                <SelectItem value="informal">Informal e Descontraído</SelectItem>
                <SelectItem value="tecnico">Técnico e Educacional</SelectItem>
                <SelectItem value="inspiracional">Inspiracional e Motivacional</SelectItem>
                <SelectItem value="divertido">Divertido e Bem-humorado</SelectItem>
                <SelectItem value="elegante">Elegante e Sofisticado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Photo preference */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Camera size={16} className="text-primary" /> Fotos para Artes
            </Label>
            <p className="text-xs text-muted-foreground">As artes devem usar fotos reais da empresa ou da equipe?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setUseRealPhotos('real')}
                className={`p-3 rounded-xl border-2 text-center transition-all text-sm ${
                  useRealPhotos === 'real' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                }`}
              >
                📸 Fotos reais da empresa/equipe
              </button>
              <button
                onClick={() => setUseRealPhotos('banco')}
                className={`p-3 rounded-xl border-2 text-center transition-all text-sm ${
                  useRealPhotos === 'banco' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                }`}
              >
                🖼️ Fotos de banco de imagem
              </button>
            </div>

            {useRealPhotos === 'real' && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-2 items-start">
                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ Se não houver fotos profissionais em estúdio, será necessário agendar sessão de fotos. 
                  Isso pode gerar pequeno atraso na reformulação do perfil e pode ter custo adicional com fotógrafo.
                </p>
              </div>
            )}
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={saving} className="w-full" size="lg">
          {saving ? 'Enviando...' : 'Enviar Briefing'}
        </Button>
      </div>
    </div>
  );
}
