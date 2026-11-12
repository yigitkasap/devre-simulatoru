// Bağlantı direkleri (three'nin yalnızca matematik sınıfları, DOM yok). "3B: okunurluk önce" (2026-11-12):
// laboratuvar cihazlarının kabloları tahtaya gelmez. Tahta ince bir taban plakasına oturur; plakanın arka
// kenarında (cihazlara bakan yanda) bir sıra bağlantı direği vardır. Cihaz bağlantısı gereken her ağa bir direk;
// aynı ağa giden kablolar (ör. GND) aynı direğe üst üste takılır (muz fişler). Direkten ağın deliğine kısa, düz,
// tahtaya yatık bir köprü teli gider.
//
// Planın (planBreadboard) delikleri değişmez: tel, planın o ağın cihaz kablolarına ayırdığı deliklerden arka kenara
// en yakın olanına gider; öbür cihaz kablolarının delikleri 3B'de boş kalır (yalnızca onları ağa bağlayan köprüler
// de çizilmez). Tahtada kur kurulumunda (öğrencinin taktığı delikler) takılı her cihaz kablosu için direkten o
// deliğe bir tel çizilir; takılmamış kablonun direği telsizdir. Direkler ve teller şemaya ve KiCad'e girmez.

import { Vector3 } from 'three';
import { tr } from '../i18n/tr';
import { pinKey } from '../model/connectivity';
import type { CircuitDoc, Part } from '../model/types';
import { numProp, type DeviceType } from '../sim/netlist';
import { BB, boardWidth, holeXZ, isSidePart, type BreadboardPlan, type Hole } from './breadboard';
import { holeGroup } from './cableFlow';

/** Kabloları bağlantı direğine giden laboratuvar cihazları (ön panelinde muz ya da BNC soketi olanlar). */
export const INSTRUMENTS: ReadonlySet<DeviceType> = new Set(['dcsupply', 'funcgen', 'oscilloscope', 'voltmeter', 'ammeter', 'multimeter']);

/**
 * Kabloları bağlantı direğine giden her şey: laboratuvar cihazları ve tahta dışı parçalar (pil, motor, hoparlör,
 * lamba, röle, transformatör…). Tahtanın üstünden kalın kablo geçmez; Arduino'nun atlama telleri (kendi kartından
 * doğrudan deliğe) bunun dışında.
 */
export const posted = (type: DeviceType): boolean => INSTRUMENTS.has(type) || isSidePart(type);

/**
 * Kablo renkleri: toprak siyah, güç kaynağı + ve üreteç çıkışı kırmızı, osiloskop CH1 sarı, CH2 mavi. Yeşil, mor ve
 * beyaz: tahta dışı parçaların üçüncü ve sonraki uçları (rölenin kontakları, transformatörün ikincili).
 */
export const CABLE = { black: '#1b1c1f', red: '#d22f27', yellow: '#f2c230', blue: '#2f6fd6', orange: '#f08a24', green: '#2f9e5b', purple: '#8e5bd1', white: '#e9ecef' } as const;

/** Direk (birim; 1 = 2,54 mm): yarıçap, tepesinin yüksekliği, tahtanın arka kenarından uzaklığı, direkler arası en az aralık. */
export const POST = { radius: 0.55, top: BB.height + 1.1, behind: 3.6, spacing: 3 } as const;
/** Üst üste takılan muz fiş: yarıçap ve boy (bir sonraki fiş bunun üstüne takılır). */
export const BANANA = { radius: 0.42, height: 1.25 } as const;
/** Direkten tahtaya giden tel: yarıçap (Ø ≈ 0,6 mm) ve kartın üstünden yüksekliği. */
export const POST_WIRE = { radius: 0.12, lift: 0.32 } as const;
/** Taban plakası: kalınlık, tahtanın yanlarından ve önünden taşma, arkadan (direk sırası için) taşma. */
export const PLATE = { thickness: 0.25, margin: 1.2, back: 5.4 } as const;
/** Direk tellerinin kanaldaki izleri arasındaki aralık (tel çapının üç katı). */
const WIRE_TRACK = 0.36;

export interface Post {
  readonly net: string;
  /** Direğin üstündeki kısa ad (GND, +12 V, CH1, GİRİŞ…). */
  readonly name: string;
  /** Direğin ve tahtaya giden telin rengi (adı veren kablonun rengi). */
  readonly color: string;
  /** Direğin ekseni (dünya): x ve z. */
  readonly x: number;
  readonly z: number;
}

export interface PostCable {
  readonly partId: string;
  readonly pin: number;
  readonly net: string;
  readonly color: string;
  /** `posts` sırası ve fişin direkteki katı (0: direğe takılı, 1: onun üstünde…). */
  readonly post: number;
  readonly level: number;
  /** plan.leads sırası (akım noktaları); Tahtada kur'da takılmamış kabloda null. */
  readonly lead: number | null;
}

export interface PostWire {
  readonly post: number;
  readonly net: string;
  readonly hole: Hole;
  readonly color: string;
  /** Bu telden akan cihaz kabloları (plan.leads sırası). */
  readonly leads: readonly number[];
  /** Telin köşe noktaları (dünya): direğin önünden kartın hemen üstünde gider, deliğe iner. */
  readonly points: readonly Vector3[];
}

export interface PostLayout {
  readonly posts: readonly Post[];
  readonly cables: readonly PostCable[];
  readonly wires: readonly PostWire[];
  /** 3B'de çizilmeyen köprüler (plan.jumpers sırası): yalnızca boş kalan cihaz deliklerine giden teller. */
  readonly hidden: ReadonlySet<number>;
}

const holeKey = (h: Hole) => (h.kind === 'strip' ? `${h.board}:s${h.col}:${h.row}` : `${h.board}:r${h.rail}:${h.k}`);

/** Direğe giden kablolar (plan.leads sırası): cihazların ve tahta dışı parçaların uçları. */
export function instrumentLeads(doc: CircuitDoc, plan: BreadboardPlan): number[] {
  const types = new Map(doc.parts.map((p) => [p.id, p.type]));
  return plan.leads.flatMap((lead, i) => {
    const type = types.get(lead.partId);
    return type && posted(type) ? [i] : [];
  });
}

const volts = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

/**
 * Sıralı hedeflere (artan) en yakın, aralarında en az `gap` olan ve [min, max] içinde kalan yerler: hedeflerden
 * sapmaların kareleri toplamı en küçük (komşu ihlalleri birleştirme). Sıkışan direkler hedeflerinin iki yanına eşit
 * açılır (hepsi bir yana itilmez: teller kısa ve dik kalır).
 */
export function spread(targets: readonly number[], gap: number, min: number, max: number): number[] {
  const n = targets.length;
  if (n === 0) return [];
  // y_i = hedef_i − i·gap azalmayan olmalı: bloklar hâlinde ortalama.
  const blocks: Array<{ sum: number; count: number }> = [];
  targets.forEach((t, i) => {
    blocks.push({ sum: t - i * gap, count: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2]!.sum / blocks[blocks.length - 2]!.count > blocks[blocks.length - 1]!.sum / blocks[blocks.length - 1]!.count) {
      const last = blocks.pop()!;
      const prev = blocks[blocks.length - 1]!;
      prev.sum += last.sum;
      prev.count += last.count;
    }
  });
  const xs: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.count; k++) xs.push(b.sum / b.count + xs.length * gap);
  // Kenarlara sığdır: önce sağdan, sonra soldan (aralık korunur).
  for (let i = n - 1; i >= 0; i--) xs[i] = Math.min(xs[i]!, i === n - 1 ? max : xs[i + 1]! - gap);
  for (let i = 0; i < n; i++) xs[i] = Math.max(xs[i]!, i === 0 ? min : xs[i - 1]! + gap);
  return xs;
}

/** Kablonun rengi: toprak ağı siyah; öbürleri cihazın ucuna göre. */
export function cableColor(part: Part, pin: number, ground: boolean): string {
  if (ground) return CABLE.black;
  switch (part.type) {
    case 'dcsupply':
      return pin % 2 === 0 ? CABLE.red : CABLE.black;
    case 'funcgen':
      return pin === 0 ? CABLE.red : pin === 1 ? CABLE.orange : CABLE.black;
    case 'oscilloscope':
      return pin === 0 ? CABLE.yellow : pin === 1 ? CABLE.blue : CABLE.black;
    default:
      // Ölçü aletleri ve tahta dışı parçalar: 1. uç kırmızı, 2. uç siyah; sonrakiler (röle, trafo) yeşil, mor, beyaz.
      return [CABLE.red, CABLE.black, CABLE.green, CABLE.purple, CABLE.white][pin] ?? CABLE.black;
  }
}

/** Ağa ad verme önceliği (küçük olan kazanır): kaynaklar, sonra osiloskop, sonra ölçü aletleri. */
function nameOf(part: Part, pin: number): { rank: number; name: string } {
  const t = tr.bench.posts;
  switch (part.type) {
    case 'dcsupply':
      return pin % 2 === 0 ? { rank: 0, name: t.plus(volts(numProp(part.props, pin === 0 ? 'voltage1' : 'voltage2', 0))) } : { rank: 5, name: t.minus(part.label) };
    case 'funcgen':
      return pin === 0 ? { rank: 1, name: t.input } : pin === 1 ? { rank: 2, name: t.ttl } : { rank: 6, name: t.com };
    case 'oscilloscope':
      return pin < 2 ? { rank: 3, name: t.channel(pin + 1) } : { rank: 6, name: t.com };
    case 'battery':
      return pin === 0 ? { rank: 0, name: t.plus(volts(numProp(part.props, 'voltage', 9))) } : { rank: 5, name: t.minus(part.label) };
    default:
      // Tahta dışı parça (motor, lamba, röle…): en düşük öncelik; ad parçanın etiketi ve ucun kısa adı.
      if (isSidePart(part.type)) return { rank: 7, name: t.pin(part.label, t.sideShort[part.type]?.[pin] ?? String(pin + 1)) };
      return { rank: 4, name: pin === 0 ? t.meterPlus(part.label) : t.meterMinus(part.label) };
  }
}

/**
 * Direklerin, cihaz kablolarının ve direkten tahtaya giden tellerin yerleşimi. `plan`: çizilen yerleşim;
 * `reference`: şemanın planı (direklerin yeri ve adları her zaman buradan: Tahtada kur'da öğrencinin kurulumu
 * direkleri oynatmaz). `schematic`: çizilen yerleşim şemanın planı mı (tek tel) yoksa kurulum mu (kablo başına tel).
 */
export function layoutPosts(doc: CircuitDoc, plan: BreadboardPlan, reference: BreadboardPlan = plan, schematic = plan === reference): PostLayout {
  const parts = new Map(doc.parts.map((p) => [p.id, p]));
  const ground = (net: string) => reference.roles.get(net) === 'ground';
  // Ağ başına cihaz kabloları (şemanın planındaki sırayla).
  const byNet = new Map<string, Array<{ part: Part; pin: number; hole: Hole }>>();
  for (const i of instrumentLeads(doc, reference)) {
    const lead = reference.leads[i]!;
    const part = parts.get(lead.partId)!;
    (byNet.get(lead.net) ?? byNet.set(lead.net, []).get(lead.net)!).push({ part, pin: lead.pin, hole: lead.hole });
  }
  // Telin gittiği delik: ağın cihaz deliklerinden arka kenara en yakını (ray ya da en arkadaki satır).
  const targetOf = (items: ReadonlyArray<{ hole: Hole }>) =>
    items
      .map((it) => ({ hole: it.hole, at: holeXZ(it.hole, reference.cols) }))
      .sort((a, b) => a.at.z - b.at.z || a.at.x - b.at.x)[0]!;
  // Adlar örnek içinde tekil: ad başka bir direkte kullanıldıysa ağın sıradaki ucunun adı (ör. seri iki pilin
  // ortak ucu "+9 V" yerine "B1 −").
  const used = new Set<string>();
  const nets = [...byNet].map(([net, items]) => {
    const target = targetOf(items);
    const ranked = items.map((it) => ({ ...it, ...nameOf(it.part, it.pin) })).sort((a, b) => a.rank - b.rank);
    const named = ranked[0]!;
    // Besleme ağı (pilin + ucu): ölçü aletinin adı yerine gerilim.
    const battery = doc.parts.find((p) => p.type === 'battery' && reference.netOf.get(pinKey(p.id, 0)) === net);
    const first = ground(net) ? tr.bench.groundNet : named.rank >= 3 && battery ? tr.bench.posts.plus(volts(numProp(battery.props, 'voltage', 9))) : named.name;
    let name = [first, ...ranked.map((r) => r.name)].find((n) => !used.has(n)) ?? first;
    for (let k = 2; used.has(name); k++) name = `${first} ${k}`;
    used.add(name);
    return { net, items, target, name, color: cableColor(named.part, named.pin, ground(net)) };
  });
  // Sıra: telin tercih ettiği şeridin x'i (ray deliğinde deliğin kendi hizası, satır deliğinde yarım delik solu).
  const laneX = (n: { target: { hole: Hole; at: { x: number } } }) => n.target.at.x - (n.target.hole.kind === 'strip' ? 0.5 : 0);
  nets.sort((a, b) => laneX(a) - laneX(b) || a.target.at.z - b.target.at.z);
  // Direkler tellerinin gittiği deliğin hizasında; aralarında en az POST.spacing, plakanın içinde.
  const half = boardWidth(reference.cols) / 2 - 1;
  // Çok direkte (tahta dışı parçalı kalabalık devreler) aralık plakaya sığacak kadar daralır (en az 2 delik).
  const gap = Math.max(2, Math.min(POST.spacing, nets.length > 1 ? (2 * half) / (nets.length - 1) : POST.spacing));
  const xs = spread(nets.map((n) => n.target.at.x), gap, -half, half);
  const z = -BB.depth / 2 - POST.behind;
  const posts: Post[] = nets.map((n, i) => ({ net: n.net, name: n.name, color: n.color, x: xs[i]!, z }));
  const postOf = new Map(nets.map((n, i) => [n.net, i]));

  // Kablolar: şemanın planındaki her cihaz ucu kendi ağının direğine; çizilen yerleşimde deliği varsa `lead`.
  const leadIndex = new Map(plan.leads.map((l, i) => [pinKey(l.partId, l.pin), i]));
  const cables: PostCable[] = [];
  nets.forEach((n, post) => {
    n.items.forEach((it, level) => {
      cables.push({ partId: it.part.id, pin: it.pin, net: n.net, color: cableColor(it.part, it.pin, ground(n.net)), post, level, lead: leadIndex.get(pinKey(it.part.id, it.pin)) ?? null });
    });
  });

  // Teller: şemada direk başına bir tel; kurulumda takılı her cihaz kablosu için bir tel.
  const targets: Array<Omit<PostWire, 'points'>> = [];
  if (schematic) {
    nets.forEach((n, post) => {
      targets.push({ post, net: n.net, hole: n.target.hole, color: n.color, leads: cables.filter((c) => c.post === post && c.lead !== null).map((c) => c.lead!) });
    });
  } else {
    for (const c of cables) {
      if (c.lead === null) continue;
      targets.push({ post: c.post, net: c.net, hole: plan.leads[c.lead]!.hole, color: c.color, leads: [c.lead] });
    }
  }
  // Telin yolu (tek katmanlı, kesişmesiz kanal yerleşimi; baskı devre yolu gibi dik açılı): tel direğin önünden
  // çıkar; direk sırası ile tahtanın arka kenarı arasındaki kanalda kendi izinde yana gider; hedef deliğin
  // sütununun yarım delik yanındaki şeritte (iki sütunun arasında, hiçbir deliğin üstünden geçmeden) deliğin
  // hizasına kadar ilerler ve deliğe girer. Teller hedef sırasıyla dizilir, şeritleri de aynı sıradadır; sola giden
  // tellerde sağdaki, sağa gidenlerde soldaki tel tahtaya daha yakın izi alır: hiçbir tel öbürünü kesmez.
  const instrumentSet = new Set(instrumentLeads(doc, plan));
  const blocked: Array<{ x: number; z: number; r: number; key: string }> = [];
  const block = (h: Hole, r: number) => blocked.push({ ...holeXZ(h, plan.cols), r, key: holeKey(h) });
  // Delikteki bacak, köprü ucu ya da tel ucu ince (yarıçap ≈ 0,1): tel yanından çeyrek delik açıkla geçebilir;
  // Arduino'nun atlama telinin fişi kalın.
  for (const p of plan.onBoard.values()) for (const h of [...p.holes, ...(p.extraHoles ?? [])]) block(h, 0.12);
  plan.leads.forEach((l, i) => {
    if (!instrumentSet.has(i)) block(l.hole, 0.47);
  });
  for (const j of plan.jumpers) for (const h of [j.a, j.b]) block(h, 0.12);
  for (const t of targets) block(t.hole, 0.12);
  const y = BB.height + POST_WIRE.lift;
  const edge = -BB.depth / 2 - 0.45;
  /** Noktanın (yatayda) doğru parçasına uzaklığı. */
  const distance = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    return Math.hypot(ax + dx * t - px, az + dz * t - pz);
  };
  /** Şeridin (ve deliğe son adımın) üstünden geçtiği dolu delik sayısı. */
  const laneHits = (lane: number, at: { x: number; z: number }, own: string) => {
    let hits = 0;
    for (const q of blocked) {
      if (q.key === own) continue;
      const near = Math.min(distance(q.x, q.z, lane, edge, lane, at.z), distance(q.x, q.z, lane, at.z, at.x, at.z));
      if (near < q.r + POST_WIRE.radius) hits++;
    }
    return hits;
  };
  // Sıra: direk sırası (hedefin x'i); aynı direkten çıkan teller (kurulumda kablo başına bir tel) deliğin x'ine göre.
  const order = targets
    .map((t, index) => ({ t, index, at: holeXZ(t.hole, plan.cols) }))
    .sort((p, q) => p.t.post - q.t.post || p.at.x - (p.t.hole.kind === 'strip' ? 0.5 : 0) - (q.at.x - (q.t.hole.kind === 'strip' ? 0.5 : 0)) || p.at.z - q.at.z);
  const perPost = new Map<number, number>();
  for (const o of order) perPost.set(o.t.post, (perPost.get(o.t.post) ?? 0) + 1);
  const seen = new Map<number, number>();
  // 1) Şerit: deliğe en yakın yarım delik hizalarından, önceki tellerin şeridinin sağında kalan ve dolu deliğe
  //    değmeyen ilki (ray deliğinde önce deliğin kendi hizası: önünde başka delik yoktur).
  let lastLane = -Infinity;
  const done: Array<{ lane: number; at: { x: number; z: number } }> = [];
  const routed = order.map(({ t, index, at }) => {
    const post = posts[t.post]!;
    const m = seen.get(t.post) ?? 0;
    seen.set(t.post, m + 1);
    const startX = post.x + (m - ((perPost.get(t.post) ?? 1) - 1) / 2) * 0.32;
    // Deliğin hemen yanındaki şeritler önce (sol, sağ): deliğe son adım yarım delik, başka şeridi kesmez.
    // Yarım delik hizası dolu bir ray deliğine denk gelirse çeyrek delik kaydırılır.
    const sides = [-0.5, 0.5, -0.25, 0.25, -0.75, 0.75, 1, 1.25, 1.5, 2, 2.5, 3.5, -1.5].map((d) => at.x + d);
    const candidates = t.hole.kind === 'rail' ? [at.x, ...sides] : sides;
    const own = holeKey(t.hole);
    /** Deliğe son adım önceki bir telin şeridini, şerit de önceki bir telin son adımını keser mi. */
    const cuts = (lane: number) =>
      done.filter((w) => {
        const hop = w.lane > Math.min(lane, at.x) + 0.2 && w.lane < Math.max(lane, at.x) - 0.2 && w.at.z > at.z - 0.2;
        const run = lane > Math.min(w.lane, w.at.x) + 0.2 && lane < Math.max(w.lane, w.at.x) - 0.2 && at.z > w.at.z - 0.2;
        return hop || run;
      }).length;
    const scored = candidates.map((lane, rank) => ({ lane, score: laneHits(lane, at, own) * 10 + cuts(lane) * 300 + (lane < lastLane + 0.4 ? 1000 : 0) + rank * 0.01 }));
    const lane = scored.sort((p, q) => p.score - q.score)[0]!.lane;
    lastLane = Math.max(lastLane, lane);
    const dir = lane < startX - 0.15 ? -1 : lane > startX + 0.15 ? 1 : 0;
    const wire = { t, index, at, post, startX, lane, dir, track: 0 };
    done.push(wire);
    return wire;
  });
  // 2) İz: aynı yöne giden ve yatay aralıkları üst üste binen ardışık teller bir kümedir; sola gidenlerde izler
  //    soldan sağa tahtaya yaklaşır, sağa gidenlerde soldan sağa tahtadan uzaklaşır.
  for (let i = 0; i < routed.length; ) {
    let j = i + 1;
    const dir = routed[i]!.dir;
    const span = (w: (typeof routed)[number]) => [Math.min(w.startX, w.lane), Math.max(w.startX, w.lane)] as const;
    if (dir !== 0) while (j < routed.length && routed[j]!.dir === dir && span(routed[j]!)[0] < span(routed[j - 1]!)[1] + 0.4) j++;
    const count = j - i;
    for (let k = i; k < j; k++) routed[k]!.track = dir < 0 ? j - 1 - k : dir > 0 ? k - i : 0;
    void count;
    i = j;
  }
  const wires: PostWire[] = new Array<PostWire>(targets.length);
  for (const w of routed) {
    const front = w.post.z + POST.radius * 0.6;
    // İzler tahtanın arka kenarının hemen gerisinden direklerin tabanına kadar (taban halkasına değmeden).
    const zTrack = Math.max(w.post.z + POST.radius + 0.45, edge - 0.3 - WIRE_TRACK * w.track);
    const raw =
      w.dir === 0
        ? [new Vector3(w.startX, y, front), new Vector3(w.lane, y, edge), new Vector3(w.lane, y, w.at.z), new Vector3(w.at.x, y, w.at.z)]
        : [new Vector3(w.startX, y, front), new Vector3(w.startX, y, zTrack), new Vector3(w.lane, y, zTrack), new Vector3(w.lane, y, w.at.z), new Vector3(w.at.x, y, w.at.z)];
    const points = raw.filter((q, k) => k === 0 || q.distanceTo(raw[k - 1]!) > 1e-6);
    points.push(new Vector3(w.at.x, BB.height, w.at.z));
    wires[w.index] = { ...w.t, points };
  }
  void postOf;

  // Boş kalan cihaz deliklerine giden köprüler çizilmez: ucu, başka hiçbir şeyin takılı olmadığı bir iletkende biten
  // ve o iletkenin tek teli olan köprü (yinelemeli).
  const hidden = new Set<number>();
  if (schematic) {
    const instrument = new Set(instrumentLeads(doc, plan));
    const occupied = new Map<string, number>();
    const add = (h: Hole) => occupied.set(holeGroup(h), (occupied.get(holeGroup(h)) ?? 0) + 1);
    for (const p of plan.onBoard.values()) [...p.holes, ...(p.extraHoles ?? [])].forEach(add);
    plan.leads.forEach((l, i) => {
      if (!instrument.has(i)) add(l.hole);
    });
    targets.forEach((w) => add(w.hole));
    for (let changed = true; changed; ) {
      changed = false;
      const degree = new Map<string, number>();
      plan.jumpers.forEach((j, i) => {
        if (hidden.has(i)) return;
        for (const g of [holeGroup(j.a), holeGroup(j.b)]) degree.set(g, (degree.get(g) ?? 0) + 1);
      });
      plan.jumpers.forEach((j, i) => {
        if (hidden.has(i)) return;
        if ([holeGroup(j.a), holeGroup(j.b)].some((g) => (occupied.get(g) ?? 0) === 0 && degree.get(g) === 1)) {
          hidden.add(i);
          changed = true;
        }
      });
    }
  }
  return { posts, cables, wires, hidden };
}

/** Direğin tepesindeki `level`. fişin altı (dünya). */
export function plugBase(post: Post, level: number): Vector3 {
  return new Vector3(post.x, POST.top + level * BANANA.height, post.z);
}

/** Kablonun fişe girdiği yer: fişin arkası (cihazlara bakan yan), üst yarısında. */
export function plugEntry(post: Post, level: number): Vector3 {
  return new Vector3(post.x, POST.top + level * BANANA.height + BANANA.height * 0.62, post.z - BANANA.radius);
}

/** Taban plakasının kutusu (dünya; x0, x1, z0, z1): tahtaların altında, arkada direk sırası kadar geniş. */
export function plateRect(cols: number, boardsDepth: number): { x0: number; x1: number; z0: number; z1: number } {
  const half = boardWidth(cols) / 2 + PLATE.margin;
  return { x0: -half, x1: half, z0: -BB.depth / 2 - PLATE.back, z1: boardsDepth + PLATE.margin };
}

/**
 * Akım noktaları için plan: şemanın 3B'sinde cihaz kablolarının akımı direğin telinden tahtaya girer (delik: telin
 * deliği). Kurulumda her kablo kendi deliğinde: plan aynen kalır.
 */
export function flowPlan(plan: BreadboardPlan, layout: PostLayout): BreadboardPlan {
  const holeOf = new Map<number, Hole>();
  for (const w of layout.wires) for (const i of w.leads) holeOf.set(i, w.hole);
  return { ...plan, leads: plan.leads.map((l, i) => (holeOf.has(i) ? { ...l, hole: holeOf.get(i)! } : l)), jumpers: plan.jumpers.map((j, i) => (layout.hidden.has(i) ? { ...j, b: j.a } : j)) };
}

/**
 * Tahtada 3B'de dolu delikler (anahtarlar; aynı delik iki kez geçerse orada iki şey var): parçaların bacakları,
 * çizilen köprülerin uçları, masadaki parçaların kabloları ve direklerden gelen teller.
 */
export function holesUsed(doc: CircuitDoc, plan: BreadboardPlan, layout: PostLayout): string[] {
  const instrument = new Set(instrumentLeads(doc, plan));
  const out: string[] = [];
  for (const p of plan.onBoard.values()) for (const h of [...p.holes, ...(p.extraHoles ?? [])]) out.push(holeKey(h));
  plan.jumpers.forEach((j, i) => {
    if (!layout.hidden.has(i)) out.push(holeKey(j.a), holeKey(j.b));
  });
  plan.leads.forEach((l, i) => {
    if (!instrument.has(i)) out.push(holeKey(l.hole));
  });
  for (const w of layout.wires) out.push(holeKey(w.hole));
  return out;
}
