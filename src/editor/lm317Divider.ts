// LM317 kartının "Neden bu değer?" notu için ayar dirençleri: OUT ile ADJ arasındaki direnç (R1) ve ADJ
// ile toprak arasındaki direnç (R2). Bu iki direnç doğrudan bulunamazsa (başka bir bağlantı) null.

import { pinKey } from '../model/connectivity';
import type { CircuitDoc, Part } from '../model/types';
import { numProp } from '../sim/netlist';
import type { NetIndex } from './analysis/traces';

export function lm317Divider(part: Part, doc: CircuitDoc, idx: NetIndex): { r1: number; r2: number } | null {
  const out = idx.netOf(pinKey(part.id, 2));
  const adj = idx.netOf(pinKey(part.id, 1));
  const ground = idx.ground;
  if (out === undefined || adj === undefined || ground === undefined) return null;
  const between = (a: number, b: number) =>
    doc.parts.find((p) => {
      if (p.type !== 'resistor') return false;
      const n0 = idx.netOf(pinKey(p.id, 0));
      const n1 = idx.netOf(pinKey(p.id, 1));
      return (n0 === a && n1 === b) || (n0 === b && n1 === a);
    });
  const r1 = between(out, adj);
  const r2 = between(adj, ground);
  return r1 && r2 ? { r1: numProp(r1.props, 'resistance', 0), r2: numProp(r2.props, 'resistance', 0) } : null;
}
