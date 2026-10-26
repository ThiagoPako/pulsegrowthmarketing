import { useState } from 'react';
import { Check, ChevronsUpDown, Facebook, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import ClientLogo from '@/components/ClientLogo';
import { cn } from '@/lib/utils';
import type { SchedulingClient } from '@/lib/postingSchedule';
import { clientLogoProps } from './schedulingStyles';

export function AccountIcons({ accounts, className }: { accounts: SchedulingClient['accounts']; className?: string }) {
  if (!accounts.instagram && !accounts.facebook) return null;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-muted-foreground', className)}>
      {accounts.instagram > 0 && <Instagram size={12} aria-label="Instagram conectado" />}
      {accounts.facebook > 0 && <Facebook size={12} aria-label="Facebook conectado" />}
    </span>
  );
}

interface Props {
  clients: SchedulingClient[];
  value: string | null;
  onChange: (clientId: string) => void;
}

/** Seletor de cliente com busca, logo e pendências. */
export default function SchedulingClientPicker({ clients, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = clients.find((c) => c.id === value) || null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-11 w-full justify-between gap-2 px-2.5 sm:w-[300px]">
          {current ? (
            <span className="flex min-w-0 items-center gap-2">
              <ClientLogo client={clientLogoProps(current)} size="sm" />
              <span className="truncate font-semibold">{current.company_name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Cliente</span>
          )}
          <ChevronsUpDown size={14} className="shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar cliente" />
          <CommandList className="max-h-[360px]">
            <CommandEmpty>Nenhum cliente</CommandEmpty>
            <CommandGroup>
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.company_name} ${c.id}`}
                  onSelect={() => { onChange(c.id); setOpen(false); }}
                  className="gap-2"
                >
                  <ClientLogo client={clientLogoProps(c)} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{c.company_name}</span>
                  <AccountIcons accounts={c.accounts} />
                  {c.pending > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold tabular-nums text-amber-700 dark:text-amber-300">{c.pending}</span>
                  )}
                  <Check size={14} className={cn('shrink-0', value === c.id ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
