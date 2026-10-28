// Direnç renk kodu (three'siz, saf hesap): 4 halka, iki basamak + çarpan + %5 altın tolerans.
// 3B modeldeki halkalar (kit.ts), lehim rehberi (guide.ts) ve defterdeki direnç kartı aynı kodu kullanır.

export const BAND_NAMES = ['siyah', 'kahverengi', 'kırmızı', 'turuncu', 'sarı', 'yeşil', 'mavi', 'mor', 'gri', 'beyaz'];
const BAND_COLORS = ['#1a1a1a', '#7a4a2a', '#d0412f', '#e8892f', '#efc540', '#3f8f45', '#2f62b8', '#7e4fb4', '#8b8f95', '#f4f4f2'];
const GOLD = '#c9a54a';
const SILVER = '#c0c4c8';

/** İki basamak ve 10'un kuvveti (çarpan); 4,7 kΩ → [47, 2]. */
function digitsOf(ohms: number): [number, number] {
  let exponent = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exponent);
  if (digits >= 100) {
    digits = Math.round(digits / 10);
    exponent += 1;
  }
  return [digits, exponent];
}

/** Halkaların renkleri (3B model ve defter). */
export function resistorBands(ohms: number): string[] {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return [BAND_COLORS[0]!, BAND_COLORS[0]!, BAND_COLORS[0]!, GOLD];
  const [digits, exponent] = digitsOf(ohms);
  const multiplier = exponent < 0 ? (exponent === -1 ? GOLD : SILVER) : (BAND_COLORS[Math.min(9, exponent)] ?? BAND_COLORS[0]!);
  return [BAND_COLORS[Math.floor(digits / 10)]!, BAND_COLORS[digits % 10]!, multiplier, GOLD];
}

/** Halkaların adları: "kırmızı–kırmızı–kahverengi–altın". */
export function resistorColorCode(ohms: number): string {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return '';
  const [digits, exponent] = digitsOf(ohms);
  const multiplier = exponent === -1 ? 'altın' : exponent === -2 ? 'gümüş' : (BAND_NAMES[exponent] ?? '?');
  return `${BAND_NAMES[Math.floor(digits / 10)]}–${BAND_NAMES[digits % 10]}–${multiplier}–altın`;
}
