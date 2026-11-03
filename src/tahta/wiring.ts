// Tahtada kur: ara kablolar ve ölçü aleti (masadaki parça) kabloları (T2, 4 ve 5). Saf hesap.
//
// Kararlar (README → Tahtada kur, 6 ve 8): bir delikte tek bacak ya da tek kablo ucu; kablo rengi
// kendiliğinden (+ rayına giden kırmızı, − rayına giden siyah, öbürleri sırayla), araç çubuğundan değişir.

import type { Hole } from '../bench3d/breadboard';
import { holeLabel } from '../bench3d/holes';
import { autoWireColor, occupiedHoles, type Build, type WireColor } from '../model/build';

export type WireResult = { readonly ok: true; readonly build: Build } | { readonly ok: false; readonly reason: 'occupied' | 'same' };

/** İki delik arasına ara kablo; renk verilmezse kendiliğinden. */
export function addWire(build: Build, a: Hole, b: Hole, color?: WireColor): WireResult {
  const na = holeLabel(a, build.cols);
  const nb = holeLabel(b, build.cols);
  if (na === nb) return { ok: false, reason: 'same' };
  const used = occupiedHoles(build);
  if (used.has(na) || used.has(nb)) return { ok: false, reason: 'occupied' };
  return { ok: true, build: { ...build, wires: [...build.wires, { a: na, b: nb, color: color ?? autoWireColor(build, na, nb) }] } };
}

export function removeWire(build: Build, index: number): Build {
  return index >= 0 && index < build.wires.length ? { ...build, wires: build.wires.filter((_, i) => i !== index) } : build;
}

export function recolorWire(build: Build, index: number, color: WireColor): Build {
  const wire = build.wires[index];
  if (!wire || wire.color === color) return build;
  return { ...build, wires: build.wires.map((w, i) => (i === index ? { ...w, color } : w)) };
}

/** Masadaki parçanın ucunun kablosunu deliğe takar (takılıysa yeni deliğe taşır). */
export function plugLead(build: Build, part: string, pin: number, hole: Hole): WireResult {
  const name = holeLabel(hole, build.cols);
  const without = unplugLead(build, part, pin);
  if (occupiedHoles(without).has(name)) return { ok: false, reason: 'occupied' };
  return { ok: true, build: { ...without, leads: [...without.leads, { part, pin, hole: name }] } };
}

/** Kablo delikten çıkar (aletin önünde sarkar). */
export function unplugLead(build: Build, part: string, pin: number): Build {
  return build.leads.some((l) => l.part === part && l.pin === pin) ? { ...build, leads: build.leads.filter((l) => !(l.part === part && l.pin === pin)) } : build;
}
