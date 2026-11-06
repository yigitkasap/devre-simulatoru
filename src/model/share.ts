// Paylaşım bağlantısı: devre JSON'u lz-string ile sıkıştırılıp URL'nin # kısmına yazılır
// (#d=...). Sunucuya hiçbir şey gönderilmez; bağlantıyı açan tarayıcı devreyi kendisi çözer.
// Analizin grafikleri (analiz v2) devrenin yanında "analysis" alanında gelir.

import * as lzModule from 'lz-string';
import { EMPTY_ANALYSIS, parseAnalysis, type AnalysisDoc } from './analysis';
import { parseDoc, serializeDoc } from './serialize';
import type { CircuitDoc } from './types';

// lz-string bir CommonJS paketi: paketleyici adlandırılmış dışa aktarımları verir,
// Node ise yalnızca varsayılan dışa aktarımı. İkisinde de çalışsın diye ikisine de bakılır.
type LzString = typeof lzModule;
const lz: LzString = (lzModule as unknown as { default?: LzString }).default ?? lzModule;

const HASH_KEY = 'd=';

export function encodeDoc(doc: CircuitDoc, analysis?: AnalysisDoc): string {
  return lz.compressToEncodedURIComponent(serializeDoc(doc, analysis));
}

/** Bağlantıdaki devre ve (varsa) analizi. */
export interface Shared {
  readonly doc: CircuitDoc;
  readonly analysis: AnalysisDoc;
}

export function decodeShared(data: string): Shared | null {
  try {
    const json = lz.decompressFromEncodedURIComponent(data);
    if (!json) return null;
    const raw: unknown = JSON.parse(json);
    const doc = parseDoc(raw);
    if (!doc) return null;
    const analysis = typeof raw === 'object' && raw !== null && 'analysis' in raw ? parseAnalysis((raw as { analysis: unknown }).analysis) : EMPTY_ANALYSIS;
    return { doc, analysis };
  } catch {
    return null;
  }
}

export function decodeDoc(data: string): CircuitDoc | null {
  return decodeShared(data)?.doc ?? null;
}

/** Sayfa adresi (# kısmı hariç), devre ve (verilirse) analizden paylaşım bağlantısı. */
export function shareUrl(doc: CircuitDoc, pageUrl: string, analysis?: AnalysisDoc): string {
  return `${pageUrl.split('#')[0]}#${HASH_KEY}${encodeDoc(doc, analysis)}`;
}

/**
 * Adresin # kısmındaki devreyi ve analizi okur.
 * @returns undefined: bağlantıda devre yok; null: devre var ama okunamadı.
 */
export function sharedFromHash(hash: string): Shared | null | undefined {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment.startsWith(HASH_KEY)) return undefined;
  return decodeShared(fragment.slice(HASH_KEY.length));
}

/** Adresin # kısmındaki devre (analizsiz). */
export function docFromHash(hash: string): CircuitDoc | null | undefined {
  const shared = sharedFromHash(hash);
  return shared === undefined ? undefined : (shared?.doc ?? null);
}
