// Görev (C1, docs/tasarim-v3 → N5 öğrenci, N6 hoca): hocanın verdiği devre, yönerge, öğrencinin
// değiştirebileceği parçalar ve hedefler. Kullanıcı kararı (2026-10-30): bağlantı adresin # kısmında
// sıkıştırılmış JSON (#g=…, paylaşımdaki gibi lz-string; # kısmı sunucuya gönderilmez) ve aynı içerikle
// görev dosyası (.json). Hedefler bağlantının içindedir, öğrenci görebilir: onay alıştırma içindir.

import * as lzModule from 'lz-string';
import { parseDoc, toSerializable } from './serialize';
import type { CircuitDoc } from './types';

type LzString = typeof lzModule;
const lz: LzString = (lzModule as unknown as { default?: LzString }).default ?? lzModule;

/** Hedefin büyüklüğü (kullanıcı kararı: dördü de). */
export type TargetQuantity =
  /** Bir parçanın gerilimi, akımı ya da gücü (canlı ölçüm). */
  | { readonly kind: 'part'; readonly part: string; readonly measure: 'voltage' | 'current' | 'power' }
  /** Bir düğümün toprağa (ya da ref'e) göre gerilimi. */
  | { readonly kind: 'node'; readonly node: string; readonly ref: string | null }
  /** Bode sonucu: orta bant kazancı (kat ya da dB) ya da üst kesim frekansı. */
  | { readonly kind: 'bode'; readonly measure: 'gain' | 'gainDb' | 'fH' }
  /** Transistörün DC çalışma noktası: V_CE / V_DS (v) ya da I_C / I_D (i). */
  | { readonly kind: 'q'; readonly part: string; readonly axis: 'v' | 'i' };

export type TargetOp = 'tol' | 'ge' | 'le';

export interface Target {
  readonly id: string;
  readonly q: TargetQuantity;
  readonly op: TargetOp;
  readonly value: number;
  /** ± tolerans (yüzde; yalnızca op = 'tol'). */
  readonly tol: number;
}

export interface TaskDef {
  readonly name: string;
  readonly instruction: string;
  /** Öğrencinin değiştirebileceği parçalar (kimlik). */
  readonly editable: readonly string[];
  /** Yeni parça (ve kablo) eklenebilir mi. */
  readonly allowNew: boolean;
  readonly targets: readonly Target[];
}

/** Bağlantı bu uzunluğu aşınca pencere uyarır ve görev dosyasını önerir (kullanıcı kararı: 8 KB). */
export const LINK_LIMIT = 8 * 1024;
const HASH_KEY = 'g=';
const FORMAT = 1;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');

function parseQuantity(v: unknown): TargetQuantity | null {
  if (!isRecord(v)) return null;
  if (v.kind === 'part' && typeof v.part === 'string' && (v.measure === 'voltage' || v.measure === 'current' || v.measure === 'power')) return { kind: 'part', part: v.part, measure: v.measure };
  if (v.kind === 'node' && typeof v.node === 'string') return { kind: 'node', node: v.node, ref: typeof v.ref === 'string' ? v.ref : null };
  if (v.kind === 'bode' && (v.measure === 'gain' || v.measure === 'gainDb' || v.measure === 'fH')) return { kind: 'bode', measure: v.measure };
  if (v.kind === 'q' && typeof v.part === 'string' && (v.axis === 'v' || v.axis === 'i')) return { kind: 'q', part: v.part, axis: v.axis };
  return null;
}

export function parseTask(v: unknown): TaskDef | null {
  if (!isRecord(v)) return null;
  const targets: Target[] = [];
  for (const raw of Array.isArray(v.targets) ? v.targets.slice(0, 20) : []) {
    if (!isRecord(raw)) continue;
    const q = parseQuantity(raw.q);
    const op = raw.op === 'ge' || raw.op === 'le' ? raw.op : 'tol';
    if (q) targets.push({ id: str(raw.id, 40) || `h${targets.length}`, q, op, value: num(raw.value), tol: Math.abs(num(raw.tol, 10)) });
  }
  return {
    name: str(v.name, 120),
    instruction: str(v.instruction),
    editable: Array.isArray(v.editable) ? v.editable.filter((x): x is string => typeof x === 'string').slice(0, 500) : [],
    allowNew: v.allowNew === true,
    targets,
  };
}

/** Görev dosyasının ve bağlantının içeriği. */
export function taskPayload(task: TaskDef, doc: CircuitDoc): Record<string, unknown> {
  return { format: FORMAT, gorev: task, devre: toSerializable(doc) };
}

/** Görev dosyası ya da bağlantıdan okunan içerik; geçersizse null. */
export function parseTaskPayload(v: unknown): { task: TaskDef; doc: CircuitDoc } | null {
  if (!isRecord(v)) return null;
  const task = parseTask(v.gorev);
  const doc = parseDoc(v.devre);
  return task && doc ? { task, doc } : null;
}

export function taskUrl(task: TaskDef, doc: CircuitDoc, pageUrl: string): string {
  return `${pageUrl.split('#')[0]}#${HASH_KEY}${lz.compressToEncodedURIComponent(JSON.stringify(taskPayload(task, doc)))}`;
}

/**
 * Adresin # kısmındaki görevi okur.
 * @returns undefined: bağlantıda görev yok; null: görev var ama okunamadı.
 */
export function taskFromHash(hash: string): { task: TaskDef; doc: CircuitDoc } | null | undefined {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment.startsWith(HASH_KEY)) return undefined;
  try {
    const json = lz.decompressFromEncodedURIComponent(fragment.slice(HASH_KEY.length));
    return json ? parseTaskPayload(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

/** Ölçülen değer hedefi tutuyor mu (±: |ölçülen − hedef| ≤ hedef · tol %). */
export function targetMet(t: Target, measured: number | null): boolean {
  if (measured === null || !Number.isFinite(measured)) return false;
  if (t.op === 'ge') return measured >= t.value;
  if (t.op === 'le') return measured <= t.value;
  return Math.abs(measured - t.value) <= (Math.abs(t.value) * t.tol) / 100 + 1e-15;
}

/**
 * Kilitli parçalar değişmedi mi (değeri, yeri, dönüşü, silinmesi). Anahtar ve potansiyometre gibi
 * kullanma denetimleri (OPERATE) kilitli parçada da değişebilir. Yeni parça eklenemiyorsa parça ve
 * kablo sayısı da değişmez (kablolar kilitli parçalar arasında).
 */
export function respectsTask(before: CircuitDoc, after: CircuitDoc, task: TaskDef): boolean {
  const editable = new Set(task.editable);
  const next = new Map(after.parts.map((p) => [p.id, p]));
  for (const p of before.parts) {
    if (editable.has(p.id)) continue;
    const q = next.get(p.id);
    if (!q || q.type !== p.type || q.x !== p.x || q.y !== p.y || q.rotation !== p.rotation || q.label !== p.label) return false;
    if (INSTRUMENTS.has(p.type)) continue;
    const keys = new Set([...Object.keys(p.props), ...Object.keys(q.props)]);
    for (const k of keys) if (!OPERATE.has(k) && p.props[k] !== q.props[k]) return false;
  }
  if (!task.allowNew) {
    const old = new Set(before.parts.map((p) => p.id));
    if (after.parts.some((p) => !old.has(p.id))) return false;
    if (JSON.stringify(before.wires) !== JSON.stringify(after.wires)) return false;
  }
  return true;
}

/** Kilitli parçada da değişebilen (kullanma) özellikler: anahtar, potansiyometre konumu, ışık, sıcaklık, su seviyesi ve kipi. */
const OPERATE: ReadonlySet<string> = new Set(['closed', 'position', 'illuminance', 'temperature', 'level', 'mode']);
/** Ayarları ölçmeye ait cihazlar (kilitliyken de ayarlanır, yeri değişmez): osiloskop ve ölçü aletleri. */
const INSTRUMENTS: ReadonlySet<string> = new Set(['oscilloscope', 'voltmeter', 'ammeter']);
