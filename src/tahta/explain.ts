// Tahtada kur, Denetle: sorun kartının başlığı (kademeye göre) ve açıklaması (3. kademe). Metinler T3'teki
// gibi: "R1 · iki bacağı aynı şeritte", "R1’in bacakları 6b ve 6e’de. …".

import { mountOf } from '../bench3d/breadboard';
import { ek } from '../i18n/ek';
import { tr } from '../i18n/tr';
import type { CircuitDoc, Part } from '../model/types';
import type { PinRef, Problem } from './check';

const t = () => tr.tahta.denetle;

/** Delik adına bulunma eki: "6e’de", "12a’da", "üst + rayında (12. sütun hizası)". */
export function holeAt(name: string): string {
  if (/^\d+[a-j]$/.test(name)) return `${name}’${name.endsWith('a') ? 'da' : 'de'}`;
  return name.replace(' rayı (', ' rayında (');
}

/** 1–10 yazıyla ("iki yerde"), sonrası rakamla. */
export function countWord(n: number): string {
  return t().countWords[n - 1] ?? String(n);
}

function partOf(doc: CircuitDoc, id: string | null): Part | undefined {
  return id === null ? undefined : doc.parts.find((p) => p.id === id);
}

/** "Q1’in baz (B) ucu", "FG1’in TTL darbe çıkışı". */
export function pinRef(doc: CircuitDoc, ref: PinRef): string {
  const part = partOf(doc, ref.part);
  if (!part) return '';
  return `${ek(part.label, 'in')} ${tr.devices.pins[part.type][ref.pin] ?? `${ref.pin + 1}. ucu`}`;
}

const pinName = (part: Part, pin: number) => tr.devices.pins[part.type][pin] ?? `${pin + 1}. ucu`;

/** Ters takılmış sorunun başlığı: iki bacaklıda ve kılıflı entegrede "ters takılmış", transistörde "bacak sırası yanlış". */
function reversedTitle(part: Part): string {
  const mount = mountOf(part.type);
  if (mount === undefined) return t().kinds.swappedLeads;
  if (mount === 'dip8' || mount === 'dip4' || part.type === 'potentiometer' || part.type === 'spdt' || tr.devices.pins[part.type].length === 2) return t().kinds.reversed;
  return t().kinds.order;
}

/** Kademeye göre başlık: 1 "1. sorun", 2 "LED1 çevresinde", 3–4 "LED1 · ters takılmış". */
export function problemTitle(doc: CircuitDoc, problem: Problem, index: number, level: number): string {
  const part = partOf(doc, problem.part);
  if (level <= 1) return t().problemN(index + 1);
  if (!part) return level === 2 ? t().wireAround(problem.wire!.a, problem.wire!.b) : t().wireTitle(problem.wire!.a, problem.wire!.b);
  if (level === 2) return t().around(part.label);
  const kind =
    problem.kind === 'sameStrip' ? (problem.onRail ? t().kinds.sameRail : t().kinds.sameStrip) : problem.kind === 'reversed' ? reversedTitle(part) : t().kinds[problem.kind];
  return `${part.label} · ${kind}`;
}

/** Açıklama (3. kademe). */
export function problemText(doc: CircuitDoc, problem: Problem): string {
  const k = t();
  if (problem.wire) {
    const [a, b] = problem.wire.sides;
    return k.wireText(problem.wire.a, problem.wire.b, pinRef(doc, a), pinRef(doc, b));
  }
  const part = partOf(doc, problem.part)!;
  const L = part.label;
  const ref = (r: PinRef | null) => (r ? pinRef(doc, r) : null);
  const pins = problem.pins;
  const twoLegs = tr.devices.pins[part.type].length === 2;

  if (problem.kind === 'sameStrip') {
    const [a, b] = pins as [Problem['pins'][number], Problem['pins'][number]];
    const shared = problem.onRail ? k.railShared : k.stripShared;
    if (twoLegs) {
      const between = ref(a.expected) && ref(b.expected) ? ` ${k.between(L, ref(a.expected)!, ref(b.expected)!)}` : '';
      return `${k.legsAt(ek(L, 'in'), a.hole!, holeAt(b.hole!))} ${shared} ${k.sameNode(k.genitive[part.type] ?? ek(L, 'in'), L)}${between}`;
    }
    const where = [a, b].map((p) => (ref(p.expected) ? `${pinName(part, p.pin)} ${ref(p.expected)} ile` : null)).filter(Boolean);
    return `${k.pairAt(ek(L, 'in'), pinName(part, a.pin), pinName(part, b.pin), a.hole!, holeAt(b.hole!))} ${shared} ${k.pairSameNode}${where.length > 0 ? ` ${k.schematicJoined(where.join(', '))}` : ''}`;
  }

  if (problem.kind === 'reversed') {
    const placed = pins.map((p) => `${pinName(part, p.pin)} ${holeAt(p.hole!)}`).join(', ');
    const joined = pins.map((p) => (ref(p.expected) ? `${pinName(part, p.pin)} ${ref(p.expected)} ile` : null)).filter(Boolean);
    const schematic = joined.length > 0 ? ` ${k.schematicJoined(joined.join(', '))}` : '';
    const mount = mountOf(part.type);
    if (mount === undefined) return `${k.leadsSwapped(ek(L, 'in'), placed)}${schematic}`;
    if (mount === 'dip8' || mount === 'dip4') return k.dipReversed(L);
    const tip = k.polarityTips[part.type === 'capacitor' ? 'capacitor' : part.type] ?? '';
    const title = reversedTitle(part) === k.kinds.order ? k.orderWrong(ek(L, 'in'), placed) : k.reversedAt(L, placed);
    return `${title}${schematic}${tip ? ` ${tip}` : ''}`;
  }

  if (problem.inBox) {
    const [a, b] = pins;
    const between = twoLegs && a && b && ref(a.expected) && ref(b.expected) ? ` ${k.between(L, ref(a.expected)!, ref(b.expected)!)}` : '';
    return `${k.inBox(L)}${between}`;
  }

  // Bağlı değil ya da fazladan bağlantı: her yanlış bacak için bir cümle.
  return pins
    .map((p) => {
      const name = pinName(part, p.pin);
      const expected = ref(p.expected);
      if (p.hole === null) return `${k.unplugged(ek(L, 'in'), name)}${expected ? ` ${k.schematicWith(name, expected)}` : ''}`;
      if (p.joined) return `${k.joinedWrong(ek(L, 'in'), name, p.hole, ref(p.joined)!)}${expected ? ` ${k.schematicWith(name, expected)}` : ''}`;
      return expected ? k.notJoined(ek(L, 'in'), name, p.hole, expected) : k.floating(ek(L, 'in'), name, p.hole);
    })
    .join(' ');
}
