// 3B tezgâh: cihaz kabloları (güç kaynağı, osiloskop, fonksiyon üreteci, multimetre) timsah kıskaçla biter
// (8. madde). Kıskaç hiçbir zaman parça bacağını tutmaz (2026-11-10): her cihaz kablosu ağın şeridindeki ya da
// rayındaki ayrı bir boş deliğe takılan kendi kısa telinin soyuk ucunu tutar; uygun delik yoksa kenar köprüsüyle
// boş bir şeride, o da yoksa zincir (en çok 2 kıskaç). Kıskaç neredeyse yatay (eğim ≤ 25°), ağzı kartın en az 8 mm
// üstünde, gerçek boyunda (BU-30C, 27,69 mm). Kıskaçlar, kısa teller, kenar köprüleri, kıskaçtan çıkan kabloların
// başı, köprüler (jumper) ve fişler birbirinin içine girmez; fiş ve köprü gövdeleri bir delik aralığından (2,54 mm)
// dar (9. madde). Bütün örnekler (81). Parçaların ekranda örtülmesi ios-kontrol'de gerçek kamerayla ölçülür.

import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { planBreadboard, type BreadboardPlan, type Hole } from '../src/bench3d/breadboard';
import { JUMPER_RADIUS } from '../src/bench3d/breadboardModel';
import { CLIP_DEVICES, clipJunctions } from '../src/bench3d/clipPlan';
import { CABLE_RADIUS, CLIP, MAX_ELEVATION, MIN_JAW_MM, PLUG, STUB, clipTail, collisions, holes3d, layoutClips, type BoardBody, type ClipLayout } from '../src/bench3d/clips';
import { BB } from '../src/bench3d/breadboard';
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
function bench(doc: CircuitDoc, plan: BreadboardPlan, schematic: boolean): { layout: ClipLayout; bodies: Map<string, BoardBody>; socket: (i: number) => Vector3 | undefined } {
  const bodies = new Map<string, BoardBody>();
  const anchors = new Map<string, Vector3[]>();
  for (const part of doc.parts) {
    const onBoard = plan.onBoard.get(part.id);
    const table = plan.table.get(part.id);
    if (onBoard) bodies.set(part.id, { body: placeBoardPart(part, onBoard, plan.cols).body });
    else if (table) anchors.set(part.id, placeTablePart(part, table).anchors);
  }
  const socket = (i: number) => anchors.get(plan.leads[i]!.partId)?.[plan.leads[i]!.pin];
  const layout = layoutClips({ doc, plan, schematic, bodies, socket });
  return { layout, bodies, socket };
}

const key = (h: Hole) => (h.kind === 'strip' ? `${h.board}:s${h.col}:${h.row}` : `${h.board}:r${h.rail}:${h.k}`);
const jawMm = (y: number) => (y - BB.height) * 2.54;
const elevation = (axis: Vector3) => (Math.asin(Math.min(1, Math.max(-1, axis.y))) * 180) / Math.PI;

describe('3B: cihaz kabloları timsah kıskaçla', () => {
  it('fiş, köprü ve kısa tel bir delik aralığından dar; kıskaç gerçek boyunda (BU-30C)', () => {
    expect(PLUG.width).toBeLessThan(1);
    expect(2 * JUMPER_RADIUS).toBeLessThan(1);
    expect(2 * STUB.radius).toBeLessThan(1);
    expect(2 * CABLE_RADIUS).toBeLessThan(1);
    expect(CLIP.length * 2.54).toBeCloseTo(27.69, 2);
    expect(CLIP.width * 2.54).toBeCloseTo(5.08, 2);
  });

  let total = 0;
  let clipped = 0;
  const kinds = new Map<string, number>();
  let lowest = Infinity;
  let steepest = -Infinity;
  for (const id of EXAMPLE_IDS) {
    it(`${id}: her cihaz kablosu kendi kısa telinde, delikte iki şey yok, çakışma yok, kıskaç yatay ve yüksekte`, () => {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      const { layout, bodies, socket } = bench(doc, plan, true);
      const types = new Map(doc.parts.map((p) => [p.id, p.type]));
      plan.leads.forEach((lead, i) => {
        const device = CLIP_DEVICES.has(types.get(lead.partId)!);
        expect(layout.clips.has(i), `${id}: ${lead.partId}#${lead.pin}`).toBe(device);
      });
      // Kısa tel ağın şeridinde ya da rayında; köprülüyse köprünün öbür ucu ağın iletkeninde.
      const conductors = new Set([
        ...[...plan.onBoard].flatMap(([pid, p]) => p.holes.map((h, pin) => `${plan.netOf.get(pinKey(pid, pin))}@${conductorOf(h)}`)),
        ...plan.jumpers.flatMap((j) => [`${j.net}@${conductorOf(j.a)}`, `${j.net}@${conductorOf(j.b)}`]),
        ...plan.leads.map((l) => `${l.net}@${conductorOf(l.hole)}`),
      ]);
      for (const b of layout.bridges) {
        expect(conductors.has(`${b.net}@${conductorOf(b.a)}`), `${id}: köprü ${key(b.a)}`).toBe(true);
        expect(conductors.has(`${b.net}@${conductorOf(b.b)}`), `${id}: köprünün ucu boş şeritte ${key(b.b)}`).toBe(false);
      }
      const bridged = new Set(layout.bridges.map((b) => `${b.net}@${conductorOf(b.b)}`));
      for (const clip of layout.clips.values()) {
        expect(clip.net).toBe(plan.leads[clip.lead]!.net);
        // Kıskaç bacak tutmaz: ya kendi kısa telini ya da (zincirde) aynı ağdaki bir kıskacı tutar.
        expect(['stub', 'bridge', 'chain']).toContain(clip.kind);
        if (clip.kind === 'chain') {
          const onto = layout.clips.get(clip.onto!)!;
          expect(onto.net).toBe(clip.net);
          expect(onto.kind, `${id}: zincir en çok 2 kıskaç`).not.toBe('chain');
          continue;
        }
        const stubs = layout.stubs.filter((s) => s.lead === clip.lead);
        expect(stubs.length, `${id}: ${clip.lead} kendi kısa teli`).toBe(1);
        expect(key(stubs[0]!.hole)).toBe(key(clip.hole));
        const on = `${clip.net}@${conductorOf(clip.hole)}`;
        expect(conductors.has(on) || bridged.has(on), `${id}: kısa tel ${key(clip.hole)}`).toBe(true);
        if (clip.kind === 'bridge') expect(layout.bridges.some((b) => b.lead === clip.lead && conductorOf(b.b) === conductorOf(clip.hole)), `${id}: ${clip.lead} köprüsü`).toBe(true);
      }
      const chains = [...layout.clips.values()].filter((c) => c.kind === 'chain').map((c) => c.onto);
      expect(new Set(chains).size, `${id}: bir kıskaca en çok bir kıskaç`).toBe(chains.length);
      // Kıskaç neredeyse yatay, ağzı kartın en az 8 mm üstünde; kuyruğu kendi cihazından yana (90°'den az sapma).
      for (const clip of layout.clips.values()) {
        expect(jawMm(clip.jaw.y), `${id}: ${clip.lead} ağız`).toBeGreaterThanOrEqual(MIN_JAW_MM);
        expect(elevation(clip.axis), `${id}: ${clip.lead} eğim`).toBeLessThanOrEqual(MAX_ELEVATION + 1e-6);
        const s = socket(clip.lead)!;
        const toward = new Vector3(s.x - clip.jaw.x, 0, s.z - clip.jaw.z).normalize();
        expect(new Vector3(clip.axis.x, 0, clip.axis.z).normalize().dot(toward), `${id}: ${clip.lead} kuyruk cihaza`).toBeGreaterThan(0);
        expect(clipTail(clip).distanceTo(clip.jaw) * 2.54).toBeCloseTo(27.69, 2);
        lowest = Math.min(lowest, jawMm(clip.jaw.y));
        steepest = Math.max(steepest, elevation(clip.axis));
        kinds.set(clip.kind, (kinds.get(clip.kind) ?? 0) + 1);
      }
      // Birden çok cihaz kablosunun gittiği ağların etiketi.
      expect(layout.junctions.map((j) => `${j.net}:${j.count}`).sort()).toEqual(clipJunctions(doc, plan).map((j) => `${j.net}:${j.count}`).sort());
      // 7. madde, 3B'de: bir delikte tek tel ya da tek bacak (kısa teller ve kenar köprüleri dahil).
      const used = holes3d(plan, layout);
      expect(used.filter((h, i) => used.indexOf(h) !== i), `${id}: aynı delikte iki şey`).toEqual([]);
      // 9. madde: kıskaçlar, kısa teller, kenar köprüleri, kabloların başı, köprüler ve fişler birbirinin içine girmez.
      const found = collisions(plan, layout, bodies);
      expect(found, `${id}: çakışma`).toEqual([]);
      total += found.length;
      clipped += layout.clips.size;
    });
  }

  // Zincir son çare: 81 örnekte yalnızca opamp-evirmeyen'de bir kez (V1'in + kablosu: ağın tek şeridi işlemsel
  // yükselticinin önünde, boş deliklerdeki tel ya da kıskaç onu örtüyor, kenar köprüleri planın köprülerine çarpıyor).
  it('toplam: çakışma 0, cihaz kablosu olan örneklerde kıskaçlar; zincir en çok bir kez', () => {
    expect(total).toBe(0);
    expect(clipped).toBeGreaterThan(200);
    expect(lowest).toBeGreaterThanOrEqual(MIN_JAW_MM);
    expect(steepest).toBeLessThanOrEqual(MAX_ELEVATION + 1e-6);
    expect(kinds.get('chain') ?? 0).toBeLessThanOrEqual(1);
    expect(kinds.get('stub') ?? 0).toBeGreaterThan(200);
  });

  it('Tahtada kur kurulumunda her cihaz kablosu kendi deliğindeki kısa teli tutar (zincir ve köprü yok)', () => {
    for (const id of ['jfet-karakteristik', 'yarim-dalga', 'diyot-dc'] as const) {
      const doc = exampleDoc(id)!;
      const schematic = planBreadboard(doc);
      const plan = planFromBuild(doc, buildFromPlan(schematic), schematic);
      const { layout, bodies } = bench(doc, plan, false);
      const devices = plan.leads.filter((l) => CLIP_DEVICES.has(doc.parts.find((p) => p.id === l.partId)!.type)).length;
      expect(layout.clips.size, id).toBe(devices);
      expect([...layout.clips.values()].every((c) => c.kind === 'stub'), id).toBe(true);
      expect(layout.bridges, id).toEqual([]);
      expect(layout.junctions, id).toEqual([]);
      expect(layout.stubs.map((s) => key(s.hole)).sort(), id).toEqual([...layout.clips.values()].map((c) => key(plan.leads[c.lead]!.hole)).sort());
      expect(collisions(plan, layout, bodies), id).toEqual([]);
      for (const clip of layout.clips.values()) expect(jawMm(clip.jaw.y), id).toBeGreaterThanOrEqual(MIN_JAW_MM);
    }
  });
});
