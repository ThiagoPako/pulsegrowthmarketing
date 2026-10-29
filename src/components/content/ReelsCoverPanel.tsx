import { useRef, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { uploadFileToVps } from '@/services/vpsApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Download, ThumbsUp, MessageSquareWarning, Upload, Loader2, ImageIcon, Grid3x3 } from 'lucide-react';

// Capa do reels: o agente envia pela API (POST /api/agent/tasks/:id/cover) e a equipe
// aprova ou pede ajuste aqui. cover_status: pendente | aprovada | ajuste.
export interface ReelsCoverTask {
  id: string;
  title: string;
  client_id: string | null;
  cover_url?: string | null;
  cover_status?: string | null;
  cover_notes?: string | null;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Aguardando aprovação', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  aprovada: { label: 'Capa aprovada', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
  ajuste: { label: 'Ajuste pedido', className: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30' },
};

function coverFileName(task: ReelsCoverTask, url: string) {
  const ext = (url.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1] || 'png').toLowerCase();
  const slug = task.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `capa-${slug || task.id.slice(0, 8)}.${ext}`;
}

interface Props {
  task: ReelsCoverTask;
  currentUserId?: string | null;
  onRefresh: () => void;
}

export default function ReelsCoverPanel({ task, currentUserId, onRefresh }: Props) {
  const [askingAdjust, setAskingAdjust] = useState(false);
  const [adjustNote, setAdjustNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [profileView, setProfileView] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const status = task.cover_status ? STATUS_LABEL[task.cover_status] : null;

  const logHistory = (action: string, details?: string | null) =>
    supabase.from('task_history').insert({ task_id: task.id, user_id: currentUserId || null, action, details: details || null } as any);

  const download = async () => {
    if (!task.cover_url) return;
    try {
      const response = await fetch(task.cover_url);
      if (!response.ok) throw new Error(String(response.status));
      const blobUrl = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = coverFileName(task, task.cover_url);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      window.open(task.cover_url, '_blank', 'noopener');
    }
  };

  const review = async (next: 'aprovada' | 'ajuste') => {
    if (next === 'ajuste' && !adjustNote.trim()) {
      toast.error('Escreva o que precisa mudar na capa');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('content_tasks').update({
        cover_status: next,
        cover_notes: next === 'ajuste' ? adjustNote.trim() : null,
        cover_reviewed_by: currentUserId || null,
        cover_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any).eq('id', task.id);
      if (error) throw error;
      await logHistory(next === 'aprovada' ? 'Capa do reels aprovada' : 'Ajuste pedido na capa do reels', next === 'ajuste' ? adjustNote.trim() : null);
      toast.success(next === 'aprovada' ? 'Capa aprovada' : 'Ajuste da capa enviado para a edição');
      setAskingAdjust(false);
      setAdjustNote('');
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const uploadManual = async (file: File) => {
    setSaving(true);
    try {
      const url = await uploadFileToVps(file, { folder: `content/${task.client_id || 'avulso'}/${task.id}`, retries: 2 });
      const { error } = await supabase.from('content_tasks').update({
        cover_url: url,
        cover_status: 'pendente',
        cover_notes: null,
        cover_updated_at: new Date().toISOString(),
        cover_reviewed_by: null,
        cover_reviewed_at: null,
        updated_at: new Date().toISOString(),
      } as any).eq('id', task.id);
      if (error) throw error;
      await logHistory('Capa do reels enviada', url);
      toast.success('Capa enviada');
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon size={14} className="text-muted-foreground" />
        <span className="text-sm font-semibold">Capa do reels</span>
        {status && <Badge variant="outline" className={`ml-auto text-[11px] ${status.className}`}>{status.label}</Badge>}
      </div>

      {task.cover_url ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setProfileView((v) => !v)}
            title={profileView ? 'Ver a capa inteira (9:16)' : 'Ver como aparece na grade do perfil (3:4)'}
            className="shrink-0 w-28 rounded-lg overflow-hidden border border-border bg-black"
            style={{ aspectRatio: profileView ? '3 / 4' : '9 / 16' }}
          >
            <img src={task.cover_url} alt="Capa do reels" className="w-full h-full object-cover" />
          </button>
          <div className="flex-1 min-w-0 space-y-2">
            <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={download}>
              <Download size={14} /> Baixar capa
            </Button>
            <Button size="sm" variant="ghost" className="w-full justify-start gap-2 text-xs" onClick={() => setProfileView((v) => !v)}>
              <Grid3x3 size={13} /> {profileView ? 'Ver capa inteira' : 'Ver como no perfil'}
            </Button>
            {task.cover_status !== 'aprovada' && (
              <Button size="sm" className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={saving} onClick={() => review('aprovada')}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />} Aprovar capa
              </Button>
            )}
            <Button size="sm" variant="outline" className="w-full justify-start gap-2 border-red-500/40 text-red-700 dark:text-red-400" disabled={saving} onClick={() => setAskingAdjust((v) => !v)}>
              <MessageSquareWarning size={14} /> Solicitar ajuste
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">A capa ainda não foi enviada. A edição envia junto com o vídeo; se precisar, envie uma aqui.</p>
      )}

      {task.cover_status === 'ajuste' && task.cover_notes && !askingAdjust && (
        <p className="text-xs rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-2 text-red-800 dark:text-red-300 whitespace-pre-wrap">
          <strong>Ajuste pedido:</strong> {task.cover_notes}
        </p>
      )}

      {askingAdjust && (
        <div className="space-y-2">
          <Textarea
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            placeholder="O que mudar na capa? (foto, texto, cor, tamanho…)"
            className="min-h-[70px] text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={saving} onClick={() => review('ajuste')}>Enviar ajuste</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAskingAdjust(false); setAdjustNote(''); }}>Cancelar</Button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadManual(f); }}
      />
      <Button size="sm" variant="ghost" className="gap-2 text-xs h-7 px-2" disabled={saving} onClick={() => fileRef.current?.click()}>
        <Upload size={12} /> {task.cover_url ? 'Trocar capa' : 'Enviar capa'}
      </Button>
    </div>
  );
}
