// Gerilime göre kablo rengi: mavi (negatif) → yeşil (0 V) → kırmızı (pozitif).
// Ton (hue) üzerinden geçiş yapılır: yeşil 140°, sarı/turuncu üzerinden kırmızı 0°, camgöbeği
// üzerinden mavi 220°. Ölçek, devredeki en büyük kaynak gerilimidir.

const HUE_ZERO = 140;
const HUE_POSITIVE = 0;
const HUE_NEGATIVE = 220;

export function voltageHue(ratio: number): number {
  const t = Math.max(-1, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return t >= 0 ? HUE_ZERO + (HUE_POSITIVE - HUE_ZERO) * t : HUE_ZERO + (HUE_NEGATIVE - HUE_ZERO) * -t;
}

export function voltageColor(ratio: number): string {
  return `hsl(${voltageHue(ratio).toFixed(0)} 75% 40%)`;
}

/** Renk açıklaması için CSS degradesi (soldan sağa −Vmax … +Vmax). */
export const VOLTAGE_GRADIENT = `linear-gradient(to right, ${[-1, -0.5, 0, 0.25, 0.5, 0.75, 1]
  .map((r) => voltageColor(r))
  .join(', ')})`;

/** Gerilimi bilinmeyen (devreye bağlı olmayan) kablolar. */
export const UNKNOWN_WIRE_COLOR = '#9aa3ad';

/** Akım noktalarının rengi. */
export const CURRENT_DOT_COLOR = '#ffd43b';
