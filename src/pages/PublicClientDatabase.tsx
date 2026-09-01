import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Database } from 'lucide-react';
import MediaLibrary, { type MediaOwner } from '@/components/clientdb/MediaLibrary';
import PublicContributionPanel, { type ContributionTarget } from '@/components/clientdb/PublicContributionPanel';

const VPS_API_BASE = 'https://agenciapulse.tech/api';

interface PublicPayload {
  client: { id: string; company_name: string; logo_url: string | null };
  professionals: Array<{ id: string; name: string; specialty: string | null; photos: string[] | null; videos: string[] | null }>;
  units: Array<{ id: string; unit_name: string; city_name: string | null; state: string | null; photos: string[] | null; videos: string[] | null }>;
}

/**
 * Visualização pública (sem login) do banco de dados de um cliente.
 * Acesso somente por token compartilhável gerado pela equipe.
 */
export default function PublicClientDatabase() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) return;
      setLoading(true);
      try {
        const response = await fetch(`${VPS_API_BASE}/public/client-database/${encodeURIComponent(token)}`);
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(payload?.error || 'Não foi possível carregar este banco de dados.');
        } else {
          setData(payload as PublicPayload);
        }
      } catch {
        if (!cancelled) setError('Falha de conexão ao carregar o banco de dados.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  const owners = useMemo<MediaOwner[]>(() => {
    if (!data) return [];
    return [
      ...data.professionals.map((pro) => ({
        id: pro.id,
        label: pro.name || 'Profissional',
        sublabel: pro.specialty,
        kind: 'professional' as const,
        photos: pro.photos,
        videos: pro.videos,
      })),
      ...data.units.map((unit) => ({
        id: unit.id,
        label: unit.unit_name || 'Unidade',
        sublabel: [unit.city_name, unit.state].filter(Boolean).join(' / '),
        kind: 'unit' as const,
        photos: unit.photos,
        videos: unit.videos,
      })),
    ];
  }, [data]);

  const contributionTargets = useMemo<ContributionTarget[]>(
    () => owners.map((owner) => ({ id: owner.id, label: owner.label, kind: owner.kind })),
    [owners],
  );

  useEffect(() => {
    document.title = data ? `Banco de Dados — ${data.client.company_name}` : 'Banco de Dados do Cliente';
  }, [data]);

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : error ? (
          <Card className="p-10 text-center">
            <Database className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <h1 className="font-display text-xl font-bold">Link indisponível</h1>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </Card>
        ) : data ? (
          <>
            <header className="flex items-center gap-4">
              {data.client.logo_url ? (
                <img src={data.client.logo_url} alt={data.client.company_name} className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Database className="h-6 w-6" />
                </div>
              )}
              <div>
                <h1 className="font-display text-2xl font-bold">Banco de Dados — {data.client.company_name}</h1>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{data.professionals.length} profissionais</Badge>
                  <Badge variant="outline">{data.units.length} unidades</Badge>
                </div>
              </div>
            </header>

            {token ? (
              <PublicContributionPanel
                token={token}
                apiBase={VPS_API_BASE}
                targets={contributionTargets}
                onContributed={() => setReloadKey((value) => value + 1)}
              />
            ) : null}

            <MediaLibrary owners={owners} />
          </>
        ) : null}
      </div>
    </main>
  );
}
