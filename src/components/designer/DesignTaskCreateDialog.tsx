import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDesignTasks } from '@/hooks/useDesignTasks';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import ClientLogo from '@/components/ClientLogo';
import { supabase } from '@/lib/vpsDb';
import { uploadFileToVps } from '@/services/vpsApi';
import { toast } from 'sonner';
import { Upload, Link2, X, Image, Loader2, Plus, Calendar } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMAT_OPTIONS = [
  { key: 'feed', label: '📐 Feed', description: 'Post quadrado/retangular' },
  { key: 'story', label: '📱 Story', description: 'Formato vertical 9:16' },
  { key: 'logomarca', label: '🎨 Logomarca', description: 'Identidade visual' },
  { key: 'midia_fisica', label: '🖨 Mídia Física', description: 'Cartão, banner, etc' },
  { key: 'carrossel', label: '🎠 Carrossel', description: 'Múltiplos slides' },
  { key: 'capa', label: '🖼 Capa', description: 'Capa de destaque/rede' },
  { key: 'thumbnail', label: '▶️ Thumbnail', description: 'Miniatura de vídeo' },
];

export default function DesignTaskCreateDialog({ open, onOpenChange }: Props) {
  const { clients } = useApp();
  const { user } = useAuth();
  const { createTask, addHistory } = useDesignTasks();
  const [clientId, setClientId] = useState<string | null>('');
  const [prospectName, setProspectName] = useState('');
  const [isUnregistered, setIsUnregistered] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['feed']);
  const [priority, setPriority] = useState('media');
  const [copyText, setCopyText] = useState('');
  const [referencesLinks, setReferencesLinks] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reference images state
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [refLinkInput, setRefLinkInput] = useState('');
  const [uploadingRef, setUploadingRef] = useState(false);
  const refFileRef = useRef<HTMLInputElement>(null);

  const toggleFormat = (format: string) => {
    setSelectedFormats(prev => {
      if (prev.includes(format)) {
        if (prev.length === 1) return prev; // at least one
        return prev.filter(f => f !== format);
      }
      return [...prev, format];
    });
  };

  const handleAddRefLink = () => {
    if (!refLinkInput.trim()) return;
    setReferenceImages(prev => [...prev, refLinkInput.trim()]);
    setRefLinkInput('');
  };

  const handleUploadRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingRef(true);
    try {
      const publicUrl = await uploadFileToVps(file, `design/referencias/${clientId || 'geral'}`);
      setReferenceImages(prev => [...prev, publicUrl]);
      toast.success('Referência enviada!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar');
    } finally {
      setUploadingRef(false);
    }
  };

  const removeRefImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if ((!clientId && !isUnregistered) || (!title)) return;
    if (isUnregistered && !prospectName.trim()) {
      toast.error('Informe o nome do cliente');
      return;
    }

    setSubmitting(true);
    try {
      const links = referencesLinks.split('\n').map(l => l.trim()).filter(Boolean);
      const primaryFormat = selectedFormats[0] || 'feed';
      const formatDesc = selectedFormats.length > 1
        ? `Formatos: ${selectedFormats.map(f => FORMAT_OPTIONS.find(o => o.key === f)?.label || f).join(', ')}`
        : '';
      const fullDescription = [description, formatDesc].filter(Boolean).join('\n\n');

      await createTask.mutateAsync({
        client_id: isUnregistered ? null : clientId,
        prospect_name: isUnregistered ? prospectName : null,
        title,
        format_type: primaryFormat,
        priority,
        copy_text: copyText || null,
        references_links: links,
        reference_images: referenceImages,
        description: fullDescription || null,
        due_date: dueDate || null,
        created_by: user?.id || null,
        kanban_column: 'nova_tarefa',
        position: Date.now(), // High initial position
      } as any);

      // Notify designers
      await supabase.rpc('notify_role', {
        _role: 'fotografo',
        _title: 'Nova tarefa de design',
        _message: `Nova tarefa: ${title}`,
        _type: 'design',
        _link: '/designer',
      });

      setClientId('');
      setProspectName('');
      setIsUnregistered(false);
      setTitle('');
      setSelectedFormats(['feed']);
      setPriority('media');
      setCopyText('');
      setReferencesLinks('');
      setDescription('');
      setDueDate('');
      setReferenceImages([]);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Demanda para Designer</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Cliente *</Label>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="isUnregistered" 
                  checked={isUnregistered} 
                  onCheckedChange={(checked) => setIsUnregistered(checked === true)} 
                />
                <label htmlFor="isUnregistered" className="text-xs font-medium cursor-pointer">Cliente não cadastrado</label>
              </div>
            </div>
            
            {!isUnregistered ? (
              <Select value={clientId || ''} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <ClientLogo client={{ companyName: c.companyName, color: c.color, logoUrl: c.logoUrl }} size="sm" />
                        {c.companyName}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input 
                value={prospectName} 
                onChange={e => setProspectName(e.target.value)} 
                placeholder="Nome da empresa/cliente" 
              />
            )}

          </div>

          {selectedClient?.niche && (
            <div className="p-2 rounded-lg bg-accent border border-border text-xs">
              <p className="font-medium text-foreground">📅 Datas sazonais do nicho: {selectedClient.niche}</p>
              <p className="text-muted-foreground mt-1">Verifique as datas importantes do nicho ao criar a arte.</p>
            </div>
          )}

          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Arte para Black Friday" />
          </div>

          {/* Format selection - multi-select buttons */}
          <div>
            <Label className="mb-2 block">Formatos da Arte *</Label>
            <div className="flex flex-wrap gap-2">
              {FORMAT_OPTIONS.map(fmt => {
                const selected = selectedFormats.includes(fmt.key);
                return (
                  <button
                    key={fmt.key}
                    type="button"
                    onClick={() => toggleFormat(fmt.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                      selected
                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/30'
                    }`}
                  >
                    <span>{fmt.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedFormats.length > 1 && (
              <p className="text-[10px] text-muted-foreground mt-1">{selectedFormats.length} formatos selecionados</p>
            )}
          </div>

          <div>
            <Label>Prioridade</Label>
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

          <div>
            <Label>Data de Vencimento</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <Label>Copy (texto para a arte)</Label>
            <Textarea value={copyText} onChange={e => setCopyText(e.target.value)} placeholder="Texto que será usado na arte..." rows={3} />
          </div>

          {/* Reference images/links section */}
          <div>
            <Label className="mb-2 block">Referências Visuais</Label>
            
            {/* Uploaded/added references preview */}
            {referenceImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {referenceImages.map((img, i) => {
                  const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(img);
                  return (
                    <div key={i} className="relative group">
                      {isImage ? (
                        <div className="w-20 h-20 rounded-lg border border-border overflow-hidden">
                          <img src={img} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-lg border border-border flex items-center justify-center bg-muted/30">
                          <Link2 size={16} className="text-muted-foreground" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRefImage(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add reference inputs */}
            <div className="flex items-center gap-2">
              <Input
                value={refLinkInput}
                onChange={e => setRefLinkInput(e.target.value)}
                placeholder="Cole um link de referência..."
                className="text-xs h-9 flex-1"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddRefLink())}
              />
              <Button type="button" size="sm" variant="secondary" className="h-9 text-xs gap-1" onClick={handleAddRefLink} disabled={!refLinkInput.trim()}>
                <Plus size={12} /> Link
              </Button>
              <input ref={refFileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadRef} />
              <Button type="button" size="sm" variant="secondary" className="h-9 text-xs gap-1" onClick={() => refFileRef.current?.click()} disabled={uploadingRef}>
                {uploadingRef ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                Imagem
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Adicione links do Pinterest, Instagram ou envie imagens de referência</p>
          </div>

          <div>
            <Label>Referências (links — um por linha)</Label>
            <Textarea value={referencesLinks} onChange={e => setReferencesLinks(e.target.value)} placeholder="https://pinterest.com/pin/...\nhttps://instagram.com/p/..." rows={3} />
          </div>

          <div>
            <Label>Descrição / Observações</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Detalhes adicionais..." rows={2} />
          </div>

          <Button onClick={handleSubmit} disabled={(!clientId && !isUnregistered) || !title || submitting} className="w-full">
            {submitting ? 'Criando...' : 'Criar Demanda'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
