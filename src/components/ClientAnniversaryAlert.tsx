import { useEffect, useMemo, useState } from 'react';
import { Cake, Building2, PartyPopper } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** Quantos dias de antecedência o aviso deve considerar. */
const ALERT_WINDOW_DAYS = 7;
const STORAGE_PREFIX = 'pulse:anniversary-alert';

type AnniversaryKind = 'empresa' | 'pessoa';

interface AnniversaryItem {
  id: string;
  kind: AnniversaryKind;
  clientName: string;
  personName?: string;
  role?: string;
  color: string;
  date: Date;
  daysUntil: number;
  years: number | null;
}

/** Normaliza "YYYY-MM-DD" (ou ISO) para uma data local sem efeito de fuso. */
function parseBirthday(value?: string | null): Date | null {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

/** Próxima ocorrência da data comemorativa e quantos dias faltam. */
function nextOccurrence(birthday: Date, today: Date) {
  let next = new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate(), 12, 0, 0);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, birthday.getMonth(), birthday.getDate(), 12, 0, 0);
  }
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000);
  const years = birthday.getFullYear() > 1900 ? next.getFullYear() - birthday.getFullYear() : null;
  return { next, daysUntil, years };
}

function formatDay(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function describeDays(days: number) {
  if (days === 0) return 'É hoje!';
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}

/**
 * Aviso automático de aniversários de clientes e das empresas atendidas.
 * Aparece uma vez por dia para cada pessoa da equipe, com 7 dias de antecedência.
 */
export default function ClientAnniversaryAlert() {
  const { clients } = useApp();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const items = useMemo<AnniversaryItem[]>(() => {
    const today = startOfToday();
    const list: AnniversaryItem[] = [];

    for (const client of clients) {
      const status = (client as any).status;
      if (status && status !== 'ativo') continue;

      const companyDate = parseBirthday(client.companyBirthday);
      if (companyDate) {
        const { next, daysUntil, years } = nextOccurrence(companyDate, today);
        if (daysUntil <= ALERT_WINDOW_DAYS) {
          list.push({
            id: `${client.id}-empresa`,
            kind: 'empresa',
            clientName: client.companyName,
            color: client.color,
            date: next,
            daysUntil,
            years,
          });
        }
      }

      for (const [index, owner] of (client.owners || []).entries()) {
        const ownerDate = parseBirthday(owner?.birthday);
        if (!ownerDate || !owner?.name) continue;
        const { next, daysUntil, years } = nextOccurrence(ownerDate, today);
        if (daysUntil > ALERT_WINDOW_DAYS) continue;
        list.push({
          id: `${client.id}-owner-${index}`,
          kind: 'pessoa',
          clientName: client.companyName,
          personName: owner.name,
          role: owner.role || '',
          color: client.color,
          date: next,
          daysUntil,
          years,
        });
      }
    }

    return list.sort((a, b) => a.daysUntil - b.daysUntil);
  }, [clients]);

  useEffect(() => {
    if (!user || items.length === 0) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `${STORAGE_PREFIX}:${user.id}:${todayKey}`;
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {
      /* storage indisponível: exibe mesmo assim */
    }
    setOpen(true);
  }, [user, items.length]);

  const dismiss = () => {
    setOpen(false);
    if (!user) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:${user.id}:${todayKey}`, '1');
    } catch {
      /* ignora falha de storage */
    }
  };

  if (items.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper size={18} className="text-primary" />
            Aniversários chegando
          </DialogTitle>
          <DialogDescription>
            Datas dos próximos {ALERT_WINDOW_DAYS} dias. Combine com a equipe a arte, o vídeo ou a mensagem de parabéns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `hsl(${item.color} / 0.15)`, color: `hsl(${item.color})` }}
              >
                {item.kind === 'empresa' ? <Building2 size={16} /> : <Cake size={16} />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {item.kind === 'empresa' ? item.clientName : item.personName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.kind === 'empresa'
                    ? `Aniversário da empresa${item.years ? ` · ${item.years} anos` : ''}`
                    : `${item.role ? `${item.role} · ` : ''}${item.clientName}`}
                </p>
              </div>

              <div className="text-right shrink-0">
                <Badge variant={item.daysUntil === 0 ? 'default' : 'secondary'} className="mb-1">
                  {describeDays(item.daysUntil)}
                </Badge>
                <p className="text-[11px] text-muted-foreground">{formatDay(item.date)}</p>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={dismiss} className="w-full sm:w-auto">Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
