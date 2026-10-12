// Kullanıcı ayarları; tarayıcıda saklanır. Depolamaya erişilemezse varsayılanlarla sessizce devam edilir.

import { useCallback, useState } from 'react';

export type ResistorStyle = 'zigzag' | 'iec';

export interface Settings {
  readonly resistorStyle: ResistorStyle;
  /** Akım noktaları elektronların hareket yönünde (geleneksel akımın tersine) gitsin. */
  readonly electronFlow: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  resistorStyle: 'zigzag',
  electronFlow: false,
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
