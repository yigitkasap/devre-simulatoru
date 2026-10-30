// Devrenin tarayıcıya otomatik kaydı (localStorage). Okuma ve yazma try/catch içinde;
// depolamaya erişilemezse (gizli pencere, kapalı site verisi) çalışmaya devam edilir ve üst
// çubuktaki kayıt durumu "Kaydedilemedi" olur.

import { useEffect, useRef, useState } from 'react';
import { EMPTY_ANALYSIS, parseAnalysis, type AnalysisDoc } from '../model/analysis';
import { parseDoc, serializeDoc } from '../model/serialize';
import type { CircuitDoc } from '../model/types';

const STORAGE_KEY = 'devre-simulatoru:devre';
const SAVE_DELAY_MS = 400;

/** Son kayıt denemesinin sonucu. */
export type SaveState = 'saved' | 'failed';

export function loadSavedDoc(): CircuitDoc | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Kayıtlı devrenin analiz bölümü (izler, ölçüm tablosu); yoksa boş. */
export function loadSavedAnalysis(): AnalysisDoc {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseAnalysis((JSON.parse(raw) as { analysis?: unknown }).analysis) : EMPTY_ANALYSIS;
  } catch {
    return EMPTY_ANALYSIS;
  }
}

function save(doc: CircuitDoc, analysis: AnalysisDoc): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeDoc(doc, analysis));
    return true;
  } catch {
    // Depolama kapalı ya da dolu: kayıt yapılamaz, çalışmaya devam edilir.
    return false;
  }
}

/** Belge (ya da analiz bölümü) değiştikçe kısa bir gecikmeyle kaydeder; sayfa kapanırken bekleyen kaydı hemen yazar. */
export function useAutosave(doc: CircuitDoc, analysis: AnalysisDoc = EMPTY_ANALYSIS): SaveState {
  const latest = useRef({ doc, analysis });
  const pending = useRef(false);
  const [state, setState] = useState<SaveState>('saved');
  latest.current = { doc, analysis };

  useEffect(() => {
    pending.current = true;
    const timer = window.setTimeout(() => {
      pending.current = false;
      setState(save(doc, analysis) ? 'saved' : 'failed');
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [doc, analysis]);

  useEffect(() => {
    const flush = () => {
      if (pending.current) {
        pending.current = false;
        save(latest.current.doc, latest.current.analysis);
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  return state;
}
