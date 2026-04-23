import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Monitor, Music, Eye, Radio, RefreshCw, Play, Pause, SkipForward,
  Volume2, VolumeX, Megaphone, Send, Sparkles, Calendar, Film, Users, Image as ImageIcon, MessageSquare
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  fetchTvSettings, savePlaylistAndBroadcast, saveVisibility,
  sendTvCommand, broadcastAlert, VISIBILITY_KEYS, VisibilityKey
} from '@/lib/tvRemote';

const PULSE_ORANGE = 'hsl(16, 82%, 51%)';

const VISIBILITY_CONFIG: Record<VisibilityKey, { label: string; description: string; icon: any; color: string }> = {
  show_radio:    { label: 'Pulse Radio',     description: 'Player de música no painel',    icon: Music,       color: '#f97316' },
  show_schedule: { label: 'Gravações do Dia', description: 'Agenda de captações',           icon: Calendar,    color: '#22c55e' },
  show_pipeline: { label: 'Pós-Produção',     description: 'Designer + Edição + Revisão',   icon: Film,        color: '#8b5cf6' },
  show_banners:  { label: 'Banners Sazonais', description: 'Datas comemorativas + alertas', icon: Sparkles,    color: '#ec4899' },
  show_team:     { label: 'Equipe',           description: 'Status online/offline',          icon: Users,       color: '#3b82f6' },
  show_posts:    { label: 'Posts do Dia',     description: 'Conteúdos agendados',            icon: ImageIcon,   color: '#06b6d4' },
};

export default function TvPanelControl() {
  const [loading, setLoading] = useState(true);
  const [radioUrl, setRadioUrl] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [visibility, setVisibility] = useState<Record<VisibilityKey, boolean>>({
    show_radio: true, show_schedule: true, show_pipeline: true,
    show_banners: true, show_team: true, show_posts: true,
  });
  const [alertMessage, setAlertMessage] = useState('');
  const [alertTone, setAlertTone] = useState<'info' | 'success' | 'warning'>('info');
  const [alertDuration, setAlertDuration] = useState(15);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const settings = await fetchTvSettings();
    if (settings.youtube_playlist_url) {
      setRadioUrl(settings.youtube_playlist_url);
      setDraftUrl(settings.youtube_playlist_url);
    }
    setVisibility(prev => {
      const next = { ...prev };
      for (const k of VISIBILITY_KEYS) {
        if (settings[k] !== undefined) next[k] = settings[k] !== 'false';
      }
      return next;
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const wrap = async (key: string, fn: () => Promise<any>, msg: string) => {
    setBusy(key);
    try { await fn(); toast.success(msg); }
    catch { toast.error('Falha ao executar comando'); }
    finally { setBusy(null); }
  };

  const handleSavePlaylist = () =>
    wrap('playlist', async () => { await savePlaylistAndBroadcast(draftUrl); setRadioUrl(draftUrl); }, 'Playlist atualizada em todas as TVs!');

  const handleVisibility = (key: VisibilityKey, value: boolean) => {
    setVisibility(prev => ({ ...prev, [key]: value }));
    wrap(key, () => saveVisibility(key, value), `${VISIBILITY_CONFIG[key].label}: ${value ? 'visível' : 'oculto'}`);
  };

  const handleAlert = () => {
    if (!alertMessage.trim()) { toast.error('Digite uma mensagem'); return; }
    wrap('alert', () => broadcastAlert(alertMessage.trim(), alertDuration * 1000, alertTone), 'Mensagem enviada para todas as TVs!');
    setAlertMessage('');
  };

  const extractYoutubeId = (url: string) => url.match(/(?:list=|playlist\?list=)([a-zA-Z0-9_-]+)/)?.[1] || null;
  const playlistId = extractYoutubeId(radioUrl);

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER */}
      <div className="relative overflow-hidden rounded-2xl border border-orange-500/20 p-6"
        style={{ background: `linear-gradient(135deg, ${PULSE_ORANGE}18, transparent 60%)`, boxShadow: `0 0 40px ${PULSE_ORANGE}15` }}>
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{ background: `radial-gradient(circle at 80% 20%, ${PULSE_ORANGE}30, transparent 50%)` }} />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${PULSE_ORANGE}, hsl(16, 82%, 38%))`, boxShadow: `0 4px 20px ${PULSE_ORANGE}50` }}>
                <Monitor size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-black tracking-tight">Controle Remoto da TV</h1>
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground font-semibold mt-0.5">Painel Operacional · Comando ao Vivo</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Comande tudo que aparece nos televisores em tempo real. Mídia, visibilidade e mensagens sincronizam em até 3 segundos em todas as TVs abertas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> AO VIVO
            </Badge>
            <Button variant="outline" size="sm" onClick={() => window.open('/tv', '_blank')} className="gap-2">
              <Eye size={14} /> Abrir Painel TV
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchAll} className="gap-2" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* MEDIA CONTROL */}
        <Card className="lg:col-span-2 border-orange-500/15" style={{ background: `linear-gradient(135deg, ${PULSE_ORANGE}06, transparent 70%)` }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${PULSE_ORANGE}20` }}>
                <Music size={14} style={{ color: PULSE_ORANGE }} />
              </div>
              Pulse Radio · Controle de Mídia
              {radioUrl && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" />Ativo
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Remote buttons */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: 'play', icon: Play, label: 'Play', color: '#22c55e' },
                { id: 'pause', icon: Pause, label: 'Pause', color: '#f59e0b' },
                { id: 'next', icon: SkipForward, label: 'Próx.', color: PULSE_ORANGE },
                { id: 'unmute', icon: Volume2, label: 'Som', color: '#3b82f6' },
                { id: 'mute', icon: VolumeX, label: 'Mudo', color: '#6b7280' },
              ].map(b => {
                const Icon = b.icon;
                return (
                  <button key={b.id}
                    onClick={() => wrap(b.id, () => sendTvCommand(b.id as any), `Comando "${b.label}" enviado`)}
                    disabled={!radioUrl || busy === b.id}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                    style={{ borderColor: `${b.color}30`, background: `linear-gradient(135deg, ${b.color}12, transparent 80%)`, boxShadow: `0 0 20px ${b.color}10` }}>
                    <Icon size={20} style={{ color: b.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: b.color }}>{b.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Playlist input */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Trocar Playlist (YouTube)</label>
              <div className="flex gap-2">
                <Input value={draftUrl} onChange={e => setDraftUrl(e.target.value)}
                  placeholder="https://www.youtube.com/playlist?list=..." className="flex-1" />
                <Button onClick={handleSavePlaylist} disabled={!draftUrl || busy === 'playlist'} className="gap-2 bg-orange-600 hover:bg-orange-700 text-white">
                  <Send size={14} /> Trocar agora
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">A nova playlist começa a tocar automaticamente em todas as TVs em até 3s.</p>
            </div>

            {/* Preview */}
            {playlistId && (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 flex items-center gap-2">
                  <Radio size={14} className="text-orange-400 animate-pulse" />
                  <span className="text-xs font-semibold">Pré-visualização do que está tocando</span>
                </div>
                <iframe
                  src={`https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=0`}
                  className="w-full h-44" allow="encrypted-media" allowFullScreen style={{ border: 0 }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ALERT BROADCAST */}
        <Card className="border-pink-500/15" style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.06), transparent 70%)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-pink-500/15">
                <Megaphone size={14} className="text-pink-400" />
              </div>
              Mensagem ao Vivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={alertMessage} onChange={e => setAlertMessage(e.target.value)}
              placeholder="Ex: Reunião geral às 15h na sala principal!" rows={3}
              className="resize-none" />
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'info', label: 'Info', color: PULSE_ORANGE },
                { id: 'success', label: 'Boa', color: '#22c55e' },
                { id: 'warning', label: 'Urgente', color: '#ef4444' },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setAlertTone(t.id)}
                  className="py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border"
                  style={{
                    borderColor: alertTone === t.id ? t.color : `${t.color}25`,
                    background: alertTone === t.id ? `${t.color}25` : 'transparent',
                    color: t.color,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Duração:</span>
              <Input type="number" min={5} max={120} value={alertDuration}
                onChange={e => setAlertDuration(Number(e.target.value) || 15)} className="w-20 h-8 text-xs" />
              <span className="text-[11px] text-muted-foreground">segundos</span>
            </div>
            <Button onClick={handleAlert} disabled={!alertMessage.trim() || busy === 'alert'}
              className="w-full gap-2 bg-pink-600 hover:bg-pink-700 text-white">
              <MessageSquare size={14} /> Disparar para todas as TVs
            </Button>
            <Button variant="outline" size="sm" onClick={() => wrap('clear', () => sendTvCommand('clear_alert'), 'Mensagem removida')}
              className="w-full gap-2">
              Limpar mensagem ativa
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* VISIBILITY GRID */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye size={16} style={{ color: PULSE_ORANGE }} />
            Seções Visíveis no Painel
            <Badge variant="outline" className="text-[10px] ml-2">Sincroniza ao vivo</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {VISIBILITY_KEYS.map(key => {
              const cfg = VISIBILITY_CONFIG[key];
              const Icon = cfg.icon;
              const on = visibility[key];
              return (
                <div key={key}
                  className="flex items-center gap-3 p-4 rounded-xl border transition-all"
                  style={{
                    borderColor: on ? `${cfg.color}40` : 'hsl(var(--border))',
                    background: on ? `linear-gradient(135deg, ${cfg.color}10, transparent 80%)` : 'transparent',
                  }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${cfg.color}${on ? '25' : '12'}`, color: cfg.color }}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{cfg.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{cfg.description}</p>
                  </div>
                  <Switch checked={on} onCheckedChange={v => handleVisibility(key, v)} disabled={busy === key} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
