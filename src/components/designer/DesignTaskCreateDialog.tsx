import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import ClientLogo from '@/components/ClientLogo';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';
import { AlertTriangle, Calendar, CheckCircle2, FolderOpen, Layers } from 'lucide-react';
import DesignFormatPicker from '@/components/designer/DesignFormatPicker';
import DesignCopyFields from '@/components/designer/DesignCopyFields';
import DesignReferenceUploader from '@/components/designer/DesignReferenceUploader';
import {
  DESIGN_FORMAT_PRESETS,
  DesignCopyBrief,
  DesignDimensions,
  DesignFormatPresetKey,
  assembleCopyText,
  describeDesignFormat,
  describeMissingForForm,
  dimensionsFromPreset,
  formatTypeForDimensions,
  getDesignBriefMissing,
  isCopyBriefEmpty,
  normalizeCopyBrief,
} from '@/lib/designBrief';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const newTaskId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

/**
 * Nova demanda de arte: tudo o que o designer (pessoa ou agente de IA) precisa — cliente (com a pasta
 * do Drive), formato/dimensão, copy em campos, Drive dos materiais, referências (arquivos e links),
 * prazo e prioridade. Sem o mínimo (cliente, formato e copy ou descrição) a tela explica o que falta.
 */
export default function DesignTaskCreateDialog({ open, onOpenChange }: Props) {
  const { clients } = useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [taskId, setTaskId] = useState(newTaskId);
  const [clientId, setClientId] = useState<string>('');
  const [prospectName, setProspectName] = useState('');
  const [isUnregistered, setIsUnregistered] = useState(false);
  const [title, setTitle] = useState('');
  const [dimensions, setDimensions] = useState<DesignDimensions | null>(dimensionsFromPreset('feed'));
  const [extraFormats, setExtraFormats] = useState<DesignFormatPresetKey[]>([]);
  const [priority, setPriority] = useState('media');
  const [copyBrief, setCopyBrief] = useState<DesignCopyBrief>({});
  const [description, setDescription] = useState('');
  const [materialsLink, setMaterialsLink] = useState('');
  const [referenceFiles, setReferenceFiles] = useState<string[]>([]);
  const [referenceLinks, setReferenceLinks] = useState<string[]>([]);
  const [uploadingRefs, setUploadingRefs] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  const reset = () => {
    setTaskId(newTaskId());
    setClientId('');
    setProspectName('');
    setIsUnregistered(false);
    setTitle('');
    setDimensions(dimensionsFromPreset('feed'));
    setExtraFormats([]);
    setPriority('media');
    setCopyBrief({});
    setDescription('');
    setMaterialsLink('');
    setReferenceFiles([]);
    setReferenceLinks([]);
    setDueDate('');
    setShowMissing(false);
  };

  // cada abertura do formulário é uma demanda nova (pasta de referências própria)
  useEffect(() => {
    if (open) setTaskId(newTaskId());
  }, [open]);

  const selectedClient = clients.find((c) => c.id === clientId);
  const clientDrive = (selectedClient?.driveLink || '').trim();
  const brief = normalizeCopyBrief(copyBrief);
  const missing = useMemo(() => getDesignBriefMissing({
    client_id: isUnregistered ? null : clientId || null,
    prospect_name: isUnregistered ? prospectName : null,
    dimensions,
    copy_brief: brief,
    description,
  }), [isUnregistered, clientId, prospectName, dimensions, brief, description]);
  const formatInfo = dimensions ? describeDesignFormat(dimensions) : null;

  const toggleExtra = (key: DesignFormatPresetKey) => {
    setExtraFormats((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSubmit = async () => {
    if (missing.length > 0) {
      setShowMissing(true);
      toast.error('Faltam informações para o designer conseguir fazer a arte');
      return;
    }
    if (uploadingRefs) {
      toast.error('Espere as referências terminarem de enviar');
      return;
    }
    if (materialsLink.trim() && !/^https?:\/\//i.test(materialsLink.trim())) {
      toast.error('O link dos materiais precisa começar com https://');
      return;
    }
    setSubmitting(true);
    try {
      const copyText = isCopyBriefEmpty(brief) ? null : assembleCopyText(brief);
      const baseTitle = title.trim() || brief.headline || description.trim().split('\n')[0].slice(0, 80) || `Arte ${formatInfo?.name || ''}`.trim();
      const formats = [dimensions!, ...extraFormats.map((k) => dimensionsFromPreset(k))];
      const created: string[] = [];
      for (let i = 0; i < formats.length; i++) {
        const dims = formats[i];
        const info = describeDesignFormat(dims);
        const row = {
          ...(i === 0 ? { id: taskId } : {}),
          client_id: isUnregistered ? null : clientId,
          prospect_name: isUnregistered ? prospectName.trim() : null,
          title: formats.length > 1 ? `${baseTitle} — ${info?.name || dims.preset}` : baseTitle,
          format_type: formatTypeForDimensions(dims),
          dimensions: dims,
          copy_brief: isCopyBriefEmpty(brief) ? null : brief,
          copy_text: copyText,
          references_links: referenceLinks,
          reference_images: referenceFiles,
          materials_link: materialsLink.trim() || null,
          priority,
          description: description.trim() || null,
          due_date: dueDate || null,
          created_by: user?.id || null,
          kanban_column: 'nova_tarefa',
          position: 0, // Posicionamento inicial seguro no topo
        };
        const { data, error } = await supabase.from('design_tasks').insert(row as any).select('id').single();
        if (error) throw new Error(error.message || 'Erro ao criar a tarefa');
        created.push((data as any)?.id || '');
      }

      // Avisa o painel de design ('designer' e 'fotografo'). Falha no aviso não desfaz a demanda.
      for (const role of ['designer', 'fotografo']) {
        try {
          await supabase.rpc('notify_role', {
            _role: role,
            _title: 'Nova tarefa de design',
            _message: `Nova tarefa: ${baseTitle}${formats.length > 1 ? ` (${formats.length} formatos)` : ''}`,
            _type: 'design',
            _link: '/designer',
          });
        } catch (err) {
          console.warn('[design] falha ao avisar o cargo', role, err);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['design-tasks'] });
      toast.success(created.length > 1 ? `${created.length} tarefas de design criadas (uma por formato)` : 'Tarefa de design criada!');
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar a tarefa');
    } finally {
      setSubmitting(false);
    }
  };

  const section = 'rounded-xl border border-border p-3 space-y-2.5';
  const sectionTitle = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Nova Demanda para Designer</DialogTitle>
          <DialogDescription className="text-xs">
            Tudo o que o designer precisa para fazer a arte sem perguntar. Obrigatório: cliente, formato e copy ou descrição.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Cliente */}
          <div className={section}>
            <div className="flex items-center justify-between gap-2">
              <Label className={sectionTitle}>1 · Cliente *</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="isUnregistered" checked={isUnregistered} onCheckedChange={(checked) => setIsUnregistered(checked === true)} />
                <label htmlFor="isUnregistered" className="text-xs font-medium cursor-pointer">Cliente não cadastrado</label>
              </div>
            </div>
            {!isUnregistered ? (
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <ClientLogo client={{ companyName: c.companyName, color: c.color, logoUrl: c.logoUrl }} size="sm" />
                        {c.companyName}
                        {!(c.driveLink || '').trim() && <span className="text-[10px] text-amber-600">· sem Drive</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={prospectName} onChange={(e) => setProspectName(e.target.value)} placeholder="Nome da empresa/cliente" />
            )}
            {selectedClient && !isUnregistered && (
              clientDrive ? (
                <a href={clientDrive} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <FolderOpen size={13} /> Pasta do Drive do cliente (identidade, logos e fotos)
                </a>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Este cliente não tem a pasta do Drive cadastrada; lá ficam identidade, logos e fotos usados nas artes —
                    preencha em <Link to="/clientes" className="underline font-medium">Clientes</Link>.
                  </span>
                </div>
              )
            )}
            {selectedClient?.niche && (
              <p className="text-[11px] text-muted-foreground">📅 Nicho: {selectedClient.niche} — confira as datas sazonais ao criar a arte.</p>
            )}
          </div>

          {/* Formato */}
          <div className={section}>
            <Label className={sectionTitle}><Layers size={12} /> 2 · Formato e dimensão *</Label>
            <DesignFormatPicker value={dimensions} onChange={setDimensions} />
            <details className="text-xs">
              <summary className="cursor-pointer text-primary font-medium">Criar também em outros formatos (um card por formato)</summary>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {DESIGN_FORMAT_PRESETS.filter((p) => p.key !== 'personalizado' && p.key !== 'logomarca' && p.key !== dimensions?.preset).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => toggleExtra(p.key)}
                    className={`px-2 py-1 rounded-md border text-[11px] ${extraFormats.includes(p.key) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                  >
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
              {extraFormats.length > 0 && <p className="text-[10px] text-muted-foreground mt-1">{extraFormats.length + 1} cards serão criados com a mesma copy e as mesmas referências.</p>}
            </details>
          </div>

          {/* Copy */}
          <div className={section}>
            <Label className={sectionTitle}>3 · Copy da arte (texto que vai na arte)</Label>
            <DesignCopyFields value={copyBrief} onChange={setCopyBrief} />
            <div className="space-y-1">
              <Label className="text-xs">Descrição / o que a arte precisa transmitir</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Post de Dia das Crianças com a equipe, tom alegre, usar fotos da pasta 'Equipe'." rows={2} />
            </div>
          </div>

          {/* Materiais e referências */}
          <div className={section}>
            <Label className={sectionTitle}><FolderOpen size={12} /> 4 · Materiais e referências</Label>
            <div className="space-y-1">
              <Label className="text-xs">Link do Drive com os materiais desta arte</Label>
              <Input value={materialsLink} onChange={(e) => setMaterialsLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." className="text-sm" />
              <p className="text-[10px] text-muted-foreground">Fotos e arquivos só desta arte. Identidade e logos ficam na pasta do cliente.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Referências (arquivos e links)</Label>
              <DesignReferenceUploader
                files={referenceFiles}
                onFilesChange={setReferenceFiles}
                links={referenceLinks}
                onLinksChange={setReferenceLinks}
                folder={`design-refs/${(isUnregistered ? '' : clientId) || 'avulso'}/${taskId}`}
                onUploadingChange={setUploadingRefs}
              />
            </div>
          </div>

          {/* Prazo, prioridade, título */}
          <div className={`${section} grid gap-3 sm:grid-cols-3 space-y-0`}>
            <div className="space-y-1 sm:col-span-3">
              <Label className="text-xs">Título do card</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Se ficar vazio, usa o título da copy" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">🌿 Baixa</SelectItem>
                  <SelectItem value="media">💜 Média</SelectItem>
                  <SelectItem value="alta">⚡ Alta</SelectItem>
                  <SelectItem value="urgente">🔥 Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Prazo</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="pl-9" />
              </div>
            </div>
          </div>

          {showMissing && missing.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1" role="alert">
              <p className="font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle size={13} /> Falta para criar a demanda:</p>
              <ul className="list-disc list-inside text-destructive/90 space-y-0.5">
                {describeMissingForForm(missing).map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}
          {missing.length === 0 && (
            <p className="text-[11px] text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Brief completo{formatInfo ? `: ${formatInfo.label}` : ''}</p>
          )}

          <Button onClick={handleSubmit} disabled={submitting || uploadingRefs} className="w-full">
            {submitting ? 'Criando...' : uploadingRefs ? 'Enviando referências…' : extraFormats.length ? `Criar ${extraFormats.length + 1} demandas` : 'Criar Demanda'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
