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
  clientName?: string;
  clientLogoUrl?: string | null;
  clientWhatsapp?: string;
  clientCity?: string;
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

export default function PortalPanfletagem({ clientId, clientColor, clientName, clientLogoUrl, clientWhatsapp, clientCity }: Props) {
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

  // Helper: draw image with cover behavior
  const drawImageCover = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    dx: number, dy: number, dw: number, dh: number
  ) => {
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const destAspect = dw / dh;
    let sx: number, sy: number, sw: number, sh: number;
    if (imgAspect > destAspect) {
      sh = img.naturalHeight;
      sw = sh * destAspect;
      sx = (img.naturalWidth - sw) / 2;
      sy = 0;
    } else {
      sw = img.naturalWidth;
      sh = sw / destAspect;
      sx = 0;
      sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  };

  const generateArt = useCallback(async (
    vehicleImage: string,
    frameUrl: string,
    data: { model: string; year: string; transmission: string; fuel: string; tires: string; price: string; extraInfo: string }
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

      const BRAND_COLOR = '#034e98';
      const BRAND_DARK = '#023a73';
      const DARK_BG = '#1a1a2e';
      const INFO_BG = '#1e2a45';

      const vehicleImg = new window.Image();
      vehicleImg.crossOrigin = 'anonymous';
      vehicleImg.onload = () => {
        // === BACKGROUND ===
        ctx.fillStyle = DARK_BG;
        ctx.fillRect(0, 0, W, H);

        // === TOP HEADER (0 → 260) ===
        const headerGrad = ctx.createLinearGradient(0, 0, W, 0);
        headerGrad.addColorStop(0, BRAND_COLOR);
        headerGrad.addColorStop(1, BRAND_DARK);
        ctx.fillStyle = headerGrad;
        ctx.fillRect(0, 0, W, 260);

        // White curved shape on left
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(580, 0);
        ctx.quadraticCurveTo(480, 260, 0, 260);
        ctx.closePath();
        ctx.fill();

        // Tagline
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 52px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Seu próximo', 40, 80);
        ctx.fillText('carro está', 40, 140);
        ctx.font = 'bold italic 52px Arial, sans-serif';
        ctx.fillStyle = BRAND_COLOR;
        ctx.fillText('aqui!', 40, 200);

        // === VEHICLE PHOTO (260 → 920) — bigger area ===
        const photoY = 260;
        const photoH = 660;
        drawImageCover(ctx, vehicleImg, 0, photoY, W, photoH);

        // === PRICE OVERLAY ===
        if (data.price) {
          const priceBoxW = 460;
          const priceBoxH = 120;
          const priceX = W - priceBoxW - 30;
          const priceY = photoY + photoH - priceBoxH - 30;

          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.beginPath();
          ctx.roundRect(priceX + 4, priceY + 4, priceBoxW, priceBoxH, 16);
          ctx.fill();

          const priceGrad = ctx.createLinearGradient(priceX, priceY, priceX + priceBoxW, priceY);
          priceGrad.addColorStop(0, BRAND_COLOR);
          priceGrad.addColorStop(1, BRAND_DARK);
          ctx.fillStyle = priceGrad;
          ctx.beginPath();
          ctx.roundRect(priceX, priceY, priceBoxW, priceBoxH, 16);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '20px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('POR APENAS:', priceX + 24, priceY + 35);
          ctx.font = 'bold 52px Arial, sans-serif';
          ctx.fillText(data.price, priceX + 24, priceY + 90);
        }

        // === FRAME OVERLAY (optional) ===
        const continueAfterFrame = () => {
          // === BOTTOM INFO BAR (920 → 1200) ===
          const infoY = photoY + photoH;
          const infoH = 260;
          ctx.fillStyle = INFO_BG;
          ctx.fillRect(0, infoY, W, infoH);

          const cols = [
            { label: 'MODELO', value: data.model },
            { label: 'ANO', value: data.year },
            { label: 'CÂMBIO', value: data.transmission === 'automatico' ? 'Automático' : 'Manual' },
            { label: 'OBSERVAÇÕES', value: data.extraInfo || `• ${FUEL_OPTIONS.find(f => f.value === data.fuel)?.label || data.fuel}\n• Pneus ${TIRE_OPTIONS.find(t => t.value === data.tires)?.label || data.tires}` },
          ];
          const colW = W / 4;
          const colPad = 12;

          cols.forEach((col, i) => {
            const cx = i * colW + colPad;
            const cw = colW - colPad * 2;

            ctx.fillStyle = BRAND_COLOR;
            ctx.beginPath();
            ctx.roundRect(cx, infoY + 20, cw, 44, 22);
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(col.label, cx + cw / 2, infoY + 48);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = i === 3 ? '18px Arial, sans-serif' : 'bold 24px Arial, sans-serif';
            ctx.textAlign = 'center';

            if (col.value.includes('\n') || col.value.includes('•')) {
              const lines = col.value.split('\n').filter(l => l.trim());
              lines.forEach((line, li) => {
                ctx.fillText(line.trim(), cx + cw / 2, infoY + 100 + li * 30);
              });
            } else {
              const words = col.value.split(' ');
              let line = '';
              let lineY = infoY + 110;
              words.forEach(word => {
                const test = line + (line ? ' ' : '') + word;
                if (ctx.measureText(test).width > cw - 10 && line) {
                  ctx.fillText(line, cx + cw / 2, lineY);
                  line = word;
                  lineY += 30;
                } else {
                  line = test;
                }
              });
              if (line) ctx.fillText(line, cx + cw / 2, lineY);
            }

            if (i < 3) {
              ctx.strokeStyle = 'rgba(255,255,255,0.15)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo((i + 1) * colW, infoY + 20);
              ctx.lineTo((i + 1) * colW, infoY + infoH - 20);
              ctx.stroke();
            }
          });

          // === FOOTER with client info (1180 → 1350) ===
          const footY = infoY + infoH;
          const footH = H - footY;
          ctx.fillStyle = DARK_BG;
          ctx.fillRect(0, footY, W, footH);

          // Address (left side)
          const addrText = clientCity || '';
          if (addrText) {
            // Location pin icon circle
            ctx.fillStyle = PULSE_ORANGE;
            ctx.beginPath();
            ctx.arc(60, footY + footH / 2, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('📍', 60, footY + footH / 2 + 7);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 18px Arial, sans-serif';
            ctx.textAlign = 'left';
            // Wrap address text
            const maxAddrW = W / 2 - 120;
            const addrWords = addrText.split(' ');
            let addrLine = '';
            let addrLineY = footY + footH / 2 - 12;
            addrWords.forEach(word => {
              const test = addrLine + (addrLine ? ' ' : '') + word;
              if (ctx.measureText(test).width > maxAddrW && addrLine) {
                ctx.fillText(addrLine, 95, addrLineY);
                addrLine = word;
                addrLineY += 24;
              } else {
                addrLine = test;
              }
            });
            if (addrLine) ctx.fillText(addrLine, 95, addrLineY);
          }

          // WhatsApp (right side)
          const whatsText = clientWhatsapp || '';
          if (whatsText) {
            ctx.fillStyle = PULSE_ORANGE;
            ctx.beginPath();
            ctx.arc(W - 300, footY + footH / 2, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('📱', W - 300, footY + footH / 2 + 7);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 18px Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('FALE CONOSCO', W - 265, footY + footH / 2 - 8);
            ctx.font = 'bold 22px Arial, sans-serif';
            ctx.fillText(whatsText, W - 265, footY + footH / 2 + 20);
          }

          // === LOGO (top right, like reference) ===
          const finalize = () => {
            resolve(canvas.toDataURL('image/jpeg', 0.92));
          };

          if (clientLogoUrl) {
            const logoImg = new window.Image();
            logoImg.crossOrigin = 'anonymous';
            logoImg.onload = () => {
              const logoMaxW = 220;
              const logoMaxH = 140;
              const logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
              let lw = logoMaxW;
              let lh = lw / logoAspect;
              if (lh > logoMaxH) {
                lh = logoMaxH;
                lw = lh * logoAspect;
              }
              const lx = W - lw - 40;
              const ly = (260 - lh) / 2;
              ctx.drawImage(logoImg, lx, ly, lw, lh);
              finalize();
            };
            logoImg.onerror = () => finalize();
            logoImg.src = clientLogoUrl;
          } else {
            // Draw company name as text fallback
            if (clientName) {
              ctx.fillStyle = '#FFFFFF';
              ctx.font = 'bold 36px Arial, sans-serif';
              ctx.textAlign = 'right';
              ctx.fillText(clientName, W - 40, 140);
            }
            finalize();
          }
        };

        if (frameUrl) {
          const frameImg = new window.Image();
          frameImg.crossOrigin = 'anonymous';
          frameImg.onload = () => {
            ctx.drawImage(frameImg, 0, 0, W, H);
            continueAfterFrame();
          };
          frameImg.onerror = () => continueAfterFrame();
          frameImg.src = frameUrl;
        } else {
          continueAfterFrame();
        }
      };
      vehicleImg.onerror = () => reject('Failed to load vehicle image');
      vehicleImg.src = vehicleImage;
    });
  }, [clientColor, clientLogoUrl, clientName, clientWhatsapp, clientCity]);

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
            extraInfo: extraInfo.trim(),
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
