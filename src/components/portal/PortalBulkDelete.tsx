import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Loader2 } from 'lucide-react';
import { supabase, vpsAuthedFetch } from '@/lib/vpsDb';
import { toast } from 'sonner';

interface VideoMonth {
  season_year: number;
  season_month: number;
  video_count?: number;
}

interface VideoContentType {
  content_type: string;
  video_count?: number;
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  reel: 'Reels',
  reels: 'Reels',
  story: 'Stories',
  stories: 'Stories',
  video: 'Vídeos',
  feed: 'Feed',
  outros: 'Outros',
};

const typeLabel = (type: string) => CONTENT_TYPE_LABELS[type] ?? type;

export default function PortalBulkDelete({ clientId }: { clientId?: string }) {
  const [months, setMonths] = useState<VideoMonth[]>([]);
  const [contentTypes, setContentTypes] = useState<VideoContentType[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; company_name: string }>>([]);
  const [selectedClient, setSelectedClient] = useState(clientId || 'all');
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sweeping, setSweeping] = useState(false);


  const loadMonths = async () => {
    setLoading(true);
    try {
      const search = new URLSearchParams();
      if (selectedClient !== 'all') search.set('clientId', selectedClient);
      if (selectedTypes.length > 0) search.set('contentTypes', selectedTypes.join(','));
      const params = search.toString() ? `?${search.toString()}` : '';
      const res = await vpsAuthedFetch(`/portal-videos/months${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar os meses');
      setMonths(data.months || []);
      setContentTypes(data.contentTypes || []);
      setSelectedMonths([]);
    } catch (err) {
      console.error('Erro ao carregar meses:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar os meses com vídeos');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadMonths();
  }, [selectedClient, selectedTypes]);

  useEffect(() => {
    if (clientId) return;
    supabase
      .from('clients')
      .select('id, company_name')
      .order('company_name')
      .then(({ data }) => setClients((data || []) as Array<{ id: string; company_name: string }>));
  }, [clientId]);

  const handleDelete = async () => {
    if (selectedMonths.length === 0) {
      toast.error('Selecione ao menos um mês para deletar');
      return;
    }

    if (!confirm(`Tem certeza que deseja deletar os vídeos de ${selectedMonths.length} mês(es)? Esta ação é irreversível.`)) {
      return;
    }

    setDeleting(true);
    try {
      const response = await vpsAuthedFetch('/portal-videos/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({
          months: selectedMonths,
          clientId: selectedClient === 'all' ? null : selectedClient,
          allClients: selectedClient === 'all',
          contentTypes: selectedTypes,
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        const mb = data.freedBytes ? ` (${(data.freedBytes / 1048576).toFixed(1)} MB liberados)` : '';
        toast.success(`${data.deletedCount} vídeos deletados com sucesso!${mb}`);
        setSelectedMonths([]);
        loadMonths();
      } else {
        throw new Error(data.error);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao deletar vídeos: ' + message);
    } finally {
      setDeleting(false);
    }
  };

  /** Remove do disco arquivos que já não têm registro no banco. */
  const handleSweep = async () => {
    if (!confirm('Varrer e apagar arquivos órfãos do servidor (sem registro no banco)? Esta ação é irreversível.')) return;
    setSweeping(true);
    try {
      const res = await vpsAuthedFetch('/portal-videos/sweep-orphans', {
        method: 'POST',
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha na varredura');
      toast.success(`${data.deletedFiles} arquivo(s) órfão(s) removido(s) — ${data.freedMb} MB liberados`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro na varredura de órfãos');
    } finally {
      setSweeping(false);
    }
  };


  const toggleType = (t: string) => {
    setSelectedTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  const toggleMonth = (m: string) => {
    setSelectedMonths(prev => 
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  return (
    <div className="space-y-4 p-4 border border-border rounded-xl bg-card">
      <div className="flex items-center gap-2 text-primary font-semibold">
        <Trash2 size={18} />
        <h3>Limpeza de Vídeos do Portal</h3>
      </div>
      
      <p className="text-xs text-muted-foreground">
        Selecione os meses dos vídeos que deseja remover permanentemente do sistema para liberar espaço.
      </p>

      {!clientId && (
        <div className="space-y-2">
          <Label htmlFor="portal-video-client" className="text-xs font-medium">Cliente</Label>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger id="portal-video-client">
              <SelectValue placeholder="Selecione o cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map(client => (
                <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-medium">Tipo de conteúdo</Label>
        {contentTypes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum tipo disponível.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {contentTypes.map(t => (
              <div
                key={t.content_type}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id={`type-${t.content_type}`}
                  checked={selectedTypes.includes(t.content_type)}
                  onCheckedChange={() => toggleType(t.content_type)}
                />
                <Label htmlFor={`type-${t.content_type}`} className="text-xs cursor-pointer">
                  {typeLabel(t.content_type)}{t.video_count ? ` (${t.video_count})` : ''}
                </Label>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {selectedTypes.length === 0 ? 'Nenhum tipo marcado = todos os tipos serão excluídos.' : `Excluindo apenas: ${selectedTypes.map(typeLabel).join(', ')}`}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {months.map(m => {
            const val = `${m.season_year}-${m.season_month.toString().padStart(2, '0')}`;
            const count = Number(m.video_count || 0);
            const label = `${m.season_month.toString().padStart(2, '0')}/${m.season_year}${count ? ` (${count})` : ''}`;
            return (
              <div key={val} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <Checkbox 
                  id={`month-${val}`} 
                  checked={selectedMonths.includes(val)}
                  onCheckedChange={() => toggleMonth(val)}
                />
                <Label htmlFor={`month-${val}`} className="text-xs cursor-pointer">{label}</Label>
              </div>
            );
          })}
        </div>
      )}

      {months.length === 0 && !loading && (
        <p className="text-center py-4 text-xs text-muted-foreground">Nenhum vídeo encontrado para limpeza.</p>
      )}

      <Button 
        variant="destructive" 
        className="w-full gap-2" 
        disabled={selectedMonths.length === 0 || deleting}
        onClick={handleDelete}
      >
        {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
        {deleting ? 'Deletando...' : `Deletar Vídeos Selecionados (${selectedMonths.length})`}
      </Button>
    </div>
  );
}