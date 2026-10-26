import type { ReactNode } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Confirmação dos Kanbans para o que não dá para desfazer pela tela: mandar ao cliente (portal +
 * WhatsApp), liberar o card, voltar da revisão. Guarde a ação em estado e passe-a aqui.
 */
export interface ConfirmAction {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Pinta o botão de vermelho (ação que tira algo de alguém ou apaga). */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface Props {
  action: ConfirmAction | null;
  onClose: () => void;
}

export default function ConfirmActionDialog({ action, onClose }: Props) {
  return (
    <AlertDialog open={!!action} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{action?.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-1">{action?.description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={action?.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            onClick={() => {
              const current = action;
              onClose();
              if (current) void current.onConfirm();
            }}
          >
            {action?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
