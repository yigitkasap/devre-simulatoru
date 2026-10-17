// Kullanıcı ayarları; tarayıcıda saklanır. Depolamaya erişilemezse varsayılanlarla sessizce devam edilir.

import { useCallback, useState } from 'react';
import type { WireScale } from './colors';

export type ResistorStyle = 'zigzag' | 'iec';

export interface Settings {
  readonly resistorStyle: ResistorStyle;
  /** Akım noktaları elektronların hareket yönünde (geleneksel akımın tersine) gitsin. */
  readonly electronFlow: boolean;
  /** Kablo gerilimi renk ölçeği: klasik ya da renk körlüğüne uygun (mavi – gri – turuncu). */
  readonly wireScale: WireScale;
  /** Simülasyon çalışırken her düğümün yanında gerilim etiketi (M11). */
  readonly nodeVoltages: boolean;
  /** Akım noktaları gösterilsin (M11). */
  readonly currentDots: boolean;
  /** Simülasyon çalışırken kabloların ve bobinlerin manyetik alanı gösterilsin. */
  readonly magneticField: boolean;
  /** Hoparlör ve buzzerin sesi çalınsın. */
  readonly sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  resistorStyle: 'zigzag',
  electronFlow: false,
  wireScale: 'classic',
  nodeVoltages: false,
  currentDots: true,
  magneticField: false,
  sound: true,
};

const STORAGE_KEY = 'devre-simulatoru:ayarlar';

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;
    const record = parsed as Record<string, unknown>;
    return {
      resistorStyle: record.resistorStyle === 'iec' ? 'iec' : 'zigzag',
      electronFlow: record.electronFlow === true,
      wireScale: record.wireScale === 'colorblind' ? 'colorblind' : 'classic',
      nodeVoltages: record.nodeVoltages === true,
      currentDots: record.currentDots !== false,
      magneticField: record.magneticField === true,
      sound: record.sound !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Depolama kapalı ya da dolu: ayar yalnızca bu oturumda geçerli olur.
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  return [settings, update];
}
