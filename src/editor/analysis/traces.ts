// İzlerin adları ve şemadaki yerleri: düğüm gerilimi V(C1) ("C1 gerilimi"), parça akımı I(R1),
// fark gerilimi V(C1, R1 1). Düğümün adı o ağa bağlı bir parçadan gelir: öbür ucu toprakta olan iki
// uçlu parça varsa onun adı, yoksa ilk parçanın adı ve ucu.

import { tr } from '../../i18n/tr';
import type { TraceDef } from '../../model/analysis';
import type { Connectivity } from '../../model/connectivity';
import type { CircuitDoc, Part } from '../../model/types';

export interface NetIndex {
  /** Anahtar (pin ya da kablo) → ağ numarası. */
  readonly netOf: (key: string) => number | undefined;
  /** Ağdaki pinler: parça ve uç numarası. */
  readonly pins: (net: number) => readonly { readonly part: Part; readonly pin: number }[];
  readonly ground: number | undefined;
}

export function netIndex(doc: CircuitDoc, conn: Connectivity): NetIndex {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    let c = k;
    while (c !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const e of conn.netlist.elements) for (const p of e.pins) if (!parent.has(p)) parent.set(p, p);
  for (const l of conn.netlist.links) union(l.a, l.b);
  const ids = new Map<string, number>();
  const netOf = (key: string): number | undefined => {
    if (!parent.has(key)) return undefined;
    const root = find(key);
    let id = ids.get(root);
    if (id === undefined) ids.set(root, (id = ids.size));
    return id;
  };
  const byNet = new Map<number, { part: Part; pin: number }[]>();
  const parts = new Map(doc.parts.map((p) => [p.id, p]));
  for (const e of conn.netlist.elements) {
    const part = parts.get(e.id);
    if (!part) continue;
    e.pins.forEach((key, pin) => {
      const net = netOf(key)!;
      let list = byNet.get(net);
      if (!list) byNet.set(net, (list = []));
      list.push({ part, pin });
    });
  }
  const groundPart = doc.parts.find((p) => p.type === 'ground');
  const ground = groundPart ? netOf(`${groundPart.id}#0`) : undefined;
  return { netOf, pins: (net) => byNet.get(net) ?? [], ground };
}

/** Düğüme ad verecek parçanın önceliği: yarı iletken ve entegre uçları, sonra öbürleri, en son ölçü aletleri ve kaynaklar. */
const RANK: Partial<Record<Part['type'], number>> = { npn: 0, pnp: 0, njfet: 0, pjfet: 0, nmos: 0, pmos: 0, opamp: 0, timer555: 0, oscilloscope: 2, voltmeter: 2, ammeter: 2, funcgen: 2, dcsupply: 2, acsource: 2, battery: 2 };
const byLabel = (a: { part: Part }, b: { part: Part }) => (RANK[a.part.type] ?? 1) - (RANK[b.part.type] ?? 1) || a.part.label.localeCompare(b.part.label, 'tr', { numeric: true });

/** Düğümün adı ("C1" ya da "Q1 C"); toprak ağıysa "0". */
export function nodeName(key: string, idx: NetIndex): string {
  const net = idx.netOf(key);
  if (net === undefined) return '?';
  if (net === idx.ground) return '0';
  const pins = idx.pins(net).filter((p) => p.part.type !== 'ground').sort(byLabel);
  // Öbür ucu toprakta olan iki uçlu parça: V(C1).
  for (const p of pins) {
    if (pinCount(p.part, idx) !== 2) continue;
    const other = idx.netOf(`${p.part.id}#${1 - p.pin}`);
    if (other !== undefined && other === idx.ground) return p.part.label;
  }
  const first = pins[0];
  if (!first) return '?';
  const short = tr.devices.pinShort[first.part.type]?.[first.pin];
  return short ? `${first.part.label} ${short}` : `${first.part.label} ${first.pin + 1}`;
}

function pinCount(part: Part, idx: NetIndex): number {
  let n = 0;
  while (idx.netOf(`${part.id}#${n}`) !== undefined) n++;
  return n;
}

export interface TraceLabel {
  /** Kısa ad: V(C1), I(R1), V(C1, R1 1). */
  readonly name: string;
  /** Açıklama: "C1 gerilimi", "R1 akımı". */
  readonly detail: string;
  readonly unit: 'V' | 'A';
}

export function traceLabel(trace: TraceDef, doc: CircuitDoc, idx: NetIndex): TraceLabel {
  const t = tr.analysis.trace;
  if (trace.kind === 'current') {
    const part = doc.parts.find((p) => p.id === trace.part);
    const label = part?.label ?? '?';
    return { name: `I(${label})`, detail: t.current(label), unit: 'A' };
  }
  const a = nodeName(trace.node, idx);
  if (trace.ref === null) return { name: `V(${a})`, detail: t.voltage(a), unit: 'V' };
  const b = nodeName(trace.ref, idx);
  return { name: `V(${a}, ${b})`, detail: t.difference(a, b), unit: 'V' };
}

/** Belgede artık olmayan parça ya da düğüme bağlı izler atılır. */
export function liveTraces(traces: readonly TraceDef[], doc: CircuitDoc, idx: NetIndex): TraceDef[] {
  return traces.filter((t) => (t.kind === 'current' ? doc.parts.some((p) => p.id === t.part) : idx.netOf(t.node) !== undefined && (t.ref === null || idx.netOf(t.ref) !== undefined)));
}

/** İzin şemadaki rengi (tema belirteci). */
export const traceColor = (color: number): string => `var(--color-tr-${color + 1})`;
