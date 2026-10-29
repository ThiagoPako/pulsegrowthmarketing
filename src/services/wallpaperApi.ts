/**
 * Módulo Wallpaper (vps-api-server/wallpaper.mjs). As rotas da equipe conferem login, admin e a
 * cidade ativa (cabeçalho x-pulse-city do invokeVpsFunction).
 */
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

export type WallpaperFit = 'fill' | 'fit' | 'stretch' | 'center' | 'tile' | 'span';

export const FIT_LABELS: Record<WallpaperFit, string> = {
  fill: 'Preencher',
  fit: 'Ajustar',
  stretch: 'Ampliar',
  center: 'Centralizar',
  tile: 'Lado a lado',
  span: 'Estender (várias telas)',
};

export interface WallpaperClientOption {
  id: string;
  company_name: string;
  logo_url: string | null;
  color: string | null;
  registered: boolean;
}

export interface WallpaperAccountSummary {
  id: string;
  client_id: string;
  company_name: string;
  logo_url: string | null;
  color: string | null;
  fit: WallpaperFit;
  devices: number;
  online: number;
  images: number;
  upcoming: number;
}

export interface WallpaperVariant {
  id: string;
  file_url: string;
  width: number;
  height: number;
  ratio: string;
}

/** O que um formato de tela recebe da imagem: a versão escolhida e quanto o "Preencher" corta (%). */
export interface WallpaperCoverage {
  ratio: string;
  w: number;
  h: number;
  file_url: string;
  variant_id: string | null;
  crop: number | null;
}

export interface WallpaperImage {
  id: string;
  title: string;
  file_url: string;
  width: number | null;
  height: number | null;
  ratio: string | null;
  variants: WallpaperVariant[];
  coverage: WallpaperCoverage[];
  created_at: string;
}

/** Formato de tela dos computadores conectados (uma linha por proporção). */
export interface WallpaperScreenGroup {
  ratio: string;
  w: number;
  h: number;
  screens: number;
  devices: number;
  sizes: string[];
}

export interface WallpaperSchedule {
  id: string;
  image_id: string;
  starts_at: string;
  ends_at: string | null;
  status: 'ativa' | 'agendada' | 'encerrada';
}

export interface WallpaperDevice {
  id: string;
  hostname: string;
  os: 'windows' | 'mac' | string;
  os_version: string;
  os_user: string;
  screens: { w: number; h: number }[];
  needs_reinstall: boolean;
  last_seen_at: string | null;
  online: boolean;
  up_to_date: boolean;
  applied_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

export interface WallpaperAccountDetail {
  account: {
    id: string;
    client_id: string;
    company_name: string;
    logo_url: string | null;
    color: string | null;
    fit: WallpaperFit;
    notes: string;
    link_path: string;
  };
  active_schedule_id: string | null;
  active_image_id: string | null;
  images: WallpaperImage[];
  screen_groups: WallpaperScreenGroup[];
  schedules: WallpaperSchedule[];
  devices: WallpaperDevice[];
  agent_interval_min: number;
}

async function call<T>(path: string, options?: { body?: unknown; method?: string }): Promise<T> {
  const { data, error } = await invokeVpsFunction(path, options);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchWallpaperClients = () =>
  call<{ clients: WallpaperClientOption[] }>('wallpaper/clients', { method: 'GET' }).then((d) => d.clients);

export const fetchWallpaperAccounts = () =>
  call<{ accounts: WallpaperAccountSummary[] }>('wallpaper/accounts', { method: 'GET' }).then((d) => d.accounts);

export const fetchWallpaperAccount = (id: string) =>
  call<WallpaperAccountDetail>(`wallpaper/accounts/${id}`, { method: 'GET' });

export const createWallpaperAccount = (client_id: string, fit: WallpaperFit) =>
  call<{ id: string }>('wallpaper/accounts', { body: { client_id, fit } });

export const updateWallpaperAccount = (id: string, body: { fit?: WallpaperFit; notes?: string }) =>
  call('wallpaper/accounts/' + id, { method: 'PATCH', body });

export const regenerateWallpaperLink = (id: string) =>
  call<{ link_path: string }>(`wallpaper/accounts/${id}/token`, { body: {} });

export const deleteWallpaperAccount = (id: string) => call(`wallpaper/accounts/${id}`, { method: 'DELETE' });

export const addWallpaperImage = (id: string, file_url: string, title: string, size: ImageSize | null) =>
  call<{ image: WallpaperImage }>(`wallpaper/accounts/${id}/images`, { body: { file_url, title, ...size } }).then((d) => d.image);

export const addWallpaperVariant = (imageId: string, file_url: string, size: ImageSize) =>
  call<{ id: string }>(`wallpaper/images/${imageId}/variants`, { body: { file_url, ...size } });

export const deleteWallpaperVariant = (variantId: string) => call(`wallpaper/variants/${variantId}`, { method: 'DELETE' });

export interface ImageSize { width: number; height: number }

/** Largura e altura reais do arquivo (lidas no navegador antes de subir). */
export function readImageSize(file: File): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name}: não deu para abrir a imagem`)); };
    img.src = url;
  });
}

export const deleteWallpaperImage = (imageId: string) => call(`wallpaper/images/${imageId}`, { method: 'DELETE' });

export const scheduleWallpaper = (id: string, body: { image_id: string; starts_at?: string | null; ends_at?: string | null }) =>
  call<{ id: string }>(`wallpaper/accounts/${id}/schedules`, { body });

export const deleteWallpaperSchedule = (scheduleId: string) => call(`wallpaper/schedules/${scheduleId}`, { method: 'DELETE' });

export const removeWallpaperDevice = (deviceId: string) => call(`wallpaper/devices/${deviceId}`, { method: 'DELETE' });

/** Link que vai para o cliente: sempre o endereço de produção (a página fala com a API de lá). */
export function wallpaperLinkUrl(linkPath: string): string {
  return `https://agenciapulse.tech${linkPath}`;
}
