import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { FolderSearch, Loader2, ExternalLink, EyeOff, Eye, Send, FileText, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Severino: entrada de vídeos pelo Drive (vps-api-server/agentDriveRoutes.mjs): varre a pasta do cliente, lista as
// pastas de vídeo sem card e cria os cards em Edição em lote, pelo tipo (story: todas viram 1 card).

type ContentType = 'reels' | 'criativo' | 'story';

interface DriveClient { id: string; company_name: string; city: string | null; drive_link: string }
interface Unit {
  id: string;
  name: string;
  path: string[];
  url: string;
  video_count: number;
  videos: { id: string; name: string; sub: string }[];
  modified: string | null;
  suggested_type: ContentType | null;
  covered: boolean;
  ignored: boolean;
  script: { id: string; title: string } | null;
}
interface ScanResult {
  client: { id: string; company_name: string; drive_link: string };
  scanned_at: string;
  folders_read: number;
  truncated: boolean;
  warning: string | null;
  units: Unit[];
  scripts: { id: string; title: string; content_format: string | null; created_at: string }[];
}
interface Job {
  task_id: string;
  title: string;
  content_type: string;
  status: 'pendente' | 'transcrevendo' | 'pronto' | 'sem_fala' | 'falhou' | 'sem_whisper';
  error: string | null;
  client_name: string | null;
  updated_at: string;
}

const TYPE_LABEL: Record<ContentType, string> = { reels: 'Reels', criativo: 'Criativo', story: 'Story' };
const JOB_LABEL: Record<Job['status'], string> = {
  pendente: 'na fila', transcrevendo: 'transcrevendo', pronto: 'roteiro pronto', sem_fala: 'sem fala nos vídeos',
  falhou: 'falhou', sem_whisper: 'sem Whisper no servidor',
};
const NO_SCRIPT = '__transcrever__';
const RECENT_DAYS = 60;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await vpsAuthedFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Falha na comunicação com o servidor');
  return body as T;
}

const ago = (value: string | null) => (value ? formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR }) : '—');

export function DriveIntakePanel() {
  const [clients, setClients] = useState<DriveClient[]>([]);
  const [clientId, setClientId] = useState('');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState<ContentType | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Record<string, ContentType>>({});
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [storyTitle, setStoryTitle] = useState('');
  const [onlyRecent, setOnlyRecent] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);
  const [showCovered, setShowCovered] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    api<{ clients: DriveClient[] }>('/drive-intake/clients')
      .then((body) => setClients(body.clients))
      .catch((error) => toast.error(error.message));
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const body = await api<{ jobs: Job[] }>('/drive-intake/jobs');
      setJobs(body.jobs);
    } catch {
      /* a lista de roteiros volta na próxima rodada */
    }
  }, []);
  useEffect(() => { void loadJobs(); }, [loadJobs]);
  const jobsRunning = jobs.some((j) => j.status === 'pendente' || j.status === 'transcrevendo');
  useEffect(() => {
    if (!jobsRunning) return;
    const timer = setInterval(loadJobs, 10000);
    return () => clearInterval(timer);
  }, [jobsRunning, loadJobs]);

  const runScan = async () => {
    if (!clientId) return;
    setScanning(true);
    setScan(null);
    setSelected(new Set());
    try {
      const body = await api<ScanResult>('/drive-intake/scan', { method: 'POST', body: JSON.stringify({ client_id: clientId }) });
      setScan(body);
      setTypes(Object.fromEntries(body.units.map((u) => [u.id, u.suggested_type || 'reels'])));
      setScripts(Object.fromEntries(body.units.map((u) => [u.id, u.script?.id || NO_SCRIPT])));
      setStoryTitle('');
      if (body.warning) toast.warning(body.warning);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  };

  const cutoff = Date.now() - RECENT_DAYS * 86400000;
  const visible = useMemo(() => (scan?.units || []).filter((u) => {
    if (u.covered && !showCovered) return false;
    if (u.ignored && !showIgnored) return false;
    if (onlyRecent && !u.covered && u.modified && new Date(u.modified).getTime() < cutoff) return false;
    return true;
  }), [scan, showCovered, showIgnored, onlyRecent, cutoff]);
  const groups = useMemo(() => {
    const map = new Map<string, Unit[]>();
    for (const u of visible) {
      const key = u.path.join(' / ') || 'Pasta do cliente';
      map.set(key, [...(map.get(key) || []), u]);
    }
    return [...map.entries()];
  }, [visible]);

  const newCount = (scan?.units || []).filter((u) => !u.covered && !u.ignored).length;
  const coveredCount = (scan?.units || []).filter((u) => u.covered).length;
  const picked = (type: ContentType) => visible.filter((u) => selected.has(u.id) && !u.covered && types[u.id] === type);

  const toggle = (id: string, on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const ignore = async (unit: Unit, value: boolean) => {
    if (!scan) return;
    try {
      await api('/drive-intake/ignore', { method: 'POST', body: JSON.stringify({ client_id: scan.client.id, folder_ids: [unit.id], ignore: value }) });
      setScan({ ...scan, units: scan.units.map((u) => (u.id === unit.id ? { ...u, ignored: value } : u)) });
      toggle(unit.id, false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const send = async (type: ContentType) => {
    if (!scan) return;
    const units = picked(type);
    if (!units.length) return;
    const storyNote = type === 'story' ? ` em 1 card de story${storyTitle.trim() ? ` ("${storyTitle.trim()}")` : ''}` : '';
    if (!window.confirm(`Criar ${type === 'story' ? 1 : units.length} card(s) de ${TYPE_LABEL[type]} em Edição${storyNote}?\n\n${units.map((u) => `• ${u.name}`).join('\n')}`)) return;
    setSending(type);
    try {
      const body = await api<{ created: { id: string; title: string; script_pending: boolean }[]; skipped: { name: string }[] }>(
        '/drive-intake/create',
        {
          method: 'POST',
          body: JSON.stringify({
            client_id: scan.client.id,
            content_type: type,
            title: type === 'story' ? storyTitle.trim() || undefined : undefined,
            folders: units.map((u) => ({ id: u.id, script_id: type === 'story' || scripts[u.id] === NO_SCRIPT ? null : scripts[u.id] })),
          }),
        },
      );
      const pending = body.created.filter((c) => c.script_pending).length;
      toast.success(
        `Severino criou ${body.created.length} card(s) em Edição${pending ? `; ${pending} roteiro(s) sendo montado(s) pela transcrição` : ''}`
        + (body.skipped.length ? `. Pulado(s) por já ter card: ${body.skipped.map((s) => s.name).join(', ')}` : ''),
      );
      const done = new Set(units.map((u) => u.id));
      setScan({ ...scan, units: scan.units.map((u) => (done.has(u.id) ? { ...u, covered: true } : u)) });
      setSelected((prev) => new Set([...prev].filter((id) => !done.has(id))));
      if (type === 'story') setStoryTitle('');
      void loadJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(null);
    }
  };

  const retry = async (job: Job) => {
    try {
      await api(`/drive-intake/jobs/${job.task_id}/retry`, { method: 'POST' });
      void loadJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const freeScripts = scan?.scripts || [];

  return (
    <div className="glass-card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <FolderSearch size={16} className="text-primary" />
        <h2 className="text-sm font-semibold">Severino — vídeos novos do Drive para edição</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Escolha o cliente: o Severino lê a pasta do Drive dele e mostra as pastas de vídeo que ainda não têm card.
        Marque, escolha o tipo e envie; story vira um card só (a edição separa os stories). Sem roteiro, o Severino
        monta um com a transcrição do que foi gravado e liga ao card.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={clientId} onValueChange={(v) => { setClientId(v); setScan(null); }}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={runScan} disabled={!clientId || scanning}>
          {scanning ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FolderSearch size={14} className="mr-1" />}
          {scanning ? 'Lendo o Drive…' : 'Varrer o Drive'}
        </Button>
        {scan && (
          <a href={scan.client.drive_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary underline">
            Abrir a pasta <ExternalLink size={11} />
          </a>
        )}
      </div>

      {scan && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>{scan.folders_read} pastas lidas · <strong className="text-foreground">{newCount} sem card</strong> · {coveredCount} com card</span>
            {scan.truncated && <span className="text-warning">Drive grande: a leitura parou em {scan.folders_read} pastas.</span>}
            <label className="flex items-center gap-1.5"><Switch checked={onlyRecent} onCheckedChange={setOnlyRecent} /> Só dos últimos {RECENT_DAYS} dias</label>
            <label className="flex items-center gap-1.5"><Switch checked={showCovered} onCheckedChange={setShowCovered} /> Mostrar as que já têm card</label>
            <label className="flex items-center gap-1.5"><Switch checked={showIgnored} onCheckedChange={setShowIgnored} /> Mostrar as ignoradas</label>
          </div>

          {groups.length === 0 ? (
            <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Nenhuma pasta de vídeo nova neste filtro.</p>
          ) : (
            <div className="space-y-3">
              {groups.map(([group, units]) => (
                <div key={group} className="rounded-lg border border-border">
                  <div className="border-b border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
                  <ul className="divide-y divide-border">
                    {units.map((u) => (
                      <li key={u.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${u.covered || u.ignored ? 'opacity-60' : ''}`}>
                        <Checkbox
                          checked={selected.has(u.id)}
                          disabled={u.covered || u.ignored}
                          onCheckedChange={(v) => toggle(u.id, v === true)}
                          aria-label={`Escolher ${u.name}`}
                        />
                        <a href={u.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline" title={u.videos.map((v) => v.name).join(', ')}>
                          {u.name}
                        </a>
                        <span className="text-xs text-muted-foreground">{u.video_count} vídeo(s) · {u.modified ? ago(u.modified) : 'sem data'}</span>
                        {u.covered ? (
                          <Badge variant="secondary" className="gap-1"><CheckCircle2 size={11} /> tem card</Badge>
                        ) : (
                          <>
                            <Select value={types[u.id]} onValueChange={(v) => setTypes((t) => ({ ...t, [u.id]: v as ContentType }))} disabled={u.ignored}>
                              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(Object.keys(TYPE_LABEL) as ContentType[]).map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {types[u.id] !== 'story' && (
                              <Select value={scripts[u.id]} onValueChange={(v) => setScripts((s) => ({ ...s, [u.id]: v }))} disabled={u.ignored}>
                                <SelectTrigger className="h-8 w-56 text-xs"><FileText size={12} className="mr-1 shrink-0" /><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NO_SCRIPT}>Sem roteiro: transcrever o gravado</SelectItem>
                                  {freeScripts.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                            <Button size="sm" variant="ghost" className="h-8 px-2" title={u.ignored ? 'Voltar para a lista' : 'Ignorar esta pasta'} onClick={() => ignore(u, !u.ignored)}>
                              {u.ignored ? <Eye size={14} /> : <EyeOff size={14} />}
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {(['reels', 'criativo'] as ContentType[]).map((type) => {
              const n = picked(type).length;
              return (
                <Button key={type} size="sm" onClick={() => send(type)} disabled={!n || !!sending}>
                  {sending === type ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Send size={14} className="mr-1" />}
                  Enviar {n || ''} {type === 'reels' ? 'reels' : n === 1 ? 'criativo' : 'criativos'} para edição
                </Button>
              );
            })}
            <div className="flex items-center gap-2">
              <Input
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                placeholder="Nome do pacote de stories (opcional)"
                className="h-9 w-64 text-xs"
              />
              <Button size="sm" onClick={() => send('story')} disabled={!picked('story').length || !!sending}>
                {sending === 'story' ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Send size={14} className="mr-1" />}
                Enviar {picked('story').length || ''} stories em 1 card
              </Button>
            </div>
          </div>
        </>
      )}

      {jobs.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText size={13} /> Roteiros que o Severino está montando
          </h3>
          <ul className="space-y-1 text-xs">
            {jobs.map((job) => (
              <li key={job.task_id} className="flex flex-wrap items-center gap-2">
                {job.status === 'pronto' ? <CheckCircle2 size={12} className="text-success" />
                  : job.status === 'pendente' || job.status === 'transcrevendo' ? <Loader2 size={12} className="animate-spin text-muted-foreground" />
                    : <AlertTriangle size={12} className="text-warning" />}
                <span className="font-medium">{job.title}</span>
                <span className="text-muted-foreground">· {job.client_name?.trim()} · {JOB_LABEL[job.status]}{job.error ? ` (${job.error})` : ''} · {ago(job.updated_at)}</span>
                {['falhou', 'sem_fala', 'sem_whisper'].includes(job.status) && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => retry(job)}>
                    <RotateCcw size={11} className="mr-1" /> Tentar de novo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
