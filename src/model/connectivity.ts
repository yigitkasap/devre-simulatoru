// Şema geometrisinden çözücünün bağlantı listesine (netlist) dönüşüm.
//
// Bağlantı kuralları:
//   1. Aynı noktadaki pinler ve kablo köşeleri/uçları birbirine bağlıdır.
//   2. Bir kablonun UCU başka bir kablonun bir parçasının ortasına denk geliyorsa bağlıdır
//      (T bağlantısı; tuvalde dolu nokta çizilir).
//   3. Birbirini köşesiz kesen kablolar ve bir kablonun ortasından geçtiği pinler bağlı DEĞİLDİR.

import type { Netlist, NetlistElement, NetlistLink } from '../sim/netlist';
import { onSegmentInterior, pinPositions, pointKey } from './geometry';
import type { CircuitDoc, Point } from './types';

export const pinKey = (partId: string, pin: number): string => `${partId}#${pin}`;
export const wireKey = (wireId: string): string => `w:${wireId}`;

export interface Connectivity {
  readonly netlist: Netlist;
  /** Üç ya da daha fazla bağlantının buluştuğu noktalar (dolu nokta). */
  readonly junctions: readonly Point[];
  /** Hiçbir şeye bağlı olmayan pinlerin anahtarları. */
  readonly unconnectedPins: ReadonlySet<string>;
  /** Hiçbir şeye bağlı olmayan kablo uçları. */
  readonly danglingEnds: readonly Point[];
}

interface PointEntry {
  readonly point: Point;
  readonly pins: string[];
  readonly wires: Set<string>;
  /** Bu noktaya giren bağlantı sayısı (pin = 1, kablo ucu = 1, kablo köşesi = 2). */
  degree: number;
}

export function buildConnectivity(doc: CircuitDoc): Connectivity {
  const entries = new Map<string, PointEntry>();
  const entry = (p: Point): PointEntry => {
    const key = pointKey(p);
    let e = entries.get(key);
    if (!e) {
      e = { point: p, pins: [], wires: new Set(), degree: 0 };
      entries.set(key, e);
    }
    return e;
  };

  const elements: NetlistElement[] = [];
  for (const part of doc.parts) {
    const positions = pinPositions(part);
    const pins = positions.map((pos, i) => {
      const key = pinKey(part.id, i);
      const e = entry(pos);
      e.pins.push(key);
      e.degree += 1;
      return key;
    });
    elements.push({ id: part.id, type: part.type, props: part.props, pins });
  }

  for (const wire of doc.wires) {
    const n = wire.points.length;
    wire.points.forEach((p, i) => {
      const e = entry(p);
      e.wires.add(wireKey(wire.id));
      e.degree += (i > 0 ? 1 : 0) + (i < n - 1 ? 1 : 0);
    });
  }

  const links: NetlistLink[] = [];

  // T bağlantıları: bir kablonun ucu başka bir kablonun parçasının ortasında.
  const counted = new Set<string>();
  for (const wire of doc.wires) {
    const ends = [wire.points[0], wire.points[wire.points.length - 1]];
    for (const end of ends) {
      if (!end) continue;
      for (const other of doc.wires) {
        if (other.id === wire.id) continue;
        for (let s = 0; s + 1 < other.points.length; s++) {
          if (onSegmentInterior(end, other.points[s]!, other.points[s + 1]!)) {
            links.push({ a: wireKey(wire.id), b: wireKey(other.id) });
            const tag = `${pointKey(end)}|${other.id}`;
            if (!counted.has(tag)) {
              counted.add(tag);
              entry(end).degree += 2;
            }
            break;
          }
        }
      }
    }
  }

  // Aynı noktadaki her şeyi birbirine bağla.
  const junctions: Point[] = [];
  const unconnectedPins = new Set<string>();
  const danglingEnds: Point[] = [];
  for (const e of entries.values()) {
    const members = [...e.pins, ...e.wires];
    for (let i = 1; i < members.length; i++) links.push({ a: members[0]!, b: members[i]! });
    if (e.degree >= 3 && e.wires.size > 0) junctions.push(e.point);
    if (e.degree <= 1) {
      for (const pin of e.pins) unconnectedPins.add(pin);
      if (e.pins.length === 0 && e.wires.size > 0) danglingEnds.push(e.point);
    }
  }

  return { netlist: { elements, links }, junctions, unconnectedPins, danglingEnds };
}

