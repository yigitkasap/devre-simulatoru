// Arıza bulmada bildirimin yargısı ve "Bulundu" (B2, R2–R3): yerin adı, bildirim doğru mu, arızanın
// şemadaki yeri ve genel açıklaması (hazır senaryoların açıklaması tr.ts'te); hocanın "Rastgele seç"i
// ve "Yeni arıza dene" için rastgele arıza. Yerler ve düğümler sağlam devreden (şema) okunur.

import { tr } from '../../i18n/tr';
import { pinKey, wireKey } from '../../model/connectivity';
import { faultFits, VALUE_PROP, type Fault, type FaultKind } from '../../model/faults';
import { pinPositions } from '../../model/geometry';
import type { CircuitDoc, Part, Point } from '../../model/types';
import { formatSI } from '../../sim/units';
import { nodeName, type NetIndex } from '../analysis/traces';
import { INSTRUMENTS } from './mask';
import { legLabel } from './meter';
import type { Place } from './session';

const UNITS: Record<string, string> = { resistance: 'Ω', capacitance: 'F', inductance: 'H' };

/** Bir düğümün adı; toprak ağıysa toprak sembolünün adı. */
function netLabel(key: string, doc: CircuitDoc, idx: NetIndex): string {
  const name = nodeName(key, idx);
  return name === '0' ? (doc.parts.find((p) => p.type === 'ground')?.label ?? tr.fault.ground) : name;
}

/**
 * Bildirimdeki yerin adı (R2, 1. adım): "RC · Q1 kollektör tarafındaki bacak" (iki bacaklı parça),
 * "Q1 · kollektör bacağı", "RC · Direnç" (parçanın kendisi), "Kablo · Q1 kollektör".
 */
export function placeLabel(place: Place, doc: CircuitDoc, idx: NetIndex): string {
  const t = tr.fault.place;
  if ('wire' in place) return t.wire(netLabel(wireKey(place.wire), doc, idx));
  const part = doc.parts.find((p) => p.id === place.part);
  if (!part) return '?';
  if (place.pin === undefined || part.type === 'ground') return t.part(part.label, tr.devices.names[part.type]);
  if (pinPositions(part).length === 2) return t.side(part.label, netLabel(pinKey(part.id, place.pin), doc, idx));
  return t.pin(part.label, legLabel(part, place.pin).slice(part.label.length + 1));
}

/** Arızanın şemadaki yeri ("Bulundu" halkası). */
export function faultPlace(fault: Fault): Place {
  if (fault.kind === 'open' || fault.kind === 'short') return fault.at;
  return { part: fault.part };
}

/** Halkanın merkezi: bacak, kablonun ucu ya da parçanın ortası. */
export function placePoint(place: Place, doc: CircuitDoc, end: 0 | 1 = 0): Point | null {
  if ('wire' in place) {
    const w = doc.wires.find((x) => x.id === place.wire);
    return w ? (end === 1 ? w.points[w.points.length - 1]! : w.points[0]!) : null;
  }
  const part = doc.parts.find((p) => p.id === place.part);
  if (!part) return null;
  const pins = pinPositions(part);
  if (place.pin !== undefined) return pins[place.pin] ?? null;
  return { x: pins.reduce((s, p) => s + p.x, 0) / pins.length, y: pins.reduce((s, p) => s + p.y, 0) / pins.length };
}

export function faultPoint(fault: Fault, doc: CircuitDoc): Point | null {
  return placePoint(faultPlace(fault), doc, fault.kind === 'open' && 'wire' in fault.at ? (fault.at.end ?? 0) : 0);
}

/** Yerin dokunduğu düğümler (sağlam devre): bacak ve kablo bir, parçanın kendisi bütün bacakları. */
function placeNets(place: Place, doc: CircuitDoc, idx: NetIndex): Set<number> {
  const keys = 'wire' in place ? [wireKey(place.wire)] : place.pin !== undefined ? [pinKey(place.part, place.pin)] : pinPositions(doc.parts.find((p) => p.id === place.part)!).map((_, i) => pinKey(place.part, i));
  return new Set(keys.map((k) => idx.netOf(k)).filter((n): n is number => n !== undefined));
}

const samePoint = (a: Point | null, b: Point | null) => a !== null && b !== null && a.x === b.x && a.y === b.y;

/**
 * Bildirim bu arızayı buluyor mu: tür aynı ve yer uyuyor. Kopuk bacakta aynı noktadaki kablo ucu da
 * (kopukluk bacakla kablonun değdiği yerde), kopuk kablo ucunda o noktadaki bacak da kabul edilir.
 * Kısa devrede iki düğümden birine dokunan yer (parçanın kendisiyse iki düğüme birden dokunmalı);
 * değer, ters takılma ve yanmada parçanın kendisi ya da bir bacağı.
 */
export function placeMatches(fault: Fault, place: Place, kind: FaultKind, doc: CircuitDoc, idx: NetIndex): boolean {
  if (kind !== fault.kind) return false;
  switch (fault.kind) {
    case 'open': {
      const at = fault.at;
      if ('part' in at) {
        if ('part' in place) return place.part === at.part && place.pin === at.pin;
        const w = doc.wires.find((x) => x.id === place.wire);
        const p = placePoint(at, doc);
        return w !== undefined && (samePoint(w.points[0]!, p) || samePoint(w.points[w.points.length - 1]!, p));
      }
      if ('wire' in place) return place.wire === at.wire;
      return place.pin !== undefined && samePoint(placePoint(place, doc), placePoint(at, doc, at.end ?? 0));
    }
    case 'short': {
      const ends = new Set([...placeNets(fault.at, doc, idx), ...placeNets(fault.to, doc, idx)]);
      const nets = placeNets(place, doc, idx);
      const touching = [...nets].filter((n) => ends.has(n));
      return 'part' in place && place.pin === undefined ? touching.length >= Math.min(2, ends.size) : touching.length > 0;
    }
    default:
      return 'part' in place && place.part === fault.part;
  }
}

/** Genel açıklama ("Bulundu" kartı; hazır senaryonun kendi açıklaması yoksa). */
export function faultExplain(fault: Fault, doc: CircuitDoc, idx: NetIndex): { title: string; text: string } {
  const t = tr.fault.found;
  const part = 'part' in fault ? doc.parts.find((p) => p.id === fault.part) : undefined;
  switch (fault.kind) {
    case 'open':
      return { title: t.title.open(placeLabel(fault.at, doc, idx)), text: t.text.open };
    case 'short':
      return { title: t.title.short(placeLabel(fault.at, doc, idx), placeLabel(fault.to, doc, idx)), text: t.text.short };
    case 'value': {
      const prop = part ? VALUE_PROP[part.type] : undefined;
      const unit = prop ? (UNITS[prop] ?? '') : '';
      const drawn = part && prop && typeof part.props[prop] === 'number' ? formatSI(part.props[prop] as number, unit, { trim: true }) : '?';
      return { title: t.title.value(part?.label ?? '?', drawn, formatSI(fault.value, unit, { trim: true })), text: t.text.value };
    }
    case 'reversed':
      return { title: t.title.reversed(part?.label ?? '?'), text: t.text.reversed };
    case 'burnt':
      return { title: t.title.burnt(part?.label ?? '?'), text: t.text.burnt };
  }
}

// --- Rastgele arıza ---------------------------------------------------------------------------

/** Arıza konulabilecek parça: ölçü aletleri, kaynaklar ve toprak dışında. */
const NO_FAULT: ReadonlySet<string> = new Set([...INSTRUMENTS, 'ground', 'battery', 'acsource', 'arduino', 'tank']);

/** Devreye uyan arıza adayları (R4 "Rastgele seç", R3 "Yeni arıza dene"). */
export function faultCandidates(doc: CircuitDoc, idx: NetIndex): Fault[] {
  const out: Fault[] = [];
  const connected = (part: Part, pin: number) => {
    const net = idx.netOf(pinKey(part.id, pin));
    return net !== undefined && idx.pins(net).some((p) => p.part.id !== part.id);
  };
  for (const part of doc.parts) {
    if (NO_FAULT.has(part.type)) continue;
    const pins = pinPositions(part);
    pins.forEach((_, i) => {
      if (connected(part, i)) out.push({ kind: 'open', at: { part: part.id, pin: i } });
    });
    const prop = VALUE_PROP[part.type];
    const v = prop ? part.props[prop] : undefined;
    if (typeof v === 'number' && v > 0) out.push({ kind: 'value', part: part.id, value: v * 10 }, { kind: 'value', part: part.id, value: v / 10 });
    for (const kind of ['reversed', 'burnt'] as const) if (faultFits(kind, part)) out.push({ kind, part: part.id });
    // Kısa devre: iki bacaklı parçanın uçları arası ya da transistörün kollektörü ile emetörü arası.
    if (pins.length === 2 && connected(part, 0) && connected(part, 1)) out.push({ kind: 'short', at: { part: part.id, pin: 0 }, to: { part: part.id, pin: 1 } });
    if (pins.length === 3 && (part.type === 'npn' || part.type === 'pnp' || part.type.endsWith('fet') || part.type.endsWith('mos'))) out.push({ kind: 'short', at: { part: part.id, pin: 0 }, to: { part: part.id, pin: 2 } });
  }
  return out;
}

export function randomFault(doc: CircuitDoc, idx: NetIndex, random: () => number = Math.random, not?: Fault): Fault | null {
  const all = faultCandidates(doc, idx).filter((f) => JSON.stringify(f) !== JSON.stringify(not));
  return all.length > 0 ? all[Math.floor(random() * all.length)]! : null;
}
