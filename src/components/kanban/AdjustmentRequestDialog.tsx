import { useEffect, useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Pedido de ajuste: toda ida para Alteração passa por aqui (botão, seta ou arrastar). O texto é
 * obrigatório — é o que o editor, humano ou agente, vai corrigir (a API dos agentes também exige).
 * Responda `false` no onSubmit para manter o diálogo aberto (erro ao gravar).
 */
interface Props {
  open: boolean;
  title?: string;
  /** Título do conteúdo, mostrado para conferência. */
  taskTitle?: string | null;
  /** Texto inicial (ex.: o parecer do revisor IA). */
  initialNotes?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (notes: string, immediate: boolean) => Promise<boolean | void> | boolean | void;
}

export default function AdjustmentRequestDialog({ open, title = 'Solicitar Ajustes', taskTitle, initialNotes = '', onOpenChange, onSubmit }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [immediate, setImmediate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setNotes(initialNotes); setImmediate(false); setSaving(false); }
  }, [open, initialNotes]);

  const submit = async () => {
    if (!notes.trim() || saving) return;
    setSaving(true);
    try {
      const result = await onSubmit(notes.trim(), immediate);
      if (result !== false) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareWarning size={18} className="text-amber-500" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {taskTitle && (
            <p className="text-sm text-muted-foreground">
              Conteúdo: <span className="font-medium text-foreground">{taskTitle}</span>
            </p>
          )}
          <div>
            <Label className="text-xs">Descreva os ajustes necessários *</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Ex: 00:15 ajustar o corte, trocar a música de fundo..."
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Diga o tempo do vídeo (mm:ss) e o que mudar.
            </p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <input
              type="checkbox"
              checked={immediate}
              onChange={e => setImmediate(e.target.checked)}
              className="h-4 w-4 rounded border-destructive/40 text-destructive focus:ring-destructive"
              id="adjustment-immediate-check"
            />
            <label htmlFor="adjustment-immediate-check" className="text-sm cursor-pointer">
              <span className="font-semibold text-destructive">🔥 Alteração com urgência (prioridade total)</span>
            </label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={!notes.trim() || saving} className="bg-amber-500 hover:bg-amber-600 text-white">
            <MessageSquareWarning size={14} /> {saving ? 'Enviando…' : 'Enviar Ajustes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
