import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MediaUploader from './MediaUploader';
import type { ClientUnit } from '@/hooks/useClientDatabase';

export const UNIT_TYPES = [
  { value: 'geral', label: 'Unidade geral' },
  { value: 'posto', label: 'Posto de combustível' },
  { value: 'provedor', label: 'Provedor de internet' },
  { value: 'hospital', label: 'Hospital / Clínica' },
  { value: 'loja', label: 'Loja / Varejo' },
];

export interface UnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  unit: ClientUnit | null;
  onSave: (payload: Record<string, unknown>) => void;
  saving?: boolean;
}

const emptyForm = {
  unit_name: '',
  unit_type: 'geral',
  city_name: '',
  state: '',
  city_anniversary: '',
  population: '',
  competitors: '',
  has_convenience: false,
  has_lodging: false,
  has_restaurant: false,
  address: '',
  phone: '',
  manager_name: '',
  notes: '',
  photos: [] as string[],
  videos: [] as string[],
};

export default function UnitDialog({ open, onOpenChange, clientId, unit, onSave, saving }: UnitDialogProps) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(
      unit
        ? {
            unit_name: unit.unit_name || '',
            unit_type: unit.unit_type || 'geral',
            city_name: unit.city_name || '',
            state: unit.state || '',
            city_anniversary: unit.city_anniversary || '',
            population: unit.population != null ? String(unit.population) : '',
            competitors: unit.competitors || '',
            has_convenience: unit.has_convenience ?? false,
            has_lodging: unit.has_lodging ?? false,
            has_restaurant: unit.has_restaurant ?? false,
            address: unit.address || '',
            phone: unit.phone || '',
            manager_name: unit.manager_name || '',
            notes: unit.notes || '',
            photos: unit.photos || [],
            videos: unit.videos || [],
          }
        : emptyForm,
    );
  }, [open, unit]);

  const handleSubmit = () => {
    if (!form.unit_name.trim()) return;
    onSave({
      ...(unit ? { id: unit.id } : {}),
      client_id: clientId,
      ...form,
      city_anniversary: form.city_anniversary || null,
      population: form.population ? Number(form.population) : null,
    });
  };

  const isPosto = form.unit_type === 'posto';
  const isProvedor = form.unit_type === 'provedor';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{unit ? 'Editar unidade' : 'Nova unidade da rede'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Nome da unidade</Label>
            <Input value={form.unit_name} onChange={(e) => setForm({ ...form, unit_name: e.target.value })} placeholder="Posto Central — Minaçu" />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={form.unit_type} onValueChange={(unit_type) => setForm({ ...form, unit_type })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Cidade</Label>
            <Input value={form.city_name} onChange={(e) => setForm({ ...form, city_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Estado (UF)</Label>
            <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} />
          </div>
          <div className="space-y-1">
            <Label>Aniversário da cidade</Label>
            <Input type="date" value={form.city_anniversary} onChange={(e) => setForm({ ...form, city_anniversary: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Responsável / gerente</Label>
            <Input value={form.manager_name} onChange={(e) => setForm({ ...form, manager_name: e.target.value })} />
          </div>

          {isProvedor && (
            <>
              <div className="space-y-1">
                <Label>Número de habitantes</Label>
                <Input type="number" min={0} value={form.population} onChange={(e) => setForm({ ...form, population: e.target.value })} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Concorrentes na cidade</Label>
                <Textarea rows={2} value={form.competitors} onChange={(e) => setForm({ ...form, competitors: e.target.value })} />
              </div>
            </>
          )}

          {isPosto && (
            <div className="grid grid-cols-1 gap-2 md:col-span-2 sm:grid-cols-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label className="text-sm">Conveniência</Label>
                <Switch checked={form.has_convenience} onCheckedChange={(v) => setForm({ ...form, has_convenience: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label className="text-sm">Pousada</Label>
                <Switch checked={form.has_lodging} onCheckedChange={(v) => setForm({ ...form, has_lodging: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label className="text-sm">Restaurante</Label>
                <Switch checked={form.has_restaurant} onCheckedChange={(v) => setForm({ ...form, has_restaurant: v })} />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Endereço</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Observações para campanhas</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="md:col-span-2">
            <MediaUploader
              label="Fotos da unidade / cidade"
              accept="image/*"
              kind="image"
              folder="banco-clientes/unidades"
              value={form.photos}
              onChange={(photos) => setForm({ ...form, photos })}
            />
          </div>
          <div className="md:col-span-2">
            <MediaUploader
              label="Vídeos da unidade / cidade"
              accept="video/*"
              kind="video"
              folder="banco-clientes/unidades"
              value={form.videos}
              onChange={(videos) => setForm({ ...form, videos })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.unit_name.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
