import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Monitor, Music, Save, Eye, Radio, RefreshCw, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const VPS = import.meta.env.VITE_VPS_API_URL || 'https://agenciapulse.tech/api';

interface TvSetting {
  key: string;
  value: string;
  updated_at: string;
}

export default function TvPanelControl() {
  const [settings, setSettings] = useState<TvSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [radioUrl, setRadioUrl] = useState('');
  const [showRadio, setShowRadio] = useState(true);
  const [showSchedule, setShowSchedule] = useState(true);
  const [showPipeline, setShowPipeline] = useState(true);
  const [showBanners, setShowBanners] = useState(true);
  const [showTeam, setShowTeam] = useState(true);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${VPS}/data/tv_settings`);
      if (res.ok) {
        const data: TvSetting[] = await res.json();
        setSettings(data);

        // Populate form fields
        const get = (key: string) => data.find(s => s.key === key)?.value || '';
        setRadioUrl(get('youtube_playlist_url'));
        setShowRadio(get('show_radio') !== 'false');
        setShowSchedule(get('show_schedule') !== 'false');
        setShowPipeline(get('show_pipeline') !== 'false');
        setShowBanners(get('show_banners') !== 'false');
        setShowTeam(get('show_team') !== 'false');
      }
    } catch (err) {
      console.error('Error fetching TV settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const saveSetting = async (key: string, value: string) => {
    const existing = settings.find(s => s.key === key);
    const body = { value, updated_at: new Date().toISOString() };

    if (existing) {
      await fetch(`${VPS}/data/tv_settings?key=eq.${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch(`${VPS}/data/tv_settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, ...body }),
      });
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveSetting('youtube_playlist_url', radioUrl),
        saveSetting('show_radio', String(showRadio)),
        saveSetting('show_schedule', String(showSchedule)),
        saveSetting('show_pipeline', String(showPipeline)),
        saveSetting('show_banners', String(showBanners)),
        saveSetting('show_team', String(showTeam)),
      ]);
      toast.success('Configurações do painel TV salvas com sucesso!');
      fetchSettings();
    } catch (err) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const extractYoutubeId = (url: string) => {
    const match = url.match(/(?:list=|playlist\?list=)([a-zA-Z0-9_-]+)/);
    return match?.[1] || null;
  };

  const playlistId = extractYoutubeId(radioUrl);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Monitor size={24} className="text-primary" />
          Controle do Painel Operacional
        </h1>
        <p className="text-sm text-muted-foreground">Gerencie o que aparece no TV Dashboard e configure o Pulse Radio</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pulse Radio Control */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Music size={18} className="text-primary" />
              Pulse Radio
              {radioUrl && <Badge variant="secondary" className="text-[10px]">Ativo</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL da Playlist do YouTube</Label>
              <Input
                value={radioUrl}
                onChange={e => setRadioUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=..."
              />
              <p className="text-[11px] text-muted-foreground">
                Cole o link de uma playlist do YouTube. Ela será reproduzida automaticamente no painel da TV.
              </p>
            </div>

            {playlistId && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="p-2 bg-muted/30 flex items-center gap-2">
                  <Radio size={14} className="text-primary animate-pulse" />
                  <span className="text-xs font-medium">Pré-visualização</span>
                </div>
                <iframe
                  src={`https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=0`}
                  className="w-full h-40"
                  allow="encrypted-media"
                  allowFullScreen
                  style={{ border: 0 }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Visibility Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 size={18} className="text-primary" />
              Seções Visíveis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Pulse Radio</p>
                <p className="text-[11px] text-muted-foreground">Player de música no painel</p>
              </div>
              <Switch checked={showRadio} onCheckedChange={setShowRadio} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Agenda de Gravações</p>
                <p className="text-[11px] text-muted-foreground">Gravações do dia</p>
              </div>
              <Switch checked={showSchedule} onCheckedChange={setShowSchedule} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Pipeline de Pós-Produção</p>
                <p className="text-[11px] text-muted-foreground">Edição, Revisão e Design</p>
              </div>
              <Switch checked={showPipeline} onCheckedChange={setShowPipeline} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Banners Sazonais</p>
                <p className="text-[11px] text-muted-foreground">Alertas de datas comemorativas</p>
              </div>
              <Switch checked={showBanners} onCheckedChange={setShowBanners} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Equipe</p>
                <p className="text-[11px] text-muted-foreground">Status de presença da equipe</p>
              </div>
              <Switch checked={showTeam} onCheckedChange={setShowTeam} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save button */}
      <div className="flex gap-3">
        <Button onClick={handleSaveAll} disabled={saving} className="gap-2">
          <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
        <Button variant="outline" onClick={() => window.open('/tv', '_blank')} className="gap-2">
          <Eye size={16} /> Abrir Painel TV
        </Button>
        <Button variant="ghost" onClick={fetchSettings} className="gap-2">
          <RefreshCw size={16} /> Atualizar
        </Button>
      </div>
    </div>
  );
}
