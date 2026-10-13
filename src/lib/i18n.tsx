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

/* ───────── Tradução automática do sistema inteiro (Google Tradutor) ───────── */

const setGoogCookie = (value: string | null) => {
  const host = window.location.hostname;
  const domains = ['', host, `.${host.replace(/^www\./, '')}`];
  domains.forEach(d => {
    const domainPart = d ? `; domain=${d}` : '';
    document.cookie = value
      ? `googtrans=${value}; path=/${domainPart}`
      : `googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${domainPart}`;
  });
};

/**
 * O tradutor troca os textos da tela por elementos próprios; o React tenta
 * remover nós que já não estão onde esperava e quebra a página. Estes ajustes
 * ignoram essas remoções em vez de derrubar o sistema.
 */
const patchDomForTranslation = () => {
  const w = window as unknown as { __pulseDomPatched?: boolean };
  if (w.__pulseDomPatched) return;
  w.__pulseDomPatched = true;
  const origRemove = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return origRemove.call(this, child) as T;
  };
  const origInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return origInsert.call(this, node, null) as T;
    return origInsert.call(this, node, ref) as T;
  };
};

const loadGoogleTranslate = () => {
  if (document.getElementById('google-translate-script')) return;
  patchDomForTranslation();
  const holder = document.createElement('div');
  holder.id = 'google_translate_element';
  holder.style.display = 'none';
  document.body.appendChild(holder);
  const w = window as unknown as Record<string, unknown> & { google?: { translate?: { TranslateElement: new (o: object, id: string) => unknown } } };
  w.googleTranslateElementInit = () => {
    if (w.google?.translate) new w.google.translate.TranslateElement({ pageLanguage: 'pt', includedLanguages: 'en,pt', autoDisplay: false }, 'google_translate_element');
  };
  const script = document.createElement('script');
  script.id = 'google-translate-script';
  script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  script.async = true;
  document.body.appendChild(script);
};

/** Chamado na abertura do app: reaplica o idioma salvo. */
export const initAutoTranslate = () => {
  if (typeof window === 'undefined') return;
  if (getLang() === 'en') {
    setGoogCookie('/pt/en');
    loadGoogleTranslate();
  } else {
    setGoogCookie(null);
  }
};

export const setLang = (lang: Lang) => {
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  listeners.forEach(l => l());
  // Recarrega para o tradutor aplicar (ou remover) a tradução em todas as telas.
  setGoogCookie(lang === 'en' ? '/pt/en' : null);
  window.location.reload();
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
      className="notranslate gap-1 text-xs font-semibold"
      aria-label={lang === 'en' ? 'Mudar para português' : 'Switch to English'}
      onClick={() => setLang(lang === 'en' ? 'pt' : 'en')}
      translate="no"
    >
      <Languages size={14} /> {lang === 'en' ? 'EN' : 'PT'}
    </Button>
  );
}
