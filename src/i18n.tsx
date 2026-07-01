// i18n.tsx — minimal two-locale (en/ru) support. No library: a single locale
// value carried in a React context, plus t(en, ru) helpers that pick a string
// by the active locale. Both arguments are required, so tsc flags any call site
// missing the Russian text — a half-translated string is a compile error.
//
// Resolution order (detectLang): explicit override in localStorage → Telegram
// user's language_code (ru* → ru) → the browser's navigator.language → 'en'.
// An explicit choice wins over auto-detection and survives reload, so a user who
// picks EN inside a RU Telegram client stays on EN.
import React, { createContext, useCallback, useContext, useState } from 'react';
import { telegramLanguageCode } from './telegram';

export type Lang = 'en' | 'ru';

const STORAGE_KEY = 'agnt.lang';

function isRu(code: string | null | undefined): boolean {
  return !!code && code.toLowerCase().startsWith('ru');
}

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch { /* storage blocked (private mode) — fall through to auto-detection */ }
  const code = telegramLanguageCode()
    ?? (typeof navigator !== 'undefined' ? navigator.language : null);
  return isRu(code) ? 'ru' : 'en';
}

interface LangCtx { lang: Lang; setLang: (l: Lang) => void }
const Ctx = createContext<LangCtx>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore — choice is still live for this session */ }
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

// The active locale + a setter for the switcher.
export function useLang(): LangCtx {
  return useContext(Ctx);
}

// Hook form for components: `const t = useT();  t('Save', 'Сохранить')`.
export function useT(): (en: string, ru: string) => string {
  const { lang } = useContext(Ctx);
  return useCallback((en: string, ru: string) => (lang === 'ru' ? ru : en), [lang]);
}

// Value form for module-scope maps / non-component helpers that already hold a
// Lang value (hooks can't run there): `tr(lang, 'Live', 'В эфире')`.
export function tr(lang: Lang, en: string, ru: string): string {
  return lang === 'ru' ? ru : en;
}
