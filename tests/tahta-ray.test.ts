// 3B tezgâh, "ray yalnızca kalabalık ağda" (2026-11-14): kaynak uçları da ölçü aleti uçları gibi bağlanır.
// Bütün örnekler (81).
//   1. Güç kaynağı, pil ve üreteç uçlarının teli, şemada bağlı olduğu bacağın şeridine iner (o bacağa en yakın boş
//      delik). 1N4001 DC'de PS1 + diyodun anot şeridinde, PS1 − direncin boştaki ucunun şeridinde; ray ve köprü yok.
//   2. Ray yalnızca kalabalık ağda: toprak ya da besleme ağına tahtada 3 ya da daha çok parça bacağı bağlıysa. 2 ya
//      da daha az bacaklı hiçbir ağ raya gitmez; iki bacağı varsa bacaklar aynı şeritte buluşur ya da şeritleri
//      doğrudan köprüyle bağlıdır.
//   3. Direk sırası, tellerin indiği deliklerin soldan sağa sırası; direk telleri birbirini kesmez.
//   4. Netlist şemayla aynı, Tahtada kur yeni planla çalışır (tahta-duzen.test.ts'teki testler de bunu denetler).

import { describe, expect, it } from 'vitest';
import { RAIL_FROM, holeXZ, planBreadboard, type BreadboardPlan, type Hole } from '../src/bench3d/breadboard';
import { conductorOf } from '../src/bench3d/holes';
import { POST_WIRE, instrumentLeads, layoutPosts } from '../src/bench3d/posts';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildFromPlan } from '../src/model/build';
import { pinKey } from '../src/model/connectivity';
import type { Part } from '../src/model/types';
import { checkBuild } from '../src/tahta/check';
import { planFromBuild } from '../src/tahta/plan';

const docs = EXAMPLE_IDS.map((id) => {
  const doc = exampleDoc(id)!;
  const plan = planBreadboard(doc);
  return { id, doc, plan, posts: layoutPosts(doc, plan), byId: new Map(doc.parts.map((p) => [p.id, p])) };
});

const at = (h: Hole) => (h.kind === 'strip' ? `${h.col}${'abcdefghij'[h.row]}` : `ray ${h.rail}:${h.k}`);
/** Bacağın şeridi dolduğu için komşu şeride inen kaynak ucu sayısının üst sınırı (81 örnekte). */
const SPILL_MAX = 0;
const SOURCES = new Set<Part['type']>(['dcsupply', 'battery', 'funcgen']);

/** Ağ → tahtadaki parça bacakları (delikleriyle). */
function legsOf(plan: BreadboardPlan, byId: ReadonlyMap<string, Part>): Map<string, Array<{ part: Part; pin: number; hole: Hole }>> {
  const out = new Map<string, Array<{ part: Part; pin: number; hole: Hole }>>();
  for (const [id, placed] of plan.onBoard) {
    placed.holes.forEach((hole, pin) => {
      const net = plan.netOf.get(pinKey(id, pin))!;
      out.set(net, [...(out.get(net) ?? []), { part: byId.get(id)!, pin, hole }]);
    });
  }
  return out;
}

/** Raya takılan her şey: alet ve Arduino kabloları, köprü uçları (ağıyla). */
function railUses(plan: BreadboardPlan): Array<{ net: string; what: string }> {
  const out: Array<{ net: string; what: string }> = [];
  for (const l of plan.leads) if (l.hole.kind === 'rail') out.push({ net: l.net, what: `${l.partId} uç ${l.pin} → ${at(l.hole)}` });
  for (const j of plan.jumpers) for (const h of [j.a, j.b]) if (h.kind === 'rail') out.push({ net: j.net, what: `köprü → ${at(h)}` });
  return out;
}

describe('3B: ray yalnızca kalabalık ağda', () => {
  it('2 ya da daha az bacaklı hiçbir ağ raya gitmez; raya giden her ağ toprak ya da besleme ve tahtada en az 3 bacağı var', () => {
    const bad: string[] = [];
    let railed = 0;
    let plain = 0;
    for (const { id, plan, byId } of docs) {
      const legs = legsOf(plan, byId);
      const onRail = new Set<string>();
      for (const use of railUses(plan)) {
        onRail.add(use.net);
        const count = (legs.get(use.net) ?? []).length;
        if (count < RAIL_FROM) bad.push(`${id}: ${count} bacaklı ağ rayda (${use.what})`);
        if (!plan.roles.has(use.net)) bad.push(`${id}: toprak ya da besleme olmayan ağ rayda (${use.what})`);
      }
      railed += onRail.size;
      // Kalabalık toprak ve besleme ağı rayda: her bacağının şeridi raya kısa bir köprüyle bağlı.
      for (const [net] of plan.roles) {
        const mine = legs.get(net) ?? [];
        if (mine.length < RAIL_FROM) {
          plain++;
          continue;
        }
        const strips = new Set(mine.map((l) => conductorOf(l.hole)));
        const bridged = new Set(plan.jumpers.filter((j) => j.net === net && (j.a.kind === 'rail') !== (j.b.kind === 'rail')).map((j) => conductorOf(j.a.kind === 'rail' ? j.b : j.a)));
        for (const s of strips) if (!bridged.has(s)) bad.push(`${id}: kalabalık ağın şeridi raya bağlı değil (${s})`);
      }
    }
    expect(bad.slice(0, 40)).toEqual([]);
    expect(RAIL_FROM).toBe(3);
    // Örneklerin çoğunda toprak ve besleme az bacaklı: ray kullanılmaz.
    expect(plain).toBeGreaterThan(60);
    expect(railed).toBeGreaterThan(15);
  });

  it('iki bacaklı toprak ve besleme ağında bacaklar aynı şeritte buluşur ya da şeritleri doğrudan köprüyle bağlıdır', () => {
    const bad: string[] = [];
    let together = 0;
    let bridged = 0;
    for (const { id, plan, byId } of docs) {
      const legs = legsOf(plan, byId);
      for (const [net] of plan.roles) {
        const mine = legs.get(net) ?? [];
        if (mine.length !== 2) continue;
        const [a, b] = mine.map((l) => conductorOf(l.hole)) as [string, string];
        if (a === b) {
          together++;
          continue;
        }
        bridged++;
        const direct = plan.jumpers.some((j) => j.net === net && new Set([conductorOf(j.a), conductorOf(j.b)]).size === 2 && [a, b].every((s) => [conductorOf(j.a), conductorOf(j.b)].includes(s)));
        if (!direct) bad.push(`${id}: iki bacak ne aynı şeritte ne de doğrudan köprüyle bağlı (${mine.map((l) => `${l.part.label} ${at(l.hole)}`).join(', ')})`);
      }
    }
    expect(bad).toEqual([]);
    expect(together).toBeGreaterThan(bridged);
  });

  it('kaynak uçları (güç kaynağı, pil, üreteç) şemada bağlı olduğu bacağın şeridinde; 1N4001 DC’de ray ve köprü yok', () => {
    const bad: string[] = [];
    let beside = 0;
    let onRail = 0;
    let spilled = 0;
    for (const { id, plan, byId } of docs) {
      const legs = legsOf(plan, byId);
      const used = new Set<string>();
      for (const p of plan.onBoard.values()) for (const h of [...p.holes, ...(p.extraHoles ?? [])]) used.add(`${conductorOf(h)}:${at(h)}`);
      for (const j of plan.jumpers) for (const h of [j.a, j.b]) used.add(`${conductorOf(h)}:${at(h)}`);
      for (const l of plan.leads) used.add(`${conductorOf(l.hole)}:${at(l.hole)}`);
      const full = (strip: string) => [...used].filter((k) => k.startsWith(`${strip}:`)).length >= 5;
      for (const lead of plan.leads) {
        const part = byId.get(lead.partId)!;
        if (!SOURCES.has(part.type)) continue;
        const mine = legs.get(lead.net) ?? [];
        if (mine.length === 0) continue;
        const name = `${id} ${part.label} uç ${lead.pin} → ${at(lead.hole)}`;
        if (plan.roles.has(lead.net) && mine.length >= RAIL_FROM) {
          // Kalabalık toprak ya da besleme: kaynak rayı besler.
          onRail++;
          if (lead.hole.kind !== 'rail') bad.push(`${name}: kalabalık ağda rayda değil`);
          continue;
        }
        if (lead.hole.kind === 'rail') {
          bad.push(`${name}: az bacaklı ağda rayda`);
          continue;
        }
        if (mine.some((l) => conductorOf(l.hole) === conductorOf(lead.hole))) beside++;
        else if (mine.every((l) => full(conductorOf(l.hole)))) spilled++;
        else bad.push(`${name}: bacağın şeridinde değil (bacaklar: ${mine.map((l) => `${l.part.label} ${at(l.hole)}`).join(', ')})`);
      }
    }
    expect(bad.slice(0, 40)).toEqual([]);
    expect(beside).toBeGreaterThan(100);
    expect(onRail).toBeGreaterThan(15);
    // Şeritte beş delik var: bacağın şeridi dolunca uç, o şeride köprüyle bağlı komşu şeride iner.
    expect(spilled).toBeLessThanOrEqual(SPILL_MAX);

    // Föydeki örnek: PS1 + diyodun anot şeridinde, PS1 − direncin boştaki ucunun şeridinde; ray ve köprü yok.
    const { plan, byId } = docs.find((d) => d.id === 'diyot-dc')!;
    const hole = (label: string, pin: number) => {
      const part = [...byId.values()].find((p) => p.label === label)!;
      return plan.onBoard.get(part.id)?.holes[pin] ?? plan.leads.find((l) => l.partId === part.id && l.pin === pin)!.hole;
    };
    expect(conductorOf(hole('PS1', 0))).toBe(conductorOf(hole('D1', 0)));
    expect(conductorOf(hole('PS1', 1))).toBe(conductorOf(hole('R1', 1)));
    expect(plan.jumpers).toEqual([]);
    expect(plan.leads.every((l) => l.hole.kind === 'strip')).toBe(true);
  });

  it('direk sırası tellerin indiği deliklerin soldan sağa sırası; direk telleri birbirini kesmez', () => {
    const bad: string[] = [];
    let wires = 0;
    let far = 0;
    for (const { id, plan, posts } of docs) {
      // Direkler soldan sağa: tellerinin tahtanın üstünde ilerlediği şeritler de soldan sağa. Şerit, deliğin
      // sütununun hemen yanındadır (üçte iki delik içinde); o yüzden deliklerin sütunları da soldan sağa. Tek
      // istisna kalabalık şerit (aynı şeride dört tel): tel komşu sütunun ötesindeki şeritten gelir.
      const order = posts.wires
        .map((w) => ({ x: posts.posts[w.post]!.x, lane: w.lane, hole: holeXZ(w.hole, plan.cols), name: posts.posts[w.post]!.name }))
        .sort((p, q) => p.x - q.x);
      for (let i = 1; i < order.length; i++) {
        const a = order[i - 1]!;
        const b = order[i]!;
        if (b.lane < a.lane + 0.29) bad.push(`${id}: ${a.name} direği ${b.name} direğinin solunda ama şeridi solunda değil`);
        const near = (o: { lane: number; hole: { x: number } }) => Math.abs(o.lane - o.hole.x) < 0.7;
        if (near(a) && near(b) && b.hole.x < a.hole.x - 1e-6) bad.push(`${id}: ${a.name} direği ${b.name} direğinin solunda ama teli daha sağdaki sütuna iniyor`);
        if (!near(b)) far++;
      }
      // Kesişme: iki telin yataydaki parçaları (kartın üstündeki yol) birbirine tel çapından fazla yaklaşmaz.
      const segments = posts.wires.map((w) => {
        const flat = w.points.slice(0, -1);
        return flat.slice(1).map((q, k) => ({ ax: flat[k]!.x, az: flat[k]!.z, bx: q.x, bz: q.z }));
      });
      wires += segments.length;
      for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
          const near = Math.min(...segments[i]!.flatMap((p) => segments[j]!.map((q) => segmentDistance(p, q))));
          if (near < 2 * POST_WIRE.radius - 1e-6) bad.push(`${id}: ${posts.posts[posts.wires[i]!.post]!.name} ve ${posts.posts[posts.wires[j]!.post]!.name} telleri kesişiyor (${near.toFixed(2)})`);
        }
      }
    }
    expect(bad.slice(0, 40)).toEqual([]);
    expect(wires).toBeGreaterThan(380);
    expect(far).toBeLessThanOrEqual(4);
  });

  it('Tahtada kur yeni planla çalışır: planın yerleşimi Denetle’den sorunsuz geçer, alet telleri direklerinden aynı deliklere', () => {
    let checked = 0;
    for (const { id, doc, plan, posts } of docs) {
      if (plan.boards > 1) continue;
      checked++;
      const build = buildFromPlan(plan);
      expect(checkBuild(doc, build, plan).problems, id).toEqual([]);
      const layout = layoutPosts(doc, planFromBuild(doc, build, plan), plan);
      expect(layout.wires.map((w) => at(w.hole)).sort(), id).toEqual(posts.wires.map((w) => at(w.hole)).sort());
      expect(instrumentLeads(doc, plan).length, id).toBe(posts.posts.length);
    }
    expect(checked).toBeGreaterThan(70);
  });
});

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** İki doğru parçası arasındaki en kısa uzaklık (yatay düzlem). */
function segmentDistance(p: Segment, q: Segment): number {
  const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;
  const d1 = cross(q.bx - q.ax, q.bz - q.az, p.ax - q.ax, p.az - q.az);
  const d2 = cross(q.bx - q.ax, q.bz - q.az, p.bx - q.ax, p.bz - q.az);
  const d3 = cross(p.bx - p.ax, p.bz - p.az, q.ax - p.ax, q.az - p.az);
  const d4 = cross(p.bx - p.ax, p.bz - p.az, q.bx - p.ax, q.bz - p.az);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  const point = (px: number, pz: number, s: Segment) => {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / len2));
    return Math.hypot(s.ax + dx * t - px, s.az + dz * t - pz);
  };
  return Math.min(point(p.ax, p.az, q), point(p.bx, p.bz, q), point(q.ax, q.az, p), point(q.bx, q.bz, p));
}
