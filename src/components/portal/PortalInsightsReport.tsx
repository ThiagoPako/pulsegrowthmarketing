import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileDown, Eye, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportReportPDF, type KPI } from '@/lib/pdfExport';
import type { ClientInsights } from '@/services/socialPostsApi';

export interface ReportMetricOption {
  id: string;
  label: string;
  value: number | null | undefined;
}

interface PortalInsightsReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  accountName?: string | null;
  period: { since: string; until: string };
  metrics: ReportMetricOption[];
  data: ClientInsights;
}

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const nf = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR'));

/** Permite ao cliente escolher métricas, pré-visualizar e baixar o relatório em PDF. */
export function PortalInsightsReport({ open, onOpenChange, clientName, accountName, period, metrics, data }: PortalInsightsReportProps) {
  const [selected, setSelected] = useState<string[]>(() => metrics.slice(0, 8).map(m => m.id));
  const [includePosts, setIncludePosts] = useState(true);
  const [preview, setPreview] = useState(false);

  const chosen = useMemo(() => metrics.filter(m => selected.includes(m.id)), [metrics, selected]);

  const toggle = (id: string) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));

  const handleExport = () => {
    const kpis: KPI[] = chosen.map(m => ({ label: m.label, value: nf(m.value) }));
    const posts = [...data.posts]
      .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
      .slice(0, 25)
      .map(p => [
        p.timestamp ? new Date(p.timestamp).toLocaleDateString('pt-BR') : '—',
        p.media_type || '—',
        (p.caption || 'Sem legenda').replace(/\s+/g, ' '),
        nf(p.reach),
        nf(p.likes),
        nf(p.comments),
      ]);

    exportReportPDF({
      title: `Relatório de Instagram · ${clientName}`,
      subtitle: accountName ? `Conta @${accountName}` : undefined,
      period: { start: formatDate(period.since), end: formatDate(period.until) },
      kpis,
      tables: includePosts && posts.length
        ? [{ title: 'Publicações do período', headers: ['Data', 'Tipo', 'Legenda', 'Alcance', 'Curtidas', 'Coment.'], rows: posts }]
        : [],
      filename: `relatorio-instagram-${period.since}-a-${period.until}.pdf`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={value => { onOpenChange(value); if (!value) setPreview(false); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar relatório do Instagram</DialogTitle>
          <DialogDescription>
            {formatDate(period.since)} até {formatDate(period.until)} · escolha as informações que deseja incluir.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {metrics.map(metric => {
            const active = selected.includes(metric.id);
            return (
              <button
                key={metric.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(metric.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
                  active ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {active && <CheckCircle2 size={13} />} {metric.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(metrics.map(m => m.id))}>Selecionar todas</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>Limpar</Button>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={includePosts} onChange={e => setIncludePosts(e.target.checked)} className="accent-primary" />
            Incluir lista de publicações
          </label>
        </div>

        {preview && (
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-semibold">Relatório de Instagram · {clientName}</p>
            <p className="text-xs text-muted-foreground">
              {accountName ? `@${accountName} · ` : ''}{formatDate(period.since)} até {formatDate(period.until)}
            </p>
            {chosen.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Selecione ao menos uma métrica para visualizar.</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {chosen.map(metric => (
                  <div key={metric.id} className="rounded-md border bg-background p-3">
                    <p className="text-[11px] uppercase text-muted-foreground">{metric.label}</p>
                    <p className="text-lg font-bold">{nf(metric.value)}</p>
                  </div>
                ))}
              </div>
            )}
            {includePosts && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                O PDF incluirá até 25 publicações do período ({data.posts.length} encontradas).
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={() => setPreview(v => !v)}>
            <Eye size={15} /> {preview ? 'Ocultar prévia' : 'Visualizar'}
          </Button>
          <Button type="button" className="gap-2" disabled={chosen.length === 0} onClick={handleExport}>
            <FileDown size={15} /> Gerar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
