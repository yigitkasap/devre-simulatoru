// Devrenin tarayıcıya otomatik kaydı (localStorage). Okuma ve yazma try/catch içinde;
// depolamaya erişilemezse (gizli pencere, kapalı site verisi) sessizce devam edilir.

import { useEffect, useRef } from 'react';
import { parseDoc, serializeDoc } from '../model/serialize';
import type { CircuitDoc } from '../model/types';

const STORAGE_KEY = 'devre-simulatoru:devre';
const SAVE_DELAY_MS = 400;

export function loadSavedDoc(): CircuitDoc | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function save(doc: CircuitDoc): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeDoc(doc));
  } catch {
    // Depolama kapalı ya da dolu: kayıt yapılamaz, çalışmaya devam edilir.
  }
}

/** Belge değiştikçe kısa bir gecikmeyle kaydeder; sayfa kapanırken bekleyen kaydı hemen yazar. */
export function useAutosave(doc: CircuitDoc): void {
  const latest = useRef(doc);
  const pending = useRef(false);
  latest.current = doc;

  useEffect(() => {
    pending.current = true;
    const timer = window.setTimeout(() => {
      pending.current = false;
      save(doc);
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [doc]);

  useEffect(() => {
    const flush = () => {
      if (pending.current) {
        pending.current = false;
        save(latest.current);
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
}
