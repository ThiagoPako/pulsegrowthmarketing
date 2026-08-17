import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Download, FileVideo, Image as ImageIcon, Search, Stethoscope, Building2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MediaOwner {
  id: string;
  /** Nome exibido na seção (profissional ou unidade). */
  label: string;
  /** Informação secundária: especialidade / cidade. */
  sublabel?: string | null;
  kind: 'professional' | 'unit';
  photos?: string[] | null;
  videos?: string[] | null;
}

export interface MediaAsset {
  url: string;
  type: 'image' | 'video';
  ownerId: string;
  ownerLabel: string;
  ownerKind: 'professional' | 'unit';
  ownerSublabel?: string | null;
  fileName: string;
}

type TypeFilter = 'all' | 'image' | 'video';
type SectionFilter = 'all' | 'professional' | 'unit';

const asArray = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]).filter(Boolean) : []);

function fileNameFromUrl(url: string) {
  try {
    const decoded = decodeURIComponent(new URL(url, window.location.origin).pathname);
    return decoded.split('/').pop() || 'arquivo';
  } catch {
    return url.split('/').pop() || 'arquivo';
  }
}

/** Achata profissionais e unidades numa lista única de arquivos. */
export function buildAssets(owners: MediaOwner[]): MediaAsset[] {
  return owners.flatMap((owner) => [
    ...asArray(owner.photos).map((url) => ({ url, type: 'image' as const })),
    ...asArray(owner.videos).map((url) => ({ url, type: 'video' as const })),
  ].map(({ url, type }) => ({
    url,
    type,
    ownerId: owner.id,
    ownerLabel: owner.label,
    ownerKind: owner.kind,
    ownerSublabel: owner.sublabel,
    fileName: fileNameFromUrl(url),
  })));
}

export interface MediaLibraryProps {
  owners: MediaOwner[];
  /** Oculta ações internas (usado na visualização pública). */
  className?: string;
}

/**
 * Playbook visual do banco de dados: agrupa os arquivos por profissional/unidade,
 * com filtros por tipo, seção e busca, além de preview e download individual.
 */
export default function MediaLibrary({ owners, className }: MediaLibraryProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [term, setTerm] = useState('');
  const [preview, setPreview] = useState<MediaAsset | null>(null);

  const assets = useMemo(() => buildAssets(owners), [owners]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return assets.filter((asset) => {
      if (typeFilter !== 'all' && asset.type !== typeFilter) return false;
      if (sectionFilter !== 'all' && asset.ownerKind !== sectionFilter) return false;
      if (!q) return true;
      return `${asset.ownerLabel} ${asset.ownerSublabel || ''} ${asset.fileName}`.toLowerCase().includes(q);
    });
  }, [assets, typeFilter, sectionFilter, term]);

  const groups = useMemo(() => {
    const map = new Map<string, { owner: MediaAsset; items: MediaAsset[] }>();
    filtered.forEach((asset) => {
      const current = map.get(asset.ownerId);
      if (current) current.items.push(asset);
      else map.set(asset.ownerId, { owner: asset, items: [asset] });
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.owner.ownerKind !== b.owner.ownerKind) return a.owner.ownerKind === 'professional' ? -1 : 1;
      return a.owner.ownerLabel.localeCompare(b.owner.ownerLabel);
    });
  }, [filtered]);

  const counts = useMemo(() => ({
    total: assets.length,
    images: assets.filter((a) => a.type === 'image').length,
    videos: assets.filter((a) => a.type === 'video').length,
  }), [assets]);

  const download = (asset: MediaAsset) => {
    const link = document.createElement('a');
    link.href = asset.url;
    link.download = asset.fileName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className={cn('space-y-4', className)}>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{counts.total} arquivos</Badge>
          <Badge variant="outline"><ImageIcon className="mr-1 h-3 w-3" />{counts.images} imagens</Badge>
          <Badge variant="outline"><FileVideo className="mr-1 h-3 w-3" />{counts.videos} vídeos</Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar por nome, cidade ou arquivo"
              aria-label="Buscar arquivos"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {([['all', 'Todos'], ['image', 'Imagens'], ['video', 'Vídeos']] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={typeFilter === value ? 'default' : 'outline'}
                onClick={() => setTypeFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {([['all', 'Tudo'], ['professional', 'Profissionais'], ['unit', 'Unidades']] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={sectionFilter === value ? 'default' : 'outline'}
                onClick={() => setSectionFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum arquivo encontrado com os filtros atuais.
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.owner.ownerId} className="space-y-3 p-4">
            <header className="flex items-center gap-2">
              {group.owner.ownerKind === 'professional' ? (
                <Stethoscope className="h-4 w-4 text-primary" />
              ) : (
                <Building2 className="h-4 w-4 text-primary" />
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{group.owner.ownerLabel}</p>
                {group.owner.ownerSublabel && (
                  <p className="truncate text-xs text-muted-foreground">{group.owner.ownerSublabel}</p>
                )}
              </div>
              <Badge variant="secondary" className="ml-auto">{group.items.length}</Badge>
            </header>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {group.items.map((asset) => (
                <figure key={asset.url} className="group overflow-hidden rounded-lg border border-border bg-muted">
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => setPreview(asset)}
                    aria-label={`Visualizar ${asset.fileName}`}
                  >
                    {asset.type === 'image' ? (
                      <img src={asset.url} alt={asset.fileName} loading="lazy" className="h-28 w-full object-cover" />
                    ) : (
                      <video src={asset.url} muted preload="metadata" className="h-28 w-full object-cover" />
                    )}
                  </button>
                  <figcaption className="flex items-center gap-1 p-2">
                    <span className="truncate text-[11px] text-muted-foreground" title={asset.fileName}>
                      {asset.fileName}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto h-7 w-7 shrink-0"
                      aria-label={`Baixar ${asset.fileName}`}
                      onClick={() => download(asset)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Card>
        ))
      )}

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          {preview && (
            <div className="space-y-3">
              {preview.type === 'image' ? (
                <img src={preview.url} alt={preview.fileName} className="max-h-[70vh] w-full rounded-lg object-contain" />
              ) : (
                <video src={preview.url} controls className="max-h-[70vh] w-full rounded-lg" />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{preview.ownerLabel}</p>
                <span className="truncate text-xs text-muted-foreground">{preview.fileName}</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => download(preview)}>
                    <Download className="mr-1.5 h-4 w-4" /> Baixar
                  </Button>
                  <a href={preview.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost">
                      <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
