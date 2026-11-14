// Bağlantı direkleri (three'nin yalnızca matematik sınıfları, DOM yok). "3B: okunurluk önce" (2026-11-12):
// laboratuvar cihazlarının ve tahta dışı parçaların kabloları tahtaya gelmez. Tahta ince bir taban plakasına oturur;
// plakanın arka kenarında (cihazlara bakan yanda) bir sıra bağlantı direği vardır.
//
// "Tahta düzeni" (2026-11-14): direkler ağa göre değil, alet ucuna göre açılır. Bağlı her alet ucunun kendi direği,
// kendi kablosu ve direkten tahtaya kendi teli vardır; direğin adı alet ucunun adıdır (PS1 +, A1 −, V1 +, CH1,
// CH1 toprak…). Aynı ağa giden iki alet ucu ayrı direklerde durur: voltmetrenin dirence paralel, ampermetrenin
// seri bağlandığı tahtada görünür. Tel, planın (planBreadboard) o uca verdiği deliğe gider: şemada bağlı olduğu
// bacağın şeridi. Tahtada kur kurulumunda tel, öğrencinin kabloyu taktığı deliğe gider; takılmamış kablonun direği
// telsizdir. Direkler ve teller şemaya ve KiCad'e girmez.
//
// Direk sırası (2026-11-14): direkler, tellerinin tahtanın üstünde ilerlediği şeritlerin soldan sağa sırasıyla dizilir
// (lanesOf); teller birbirini kesmez.

import { Vector3 } from 'three';
import { tr } from '../i18n/tr';
import { pinKey } from '../model/connectivity';
import type { CircuitDoc, Part } from '../model/types';
import { numProp, type DeviceType } from '../sim/netlist';
import { BB, boardWidth, holeXZ, isSidePart, type BreadboardPlan, type Hole } from './breadboard';

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

/** Direk (birim; 1 = 2,54 mm): yarıçap, tepesinin yüksekliği, tahtanın arka kenarından uzaklığı, direkler arası aralık (rahat ve en dar). */
export const POST = { radius: 0.55, top: BB.height + 1.1, behind: 3.6, spacing: 3, tight: 2 } as const;
/** Üst üste takılan muz fiş: yarıçap ve boy (bir sonraki fiş bunun üstüne takılır). */
export const BANANA = { radius: 0.42, height: 1.25 } as const;
/** Direkten tahtaya giden tel: yarıçap (Ø ≈ 0,6 mm) ve kartın üstünden yüksekliği. */
export const POST_WIRE = { radius: 0.12, lift: 0.32 } as const;
/** Taban plakası: kalınlık, tahtanın yanlarından ve önünden taşma, arkadan (direk sırası için) taşma. */
export const PLATE = { thickness: 0.25, margin: 1.2, back: 5.4 } as const;
/** Direk tellerinin kanaldaki izleri arasındaki aralık (tel çapının bir buçuk katı); kalabalık devrede izler sıkışır. */
const WIRE_TRACK = 0.36;
/**
 * Telin tahtanın üstünde ilerlediği şeritler: deliğin sütunundan bu kadar yanda (delik aralığı). İki sütunun arasında
 * iki şerit var (üçte bir ve üçte iki); daha uzaktakiler komşu sütunun ötesinde (dolu deliğe değmeyen seçilir).
 */
const LANES = [1 / 3, 2 / 3, 4 / 3, 5 / 3, 7 / 3, 8 / 3, 10 / 3, 11 / 3] as const;
/** İki telin şeritleri arasındaki en az aralık. */
const LANE_GAP = 0.3;

export interface Post {
  readonly net: string;
  /** Direğe takılan alet ucu. */
  readonly partId: string;
  readonly pin: number;
  /** Direğin üstündeki kısa ad: alet ucunun adı (PS1 +, A1 −, V1 +, CH1, CH1 toprak, FG1 OUT…). */
  readonly name: string;
  /** Açık ad: direğe dokununca ya da üstüne gelince görünür ("K1 röle · normalde açık uç", "T1 trafo · sekonder 1"). */
  readonly title: string;
  /** Direğin ve tahtaya giden telin rengi (kablosunun rengi). */
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
  /** `posts` sırası; fişin direkteki katı (her direkte tek fiş: 0). */
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
  /** Bu telden akan cihaz kablosu (plan.leads sırası; tek eleman). */
  readonly leads: readonly number[];
  /** Telin köşe noktaları (dünya): direğin önünden kartın hemen üstünde gider, deliğe iner. */
  readonly points: readonly Vector3[];
  /** Direk sırası ile tahtanın arka kenarı arasındaki kanalda telin izi (0: tahtaya en yakın). */
  readonly track: number;
  /** Telin tahtanın üstünde ilerlediği şeridin x'i (iki sütunun arası; ray deliğinde deliğin kendi hizası). */
  readonly lane: number;
}

export interface PostLayout {
  readonly posts: readonly Post[];
  readonly cables: readonly PostCable[];
  readonly wires: readonly PostWire[];
}

/** Direğin anahtarı (etiket ve vurgu için): alet ucu. */
export const postKey = (post: { readonly partId: string; readonly pin: number }): string => `${post.partId}#${post.pin}`;

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

/**
 * Alet ucunun adı. `name`: direğin üstündeki kısa ad; `title`: açık ad (cihazın ya da parçanın etiketi, türü ve
 * ucun açık adı). `used`: aletin bağlı uçları (güç kaynağının ikinci çıkışı, osiloskobun kanalları ada girer).
 */
function nameOf(part: Part, pin: number, used: ReadonlySet<number>): { name: string; title: string } {
  const t = tr.bench.posts;
  const long = t.long;
  switch (part.type) {
    case 'dcsupply': {
      // Tek çıkış kullanılıyorsa "PS1 +" ve "PS1 −"; iki çıkış da bağlıysa "PS1 1+", "PS1 2−".
      const out = pin < 2 ? 1 : 2;
      const both = (used.has(0) || used.has(1)) && (used.has(2) || used.has(3));
      const v = volts(numProp(part.props, out === 1 ? 'voltage1' : 'voltage2', 0));
      const sign = pin % 2 === 0 ? '+' : '−';
      return {
        name: t.pin(part.label, both ? `${out}${sign}` : sign),
        title: pin % 2 === 0 ? (both ? long.supplyPlusOf(part.label, out, v) : long.supplyPlus(part.label, v)) : both ? long.supplyMinusOf(part.label, out) : long.supplyMinus(part.label),
      };
    }
    case 'funcgen':
      return { name: t.pin(part.label, t.generatorShort[pin]!), title: long.generator(part.label, long.generatorPins[pin]!) };
    case 'oscilloscope': {
      if (pin < 2) return { name: t.channel(pin + 1), title: long.scopeChannel(part.label, pin + 1) };
      // Toprak ucu: tek kanal bağlıysa o kanalın toprağı ("CH1 toprak").
      const channels = [0, 1].filter((k) => used.has(k));
      return { name: channels.length === 1 ? t.channelGround(channels[0]! + 1) : t.scopeGround, title: long.scopeGround(part.label) };
    }
    case 'battery': {
      const v = volts(numProp(part.props, 'voltage', 9));
      return pin === 0 ? { name: t.meterPlus(part.label), title: long.batteryPlus(part.label, v) } : { name: t.meterMinus(part.label), title: long.side(part.label, long.sideWord.battery!, long.sidePins.battery![1]!) };
    }
    default: {
      // Tahta dışı parça (motor, lamba, röle…): parçanın etiketi ve ucun kısa adı.
      if (isSidePart(part.type)) {
        const word = long.sideWord[part.type] ?? tr.devices.names[part.type].toLocaleLowerCase('tr');
        return { name: t.pin(part.label, t.sideShort[part.type]?.[pin] ?? String(pin + 1)), title: long.side(part.label, word, long.sidePins[part.type]?.[pin] ?? long.nth(pin + 1)) };
      }
      const word = tr.devices.names[part.type].toLocaleLowerCase('tr');
      return { name: pin === 0 ? t.meterPlus(part.label) : t.meterMinus(part.label), title: long.side(part.label, word, pin === 0 ? long.meterPins[0]! : long.meterPins[1]!) };
    }
  }
}

/**
 * Direklerin, cihaz kablolarının ve direkten tahtaya giden tellerin yerleşimi. `plan`: çizilen yerleşim;
 * `reference`: şemanın planı (direklerin yeri ve adları her zaman buradan: Tahtada kur'da öğrencinin kurulumu
 * direkleri oynatmaz).
 */
export function layoutPosts(doc: CircuitDoc, plan: BreadboardPlan, reference: BreadboardPlan = plan): PostLayout {
  const parts = new Map(doc.parts.map((p) => [p.id, p]));
  const ground = (net: string) => reference.roles.get(net) === 'ground';
  // Alet uçları (şemanın planındaki sırayla): her biri bir direk.
  const ends = instrumentLeads(doc, reference).map((i) => {
    const lead = reference.leads[i]!;
    return { part: parts.get(lead.partId)!, pin: lead.pin, net: lead.net, hole: lead.hole, at: holeXZ(lead.hole, reference.cols) };
  });
  const usedPins = new Map<string, Set<number>>();
  for (const e of ends) (usedPins.get(e.part.id) ?? usedPins.set(e.part.id, new Set()).get(e.part.id)!).add(e.pin);
  // Adlar örnek içinde tekil: aynı ad ikinci kez gelirse (iki osiloskop) başına aletin etiketi.
  const taken = new Set<string>();
  const named = ends.map((e) => {
    const base = nameOf(e.part, e.pin, usedPins.get(e.part.id)!);
    let name = base.name;
    if (taken.has(name)) name = tr.bench.posts.pin(e.part.label, base.name);
    for (let k = 2; taken.has(name); k++) name = `${base.name} ${k}`;
    taken.add(name);
    return { ...e, name, title: base.title, color: cableColor(e.part, e.pin, ground(e.net)) };
  });
  // Sıra: tellerin tahtanın üstünde ilerlediği şeritlerin soldan sağa sırası (aynı sırayla inen teller birbirini
  // kesmez). Şeritler şemanın planına göre verilir (lanesOf).
  const referenceLanes = lanesOf(doc, reference, named.map((e) => e.hole));
  const lanes = new Map(named.map((e, i) => [pinKey(e.part.id, e.pin), referenceLanes[i]!]));
  named.sort((a, b) => lanes.get(pinKey(a.part.id, a.pin))! - lanes.get(pinKey(b.part.id, b.pin))! || a.at.z - b.at.z);
  // Direkler tellerinin gittiği deliğin hizasında; aralarında en az POST.spacing, plakanın içinde.
  const half = boardWidth(reference.cols) / 2 - 1;
  // Aralık: hedef delikler dar bir alandaysa direkler de sıkışır (teller uzun yelpaze yapmaz), en az POST.tight;
  // çok direkte plakaya sığacak kadar.
  const reach = named.length > 1 ? named[named.length - 1]!.at.x - named[0]!.at.x : 0;
  const count = Math.max(1, named.length - 1);
  const gap = Math.max(POST.tight, Math.min(POST.spacing, (reach + 2 * POST.spacing) / count, (2 * half) / count));
  const xs = spread(named.map((e) => lanes.get(pinKey(e.part.id, e.pin))!), gap, -half, half);
  const z = -BB.depth / 2 - POST.behind;
  const posts: Post[] = named.map((e, i) => ({ net: e.net, partId: e.part.id, pin: e.pin, name: e.name, title: e.title, color: e.color, x: xs[i]!, z }));

  // Kablolar: her alet ucu kendi direğine; çizilen yerleşimde deliği varsa `lead`.
  const leadIndex = new Map(plan.leads.map((l, i) => [pinKey(l.partId, l.pin), i]));
  const cables: PostCable[] = named.map((e, post) => ({ partId: e.part.id, pin: e.pin, net: e.net, color: e.color, post, level: 0, lead: leadIndex.get(pinKey(e.part.id, e.pin)) ?? null }));

  // Teller: takılı her alet kablosu için direkten o kablonun deliğine bir tel.
  const targets: Array<Omit<PostWire, 'points' | 'track' | 'lane'>> = [];
  for (const c of cables) {
    if (c.lead === null) continue;
    targets.push({ post: c.post, net: c.net, hole: plan.leads[c.lead]!.hole, color: c.color, leads: [c.lead] });
  }
  // Telin yolu (tek katmanlı, kesişmesiz kanal yerleşimi; baskı devre yolu gibi dik açılı): tel direğin önünden
  // çıkar; direk sırası ile tahtanın arka kenarı arasındaki kanalda kendi izinde yana gider; hedef deliğin
  // sütununun yanındaki şeritte (iki sütunun arasında, hiçbir deliğin üstünden geçmeden) deliğin hizasına kadar
  // ilerler ve deliğe girer. Direkler şerit sırasıyla dizilidir; sola giden tellerde sağdaki, sağa gidenlerde soldaki
  // tel tahtaya daha yakın izi alır: hiçbir tel öbürünü kesmez.
  const y = BB.height + POST_WIRE.lift;
  const edge = -BB.depth / 2 - 0.45;
  // Şeritler: çizilen yerleşim şemanın planıysa direk sırasını veren şeritler; Tahtada kur kurulumunda tellerin
  // gittiği deliklere göre yeniden.
  const own = plan === reference ? null : lanesOf(doc, plan, targets.map((t) => t.hole));
  const laneOf = (index: number) => {
    const t = targets[index]!;
    const lead = plan.leads[t.leads[0]!]!;
    return own ? own[index]! : lanes.get(pinKey(lead.partId, lead.pin))!;
  };
  // Sıra: direk sırası; aynı direkten çıkan teller şeritlerinin sırasıyla.
  const order = targets.map((t, index) => ({ t, index, at: holeXZ(t.hole, plan.cols), lane: laneOf(index) })).sort((p, q) => p.t.post - q.t.post || p.lane - q.lane || p.at.z - q.at.z);
  const perPost = new Map<number, number>();
  for (const o of order) perPost.set(o.t.post, (perPost.get(o.t.post) ?? 0) + 1);
  const seen = new Map<number, number>();
  const routed = order.map(({ t, index, at, lane }) => {
    const post = posts[t.post]!;
    const m = seen.get(t.post) ?? 0;
    seen.set(t.post, m + 1);
    const startX = post.x + (m - ((perPost.get(t.post) ?? 1) - 1) / 2) * 0.32;
    const dir = lane < startX - 0.15 ? -1 : lane > startX + 0.15 ? 1 : 0;
    return { t, index, at, post, startX, lane, dir, track: 0 };
  });
  // 2) İz: aynı yöne giden ve yatay aralıkları üst üste binen ardışık teller bir kümedir. Sola gidenlerde sağdaki
  //    tel tahtaya daha yakın izi alır, sağa gidenlerde soldaki: tel, yatay aralığı kendisininkiyle üst üste binen
  //    ve kendisinden önce gelmesi gereken tellerin en uzağının bir ötesindeki ize oturur (aralıkları ayrık teller
  //    aynı izi paylaşır: kanal dar kalır).
  const span = (w: (typeof routed)[number]) => [Math.min(w.startX, w.lane), Math.max(w.startX, w.lane)] as const;
  const overlap = (p: (typeof routed)[number], q: (typeof routed)[number]) => span(p)[0] < span(q)[1] + 0.4 && span(q)[0] < span(p)[1] + 0.4;
  for (let i = 0; i < routed.length; ) {
    let j = i + 1;
    const dir = routed[i]!.dir;
    if (dir !== 0) while (j < routed.length && routed[j]!.dir === dir && span(routed[j]!)[0] < span(routed[j - 1]!)[1] + 0.4) j++;
    const group = routed.slice(i, j);
    if (dir < 0) group.reverse();
    group.forEach((w, k) => {
      w.track = dir === 0 ? 0 : Math.max(-1, ...group.slice(0, k).filter((q) => overlap(q, w)).map((q) => q.track)) + 1;
    });
    i = j;
  }
  const wires: PostWire[] = new Array<PostWire>(targets.length);
  // İzler tahtanın arka kenarının hemen gerisinden direklerin tabanına kadar (taban halkasına değmeden). Kalabalık
  // devrede (çok tel aynı yöne açılır) izler arasındaki aralık kanala sığacak kadar daralır.
  const deepest = Math.max(0, ...routed.map((w) => w.track));
  const room = edge - 0.3 - (-BB.depth / 2 - POST.behind + POST.radius + 0.45);
  const pitch = deepest > 0 ? Math.min(WIRE_TRACK, room / deepest) : WIRE_TRACK;
  for (const w of routed) {
    const front = w.post.z + POST.radius * 0.6;
    const zTrack = edge - 0.3 - pitch * w.track;
    const raw =
      w.dir === 0
        ? [new Vector3(w.startX, y, front), new Vector3(w.lane, y, edge), new Vector3(w.lane, y, w.at.z), new Vector3(w.at.x, y, w.at.z)]
        : [new Vector3(w.startX, y, front), new Vector3(w.startX, y, zTrack), new Vector3(w.lane, y, zTrack), new Vector3(w.lane, y, w.at.z), new Vector3(w.at.x, y, w.at.z)];
    const points = raw.filter((q, k) => k === 0 || q.distanceTo(raw[k - 1]!) > 1e-6);
    points.push(new Vector3(w.at.x, BB.height, w.at.z));
    wires[w.index] = { ...w.t, points, track: w.track, lane: w.lane };
  }
  return { posts, cables, wires };
}

/**
 * Direk tellerinin tahtanın üstünde ilerlediği şeritler (`holes` sırasıyla, x). Tel tahtanın arka kenarından şeridi
 * boyunca deliğin hizasına kadar gelir, oradan yana, deliğe girer. Delikler soldan sağa, aynı sütunda arkadan öne
 * işlenir; her tel, deliğine en yakın boş şeridi alır: dolu deliğe değmeyen, önceki bir telin şeridini ya da son
 * adımını kesmeyen. Aynı sütuna inen tellerde arkadaki delik içteki, öndeki delik dıştaki şeridi alır (dıştaki telin
 * son adımı, içtekinin bittiği yerin ötesinden geçer).
 */
export function lanesOf(doc: CircuitDoc, plan: BreadboardPlan, holes: readonly Hole[]): number[] {
  const instrument = new Set(instrumentLeads(doc, plan));
  const blocked: Array<{ x: number; z: number; r: number; key: string }> = [];
  const block = (h: Hole, r: number) => blocked.push({ ...holeXZ(h, plan.cols), r, key: holeKey(h) });
  // Delikteki bacak, köprü ucu ya da tel ucu ince (yarıçap ≈ 0,1): tel yanından üçte bir delik açıkla geçebilir;
  // Arduino'nun atlama telinin fişi kalın.
  for (const p of plan.onBoard.values()) for (const h of [...p.holes, ...(p.extraHoles ?? [])]) block(h, 0.12);
  plan.leads.forEach((l, i) => {
    if (!instrument.has(i)) block(l.hole, 0.47);
  });
  for (const j of plan.jumpers) for (const h of [j.a, j.b]) block(h, 0.12);
  for (const h of holes) block(h, 0.12);
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
  const sides = LANES.flatMap((d) => [-d, d]);
  type Item = { hole: Hole; index: number; at: { x: number; z: number } };
  /** Delikler verilen sırayla işlenir; `cost`: kesişen, şeridi dolu ya da dolu deliğe değen tellerin cezası. */
  const run = (order: readonly Item[]) => {
    const done: Array<{ lane: number; at: { x: number; z: number } }> = [];
    const out = new Array<number>(holes.length).fill(0);
    let cost = 0;
    let worst: Item | null = null;
    for (const item of order) {
      const { hole, index, at } = item;
      const candidates = (hole.kind === 'rail' ? [0, ...sides] : sides).map((d) => at.x + d);
      const own = holeKey(hole);
      /** Deliğe son adım önceki bir telin şeridini ya da son adımını, şerit de önceki bir telin son adımını keser mi. */
      const cuts = (lane: number) =>
        done.filter((w) => {
          const hop = w.lane > Math.min(lane, at.x) + 0.1 && w.lane < Math.max(lane, at.x) - 0.1 && w.at.z > at.z - 0.2;
          const cross = lane > Math.min(w.lane, w.at.x) + 0.1 && lane < Math.max(w.lane, w.at.x) - 0.1 && at.z > w.at.z - 0.2;
          const level = Math.abs(w.at.z - at.z) < 0.2 && Math.min(w.lane, w.at.x) < Math.max(lane, at.x) + 0.2 && Math.min(lane, at.x) < Math.max(w.lane, w.at.x) + 0.2;
          return hop || cross || level;
        }).length;
      const taken = (lane: number) => done.some((w) => Math.abs(w.lane - lane) < LANE_GAP);
      const scored = candidates.map((lane, rank) => ({ lane, penalty: (taken(lane) ? 5000 : 0) + cuts(lane) * 300 + laneHits(lane, at, own) * 10, rank }));
      const best = scored.sort((p, q) => p.penalty - q.penalty || p.rank - q.rank)[0]!;
      if (best.penalty > 0 && worst === null) worst = item;
      cost += best.penalty;
      done.push({ lane: best.lane, at });
      out[index] = best.lane;
    }
    return { out, cost, worst };
  };
  let order: Item[] = holes.map((hole, index) => ({ hole, index, at: holeXZ(hole, plan.cols) })).sort((p, q) => p.at.x - q.at.x || p.at.z - q.at.z);
  let best = run(order);
  // Kalabalık şerit (aynı şeride dört tel): yer bulamayan tel, komşu sütunların tellerinden önce işlenir (şeridini
  // önce o seçer); sonuç daha iyiyse tutulur.
  for (let turn = 0; turn < 6 && best.cost > 0 && best.worst; turn++) {
    const stuck = best.worst;
    const rest = order.filter((o) => o !== stuck);
    const before = rest.findIndex((o) => o.at.x >= stuck.at.x - 1.5);
    const next = [...rest.slice(0, Math.max(0, before)), stuck, ...rest.slice(Math.max(0, before))];
    const tried = run(next);
    if (tried.cost >= best.cost) break;
    order = next;
    best = tried;
  }
  return best.out;
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
 * Tahtada 3B'de dolu delikler (anahtarlar; aynı delik iki kez geçerse orada iki şey var): parçaların bacakları,
 * çizilen köprülerin uçları, masadaki parçaların kabloları ve direklerden gelen teller.
 */
export function holesUsed(doc: CircuitDoc, plan: BreadboardPlan, layout: PostLayout): string[] {
  const instrument = new Set(instrumentLeads(doc, plan));
  const out: string[] = [];
  for (const p of plan.onBoard.values()) for (const h of [...p.holes, ...(p.extraHoles ?? [])]) out.push(holeKey(h));
  for (const j of plan.jumpers) out.push(holeKey(j.a), holeKey(j.b));
  plan.leads.forEach((l, i) => {
    if (!instrument.has(i)) out.push(holeKey(l.hole));
  });
  for (const w of layout.wires) out.push(holeKey(w.hole));
  return out;
}
