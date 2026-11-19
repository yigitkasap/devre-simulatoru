// Ölçüm tablosunun birimi (tablo-birim, 2026-11-19): açılır listedeki önekli birimler (mA, kΩ, µs…), birime göre
// ölçekleme ve "Diğer…" ile serbest metin. Satırın ölçülen değeri içeride hep SI'dır (A, V, s); birim yalnızca
// gösterimi ve öğrencinin yazdığı sayının anlamını belirler: mA seçip 4,3 yazmak 0,0043 A demektir. % hata iki SI
// değerden hesaplanır, birimden bağımsızdır.

import { tr } from '../../i18n/tr';
import { formatSI, parseValue } from '../../sim/units';

export interface UnitDef {
  readonly symbol: string;
  /** SI temel birimi ("mA" → "A"). */
  readonly base: string;
  /** Birimdeki 1, temel birimde kaç eder ("mA" → 0,001). */
  readonly factor: number;
}

const u = (symbol: string, base: string, factor: number): UnitDef => ({ symbol, base, factor });

/** Açılır listenin grupları (büyüklüğe göre). */
export const UNIT_GROUPS: readonly { readonly key: keyof typeof tr.analysis.table.unitGroups; readonly units: readonly UnitDef[] }[] = [
  { key: 'voltage', units: [u('µV', 'V', 1e-6), u('mV', 'V', 1e-3), u('V', 'V', 1), u('kV', 'V', 1e3)] },
  { key: 'current', units: [u('nA', 'A', 1e-9), u('µA', 'A', 1e-6), u('mA', 'A', 1e-3), u('A', 'A', 1)] },
  { key: 'resistance', units: [u('Ω', 'Ω', 1), u('kΩ', 'Ω', 1e3), u('MΩ', 'Ω', 1e6)] },
  { key: 'power', units: [u('µW', 'W', 1e-6), u('mW', 'W', 1e-3), u('W', 'W', 1)] },
  {
    key: 'other',
    units: [
      u('Hz', 'Hz', 1), u('kHz', 'Hz', 1e3),
      u('s', 's', 1), u('ms', 's', 1e-3), u('µs', 's', 1e-6),
      u('F', 'F', 1), u('µF', 'F', 1e-6), u('nF', 'F', 1e-9), u('pF', 'F', 1e-12),
      u('H', 'H', 1), u('mH', 'H', 1e-3),
      u('°C', '°C', 1), u('%', '%', 1),
    ],
  },
];

const BY_SYMBOL: ReadonlyMap<string, UnitDef> = new Map(UNIT_GROUPS.flatMap((g) => g.units.map((d) => [d.symbol, d] as const)));
// "u" ile yazılan mikro (klavyede µ yok) ve Yunan mü (U+03BC) aynı birim sayılır.
const normalize = (s: string) => s.trim().replace(/^[uμ](?=[VAWsF])/, 'µ');

/** Listede olan birim; değilse (boş ya da serbest metin) null. */
export const unitDef = (unit: string): UnitDef | null => BY_SYMBOL.get(normalize(unit)) ?? null;
export const isListedUnit = (unit: string): boolean => unitDef(unit) !== null;

/**
 * Ölçülen değerin büyüklüğüne uygun önekli birim: temel birimi `base` olan liste birimlerinden değeri 1 ile
 * 1000 arasına getiren (ör. 0,0044 A → mA). Listede o temel birim yoksa temel birimin kendisi ("" eğim için).
 */
export function autoUnit(base: string, value: number): string {
  const cands = [...BY_SYMBOL.values()].filter((d) => d.base === base).sort((a, b) => a.factor - b.factor);
  if (cands.length === 0) return base;
  const abs = Math.abs(value);
  if (!(abs > 0) || !Number.isFinite(abs)) return cands.find((d) => d.factor === 1)?.symbol ?? cands[0]!.symbol;
  let pick = cands[0]!;
  for (const d of cands) if (abs >= d.factor * (1 - 1e-9)) pick = d;
  return pick.symbol;
}

/** Satırın biriminin temel birimi (listedeyse), serbest metinse kendisi. */
export const baseOf = (unit: string): string => unitDef(unit)?.base ?? unit.trim();

const BARE = /^[+\-−]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+\-−]?\d+)?$/;

/**
 * Öğrencinin yazdığı değer (teorik, laboratuvar) SI olarak. Yalın sayı seçili birimdedir (mA + "4,3" → 0,0043);
 * önek ya da birim yazılmışsa yazılan geçerlidir ("4,3 mA", "4,3m", "2 V" → 2). Okunamazsa null.
 */
export function parseInUnit(text: string, unit: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const def = unitDef(unit);
  const factor = def?.factor ?? 1;
  const base = def?.base ?? unit.trim();
  if (BARE.test(t.replace(/\s+/g, ''))) {
    const p = parseValue(t);
    return p.ok ? p.value * factor : null;
  }
  let rest = t;
  for (const suffix of [def?.symbol ?? '', base].filter((s) => s.length > 0)) {
    if (rest.endsWith(suffix)) {
      rest = rest.slice(0, -suffix.length).trim();
      // Birimin kendisi yazıldıysa (ör. mA seçili, "4,3 mA") sayı o birimdedir.
      if (suffix === def?.symbol && BARE.test(rest.replace(/\s+/g, ''))) {
        const p = parseValue(rest);
        return p.ok ? p.value * factor : null;
      }
      break;
    }
  }
  if (rest === '') return null;
  const p = parseValue(rest);
  if (p.ok) return p.value;
  const q = parseValue(t);
  return q.ok ? q.value : null;
}

/** SI değeri seçili birimde (4 anlamlı basamak, ondalık virgül): 0,004442 A + mA → "4,442 mA". */
export function formatInUnit(value: number, unit: string, digits = 4): string {
  const def = unitDef(unit);
  if (!def) return formatSI(value, unit.trim(), { digits });
  const x = value / def.factor;
  const abs = Math.abs(x);
  // Seçili birimde çok küçük ya da çok büyük kalan değer önekli yazılır (ör. mA seçili, 3 nA).
  if (!Number.isFinite(x) || (abs !== 0 && (abs < 1e-3 || abs >= 1e6))) return formatSI(value, def.base, { digits });
  const intDigits = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 1;
  const decimals = abs > 0 && abs < 1 ? digits - 1 - Math.floor(Math.log10(abs)) : Math.max(0, digits - intDigits);
  const text = x.toFixed(Math.min(decimals, 8)).replace('-', '−').replace('.', ',');
  return `${text} ${def.symbol}`;
}

/** Seçili birimdeki sayı (CSV için; birim ayrı sütunda). */
export const inUnit = (value: number, unit: string): number => value / (unitDef(unit)?.factor ?? 1);
