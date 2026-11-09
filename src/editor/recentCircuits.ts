// Son devreler: örnek açmak, Yeni devre, dosyadan ya da bağlantıdan açmak kurulu devrenin yerine geçer. Yerine
// geçmeden önce eski devre bu tarayıcıda (localStorage) en çok RECENT_LIMIT kayıtlık bir listeye yazılır;
// Daha fazla → Son devreler (ya da Örnekler penceresindeki Son devreler) listeden geri yükler. Boş devre ve
// hiç değiştirilmemiş örnek kaydedilmez; aynı devre iki kez girmez (yenisi başa geçer). Okuma ve yazma
// try/catch içinde: depolama kapalıysa liste boş kalır, çalışma sürer.

import { EMPTY_ANALYSIS, parseAnalysis, type AnalysisDoc } from '../model/analysis';
import { parseDoc, serializeDoc } from '../model/serialize';
import type { CircuitDoc } from '../model/types';

const STORAGE_KEY = 'devre-simulatoru:son-devreler';
/** Listede en çok bu kadar devre. */
export const RECENT_LIMIT = 5;

export interface RecentEntry {
  /** Kaydedildiği an (ms, Date.now). */
  readonly savedAt: number;
  /** O anki adı (örneğin başlığı, görevin adı ya da "Adsız devre"). */
  readonly title: string;
  readonly parts: number;
  /** Devre ve analiz bölümü (serializeDoc). */
  readonly data: string;
}

function isEntry(v: unknown): v is RecentEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.savedAt === 'number' && typeof e.title === 'string' && typeof e.parts === 'number' && typeof e.data === 'string';
}

export function loadRecent(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter(isEntry).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveRecent(list: readonly RecentEntry[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Devrenin analiz bölümü hariç yazımı: iki devre aynı mı (aynı örnek, aynı kayıt). */
const circuitOnly = (doc: CircuitDoc) => serializeDoc(doc);

/**
 * Bu devre listeye girmeli mi: boş değil ve (açık bir örnek varsa) örneğin kendisinden farklı. `example`
 * açık örneğin ilk hâli; örnek açık değilse null.
 */
export function worthRemembering(doc: CircuitDoc, example: CircuitDoc | null): boolean {
  if (doc.parts.length === 0 && doc.wires.length === 0) return false;
  return example === null || circuitOnly(example) !== circuitOnly(doc);
}

/** Yeni kayıt başa; aynı devre (analiz dahil) önceden varsa eskisi çıkar; en çok RECENT_LIMIT kayıt. */
export function withRecent(list: readonly RecentEntry[], doc: CircuitDoc, analysis: AnalysisDoc, title: string, now: number): RecentEntry[] {
  const data = serializeDoc(doc, analysis);
  const entry: RecentEntry = { savedAt: now, title, parts: doc.parts.length, data };
  return [entry, ...list.filter((e) => e.data !== data)].slice(0, RECENT_LIMIT);
}

/** Kaydı belgeye çevirir; bozuksa null. */
export function restoreRecent(entry: RecentEntry): { doc: CircuitDoc; analysis: AnalysisDoc } | null {
  try {
    const value: unknown = JSON.parse(entry.data);
    const doc = parseDoc(value);
    if (!doc) return null;
    const analysis = typeof value === 'object' && value !== null && 'analysis' in value ? parseAnalysis((value as { analysis?: unknown }).analysis) : EMPTY_ANALYSIS;
    return { doc, analysis };
  } catch {
    return null;
  }
}
