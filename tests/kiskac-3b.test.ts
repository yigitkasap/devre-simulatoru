// 3B tezgâh: cihaz kabloları (güç kaynağı, osiloskop, fonksiyon üreteci, multimetre) timsah kıskaçla biter
// (8. madde): kıskaç ağdaki eksenli parçanın bacağını ya da ağın şeridine/rayına takılı kısa dik telin ucunu
// tutar; aynı ağdaki öbür cihaz kabloları onun üstüne zincirlenir, ayrı delik kullanmaz. Kıskaçlar, kısa teller,
// kıskaçtan çıkan kabloların başı, köprüler (jumper) ve fişler birbirinin içine girmez; fiş ve köprü gövdeleri
// bir delik aralığından (2,54 mm) dar (9. madde). Bütün örnekler (81).

import { describe, expect, it } from 'vitest';
import type { Vector3 } from 'three';
import { planBreadboard, type BreadboardPlan, type Hole } from '../src/bench3d/breadboard';
import { JUMPER_RADIUS } from '../src/bench3d/breadboardModel';
import { CLIP_DEVICES, CLIP_LEGS, clipJunctions } from '../src/bench3d/clipPlan';
import { CABLE_RADIUS, PLUG, STUB, collisions, layoutClips, type BoardBody, type ClipLayout } from '../src/bench3d/clips';
import { conductorOf } from '../src/bench3d/holes';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildFromPlan } from '../src/model/build';
import { pinKey } from '../src/model/connectivity';
import type { CircuitDoc } from '../src/model/types';
import { planFromBuild } from '../src/tahta/plan';

// Modeller (panel yazıları, ekranlar) tuval dokusu çizer: düğümde boş bir tuval yeter (yalnızca geometri gerekir).
const ctx2d: unknown = new Proxy(
  {},
  {
    get: (_t, key) =>
      key === 'measureText' ? () => ({ width: 10 }) : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : key === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => undefined,
    set: () => true,
  },
);
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };

const { placeBoardPart, placeTablePart } = await import('../src/bench3d/placement');

/** Sahnedeki gibi: parçalar yerleşir, kıskaçlar soketlere bakar. */
function bench(doc: CircuitDoc, plan: BreadboardPlan, chain: boolean): { layout: ClipLayout; bodies: Map<string, BoardBody> } {
  const bodies = new Map<string, BoardBody>();
  const anchors = new Map<string, Vector3[]>();
  for (const part of doc.parts) {
    const onBoard = plan.onBoard.get(part.id);
    const table = plan.table.get(part.id);
    if (onBoard) bodies.set(part.id, { body: placeBoardPart(part, onBoard, plan.cols).body });
    else if (table) anchors.set(part.id, placeTablePart(part, table).anchors);
  }
  const layout = layoutClips({ doc, plan, chain, bodies, socket: (i) => anchors.get(plan.leads[i]!.partId)?.[plan.leads[i]!.pin] });
  return { layout, bodies };
}

const key = (h: Hole) => (h.kind === 'strip' ? `${h.board}:s${h.col}:${h.row}` : `${h.board}:r${h.rail}:${h.k}`);

/** 3B'de dolu delikler: bacaklar, köprüler, kıskaçsız kablolar (fiş), kısa teller. */
function holes3d(plan: BreadboardPlan, layout: ClipLayout): string[] {
  return [
    ...[...plan.onBoard.values()].flatMap((p) => [...p.holes, ...(p.extraHoles ?? [])]),
    ...plan.jumpers.flatMap((j) => [j.a, j.b]),
    ...plan.leads.filter((_, i) => !layout.clips.has(i)).map((l) => l.hole),
    ...layout.stubs.map((s) => s.hole),
  ].map(key);
}

describe('3B: cihaz kabloları timsah kıskaçla', () => {
  it('fiş, köprü ve kısa tel bir delik aralığından dar', () => {
    expect(PLUG.width).toBeLessThan(1);
    expect(2 * JUMPER_RADIUS).toBeLessThan(1);
    expect(2 * STUB.radius).toBeLessThan(1);
    expect(2 * CABLE_RADIUS).toBeLessThan(1);
  });

  let total = 0;
  let clipped = 0;
  for (const id of EXAMPLE_IDS) {
    it(`${id}: her cihaz kablosu kıskaçla bağlı, delikte iki şey yok, çakışma yok`, () => {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      const { layout, bodies } = bench(doc, plan, true);
      const types = new Map(doc.parts.map((p) => [p.id, p.type]));
      plan.leads.forEach((lead, i) => {
        const device = CLIP_DEVICES.has(types.get(lead.partId)!);
        expect(layout.clips.has(i), `${id}: ${lead.partId}#${lead.pin}`).toBe(device);
      });
      // Zincir: ağ başına tek kıskaç bacağı ya da teli tutar; öbürleri bir kıskacı tutar ve aynı deliğe bağlıdır.
      const byNet = new Map<string, number>();
      for (const clip of layout.clips.values()) {
        expect(clip.net).toBe(plan.leads[clip.lead]!.net);
        if (clip.kind === 'chain') {
          const onto = layout.clips.get(clip.onto!)!;
          expect(onto.net).toBe(clip.net);
          expect(key(onto.hole)).toBe(key(clip.hole));
          continue;
        }
        byNet.set(clip.net, (byNet.get(clip.net) ?? 0) + 1);
        if (clip.kind === 'leg') {
          expect(CLIP_LEGS.has(types.get(clip.part!)!)).toBe(true);
          expect(plan.netOf.get(pinKey(clip.part!, clip.pin!))).toBe(clip.net);
          expect(key(plan.onBoard.get(clip.part!)!.holes[clip.pin!]!)).toBe(key(clip.hole));
        }
      }
      expect([...byNet.values()].every((n) => n === 1), `${id}: bir ağda tek bağlantı noktası`).toBe(true);
      expect(layout.junctions.map((j) => `${j.net}:${j.count}`).sort()).toEqual(clipJunctions(doc, plan).map((j) => `${j.net}:${j.count}`).sort());
      // Kısa tel ağın şeridinde ya da rayında (o iletkende ağın başka bir ucu var).
      const conductors = new Set([
        ...[...plan.onBoard].flatMap(([pid, p]) => p.holes.map((h, pin) => `${plan.netOf.get(pinKey(pid, pin))}@${conductorOf(h)}`)),
        ...plan.jumpers.flatMap((j) => [`${j.net}@${conductorOf(j.a)}`, `${j.net}@${conductorOf(j.b)}`]),
        ...plan.leads.map((l) => `${l.net}@${conductorOf(l.hole)}`),
      ]);
      for (const stub of layout.stubs) expect(conductors.has(`${stub.net}@${conductorOf(stub.hole)}`), `${id}: kısa tel ${key(stub.hole)}`).toBe(true);
      // 7. madde, 3B'de: bir delikte tek tel ya da tek bacak.
      const used = holes3d(plan, layout);
      expect(used.filter((h, i) => used.indexOf(h) !== i), `${id}: aynı delikte iki şey`).toEqual([]);
      // 9. madde: kıskaçlar, kısa teller, kabloların başı, köprüler ve fişler birbirinin içine girmez.
      const found = collisions(plan, layout, bodies);
      expect(found, `${id}: çakışma`).toEqual([]);
      total += found.length;
      clipped += layout.clips.size;
    });
  }

  it('toplam: çakışma 0, cihaz kablosu olan örneklerde kıskaçlar', () => {
    expect(total).toBe(0);
    expect(clipped).toBeGreaterThan(200);
  });

  it('Tahtada kur kurulumunda her cihaz kablosu kendi deliğindeki kısa teli tutar (zincir ve bacak yok)', () => {
    for (const id of ['jfet-karakteristik', 'yarim-dalga', 'diyot-dc'] as const) {
      const doc = exampleDoc(id)!;
      const schematic = planBreadboard(doc);
      const plan = planFromBuild(doc, buildFromPlan(schematic), schematic);
      const { layout, bodies } = bench(doc, plan, false);
      const devices = plan.leads.filter((l) => CLIP_DEVICES.has(doc.parts.find((p) => p.id === l.partId)!.type)).length;
      expect(layout.clips.size, id).toBe(devices);
      expect([...layout.clips.values()].every((c) => c.kind === 'stub'), id).toBe(true);
      expect(layout.stubs.map((s) => key(s.hole)).sort(), id).toEqual([...layout.clips.values()].map((c) => key(plan.leads[c.lead]!.hole)).sort());
      expect(collisions(plan, layout, bodies), id).toEqual([]);
    }
  });
});
