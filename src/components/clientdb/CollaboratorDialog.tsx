import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import MediaUploader from './MediaUploader';
import type { ClientCollaborator } from '@/hooks/useClientDatabase';

export interface CollaboratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  collaborator: ClientCollaborator | null;
  onSave: (payload: Record<string, unknown>) => void;
  saving?: boolean;
}

const emptyForm = {
  name: '',
  job_role: '',
  department: '',
  birthday: '',
  phone: '',
  email: '',
  notes: '',
  active: true,
  photos: [] as string[],
  videos: [] as string[],
};

/** Cadastro de colaboradores do cliente — usado nas artes de aniversariantes do mês. */
export default function CollaboratorDialog({ open, onOpenChange, clientId, collaborator, onSave, saving }: CollaboratorDialogProps) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(
      collaborator
        ? {
            name: collaborator.name || '',
            job_role: collaborator.job_role || '',
            department: collaborator.department || '',
            birthday: (collaborator.birthday || '').slice(0, 10),
            phone: collaborator.phone || '',
            email: collaborator.email || '',
            notes: collaborator.notes || '',
            active: collaborator.active ?? true,
            photos: collaborator.photos || [],
            videos: collaborator.videos || [],
          }
        : emptyForm,
    );
  }, [open, collaborator]);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onSave({
      ...(collaborator ? { id: collaborator.id } : {}),
      client_id: clientId,
      ...form,
      birthday: form.birthday || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{collaborator ? 'Editar colaborador' : 'Novo colaborador'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>Nome completo</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Maria Silva" />
          </div>
          <div className="space-y-1">
            <Label>Cargo / função</Label>
            <Input value={form.job_role} onChange={(e) => setForm({ ...form, job_role: e.target.value })} placeholder="Atendente" />
          </div>
          <div className="space-y-1">
            <Label>Setor</Label>
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Recepção" />
          </div>
          <div className="space-y-1">
            <Label>Data de aniversário</Label>
            <Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>E-mail</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Observações para a designer</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Cores preferidas, apelido, frase, etc." />
          </div>

          <div className="md:col-span-2">
            <MediaUploader
              label="Fotos do colaborador"
              accept="image/*"
              kind="image"
              folder="banco-clientes/colaboradores"
              value={form.photos}
              onChange={(photos) => setForm({ ...form, photos })}
            />
          </div>
          <div className="md:col-span-2">
            <MediaUploader
              label="Vídeos do colaborador"
              accept="video/*"
              kind="video"
              folder="banco-clientes/colaboradores"
              value={form.videos}
              onChange={(videos) => setForm({ ...form, videos })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3 md:col-span-2">
            <Label>Colaborador ativo</Label>
            <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.name.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
