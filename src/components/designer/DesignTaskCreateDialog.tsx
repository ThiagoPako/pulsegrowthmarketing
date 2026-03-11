import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDesignTasks } from '@/hooks/useDesignTasks';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import ClientLogo from '@/components/ClientLogo';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DesignTaskCreateDialog({ open, onOpenChange }: Props) {
  const { clients } = useApp();
  const { user } = useAuth();
  const { createTask, addHistory } = useDesignTasks();
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [formatType, setFormatType] = useState('feed');
  const [priority, setPriority] = useState('media');
  const [copyText, setCopyText] = useState('');
  const [referencesLinks, setReferencesLinks] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!clientId || !title) return;
    setSubmitting(true);
    try {
      const links = referencesLinks.split('\n').map(l => l.trim()).filter(Boolean);
      await createTask.mutateAsync({
        client_id: clientId,
        title,
        format_type: formatType,
        priority,
        copy_text: copyText || null,
        references_links: links,
        description: description || null,
        created_by: user?.id || null,
        kanban_column: 'nova_tarefa',
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
      setTitle('');
      setFormatType('feed');
      setPriority('media');
      setCopyText('');
      setReferencesLinks('');
      setDescription('');
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Get seasonal dates for selected client
  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Demanda para Designer</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Cliente *</Label>
            <Select value={clientId} onValueChange={setClientId}>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Formato</Label>
              <Select value={formatType} onValueChange={setFormatType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="feed">Feed</SelectItem>
                  <SelectItem value="story">Story</SelectItem>
                  <SelectItem value="logomarca">Logomarca</SelectItem>
                  <SelectItem value="midia_fisica">Mídia Física</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Copy (texto para a arte)</Label>
            <Textarea value={copyText} onChange={e => setCopyText(e.target.value)} placeholder="Texto que será usado na arte..." rows={3} />
          </div>

          <div>
            <Label>Referências (links — um por linha)</Label>
            <Textarea value={referencesLinks} onChange={e => setReferencesLinks(e.target.value)} placeholder="https://pinterest.com/pin/...\nhttps://instagram.com/p/..." rows={3} />
          </div>

          <div>
            <Label>Descrição / Observações</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Detalhes adicionais..." rows={2} />
          </div>

          <Button onClick={handleSubmit} disabled={!clientId || !title || submitting} className="w-full">
            {submitting ? 'Criando...' : 'Criar Demanda'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
