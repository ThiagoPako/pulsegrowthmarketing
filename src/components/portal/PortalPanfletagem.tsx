import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadFileToVps } from '@/services/vpsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car, Upload, Download, Eye, Plus, X, Image, Loader2, Check,
  Fuel, Gauge, CircleDot, DollarSign, Calendar, Type, Trash2
} from 'lucide-react';

interface FlyerTemplate {
  id: string;
  name: string;
  template_type: string;
  file_url: string;
  preview_url: string | null;
  is_active: boolean;
}

interface FlyerItem {
  id: string;
  vehicle_model: string;
  vehicle_year: string;
  transmission: string;
  fuel_type: string;
  tire_condition: string;
  price: string;
  extra_info: string | null;
  media_urls: string[];
  generated_image_url: string | null;
  status: string;
  created_at: string;
  template_id: string | null;
}

interface Props {
  clientId: string;
  clientColor: string;
}

const TRANSMISSION_OPTIONS = [
  { value: 'manual', label: 'Manual', icon: Gauge },
  { value: 'automatico', label: 'Automático', icon: Gauge },
];

const FUEL_OPTIONS = [
  { value: 'flex', label: 'Flex' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'etanol', label: 'Etanol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'eletrico', label: 'Elétrico' },
  { value: 'hibrido', label: 'Híbrido' },
];

const TIRE_OPTIONS = [
  { value: 'novo', label: 'Novos' },
  { value: 'bom', label: 'Bons' },
  { value: 'regular', label: 'Regular' },
];

export default function PortalPanfletagem({ clientId, clientColor }: Props) {
  const [templates, setTemplates] = useState<FlyerTemplate[]>([]);
  const [items, setItems] = useState<FlyerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewItem, setPreviewItem] = useState<FlyerItem | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [transmission, setTransmission] = useState('manual');
  const [fuelType, setFuelType] = useState('flex');
  const [tireCondition, setTireCondition] = useState('bom');
  const [price, setPrice] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    const [templatesRes, itemsRes] = await Promise.all([
      supabase.from('flyer_templates').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('flyer_items').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    ]);
    if (templatesRes.data) {
      setTemplates(templatesRes.data as FlyerTemplate[]);
      const frames = templatesRes.data.filter((t: any) => t.template_type === 'frame');
      if (frames.length > 0 && !selectedTemplate) setSelectedTemplate(frames[0].id);
    }
    if (itemsRes.data) setItems(itemsRes.data as FlyerItem[]);
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setMediaFiles(prev => [...prev, ...files]);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setMediaPreviews(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(f);
    });
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const formatPrice = (value: string) => {
    const nums = value.replace(/\D/g, '');
    if (!nums) return '';
    const val = parseInt(nums) / 100;
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const generateArt = useCallback(async (
    vehicleImage: string,
    frameUrl: string,
    data: { model: string; year: string; transmission: string; fuel: string; tires: string; price: string }
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) return reject('Canvas not found');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Canvas context not found');

      const W = 1080;
      const H = 1350;
      canvas.width = W;
      canvas.height = H;

      const vehicleImg = new window.Image();
      vehicleImg.crossOrigin = 'anonymous';
      vehicleImg.onload = () => {
        // Draw vehicle image (cover)
        const imgRatio = vehicleImg.width / vehicleImg.height;
        const canvasRatio = W / H;
        let sx = 0, sy = 0, sw = vehicleImg.width, sh = vehicleImg.height;
        if (imgRatio > canvasRatio) {
          sw = vehicleImg.height * canvasRatio;
          sx = (vehicleImg.width - sw) / 2;
        } else {
          sh = vehicleImg.width / canvasRatio;
          sy = (vehicleImg.height - sh) / 2;
        }
        ctx.drawImage(vehicleImg, sx, sy, sw, sh, 0, 0, W, H);

        // Load frame overlay
        const frameImg = new window.Image();
        frameImg.crossOrigin = 'anonymous';
        frameImg.onload = () => {
          ctx.drawImage(frameImg, 0, 0, W, H);

          // Draw vehicle info at the bottom
          const infoY = H - 280;
          
          // Semi-transparent background for text
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.beginPath();
          ctx.roundRect(40, infoY, W - 80, 240, 20);
          ctx.fill();

          // Model
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 42px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${data.model}`, 70, infoY + 55);

          // Year
          ctx.font = '28px Arial, sans-serif';
          ctx.fillStyle = '#CCCCCC';
          ctx.fillText(`${data.year}`, 70, infoY + 95);

          // Tags row
          const tags = [
            data.transmission === 'automatico' ? '🔄 Automático' : '⚙️ Manual',
            `⛽ ${FUEL_OPTIONS.find(f => f.value === data.fuel)?.label || data.fuel}`,
            `🛞 Pneus ${TIRE_OPTIONS.find(t => t.value === data.tires)?.label || data.tires}`,
          ];
          ctx.font = '22px Arial, sans-serif';
          ctx.fillStyle = '#AAAAAA';
          let tagX = 70;
          tags.forEach(tag => {
            ctx.fillText(tag, tagX, infoY + 140);
            tagX += ctx.measureText(tag).width + 30;
          });

          // Price
          if (data.price) {
            ctx.font = 'bold 48px Arial, sans-serif';
            ctx.fillStyle = `hsl(${clientColor})`;
            ctx.textAlign = 'right';
            ctx.fillText(data.price, W - 70, infoY + 210);
          }

          resolve(canvas.toDataURL('image/jpeg', 0.92));
        };
        frameImg.onerror = () => {
          // No frame, just add text
          const infoY = H - 280;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.beginPath();
          ctx.roundRect(40, infoY, W - 80, 240, 20);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 42px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${data.model}`, 70, infoY + 55);
          ctx.font = '28px Arial, sans-serif';
          ctx.fillStyle = '#CCCCCC';
          ctx.fillText(`${data.year}`, 70, infoY + 95);

          if (data.price) {
            ctx.font = 'bold 48px Arial, sans-serif';
            ctx.fillStyle = `hsl(${clientColor})`;
            ctx.textAlign = 'right';
            ctx.fillText(data.price, W - 70, infoY + 210);
          }

          resolve(canvas.toDataURL('image/jpeg', 0.92));
        };
        frameImg.src = frameUrl;
      };
      vehicleImg.onerror = () => reject('Failed to load vehicle image');
      vehicleImg.src = vehicleImage;
    });
  }, [clientColor]);

  const handleCreate = async () => {
    if (!model.trim() || !year.trim()) {
      toast.error('Preencha modelo e ano do veículo');
      return;
    }
    if (mediaFiles.length === 0 && mediaPreviews.length === 0) {
      toast.error('Adicione pelo menos uma foto do veículo');
      return;
    }

    setCreating(true);
    try {
      // Upload media files to VPS
      const uploadedUrls: string[] = [];
      for (const file of mediaFiles) {
        setUploading(true);
        const url = await uploadFileToVps(file, `flyers/${clientId}`);
        uploadedUrls.push(url);
      }
      setUploading(false);

      // Get frame template URL
      const frame = templates.find(t => t.id === selectedTemplate && t.template_type === 'frame');
      const frameUrl = frame?.file_url || '';

      // Generate art using canvas
      setGenerating(true);
      let generatedUrl = '';
      if (uploadedUrls.length > 0 || mediaPreviews.length > 0) {
        const firstImage = uploadedUrls[0] || mediaPreviews[0];
        try {
          generatedUrl = await generateArt(firstImage, frameUrl, {
            model: model.trim(),
            year: year.trim(),
            transmission,
            fuel: fuelType,
            tires: tireCondition,
            price: price ? formatPrice(price) : '',
          });
        } catch (err) {
          console.warn('Art generation failed, saving without generated image:', err);
        }
      }
      setGenerating(false);

      // Save to database
      const { data: item, error } = await supabase.from('flyer_items').insert({
        client_id: clientId,
        template_id: selectedTemplate || null,
        vehicle_model: model.trim(),
        vehicle_year: year.trim(),
        transmission,
        fuel_type: fuelType,
        tire_condition: tireCondition,
        price: price ? formatPrice(price) : '',
        extra_info: extraInfo.trim() || null,
        media_urls: uploadedUrls,
        generated_image_url: generatedUrl || null,
        status: generatedUrl ? 'gerado' : 'rascunho',
      }).select().single();

      if (error) throw error;

      toast.success('Panfleto criado com sucesso!');
      if (item) {
        setItems(prev => [item as FlyerItem, ...prev]);
        setPreviewItem(item as FlyerItem);
      }

      // Reset form
      setModel('');
      setYear('');
      setTransmission('manual');
      setFuelType('flex');
      setTireCondition('bom');
      setPrice('');
      setExtraInfo('');
      setMediaFiles([]);
      setMediaPreviews([]);
    } catch (err: any) {
      console.error('Error creating flyer:', err);
      toast.error('Erro ao criar panfleto: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setCreating(false);
      setGenerating(false);
      setUploading(false);
    }
  };

  const handleDownload = (item: FlyerItem) => {
    if (!item.generated_image_url) return;
    const link = document.createElement('a');
    link.href = item.generated_image_url;
    link.download = `${item.vehicle_model}-${item.vehicle_year}.jpg`;
    link.click();

    // Update status
    supabase.from('flyer_items').update({ status: 'baixado' }).eq('id', item.id).then(() => {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'baixado' } : i));
    });
  };

  const frames = templates.filter(t => t.template_type === 'frame');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-white/70 mb-3">
          <Car size={12} style={{ color: `hsl(${clientColor})` }} />
          Panfletagem Digital Pulse
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Crie seu panfleto digital</h2>
        <p className="text-white/50 mt-1 text-sm">Preencha os dados do veículo e gere a arte automaticamente</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Form */}
        <div className="space-y-6">
          {/* Vehicle Info */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <Car size={16} style={{ color: `hsl(${clientColor})` }} />
              Dados do Veículo
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Modelo *</Label>
                <Input
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="Ex: Honda Civic"
                  className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Ano *</Label>
                <Input
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  placeholder="Ex: 2023/2024"
                  className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30"
                />
              </div>
            </div>

            {/* Transmission */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Câmbio</Label>
              <div className="flex gap-2">
                {TRANSMISSION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTransmission(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                      transmission === opt.value
                        ? 'text-white border-2'
                        : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08]'
                    }`}
                    style={transmission === opt.value ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}
                  >
                    <Gauge size={14} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fuel */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Combustível</Label>
              <div className="flex flex-wrap gap-2">
                {FUEL_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFuelType(opt.value)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      fuelType === opt.value
                        ? 'text-white border-2'
                        : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08]'
                    }`}
                    style={fuelType === opt.value ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tires */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Pneus</Label>
              <div className="flex gap-2">
                {TIRE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTireCondition(opt.value)}
                    className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                      tireCondition === opt.value
                        ? 'text-white border-2'
                        : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08]'
                    }`}
                    style={tireCondition === opt.value ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Valor</Label>
              <Input
                value={price ? formatPrice(price) : ''}
                onChange={e => setPrice(e.target.value.replace(/\D/g, ''))}
                placeholder="R$ 0,00"
                className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30 text-lg font-bold"
              />
            </div>

            {/* Extra info */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Informações adicionais</Label>
              <Input
                value={extraInfo}
                onChange={e => setExtraInfo(e.target.value)}
                placeholder="Ex: IPVA pago, único dono, etc."
                className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30"
              />
            </div>
          </div>

          {/* Photos upload */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <Image size={16} style={{ color: `hsl(${clientColor})` }} />
              Fotos do Veículo
            </h3>

            <div className="grid grid-cols-3 gap-3">
              {mediaPreviews.map((preview, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeMedia(i)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-white/[0.15] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-white/60 hover:border-white/[0.25] transition-all"
              >
                <Plus size={20} />
                <span className="text-[10px]">Adicionar</span>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Frame template selection */}
          {frames.length > 0 && (
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-white/80">Moldura</h3>
              <div className="grid grid-cols-3 gap-3">
                {frames.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedTemplate(f.id)}
                    className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all ${
                      selectedTemplate === f.id ? 'border-white/40' : 'border-transparent opacity-60 hover:opacity-80'
                    }`}
                    style={selectedTemplate === f.id ? { borderColor: `hsl(${clientColor})` } : {}}
                  >
                    <img src={f.preview_url || f.file_url} alt={f.name} className="w-full h-full object-cover" />
                    {selectedTemplate === f.id && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: `hsl(${clientColor})` }}>
                        <Check size={10} />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1">
                      <p className="text-[10px] text-white/80 truncate">{f.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generate button */}
          <Button
            onClick={handleCreate}
            disabled={creating || generating || uploading || !model.trim() || !year.trim()}
            className="w-full h-12 rounded-xl text-sm font-semibold text-white"
            style={{ background: `hsl(${clientColor})` }}
          >
            {creating || generating || uploading ? (
              <><Loader2 size={16} className="animate-spin" /> {uploading ? 'Enviando fotos...' : generating ? 'Gerando arte...' : 'Criando...'}</>
            ) : (
              <><Car size={16} /> Gerar Panfleto Digital</>
            )}
          </Button>
        </div>

        {/* Right: Preview + history */}
        <div className="space-y-6">
          {/* Preview */}
          <AnimatePresence mode="wait">
            {previewItem?.generated_image_url && (
              <motion.div
                key={previewItem.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-4"
              >
                <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                  <Eye size={16} style={{ color: `hsl(${clientColor})` }} />
                  Prévia
                </h3>
                <div className="aspect-[4/5] rounded-xl overflow-hidden">
                  <img src={previewItem.generated_image_url} alt="Preview" className="w-full h-full object-contain bg-black" />
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={() => handleDownload(previewItem)}
                    className="flex-1 h-10 rounded-xl text-white"
                    style={{ background: `hsl(${clientColor})` }}
                  >
                    <Download size={14} /> Baixar
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* History */}
          {items.length > 0 && (
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-white/80">Panfletos Criados</h3>
              <div className="grid grid-cols-2 gap-3">
                {items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setPreviewItem(item)}
                    className="relative aspect-[4/5] rounded-xl overflow-hidden group border border-white/[0.08] hover:border-white/[0.2] transition-all"
                  >
                    {item.generated_image_url ? (
                      <img src={item.generated_image_url} alt="" className="w-full h-full object-cover" />
                    ) : item.media_urls[0] ? (
                      <img src={item.media_urls[0]} alt="" className="w-full h-full object-cover opacity-50" />
                    ) : (
                      <div className="w-full h-full bg-white/[0.04] flex items-center justify-center">
                        <Car size={24} className="text-white/20" />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                      <p className="text-xs font-medium text-white truncate">{item.vehicle_model}</p>
                      <p className="text-[10px] text-white/50">{item.vehicle_year} • {item.price || 'Sem preço'}</p>
                    </div>
                    {item.generated_image_url && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                          <Download size={12} />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
