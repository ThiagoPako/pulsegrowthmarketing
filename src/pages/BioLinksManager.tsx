import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Edit2, Share2, Loader2, ExternalLink, Upload, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/vpsDb';
import { useCity } from '@/contexts/CityContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BioButtonList } from '@/pages/PublicBioLink';
import BioSectionsEditor from '@/components/bio/BioSectionsEditor';
import BioSectionsView from '@/components/bio/BioSectionsView';
import {
  BIO_THEME_PRESETS,
  DEFAULT_BIO_THEME,
  normalizeBioTheme,
  AVATAR_SIZE_PX,
  AVATAR_RADIUS,
  type BioThemeConfig,
} from '@/lib/bioTheme';
import {
  DEFAULT_BIO_SECTIONS,
  normalizeBioSections,
  type BioSections,
} from '@/lib/bioSections';

const API_BASE = 'https://agenciapulse.tech';

interface BioLinkRecord {
  id: string;
  client_id: string;
  slug: string;
  title?: string | null;
  description?: string | null;
  logo_url?: string | null;
  theme_config?: unknown;
  sections?: unknown;
}


interface BioFormState {
  id?: string;
  client_id: string;
  slug: string;
  title: string;
  description: string;
  logo_url: string;
}

const EMPTY_FORM: BioFormState = {
  client_id: '',
  slug: '',
  title: '',
  description: '',
  logo_url: '',
};

/** theme_config pode vir como objeto (JSONB) ou string (driver antigo). */
function parseTheme(raw: unknown): BioThemeConfig {
  if (typeof raw === 'string') {
    try {
      return normalizeBioTheme(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_BIO_THEME };
    }
  }
  return normalizeBioTheme(raw);
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-10 cursor-pointer rounded-md border border-border bg-transparent p-1"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 font-mono text-xs"
        />
      </div>
    </div>
  );
}

export default function BioLinksManager() {
  const [links, setLinks] = useState<BioLinkRecord[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<BioFormState>(EMPTY_FORM);
  const [theme, setTheme] = useState<BioThemeConfig>({ ...DEFAULT_BIO_THEME });
  const { activeCity } = useCity();

  async function load() {
    setLoading(true);
    try {
      const [{ data: bioData, error }, { data: clientsData }] = await Promise.all([
        supabase.from('client_bio_links').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('id, company_name'),
      ]);
      if (error) throw error;
      setLinks((bioData as BioLinkRecord[]) || []);
      setClients(clientsData || []);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar links de bio');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCity]);

  function openCreate() {
    setFormData(EMPTY_FORM);
    setTheme({ ...DEFAULT_BIO_THEME });
    setDialogOpen(true);
  }

  function openEdit(link: BioLinkRecord) {
    setFormData({
      id: link.id,
      client_id: link.client_id,
      slug: link.slug,
      title: link.title || '',
      description: link.description || '',
      logo_url: link.logo_url || '',
    });
    setTheme(parseTheme(link.theme_config));
    setDialogOpen(true);
  }

  function applyPreset(presetKey: string) {
    const preset = BIO_THEME_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    setTheme((current) => ({ ...current, ...preset.config, preset: preset.key }));
  }

  async function handleAvatarUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('folder', 'bio-links');
      body.append('path', 'bio-links');
      const token = localStorage.getItem('pulse_jwt');
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const result = await response.json();
      const url = result?.url || result?.publicUrl || result?.path;
      if (!response.ok || !url) throw new Error(result?.error || 'Falha no upload');
      setFormData((current) => ({ ...current, logo_url: url }));
      toast.success('Avatar enviado!');
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao enviar avatar');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    const slug = formData.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!formData.client_id || !slug) {
      toast.error('Selecione o cliente e informe o slug.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        client_id: formData.client_id,
        slug,
        title: formData.title.trim() || null,
        description: formData.description.trim() || null,
        logo_url: formData.logo_url.trim() || null,
        theme_config: theme,
        city: activeCity || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = formData.id
        ? await supabase.from('client_bio_links').update(payload).eq('id', formData.id)
        : await supabase.from('client_bio_links').insert(payload as any);
      if (error) throw error;
      toast.success(formData.id ? 'Bio atualizada!' : 'Bio criada!');
      setDialogOpen(false);
      load();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar bio');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(link: BioLinkRecord) {
    if (!window.confirm(`Excluir a bio "/bio/${link.slug}"?`)) return;
    try {
      const { error } = await supabase.from('client_bio_links').delete().eq('id', link.id);
      if (error) throw error;
      toast.success('Bio excluída.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao excluir');
    }
  }

  const previewButtons = useMemo(
    () => [
      { id: 'p1', label: 'WhatsApp Comercial', type: 'whatsapp' as const, value: '5562999999999' },
      { id: 'p2', label: 'Como chegar', type: 'location' as const, value: 'https://maps.google.com' },
      { id: 'p3', label: 'Instagram', type: 'social' as const, value: 'https://instagram.com' },
    ],
    [],
  );

  const avatarPx = AVATAR_SIZE_PX[theme.avatarSize] ?? AVATAR_SIZE_PX.md;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bio Links</h1>
          <p className="text-sm text-muted-foreground">
            Páginas de links personalizadas para cada cliente
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Criar Bio
        </Button>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma bio criada ainda.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => {
            const linkTheme = parseTheme(link.theme_config);
            return (
              <Card key={link.id} className="space-y-3 overflow-hidden p-4">
                <div
                  className="h-2 w-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${linkTheme.bgColor}, ${linkTheme.bgColorEnd}, ${linkTheme.accentColor})`,
                  }}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <h3 className="truncate font-semibold text-foreground">
                      {link.title || 'Sem título'}
                    </h3>
                    <p className="truncate font-mono text-xs text-primary">/bio/{link.slug}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {clients.find((client) => client.id === link.client_id)?.company_name || '—'}
                  </Badge>
                </div>

                <div className="flex gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(`/bio/${link.slug}`, '_blank')}
                  >
                    <ExternalLink className="mr-2 h-3.5 w-3.5" /> Ver
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(link)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/bio/${link.slug}`);
                      toast.success('Link copiado!');
                    }}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDelete(link)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formData.id ? 'Editar Bio' : 'Criar Bio'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            <Tabs defaultValue="dados">
              <TabsList className="w-full">
                <TabsTrigger value="dados" className="flex-1">Dados</TabsTrigger>
                <TabsTrigger value="tema" className="flex-1">
                  <Palette className="mr-2 h-4 w-4" /> Tema
                </TabsTrigger>
                <TabsTrigger value="layout" className="flex-1">Layout & Avatar</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select
                    value={formData.client_id}
                    onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL)</Label>
                  <Input
                    placeholder="ex: clinica-vida"
                    value={formData.slug}
                    onChange={(event) => setFormData({ ...formData, slug: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={formData.title}
                    onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="tema" className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs">Presets</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {BIO_THEME_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => applyPreset(preset.key)}
                        className={cn(
                          'rounded-lg border p-2 text-left transition-colors hover:border-primary',
                          theme.preset === preset.key ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                        )}
                      >
                        <div className="mb-2 flex gap-1">
                          {preset.swatch.map((color) => (
                            <span
                              key={color}
                              className="h-4 w-4 rounded-full border border-border/50"
                              style={{ background: color }}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-medium text-foreground">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ColorField label="Fundo (topo)" value={theme.bgColor} onChange={(v) => setTheme({ ...theme, bgColor: v, preset: 'custom' })} />
                  <ColorField label="Fundo (base)" value={theme.bgColorEnd} onChange={(v) => setTheme({ ...theme, bgColorEnd: v, preset: 'custom' })} />
                  <ColorField label="Texto" value={theme.textColor} onChange={(v) => setTheme({ ...theme, textColor: v, preset: 'custom' })} />
                  <ColorField label="Texto secundário" value={theme.mutedColor} onChange={(v) => setTheme({ ...theme, mutedColor: v, preset: 'custom' })} />
                  <ColorField label="Destaque (botões)" value={theme.accentColor} onChange={(v) => setTheme({ ...theme, accentColor: v, preset: 'custom' })} />
                  <ColorField label="Texto do botão" value={theme.accentTextColor} onChange={(v) => setTheme({ ...theme, accentTextColor: v, preset: 'custom' })} />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Estilo dos botões</Label>
                  <Select
                    value={theme.buttonStyle}
                    onValueChange={(value: BioThemeConfig['buttonStyle']) => setTheme({ ...theme, buttonStyle: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Sólido</SelectItem>
                      <SelectItem value="outline">Contorno</SelectItem>
                      <SelectItem value="glass">Vidro (blur)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="layout" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Layout dos links</Label>
                    <Select
                      value={theme.layout}
                      onValueChange={(value: BioThemeConfig['layout']) => setTheme({ ...theme, layout: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stack">Lista (empilhado)</SelectItem>
                        <SelectItem value="grid">Grade (2 colunas)</SelectItem>
                        <SelectItem value="minimal">Minimalista (compacto)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Formato do botão</Label>
                    <Select
                      value={theme.buttonShape}
                      onValueChange={(value: BioThemeConfig['buttonShape']) => setTheme({ ...theme, buttonShape: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pill">Pílula</SelectItem>
                        <SelectItem value="rounded">Arredondado</SelectItem>
                        <SelectItem value="square">Reto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Formato do avatar</Label>
                    <Select
                      value={theme.avatarShape}
                      onValueChange={(value: BioThemeConfig['avatarShape']) => setTheme({ ...theme, avatarShape: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="circle">Círculo</SelectItem>
                        <SelectItem value="rounded">Arredondado</SelectItem>
                        <SelectItem value="square">Quadrado</SelectItem>
                        <SelectItem value="hidden">Sem avatar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Tamanho do avatar</Label>
                    <Select
                      value={theme.avatarSize}
                      onValueChange={(value: BioThemeConfig['avatarSize']) => setTheme({ ...theme, avatarSize: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sm">Pequeno</SelectItem>
                        <SelectItem value="md">Médio</SelectItem>
                        <SelectItem value="lg">Grande</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm">Borda colorida no avatar</Label>
                    <p className="text-xs text-muted-foreground">Aplica a cor de destaque ao redor da imagem</p>
                  </div>
                  <Switch
                    checked={theme.avatarRing}
                    onCheckedChange={(checked) => setTheme({ ...theme, avatarRing: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Imagem do avatar</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="URL da imagem"
                      value={formData.logo_url}
                      onChange={(event) => setFormData({ ...formData, logo_url: event.target.value })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => document.getElementById('bio-avatar-input')?.click()}
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                    <input
                      id="bio-avatar-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleAvatarUpload(file);
                        event.target.value = '';
                      }}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Preview ao vivo */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Pré-visualização</Label>
              <div className="overflow-hidden rounded-[28px] border-4 border-foreground/10 shadow-lg">
                <div
                  className="flex min-h-[440px] flex-col items-center gap-5 px-5 py-8"
                  style={{
                    background: `linear-gradient(160deg, ${theme.bgColor}, ${theme.bgColorEnd})`,
                  }}
                >
                  {theme.avatarShape !== 'hidden' && (
                    <div
                      style={{
                        width: avatarPx * 0.75,
                        height: avatarPx * 0.75,
                        borderRadius: AVATAR_RADIUS[theme.avatarShape],
                        border: theme.avatarRing ? `3px solid ${theme.accentColor}` : 'none',
                        background: formData.logo_url ? `url(${formData.logo_url}) center/cover` : `${theme.accentColor}33`,
                      }}
                    />
                  )}
                  <div className="text-center">
                    <p className="text-base font-bold" style={{ color: theme.textColor }}>
                      {formData.title || 'Título da página'}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: theme.mutedColor }}>
                      {formData.description || 'Descrição curta do cliente'}
                    </p>
                  </div>
                  <div className="w-full">
                    <BioButtonList buttons={previewButtons} theme={theme} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Bio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
