import { useEffect, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Cake, Download, Loader2 } from 'lucide-react';
import type { ClientCollaborator } from '@/hooks/useClientDatabase';

interface Props {
  collaboratorId: string;
}

const asArray = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]) : []);

/** Mostra, dentro do card da designer, os dados do colaborador aniversariante. */
export default function CollaboratorInfoCard({ collaboratorId }: Props) {
  const [data, setData] = useState<ClientCollaborator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from('client_collaborators')
      .select('*')
      .eq('id', collaboratorId)
      .then(({ data: rows }: any) => {
        if (!active) return;
        const row = Array.isArray(rows) ? rows[0] : rows;
        setData(row ? { ...row, photos: asArray(row.photos), videos: asArray(row.videos) } : null);
        setLoading(false);
      });
    return () => { active = false; };
  }, [collaboratorId]);

  if (loading) {
    return (
      <Card className="flex items-center justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </Card>
    );
  }

  if (!data) return null;

  const birthday = data.birthday ? String(data.birthday).slice(0, 10).split('-').reverse().join('/') : null;

  return (
    <Card className="space-y-3 border-primary/40 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Cake className="h-4 w-4 text-primary" /> Dados do aniversariante
      </div>

      <div className="flex items-start gap-3">
        {data.photos?.[0] ? (
          <img src={data.photos[0]} alt={data.name} loading="lazy" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Cake className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">{data.name}</p>
          <p className="text-xs text-muted-foreground">
            {[data.job_role, data.department].filter(Boolean).join(' · ') || 'Sem cargo informado'}
          </p>
          <div className="flex flex-wrap gap-1">
            {birthday && <Badge variant="secondary">Aniversário: {birthday}</Badge>}
            {data.phone && <Badge variant="outline">{data.phone}</Badge>}
          </div>
        </div>
      </div>

      {data.notes && (
        <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{data.notes}</p>
      )}

      {(data.photos?.length || 0) > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase text-muted-foreground">Fotos disponíveis</p>
          <div className="flex flex-wrap gap-2">
            {data.photos!.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="group relative">
                <img src={url} alt={data.name} loading="lazy" className="h-16 w-16 rounded-md object-cover" />
                <span className="absolute inset-0 hidden items-center justify-center rounded-md bg-background/70 group-hover:flex">
                  <Download className="h-4 w-4" />
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {(data.videos?.length || 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.videos!.map((url, index) => (
            <Button key={url} size="sm" variant="outline" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">Vídeo {index + 1}</a>
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
