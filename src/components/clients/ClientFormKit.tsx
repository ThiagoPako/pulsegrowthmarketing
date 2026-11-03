import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FolderOpen, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Peças do cadastro do cliente (redesenho de 03/11/2026, pedido do usuário: "está feio e desordenado; preciso que fique
// mais fácil de achar as funções; o lugar dos links do Drive com animação mostrando os que têm link e os que não têm").

export type SectionState = 'ok' | 'pending' | 'neutral';

export interface SectionMeta { id: string; title: string; icon: LucideIcon; state: SectionState; hint?: string }

/** Seção do cadastro: cartão com ícone, título e descrição curta. O id serve para o menu lateral rolar até ela. */
export function FormSection({ id, icon: Icon, title, description, children, aside }: {
  id: string; icon: LucideIcon; title: string; description?: string; children: ReactNode; aside?: ReactNode;
}) {
  return (
    <section id={`cad-${id}`} data-section={id} className="scroll-mt-4 rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <header className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {aside}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Menu das seções: no computador fica ao lado; no celular vira uma faixa rolável em cima. */
export function SectionNav({ sections, active, onPick }: { sections: SectionMeta[]; active: string; onPick: (id: string) => void }) {
  const dot = (s: SectionState) => (s === 'ok'
    ? <CheckCircle2 size={13} className="shrink-0 text-emerald-500" aria-label="completa" />
    : s === 'pending' ? <span className="relative flex h-2.5 w-2.5 shrink-0" aria-label="falta preencher"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" /></span>
      : <span className="h-2.5 w-2.5 shrink-0" />);
  return (
    <nav aria-label="Seções do cadastro" className="flex gap-1.5 overflow-x-auto px-4 py-2 md:flex-col md:gap-0.5 md:overflow-visible md:px-3 md:py-4" style={{ scrollbarWidth: 'none' }}>
      {sections.map((s) => {
        const on = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            aria-current={on ? 'true' : undefined}
            title={s.hint}
            className={cn(
              'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors',
              on ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <s.icon size={15} className="shrink-0" />
            <span className="whitespace-nowrap md:flex-1">{s.title}</span>
            {dot(s.state)}
          </button>
        );
      })}
    </nav>
  );
}

const isDriveUrl = (v: string) => /^https:\/\/(drive|docs)\.google\.com\//i.test(v.trim());

/** Campo de link do Drive: verde e animado quando tem link, âmbar pulsando quando falta, vermelho se o link não é do Drive. */
export function DriveLinkField({ label, value, onChange, required = false, hint, anyLink = false }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; hint?: string;
  /** aceita qualquer link https (referências podem ser Pinterest, Behance…) */
  anyLink?: boolean;
}) {
  const v = (value || '').trim();
  const state: 'ok' | 'empty' | 'invalid' = !v ? 'empty' : (anyLink ? /^https?:\/\/\S+\.\S+/i.test(v) : isDriveUrl(v)) ? 'ok' : 'invalid';
  return (
    <div className={cn(
      'group relative overflow-hidden rounded-xl border p-3 transition-colors',
      state === 'ok' && 'border-emerald-500/40 bg-emerald-500/[0.06]',
      state === 'empty' && 'border-dashed border-amber-500/50 bg-amber-500/[0.05]',
      state === 'invalid' && 'border-destructive/50 bg-destructive/[0.05]',
    )}>
      {/* brilho que passa no cartão com link: mostra que a pasta está ligada */}
      {state === 'ok' && <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-drive-shine bg-gradient-to-r from-transparent via-emerald-400/15 to-transparent motion-reduce:hidden" />}
      <div className="relative flex items-center gap-2.5">
        <span className={cn(
          'relative grid h-8 w-8 shrink-0 place-items-center rounded-lg',
          state === 'ok' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : state === 'empty' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-destructive/15 text-destructive',
        )}>
          <FolderOpen size={15} />
          {state === 'empty' && <span aria-hidden className="absolute inset-0 animate-ping rounded-lg bg-amber-400/20 motion-reduce:hidden" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[13px] font-medium">
            {label}{required && <span className="text-destructive">*</span>}
          </p>
          <p className={cn('text-[11px]', state === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : state === 'empty' ? 'text-amber-700 dark:text-amber-300' : 'text-destructive')}>
            {state === 'ok' ? 'Link conectado' : state === 'empty' ? (required ? 'Falta o link (obrigatório)' : 'Sem link') : (anyLink ? 'Coloque o link completo (https://…)' : 'Não parece um link do Google Drive')}
          </p>
        </div>
        {state === 'ok' ? (
          <a href={v} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-500">
            {anyLink ? 'Abrir' : 'Abrir pasta'} <ExternalLink size={11} />
          </a>
        ) : state === 'invalid' ? <AlertCircle size={16} className="shrink-0 text-destructive" /> : null}
      </div>
      <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." className="relative mt-2.5 h-9 bg-background/70 text-xs" aria-label={label} />
      {hint && <p className="relative mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Linha com chave: título, explicação e o controle à direita. */
export function ToggleRow({ title, description, children, tone = 'default' }: { title: ReactNode; description?: ReactNode; children: ReactNode; tone?: 'default' | 'primary' | 'amber' }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-xl border p-3',
      tone === 'primary' ? 'border-primary/30 bg-primary/5' : tone === 'amber' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/30')}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
