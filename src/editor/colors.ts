// Gerilime göre kablo rengi. Ölçek, devredeki en büyük kaynak (tepe) gerilimidir: oran −1 … +1.
//
// Klasik ölçek (varsayılan): mavi (−) → yeşil (0 V) → sarı/turuncu → kırmızı (+), HSL tonu
// üzerinden: 0 V'ta 140°, +Vmax'ta 0°, −Vmax'ta 220°; doygunluk %75. Yeşil ve sarı-yeşil tonlar
// (45°–200°) açık kağıtta seçilsin diye daha koyu çizilir (açıklık %32, öbürleri %40); böylece her
// ton kağıtta en az 3,5:1 kontrast verir (tasarım: DS-Renk, tokens.css → --color-v-*).
// Renk körlüğüne uygun ölçek: mavi – gri – turuncu; kırmızı-yeşil ayrımı gerektirmez. Durakları
// arasında sRGB'de doğrusal geçiş yapılır.
// Koyu temada (theme.ts) aynı tonlar koyu kağıtta seçilsin diye daha açık çizilir (doygunluk %60,
// açıklık %56 / %62; renk körlüğü ölçeğinde açık duraklar).

export type WireScale = 'classic' | 'colorblind';

const HUE_ZERO = 140;
const HUE_POSITIVE = 0;
const HUE_NEGATIVE = 220;

/** Koyu tema açık mı (theme.ts ayarlar; ilk değer sayfanın başındaki betiğin koyduğu data-theme). */
let dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

export function setColorTheme(isDark: boolean): void {
  dark = isDark;
}

function clampRatio(ratio: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
}

export function voltageHue(ratio: number): number {
  const t = clampRatio(ratio);
  return t >= 0 ? HUE_ZERO + (HUE_POSITIVE - HUE_ZERO) * t : HUE_ZERO + (HUE_NEGATIVE - HUE_ZERO) * -t;
}

function classicColor(ratio: number): string {
  const hue = voltageHue(ratio);
  const band = hue > 45 && hue <= 200;
  if (dark) return `hsl(${hue.toFixed(0)} 60% ${band ? 56 : 62}%)`;
  return `hsl(${hue.toFixed(0)} 75% ${band ? 32 : 40}%)`;
}

/** Renk körlüğüne uygun ölçeğin durakları (oran, renk). */
const COLORBLIND_STOPS: ReadonlyArray<readonly [number, string]> = [
  [-1, '#2b56ab'],
  [-0.5, '#6b84b8'],
  [0, '#7a828c'],
  [0.5, '#b9762f'],
  [1, '#c45a0a'],
];
const COLORBLIND_STOPS_DARK: ReadonlyArray<readonly [number, string]> = [
  [-1, '#6f95e0'],
  [-0.5, '#97aad6'],
  [0, '#9aa3ad'],
  [0.5, '#d9a066'],
  [1, '#f08a3c'],
];

function hexChannels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function colorblindColor(ratio: number): string {
  const t = clampRatio(ratio);
  const stops = dark ? COLORBLIND_STOPS_DARK : COLORBLIND_STOPS;
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1]![0]) i++;
  const [r0, c0] = stops[i]!;
  const [r1, c1] = stops[i + 1]!;
  const f = (t - r0) / (r1 - r0);
  const a = hexChannels(c0);
  const b = hexChannels(c1);
  const mix = a.map((v, k) => Math.round(v + (b[k]! - v) * f));
  return `rgb(${mix[0]} ${mix[1]} ${mix[2]})`;
}

export function voltageColor(ratio: number, scale: WireScale = 'classic'): string {
  return scale === 'colorblind' ? colorblindColor(ratio) : classicColor(ratio);
}

/** Klasik ölçekte açıklama degradesinin durakları (tokens.css'teki --color-v-* ile aynı). */
const CLASSIC_LEGEND_STOPS = [-1, -0.5, 0, 0.25, 0.5, 0.75, 1];

/** Renk açıklaması için CSS degradesi (soldan sağa −Vmax … +Vmax). */
export function voltageGradient(scale: WireScale = 'classic'): string {
  const stops = scale === 'colorblind' ? COLORBLIND_STOPS.map(([r]) => r) : CLASSIC_LEGEND_STOPS;
  return `linear-gradient(to right, ${stops.map((r) => voltageColor(r, scale)).join(', ')})`;
}

/** Gerilimi bilinmeyen (devreye bağlı olmayan) kablolar; kesikli çizilir. */
export const UNKNOWN_WIRE_COLOR = 'var(--color-wire-off)';
export const UNKNOWN_WIRE_DASH = '6 5';

/** Akım noktalarının rengi ve koyu kenarı (sarı nokta açık kağıtta kenarsız seçilmiyor). */
export const CURRENT_DOT_COLOR = 'var(--color-dot)';
export const CURRENT_DOT_EDGE = 'var(--color-dot-edge)';
