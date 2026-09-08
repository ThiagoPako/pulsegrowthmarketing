import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Film, Image as ImageIcon, Loader2, Search, RefreshCw } from 'lucide-react';
import type { ClientMediaAsset } from '@/services/socialPostsApi';

export interface MediaLibraryPickerProps {
  assets: ClientMediaAsset[];
  loading?: boolean;
  selectedUrls: string[];
  onToggle: (asset: ClientMediaAsset) => void;
  onRefresh?: () => void;
  className?: string;
}

type KindFilter = 'all' | 'image' | 'video';

/** Galeria visual das artes e vídeos já existentes no sistema para o cliente. */
export function MediaLibraryPicker({
  assets, loading, selectedUrls, onToggle, onRefresh, className,
}: MediaLibraryPickerProps) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assets.filter(a => {
      if (kind !== 'all' && a.kind !== kind) return false;
      if (!term) return true;
      return `${a.title} ${a.source} ${a.tag ?? ''}`.toLowerCase().includes(term);
    });
  }, [assets, search, kind]);

  const filters: { value: KindFilter; label: string }[] = [
    { value: 'all', label: 'Tudo' },
    { value: 'image', label: 'Artes' },
    { value: 'video', label: 'Vídeos' },
  ];

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, tipo ou origem"
            className="h-9 pl-8 text-xs"
          />
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {filters.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setKind(f.value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                kind === f.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {onRefresh && (
          <Button type="button" variant="ghost" size="icon" aria-label="Atualizar biblioteca" onClick={onRefresh}>
            <RefreshCw size={14} />
          </Button>
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Carregando artes e vídeos do cliente…
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          Nenhuma arte ou vídeo encontrado para este cliente.
        </p>
      ) : (
        <div className="grid max-h-[320px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
          {filtered.map(asset => {
            const selected = selectedUrls.includes(asset.url);
            const order = selectedUrls.indexOf(asset.url) + 1;
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onToggle(asset)}
                aria-pressed={selected}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-lg border bg-muted text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/50',
                )}
              >
                {asset.thumbnail ? (
                  <img src={asset.thumbnail} alt={asset.title} className="h-full w-full object-cover" loading="lazy" />
                ) : asset.kind === 'video' ? (
                  <video src={asset.url} className="h-full w-full object-cover" muted preload="metadata" />
                ) : (
                  <img src={asset.url} alt={asset.title} className="h-full w-full object-cover" loading="lazy" />
                )}

                <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-background/85 text-foreground">
                  {asset.kind === 'video' ? <Film size={11} /> : <ImageIcon size={11} />}
                </span>

                {selected && (
                  <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {order || <Check size={11} />}
                  </span>
                )}

                <span className="absolute inset-x-0 bottom-0 space-y-0.5 bg-gradient-to-t from-foreground/85 to-transparent p-1.5">
                  <span className="block truncate text-[10px] font-medium text-background">{asset.title}</span>
                  <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">{asset.source}</Badge>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MediaLibraryPicker;
