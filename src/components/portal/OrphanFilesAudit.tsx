import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HardDriveDownload, Loader2, Search, Trash2 } from 'lucide-react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { toast } from 'sonner';

/** Um arquivo em /uploads/ sem nenhuma referência no banco de dados. */
export interface OrphanFile {
  path: string;
  size: number;
  modifiedAt: string;
  folder: string;
  ext: string;
}

interface OrphanMonth {
  month: string;
  count: number;
  bytes: number;
}

interface AuditResponse {
  success?: boolean;
  error?: string;
  scanned?: number;
  skippedRecent?: number;
  protectedRefs?: number;
  totalFiles?: number;
  totalMb?: number;
  months?: OrphanMonth[];
  files?: OrphanFile[];
  truncated?: boolean;
}

const formatMb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

/**
 * Auditoria de arquivos órfãos na VPS: lista tudo que ocupa espaço sem
 * aparecer em nenhum módulo, com data e tamanho, e permite escolher
 * exatamente o que apagar. Nada é removido sem seleção + confirmação.
 */
export default function OrphanFilesAudit() {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [minAgeDays, setMinAgeDays] = useState('7');
  const [monthFilter, setMonthFilter] = useState('all');
  const [search, setSearch] = useState('');

  const files = audit?.files ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return files.filter((f) => {
      if (monthFilter !== 'all' && !f.modifiedAt.startsWith(monthFilter)) return false;
      if (term && !f.path.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [files, monthFilter, search]);

  const selectedBytes = useMemo(() => {
    const set = new Set(selected);
    return files.reduce((sum, f) => (set.has(f.path) ? sum + f.size : sum), 0);
  }, [files, selected]);

  const runAudit = async () => {
    setLoading(true);
    try {
      const days = Math.max(0, Number(minAgeDays) || 0);
      const res = await vpsAuthedFetch(`/portal-videos/orphan-audit?minAgeDays=${days}`);
      const data: AuditResponse = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha na auditoria');
      setAudit(data);
      setSelected([]);
      setMonthFilter('all');
      toast.success(`${data.totalFiles ?? 0} arquivo(s) sem uso — ${data.totalMb ?? 0} MB`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao auditar arquivos');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (p: string) =>
    setSelected((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const toggleAllVisible = () => {
    const visible = filtered.map((f) => f.path);
    const allSelected = visible.every((p) => selected.includes(p)) && visible.length > 0;
    setSelected((prev) =>
      allSelected ? prev.filter((p) => !visible.includes(p)) : [...new Set([...prev, ...visible])],
    );
  };

  const handleDelete = async () => {
    if (selected.length === 0) return;
    const ok = confirm(
      `Apagar definitivamente ${selected.length} arquivo(s) (${formatMb(selectedBytes)})?\n` +
        'Somente arquivos sem nenhum registro no sistema são removidos.',
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await vpsAuthedFetch('/portal-videos/delete-orphans', {
        method: 'POST',
        body: JSON.stringify({ paths: selected, minAgeDays: Math.max(0, Number(minAgeDays) || 0) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao apagar arquivos');
      const guarded = data.protectedSkipped ? ` ${data.protectedSkipped} protegido(s) foram mantidos.` : '';
      toast.success(`${data.deletedFiles} arquivo(s) removido(s) — ${data.freedMb} MB liberados.${guarded}`);
      await runAudit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao apagar arquivos');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border border-border rounded-xl bg-card">
      <div className="flex items-center gap-2 text-primary font-semibold">
        <HardDriveDownload size={18} />
        <h3>Auditoria de Arquivos da VPS</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        Lista arquivos que ocupam espaço no servidor mas não aparecem em nenhum módulo do sistema.
        Nada é apagado sem você selecionar e confirmar.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="orphan-age" className="text-xs font-medium">Ignorar arquivos com menos de (dias)</Label>
          <Input
            id="orphan-age"
            type="number"
            min={0}
            value={minAgeDays}
            onChange={(e) => setMinAgeDays(e.target.value)}
            className="w-full sm:w-48"
          />
        </div>
        <Button onClick={runAudit} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
          {loading ? 'Auditando...' : 'Auditar arquivos'}
        </Button>
      </div>

      {audit && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Sem uso</p>
              <p className="font-semibold">{audit.totalFiles ?? 0}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Espaço</p>
              <p className="font-semibold">{audit.totalMb ?? 0} MB</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Protegidos</p>
              <p className="font-semibold">{audit.protectedRefs ?? 0}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Recentes preservados</p>
              <p className="font-semibold">{audit.skippedRecent ?? 0}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Filtrar por mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {(audit.months ?? []).map((m) => (
                  <SelectItem key={m.month} value={m.month}>
                    {m.month} — {m.count} arq. ({formatMb(m.bytes)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar por nome ou pasta"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={toggleAllVisible} disabled={filtered.length === 0}>
              Selecionar visíveis
            </Button>
          </div>

          <div className="max-h-80 overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Nenhum arquivo nesse filtro.</p>
            ) : (
              filtered.map((f) => (
                <label
                  key={f.path}
                  className="flex items-center gap-3 p-2 text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox checked={selected.includes(f.path)} onCheckedChange={() => toggle(f.path)} />
                  <span className="flex-1 truncate" title={f.path}>{f.path}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{formatDate(f.modifiedAt)}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{formatMb(f.size)}</span>
                </label>
              ))
            )}
          </div>

          {audit.truncated && (
            <p className="text-[11px] text-muted-foreground">
              Mostrando os 3.000 arquivos mais recentes. Apague em lotes para ver os demais.
            </p>
          )}

          <Button
            variant="destructive"
            className="w-full gap-2"
            disabled={selected.length === 0 || deleting}
            onClick={handleDelete}
          >
            {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
            {deleting
              ? 'Apagando...'
              : `Apagar selecionados (${selected.length} · ${formatMb(selectedBytes)})`}
          </Button>
        </>
      )}
    </div>
  );
}
