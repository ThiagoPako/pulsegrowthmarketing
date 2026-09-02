import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Upload, Loader2, Eye, EyeOff } from 'lucide-react';
import {
  newBrand,
  newSeller,
  newSocial,
  SOCIAL_LABELS,
  type BioBrand,
  type BioSections,
  type BioSeller,
  type BioSocial,
  type BioSocialNetwork,
} from '@/lib/bioSections';

interface Props {
  sections: BioSections;
  onChange: (next: BioSections) => void;
  /** Faz upload e devolve a URL pública. */
  onUpload: (file: File) => Promise<string | null>;
  uploading?: boolean;
}

function VisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onToggle} title={visible ? 'Ocultar' : 'Mostrar'}>
      {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
    </Button>
  );
}

function ImagePicker({
  value,
  placeholder,
  uploading,
  onUpload,
  onChange,
  round,
}: {
  value?: string;
  placeholder: string;
  uploading?: boolean;
  onUpload: (file: File) => Promise<string | null>;
  onChange: (url: string) => void;
  round?: boolean;
}) {
  const inputId = `bio-img-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="flex items-center gap-2">
      <div
        className={`h-12 w-12 shrink-0 overflow-hidden border border-border bg-muted ${round ? 'rounded-full' : 'rounded-md'}`}
        style={value ? { background: `url(${value}) center/cover` } : undefined}
      />
      <Input
        value={value || ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 text-xs"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => document.getElementById(inputId)?.click()}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      </Button>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const url = await onUpload(file);
          if (url) onChange(url);
        }}
      />
    </div>
  );
}

export default function BioSectionsEditor({ sections, onChange, onUpload, uploading }: Props) {
  const patch = (partial: Partial<BioSections>) => onChange({ ...sections, ...partial });

  const updateSeller = (id: string, partial: Partial<BioSeller>) =>
    patch({ sellers: sections.sellers.map((s) => (s.id === id ? { ...s, ...partial } : s)) });
  const updateBrand = (id: string, partial: Partial<BioBrand>) =>
    patch({ brands: sections.brands.map((b) => (b.id === id ? { ...b, ...partial } : b)) });
  const updateSocial = (id: string, partial: Partial<BioSocial>) =>
    patch({ socials: sections.socials.map((s) => (s.id === id ? { ...s, ...partial } : s)) });

  return (
    <div className="space-y-6">
      {/* LOCALIZAÇÃO */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Localização / Como chegar</Label>
            <p className="text-xs text-muted-foreground">Botão com link do Google Maps ou Waze</p>
          </div>
          <Switch
            checked={sections.location.enabled}
            onCheckedChange={(checked) =>
              patch({ location: { ...sections.location, enabled: checked } })
            }
          />
        </div>
        {sections.location.enabled && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Texto do botão</Label>
              <Input
                value={sections.location.label}
                onChange={(event) =>
                  patch({ location: { ...sections.location, label: event.target.value } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Link do mapa</Label>
              <Input
                placeholder="https://maps.app.goo.gl/..."
                value={sections.location.mapUrl || ''}
                onChange={(event) =>
                  patch({ location: { ...sections.location, mapUrl: event.target.value } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Endereço (opcional)</Label>
              <Input
                value={sections.location.address || ''}
                onChange={(event) =>
                  patch({ location: { ...sections.location, address: event.target.value } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horário (opcional)</Label>
              <Input
                placeholder="Seg a Sex, 8h às 18h"
                value={sections.location.hours || ''}
                onChange={(event) =>
                  patch({ location: { ...sections.location, hours: event.target.value } })
                }
              />
            </div>
          </div>
        )}
      </Card>

      {/* VENDEDORES */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Vendedores / Equipe</Label>
            <p className="text-xs text-muted-foreground">Foto, nome, cargo e WhatsApp (opcional)</p>
          </div>
          <Switch
            checked={sections.showSellers}
            onCheckedChange={(checked) => patch({ showSellers: checked })}
          />
        </div>

        {sections.showSellers && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título da seção</Label>
              <Input
                value={sections.sellersTitle}
                onChange={(event) => patch({ sellersTitle: event.target.value })}
              />
            </div>

            {sections.sellers.map((seller) => (
              <div key={seller.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    placeholder="Nome"
                    value={seller.name}
                    onChange={(event) => updateSeller(seller.id, { name: event.target.value })}
                    className="h-9"
                  />
                  <VisibilityToggle
                    visible={seller.visible}
                    onToggle={() => updateSeller(seller.id, { visible: !seller.visible })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() =>
                      patch({ sellers: sections.sellers.filter((s) => s.id !== seller.id) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  placeholder="Cargo (ex: Consultora de vendas)"
                  value={seller.role || ''}
                  onChange={(event) => updateSeller(seller.id, { role: event.target.value })}
                  className="h-9"
                />
                <ImagePicker
                  round
                  value={seller.photoUrl}
                  placeholder="URL da foto"
                  uploading={uploading}
                  onUpload={onUpload}
                  onChange={(url) => updateSeller(seller.id, { photoUrl: url })}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="WhatsApp (opcional) ex: 5562999999999"
                    value={seller.whatsapp || ''}
                    onChange={(event) => updateSeller(seller.id, { whatsapp: event.target.value })}
                    className="h-9"
                  />
                  <Input
                    placeholder="Mensagem automática (opcional)"
                    value={seller.whatsappMessage || ''}
                    onChange={(event) =>
                      updateSeller(seller.id, { whatsappMessage: event.target.value })
                    }
                    className="h-9"
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch({ sellers: [...sections.sellers, newSeller()] })}
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar vendedor
            </Button>
          </div>
        )}
      </Card>

      {/* MARCAS */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Marcas que trabalhamos</Label>
            <p className="text-xs text-muted-foreground">Logos em carrossel automático</p>
          </div>
          <Switch
            checked={sections.showBrands}
            onCheckedChange={(checked) => patch({ showBrands: checked })}
          />
        </div>

        {sections.showBrands && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Título da seção</Label>
                <Input
                  value={sections.brandsTitle}
                  onChange={(event) => patch({ brandsTitle: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Velocidade (segundos por ciclo)</Label>
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={sections.brandsSpeed}
                  onChange={(event) =>
                    patch({ brandsSpeed: Number(event.target.value) || 25 })
                  }
                />
              </div>
            </div>

            {sections.brands.map((brand) => (
              <div key={brand.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    placeholder="Nome da marca"
                    value={brand.name}
                    onChange={(event) => updateBrand(brand.id, { name: event.target.value })}
                    className="h-9"
                  />
                  <VisibilityToggle
                    visible={brand.visible}
                    onToggle={() => updateBrand(brand.id, { visible: !brand.visible })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => patch({ brands: sections.brands.filter((b) => b.id !== brand.id) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <ImagePicker
                  value={brand.logoUrl}
                  placeholder="URL da logo"
                  uploading={uploading}
                  onUpload={onUpload}
                  onChange={(url) => updateBrand(brand.id, { logoUrl: url })}
                />
                <Input
                  placeholder="Link da marca (opcional)"
                  value={brand.url || ''}
                  onChange={(event) => updateBrand(brand.id, { url: event.target.value })}
                  className="h-9"
                />
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch({ brands: [...sections.brands, newBrand()] })}
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar marca
            </Button>
          </div>
        )}
      </Card>

      {/* REDES SOCIAIS */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Redes sociais</Label>
            <p className="text-xs text-muted-foreground">Cadastre e escolha o que aparece</p>
          </div>
          <Switch
            checked={sections.showSocials}
            onCheckedChange={(checked) => patch({ showSocials: checked })}
          />
        </div>

        {sections.showSocials && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Título da seção</Label>
                <Input
                  value={sections.socialsTitle}
                  onChange={(event) => patch({ socialsTitle: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Exibição</Label>
                <Select
                  value={sections.socialsStyle}
                  onValueChange={(value: BioSections['socialsStyle']) =>
                    patch({ socialsStyle: value })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="icons">Ícones</SelectItem>
                    <SelectItem value="buttons">Botões</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {sections.socials.map((social) => (
              <div key={social.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <Select
                  value={social.network}
                  onValueChange={(value: BioSocialNetwork) =>
                    updateSocial(social.id, { network: value })
                  }
                >
                  <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SOCIAL_LABELS) as BioSocialNetwork[]).map((key) => (
                      <SelectItem key={key} value={key}>{SOCIAL_LABELS[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="@usuario ou URL completa"
                  value={social.value}
                  onChange={(event) => updateSocial(social.id, { value: event.target.value })}
                  className="h-9 min-w-[180px] flex-1"
                />
                <Input
                  placeholder="Rótulo (opcional)"
                  value={social.label || ''}
                  onChange={(event) => updateSocial(social.id, { label: event.target.value })}
                  className="h-9 w-[150px]"
                />
                <VisibilityToggle
                  visible={social.visible}
                  onToggle={() => updateSocial(social.id, { visible: !social.visible })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => patch({ socials: sections.socials.filter((s) => s.id !== social.id) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch({ socials: [...sections.socials, newSocial()] })}
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar rede social
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
