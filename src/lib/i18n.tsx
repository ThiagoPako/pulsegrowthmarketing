import { useSyncExternalStore } from 'react';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Idioma das telas usadas na revisão da Meta (Conexões, Estúdio, Insights). */
export type Lang = 'pt' | 'en';
const KEY = 'pulse_lang';
const listeners = new Set<() => void>();

export const getLang = (): Lang => {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'pt'; } catch { return 'pt'; }
};

export const setLang = (lang: Lang) => {
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  listeners.forEach(l => l());
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Traduz fora de componentes (toasts em handlers). */
export const tr = (pt: string, en: string) => (getLang() === 'en' ? en : pt);

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getLang, () => 'pt' as Lang);
  return { lang, t: (pt: string, en: string) => (lang === 'en' ? en : pt) };
}

export function LanguageToggle() {
  const { lang } = useLang();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 text-xs font-semibold"
      aria-label={lang === 'en' ? 'Mudar para português' : 'Switch to English'}
      onClick={() => setLang(lang === 'en' ? 'pt' : 'en')}
    >
      <Languages size={14} /> {lang === 'en' ? 'EN' : 'PT'}
    </Button>
  );
}
