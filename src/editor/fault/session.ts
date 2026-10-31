// Arıza bulma oturumu (B2): ölçüm günlüğü, bildirimler, kullanılan ipuçları, bulundu mu, onarıldı mı.
// Sayfa yenilenince kayıtlı görevle birlikte geri gelir; yeni bir görev ya da görevden çıkış sıfırlar.
// Rapor (.json) bunun içeriğidir.

import type { FaultKind, Spot } from '../../model/faults';
import { parseSpot } from '../../model/faults';
import type { MeterMode } from './meter';

/** Günlüğün bir satırı: her kararlı okuma kendiliğinden yazılır; aynı nokta ve kip bir kez. */
export interface LogEntry {
  /** Aynı ölçüm: kip ve iki ucun yeri ("dc|p3#1|p2#0"). */
  readonly key: string;
  /** "V(Q1 kollektör)", siyah uç toprakta değilse "V(Q1 baz, Q1 emetör bacağı)", Ω'da "R(…)". */
  readonly name: string;
  readonly mode: MeterMode;
  /** Gösterilen okuma ("0,01 V", "6,442 mV", "5,600 kΩ", "OL"). */
  readonly text: string;
  /** SI değeri (V ya da Ω); aralık dışıysa (OL) null. */
  readonly value: number | null;
  /** Öğrencinin beklediği değer (hoca "Önce beklenen değeri sor"u açtıysa; isteğe bağlı). */
  readonly expected?: number;
}

/** Öğrencinin bildirimi (R2): yer, tür, onu buraya götüren ölçümler; doğru mu. */
export interface FaultReport {
  readonly spot: Spot;
  readonly kind: FaultKind;
  /** Günlükten işaretlenen satırlar (anahtar). */
  readonly evidence: readonly string[];
  readonly correct: boolean;
}

export interface FaultSession {
  readonly log: readonly LogEntry[];
  readonly reports: readonly FaultReport[];
  /** Kullanılan ipucu sayısı (0–3). */
  readonly hints: number;
  /** Arıza bulundu (doğru bildirim). */
  readonly found: boolean;
  /** "Onar ve çalıştır": arıza kalktı. */
  readonly repaired: boolean;
}

export const NEW_SESSION: FaultSession = { log: [], reports: [], hints: 0, found: false, repaired: false };
/** Günlüğün en uzun hâli (satır). */
export const LOG_LIMIT = 200;

/** Ölçümün adı: siyah uç topraktaysa yalnız kırmızı ucun yeri. */
export function entryName(mode: MeterMode, red: string, black: string | null): string {
  const fn = mode === 'ohm' ? 'R' : 'V';
  return black === null ? `${fn}(${red})` : `${fn}(${red}, ${black})`;
}

/** Günlüğe yeni satır (aynı anahtar varsa değişmez). */
export function addEntry(session: FaultSession, entry: LogEntry): FaultSession {
  if (session.log.some((e) => e.key === entry.key) || session.log.length >= LOG_LIMIT) return session;
  return { ...session, log: [...session.log, entry] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const MODES: readonly MeterMode[] = ['dc', 'ac', 'ohm'];
const KINDS: readonly FaultKind[] = ['open', 'short', 'value', 'reversed', 'burnt'];

export function parseSession(v: unknown): FaultSession {
  if (!isRecord(v)) return NEW_SESSION;
  const log: LogEntry[] = [];
  for (const raw of Array.isArray(v.log) ? v.log.slice(0, LOG_LIMIT) : []) {
    if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.name !== 'string' || typeof raw.text !== 'string' || !MODES.includes(raw.mode as MeterMode)) continue;
    const value = typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : null;
    const expected = typeof raw.expected === 'number' && Number.isFinite(raw.expected) ? { expected: raw.expected } : {};
    log.push({ key: raw.key, name: raw.name, mode: raw.mode as MeterMode, text: raw.text, value, ...expected });
  }
  const reports: FaultReport[] = [];
  for (const raw of Array.isArray(v.reports) ? v.reports.slice(0, 50) : []) {
    if (!isRecord(raw)) continue;
    const spot = parseSpot(raw.spot);
    if (!spot || !KINDS.includes(raw.kind as FaultKind)) continue;
    const evidence = Array.isArray(raw.evidence) ? raw.evidence.filter((x): x is string => typeof x === 'string') : [];
    reports.push({ spot, kind: raw.kind as FaultKind, evidence, correct: raw.correct === true });
  }
  const hints = typeof v.hints === 'number' ? Math.max(0, Math.min(3, Math.round(v.hints))) : 0;
  return { log, reports, hints, found: v.found === true, repaired: v.repaired === true };
}
