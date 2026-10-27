// Arduino'ya yüklenebilen örnek programlar (önceden derlenmiş; src/arduino/sketches). Türkçe
// adları i18n/tr.ts içindedir (OPTION_LABELS.program).

import { PROGRAMS } from './programs.gen';

/** Program seçme listesindeki sıra: basitten karmaşığa. */
export const ARDUINO_PROGRAM_IDS = [
  'blink',
  'dugme',
  'sayac',
  'trafik-isigi',
  'fade',
  'potansiyometre',
  'gece-lambasi',
  'termometre',
  'pwm-filtre',
  'melodi',
  'role',
] as const;

export type ArduinoProgramId = (typeof ARDUINO_PROGRAM_IDS)[number];

export const ARDUINO_DEFAULT_PROGRAM: ArduinoProgramId = 'blink';

/** Programın Arduino kodu (.ino); bilinmeyen programda boş. */
export function programSource(id: string): string {
  return PROGRAMS[id]?.source ?? '';
}

export function programFlash(id: string): number {
  return PROGRAMS[id]?.flash ?? 0;
}
