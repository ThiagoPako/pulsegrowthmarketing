import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Link2, Loader2, Search, Unlink, Save, Plus } from 'lucide-react';

/** Roteiro simplificado como vive na tabela `scripts` da VPS. */
export interface SlotScript {
  id: string;
  title: string;
  content: string | null;
  caption: string | null;
  video_type: string | null;
  content_format: string | null;
  priority: string | null;
  client_id: string | null;
  campaign_slot_id: string | null;
}

interface SlotScriptManagerProps {
  slotId: string;
  slotTitle: string;
  slotKind: 'video' | 'creative';
  clientId: string;
  campaignName: string;
  /** Chamado quando o vínculo muda, para recarregar a campanha. */
  onChanged: () => void;
}

const VIDEO_TYPES = [
  { value: 'vendas', label: 'Vendas' },
  { value: 'institucional', label: 'Institucional' },
  { value: 'educativo', label: 'Educativo' },
  { value: 'entretenimento', label: 'Entretenimento' },
];

const FORMATS = [
  { value: 'reels', label: 'Reels' },
  { value: 'story', label: 'Story' },
  { value: 'criativo', label: 'Criativo / Arte' },
  { value: 'carrossel', label: 'Carrossel' },
];

export default function SlotScriptManager({
  slotId, slotTitle, slotKind, clientId, campaignName, onChanged,
}: SlotScriptManagerProps) {
  const [loading, setLoading] = useState(true);
  const [script, setScript] = useState<SlotScript | null>(null);
  const [mode, setMode] = useState<'create' | 'attach'>('create');
  const [saving, setSaving] = useState(false);

  // formulário do roteiro (criação e edição usam o mesmo estado)
  const [title, setTitle] = useState(slotTitle || '');
  const [content, setContent] = useState('');
  const [caption, setCaption] = useState('');
  const [videoType, setVideoType] = useState('vendas');
  const [contentFormat, setContentFormat] = useState(slotKind === 'creative' ? 'criativo' : 'reels');

  // anexar roteiro existente
  const [candidates, setCandidates] = useState<SlotScript[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [search, setSearch] = useState('');

  const loadScript = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scripts')
        .select('id,title,content,caption,video_type,content_format,priority,client_id,campaign_slot_id')
        .eq('campaign_slot_id', slotId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const found = (data as SlotScript[] | null)?.[0] || null;
      setScript(found);
      if (found) {
        setTitle(found.title || '');
        setContent(found.content || '');
        setCaption(found.caption || '');
        setVideoType(found.video_type || 'vendas');
        setContentFormat(found.content_format || (slotKind === 'creative' ? 'criativo' : 'reels'));
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar roteiro do slot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadScript(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slotId]);

  const loadCandidates = async () => {
    if (!clientId) return;
    setLoadingCandidates(true);
    try {
      const { data, error } = await supabase
        .from('scripts')
        .select('id,title,content,caption,video_type,content_format,priority,client_id,campaign_slot_id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setCandidates(((data as SlotScript[]) || []).filter(s => s.campaign_slot_id !== slotId));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao buscar roteiros do cliente');
    } finally {
      setLoadingCandidates(false);
    }
  };

  useEffect(() => {
    if (mode === 'attach' && !script) loadCandidates();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [mode, clientId]);

  const filteredCandidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter(s =>
      (s.title || '').toLowerCase().includes(term) ||
      (s.content || '').toLowerCase().includes(term)
    );
  }, [candidates, search]);

  const markSlotLinked = async (scriptId: string | null) => {
    await supabase.from('campaign_slots').update({
      script_id: scriptId,
      ...(scriptId ? { status: 'roteiro_pronto' } : {}),
    } as any).eq('id', slotId);
  };

  const handleCreate = async () => {
    if (!title.trim()) { toast.error('Dê um título ao roteiro'); return; }
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const { error } = await supabase.from('scripts').insert({
        id,
        client_id: clientId || null,
        title: title.trim(),
        content,
        caption,
        video_type: videoType,
        content_format: contentFormat,
        priority: 'normal',
        recorded: false,
        is_endomarketing: false,
        direct_to_editing: false,
        campaign_slot_id: slotId,
        created_at: now,
        updated_at: now,
      } as any);
      if (error) throw error;
      await markSlotLinked(id);
      toast.success('Roteiro criado e vinculado à campanha');
      await loadScript();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar roteiro');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!script) return;
    if (!title.trim()) { toast.error('Dê um título ao roteiro'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('scripts').update({
        title: title.trim(),
        content,
        caption,
        video_type: videoType,
        content_format: contentFormat,
        updated_at: new Date().toISOString(),
      } as any).eq('id', script.id);
      if (error) throw error;
      toast.success('Roteiro atualizado');
      await loadScript();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar roteiro');
    } finally {
      setSaving(false);
    }
  };

  const handleAttach = async (existing: SlotScript) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('scripts').update({
        campaign_slot_id: slotId,
        updated_at: new Date().toISOString(),
      } as any).eq('id', existing.id);
      if (error) throw error;
      await markSlotLinked(existing.id);
      toast.success('Roteiro anexado ao card da campanha');
      setMode('create');
      await loadScript();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao anexar roteiro');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!script) return;
    setSaving(true);
    try {
      await supabase.from('scripts').update({ campaign_slot_id: null } as any).eq('id', script.id);
      await markSlotLinked(null);
      toast.success('Roteiro desvinculado (não foi apagado)');
      setScript(null);
      setContent('');
      setCaption('');
      setTitle(slotTitle || '');
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao desvincular');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando roteiro...
      </p>
    );
  }

  const editor = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-3">
          <Label>Título do roteiro</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Abertura da campanha" />
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={videoType} onValueChange={setVideoType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VIDEO_TYPES.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Formato</Label>
          <Select value={contentFormat} onValueChange={setContentFormat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Roteiro</Label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8}
          placeholder="Escreva as falas, cenas e CTA..." />
      </div>

      <div>
        <Label>Legenda</Label>
        <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
          placeholder="Legenda da publicação (opcional)" />
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {script ? (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge className="bg-primary/15 text-primary border-primary/30">
              🎯 Vinculado à campanha {campaignName}
            </Badge>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleUnlink} disabled={saving} className="gap-1.5">
                <Unlink className="h-3.5 w-3.5" /> Desvincular
              </Button>
              <Button size="sm" onClick={handleUpdate} disabled={saving} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> {saving ? 'Salvando...' : 'Salvar roteiro'}
              </Button>
            </div>
          </div>
          {editor}
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <Button variant={mode === 'create' ? 'default' : 'outline'} size="sm"
              onClick={() => setMode('create')} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Criar roteiro
            </Button>
            <Button variant={mode === 'attach' ? 'default' : 'outline'} size="sm"
              onClick={() => setMode('attach')} className="gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Anexar roteiro existente
            </Button>
          </div>

          {mode === 'create' ? (
            <>
              {editor}
              <Button onClick={handleCreate} disabled={saving} className="w-full gap-1.5">
                <BookOpen className="h-4 w-4" />
                {saving ? 'Criando...' : 'Criar roteiro e vincular à campanha'}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Ele aparece no módulo Roteiros com o selo de campanha.
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9"
                  placeholder="Buscar roteiro do cliente" />
              </div>
              {loadingCandidates ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando roteiros...
                </p>
              ) : filteredCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum roteiro encontrado para este cliente.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {filteredCandidates.map(s => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {(s.content || '').slice(0, 90) || 'Sem conteúdo'}
                        </p>
                      </div>
                      {s.campaign_slot_id && (
                        <Badge variant="outline" className="text-[9px] shrink-0">em outra campanha</Badge>
                      )}
                      <Button size="sm" variant="secondary" disabled={saving}
                        onClick={() => handleAttach(s)}>Anexar</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
