import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadFileToVps } from '@/services/vpsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Textarea } from '@/components/ui/textarea';
import whatsappIconSrc from '@/assets/whatsapp_icon.png';
import {
  Car, Download, Eye, Plus, X, Image, Loader2, Check,
  Gauge, Upload, Save, Move, Lock, Unlock, Trash2, Palette, Type, MapPin, Phone
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

interface LayoutColors {
  header: string;
  headerText: string;
  infoBg: string;
  infoPills: string;
  infoLabelText: string;
  infoValueText: string;
  priceBg: string;
  priceText: string;
  footerBg: string;
  footerAccent: string;
  footerText: string;
}

const DEFAULT_COLORS: LayoutColors = {
  header: '#034e98',
  headerText: '#1a1a2e',
  infoBg: '#1e2a45',
  infoPills: '#034e98',
  infoLabelText: '#FFFFFF',
  infoValueText: '#FFFFFF',
  priceBg: '#034e98',
  priceText: '#FFFFFF',
  footerBg: '#0a0f1e',
  footerAccent: '#034e98',
  footerText: '#FFFFFF',
};

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

const IPVA_OPTIONS = [
  { value: 'pago', label: 'IPVA Pago' },
  { value: 'pendente', label: 'IPVA Pendente' },
  { value: 'nenhum', label: 'Não informar' },
];

const CANVAS_W = 1080;
const CANVAS_H = 1350;

type CanvasZone = 'header' | 'price' | 'info' | 'footer' | null;

const COLOR_LABELS: { key: keyof LayoutColors; label: string; zone: CanvasZone }[] = [
  { key: 'header', label: 'Cabeçalho', zone: 'header' },
  { key: 'headerText', label: 'Texto Cabeçalho', zone: 'header' },
  { key: 'priceBg', label: 'Caixa Preço', zone: 'price' },
  { key: 'priceText', label: 'Texto Preço', zone: 'price' },
  { key: 'infoBg', label: 'Barra Info', zone: 'info' },
  { key: 'infoPills', label: 'Cor Etiquetas (caixa)', zone: 'info' },
  { key: 'infoLabelText', label: 'Texto Etiquetas', zone: 'info' },
  { key: 'infoValueText', label: 'Texto Valores', zone: 'info' },
  { key: 'footerBg', label: 'Rodapé Fundo', zone: 'footer' },
  { key: 'footerAccent', label: 'Rodapé Destaque', zone: 'footer' },
  { key: 'footerText', label: 'Texto Rodapé', zone: 'footer' },
];

function darkenHex(hex: string, amount = 30): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.max(0, r - amount); g = Math.max(0, g - amount); b = Math.max(0, b - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export default function PortalPanfletagem({ clientId, clientColor, clientName, clientLogoUrl, clientWhatsapp, clientCity }: Props) {
  const [templates, setTemplates] = useState<FlyerTemplate[]>([]);
  const [items, setItems] = useState<FlyerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewItem, setPreviewItem] = useState<FlyerItem | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const wpIconRef = useRef<HTMLImageElement | null>(null);

  // Preload WhatsApp icon
  useEffect(() => {
    const img = document.createElement('img') as HTMLImageElement;
    img.src = whatsappIconSrc;
    img.onload = () => { wpIconRef.current = img; };
    if (img.complete && img.naturalWidth > 0) wpIconRef.current = img;
  }, []);

  // Form state
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [transmission, setTransmission] = useState('manual');
  const [fuelType, setFuelType] = useState('flex');
  const [tireCondition, setTireCondition] = useState('bom');
  const [price, setPrice] = useState('');
  const [ipvaStatus, setIpvaStatus] = useState('nenhum');
  const [extraInfo, setExtraInfo] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  // Footer editable fields
  const [footerAddress, setFooterAddress] = useState(clientCity || '');
  const [footerWhatsapp, setFooterWhatsapp] = useState(clientWhatsapp || '');

  // Custom logo
  const [customLogoDataUrl, setCustomLogoDataUrl] = useState<string | null>(null);

  // Layout state
  const [logoX, setLogoX] = useState(820);
  const [logoY, setLogoY] = useState(60);
  const [logoScale, setLogoScale] = useState(100); // percentage scale, keeps aspect ratio
  const [logoNaturalW, setLogoNaturalW] = useState(200);
  const [logoNaturalH, setLogoNaturalH] = useState(120);
  const [infoPosY, setInfoPosY] = useState(920);

  // Font size multiplier
  const [fontScale, setFontScale] = useState(1.0);

  // Info box scale (controls pill/box size proportionally)
  const [infoBoxScale, setInfoBoxScale] = useState(1.0);

  // Per-field font scales
  const [modelFontScale, setModelFontScale] = useState(1.0);
  const [yearFontScale, setYearFontScale] = useState(1.0);
  const [transmissionFontScale, setTransmissionFontScale] = useState(1.0);
  const [obsFontScale, setObsFontScale] = useState(1.0);
  // Active field font editor (toggled by clicking label name)
  const [activeFieldEditor, setActiveFieldEditor] = useState<string | null>(null);
  // Column header label font scale
  const [labelFontScale, setLabelFontScale] = useState(1.0);
  // Pill (rounded label box) controls
  const [pillHeightScale, setPillHeightScale] = useState(1.0);
  const [pillRadiusScale, setPillRadiusScale] = useState(1.0);

  // Footer position (draggable)
  const [footerPosX, setFooterPosX] = useState(0);
  const [footerPosY, setFooterPosY] = useState(0); // offset from default position

  // Vehicle photo position offset (panning inside the crop area)
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);

  // Per-component colors
  const [colors, setColors] = useState<LayoutColors>({ ...DEFAULT_COLORS });

  // Lock
  const [layoutLocked, setLayoutLocked] = useState(false);

  // Drag state
  const [dragging, setDragging] = useState<'logo' | 'info' | 'footer' | 'photo' | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const didDragRef = useRef(false);

  // Loaded images for preview
  const [vehicleImgObj, setVehicleImgObj] = useState<HTMLImageElement | null>(null);
  const [logoImgObj, setLogoImgObj] = useState<HTMLImageElement | null>(null);

  // Canvas click → zone color picker
  const [activeColorZone, setActiveColorZone] = useState<CanvasZone>(null);

  // Computed logo dimensions based on scale
  const logoW = Math.round(logoNaturalW * (logoScale / 100));
  const logoH = Math.round(logoNaturalH * (logoScale / 100));

  // Load saved layout
  useEffect(() => {
    const saved = localStorage.getItem(`flyer-layout-${clientId}`);
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.logoX != null) setLogoX(s.logoX);
        if (s.logoY != null) setLogoY(s.logoY);
        if (s.logoScale != null) setLogoScale(s.logoScale);
        if (s.infoPosY != null) setInfoPosY(s.infoPosY);
        if (s.layoutLocked != null) setLayoutLocked(s.layoutLocked);
        if (s.customLogoDataUrl) setCustomLogoDataUrl(s.customLogoDataUrl);
        if (s.fontScale != null) setFontScale(s.fontScale);
        if (s.infoBoxScale != null) setInfoBoxScale(s.infoBoxScale);
        // Legacy support: if old single infoFontScale exists, apply to all
        if (s.modelFontScale != null) setModelFontScale(s.modelFontScale);
        else if (s.infoFontScale != null) setModelFontScale(s.infoFontScale);
        if (s.yearFontScale != null) setYearFontScale(s.yearFontScale);
        else if (s.infoFontScale != null) setYearFontScale(s.infoFontScale);
        if (s.transmissionFontScale != null) setTransmissionFontScale(s.transmissionFontScale);
        else if (s.infoFontScale != null) setTransmissionFontScale(s.infoFontScale);
        if (s.obsFontScale != null) setObsFontScale(s.obsFontScale);
        else if (s.infoFontScale != null) setObsFontScale(s.infoFontScale);
        if (s.labelFontScale != null) setLabelFontScale(s.labelFontScale);
        if (s.pillHeightScale != null) setPillHeightScale(s.pillHeightScale);
        if (s.pillRadiusScale != null) setPillRadiusScale(s.pillRadiusScale);
        if (s.footerPosX != null) setFooterPosX(s.footerPosX);
        if (s.footerPosY != null) setFooterPosY(s.footerPosY);
        if (s.colors) {
          const migrated = { ...DEFAULT_COLORS, ...s.colors };
          // Legacy: migrate old single infoText to split fields
          if (s.colors.infoText && !s.colors.infoLabelText) migrated.infoLabelText = s.colors.infoText;
          if (s.colors.infoText && !s.colors.infoValueText) migrated.infoValueText = s.colors.infoText;
          setColors(migrated);
        }
        if (s.footerAddress != null) setFooterAddress(s.footerAddress);
        if (s.footerWhatsapp != null) setFooterWhatsapp(s.footerWhatsapp);
      } catch { /* ignore */ }
    }
  }, [clientId]);

  // Sync defaults from props
  useEffect(() => {
    if (clientCity && !footerAddress) setFooterAddress(clientCity);
  }, [clientCity]);
  useEffect(() => {
    if (clientWhatsapp && !footerWhatsapp) setFooterWhatsapp(clientWhatsapp);
  }, [clientWhatsapp]);

  const saveLayoutSettings = () => {
    const settings = { logoX, logoY, logoScale, infoPosY, layoutLocked, customLogoDataUrl, fontScale, infoBoxScale, modelFontScale, yearFontScale, transmissionFontScale, obsFontScale, labelFontScale, pillHeightScale, pillRadiusScale, footerPosX, footerPosY, colors, footerAddress, footerWhatsapp };
    localStorage.setItem(`flyer-layout-${clientId}`, JSON.stringify(settings));
    toast.success('Layout salvo!');
  };

  useEffect(() => { loadData(); }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    const [templatesRes, itemsRes] = await Promise.all([
      supabase.from('flyer_templates').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('flyer_items').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    ]);
    if (templatesRes.data) {
      setTemplates(templatesRes.data as FlyerTemplate[]);
      const fr = templatesRes.data.filter((t: any) => t.template_type === 'frame');
      if (fr.length > 0 && !selectedTemplate) setSelectedTemplate(fr[0].id);
    }
    if (itemsRes.data) setItems(itemsRes.data as FlyerItem[]);
    setLoading(false);
  };

  // Load logo image object & capture natural dimensions
  useEffect(() => {
    const src = customLogoDataUrl || clientLogoUrl;
    if (!src) { setLogoImgObj(null); return; }
    const img = new window.Image();
    // Only set crossOrigin for non-data URLs to avoid CORS issues with data URIs
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      setLogoImgObj(img);
      setLogoNaturalW(img.naturalWidth > 0 ? Math.min(img.naturalWidth, 400) : 200);
      setLogoNaturalH(img.naturalHeight > 0 ? Math.min(img.naturalHeight, 300) : 120);
    };
    img.onerror = (err) => {
      console.error('Logo load error:', err, 'src length:', src.length);
      setLogoImgObj(null);
    };
    img.src = src;
  }, [customLogoDataUrl, clientLogoUrl]);

  // Load first vehicle image
  useEffect(() => {
    if (mediaPreviews.length === 0) { setVehicleImgObj(null); return; }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setVehicleImgObj(img);
    img.src = mediaPreviews[0];
  }, [mediaPreviews]);

  // Custom logo upload
   const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomLogoDataUrl(ev.target?.result as string);
      toast.success('Logo personalizada carregada!');
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
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

  const drawImageCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number, offX = 0, offY = 0) => {
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const destAspect = dw / dh;
    let sx: number, sy: number, sw: number, sh: number;
    if (imgAspect > destAspect) {
      sh = img.naturalHeight; sw = sh * destAspect; sx = (img.naturalWidth - sw) / 2; sy = 0;
    } else {
      sw = img.naturalWidth; sh = sw / destAspect; sx = 0; sy = (img.naturalHeight - sh) / 2;
    }
    // Apply offset (in source-image pixel space)
    const maxOffX = (img.naturalWidth - sw) / 2;
    const maxOffY = (img.naturalHeight - sh) / 2;
    sx += Math.max(-maxOffX, Math.min(maxOffX, offX * (img.naturalWidth / dw)));
    sy += Math.max(-maxOffY, Math.min(maxOffY, offY * (img.naturalHeight / dh)));
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  };

  const updateColor = (key: keyof LayoutColors, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
  };

  // Detect which zone was clicked on canvas
  const detectZone = (cy: number): CanvasZone => {
    if (cy < 260) return 'header';
    const infoEnd = infoPosY + Math.round(260 * infoBoxScale);
    if (cy >= infoPosY - 160 && cy < infoPosY) return 'price'; // price area above info
    if (cy >= infoPosY && cy < infoEnd) return 'info';
    if (cy >= infoEnd) return 'footer';
    return null;
  };

  // Core draw function
  const drawCanvas = useCallback((canvas: HTMLCanvasElement, vImg: HTMLImageElement | null, lImg: HTMLImageElement | null) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const W = CANVAS_W, H = CANVAS_H;
    const fs = fontScale;
    const bs = infoBoxScale;

    const c = colors;
    const BRAND_DARK = darkenHex(c.header);

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Header
    const headerGrad = ctx.createLinearGradient(0, 0, W, 0);
    headerGrad.addColorStop(0, c.header);
    headerGrad.addColorStop(1, BRAND_DARK);
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, W, 260);

    // White diagonal
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(580, 0); ctx.quadraticCurveTo(480, 260, 0, 260); ctx.closePath();
    ctx.fill();

    ctx.fillStyle = c.headerText;
    ctx.font = `bold ${Math.round(52 * fs)}px 'Raleway', sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Seu próximo', 40, 80);
    ctx.fillText('carro está', 40, 140);
    ctx.font = `bold italic ${Math.round(52 * fs)}px 'Raleway', sans-serif`;
    ctx.fillStyle = c.header;
    ctx.fillText('aqui!', 40, 200);

    // Vehicle photo
    const photoY = 260;
    const photoH = infoPosY - photoY;
    if (vImg && photoH > 0) {
      drawImageCover(ctx, vImg, 0, photoY, W, photoH, photoOffsetX, photoOffsetY);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, photoY, W, Math.max(photoH, 100));
      ctx.fillStyle = '#555';
      ctx.font = `${Math.round(28 * fs)}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Adicione uma foto do veículo', W / 2, photoY + Math.max(photoH, 100) / 2);
    }

    // Price overlay — show example when empty
    const priceText = price ? formatPrice(price) : 'R$ 00.000,00';
    const priceIsExample = !price;
    {
      const priceBoxW = Math.round(460 * bs), priceBoxH = Math.round(120 * bs);
      const priceX = W - priceBoxW - 30;
      const priceYpos = infoPosY - priceBoxH - 30;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.roundRect(priceX + 4, priceYpos + 4, priceBoxW, priceBoxH, 16); ctx.fill();
      const priceGrad = ctx.createLinearGradient(priceX, priceYpos, priceX + priceBoxW, priceYpos);
      priceGrad.addColorStop(0, c.priceBg); priceGrad.addColorStop(1, darkenHex(c.priceBg));
      ctx.fillStyle = priceGrad;
      ctx.beginPath(); ctx.roundRect(priceX, priceYpos, priceBoxW, priceBoxH, 16); ctx.fill();
      ctx.globalAlpha = priceIsExample ? 0.4 : 1;
      ctx.fillStyle = c.priceText; ctx.font = `${Math.round(20 * fs)}px Arial, sans-serif`; ctx.textAlign = 'left';
      ctx.fillText('POR APENAS:', priceX + 24, priceYpos + Math.round(35 * bs));
      ctx.font = `bold ${Math.round(52 * fs)}px Arial, sans-serif`;
      ctx.fillText(priceText, priceX + 24, priceYpos + Math.round(90 * bs));
      ctx.globalAlpha = 1;
    }

    // Info bar
    const infoH = Math.round(260 * bs);
    ctx.fillStyle = c.infoBg;
    ctx.fillRect(0, infoPosY, W, infoH);
    ctx.fillStyle = c.infoPills;
    ctx.fillRect(0, infoPosY, W, 4);

    const data = {
      model: model || 'Modelo',
      year: year || 'Ano',
      transmission,
      fuel: fuelType,
      tires: tireCondition,
      extraInfo: extraInfo.trim(),
    };

    // Build observations: always include button selections, then append user text
    const obsLines: string[] = [];
    obsLines.push(`• ${FUEL_OPTIONS.find(f => f.value === data.fuel)?.label || data.fuel}`);
    obsLines.push(`• Pneus ${TIRE_OPTIONS.find(t => t.value === data.tires)?.label || data.tires}`);
    if (ipvaStatus === 'pago') obsLines.push('• IPVA Pago');
    else if (ipvaStatus === 'pendente') obsLines.push('• IPVA Pendente');
    // Append user extra observations as bullet points
    if (data.extraInfo) {
      data.extraInfo.split('\n').filter(l => l.trim()).forEach(line => {
        obsLines.push(`• ${line.trim()}`);
      });
    }

    const cols = [
      { label: 'MODELO', value: data.model },
      { label: 'ANO', value: data.year },
      { label: 'CÂMBIO', value: data.transmission === 'automatico' ? 'Automático' : 'Manual' },
      { label: 'OBSERVAÇÕES', value: obsLines.join('\n') },
    ];
    const colW = W / 4;
    const colPad = Math.round(12 * bs);
    const pillH = Math.round(44 * bs * pillHeightScale);
    const pillR = Math.round(22 * bs * pillRadiusScale);

    cols.forEach((col, i) => {
      const cx = i * colW + colPad;
      const cw = colW - colPad * 2;
      // Pill
      ctx.fillStyle = c.infoPills;
      ctx.beginPath(); ctx.roundRect(cx, infoPosY + Math.round(24 * bs), cw, pillH, pillR); ctx.fill();
      ctx.fillStyle = c.infoLabelText; ctx.font = `bold ${Math.round(20 * labelFontScale * fs)}px 'Raleway', sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(col.label, cx + cw / 2, infoPosY + Math.round(24 * bs) + pillH / 2 + Math.round(7 * fs));

      const fieldScales = [modelFontScale, yearFontScale, transmissionFontScale, obsFontScale];
      const ifs = fieldScales[i];
      ctx.fillStyle = c.infoValueText;
      ctx.font = i === 3 ? `bold ${Math.round(18 * ifs * fs)}px 'Raleway', sans-serif` : `bold ${Math.round(24 * ifs * fs)}px 'Raleway', sans-serif`;
      ctx.textAlign = 'center';
      const valueStartY = infoPosY + Math.round(24 * bs) + pillH + Math.round(30 * bs);
      if (col.value.includes('\n') || col.value.includes('•')) {
        const lines = col.value.split('\n').filter(l => l.trim());
        lines.forEach((line, li) => ctx.fillText(line.trim(), cx + cw / 2, valueStartY + li * Math.round(30 * bs)));
      } else {
        const words = col.value.split(' ');
        let line = ''; let lineY = valueStartY;
        words.forEach(word => {
          const test = line + (line ? ' ' : '') + word;
          if (ctx.measureText(test).width > cw - 10 && line) {
            ctx.fillText(line, cx + cw / 2, lineY); line = word; lineY += Math.round(30 * bs);
          } else { line = test; }
        });
        if (line) ctx.fillText(line, cx + cw / 2, lineY);
      }
      if (i < 3) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo((i + 1) * colW, infoPosY + Math.round(24 * bs)); ctx.lineTo((i + 1) * colW, infoPosY + infoH - 20); ctx.stroke();
      }
    });

    // Footer
    const footY = infoPosY + infoH;
    const footH = H - footY;
    const footGrad = ctx.createLinearGradient(0, footY, 0, footY + footH);
    footGrad.addColorStop(0, c.footerBg);
    footGrad.addColorStop(1, darkenHex(c.footerBg, 15));
    ctx.fillStyle = footGrad;
    ctx.fillRect(0, footY, W, footH);
    ctx.fillStyle = c.footerAccent;
    ctx.fillRect(0, footY, W, 3);

    const footCenterY = footY + footH / 2;
    const footContentCenterY = footCenterY + footerPosY;
    const footContentOffX = footerPosX;
    const addrText = footerAddress || '';
    const wpText = footerWhatsapp || '';

    // Draw pin icon (drawn, not emoji)
    const drawPinIcon = (cx: number, cy: number, size: number) => {
      ctx.save();
      ctx.fillStyle = c.footerAccent;
      ctx.beginPath(); ctx.arc(cx, cy, size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      const ps = size * 0.55;
      ctx.moveTo(cx, cy + ps * 1.3);
      ctx.quadraticCurveTo(cx - ps, cy, cx - ps * 0.5, cy - ps * 0.6);
      ctx.arc(cx, cy - ps * 0.3, ps * 0.7, Math.PI * 1.15, Math.PI * -0.15);
      ctx.quadraticCurveTo(cx + ps, cy, cx, cy + ps * 1.3);
      ctx.fill();
      ctx.fillStyle = c.footerAccent;
      ctx.beginPath(); ctx.arc(cx, cy - ps * 0.3, ps * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    // Draw WhatsApp icon from imported image
    const drawWhatsAppIcon = (cx: number, cy: number, size: number) => {
      const wpImg = wpIconRef.current;
      if (wpImg) {
        const s2 = size * 2;
        ctx.drawImage(wpImg, cx - s2 / 2, cy - s2 / 2, s2, s2);
      }
    };

    // Address section (left half) — offset by footerPosX/Y
    if (addrText) {
      drawPinIcon(55 + footContentOffX, footContentCenterY, 24);
      ctx.fillStyle = c.footerText;
      ctx.font = `bold ${Math.round(12 * fs)}px 'Raleway', sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('ENDEREÇO', 92 + footContentOffX, footContentCenterY - 18);
      ctx.font = `bold ${Math.round(18 * fs)}px 'Raleway', sans-serif`;
      const maxAddrW = W / 2 - 120;
      const addrWords = addrText.split(' ');
      let addrLine = ''; let addrLineY = footContentCenterY + 6;
      addrWords.forEach(word => {
        const test = addrLine + (addrLine ? ' ' : '') + word;
        if (ctx.measureText(test).width > maxAddrW && addrLine) {
          ctx.fillText(addrLine, 92 + footContentOffX, addrLineY); addrLine = word; addrLineY += 22;
        } else { addrLine = test; }
      });
      if (addrLine) ctx.fillText(addrLine, 92 + footContentOffX, addrLineY);
    }

    // WhatsApp section (right half) — offset by footerPosX/Y
    if (wpText) {
      const wpX = W / 2 + 40 + footContentOffX;
      drawWhatsAppIcon(wpX + 24, footContentCenterY, 24);
      ctx.fillStyle = c.footerText;
      ctx.font = `bold ${Math.round(12 * fs)}px 'Raleway', sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('WHATSAPP', wpX + 58, footContentCenterY - 18);
      ctx.font = `bold ${Math.round(24 * fs)}px 'Raleway', sans-serif`;
      ctx.fillText(wpText, wpX + 58, footContentCenterY + 12);
    }

    // Logo (proportional)
    if (lImg) {
      ctx.drawImage(lImg, logoX, logoY, logoW, logoH);
    } else if (clientName) {
      ctx.fillStyle = '#FFFFFF'; ctx.font = `bold ${Math.round(36 * fs)}px Arial, sans-serif`; ctx.textAlign = 'left';
      ctx.fillText(clientName, logoX, logoY + 40);
    }
  }, [model, year, transmission, fuelType, tireCondition, price, extraInfo, infoPosY, logoX, logoY, logoW, logoH, clientName, fontScale, infoBoxScale, modelFontScale, yearFontScale, transmissionFontScale, obsFontScale, labelFontScale, pillHeightScale, pillRadiusScale, colors, footerAddress, footerWhatsapp, logoScale, ipvaStatus, footerPosX, footerPosY, photoOffsetX, photoOffsetY]);

  // Live preview rendering
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    drawCanvas(canvas, vehicleImgObj, logoImgObj);
  }, [drawCanvas, vehicleImgObj, logoImgObj]);

  // Drag handlers on preview canvas
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return { cx: 0, cy: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return { cx: (e.clientX - rect.left) * scaleX, cy: (e.clientY - rect.top) * scaleY };
  };

  const handlePreviewMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (layoutLocked) return;
    didDragRef.current = false;
    const { cx, cy } = getCanvasCoords(e);
    // Check logo hit
    if (cx >= logoX && cx <= logoX + logoW && cy >= logoY && cy <= logoY + logoH) {
      e.preventDefault(); e.stopPropagation();
      setDragging('logo'); setDragOffset({ x: cx - logoX, y: cy - logoY }); return;
    }
    const infoH = Math.round(260 * infoBoxScale);
    // Check photo zone hit (between header and info bar)
    const photoY = 260;
    if (cy >= photoY && cy < infoPosY) {
      e.preventDefault(); e.stopPropagation();
      setDragging('photo'); setDragOffset({ x: cx - photoOffsetX, y: cy - photoOffsetY }); return;
    }
    if (cy >= infoPosY && cy <= infoPosY + infoH) {
      setDragging('info'); setDragOffset({ x: 0, y: cy - infoPosY }); return;
    }
    // Check footer hit
    const footY = infoPosY + infoH;
    if (cy >= footY) {
      setDragging('footer'); setDragOffset({ x: cx - footerPosX, y: cy - (footY + (CANVAS_H - footY) / 2 + footerPosY) }); return;
    }
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (didDragRef.current) { didDragRef.current = false; return; }
    const { cy } = getCanvasCoords(e);
    const zone = detectZone(cy);
    setActiveColorZone(prev => prev === zone ? null : zone);
  };

  const handlePreviewMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || layoutLocked) return;
    e.preventDefault();
    didDragRef.current = true;
    const { cx, cy } = getCanvasCoords(e);
    if (dragging === 'logo') {
      setLogoX(Math.max(-logoW / 2, Math.min(CANVAS_W - logoW / 2, cx - dragOffset.x)));
      setLogoY(Math.max(-logoH / 2, Math.min(CANVAS_H - logoH / 2, cy - dragOffset.y)));
    } else if (dragging === 'photo') {
      setPhotoOffsetX(cx - dragOffset.x);
      setPhotoOffsetY(cy - dragOffset.y);
    } else if (dragging === 'info') {
      setInfoPosY(Math.max(400, Math.min(CANVAS_H - 330, cy - dragOffset.y)));
    } else if (dragging === 'footer') {
      const infoH = Math.round(260 * infoBoxScale);
      const footY = infoPosY + infoH;
      const footCenterDefault = footY + (CANVAS_H - footY) / 2;
      setFooterPosX(cx - dragOffset.x);
      setFooterPosY(cy - dragOffset.y - footCenterDefault);
    }
  };

  const handlePreviewMouseUp = () => { setDragging(null); };

  // Touch handlers
  const getTouchCoords = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return { cx: 0, cy: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return { cx: (touch.clientX - rect.left) * scaleX, cy: (touch.clientY - rect.top) * scaleY };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (layoutLocked) return;
    didDragRef.current = false;
    const { cx, cy } = getTouchCoords(e);
    if (cx >= logoX && cx <= logoX + logoW && cy >= logoY && cy <= logoY + logoH) {
      setDragging('logo'); setDragOffset({ x: cx - logoX, y: cy - logoY }); e.preventDefault(); return;
    }
    const infoH = Math.round(260 * infoBoxScale);
    const photoY = 260;
    if (cy >= photoY && cy < infoPosY) {
      setDragging('photo'); setDragOffset({ x: cx - photoOffsetX, y: cy - photoOffsetY }); e.preventDefault(); return;
    }
    if (cy >= infoPosY && cy <= infoPosY + infoH) {
      setDragging('info'); setDragOffset({ x: 0, y: cy - infoPosY }); e.preventDefault(); return;
    }
    const footY = infoPosY + infoH;
    if (cy >= footY) {
      setDragging('footer'); setDragOffset({ x: cx - footerPosX, y: cy - (footY + (CANVAS_H - footY) / 2 + footerPosY) }); e.preventDefault(); return;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!dragging || layoutLocked) return;
    e.preventDefault();
    didDragRef.current = true;
    const { cx, cy } = getTouchCoords(e);
    if (dragging === 'logo') {
      setLogoX(Math.max(-logoW / 2, Math.min(CANVAS_W - logoW / 2, cx - dragOffset.x)));
      setLogoY(Math.max(-logoH / 2, Math.min(CANVAS_H - logoH / 2, cy - dragOffset.y)));
    } else if (dragging === 'info') {
      setInfoPosY(Math.max(400, Math.min(CANVAS_H - 330, cy - dragOffset.y)));
    } else if (dragging === 'footer') {
      const infoH = Math.round(260 * infoBoxScale);
      const footY = infoPosY + infoH;
      const footCenterDefault = footY + (CANVAS_H - footY) / 2;
      setFooterPosX(cx - dragOffset.x);
      setFooterPosY(cy - dragOffset.y - footCenterDefault);
    }
  };

  const handleTouchEnd = () => setDragging(null);

  // Generate final art
  const generateFinalArt = useCallback(async (vehicleImageSrc: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) return reject('Canvas not found');
      const vImg = new window.Image();
      vImg.crossOrigin = 'anonymous';
      vImg.onload = () => {
        const logoSrc = customLogoDataUrl || clientLogoUrl;
        if (logoSrc) {
          const lImg = new window.Image();
          if (!logoSrc.startsWith('data:')) lImg.crossOrigin = 'anonymous';
          lImg.onload = () => { drawCanvas(canvas, vImg, lImg); resolve(canvas.toDataURL('image/jpeg', 0.92)); };
          lImg.onerror = () => { drawCanvas(canvas, vImg, null); resolve(canvas.toDataURL('image/jpeg', 0.92)); };
          lImg.src = logoSrc;
        } else {
          drawCanvas(canvas, vImg, null);
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        }
      };
      vImg.onerror = () => reject('Failed to load vehicle image');
      vImg.src = vehicleImageSrc;
    });
  }, [drawCanvas, customLogoDataUrl, clientLogoUrl]);

  const handleCreate = async () => {
    if (!model.trim() || !year.trim()) { toast.error('Preencha modelo e ano do veículo'); return; }
    if (mediaFiles.length === 0 && mediaPreviews.length === 0) { toast.error('Adicione pelo menos uma foto do veículo'); return; }

    setCreating(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of mediaFiles) {
        setUploading(true);
        const url = await uploadFileToVps(file, `flyers/${clientId}`);
        uploadedUrls.push(url);
      }
      setUploading(false);

      setGenerating(true);
      let generatedUrl = '';
      const firstImage = uploadedUrls[0] || mediaPreviews[0];
      if (firstImage) {
        try { generatedUrl = await generateFinalArt(firstImage); } catch (err) { console.warn('Art generation failed:', err); }
      }
      setGenerating(false);

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
      if (item) { setItems(prev => [item as FlyerItem, ...prev]); setPreviewItem(item as FlyerItem); }
      setModel(''); setYear(''); setTransmission('manual'); setFuelType('flex');
      setTireCondition('bom'); setPrice(''); setExtraInfo('');
      setMediaFiles([]); setMediaPreviews([]);
    } catch (err: any) {
      toast.error('Erro ao criar panfleto: ' + (err.message || 'Erro desconhecido'));
    } finally { setCreating(false); setGenerating(false); setUploading(false); }
  };

  const handleDownload = (item: FlyerItem) => {
    if (!item.generated_image_url) return;
    const link = document.createElement('a');
    link.href = item.generated_image_url;
    link.download = `${item.vehicle_model}-${item.vehicle_year}.jpg`;
    link.click();
    supabase.from('flyer_items').update({ status: 'baixado' }).eq('id', item.id).then(() => {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'baixado' } : i));
    });
  };

  const handleDeleteItem = async (itemId: string) => {
    const { error } = await supabase.from('flyer_items').delete().eq('id', itemId);
    if (error) { toast.error('Erro ao apagar'); return; }
    setItems(prev => prev.filter(i => i.id !== itemId));
    if (previewItem?.id === itemId) setPreviewItem(null);
    toast.success('Panfleto apagado!');
  };

  const zoneColorsFiltered = activeColorZone ? COLOR_LABELS.filter(c => c.zone === activeColorZone) : [];
  const zoneLabel = activeColorZone === 'header' ? 'Cabeçalho' : activeColorZone === 'price' ? 'Preço' : activeColorZone === 'info' ? 'Barra de Informações' : activeColorZone === 'footer' ? 'Rodapé' : '';

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-white/70 mb-3">
          <Car size={12} style={{ color: `hsl(${clientColor})` }} />
          Panfletagem Digital
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Crie seu panfleto digital</h2>
        <p className="text-white/50 mt-1 text-sm">Preencha os dados, ajuste a prévia em tempo real e gere a arte</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Form */}
        <div className="space-y-6">
          {/* Vehicle Info */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <Car size={16} style={{ color: `hsl(${clientColor})` }} /> Dados do Veículo
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Modelo *</Label>
                <Input value={model} onChange={e => setModel(e.target.value)} placeholder="Ex: Honda Civic" className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Ano *</Label>
                <Input value={year} onChange={e => setYear(e.target.value)} placeholder="Ex: 2023/2024" className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Câmbio</Label>
              <div className="flex gap-2">
                {TRANSMISSION_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setTransmission(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${transmission === opt.value ? 'text-white border-2' : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08]'}`}
                    style={transmission === opt.value ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
                    <Gauge size={14} /> {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Combustível</Label>
              <div className="flex flex-wrap gap-2">
                {FUEL_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setFuelType(opt.value)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${fuelType === opt.value ? 'text-white border-2' : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08]'}`}
                    style={fuelType === opt.value ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Pneus</Label>
              <div className="flex gap-2">
                {TIRE_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setTireCondition(opt.value)}
                    className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${tireCondition === opt.value ? 'text-white border-2' : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08]'}`}
                    style={tireCondition === opt.value ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">IPVA</Label>
              <div className="flex gap-2">
                {IPVA_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setIpvaStatus(opt.value)}
                    className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${ipvaStatus === opt.value ? 'text-white border-2' : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08]'}`}
                    style={ipvaStatus === opt.value ? { borderColor: `hsl(${clientColor})`, backgroundColor: `hsl(${clientColor} / 0.15)` } : {}}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Valor</Label>
              <Input value={price ? formatPrice(price) : ''} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="R$ 0,00"
                className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30 text-lg font-bold" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Observações extras (Enter = novo tópico)</Label>
              <Textarea value={extraInfo} onChange={e => setExtraInfo(e.target.value)} placeholder="Ex: KM 61.845&#10;Único dono&#10;Revisado"
                rows={3}
                className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30 resize-none" />
            </div>
          </div>

          {/* Footer / Address & WhatsApp */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <MapPin size={16} style={{ color: `hsl(${clientColor})` }} /> Rodapé — Endereço e WhatsApp
            </h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60 flex items-center gap-1.5">
                  <MapPin size={10} /> Endereço
                </Label>
                <Input value={footerAddress} onChange={e => setFooterAddress(e.target.value)} placeholder="Ex: Av. Brasil, 1500 - Centro, Cidade/UF"
                  className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60 flex items-center gap-1.5">
                  <Phone size={10} /> WhatsApp
                </Label>
                <Input value={footerWhatsapp} onChange={e => setFooterWhatsapp(e.target.value)} placeholder="Ex: (11) 99999-9999"
                  className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/30" />
              </div>
            </div>
          </div>

          {/* Photos upload */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <Image size={16} style={{ color: `hsl(${clientColor})` }} /> Fotos do Veículo
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {mediaPreviews.map((preview, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeMedia(i)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-white/[0.15] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-white/60 hover:border-white/[0.25] transition-all">
                <Plus size={20} /><span className="text-[10px]">Adicionar</span>
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
          </div>

          {/* Logo Control (uses original, just controls scale) */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <Upload size={16} style={{ color: `hsl(${clientColor})` }} /> Logo
            </h3>
            <p className="text-[11px] text-white/40">A logo original do cadastro é usada. Envie outra se precisar, ou ajuste o tamanho (proporcional).</p>
            <div className="flex items-center gap-4">
              {(customLogoDataUrl || clientLogoUrl) && (
                <div className="w-16 h-16 rounded-lg bg-white/[0.06] overflow-hidden flex items-center justify-center">
                  <img src={customLogoDataUrl || clientLogoUrl || ''} alt="Logo" className="max-w-full max-h-full object-contain" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => logoFileInputRef.current?.click()}
                  className="border-white/[0.1] text-white/70 hover:text-white hover:bg-white/[0.06] text-xs">
                  <Upload size={12} /> Enviar Outra Logo
                </Button>
                {customLogoDataUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setCustomLogoDataUrl(null)} className="text-white/40 hover:text-red-400 text-xs">
                    <X size={12} /> Usar logo original
                  </Button>
                )}
              </div>
            </div>
            <input ref={logoFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />

            {/* Proportional logo scale slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-white/60">Tamanho da Logo (proporcional)</Label>
                <span className="text-xs text-white/40 font-mono">{logoScale}%</span>
              </div>
              <Slider value={[logoScale]} onValueChange={v => { if (!layoutLocked) setLogoScale(v[0]); }} min={20} max={200} step={5} className="w-full" />
              <p className="text-[10px] text-white/30">{logoW} × {logoH}px</p>
            </div>
          </div>

          {/* Font Size Control */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <Type size={16} style={{ color: `hsl(${clientColor})` }} /> Tamanho da Fonte
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-white/60">Escala</Label>
                <span className="text-xs text-white/40 font-mono">{Math.round(fontScale * 100)}%</span>
              </div>
              <Slider value={[fontScale * 100]} onValueChange={v => setFontScale(v[0] / 100)} min={70} max={150} step={5} className="w-full" />
              <div className="flex justify-between text-[10px] text-white/30">
                <span>Menor</span><span>Normal</span><span>Maior</span>
              </div>
            </div>
          </div>

          {/* Info Box Scale */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <Palette size={16} style={{ color: `hsl(${clientColor})` }} /> Tamanho das Caixas (Info)
            </h3>
            <p className="text-[11px] text-white/40">Controla a escala das caixinhas de Modelo, Ano, Câmbio, etc. mantendo as proporções.</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-white/60">Escala</Label>
                <span className="text-xs text-white/40 font-mono">{Math.round(infoBoxScale * 100)}%</span>
              </div>
              <Slider value={[infoBoxScale * 100]} onValueChange={v => setInfoBoxScale(v[0] / 100)} min={70} max={150} step={5} className="w-full" />
            </div>
            {/* Pill box controls */}
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <Label className="text-xs text-white/60">Caixas Arredondadas (etiquetas)</Label>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Altura</span>
                <span className="text-[10px] text-white/40 font-mono">{Math.round(pillHeightScale * 100)}%</span>
              </div>
              <Slider value={[pillHeightScale * 100]} onValueChange={v => setPillHeightScale(v[0] / 100)} min={50} max={200} step={5} className="w-full" />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Arredondamento</span>
                <span className="text-[10px] text-white/40 font-mono">{Math.round(pillRadiusScale * 100)}%</span>
              </div>
              <Slider value={[pillRadiusScale * 100]} onValueChange={v => setPillRadiusScale(v[0] / 100)} min={0} max={200} step={10} className="w-full" />
            </div>
            {/* Per-field font scale controls */}
            {[
              { key: 'labels', label: 'CABEÇALHOS (etiquetas)', scale: labelFontScale, setter: setLabelFontScale },
              { key: 'model', label: 'MODELO', scale: modelFontScale, setter: setModelFontScale },
              { key: 'year', label: 'ANO', scale: yearFontScale, setter: setYearFontScale },
              { key: 'transmission', label: 'CÂMBIO', scale: transmissionFontScale, setter: setTransmissionFontScale },
              { key: 'obs', label: 'OBSERVAÇÕES', scale: obsFontScale, setter: setObsFontScale },
            ].map(({ key, label, scale, setter }) => (
              <div key={key} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveFieldEditor(activeFieldEditor === key ? null : key)}
                  className={`w-full text-left text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors ${activeFieldEditor === key ? 'bg-white/[0.1] text-white' : 'text-white/60 hover:text-white/80 hover:bg-white/[0.04]'}`}
                >
                  {label} — {Math.round(scale * 100)}%
                </button>
                {activeFieldEditor === key && (
                  <div className="pl-2 pr-1">
                    <Slider value={[scale * 100]} onValueChange={v => setter(v[0] / 100)} min={50} max={250} step={5} className="w-full" />
                    <div className="flex justify-between text-[9px] text-white/30 mt-0.5">
                      <span>50%</span><span>100%</span><span>250%</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Color Pickers — full list */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <Palette size={16} style={{ color: `hsl(${clientColor})` }} /> Cores do Layout
            </h3>
            <p className="text-[11px] text-white/40">💡 Dica: clique em uma área da prévia para filtrar as cores daquela seção.</p>
            <div className="grid grid-cols-2 gap-3">
              {COLOR_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="relative w-9 h-9 rounded-lg overflow-hidden border-2 border-white/[0.15] cursor-pointer hover:border-white/[0.3] transition-colors flex-shrink-0">
                    <input
                      type="color"
                      value={colors[key]}
                      onChange={e => updateColor(key, e.target.value)}
                      className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                    />
                    <div className="w-full h-full" style={{ backgroundColor: colors[key] }} />
                  </label>
                  <span className="text-[11px] text-white/60 leading-tight">{label}</span>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setColors({ ...DEFAULT_COLORS })} className="text-white/40 hover:text-white text-xs w-full">
              Resetar Cores Padrão
            </Button>
          </div>

          {/* Animated Lock + Save */}
          <div className="flex gap-3">
            <motion.button
              onClick={() => setLayoutLocked(!layoutLocked)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold border-2 transition-colors ${
                layoutLocked
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-white/[0.04] text-white/60 border-white/[0.1] hover:bg-white/[0.08] hover:text-white'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                animate={layoutLocked ? { rotate: [0, -10, 10, -5, 0], scale: [1, 1.2, 1] } : { rotate: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
                key={layoutLocked ? 'locked' : 'unlocked'}
              >
                {layoutLocked ? <Lock size={18} /> : <Unlock size={18} />}
              </motion.div>
              {layoutLocked ? 'Layout Trancado' : 'Trancar Layout'}
              {layoutLocked && (
                <motion.div
                  className="w-2 h-2 rounded-full bg-amber-400"
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
              )}
            </motion.button>
            <Button variant="outline" onClick={saveLayoutSettings}
              className="flex-1 border-white/[0.1] text-white/70 hover:text-white hover:bg-white/[0.06] text-xs h-auto">
              <Save size={14} /> Salvar Posições
            </Button>
          </div>

          {/* Generate button */}
          <Button onClick={handleCreate} disabled={creating || generating || uploading || !model.trim() || !year.trim()}
            className="w-full h-12 rounded-xl text-sm font-semibold text-white" style={{ background: `hsl(${clientColor})` }}>
            {creating || generating || uploading ? (
              <><Loader2 size={16} className="animate-spin" /> {uploading ? 'Enviando fotos...' : generating ? 'Gerando arte...' : 'Criando...'}</>
            ) : (
              <><Car size={16} /> Gerar Panfleto Digital</>
            )}
          </Button>
        </div>

        {/* Right: Live Preview + history */}
        <div className="space-y-6">
          {/* Live Preview Canvas */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                <Eye size={16} style={{ color: `hsl(${clientColor})` }} /> Prévia em Tempo Real
              </h3>
              <div className="flex items-center gap-2">
                {layoutLocked && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30"
                  >
                    <motion.div animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}>
                      <Lock size={10} className="text-amber-400" />
                    </motion.div>
                    <span className="text-[10px] text-amber-300 font-medium">Trancado</span>
                  </motion.div>
                )}
                {!layoutLocked && (
                  <span className="text-[10px] text-white/40 bg-white/[0.06] px-2 py-1 rounded-full flex items-center gap-1">
                    <Move size={10} /> Arraste para mover
                  </span>
                )}
              </div>
            </div>
            <div className="aspect-[4/5] rounded-xl overflow-hidden bg-black relative">
              <canvas
                ref={previewCanvasRef}
                className="w-full h-full"
                style={{ cursor: layoutLocked ? 'default' : dragging ? 'grabbing' : 'grab' }}
                onMouseDown={handlePreviewMouseDown}
                onMouseMove={handlePreviewMouseMove}
                onMouseUp={handlePreviewMouseUp}
                onMouseLeave={handlePreviewMouseUp}
                onClick={handlePreviewClick}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />
            </div>

            {/* Zone-specific color picker (appears when clicking a zone on the preview) */}
            <AnimatePresence>
              {activeColorZone && zoneColorsFiltered.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-white/[0.06] border border-white/[0.12] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-white/80 flex items-center gap-2">
                        <Palette size={12} style={{ color: `hsl(${clientColor})` }} /> Cores: {zoneLabel}
                      </h4>
                      <button onClick={() => setActiveColorZone(null)} className="text-white/40 hover:text-white">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {zoneColorsFiltered.map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-2">
                          <label className="relative w-8 h-8 rounded-lg overflow-hidden border-2 border-white/[0.2] cursor-pointer hover:border-white/[0.4] transition-colors flex-shrink-0">
                            <input type="color" value={colors[key]} onChange={e => updateColor(key, e.target.value)} className="absolute inset-0 w-full h-full cursor-pointer opacity-0" />
                            <div className="w-full h-full" style={{ backgroundColor: colors[key] }} />
                          </label>
                          <span className="text-[10px] text-white/50">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Generated Preview */}
          <AnimatePresence mode="wait">
            {previewItem?.generated_image_url && (
              <motion.div key={previewItem.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                  <Check size={16} style={{ color: `hsl(${clientColor})` }} /> Arte Gerada
                </h3>
                <div className="aspect-[4/5] rounded-xl overflow-hidden">
                  <img src={previewItem.generated_image_url} alt="Preview" className="w-full h-full object-contain bg-black" />
                </div>
                <Button onClick={() => handleDownload(previewItem)} className="w-full h-10 rounded-xl text-white" style={{ background: `hsl(${clientColor})` }}>
                  <Download size={14} /> Baixar
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* History */}
          {items.length > 0 && (
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-white/80">Panfletos Criados</h3>
              <div className="grid grid-cols-2 gap-3">
                {items.map(item => (
                  <div key={item.id} className="relative group">
                    <button onClick={() => setPreviewItem(item)}
                      className="w-full relative aspect-[4/5] rounded-xl overflow-hidden border border-white/[0.08] hover:border-white/[0.2] transition-all">
                      {item.generated_image_url ? (
                        <img src={item.generated_image_url} alt="" className="w-full h-full object-cover" />
                      ) : item.media_urls[0] ? (
                        <img src={item.media_urls[0]} alt="" className="w-full h-full object-cover opacity-50" />
                      ) : (
                        <div className="w-full h-full bg-white/[0.04] flex items-center justify-center"><Car size={24} className="text-white/20" /></div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                        <p className="text-xs font-medium text-white truncate">{item.vehicle_model}</p>
                        <p className="text-[10px] text-white/50">{item.vehicle_year} • {item.price || 'Sem preço'}</p>
                      </div>
                    </button>
                    <button onClick={() => handleDeleteItem(item.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                      <Trash2 size={12} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
