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
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Início do Expediente</Label>
            <Input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Fim do Expediente</Label>
            <Input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
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
          <Label>Duração da Gravação (horas)</Label>
          <Input type="number" value={form.recordingDuration} disabled className="opacity-60" />
          <p className="text-xs text-muted-foreground">Valor fixo: 2 horas</p>
        </div>

        <Button onClick={handleSave} className="w-full">Salvar Configurações</Button>
      </div>
    </div>
  );
}
