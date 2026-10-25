import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface BulkBillingItem {
  clientId: string;
  clientName: string;
  count: number;
  total: number;
  hasWhatsapp: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: BulkBillingItem[];
  onConfirm: () => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Confirmação antes da cobrança em massa por WhatsApp: mostra quem vai receber
 * (uma mensagem por cliente, com o total) e quem fica de fora por não ter WhatsApp.
 */
export default function BulkBillingConfirmDialog({ open, onOpenChange, title, items, onConfirm }: Props) {
  const toSend = items.filter(i => i.hasWhatsapp);
  const withoutWhatsapp = items.filter(i => !i.hasWhatsapp);
  const total = toSend.reduce((s, i) => s + i.total, 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {toSend.length} cliente{toSend.length === 1 ? '' : 's'} vão receber a cobrança no WhatsApp agora • {fmt(total)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-md border divide-y text-sm">
          {toSend.map(i => (
            <div key={i.clientId} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate">{i.clientName}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {i.count > 1 ? `${i.count} cobranças • ` : ''}{fmt(i.total)}
              </span>
            </div>
          ))}
          {toSend.length === 0 && (
            <p className="px-3 py-2 text-muted-foreground">Nenhum cliente com WhatsApp cadastrado.</p>
          )}
        </div>
        {withoutWhatsapp.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Sem WhatsApp (não recebem): {withoutWhatsapp.map(i => i.clientName).join(', ')}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={toSend.length === 0}>
            Enviar {toSend.length} cobrança{toSend.length === 1 ? '' : 's'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
