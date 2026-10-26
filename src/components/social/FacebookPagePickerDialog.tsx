import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Facebook, Instagram, Loader2 } from 'lucide-react';

export interface FacebookPageOption {
  id: string;
  name: string;
  instagram_username?: string | null;
  picture?: string | null;
}

interface FacebookPagePickerDialogProps {
  open: boolean;
  pages: FacebookPageOption[];
  clientName?: string;
  /** id da Página sendo gravada (mostra o carregando no botão) */
  savingPageId?: string | null;
  onSelect: (pageId: string) => void;
  onCancel: () => void;
}

/**
 * O login do Facebook devolveu várias Páginas: a pessoa escolhe a do cliente.
 * Só a escolhida (e o Instagram ligado a ela) fica conectada, então o robô
 * publica apenas nela.
 */
export default function FacebookPagePickerDialog({
  open, pages, clientName, savingPageId, onSelect, onCancel,
}: FacebookPagePickerDialogProps) {
  const saving = !!savingPageId;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Qual é a Página {clientName ? `de ${clientName}` : 'do cliente'}?</DialogTitle>
          <DialogDescription>
            Esse login administra {pages.length} Páginas. Escolha só a do cliente: as postagens automáticas saem apenas nela
            (e no Instagram ligado a ela).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              disabled={saving}
              onClick={() => onSelect(page.id)}
              className="w-full flex items-center gap-3 rounded-lg border p-3 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-60"
            >
              {page.picture ? (
                <img
                  src={page.picture}
                  alt={`Foto da Página ${page.name}`}
                  className="h-9 w-9 rounded-full object-cover shrink-0 border"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Facebook size={16} className="text-muted-foreground" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{page.name}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {page.instagram_username ? (
                    <span className="inline-flex items-center gap-1"><Instagram size={11} /> @{page.instagram_username.replace(/^@/, '')}</span>
                  ) : 'Sem Instagram ligado'}
                </span>
              </span>
              {savingPageId === page.id && <Loader2 size={16} className="animate-spin text-primary shrink-0" />}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
