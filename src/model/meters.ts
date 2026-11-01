// Arıza bulmada kabloya takılan ampermetreler (B2): kayıt, kaldırma ve görevin bekçisinin denetimi.
// Ampermetrenin yerini editor/fault/ammeter.ts seçer; kayıt takıldığı hâli (ampermetrenin yeri ve
// oluşan kablolar) ve bölünen kablonun özgün noktalarını tutar. Kablolara yalnızca takıp kaldırmakla
// dokunulur: takılı ampermetreler ve kabloları değişmemiş olmalı, hepsi kaldırılınca da kablolar
// öncekiyle aynı kalmalı. Geri al ve Yinele belgeyi değiştirir: takılı olanlar belgede bütün duranlardır.

import { removeItems, replaceWirePoints } from './docOps';
import type { Fault } from './faults';
import type { CircuitDoc, Point, Rotation, Wire } from './types';

/** Takılı bir ampermetre: yeri, bölünen kablo (ilk yarı), ikinci yarı, bağlantı kabloları, özgün noktalar. */
export interface InsertedMeter {
  readonly part: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  readonly wire: string;
  readonly half: string;
  /** Kablonun üstüne oturduysa boş; yanına konduysa iki bağlantı kablosu. */
  readonly links: readonly string[];
  /** Takınca oluşan kablolar (ilk yarı, ikinci yarı, bağlantılar). */
  readonly made: readonly Wire[];
  readonly points: readonly Point[];
}

const samePoints = (a: readonly Point[], b: readonly Point[]) => a.length === b.length && a.every((p, i) => p.x === b[i]!.x && p.y === b[i]!.y);

/** Ampermetre takıldığı gibi duruyor mu: yeri, türü ve oluşan kablolar değişmemiş. */
export function meterIntact(doc: CircuitDoc, meter: InsertedMeter): boolean {
  const part = doc.parts.find((p) => p.id === meter.part);
  if (!part || part.type !== 'ammeter' || part.x !== meter.x || part.y !== meter.y || part.rotation !== meter.rotation) return false;
  return meter.made.every((w) => {
    const now = doc.wires.find((x) => x.id === w.id);
    return now !== undefined && samePoints(now.points, w.points);
  });
}

/** Ampermetreyi ve takarken oluşan kabloları kaldırır, kabloyu özgün noktalarına döndürür. */
export function removeAmmeter(doc: CircuitDoc, meter: InsertedMeter): CircuitDoc {
  const without = removeItems(doc, [meter.part], [meter.half, ...meter.links]);
  return without.wires.some((w) => w.id === meter.wire) ? replaceWirePoints(without, meter.wire, meter.points) : { ...without, wires: [...without.wires, { id: meter.wire, points: meter.points }] };
}

/** Bütün ampermetreler kaldırılmış hâl (son takılandan başlayarak). */
export function unplugAll(doc: CircuitDoc, meters: readonly InsertedMeter[]): CircuitDoc {
  return [...meters].reverse().reduce(removeAmmeter, doc);
}

/** İki kablo listesi aynı mı (sırası önemsiz). */
function sameWires(a: readonly Wire[], b: readonly Wire[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((w) => [w.id, w]));
  return a.every((w) => {
    const other = byId.get(w.id);
    return other !== undefined && samePoints(other.points, w.points);
  });
}

/**
 * Kablolar yalnızca ampermetre takıp kaldırmakla mı değişti: sonraki takılı ampermetreler takıldığı
 * gibi duruyor ve iki hâlde de hepsi kaldırılınca kablolar aynı.
 */
export function meterEditOk(before: CircuitDoc, after: CircuitDoc, metersBefore: readonly InsertedMeter[], metersAfter: readonly InsertedMeter[]): boolean {
  return metersAfter.every((m) => meterIntact(after, m)) && sameWires(unplugAll(after, metersAfter).wires, unplugAll(before, metersBefore).wires);
}

/** Takılı ampermetreler bölünen kabloların son ucunu ikinci yarıya taşıdı: kablo ucundaki arıza da taşınır. */
export function remapFaults(faults: readonly Fault[], meters: readonly InsertedMeter[]): Fault[] {
  return faults.map((f) => {
    if (f.kind !== 'open' || !('wire' in f.at) || f.at.end !== 1) return f;
    let wire = f.at.wire;
    for (const m of meters) if (m.wire === wire) wire = m.half;
    return wire === f.at.wire ? f : { kind: 'open', at: { wire, end: 1 } };
  });
}

/** Belgede ampermetresi silinmiş takılı ampermetreler (kabloları geri getirilecek). */
export function removedMeters(before: CircuitDoc, after: CircuitDoc, meters: readonly InsertedMeter[]): InsertedMeter[] {
  const now = new Set(after.parts.map((p) => p.id));
  return meters.filter((m) => before.parts.some((p) => p.id === m.part) && !now.has(m.part));
}
