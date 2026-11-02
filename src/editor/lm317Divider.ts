// LM317 kartının "Neden bu değer?" notu: ayar dirençleri (OUT ile ADJ arasındaki R1, ADJ ile toprak
// arasındaki R2; doğrudan bulunamazsa null) ve onlarla formül.

import { tr } from '../i18n/tr';
import { pinKey } from '../model/connectivity';
import type { CircuitDoc, Part } from '../model/types';
import { LM317 } from '../sim/devices/regulator';
import { numProp } from '../sim/netlist';
import { formatSI } from '../sim/units';
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

/**
 * Formül sayılarla (Y3): V_{çıkış} = 1,25 V · (1 + R2 / R1) + I_ADJ · R2. Çıkış akımı başvuru gerilimini
 * yük regülasyonu kadar (RO · I) düşürür; bu, sonucu kartın gösterdiği basamakta değiştiriyorsa ikinci adım
 * olarak yazılır. Böylece sonuç, kartın Çıkış satırıyla (4 anlamlı basamak) aynı çıkar.
 */
export function lm317Note(divider: { readonly r1: number; readonly r2: number } | null, current: number): string | undefined {
  if (!divider || divider.r1 <= 0) return undefined;
  const ohm = (r: number) => formatSI(r, 'Ω', { trim: true, digits: 4 });
  const volts = (v: number) => formatSI(v, 'V', { digits: 4 });
  const gain = 1 + divider.r2 / divider.r1;
  const ideal = LM317.vset * gain + LM317.reference * divider.r2;
  const drop = LM317.ro * Math.max(0, current) * gain;
  const load = volts(ideal - drop) === volts(ideal) ? null : { current: formatSI(current, 'A', { digits: 4 }), drop: formatSI(drop, 'V'), vout: volts(ideal - drop) };
  return tr.readout.lm317Formula(ohm(divider.r1), ohm(divider.r2), formatSI(LM317.reference, 'A', { trim: true }), volts(ideal), load);
}
