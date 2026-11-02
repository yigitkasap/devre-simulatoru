// Tahtada kur, Denetle (T3): tahtadaki bağlantıları şemayla karşılaştırır. Saf hesap.
//
// Yöntem: şemadaki her ağ, tahtadaki bir düğümle eşleşir; eşleşme, aynı düğüme düşen bacak sayısını en
// büyük yapan birebir atamadır (Macar yöntemi). Bir bacak, ağının eşleştiği düğümde değilse yanlıştır.
// Uçları yer değiştirince elektrikçe aynı kalan parçalarda (direnç, kutupsuz kondansatör, bobin, LDR, NTC,
// sigorta, anahtar, düğme) iki yön de doğrudur. Sorunlar parçaya göre gruplanır (README → Tahtada kur, 9):
// iki bacak aynı şeritte, ters takılmış, bağlı değil, fazladan bağlantı. Kullanıcı kararları (2026-11-02):
// iki ayrı düğümü birleştiren ara kablo kendisi sorundur (o yüzden yanlış düğüme düşen parçalar ayrıca
// sayılmaz); potansiyometre uçları, SPDT'nin A/B uçları ve alet kablolarının yer değiştirmesi de ters
// takılmış sayılır (Oynat'ın sonucunu değiştirir).

import { mountOf, type BreadboardPlan } from '../bench3d/breadboard';
import { conductorOf, parseHole } from '../bench3d/holes';
import type { Build } from '../model/build';
import { CATALOG } from '../model/catalog';
import { pinKey } from '../model/connectivity';
import type { CircuitDoc, Part } from '../model/types';

export type ProblemKind = 'sameStrip' | 'reversed' | 'notConnected' | 'extra';

/** Bir parçanın ucu. */
export interface PinRef {
  readonly part: string;
  readonly pin: number;
}

/** Sorunlu bacak (ya da alet kablosu). */
export interface ProblemPin {
  readonly pin: number;
  /** Takılı olduğu delik; takılı değilse null. */
  readonly hole: string | null;
  /** Şemada aynı ağdaki başka bir uç (doğru yerde olanı yeğlenir); yoksa null. */
  readonly expected: PinRef | null;
  /** Tahtada aynı düğüme düşen, şemada başka ağdaki uç (fazladan bağlantı); yoksa null. */
  readonly joined: PinRef | null;
}

export interface Problem {
  /** Kararlı anahtar (ipucu kademeleri yeniden denetlemede korunur): "parça:tür" ya da "kablo:a|b". */
  readonly id: string;
  readonly kind: ProblemKind;
  /** Parça; ara kablo sorunuysa null. */
  readonly part: string | null;
  /** Fazladan bağlantı yapan ara kablo (kurulumdaki uçları). */
  readonly wire: { readonly a: string; readonly b: string; readonly sides: readonly [PinRef, PinRef] } | null;
  /** Sorunlu bacaklar (sameStrip'te aynı iletkendeki bacaklar; reversed'te bütün bacaklar). */
  readonly pins: readonly ProblemPin[];
  /** Parça kutuda (tahtaya hiç takılmamış). */
  readonly inBox: boolean;
  /** sameStrip: iletken ray mı (şerit değil). */
  readonly onRail: boolean;
}

export interface CheckResult {
  readonly problems: readonly Problem[];
}

/** Uçları yer değiştirince elektrikçe aynı kalan iki bacaklı parçalar. */
function symmetric(part: Part): boolean {
  switch (part.type) {
    case 'resistor':
    case 'inductor':
    case 'ldr':
    case 'ntc':
    case 'fuse':
    case 'switch':
    case 'pushbutton':
    case 'lamp':
    case 'speaker':
      return true;
    case 'capacitor':
      return part.props.kind === 'film';
    default:
      return false;
  }
}

/** Kare matriste en büyük toplamlı birebir atama (Macar yöntemi, O(n³)); satır → sütun. */
export function maxAssignment(weight: readonly (readonly number[])[]): number[] {
  const n = weight.length;
  if (n === 0) return [];
  let max = 0;
  for (const row of weight) for (const w of row) max = Math.max(max, w);
  // En küçük maliyet: c = max − w. u, v potansiyeller; p[j]: j sütununa atanan satır (1 tabanlı).
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = max - weight[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else minv[j] = minv[j]! - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }
  const rowToCol = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]! > 0) rowToCol[p[j]! - 1] = j - 1;
  return rowToCol;
}

class UnionFind {
  private readonly parent = new Map<string, string>();
  find(k: string): string {
    if (!this.parent.has(k)) return k;
    let root = k;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    return root;
  }
  union(a: string, b: string): void {
    if (!this.parent.has(a)) this.parent.set(a, a);
    if (!this.parent.has(b)) this.parent.set(b, b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

interface Physical {
  readonly ref: PinRef;
  readonly key: string;
  readonly part: Part;
  readonly net: string;
  /** Takılı olduğu delik ve iletken; takılı değilse null. */
  readonly hole: string | null;
  readonly conductor: string | null;
}

export function checkBuild(doc: CircuitDoc, build: Build, schematic: BreadboardPlan): CheckResult {
  // Şemadaki ağlar planınkiler: bütün toprak sembolleri tek ağ, Arduino'nun iki GND'si tek ağ.
  const netOf = (key: string) => schematic.netOf.get(key) ?? key;
  const conductor = (name: string): string | null => {
    const h = parseHole(name, build.cols);
    return h ? conductorOf(h) : null;
  };

  // Karşılaştırılan uçlar: tahtadaki parçaların bütün bacakları, masadaki parçaların şemada bağlı (ya da
  // takılmış) kabloları. Toprak sembolü fiziksel değil.
  const required = new Set(schematic.leads.map((l) => pinKey(l.partId, l.pin)));
  const physical: Physical[] = [];
  for (const part of doc.parts) {
    if (part.type === 'ground') continue;
    const count = CATALOG[part.type].pins.length;
    const onBoard = mountOf(part.type) !== undefined;
    for (let pin = 0; pin < count; pin++) {
      const key = pinKey(part.id, pin);
      const hole = onBoard ? (build.parts[part.id]?.holes[pin] ?? null) : (build.leads.find((l) => l.part === part.id && l.pin === pin)?.hole ?? null);
      if (!onBoard && !required.has(key) && hole === null) continue;
      physical.push({ ref: { part: part.id, pin }, key, part, net: netOf(key), hole, conductor: hole === null ? null : conductor(hole) });
    }
  }

  // Tahtadaki düğümler: iletkenler, ara kablolarla (çıkarılanlar hariç) ve düğmenin ikiz bacaklarıyla birleşir.
  const nodesWithout = (skip: ReadonlySet<number>) => {
    const uf = new UnionFind();
    build.wires.forEach((w, i) => {
      const a = conductor(w.a);
      const b = conductor(w.b);
      if (!skip.has(i) && a && b) uf.union(a, b);
    });
    // Arduino'nun iki GND ucu kartın içinde aynı bakır.
    const arduinoGnd = (part: string, pin: number) => {
      const lead = build.leads.find((l) => l.part === part && l.pin === pin);
      return lead ? conductor(lead.hole) : null;
    };
    for (const part of doc.parts) {
      if (part.type === 'arduino') {
        const a = arduinoGnd(part.id, 2);
        const b = arduinoGnd(part.id, 21);
        if (a && b) uf.union(a, b);
      }
      const placed = build.parts[part.id];
      if (part.type !== 'pushbutton' || !placed) continue;
      placed.extra?.forEach((name, i) => {
        const twin = conductor(name);
        const leg = placed.holes[i] !== undefined ? conductor(placed.holes[i]!) : null;
        if (twin && leg) uf.union(twin, leg);
      });
    }
    return (c: string | null) => (c === null ? null : uf.find(c));
  };

  const byPart = new Map<string, Physical[]>();
  for (const p of physical) byPart.set(p.part.id, [...(byPart.get(p.part.id) ?? []), p]);
  const nets = [...new Set(physical.map((p) => p.net))];
  const netIndex = new Map(nets.map((n, i) => [n, i]));

  /** Çıkarılan kablolar dışındaki kurulumla eşleşme ve her bacağın beklenen ağı. */
  const analyse = (skip: ReadonlySet<number>) => {
    const nodeOfConductor = nodesWithout(skip);
    const nodeOf = (p: Physical) => nodeOfConductor(p.conductor);
    // Ağ ↔ düğüm eşleşmesi: aynı düğüme düşen bacak sayısı en büyük. Simetrik parçanın bacakları iki
    // yöne yarım ağırlıkla sayılır.
    const nodes = [...new Set(physical.map(nodeOf).filter((x): x is string => x !== null))];
    const size = Math.max(nets.length, nodes.length);
    const weight = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const nodeIndex = new Map(nodes.map((n, i) => [n, i]));
    const add = (net: string, node: string | null, w: number) => {
      if (node !== null) weight[netIndex.get(net)!]![nodeIndex.get(node)!]! += w;
    };
    for (const [, pins] of byPart) {
      if (symmetric(pins[0]!.part) && pins.length === 2) {
        const [a, b] = pins as [Physical, Physical];
        for (const [x, y] of [
          [a, a],
          [b, b],
          [a, b],
          [b, a],
        ] as const)
          add(x.net, nodeOf(y), 0.5);
      } else for (const p of pins) add(p.net, nodeOf(p), 1);
    }
    const assignment = maxAssignment(weight);

    /** Eşleşmeye göre beklenen ağlar ve yanlış bacaklar (simetrik parça daha çok bacağı doğru düşen yönde). */
    const judge = (rowToCol: readonly number[]) => {
      const nodeOfNet = new Map<string, string>();
      nets.forEach((net, i) => {
        const j = rowToCol[i]!;
        if (j >= 0 && j < nodes.length && weight[i]![j]! > 0) nodeOfNet.set(net, nodes[j]!);
      });
      const expectedNet = new Map<string, string>();
      for (const [, pins] of byPart) {
        const right = (order: readonly Physical[]) => pins.filter((p, i) => nodeOf(p) !== null && nodeOf(p) === nodeOfNet.get(order[i]!.net)).length;
        const swapped = symmetric(pins[0]!.part) && pins.length === 2 && right([pins[1]!, pins[0]!]) > right(pins);
        pins.forEach((p, i) => expectedNet.set(p.key, swapped ? pins[1 - i]!.net : p.net));
      }
      const correct = (p: Physical) => {
        const node = nodeOf(p);
        return node !== null && node === nodeOfNet.get(expectedNet.get(p.key)!);
      };
      const wrongParts = [...byPart.values()].filter((pins) => pins.some((p) => !correct(p))).length;
      return { nodeOfNet, expectedNet, correct, wrongParts };
    };

    // En büyük toplamdan başlayıp suçlanan parça sayısını azaltan değişiklikler: iki ağın düğümlerini değiş
    // tokuş ya da ağı boş bir düğüme taşıma. Ör. ters takılmış kondansatör, iki komşusu kadar bacak taşır;
    // iki komşuyu değil kondansatörü suçlamak daha az parça demektir.
    const cols = [...assignment];
    let best = judge(cols);
    for (let improved = true; improved; ) {
      improved = false;
      for (let a = 0; a < nets.length && !improved; a++) {
        for (let b = 0; b < size && !improved; b++) {
          if (b === a) continue;
          // b < nets.length: iki ağın düğümleri değişir; b ≥ nets.length: a, b'nin (boş satır) düğümünü alır.
          const ja = cols[a]!;
          const jb = cols[b]!;
          cols[a] = jb;
          cols[b] = ja;
          const next = judge(cols);
          if (next.wrongParts < best.wrongParts) {
            best = next;
            improved = true;
          } else {
            cols[a] = ja;
            cols[b] = jb;
          }
        }
      }
    }
    const { nodeOfNet, expectedNet, correct } = best;
    const wrong = physical.filter((p) => !correct(p)).length;
    return { nodeOfConductor, nodeOf, nodeOfNet, expectedNet, correct, wrong };
  };

  // 1) Fazladan ara kablo: çıkarılınca yanlış bacak sayısı azalıyorsa (iki ayrı ağı birleştiriyor). En çok
  // azaltan kablo çıkarılır ve yeniden bakılır. Doğru kablo çıkarılınca yanlışlar artar ya da aynı kalır.
  const extraWires = new Set<number>();
  let state = analyse(extraWires);
  for (;;) {
    let best: { i: number; next: ReturnType<typeof analyse> } | null = null;
    build.wires.forEach((w, i) => {
      if (extraWires.has(i)) return;
      const c = conductor(w.a);
      if (!c || !conductor(w.b)) return;
      // Yalnızca birden çok ağın buluştuğu düğümdeki kablolar.
      const node = state.nodeOfConductor(c);
      if (new Set(physical.filter((p) => state.nodeOf(p) === node).map((p) => state.expectedNet.get(p.key))).size < 2) return;
      const next = analyse(new Set([...extraWires, i]));
      if (next.wrong < (best?.next.wrong ?? state.wrong)) best = { i, next };
    });
    if (best === null) break;
    const found = best as { i: number; next: ReturnType<typeof analyse> };
    extraWires.add(found.i);
    state = found.next;
  }
  const { nodeOf, nodeOfNet, expectedNet, correct } = state;

  // Planın sırası: tahtadakiler soldan sağa, sonra masadakiler.
  const order = [...schematic.onBoard.keys(), ...schematic.table.keys()];
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length + doc.parts.findIndex((q) => q.id === id));
  const ranked = [...physical].sort((a, b) => rank(a.part.id) - rank(b.part.id) || a.ref.pin - b.ref.pin);

  // Şemadaki ağdan anılacak uç: önce başka parçanın doğru yerdeki ucu.
  const landmark = (p: Physical, net: string): PinRef | null => {
    const others = ranked.filter((q) => q.net === net && q.part.id !== p.part.id);
    return (others.find(correct) ?? others[0] ?? ranked.find((q) => q.net === net && q.key !== p.key))?.ref ?? null;
  };
  const joinedWith = (p: Physical): PinRef | null => {
    const node = nodeOf(p);
    if (node === null) return null;
    const want = expectedNet.get(p.key);
    return ranked.find((q) => q.part.id !== p.part.id && nodeOf(q) === node && q.net !== want)?.ref ?? null;
  };
  const describe = (p: Physical): ProblemPin => ({ pin: p.ref.pin, hole: p.hole, expected: landmark(p, expectedNet.get(p.key)!), joined: joinedWith(p) });

  // 2) Parçaya göre sorunlar, planın sırasıyla.
  const problems: Problem[] = [];
  const parts = [...byPart.keys()].sort((a, b) => rank(a) - rank(b));
  for (const id of parts) {
    const pins = byPart.get(id)!;
    const wrong = pins.filter((p) => !correct(p));
    if (wrong.length === 0) continue;
    const part = pins[0]!.part;
    const base = { part: id, wire: null, inBox: false, onRail: false };
    const isBoard = mountOf(part.type) !== undefined;
    if (isBoard && !build.parts[id]) {
      problems.push({ ...base, id: `${id}:notConnected`, kind: 'notConnected', inBox: true, pins: pins.map(describe) });
      continue;
    }
    // İki bacak aynı iletkende, şemada ayrı ağlarda.
    const pair = pins.flatMap((a, i) => pins.slice(i + 1).filter((b) => a.conductor !== null && a.conductor === b.conductor && expectedNet.get(a.key) !== expectedNet.get(b.key)).map((b) => [a, b] as const))[0];
    if (isBoard && pair) {
      const rail = parseHole(pair[0].hole!, build.cols)?.kind === 'rail';
      problems.push({ ...base, id: `${id}:sameStrip`, kind: 'sameStrip', onRail: rail, pins: [pair[0], pair[1]].map(describe) });
      continue;
    }
    // Ters takılmış: bacakların düğümleri, beklenen düğümlerin başka sırası.
    const at = pins.map(nodeOf);
    const want = pins.map((p) => nodeOfNet.get(expectedNet.get(p.key)!) ?? null);
    const sorted = (xs: readonly (string | null)[]) => [...xs].map((x) => x ?? '').sort().join('\u0000');
    if (pins.length >= 2 && at.every((x) => x !== null) && want.every((x) => x !== null) && sorted(at) === sorted(want)) {
      problems.push({ ...base, id: `${id}:reversed`, kind: 'reversed', pins: pins.map(describe) });
      continue;
    }
    const extra = wrong.some((p) => joinedWith(p) !== null);
    problems.push({ ...base, id: `${id}:${extra ? 'extra' : 'notConnected'}`, kind: extra ? 'extra' : 'notConnected', pins: wrong.map(describe) });
  }
  // Kablonun iki yanından birer uç (doğru yerdekiler yeğlenir).
  for (const i of [...extraWires].sort((a, b) => a - b)) {
    const w = build.wires[i]!;
    const side = (hole: string) => {
      const node = state.nodeOfConductor(conductor(hole));
      const here = ranked.filter((p) => nodeOf(p) === node);
      return (here.find(correct) ?? here[0])?.ref ?? null;
    };
    const a = side(w.a);
    const b = side(w.b);
    if (!a || !b) continue;
    problems.push({ id: `kablo:${w.a}|${w.b}`, kind: 'extra', part: null, wire: { a: w.a, b: w.b, sides: [a, b] }, pins: [], inBox: false, onRail: false });
  }
  return { problems };
}
