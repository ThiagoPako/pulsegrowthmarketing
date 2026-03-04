import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { DAY_LABELS } from '@/types';
import type { DayOfWeek } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

const ALL_DAYS: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

export default function CompanySettings() {
  const { settings, updateSettings } = useApp();
  const [form, setForm] = useState(settings);

  const toggleDay = (day: DayOfWeek) => {
    const days = form.workDays.includes(day) ? form.workDays.filter(d => d !== day) : [...form.workDays, day];
    setForm({ ...form, workDays: days });
  };

  const handleSave = () => {
    updateSettings(form);
    toast.success('Configurações salvas');
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-display font-bold">Configurações</h1>

      <div className="glass-card p-6 space-y-5">
        {/* Turno A */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-primary">Turno A (Manhã)</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Início</Label>
              <Input type="time" value={form.shiftAStart} onChange={e => setForm({ ...form, shiftAStart: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Fim</Label>
              <Input type="time" value={form.shiftAEnd} onChange={e => setForm({ ...form, shiftAEnd: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Turno B */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-primary">Turno B (Tarde)</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Início</Label>
              <Input type="time" value={form.shiftBStart} onChange={e => setForm({ ...form, shiftBStart: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Fim</Label>
              <Input type="time" value={form.shiftBEnd} onChange={e => setForm({ ...form, shiftBEnd: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Dias de Funcionamento</Label>
          <div className="grid grid-cols-2 gap-2">
            {ALL_DAYS.map(day => (
              <label key={day} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.workDays.includes(day)} onCheckedChange={() => toggleDay(day)} />
                <span className="text-sm">{DAY_LABELS[day]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Duração da Gravação (minutos)</Label>
          <Input
            type="number"
            min={30}
            max={480}
            step={15}
            value={form.recordingDuration}
            onChange={e => setForm({ ...form, recordingDuration: Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">Duração padrão de cada sessão de gravação</p>
        </div>

        <Button onClick={handleSave} className="w-full">Salvar Configurações</Button>
      </div>
    </div>
  );
}
