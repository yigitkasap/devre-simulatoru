// 3B tezgâh, "tahta düzeni" (2026-11-14): tahta şema gibi okunur. Bütün örnekler (81).
//   1. Her alet ucunun kendi direği: direkler ağa göre değil, alet ucuna göre; adı alet ucunun adı.
//   2. Her alet ucunun teli, şemada bağlı olduğu bacağın şeridinde, o bacağa en yakın boş delikte. Voltmetrenin iki
//      teli ölçtüğü parçanın iki bacağının yanında. Kaynakların toprak ve besleme uçları raylarda.
//   3. Seri bağlı komşu parçalar aynı yarıda, şemadaki sırayla soldan sağa; ampermetrenin girdiği yerde bir şerit boş.
//   4. Tahtadaki elektriksel bağlantı (delikler, şeritler, raylar, köprüler) şemanın ağlarıyla bire bir aynı.
//   5. Tahtada kur yeni planla çalışır; Karta aktar (plaket, baskı devre, KiCad) eski planında kalır, çıktısı değişmez.

import { describe, expect, it } from 'vitest';
import { isOnBoard, planBreadboard, planCard, planSpan, type BreadboardPlan, type Hole } from '../src/bench3d/breadboard';
import { conductorOf } from '../src/bench3d/holes';
import { DMM_FIT, DMM_SHRINK, INSTRUMENT_SCALE } from '../src/bench3d/instruments';
import { designPcb, kicadPcb } from '../src/bench3d/kicad';
import { instrumentLeads, layoutPosts, posted, postKey } from '../src/bench3d/posts';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildFromPlan } from '../src/model/build';
import { pinKey } from '../src/model/connectivity';
import type { CircuitDoc, Part } from '../src/model/types';
import { checkBuild } from '../src/tahta/check';
import { planFromBuild } from '../src/tahta/plan';
import kicadSums from './veri/veri-kicad-ozet.json';

const docs = EXAMPLE_IDS.map((id) => {
  const doc = exampleDoc(id)!;
  const plan = planBreadboard(doc);
  return { id, doc, plan, posts: layoutPosts(doc, plan), byId: new Map(doc.parts.map((p) => [p.id, p])) };
});

/** Akım taşımayan (yalnızca gerilim ölçen) aletler: seri yolu bölmezler. */
const sensing = (p: Part) => p.type === 'voltmeter' || p.type === 'oscilloscope' || (p.type === 'multimeter' && p.props.mode !== 'a');
/** Seri bağlanan ölçü aleti. */
const through = (p: Part) => p.type === 'ammeter' || (p.type === 'multimeter' && p.props.mode === 'a');
/** Ölçen uç: bağlı olduğu bacağın yanına gelir (kaynakların ve yüklerin toprak, besleme uçları raya gider). */
const measures = (p: Part, pin: number) => p.type === 'voltmeter' || p.type === 'ammeter' || p.type === 'multimeter' || (p.type === 'oscilloscope' && pin < 2);
/** İki bacaklı tahta parçası (direnç, diyot, kondansatör, LED, anahtar…). */
const twoLeg = (p: Part) => planSpan(p.type) !== undefined;

/** Kaynakların + uçları (zincir kaynak yanından başlar). */
const PLUS: Partial<Record<Part['type'], readonly number[]>> = { battery: [0], dcsupply: [0, 2], funcgen: [0, 1], acsource: [0] };

interface Leg {
  readonly part: Part;
  readonly pin: number;
  readonly hole: Hole & { kind: 'strip' };
}

/** Ağ → tahtadaki bacaklar. */
function legsOf(plan: BreadboardPlan, byId: ReadonlyMap<string, Part>): Map<string, Leg[]> {
  const out = new Map<string, Leg[]>();
  for (const [id, at] of plan.onBoard) {
    at.holes.forEach((hole, pin) => {
      if (hole.kind !== 'strip') return;
      const net = plan.netOf.get(pinKey(id, pin))!;
      out.set(net, [...(out.get(net) ?? []), { part: byId.get(id)!, pin, hole }]);
    });
  }
  return out;
}

/** Ağ → akım taşıyan uçlar (voltmetre ve osiloskop dışında her şey). */
function carriersOf(plan: BreadboardPlan, byId: ReadonlyMap<string, Part>): Map<string, Array<{ part: Part; pin: number }>> {
  const out = new Map<string, Array<{ part: Part; pin: number }>>();
  for (const [key, net] of plan.netOf) {
    const [id, pin] = key.split('#');
    const part = byId.get(id!);
    if (!part || sensing(part)) continue;
    out.set(net, [...(out.get(net) ?? []), { part, pin: Number(pin) }]);
  }
  return out;
}

/** Tahtada dolu delikler: bacaklar, boş DIP bacakları, köprü uçları, alet ve Arduino kabloları. */
function usedHoles(plan: BreadboardPlan): Set<string> {
  const key = (h: Hole) => (h.kind === 'strip' ? `${h.board}:${h.col}:${h.row}` : `${h.board}:r${h.rail}:${h.k}`);
  const out = new Set<string>();
  for (const p of plan.onBoard.values()) for (const h of [...p.holes, ...(p.extraHoles ?? [])]) out.add(key(h));
  for (const j of plan.jumpers) for (const h of [j.a, j.b]) out.add(key(h));
  for (const l of plan.leads) out.add(key(l.hole));
  return out;
}

const halfOf = (h: Hole & { kind: 'strip' }) => (h.row < 5 ? 0 : 1);
const rowsOf = (half: number) => (half === 0 ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]);
const at = (h: Hole) => (h.kind === 'strip' ? `${h.col}${'abcdefghij'[h.row]}` : `ray ${h.rail}:${h.k}`);

describe('3B: tahta düzeni (tahta şema gibi okunur)', () => {
  it('her alet ucunun kendi direği: aynı ağa giden iki alet ucu ayrı direklerde, ayrı tellerle; direğin adı alet ucunun adı', () => {
    let shared = 0;
    for (const { id, doc, plan, posts, byId } of docs) {
      const leads = instrumentLeads(doc, plan).map((i) => plan.leads[i]!);
      expect(posts.posts.length, id).toBe(leads.length);
      expect(new Set(posts.posts.map((p) => postKey(p))).size, id).toBe(leads.length);
      expect(posts.wires.length, id).toBe(leads.length);
      // Aynı ağda birden çok alet ucu: her birinin kendi direği, kendi teli, kendi deliği.
      const perNet = new Map<string, number>();
      for (const l of leads) perNet.set(l.net, (perNet.get(l.net) ?? 0) + 1);
      for (const [net, count] of perNet) {
        if (count < 2) continue;
        shared++;
        const mine = posts.posts.filter((p) => p.net === net);
        expect(mine.length, `${id}: ağdaki direk sayısı`).toBe(count);
        expect(new Set(mine.map((p) => p.x)).size, id).toBe(count);
        expect(new Set(posts.wires.filter((w) => w.net === net).map((w) => at(w.hole))).size, id).toBe(count);
      }
      for (const p of posts.posts) {
        const part = byId.get(p.partId)!;
        const label = part.label;
        if (part.type === 'voltmeter' || part.type === 'ammeter' || part.type === 'multimeter' || part.type === 'battery') expect(p.name, id).toBe(`${label} ${p.pin === 0 ? '+' : '−'}`);
        else if (part.type === 'dcsupply') expect(p.name, id).toMatch(new RegExp(`^${label} [12]?${p.pin % 2 === 0 ? '\\+' : '−'}$`));
        else if (part.type === 'funcgen') expect(p.name, id).toBe(`${label} ${['OUT', 'TTL', 'COM'][p.pin]}`);
        else if (part.type === 'oscilloscope') expect(p.name, id).toMatch(p.pin < 2 ? new RegExp(`^CH${p.pin + 1}$`) : /^CH[12]? ?toprak$/);
        else expect(p.name.startsWith(`${label} `), `${id} ${p.name}`).toBe(true);
      }
    }
    expect(shared).toBeGreaterThan(60);
    const names = (id: string) => docs.find((d) => d.id === id)!.posts.posts.map((p) => p.name).sort();
    expect(names('diyot-dc')).toEqual(['A1 +', 'A1 −', 'PS1 +', 'PS1 −', 'V1 +', 'V1 −']);
    expect(names('toprak-tuzagi')).toEqual(['CH1', 'CH1 toprak', 'FG1 COM', 'FG1 OUT']);
    expect(names('bjt-yukseltec-kuplajli')).toEqual(['CH toprak', 'CH1', 'CH2', 'FG1 COM', 'FG1 OUT', 'PS1 +', 'PS1 −']);
    expect(names('jfet-karakteristik')).toEqual(['A1 +', 'A1 −', 'PS1 1+', 'PS1 1−', 'PS1 2+', 'PS1 2−', 'V1 +', 'V1 −']);
  });

  it('her alet ucunun teli şemada bağlı olduğu bacağın şeridinde, o bacağa en yakın boş delikte; kaynakların toprak ve besleme uçları rayda', () => {
    const bad: string[] = [];
    let beside = 0;
    let rails = 0;
    let bare = 0;
    for (const { id, doc, plan, posts, byId } of docs) {
      const legs = legsOf(plan, byId);
      const used = usedHoles(plan);
      for (const i of instrumentLeads(doc, plan)) {
        const lead = plan.leads[i]!;
        const part = byId.get(lead.partId)!;
        const name = `${id} ${part.label} uç ${lead.pin} → ${at(lead.hole)}`;
        // Direğin teli planın bu uca verdiği deliğe gider.
        const wire = posts.wires.find((w) => w.leads[0] === i)!;
        expect(wire.hole, name).toEqual(lead.hole);
        const role = plan.roles.get(lead.net);
        const netLegs = legs.get(lead.net) ?? [];
        if (role && (!measures(part, lead.pin) || netLegs.length === 0)) {
          // Toprak − rayına, besleme + rayına (üst raylar: 0 +, 1 −).
          rails++;
          if (!(lead.hole.kind === 'rail' && lead.hole.rail === (role === 'supply' ? 0 : 1))) bad.push(`${name}: ${role === 'supply' ? '+' : '−'} rayında değil`);
          continue;
        }
        if (netLegs.length === 0) {
          // Ağın tahtada bacağı yok (iki alet ya da tahta dışı parça arasında): boş bir şeritte buluşurlar.
          bare++;
          if (lead.hole.kind !== 'strip') bad.push(`${name}: şeritte değil`);
          continue;
        }
        beside++;
        const hole = lead.hole;
        if (hole.kind !== 'strip') {
          bad.push(`${name}: bacağın şeridinde değil (rayda)`);
          continue;
        }
        const sameStrip = netLegs.filter((l) => conductorOf(l.hole) === conductorOf(hole));
        if (sameStrip.length === 0) {
          bad.push(`${name}: ağın hiçbir bacağıyla aynı şeritte değil (bacaklar: ${netLegs.map((l) => `${l.part.label} ${at(l.hole)}`).join(', ')})`);
          continue;
        }
        // En yakın boş delik: şeritte, bacağa bundan daha yakın boş delik yok.
        const free = rowsOf(halfOf(hole)).filter((r) => !used.has(`${hole.board}:${hole.col}:${r}`));
        const nearest = sameStrip.some((l) => free.every((r) => Math.abs(r - l.hole.row) >= Math.abs(hole.row - l.hole.row)));
        if (!nearest) bad.push(`${name}: bacağa daha yakın boş delik var`);
      }
    }
    expect(bad.slice(0, 40)).toEqual([]);
    expect(beside).toBeGreaterThan(150);
    expect(rails).toBeGreaterThan(100);
    expect(bare).toBeGreaterThan(5);
  });

  it('voltmetrenin iki teli ölçtüğü parçanın iki bacağının yanında (paralel bağlantı tahtada görünür)', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const { id, doc, plan, byId } of docs) {
      const legs = legsOf(plan, byId);
      for (const meter of doc.parts) {
        if (!sensing(meter) || meter.type === 'oscilloscope') continue;
        const nets = [plan.netOf.get(pinKey(meter.id, 0))!, plan.netOf.get(pinKey(meter.id, 1))!];
        if (nets[0] === nets[1]) continue;
        const a = legs.get(nets[0]!) ?? [];
        const b = legs.get(nets[1]!) ?? [];
        // Paralel bağlı olduğu parçalar: iki ucunun ağında da bacağı olanlar.
        const across = a.filter((x) => b.some((y) => y.part.id === x.part.id)).map((x) => x.part);
        if (across.length === 0) continue;
        checked++;
        const holes = [0, 1].map((pin) => plan.leads.find((l) => l.partId === meter.id && l.pin === pin)!.hole);
        const ok = across.some((part) => {
          const beside = (net: string, hole: Hole) => (legs.get(net) ?? []).some((l) => l.part.id === part.id && hole.kind === 'strip' && conductorOf(l.hole) === conductorOf(hole));
          return beside(nets[0]!, holes[0]!) && beside(nets[1]!, holes[1]!);
        });
        if (!ok) bad.push(`${id} ${meter.label}: uçlar ${holes.map(at).join(' ve ')}; paralel parça ${across.map((p) => p.label).join(', ')}`);
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(15);
    // Föydeki örnek: PS1+ → D1 → A1 → R1 → GND, V1 dirence paralel.
    const { plan, byId } = docs.find((d) => d.id === 'diyot-dc')!;
    const hole = (label: string, pin: number) => {
      const part = [...byId.values()].find((p) => p.label === label)!;
      return (plan.onBoard.get(part.id)?.holes[pin] ?? plan.leads.find((l) => l.partId === part.id && l.pin === pin)!.hole) as Hole & { kind: 'strip' };
    };
    const col = (label: string, pin: number) => hole(label, pin).col;
    // Aynı yarıda, soldan sağa: D1, bir şerit boşluk (ampermetre), R1.
    expect(new Set([hole('D1', 0), hole('D1', 1), hole('R1', 0), hole('R1', 1)].map(halfOf)).size).toBe(1);
    expect(col('D1', 0)).toBeLessThan(col('D1', 1));
    expect(col('R1', 0)).toBe(col('D1', 1) + 2);
    expect(col('R1', 0)).toBeLessThan(col('R1', 1));
    // A1 + diyodun çıkış şeridinde, A1 − direncin giriş şeridinde; V1'in uçları direncin iki bacağının yanında.
    expect([col('A1', 0), col('A1', 1)]).toEqual([col('D1', 1), col('R1', 0)]);
    expect([col('V1', 0), col('V1', 1)]).toEqual([col('R1', 0), col('R1', 1)]);
    for (const [label, pin, leg] of [['A1', 0, hole('D1', 1)], ['A1', 1, hole('R1', 0)], ['V1', 0, hole('R1', 0)], ['V1', 1, hole('R1', 1)]] as const) {
      expect(Math.abs(hole(label, pin).row - leg.row), `${label} uç ${pin}`).toBeLessThanOrEqual(2);
      expect(halfOf(hole(label, pin))).toBe(halfOf(leg));
    }
    // Besleme + rayına, toprak − rayına.
    const ps = [...byId.values()].find((p) => p.label === 'PS1')!;
    expect(plan.leads.filter((l) => l.partId === ps.id).map((l) => (l.hole.kind === 'rail' ? l.hole.rail : -1))).toEqual([0, 1]);
  });

  it('seri zincir: komşu parçalar aynı yarıda ve şemadaki sırayla soldan sağa; ampermetrenin girdiği yerde bir şerit boş', () => {
    const bad: string[] = [];
    let pairs = 0;
    let gaps = 0;
    let chains = 0;
    for (const { id, plan, byId } of docs) {
      const carriers = carriersOf(plan, byId);
      const used = usedHoles(plan);
      const leg = (part: Part, pin: number) => plan.onBoard.get(part.id)!.holes[pin] as Hole & { kind: 'strip' };
      const seriesNet = (net: string) => !plan.roles.has(net) && (carriers.get(net) ?? []).length === 2;
      for (const [net, list] of carriers) {
        if (!seriesNet(net)) continue;
        const [p, q] = list as [{ part: Part; pin: number }, { part: Part; pin: number }];
        if (p.part.id === q.part.id) continue;
        if (twoLeg(p.part) && twoLeg(q.part)) {
          // İki parça doğrudan seri: ortak bacakları aynı şeritte, öbür bacakları şeridin iki yanında.
          pairs++;
          const a = leg(p.part, p.pin);
          const b = leg(q.part, q.pin);
          if (conductorOf(a) !== conductorOf(b)) bad.push(`${id}: ${p.part.label} ve ${q.part.label} seri ama ortak şeritte değil (${at(a)}, ${at(b)})`);
          const far = [leg(p.part, 1 - p.pin), leg(q.part, 1 - q.pin)];
          if (far.some((h) => halfOf(h) !== halfOf(a) || h.board !== a.board)) bad.push(`${id}: ${p.part.label} ve ${q.part.label} aynı yarıda değil`);
          if ((far[0]!.col - a.col) * (far[1]!.col - a.col) >= 0) bad.push(`${id}: ${p.part.label} ve ${q.part.label} yan yana dizilmemiş (geri katlanıyor)`);
        }
      }
      // Ampermetre iki parçanın arasında: bacaklar aynı yarıda, aralarında tam bir boş şerit.
      for (const meter of byId.values()) {
        if (!through(meter)) continue;
        const sides = [0, 1].map((pin) => {
          const net = plan.netOf.get(pinKey(meter.id, pin))!;
          const other = seriesNet(net) ? (carriers.get(net) ?? []).find((c) => c.part.id !== meter.id) : undefined;
          return other && twoLeg(other.part) ? leg(other.part, other.pin) : null;
        });
        if (!sides[0] || !sides[1]) continue;
        gaps++;
        const [a, b] = sides as [Hole & { kind: 'strip' }, Hole & { kind: 'strip' }];
        if (a.board !== b.board || halfOf(a) !== halfOf(b)) bad.push(`${id} ${meter.label}: iki yanındaki parçalar aynı yarıda değil`);
        if (Math.abs(a.col - b.col) !== 2) bad.push(`${id} ${meter.label}: iki yanındaki bacaklar arasında bir şerit boşluk yok (${at(a)}, ${at(b)})`);
        const middle = (a.col + b.col) / 2;
        if (rowsOf(halfOf(a)).some((r) => used.has(`${a.board}:${middle}:${r}`))) bad.push(`${id} ${meter.label}: aradaki şerit boş değil`);
      }
      // Planın zincirleri: tahta parçaları zincir sırasıyla soldan sağa, aynı yarıda; besleme yanı solda.
      for (const chain of plan.chains ?? []) {
        chains++;
        const boardParts = chain.filter((l) => plan.onBoard.has(l.partId));
        let last = -Infinity;
        const halves = new Set<string>();
        for (const l of boardParts) {
          const part = byId.get(l.partId)!;
          const inHole = leg(part, l.inPin);
          const outHole = leg(part, 1 - l.inPin);
          halves.add(`${inHole.board}:${halfOf(inHole)}`).add(`${outHole.board}:${halfOf(outHole)}`);
          if (!(inHole.col >= last && inHole.col < outHole.col)) bad.push(`${id}: ${part.label} zincirde sırayla değil (${at(inHole)} → ${at(outHole)})`);
          last = outHole.col;
        }
        if (halves.size > 1) bad.push(`${id}: zincir ${chain.map((l) => byId.get(l.partId)!.label).join('→')} tek yarıda değil`);
        const first = chain[0]!;
        const end = chain[chain.length - 1]!;
        const headNet = plan.netOf.get(pinKey(first.partId, first.inPin))!;
        const tailNet = plan.netOf.get(pinKey(end.partId, 1 - end.inPin))!;
        // Kaynak yanı: besleme ağı ya da bir kaynağın + ucu (pil, güç kaynağı, üreteç çıkışı, AC kaynak).
        const hot = (net: string) => plan.roles.get(net) === 'supply' || (carriers.get(net) ?? []).some((c) => (PLUS[c.part.type] ?? []).includes(c.pin));
        const names = chain.map((l) => byId.get(l.partId)!.label).join('→');
        if (plan.roles.get(headNet) === 'ground' && plan.roles.get(tailNet) !== 'ground') bad.push(`${id}: zincir ${names} toprak yanından başlıyor`);
        if (hot(tailNet) && !hot(headNet)) bad.push(`${id}: zincir ${names} kaynak yanında bitiyor`);
      }
    }
    expect(bad.slice(0, 40)).toEqual([]);
    expect(pairs).toBeGreaterThan(40);
    expect(gaps).toBeGreaterThanOrEqual(3);
    expect(chains).toBeGreaterThan(50);
  });

  it('elektriksel bağlantı şemayla bire bir aynı: şeritler, raylar ve köprülerle birleşen uçlar şemanın ağları', () => {
    for (const { id, plan } of docs) {
      // İletkenler (şerit, ray) köprülerle birleşir.
      const parent = new Map<string, string>();
      const find = (k: string): string => {
        while (parent.has(k) && parent.get(k) !== k) k = parent.get(k)!;
        return k;
      };
      for (const j of plan.jumpers) parent.set(find(conductorOf(j.a)), find(conductorOf(j.b)));
      const pins: Array<{ key: string; hole: Hole }> = [];
      for (const [pid, placed] of plan.onBoard) placed.holes.forEach((hole, pin) => pins.push({ key: pinKey(pid, pin), hole }));
      for (const l of plan.leads) pins.push({ key: pinKey(l.partId, l.pin), hole: l.hole });
      const netOfGroup = new Map<string, string>();
      const groupOfNet = new Map<string, string>();
      for (const p of pins) {
        const net = plan.netOf.get(p.key)!;
        const group = find(conductorOf(p.hole));
        // Aynı iletkende yalnızca aynı ağın uçları; aynı ağın bütün uçları tek iletkende.
        expect(netOfGroup.get(group) ?? net, `${id} ${p.key}: iletkende başka ağ`).toBe(net);
        netOfGroup.set(group, net);
        expect(groupOfNet.get(net) ?? group, `${id} ${p.key}: ağ iki ayrı iletkende`).toBe(group);
        groupOfNet.set(net, group);
      }
      // Bir delikte tek şey.
      const all = [...[...plan.onBoard.values()].flatMap((p) => [...p.holes, ...(p.extraHoles ?? [])]), ...plan.jumpers.flatMap((j) => [j.a, j.b]), ...plan.leads.map((l) => l.hole)].map((h) => `${conductorOf(h)}:${at(h)}`);
      expect(new Set(all).size, `${id}: bir delikte iki şey`).toBe(all.length);
    }
  });

  it('Tahtada kur yeni planla çalışır: planın yerleşimi kurulum olarak Denetle’den sorunsuz geçer; alet kabloları direklerinden deliklerine', () => {
    for (const { id, doc, plan, posts } of docs) {
      if (plan.boards > 1) continue;
      const build = buildFromPlan(plan);
      expect(checkBuild(doc, build, plan).problems, id).toEqual([]);
      const built = planFromBuild(doc, build, plan);
      const layout = layoutPosts(doc, built, plan);
      expect(layout.posts, id).toEqual(posts.posts);
      expect(layout.wires.map((w) => at(w.hole)).sort(), id).toEqual(posts.wires.map((w) => at(w.hole)).sort());
    }
  });

  it('Karta aktar eski planında: seri zincir yok, KiCad çıktısı değişmedi (81 örneğin özeti); multimetreler %30 küçük', () => {
    /** FNV-1a (32 bit) özeti. */
    const sum = (text: string) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
      return (h >>> 0).toString(16).padStart(8, '0');
    };
    const sums = kicadSums as Record<string, string>;
    let differs = 0;
    for (const { id, doc, plan } of docs) {
      const card = planCard(doc);
      expect(card.chains, id).toBeUndefined();
      const pcb = designPcb(doc);
      // Özet değişirse baskı devre tasarımı değişmiştir: bilerek yapıldıysa tests/veri/veri-kicad-ozet.json yenilenir.
      expect(pcb.ok ? sum(kicadPcb(pcb.design, id)) : 'yok', `${id}: KiCad çıktısı değişti`).toBe(sums[id]);
      const holes = (p: BreadboardPlan) => JSON.stringify([...p.onBoard.values()].map((b) => b.holes.map(at)));
      if (holes(card) !== holes(plan) || card.leads.some((l, i) => at(l.hole) !== at(plan.leads[i]!.hole))) differs++;
    }
    expect(Object.keys(sums).length).toBe(docs.length);
    expect(differs).toBeGreaterThan(40);
    expect(DMM_SHRINK).toBeCloseTo(0.7, 9);
    // Kılıflı 150 mm'lik el multimetresi: öbür cihazların ölçeğinin (%60) %70'i.
    expect(182 * DMM_FIT * INSTRUMENT_SCALE * DMM_SHRINK).toBeCloseTo(150 * 0.6 * 0.7, 6);
    expect(posted('multimeter') && posted('voltmeter') && posted('ammeter') && !isOnBoard('multimeter')).toBe(true);
  });
});

export type { CircuitDoc };
