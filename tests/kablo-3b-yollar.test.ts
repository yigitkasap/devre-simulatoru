// "3B: kablolar üst üste binmez, yumuşak bükülür" (2026-11-14). 81 örnekte, serbest kamera yerleşiminde:
//   - herhangi iki kablonun (cihaz ve tahta dışı parça kabloları, Arduino'nun atlama kabloları, köprü telleri, direk
//     telleri) merkez çizgileri arasındaki en kısa uzaklık yarıçaplarının toplamından az değil: gövdeler birbirinin
//     içine girmez. Kablolarda yolun TAMAMI ölçülür (2026-11-15, "kablo uçları"): yol soketteki fişin ucunda başlar;
//     soketten masaya iniş ve şeride dönüş dahil, yalnızca direkteki muz fişin içine giren son 0,05 birim hariç.
//     Eskiden iki uçtan 0,3 birim sayılmıyordu;
//   - hiçbir köşenin bükülme yarıçapı sınırın altında değil: kablolarda 4 kablo çapı; tahtanın üstünde yatan tek
//     damarlı tellerde (köprü ve direk telleri) WIRE_BEND_MIN (deliğe inen köşe telin kartın üstündeki yüksekliğinden
//     büyük olamaz).

import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { BB, boardWidth, holeXZ, planBreadboard } from '../src/bench3d/breadboard';
import { JUMPER_RADIUS, jumperCurve } from '../src/bench3d/breadboardModel';
import { PolyCurve, pathDistance, roundPath, segmentDistance, trimPath, tubeGeometry } from '../src/bench3d/cablePath';
import { CABLE_BEND_MIN, CABLE_PITCH, CABLE_TABLE, cableJobs, compactSockets, routeArches, routeCables, wholeCable, type CableJob } from '../src/bench3d/cableRoutes';
import { CABLE_RADIUS, jumperShapes, type BoardBody } from '../src/bench3d/jumpers';
import { collisions } from '../src/bench3d/leadRoute';
import { placeBoardPart, placeTablePart } from '../src/bench3d/placement';
import { INSTRUMENTS, PLATE, POST_WIRE, WIRE_BEND_MIN, instrumentLeads, layoutPosts, plugEntry } from '../src/bench3d/posts';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';

// Modeller yazı dokusu çizer: düğümde boş bir tuval yeter (yalnızca geometri gerekir).
const ctx2d: unknown = new Proxy(
  {},
  {
    get: (_t, key) =>
      key === 'measureText' ? () => ({ width: 10 }) : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : key === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => undefined,
    set: () => true,
  },
);
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };

/** İnişte kablonun çekül doğrultusuna en çok yaklaşabileceği oran (|dy| / boy): 1 dikey iniş demektir. */
const DROP_PLUMB = 0.97;

/** Kırık çizgide, yön değiştiren ardışık üç noktadan geçen çemberlerin en küçük yarıçapı (düz kısımlar sayılmaz). */
function bendRadius(points: readonly Vector3[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[i]!.distanceTo(points[i - 1]!);
    const b = points[i + 1]!.distanceTo(points[i]!);
    const c = points[i + 1]!.distanceTo(points[i - 1]!);
    const turn = points[i]!.clone().sub(points[i - 1]!).angleTo(points[i + 1]!.clone().sub(points[i]!));
    if (turn < 1e-3) continue;
    const s = (a + b + c) / 2;
    const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
    if (area > 1e-12) min = Math.min(min, (a * b * c) / (4 * area));
  }
  return min;
}

interface Line {
  readonly name: string;
  readonly kind: 'cable' | 'wire';
  readonly r: number;
  readonly points: readonly Vector3[];
  /** Baştan ve sondan sayılmayan boy. Kabloda yol fişin ucunda başlar: baştan 0, sonda muz fişin içi; telde delik. */
  readonly skip: readonly [number, number];
}

/** Kablonun sonunda sayılmayan parça: direkteki muz fişin (ya da deliğe giren fişin) içi. */
const CABLE_SKIP = [0, 0.05] as const;
const WIRE_SKIP = [0.35, 0.35] as const;

/** Bir örneğin bütün kabloları ve telleri (sahnenin kurduğu gibi). */
function linesOf(id: (typeof EXAMPLE_IDS)[number], top = false) {
  const doc = exampleDoc(id)!;
  const plan = planBreadboard(doc);
  const layout = layoutPosts(doc, plan, plan);
  const table = new Map([...plan.table].map(([pid, at]) => [pid, placeTablePart(doc.parts.find((p) => p.id === pid)!, at)] as const));
  const boxOf = new Map([...table].map(([pid, placed]) => [pid, new Box3().setFromObject(placed.model.root)] as const));
  // Tepeden görünümde ön paneli soketli cihazların uçları tahtanın arkasındaki kartlardadır (sahnedeki gibi).
  const anchorsOf = new Map<string, readonly Vector3[]>([...table].map(([pid, placed]) => [pid, placed.anchors] as const));
  if (top) {
    const devices = [...table].filter(([, placed]) => placed.dirs.some(Boolean) && placed.anchors.length > 0);
    compactSockets(devices.map(([, placed]) => placed.anchors)).forEach((compact, i) => anchorsOf.set(devices[i]![0], compact));
  }
  const jobs = cableJobs(layout, (pid) => {
    const placed = table.get(pid);
    return placed ? { anchors: anchorsOf.get(pid)!, dirs: placed.dirs, box: boxOf.get(pid)!, instrument: INSTRUMENTS.has(doc.parts.find((p) => p.id === pid)!.type) } : undefined;
  });
  const live = jobs.flatMap((j) => (j ? [j] : []));
  const routed = routeCables(live, { plateHalf: boardWidth(plan.cols) / 2 + PLATE.margin, top, bodies: [...boxOf.values()] });
  const lines: Line[] = routed.routes.map((r, i) => ({ name: `kablo ${i} (${r.kind})`, kind: 'cable', r: CABLE_RADIUS, points: r.points, skip: CABLE_SKIP }));
  const holeTop = (h: Parameters<typeof holeXZ>[0]) => {
    const { x, z } = holeXZ(h, plan.cols);
    return new Vector3(x, BB.height, z);
  };
  // Arduino'nun atlama kabloları.
  const direct = plan.leads.flatMap((lead, i) => {
    const from = table.get(lead.partId)?.anchors[lead.pin];
    if (!from || layout.cables.some((c) => c.lead === i)) return [];
    return [{ a: from.clone().add(new Vector3(0, 1.4, 0)), b: holeTop(lead.hole).add(new Vector3(0, 1.5, 0)) }];
  });
  routeArches(direct, routed.routes.map((r) => r.points)).forEach((a, i) => lines.push({ name: `atlama ${i}`, kind: 'cable', r: CABLE_RADIUS, points: a.points, skip: CABLE_SKIP }));
  // Köprü telleri ve direk telleri.
  const bodies = new Map<string, BoardBody>(
    [...plan.onBoard].map(([pid, at]) => [pid, { body: placeBoardPart(doc.parts.find((p) => p.id === pid)!, at, plan.cols).body }] as const),
  );
  const wires = layout.wires.map((w) => w.points);
  const shapes = jumperShapes(plan, new Set(instrumentLeads(doc, plan)), undefined, wires, bodies);
  plan.jumpers.forEach((j, i) => lines.push({ name: `köprü ${i}`, kind: 'wire', r: JUMPER_RADIUS, points: jumperCurve(holeTop(j.a), holeTop(j.b), shapes[i]).points, skip: WIRE_SKIP }));
  wires.forEach((points, i) => lines.push({ name: `direk teli ${i}`, kind: 'wire', r: POST_WIRE.radius, points, skip: WIRE_SKIP }));
  // Sahnenin denetimi (scene.cableHits): tahta dışı parçanın kablosu masadaki parçaların gövdesinden geçmez.
  const boxes = [...boxOf].map(([pid, box]) => ({ pid, box }));
  const sideJobs = layout.cables.filter((_, k) => jobs[k]);
  const hits = routed.routes.flatMap((r, i) => {
    const partId = sideJobs[i]!.partId;
    if (r.kind !== 'side') return [];
    return collisions(new PolyCurve(r.points), boxes.map((o) => ({ box: o.box, own: o.pid === partId }))).length > 0 ? [`kablo ${i}`] : [];
  });
  const names = sideJobs.map((c) => `${c.partId}.${c.pin}`);
  return { lines, routed, live, hits, names };
}

describe('Yol yuvarlatma (cablePath)', () => {
  it('dik köşe istenen yarıçaplı çeyrek çemberle yuvarlanır; yay doğrulara teğet, noktalar çemberin üstünde', () => {
    const path = roundPath([new Vector3(0, 0, 0), new Vector3(10, 0, 0), new Vector3(10, 0, 10)], 2);
    expect(path.minRadius).toBeCloseTo(2, 9);
    expect(path.length).toBeCloseTo(8 + Math.PI + 8, 1);
    const center = new Vector3(8, 0, 2);
    const arc = path.points.filter((p) => p.x > 8 + 1e-9 && p.z < 2 - 1e-9);
    expect(arc.length).toBeGreaterThanOrEqual(6);
    for (const p of arc) expect(p.distanceTo(center)).toBeCloseTo(2, 9);
    expect(bendRadius(path.points)).toBeGreaterThan(1.98);
  });

  it('doğrular kısaysa yay küçülür ve ulaşılan yarıçap bildirilir; düz yolda köşe yok', () => {
    const tight = roundPath([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 1)], 2);
    expect(tight.minRadius).toBeCloseTo(1, 9);
    const jog = roundPath([new Vector3(0, 0, 0), new Vector3(5, 0, 0), new Vector3(5, 0, 0.6), new Vector3(10, 0, 0.6)], 2);
    expect(jog.minRadius).toBeCloseTo(0.3, 9);
    expect(roundPath([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(3, 0, 0)], 2).minRadius).toBe(Number.POSITIVE_INFINITY);
  });

  it('uzaklık ölçümü: kesişen parçalar 0, koşutlar aralıkları kadar; boru geometrisi nokta başına bir halka', () => {
    expect(segmentDistance(new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(1, 0, -1), new Vector3(1, 0, 1))).toBeCloseTo(0, 9);
    expect(segmentDistance(new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(0, 0.6, 0), new Vector3(2, 0.6, 0))).toBeCloseTo(0.6, 9);
    expect(pathDistance([new Vector3(0, 0, 0), new Vector3(4, 0, 0)], [new Vector3(2, 0.62, -3), new Vector3(2, 0.62, 3)])).toBeCloseTo(0.62, 9);
    expect(trimPath([new Vector3(0, 0, 0), new Vector3(4, 0, 0)], 1).map((p) => p.x)).toEqual([1, 3]);
    const pts = roundPath([new Vector3(0, 0, 0), new Vector3(4, 0, 0), new Vector3(4, 4, 0)], 1).points;
    const tube = tubeGeometry(pts, 0.28, 8);
    expect(tube.getAttribute('position').count).toBe(pts.length * 8);
    expect(tube.getIndex()!.count).toBe((pts.length - 1) * 8 * 6);
    expect(new PolyCurve(pts).getLength()).toBeCloseTo(3 + Math.PI / 2 + 3, 1);
  });
});

describe('3B kablo yolları (81 örnek)', () => {
  const all = EXAMPLE_IDS.map((id) => ({ id, ...linesOf(id) }));

  it('hiçbir iki kablonun ya da telin gövdesi birbirinin içine girmez: kabloda fiş hariç HER noktada merkez çizgileri arası ≥ kablo çapı (soketten iniş ve şeride dönüş dahil)', { timeout: 120000 }, () => {
    const bad: string[] = [];
    let closest = Number.POSITIVE_INFINITY;
    for (const { id, lines } of all) {
      const bodies = lines.map((l) => trimPath(l.points, l.skip[0], l.skip[1]));
      for (let i = 0; i < lines.length; i++) {
        for (let k = i + 1; k < lines.length; k++) {
          const need = lines[i]!.r + lines[k]!.r;
          const d = pathDistance(bodies[i]!, bodies[k]!, need);
          if (lines[i]!.kind === 'cable' && lines[k]!.kind === 'cable') closest = Math.min(closest, d);
          if (d < need) bad.push(`${id}: ${lines[i]!.name} ↔ ${lines[k]!.name} ${d.toFixed(2)} < ${need.toFixed(2)}`);
        }
      }
    }
    expect(bad.slice(0, 30)).toEqual([]);
    // Yan yana yatan kablolar: aralık kablo çapı ve küçük bir pay (şerit aralığı).
    expect(closest).toBeGreaterThanOrEqual(2 * CABLE_RADIUS);
    expect(closest).toBeLessThan(CABLE_PITCH + 0.05);
  });

  it('bükülme yarıçapı: kablolarda ≥ 4 kablo çapı; köprü ve direk tellerinde ≥ WIRE_BEND_MIN', () => {
    const bad: string[] = [];
    for (const { id, lines, routed } of all) {
      routed.routes.forEach((r, i) => {
        if (r.minRadius < CABLE_BEND_MIN) bad.push(`${id}: kablo ${i} (${r.kind}) yarıçap ${r.minRadius.toFixed(2)}`);
      });
      for (const l of lines) {
        const limit = l.kind === 'cable' ? CABLE_BEND_MIN : WIRE_BEND_MIN;
        const r = bendRadius(l.points);
        if (r < limit - 1e-6) bad.push(`${id}: ${l.name} yarıçap ${r.toFixed(3)} < ${limit}`);
      }
    }
    expect(CABLE_BEND_MIN).toBeCloseTo(4 * 2 * CABLE_RADIUS, 9);
    expect(bad.slice(0, 30)).toEqual([]);
  });

  it('koridor taşmaz; kablolar masanın altına inmez, masaya yatan kısım masanın hemen üstünde; her kablo kendi fişine girer', () => {
    for (const { id, routed, live } of all) {
      expect(routed.overflow, id).toBe(0);
      routed.routes.forEach((r, i) => {
        const job: CableJob = live[i]!;
        expect(r.points[r.points.length - 1]!.distanceTo(job.entry), `${id} kablo ${i}`).toBeLessThan(1e-6);
        // Tahta dışı parçanın ucu masadadır (pilin teli): kablo oradan masaya yatacak yüksekliğe çıkar.
        for (const p of wholeCable(r.points)) expect(p.y, `${id} kablo ${i}`).toBeGreaterThan(r.kind === 'side' ? 0.03 : CABLE_TABLE - 0.06);
      });
    }
  });

  it('tahta dışı parçaların kabloları masadaki parçaların gövdesinden geçmez (sahnenin cableHits denetimi, 81 örnek)', () => {
    const bad = all.flatMap(({ id, hits }) => hits.map((h) => `${id}: ${h}`));
    expect(bad).toEqual([]);
  });

  it('diyot-dc: multimetrelerin kırmızı ve siyah kabloları ayrı şeritlerde yan yana; eskiden aynı yoldan üst üste geçiyordu', () => {
    const { routed, live } = all.find((e) => e.id === 'diyot-dc')!;
    expect(routed.mode).toBe('flat');
    const lanes = routed.routes.filter((r) => r.kind === 'lane');
    expect(lanes.length).toBeGreaterThanOrEqual(4);
    // Aynı şeridi paylaşan kabloların x aralıkları ayrık; farklı şeritler bir şerit aralığı arayla.
    for (let i = 0; i < routed.routes.length; i++) {
      for (let k = i + 1; k < routed.routes.length; k++) {
        const d = pathDistance(wholeCable(routed.routes[i]!.points), wholeCable(routed.routes[k]!.points));
        expect(d, `${i}-${k}`).toBeGreaterThanOrEqual(CABLE_PITCH - 1e-6);
      }
    }
    // Soketi direğiyle aynı hizadaki kablo koridorun üstünden doğrudan gider.
    for (const [i, r] of routed.routes.entries()) if (r.kind === 'bridge') expect(Math.abs(live[i]!.from.x - live[i]!.entry.x)).toBeLessThan(5);
  });

  it('soketten iniş çapraz ve kavisli: hiçbir cihaz kablosu dikey inmez; iniş boyunca kablo hiçbir yerde çekül doğrultusunda değil (81 örnek)', () => {
    let lanes = 0;
    let steepest = 0;
    const bad: string[] = [];
    for (const { id, routed } of all) {
      expect(routed.steep, id).toBe(0);
      routed.routes.forEach((r, i) => {
        if (r.kind !== 'lane') return;
        lanes++;
        // İniş: yolun başından masaya (ya da üstüne yattığı kabloya) değdiği yere kadar.
        const end = r.points.findIndex((p) => p.y < CABLE_TABLE + 2 * CABLE_PITCH + 0.05);
        for (let k = 1; k <= end; k++) {
          const step = r.points[k]!.clone().sub(r.points[k - 1]!);
          const len = step.length();
          if (len < 1e-6) continue;
          const plumb = Math.abs(step.y) / len;
          steepest = Math.max(steepest, plumb);
          if (plumb > DROP_PLUMB) bad.push(`${id}: kablo ${i} ${plumb.toFixed(3)}`);
        }
      });
    }
    expect(lanes).toBeGreaterThan(150);
    expect(bad.slice(0, 20)).toEqual([]);
    expect(steepest).toBeLessThan(DROP_PLUMB);
  });

  it('diyot-dc: kablolar şeride sırayla, yan yana katılır (dış soket önde); iniş hiçbir kablonun üstünden geçmez; iniş köşeleri ≥ 4 kablo çapı', () => {
    const { routed, live, names } = all.find((e) => e.id === 'diyot-dc')!;
    expect(routed.joined).toBe(true);
    expect(routed.mode).toBe('flat');
    const lane = (name: string) => routed.routes[names.indexOf(name)]!.lane;
    const x = (name: string) => live[names.indexOf(name)]!.from.x;
    // Aynı cihazın iki soketi, aynı yöne: direğinden uzaktaki (dıştaki) soketin kablosu direklere yakın şeritte.
    const byPart = new Map<string, string[]>();
    for (const n of names) byPart.set(n.split('.')[0]!, [...(byPart.get(n.split('.')[0]!) ?? []), n]);
    let pairs = 0;
    for (const [, pins] of byPart) {
      if (pins.length !== 2) continue;
      const [a, b] = pins as [string, string];
      const post = (name: string) => live[names.indexOf(name)]!.entry.x;
      if (Math.sign(post(a) - x(a)) !== Math.sign(post(b) - x(b))) continue;
      const outer = Math.abs(post(a) - x(a)) + Math.abs(x(a) - x(b)) > Math.abs(post(a) - x(b)) + 1e-6 && (x(b) - x(a)) * Math.sign(post(a) - x(a)) > 0 ? a : b;
      const inner = outer === a ? b : a;
      expect(lane(outer), `${outer} önde, ${inner} arkada`).toBeLessThan(lane(inner));
      pairs++;
    }
    expect(pairs).toBe(3);
    // Ampermetrenin kabloları, önünden geçen voltmetre kablolarının arkasına (cihaz yanına) katılır.
    const meters = [...byPart.keys()].filter((part) => Math.min(...byPart.get(part)!.map(x)) > 0).sort((p, q) => x(byPart.get(p)![0]!) - x(byPart.get(q)![0]!));
    expect(meters.length).toBe(2);
    expect(Math.min(...byPart.get(meters[0]!)!.map(lane))).toBeGreaterThan(Math.max(...byPart.get(meters[1]!)!.map(lane)));
    // İniş (havadaki kısım) üstten bakınca masada yatan hiçbir kablonun üstünden geçmez.
    const flat = (p: Vector3) => new Vector3(p.x, 0, p.z);
    routed.routes.forEach((r, i) => {
      const land = r.points.findIndex((p) => p.y < CABLE_TABLE + 0.05);
      const air = r.points.slice(0, land + 1).map(flat);
      routed.routes.forEach((o, k) => {
        if (k === i) return;
        const first = o.points.findIndex((p) => p.y < CABLE_TABLE + 0.05);
        const last = o.points.length - 1 - [...o.points].reverse().findIndex((p) => p.y < CABLE_TABLE + 0.05);
        const lying = o.points.slice(first, last + 1).map(flat);
        expect(pathDistance(air, lying), `${names[i]} inişi ↔ ${names[k]} yatan`).toBeGreaterThanOrEqual(2 * CABLE_RADIUS);
      });
      expect(r.minRadius, names[i]).toBeGreaterThanOrEqual(CABLE_BEND_MIN);
    });
  });

  it('tepeden görünüm (Tahtada kur): cihaz kabloları kartın soketinden direğe kemer; kesişenler farklı yükseklikte, gövdeleri birbirine girmez; köşeler ≥ 4 kablo çapı (81 örnek)', { timeout: 120000 }, () => {
    const bad: string[] = [];
    let arcs = 0;
    for (const id of EXAMPLE_IDS) {
      const { routed } = linesOf(id, true);
      expect(routed.routes.every((r) => r.kind === 'arc' || r.kind === 'side'), id).toBe(true);
      const bodies = routed.routes.map((r) => wholeCable(r.points));
      routed.routes.forEach((r, i) => {
        if (r.kind === 'arc') arcs++;
        if (r.minRadius < CABLE_BEND_MIN) bad.push(`${id}: kablo ${i} (${r.kind}) yarıçap ${r.minRadius.toFixed(2)}`);
        for (let k = i + 1; k < routed.routes.length; k++) {
          const d = pathDistance(bodies[i]!, bodies[k]!, 2 * CABLE_RADIUS);
          if (d < 2 * CABLE_RADIUS) bad.push(`${id}: kablo ${i} (${r.kind}) ↔ kablo ${k} (${routed.routes[k]!.kind}) ${d.toFixed(2)}`);
        }
      });
    }
    expect(arcs).toBeGreaterThan(150);
    expect(bad.slice(0, 30)).toEqual([]);
  });

  it('fişe giriş: kablo fişe arkadan, yatay ve düz girer (posts.ts → plugEntry)', () => {
    const { routed, live } = all.find((e) => e.id === 'yarim-dalga')!;
    routed.routes.forEach((r, i) => {
      const n = r.points.length;
      const last = r.points[n - 1]!.clone().sub(r.points[n - 2]!).normalize();
      expect(last.z, `kablo ${i}`).toBeGreaterThan(0.999);
      expect(live[i]!.entry.z).toBeCloseTo(plugEntry({ x: 0, z: live[i]!.entry.z + 0.42 } as never, 0).z, 6);
    });
  });
});
