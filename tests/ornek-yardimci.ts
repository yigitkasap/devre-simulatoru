// Hazır örnekleri simülasyonda çalıştıran testler için ortak yardımcılar (föy örnekleri ve föy kartları).

import { expect } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';

export function load(id: ExampleId): CircuitDoc {
  const doc = exampleDoc(id);
  expect(doc, id).not.toBeNull();
  return doc!;
}

export const idOf = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;

export function run(doc: CircuitDoc, until: number): CircuitSimulator {
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  expect(sim.runUntil(until).ok).toBe(true);
  return sim;
}

export function withProps(doc: CircuitDoc, label: string, props: Record<string, number | boolean | string>): CircuitDoc {
  const part = doc.parts.find((p) => p.label === label)!;
  return updatePart(doc, part.id, { props: { ...part.props, ...props } });
}

/** `duration` boyunca küçük adımlarla ilerleyip bir büyüklüğün uç değerlerini bulur. */
export function swing(sim: CircuitSimulator, value: () => number, duration: number, slice = 2e-5): { max: number; min: number } {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  const end = sim.time + duration;
  while (sim.time < end - 1e-15) {
    expect(sim.advance(slice).ok).toBe(true);
    const v = value();
    max = Math.max(max, v);
    min = Math.min(min, v);
  }
  return { max, min };
}

/** Parça ucunun düğümü (netlist bağlantıları birleştirilmiş): iki uç aynı düğümde mi diye bakmak için. */
export function nodeOf(doc: CircuitDoc): (label: string, pin: number) => string {
  const { netlist } = buildConnectivity(doc);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const up = parent.get(x) ?? x;
    if (up === x) return x;
    const root = find(up);
    parent.set(x, root);
    return root;
  };
  for (const l of netlist.links) parent.set(find(l.a), find(l.b));
  return (label, pin) => find(netlist.elements.find((e) => e.id === idOf(doc, label))!.pins[pin]!);
}

export const between = (value: number, lo: number, hi: number) => {
  expect(value).toBeGreaterThan(lo);
  expect(value).toBeLessThan(hi);
};
