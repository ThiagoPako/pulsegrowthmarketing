import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { COPY_MAIN_FIELDS, COPY_REQUIRED_FIELDS, DesignCopyBrief } from '@/lib/designBrief';

interface Props {
  value: DesignCopyBrief;
  onChange: (value: DesignCopyBrief) => void;
}

/**
 * Copy da arte escrita pela equipe, em campos: título, texto de apoio, CTA e as informações
 * obrigatórias (telefone, endereço, preço, data, @). O texto montado vai para copy_text.
 */
export default function DesignCopyFields({ value, onChange }: Props) {
  const hasRequired = COPY_REQUIRED_FIELDS.some((f) => value[f.key]);
  const [showRequired, setShowRequired] = useState(hasRequired);
  const set = (key: keyof DesignCopyBrief, v: string) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-2.5">
      {COPY_MAIN_FIELDS.map((f) => (
        <div key={f.key} className="space-y-1">
          <Label className="text-xs">{f.label}</Label>
          {f.multiline ? (
            <Textarea value={value[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} rows={2} className="text-sm" />
          ) : (
            <Input value={value[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className="text-sm" />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setShowRequired((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        {showRequired ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Informações obrigatórias na arte (telefone, endereço, preço, data, @)
      </button>
      {showRequired && (
        <div className="grid gap-2 sm:grid-cols-2 rounded-lg border border-dashed border-border p-2.5">
          {COPY_REQUIRED_FIELDS.map((f) => (
            <div key={f.key} className={`space-y-1 ${f.key === 'other' ? 'sm:col-span-2' : ''}`}>
              <Label className="text-[11px] text-muted-foreground">{f.label}</Label>
              <Input value={value[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className="h-8 text-xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
