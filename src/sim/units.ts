// Değer girişi (SI önekleri) ve Türkçe sayı biçimi.
//
// Ayrıştırma kuralları:
//   - Önekler: p, n, µ (ya da u), m, k, M, G. Büyük-küçük harf önemlidir: M mega, m mili.
//     "K" de kilo kabul edilir (başka bir anlamı olmadığı için).
//   - Ondalık ayırıcı virgül ya da nokta olabilir: "4,7k" = "4.7k" = 4700.
//   - Elektronikteki "4k7" yazımı da kabul edilir (= 4,7k).
//   - Sondaki birim isteğe bağlıdır: "4,7 kΩ", "100 µF", "9 V", "50 Hz".

export type UnitSymbol = 'Ω' | 'V' | 'A' | 'F' | 'W' | 's' | 'Hz' | 'A/V²';

export type ParseError = 'empty' | 'invalid' | 'wrong-unit';
export type ParseResult = { ok: true; value: number } | { ok: false; error: ParseError };

const PREFIX_MULTIPLIERS: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  'µ': 1e-6, // U+00B5 mikro işareti
  'μ': 1e-6, // U+03BC Yunanca mü
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};

/** Her birim için kabul edilen yazımlar (küçük harfe çevrilerek karşılaştırılır). */
const UNIT_ALIASES: Record<UnitSymbol, string[]> = {
  'Ω': ['ω', 'ohm', 'ohms'], // Ω (U+03A9) ve Ω (U+2126) küçük harfe çevrilince ω olur
  V: ['v', 'volt'],
  A: ['a', 'amper', 'ampere'],
  F: ['f', 'farad'],
  W: ['w', 'watt'],
  s: ['s', 'sn', 'saniye'],
  Hz: ['hz', 'hertz'],
  'A/V²': ['a/v²', 'a/v2', 'a/v^2'],
};

const PREFIX_CLASS = 'pnuµμmkKMG';
const NUMBER_RE = new RegExp(`^([+-]?)(\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:[eE]([+-]?\\d+))?([${PREFIX_CLASS}])?$`);
const RKM_RE = new RegExp(`^([+-]?)(\\d+)([${PREFIX_CLASS}])(\\d+)$`);

function stripUnit(s: string, unit: UnitSymbol | undefined): { rest: string; foreignUnit: boolean } {
  const lower = s.toLowerCase();
  if (unit) {
    // Uzun yazımlar önce denensin ("ohm" içindeki "m" önek sanılmasın).
    const aliases = [...UNIT_ALIASES[unit]].sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
      if (lower.endsWith(alias) && s.length > alias.length) {
        return { rest: s.slice(0, s.length - alias.length), foreignUnit: false };
      }
    }
  }
  // Başka bir birimle mi bitiyor? ("4,7 kV" bir direnç alanına yazılmışsa)
  // Alanın birimi verilmemişse her birim kabul edilir.
  for (const [symbol, aliases] of Object.entries(UNIT_ALIASES) as [UnitSymbol, string[]][]) {
    if (symbol === unit) continue;
    for (const alias of aliases) {
      if (lower.endsWith(alias) && s.length > alias.length) {
        const rest = s.slice(0, s.length - alias.length);
        // Kalan kısım bir sayı değilse bu bir birim değildir.
        if (NUMBER_RE.test(rest) || RKM_RE.test(rest)) return { rest, foreignUnit: unit !== undefined };
      }
    }
  }
  return { rest: s, foreignUnit: false };
}

/**
 * Kullanıcının yazdığı değeri sayıya çevirir.
 * @param unit Alanın birimi; verilirse sondaki bu birim yok sayılır, başka bir birim hata verir.
 */
export function parseValue(input: string, unit?: UnitSymbol): ParseResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };
  // Sayı ile önek/birim arasındaki boşluk serbest ("4,7 kΩ"), rakamlar arasındaki değil ("1 2").
  if (/[\d.,]\s+[\d.,]/.test(trimmed)) return { ok: false, error: 'invalid' };
  const compact = trimmed.replace(/\s+/g, '').replace(/−/g, '-');

  const { rest, foreignUnit } = stripUnit(compact, unit);
  if (foreignUnit) return { ok: false, error: 'wrong-unit' };

  const m = NUMBER_RE.exec(rest);
  if (m) {
    const [, sign, digits = '', exponent, prefix] = m;
    let value = Number(digits.replace(',', '.'));
    if (exponent !== undefined) value *= 10 ** Number(exponent);
    if (prefix !== undefined) value *= PREFIX_MULTIPLIERS[prefix] ?? 1;
    if (sign === '-') value = -value;
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, error: 'invalid' };
  }

  const rkm = RKM_RE.exec(rest);
  if (rkm) {
    const [, sign, whole = '', prefix = '', fraction = ''] = rkm;
    let value = Number(`${whole}.${fraction}`) * (PREFIX_MULTIPLIERS[prefix] ?? 1);
    if (sign === '-') value = -value;
    return { ok: true, value };
  }

  return { ok: false, error: 'invalid' };
}

// ---------------------------------------------------------------------------
// Biçimlendirme

const PREFIX_SYMBOLS: Record<number, string> = {
  [-12]: 'p',
  [-9]: 'n',
  [-6]: 'µ',
  [-3]: 'm',
  0: '',
  3: 'k',
  6: 'M',
  9: 'G',
};

/** Ekranda eksi işareti olarak tipografik "−" kullanılır. */
const MINUS = '−';

/** Bu değerin altındaki büyüklükler sıfır gösterilir (sayısal gürültü). */
const DISPLAY_ZERO = 1e-15;

export interface FormatOptions {
  /** Anlamlı basamak sayısı (varsayılan 3). */
  digits?: number;
  /** Sondaki sıfırları at: "4,70 kΩ" yerine "4,7 kΩ" (varsayılan false). */
  trim?: boolean;
  /** Pozitif değerlerin önüne "+" koy. */
  plusSign?: boolean;
}

function toTurkishDecimal(text: string): string {
  return text.replace('.', ',');
}

function trimZeros(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Bir değeri SI önekiyle, Türkçe ondalık virgülüyle yazar.
 * Örnek: formatSI(4700, 'Ω', { trim: true }) → "4,7 kΩ"; formatSI(0.00961, 'A') → "9,61 mA".
 */
export function formatSI(value: number, unit: string, options: FormatOptions = {}): string {
  const digits = options.digits ?? 3;
  const trim = options.trim ?? false;
  const unitPart = unit ? ` ${unit}` : '';

  if (Number.isNaN(value)) return `—${unitPart}`;
  if (!Number.isFinite(value)) return `${value < 0 ? MINUS : ''}∞${unitPart}`;

  const abs = Math.abs(value);
  if (abs < DISPLAY_ZERO) {
    const zero = trim || digits <= 1 ? '0' : `0.${'0'.repeat(digits - 1)}`;
    return `${toTurkishDecimal(zero)}${unitPart}`;
  }

  let exp3 = Math.floor(Math.log10(abs) / 3) * 3;
  exp3 = Math.min(9, Math.max(-12, exp3));
  let text = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const mantissa = abs / 10 ** exp3;
    const intDigits = mantissa >= 1 ? Math.floor(Math.log10(mantissa)) + 1 : 1;
    let decimals = Math.max(0, digits - intDigits);
    text = mantissa.toFixed(decimals);
    // Yuvarlama bir basamak eklediyse (9,9999 → 10,000) anlamlı basamak sayısını koru: 10,00.
    if (decimals > 0 && Number(text) >= 10 ** intDigits) {
      decimals -= 1;
      text = mantissa.toFixed(decimals);
    }
    // Yuvarlama 1000'e ulaştıysa bir üst öneke geç (999,96 → 1,00 k).
    if (Number(text) >= 1000 && exp3 < 9) {
      exp3 += 3;
      continue;
    }
    break;
  }
  if (trim) text = trimZeros(text);
  const sign = value < 0 ? MINUS : options.plusSign ? '+' : '';
  return `${sign}${toTurkishDecimal(text)} ${PREFIX_SYMBOLS[exp3] ?? ''}${unit}`.replace(/ $/, '');
}

/** Öneksiz Türkçe sayı: formatNumber(4.7, 2) → "4,70". */
export function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? '—' : value < 0 ? `${MINUS}∞` : '∞';
  const text = Math.abs(value).toFixed(decimals);
  const sign = value < 0 && Number(text) !== 0 ? MINUS : '';
  return `${sign}${toTurkishDecimal(text)}`;
}

/** Bir değerin, kullanıcının özellik penceresinde düzenleyebileceği kısa yazımı: 4700 → "4,7k". */
export function formatEditable(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 0.1 && abs < 1000) return toTurkishDecimal(String(Number(value.toPrecision(6))));
  let exp3 = Math.floor(Math.log10(abs) / 3) * 3;
  exp3 = Math.min(9, Math.max(-12, exp3));
  const mantissa = Number((abs / 10 ** exp3).toPrecision(6));
  const prefix = PREFIX_SYMBOLS[exp3] ?? '';
  return `${value < 0 ? '-' : ''}${toTurkishDecimal(String(mantissa))}${prefix}`;
}
