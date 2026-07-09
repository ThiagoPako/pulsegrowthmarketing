import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ArrowLeft, Search, Download, ExternalLink, Image as ImageIcon, FileText, Sparkles, Grid3x3, LayoutList, Clock, AlertTriangle } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { motion } from 'framer-motion';
import { downloadSingleArt } from '@/lib/designerDownload';
import { toast } from 'sonner';

interface ArtRow {
  id: string;
  title: string;
  format_type: string;
  attachment_url: string | null;
  mockup_url: string | null;
  editable_file_url: string | null;
  kanban_column: string;
  completed_at: string | null;
  created_at: string;
  priority: string;
}

interface ClientRow {
  id: string;
  company_name: string;
  color: string;
  logo_url: string | null;
  niche?: string | null;
  responsible_person?: string | null;
}

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed', story: 'Story', logomarca: 'Logo', midia_fisica: 'Mídia Física',
};

const COLUMN_LABELS: Record<string, string> = {
  nova_tarefa: 'Nova tarefa',
  executando: 'Executando',
  fila_baixa_prioridade: 'Fila baixa',
  em_analise: 'Em análise',
  enviar_cliente: 'Enviar cliente',
  ajustes: 'Ajustes',
  aprovado: 'Aprovada',
  postado: 'Postada',
};

const PENDING_COLUMNS = ['nova_tarefa', 'executando', 'fila_baixa_prioridade', 'em_analise', 'enviar_cliente', 'ajustes'];

type StatusKey = 'aprovado' | 'postado' | 'pendente' | 'mes' | 'all';

const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(url);

function isCurrentMonth(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function ClientArtPlaybook() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [arts, setArts] = useState<ArtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusKey>('aprovado');
  const [view, setView] = useState<'grid' | 'mosaic'>('mosaic');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const [{ data: c }, { data: a }] = await Promise.all([
        supabase.from('clients').select('id, company_name, color, logo_url, niche, responsible_person').eq('id', clientId).maybeSingle(),
        supabase.from('design_tasks').select('id, title, format_type, attachment_url, mockup_url, editable_file_url, kanban_column, completed_at, created_at, priority').eq('client_id', clientId).order('completed_at', { ascending: false }).order('created_at', { ascending: false }),
      ]);
      if (cancel) return;
      setClient((c as ClientRow) || null);
      setArts((a as ArtRow[]) || []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [clientId]);

  const matchesStatus = (a: ArtRow, s: StatusKey) => {
    if (s === 'all') return true;
    if (s === 'aprovado') return a.kanban_column === 'aprovado';
    if (s === 'postado') return a.kanban_column === 'postado';
    if (s === 'pendente') return PENDING_COLUMNS.includes(a.kanban_column);
    if (s === 'mes') return isCurrentMonth(a.completed_at || a.created_at);
    return true;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return arts.filter(a => {
      if (!matchesStatus(a, statusFilter)) return false;
      // Pendentes podem não ter anexo; nos demais status exigimos arquivo
      if (statusFilter !== 'pendente' && !(a.attachment_url || a.mockup_url)) return false;
      if (format !== 'all' && a.format_type !== format) return false;
      if (q && !a.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [arts, search, format, statusFilter]);

  const formatCounts = useMemo(() => {
    const src = arts.filter(a => matchesStatus(a, statusFilter));
    return src.reduce<Record<string, number>>((m, a) => { m[a.format_type] = (m[a.format_type] || 0) + 1; return m; }, {});
  }, [arts, statusFilter]);

  const counts = useMemo(() => ({
    aprovado: arts.filter(a => a.kanban_column === 'aprovado' && (a.attachment_url || a.mockup_url)).length,
    postado: arts.filter(a => a.kanban_column === 'postado' && (a.attachment_url || a.mockup_url)).length,
    pendente: arts.filter(a => PENDING_COLUMNS.includes(a.kanban_column)).length,
    mes: arts.filter(a => isCurrentMonth(a.completed_at || a.created_at) && (a.attachment_url || a.mockup_url)).length,
    total: arts.filter(a => a.attachment_url || a.mockup_url).length,
  }), [arts]);

  const backHref = searchParams.get('from') || '/dashboard';

  const handleDownloadAll = async () => {
    const items = filtered.map(a => ({ url: (a.attachment_url || a.mockup_url)!, title: a.title })).filter(i => i.url);
    if (!items.length) return toast.error('Nenhuma arte para baixar');
    toast.info(`Baixando ${items.length} arte${items.length > 1 ? 's' : ''}...`);
    for (const it of items) await downloadSingleArt(it.url, it.title);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Carregando portfólio...</div>;
  }

  if (!client) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>
        <Link to={backHref}><Button size="sm" variant="outline"><ArrowLeft size={14} className="mr-1" /> Voltar</Button></Link>
      </div>
    );
  }

  const brand = `hsl(${client.color})`;

  const statusOptions: { key: StatusKey; label: string; count: number }[] = [
    { key: 'aprovado', label: 'Aprovadas', count: counts.aprovado },
    { key: 'postado', label: 'Postadas', count: counts.postado },
    { key: 'pendente', label: 'Pendentes', count: counts.pendente },
    { key: 'mes', label: 'Mês atual', count: counts.mes },
    { key: 'all', label: 'Todas', count: counts.total },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 20% 30%, ${brand} 0%, transparent 55%), radial-gradient(circle at 80% 70%, ${brand} 0%, transparent 60%)` }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center justify-between mb-6">
            <Link to={backHref}>
              <Button size="sm" variant="ghost" className="gap-1"><ArrowLeft size={14} /> Voltar</Button>
            </Link>
            <Badge variant="outline" className="gap-1 text-[10px]"><Sparkles size={11} /> Book de artes</Badge>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <ClientLogo client={{ companyName: client.company_name, color: client.color, logoUrl: client.logo_url }} size="lg" />
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">{client.company_name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Portfólio de artes produzidas {client.niche ? `• ${client.niche}` : ''} {client.responsible_person ? `• ${client.responsible_person}` : ''}
              </p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Badge className="text-[11px]" style={{ background: brand, color: 'white' }}>✅ {counts.aprovado} aprovadas</Badge>
                <Badge variant="secondary" className="text-[11px]">📤 {counts.postado} postadas</Badge>
                <Badge variant="secondary" className="text-[11px]">⏳ {counts.pendente} pendentes</Badge>
                <Badge variant="secondary" className="text-[11px]">📅 {counts.mes} no mês</Badge>
                <Badge variant="outline" className="text-[11px]">🎨 {counts.total} totais</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sticky top-0 z-20 backdrop-blur bg-background/85 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar arte..." className="h-9 pl-9 text-xs" />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <FilterChip active={format === 'all'} onClick={() => setFormat('all')}>Todos</FilterChip>
            {Object.keys(formatCounts).map(k => (
              <FilterChip key={k} active={format === k} onClick={() => setFormat(k)}>{FORMAT_LABELS[k] || k}</FilterChip>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-0.5 border border-border rounded-full p-0.5">
              {statusOptions.map(o => (
                <button
                  key={o.key}
                  onClick={() => setStatusFilter(o.key)}
                  className={`text-[11px] px-3 h-7 rounded-full transition-colors flex items-center gap-1 ${statusFilter===o.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {o.label}
                  <span className={`text-[9px] px-1 rounded ${statusFilter===o.key ? 'bg-primary-foreground/20' : 'bg-muted'}`}>{o.count}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 border border-border rounded-full p-0.5">
              <button onClick={() => setView('mosaic')} className={`h-7 w-7 flex items-center justify-center rounded-full ${view === 'mosaic' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><LayoutList size={13} /></button>
              <button onClick={() => setView('grid')} className={`h-7 w-7 flex items-center justify-center rounded-full ${view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Grid3x3 size={13} /></button>
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={handleDownloadAll} disabled={!filtered.some(a => a.attachment_url || a.mockup_url)}>
              <Download size={13} /> Baixar filtradas
            </Button>
          </div>
        </div>
      </div>

      {/* Gallery */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <ImageIcon size={40} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma arte encontrada com esses filtros.</p>
          </div>
        ) : statusFilter === 'pendente' ? (
          <PendingList arts={filtered} brand={brand} />
        ) : view === 'mosaic' ? (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">
            {filtered.map((a, i) => {
              const url = (a.attachment_url || a.mockup_url) as string;
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.4) }}
                  className="break-inside-avoid mb-3 group relative rounded-xl overflow-hidden border border-border bg-muted/30"
                >
                  {isImage(url) ? (
                    <button onClick={() => setPreview(url)} className="block w-full">
                      <img src={url} alt={a.title} loading="lazy" className="w-full h-auto group-hover:scale-[1.02] transition-transform duration-300" />
                    </button>
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center h-32">
                      <FileText size={28} className="text-muted-foreground/60" />
                    </a>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[11px] text-white font-medium truncate">{a.title}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{FORMAT_LABELS[a.format_type] || a.format_type}</Badge>
                      <span className="text-[9px] text-white/70 ml-auto">{new Date(a.completed_at || a.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((a, i) => {
              const url = (a.attachment_url || a.mockup_url) as string;
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.4) }}
                  className="group relative aspect-square rounded-xl overflow-hidden border border-border bg-muted/30"
                >
                  {isImage(url) ? (
                    <button onClick={() => setPreview(url)} className="w-full h-full">
                      <img src={url} alt={a.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </button>
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" className="w-full h-full flex items-center justify-center">
                      <FileText size={28} className="text-muted-foreground/60" />
                    </a>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[11px] text-white font-medium truncate">{a.title}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{FORMAT_LABELS[a.format_type] || a.format_type}</Badge>
                      <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="ml-auto text-white/70 hover:text-white">
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-5xl p-2 bg-black/95 border-none">
          {preview && <img src={preview} alt="preview" className="w-full max-h-[85vh] object-contain rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendingList({ arts, brand }: { arts: ArtRow[]; brand: string }) {
  const grouped = useMemo(() => {
    const map: Record<string, ArtRow[]> = {};
    arts.forEach(a => {
      const k = a.kanban_column;
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return map;
  }, [arts]);

  const order = ['executando', 'em_analise', 'enviar_cliente', 'ajustes', 'nova_tarefa', 'fila_baixa_prioridade'];

  return (
    <div className="space-y-6">
      {order.filter(k => grouped[k]?.length).map(k => (
        <div key={k}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full" style={{ background: brand }} />
            <h3 className="text-sm font-semibold">{COLUMN_LABELS[k] || k}</h3>
            <Badge variant="outline" className="text-[10px]">{grouped[k].length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[k].map(a => {
              const created = new Date(a.created_at);
              const ageDays = Math.floor((Date.now() - created.getTime()) / (24 * 3600 * 1000));
              const overdue = ageDays >= 3;
              const hasArt = !!(a.attachment_url || a.mockup_url);
              return (
                <div key={a.id} className="border border-border rounded-xl p-3 bg-card hover:border-primary/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {hasArt && isImage(a.attachment_url || a.mockup_url!) ? (
                        <img src={(a.attachment_url || a.mockup_url)!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={20} className="text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{a.title}</p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{FORMAT_LABELS[a.format_type] || a.format_type}</Badge>
                        {a.priority && a.priority !== 'media' && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5">{a.priority}</Badge>
                        )}
                      </div>
                      <div className={`flex items-center gap-1 mt-2 text-[10px] ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {overdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
                        {ageDays === 0 ? 'hoje' : `há ${ageDays}d`} · SLA 3d
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-3 h-8 rounded-full border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent border-border text-muted-foreground hover:border-primary/50'}`}
    >
      {children}
    </button>
  );
}
