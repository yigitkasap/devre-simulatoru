// Renk teması: Sistem (cihazın açık / koyu ayarı), Açık ya da Koyu. Sonuç <html data-theme> ile
// uygulanır; renkler global.css'teki belirteçlerin koyu karşılıklarından gelir. Sayfa açılırken
// yanıp sönmesin diye aynı karar BaseLayout.astro'daki küçük betikte React'ten önce de verilir.

import { useEffect, useLayoutEffect, useState } from 'react';
import { setColorTheme } from './colors';
import type { ThemeChoice } from './settings';

export type Theme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';
/** Tarayıcı çubuğunun rengi (--color-app). */
const THEME_COLORS: Record<Theme, string> = { light: '#eef0f3', dark: '#0e1318' };

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches === true;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  setColorTheme(theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

/** Seçimi uygular; Sistem'de cihazın ayarı değişince izler. Uygulanan temayı döndürür. */
export function useTheme(choice: ThemeChoice): Theme {
  const [dark, setDark] = useState(systemDark);
  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query) return undefined;
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const theme: Theme = choice === 'system' ? (dark ? 'dark' : 'light') : choice;
  // Kablo renkleri bu çizimde hesaplanır: bayrak çizimden önce ayarlanır.
  setColorTheme(theme === 'dark');
  useLayoutEffect(() => applyTheme(theme), [theme]);
  return theme;
}
