// Görev oluştur → Arıza bulma (R4): gizli arıza satırları. Her satır bir arıza: yer (bacak, kablo ucu
// ya da parçanın kendisi), tür (yere uyanlar), kısa devrede öbür nokta, yanlış değerde değer. Yerler
// açılır listede anahtarla durur ("p:p3:1" bacak, "p:p3" parça, "w:w3:1" kablo ucu).

import { tr } from '../../i18n/tr';
import { faultFits, VALUE_PROP, type Fault, type FaultKind, type Spot } from '../../model/faults';
import { pinPositions } from '../../model/geometry';
import type { CircuitDoc, Point } from '../../model/types';
import type { NetIndex } from '../analysis/traces';
import { faultCandidates, placeLabel } from '../fault/judge';
import { INSTRUMENTS } from '../fault/mask';
import { legLabel } from '../fault/meter';
import type { Place } from '../fault/session';

export interface PlaceOption {
  readonly key: string;
  readonly label: string;
  readonly group: 'leg' | 'wire' | 'part';
}

const NO_FAULT: ReadonlySet<string> = new Set([...INSTRUMENTS, 'ground', 'battery', 'acsource', 'arduino', 'tank']);

export const legKey = (part: string, pin: number) => `p:${part}:${pin}`;
export const partKey = (part: string) => `p:${part}`;
export const endKey = (wire: string, end: 0 | 1) => `w:${wire}:${end}`;

/** Satırın yeri: arızanın ilk noktası (kısa devrede "at"). */
export function rowKey(f: Fault): string {
  if (f.kind === 'open' || f.kind === 'short') return 'part' in f.at ? legKey(f.at.part, f.at.pin) : endKey(f.at.wire, f.at.end ?? 0);
  return partKey(f.part);
}

export function spotOfKey(key: string): Spot | null {
  const [kind, id, n] = key.split(':');
  if (!id) return null;
  if (kind === 'p' && n !== undefined) return { part: id, pin: Number(n) };
  if (kind === 'w') return { wire: id, end: n === '1' ? 1 : 0 };
  return null;
}

/** Kablo ucunun adı: o noktadaki bacağa göre ("Kablo ucu → RC alt bacağı"), yoksa düğüm. */
function endLabel(doc: CircuitDoc, idx: NetIndex, wire: string, at: Point): string {
  const part = doc.parts.find((p) => p.type !== 'ground' && pinPositions(p).some((q) => q.x === at.x && q.y === at.y));
  if (part) return tr.fault.dialog.wireEnd(legLabel(part, pinPositions(part).findIndex((q) => q.x === at.x && q.y === at.y)));
  return tr.fault.dialog.wireEnd(placeLabel({ wire }, doc, idx).replace(/^Kablo · /, ''));
}

/** Açılır listedeki yerler: arıza konulabilecek parçaların bacakları ve kendileri, kablo uçları. */
export function placeOptions(doc: CircuitDoc, idx: NetIndex): PlaceOption[] {
  const out: PlaceOption[] = [];
  const faultable = doc.parts.filter((p) => !NO_FAULT.has(p.type));
  for (const part of faultable) out.push({ key: partKey(part.id), label: placeLabel({ part: part.id }, doc, idx), group: 'part' });
  for (const part of faultable) pinPositions(part).forEach((_, i) => out.push({ key: legKey(part.id, i), label: placeLabel({ part: part.id, pin: i }, doc, idx), group: 'leg' }));
  for (const w of doc.wires) {
    const ends = [w.points[0]!, w.points[w.points.length - 1]!] as const;
    ends.forEach((p, end) => out.push({ key: endKey(w.id, end as 0 | 1), label: endLabel(doc, idx, w.id, p), group: 'wire' }));
  }
  return out;
}

/** Yere uyan türler: bacak ve kablo ucunda kopuk ya da kısa devre; parçada değer, ters takılma, yanma ve kısa devre. */
export function kindsFor(key: string, doc: CircuitDoc): FaultKind[] {
  if (!key.startsWith('p:') || key.split(':').length === 3) return ['open', 'short'];
  const part = doc.parts.find((p) => p.id === key.slice(2));
  if (!part) return [];
  const kinds = (['value', 'reversed', 'burnt'] as const).filter((k) => faultFits(k, part));
  return pinPositions(part).length >= 2 ? [...kinds, 'short'] : kinds;
}

/** Yer ve türden arıza (değer ve kısa devrenin öbür ucu öncekinden korunur). */
export function makeFault(key: string, kind: FaultKind, doc: CircuitDoc, previous?: Fault): Fault | null {
  const spot = spotOfKey(key);
  if (key.split(':').length === 2) {
    const part = doc.parts.find((p) => p.id === key.slice(2));
    if (!part) return null;
    if (kind === 'value') {
      const prop = VALUE_PROP[part.type];
      const v = prop ? part.props[prop] : undefined;
      const value = previous?.kind === 'value' && previous.part === part.id ? previous.value : typeof v === 'number' ? v * 10 : 1;
      return { kind: 'value', part: part.id, value };
    }
    if (kind === 'short') return { kind: 'short', at: { part: part.id, pin: 0 }, to: { part: part.id, pin: 1 } };
    if (kind === 'reversed' || kind === 'burnt') return { kind, part: part.id };
    return null;
  }
  if (!spot) return null;
  if (kind === 'open') return { kind: 'open', at: spot };
  if (kind === 'short') {
    const to = previous?.kind === 'short' ? previous.to : defaultOther(spot, doc);
    return to ? { kind: 'short', at: spot, to } : null;
  }
  return null;
}

/** Kısa devrenin öbür ucu için ilk öneri: aynı parçanın öbür bacağı ya da ilk parçanın bacağı. */
function defaultOther(spot: Spot, doc: CircuitDoc): Spot | null {
  if ('part' in spot) {
    const part = doc.parts.find((p) => p.id === spot.part);
    if (part && pinPositions(part).length > 1) return { part: part.id, pin: spot.pin === 0 ? 1 : 0 };
  }
  const first = doc.parts.find((p) => !NO_FAULT.has(p.type));
  return first ? { part: first.id, pin: 0 } : null;
}

/** Yeni satır: devreye uyan ilk aday (yoksa null). */
export function firstFault(doc: CircuitDoc, idx: NetIndex): Fault | null {
  return faultCandidates(doc, idx)[0] ?? null;
}

/** Şemadan seçilen yerden satırın yeni arızası (R4: "yer şemadan da seçilir"). */
export function faultFromPlace(place: Place, at: Point, doc: CircuitDoc, previous: Fault | undefined, which: 'at' | 'to'): Fault | null {
  let key: string;
  if ('wire' in place) {
    const w = doc.wires.find((x) => x.id === place.wire);
    if (!w) return null;
    const a = w.points[0]!;
    const b = w.points[w.points.length - 1]!;
    key = endKey(w.id, Math.hypot(at.x - a.x, at.y - a.y) <= Math.hypot(at.x - b.x, at.y - b.y) ? 0 : 1);
  } else key = place.pin === undefined ? partKey(place.part) : legKey(place.part, place.pin);
  if (which === 'to' && previous?.kind === 'short') {
    const spot = spotOfKey(key);
    return spot ? { ...previous, to: spot } : previous;
  }
  const kinds = kindsFor(key, doc);
  const kind = previous && kinds.includes(previous.kind) ? previous.kind : kinds[0];
  return kind ? makeFault(key, kind, doc, previous) : null;
}
