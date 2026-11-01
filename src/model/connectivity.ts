// Şema geometrisinden çözücünün bağlantı listesine (netlist) dönüşüm.
//
// Bağlantı kuralları:
//   1. Aynı noktadaki pinler ve kablo köşeleri/uçları birbirine bağlıdır.
//   2. Bir kablonun UCU başka bir kablonun bir parçasının ortasına denk geliyorsa bağlıdır
//      (T bağlantısı; tuvalde dolu nokta çizilir).
//   3. Birbirini köşesiz kesen kablolar ve bir kablonun ortasından geçtiği pinler bağlı DEĞİLDİR.
//
// Arızalar (B2) burada uygulanır: şemanın çizimi ve uyarıları (kavşaklar, bağlanmamış uçlar) arızasız
// devreden hesaplanır, yalnızca bağlantılar ve elemanlar değişir. Kopuk bacak ya da kablo ucu o
// noktadaki bağlantıya katılmaz (kendi düğümünde kalır), kısa devre iki noktayı birleştirir, yanlış
// değer parçanın ana değerini, ters takılmış parça uç sırasını değiştirir; yanmış parçanın iki ucu
// devreden ayrı (kendi düğümlerinde) kalır.

import type { Netlist, NetlistElement, NetlistLink } from '../sim/netlist';
import { VALUE_PROP, type Fault, type Spot } from './faults';
import { onSegmentInterior, pinPositions, pointKey } from './geometry';
import type { CircuitDoc, Point } from './types';

export const pinKey = (partId: string, pin: number): string => `${partId}#${pin}`;
export const wireKey = (wireId: string): string => `w:${wireId}`;
/** Şemadaki bir yerin ağ anahtarı: bacak ya da kablo. */
export const spotKey = (spot: Spot): string => ('part' in spot ? pinKey(spot.part, spot.pin) : wireKey(spot.wire));
/** Yanmış parçanın uçları: devreden ayrı anahtarlar. */
const burntPinKey = (partId: string, pin: number): string => `arıza:${partId}#${pin}`;

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

export function buildConnectivity(doc: CircuitDoc, faults: readonly Fault[] = []): Connectivity {
  // Kopuk bacaklar (anahtar) ve kopuk kablo uçları ("anahtar|nokta").
  const openPins = new Set<string>();
  const openEnds = new Set<string>();
  const endTag = (key: string, p: Point) => `${key}|${pointKey(p)}`;
  for (const f of faults) {
    if (f.kind !== 'open') continue;
    if ('part' in f.at) openPins.add(pinKey(f.at.part, f.at.pin));
    else {
      const at = f.at;
      const wire = doc.wires.find((w) => w.id === at.wire);
      const p = wire && (at.end === 1 ? wire.points[wire.points.length - 1] : wire.points[0]);
      if (p) openEnds.add(endTag(wireKey(at.wire), p));
    }
  }
  const faultOf = (partId: string, kind: 'value' | 'reversed' | 'burnt') => faults.find((f) => f.kind === kind && f.part === partId);

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
    const value = faultOf(part.id, 'value');
    const valueProp = VALUE_PROP[part.type];
    const props = value?.kind === 'value' && valueProp ? { ...part.props, [valueProp]: value.value } : part.props;
    const wired = faultOf(part.id, 'burnt')
      ? pins.map((_, i) => burntPinKey(part.id, i))
      : faultOf(part.id, 'reversed') && pins.length === 2
        ? [pins[1]!, pins[0]!]
        : pins;
    elements.push({ id: part.id, type: part.type, props, pins: wired });
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
      const open = openEnds.has(endTag(wireKey(wire.id), end));
      for (const other of doc.wires) {
        if (other.id === wire.id) continue;
        for (let s = 0; s + 1 < other.points.length; s++) {
          if (onSegmentInterior(end, other.points[s]!, other.points[s + 1]!)) {
            if (!open) links.push({ a: wireKey(wire.id), b: wireKey(other.id) });
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
    const members = [...e.pins.filter((pin) => !openPins.has(pin)), ...[...e.wires].filter((w) => !openEnds.has(endTag(w, e.point)))];
    for (let i = 1; i < members.length; i++) links.push({ a: members[0]!, b: members[i]! });
    if (e.degree >= 3 && e.wires.size > 0) junctions.push(e.point);
    if (e.degree <= 1) {
      for (const pin of e.pins) unconnectedPins.add(pin);
      if (e.pins.length === 0 && e.wires.size > 0) danglingEnds.push(e.point);
    }
  }

  for (const f of faults) if (f.kind === 'short') links.push({ a: spotKey(f.at), b: spotKey(f.to) });

  return { netlist: { elements, links }, junctions, unconnectedPins, danglingEnds };
}

