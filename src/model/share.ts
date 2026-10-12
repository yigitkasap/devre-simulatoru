// Paylaşım bağlantısı: devre JSON'u lz-string ile sıkıştırılıp URL'nin # kısmına yazılır
// (#d=...). Sunucuya hiçbir şey gönderilmez; bağlantıyı açan tarayıcı devreyi kendisi çözer.

import * as lzModule from 'lz-string';
import { parseDoc, serializeDoc } from './serialize';
import type { CircuitDoc } from './types';

// lz-string bir CommonJS paketi: paketleyici adlandırılmış dışa aktarımları verir,
// Node ise yalnızca varsayılan dışa aktarımı. İkisinde de çalışsın diye ikisine de bakılır.
type LzString = typeof lzModule;
const lz: LzString = (lzModule as unknown as { default?: LzString }).default ?? lzModule;

const HASH_KEY = 'd=';

export function encodeDoc(doc: CircuitDoc): string {
  return lz.compressToEncodedURIComponent(serializeDoc(doc));
}

export function decodeDoc(data: string): CircuitDoc | null {
  try {
    const json = lz.decompressFromEncodedURIComponent(data);
    return json ? parseDoc(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

/** Sayfa adresi (# kısmı hariç) ve devreden paylaşım bağlantısı. */
export function shareUrl(doc: CircuitDoc, pageUrl: string): string {
  return `${pageUrl.split('#')[0]}#${HASH_KEY}${encodeDoc(doc)}`;
}

/**
 * Adresin # kısmındaki devreyi okur.
 * @returns undefined: bağlantıda devre yok; null: devre var ama okunamadı.
 */
export function docFromHash(hash: string): CircuitDoc | null | undefined {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment.startsWith(HASH_KEY)) return undefined;
  return decodeDoc(fragment.slice(HASH_KEY.length));
}
