import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import MediaUploader from './MediaUploader';
import type { ClientProfessional } from '@/hooks/useClientDatabase';

export interface ProfessionalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  professional: ClientProfessional | null;
  onSave: (payload: Record<string, unknown>) => void;
  saving?: boolean;
}

const emptyForm = {
  name: '',
  specialty: '',
  council_type: 'CRM',
  council_number: '',
  rqe: '',
  phone: '',
  email: '',
  bio: '',
  schedule_notes: '',
  active: true,
  photos: [] as string[],
  videos: [] as string[],
};

export default function ProfessionalDialog({ open, onOpenChange, clientId, professional, onSave, saving }: ProfessionalDialogProps) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(
      professional
        ? {
            name: professional.name || '',
            specialty: professional.specialty || '',
            council_type: professional.council_type || 'CRM',
            council_number: professional.council_number || '',
            rqe: professional.rqe || '',
            phone: professional.phone || '',
            email: professional.email || '',
            bio: professional.bio || '',
            schedule_notes: professional.schedule_notes || '',
            active: professional.active ?? true,
            photos: professional.photos || [],
            videos: professional.videos || [],
          }
        : emptyForm,
    );
  }, [open, professional]);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onSave({ ...(professional ? { id: professional.id } : {}), client_id: clientId, ...form });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{professional ? 'Editar profissional' : 'Novo profissional'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>Nome completo</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. João da Silva" />
          </div>
          <div className="space-y-1">
            <Label>Especialidade</Label>
            <Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Cardiologia" />
          </div>
          <div className="space-y-1">
            <Label>Conselho (CRM, CRO, CREFITO...)</Label>
            <Input value={form.council_type} onChange={(e) => setForm({ ...form, council_type: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Número do conselho</Label>
            <Input value={form.council_number} onChange={(e) => setForm({ ...form, council_number: e.target.value })} placeholder="12345/GO" />
          </div>
          <div className="space-y-1">
            <Label>RQE</Label>
            <Input value={form.rqe} onChange={(e) => setForm({ ...form, rqe: e.target.value })} placeholder="RQE 9876" />
          </div>
          <div className="space-y-1">
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Agenda de atendimento (dias e horários)</Label>
            <Textarea
              rows={3}
              value={form.schedule_notes}
              onChange={(e) => setForm({ ...form, schedule_notes: e.target.value })}
              placeholder="Seg e Qua — 08h às 12h | Sex — 14h às 18h"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Observações para a designer</Label>
            <Textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </div>

          <div className="md:col-span-2">
            <MediaUploader
              label="Fotos do profissional"
              accept="image/*"
              kind="image"
              folder="banco-clientes/profissionais"
              value={form.photos}
              onChange={(photos) => setForm({ ...form, photos })}
            />
          </div>
          <div className="md:col-span-2">
            <MediaUploader
              label="Vídeos do profissional"
              accept="video/*"
              kind="video"
              folder="banco-clientes/profissionais"
              value={form.videos}
              onChange={(videos) => setForm({ ...form, videos })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3 md:col-span-2">
            <Label>Profissional ativo</Label>
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
