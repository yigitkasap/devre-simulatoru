// Kütüphane şeridindeki "Son" bölümü: en son yerleştirilen parça türleri (en çok 4). Tarayıcıda
// saklanır; depolamaya erişilemezse yalnızca bu oturumda tutulur.

import { useCallback, useState } from 'react';
import { CATALOG } from '../model/catalog';
import type { DeviceType } from '../sim/netlist';

const STORAGE_KEY = 'devre-simulatoru:son-parcalar';
const LIMIT = 4;
/** Henüz parça yerleştirilmemişse (tasarım: C-Kutuphane şeridi). */
const DEFAULT_RECENT: readonly DeviceType[] = ['resistor', 'led', 'battery', 'oscilloscope'];

function load(): DeviceType[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [...DEFAULT_RECENT];
    const types = parsed.filter((t): t is DeviceType => typeof t === 'string' && t in CATALOG);
    return types.length > 0 ? types.slice(0, LIMIT) : [...DEFAULT_RECENT];
  } catch {
    return [...DEFAULT_RECENT];
  }
}

export function useRecentParts(): [readonly DeviceType[], (type: DeviceType) => void] {
  const [recent, setRecent] = useState<DeviceType[]>(load);
  const remember = useCallback((type: DeviceType) => {
    setRecent((current) => {
      if (current[0] === type) return current;
      const next = [type, ...current.filter((t) => t !== type)].slice(0, LIMIT);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Depolama kapalı: liste yalnızca bu oturumda tutulur.
      }
      return next;
    });
  }, []);
  return [recent, remember];
}
