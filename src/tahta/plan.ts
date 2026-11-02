// Tahtada kur: öğrencinin kurulumunu 3B sahnenin anladığı yerleşime (BreadboardPlan) çevirir. Masadaki
// parçaların yeri ve kablo renkleri şemanın planından gelir; tahtadaki parçalar, ara kablolar ve takılı
// alet kabloları kurulumdan.

import { mountOf, netColors, planBreadboard, type BoardPart, type BreadboardPlan, type Hole, type Jumper, type Lead } from '../bench3d/breadboard';
import { parseHole } from '../bench3d/holes';
import type { Build, WireColor } from '../model/build';
import { pinKey } from '../model/connectivity';
import type { CircuitDoc } from '../model/types';

/** Ara kablo renkleri (3B tezgâhın ağ renkleriyle aynı tonlar). */
export const WIRE_HEX: Readonly<Record<WireColor, string>> = {
  red: '#d22f27',
  black: '#1b1c1f',
  orange: '#f08a24',
  yellow: '#f2c230',
  green: '#2f9e5b',
  blue: '#2f6fd6',
  purple: '#8e5bd1',
  white: '#e9ecef',
  teal: '#18a3a8',
  pink: '#d64b8a',
};

/** Kurulumun 3B yerleşimi; `schematic`: şemanın planı (masadaki yerler, kablo renkleri). */
export function planFromBuild(doc: CircuitDoc, build: Build, schematic: BreadboardPlan = planBreadboard(doc)): BreadboardPlan {
  const hole = (name: string): Hole | null => parseHole(name, build.cols);
  const onBoard = new Map<string, BoardPart>();
  for (const part of doc.parts) {
    const placed = build.parts[part.id];
    const mount = mountOf(part.type);
    if (!placed || !mount) continue;
    const holes = placed.holes.map(hole);
    if (holes.some((h) => h === null)) continue;
    const extra = (placed.extra ?? []).map(hole).filter((h): h is Hole => h !== null);
    onBoard.set(part.id, { partId: part.id, mount, holes: holes as Hole[], ...(extra.length > 0 ? { extraHoles: extra } : {}) });
  }
  const colorOf = netColors(schematic);
  const leads: Lead[] = [];
  for (const lead of build.leads) {
    const h = hole(lead.hole);
    if (!h || !schematic.table.has(lead.part)) continue;
    const net = schematic.netOf.get(pinKey(lead.part, lead.pin)) ?? `${lead.part}#${lead.pin}`;
    leads.push({ net, partId: lead.part, pin: lead.pin, hole: h, color: colorOf(net) });
  }
  const jumpers: Jumper[] = [];
  build.wires.forEach((wire, i) => {
    const a = hole(wire.a);
    const b = hole(wire.b);
    if (a && b) jumpers.push({ net: `tahta-kablo-${i}`, a, b, color: WIRE_HEX[wire.color] });
  });
  return { boards: 1, cols: build.cols, onBoard, table: schematic.table, jumpers, leads, netOf: schematic.netOf, roles: schematic.roles };
}
