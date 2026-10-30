// Belgenin JSON biçimi. Otomatik kayıt (ve Aşama 5'te dışa/içe aktarma, paylaşım bağlantısı)
// bu biçimi kullanır. Noktalar yer kazanmak için [x, y] dizisi olarak yazılır.
//
// {
//   "version": 1,
//   "parts": [{ "id": "p1", "type": "resistor", "label": "R1", "x": 0, "y": 0, "rotation": 0,
//               "props": { "resistance": 1000 } }],
//   "wires": [{ "id": "w1", "points": [[4, 0], [10, 0]] }]
// }

import type { PropValue } from '../sim/netlist';
import { serializeAnalysis, type AnalysisDoc } from './analysis';
import { isDeviceType } from './catalog';
import { DOC_VERSION, type CircuitDoc, type Part, type Point, type Rotation, type Wire } from './types';
import { normalizePoints } from './wires';

interface SerializedDoc {
  version: number;
  parts: Array<{
    id: string;
    type: string;
    label: string;
    x: number;
    y: number;
    rotation: number;
    props: Record<string, PropValue>;
  }>;
  wires: Array<{ id: string; points: Array<[number, number]> }>;
  /** Analiz katmanı (izler, ölçüm tablosu); devrenin bağlantısına girmez. */
  analysis?: Record<string, unknown>;
}

export function toSerializable(doc: CircuitDoc, analysis?: AnalysisDoc): SerializedDoc {
  const extra = analysis ? serializeAnalysis(analysis) : undefined;
  return {
    ...(extra ? { analysis: extra } : {}),
    version: doc.version,
    parts: doc.parts.map((p) => ({
      id: p.id,
      type: p.type,
      label: p.label,
      x: p.x,
      y: p.y,
      rotation: p.rotation,
      props: { ...p.props },
    })),
    wires: doc.wires.map((w) => ({ id: w.id, points: w.points.map((p) => [p.x, p.y] as [number, number]) })),
  };
}

export function serializeDoc(doc: CircuitDoc, analysis?: AnalysisDoc): string {
  return JSON.stringify(toSerializable(doc, analysis));
}

const ROTATIONS: readonly number[] = [0, 90, 180, 270];
const MAX_ITEMS = 5000;
const MAX_COORD = 100000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= MAX_COORD;
}

/**
 * JSON'dan okunan değeri doğrular ve belgeye çevirir. Geçersizse null döner
 * (bozuk ya da başka bir programa ait veri sessizce reddedilir).
 */
export function parseDoc(value: unknown): CircuitDoc | null {
  if (!isRecord(value) || value.version !== DOC_VERSION) return null;
  const { parts, wires } = value;
  if (!Array.isArray(parts) || !Array.isArray(wires) || parts.length > MAX_ITEMS || wires.length > MAX_ITEMS) return null;

  const ids = new Set<string>();
  const outParts: Part[] = [];
  for (const raw of parts) {
    if (!isRecord(raw)) return null;
    const { id, type, label, x, y, rotation, props } = raw;
    if (typeof id !== 'string' || id === '' || ids.has(id)) return null;
    if (!isDeviceType(type) || typeof label !== 'string' || !isCoord(x) || !isCoord(y)) return null;
    if (typeof rotation !== 'number' || !ROTATIONS.includes(rotation) || !isRecord(props)) return null;
    const cleanProps: Record<string, PropValue> = {};
    for (const [key, v] of Object.entries(props)) {
      if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string' || typeof v === 'boolean') cleanProps[key] = v;
    }
    ids.add(id);
    outParts.push({ id, type, label: label.slice(0, 24), x, y, rotation: rotation as Rotation, props: cleanProps });
  }

  const wireIds = new Set<string>();
  const outWires: Wire[] = [];
  for (const raw of wires) {
    if (!isRecord(raw)) return null;
    const { id, points } = raw;
    if (typeof id !== 'string' || id === '' || wireIds.has(id) || !Array.isArray(points)) return null;
    const pts: Point[] = [];
    for (const p of points) {
      if (!Array.isArray(p) || p.length !== 2 || !isCoord(p[0]) || !isCoord(p[1])) return null;
      pts.push({ x: p[0], y: p[1] });
    }
    const clean = normalizePoints(pts);
    if (clean.length < 2) continue;
    wireIds.add(id);
    outWires.push({ id, points: clean });
  }
  return { version: DOC_VERSION, parts: outParts, wires: outWires };
}

/** Bağlantıyı etkileyen her şeyin (parça konumu, döndürme, kablo geometrisi) özeti. Değerler dahil değil. */
export function structureKey(doc: CircuitDoc): string {
  const parts = doc.parts.map((p) => `${p.id}:${p.type}:${p.x}:${p.y}:${p.rotation}`).join(';');
  const wires = doc.wires.map((w) => `${w.id}:${w.points.map((p) => `${p.x},${p.y}`).join(' ')}`).join(';');
  return `${parts}|${wires}`;
}
