// Tahtada kur: kurulumdan (model/build.ts) çözücünün netlist'i. Oynat bu kipte şemayla değil tahtadaki
// bağlantılarla çalışır: yanlış kurulum yanlış çalışır.
//
// Kurallar (bench3d/breadboard.ts ile aynı): bir şeridin 5 deliği birbirine bağlı; her ray kesintisiz
// (yarım boyda 25, tam boyda 50 delik), dört ray birbirinden ayrı. Parçaların değerleri şemadan gelir.
// Takılmamış uç (kutudaki parçanın bacağı, takılmamış alet kablosu) boşta kalır. Basmalı düğmenin ikiz
// bacakları içten bağlıdır (aynı yandaki bacakla); DIP'in kullanılmayan bacakları hiçbir yere bağlı değil.
//
// Toprak sembolü fiziksel bir parça değildir. Kullanıcı kararı (2026-11-02): Oynat'taki sıfır düğümü,
// şemada topraklı uçların (ör. PS1 −, OSC1 ⏚) tahtada en çok toplandığı düğümdür; eşitlikte şemadaki ilk
// uçlarınki. Doğru kurulumda şemanınkiyle aynıdır.

import { conductorOf, parseHole } from '../bench3d/holes';
import type { Build } from '../model/build';
import { CATALOG } from '../model/catalog';
import { buildConnectivity, pinKey } from '../model/connectivity';
import type { CircuitDoc } from '../model/types';
import type { Netlist, NetlistElement, NetlistLink } from '../sim/netlist';

/** Kurulumdaki sıfır düğümü elemanının kimliği (şemada yok). */
export const BOARD_GROUND_ID = '__tahta_toprak__';

export interface BoardCircuit {
  readonly netlist: Netlist;
  /** Pin anahtarı → tahtadaki düğüm (takılmamış uç kendi başına bir düğüm). */
  readonly nodeOf: ReadonlyMap<string, string>;
  /** Hiçbir şeye takılmamış uçlar (kutudaki parçanın bacakları, takılmamış kablolar). */
  readonly loosePins: ReadonlySet<string>;
  /** Oynat'ın sıfır düğümü (şemada topraklı uçların çoğunun düğümü); topraklı uç takılmamışsa null. */
  readonly groundNode: string | null;
}

class UnionFind {
  private readonly parent = new Map<string, string>();
  find(k: string): string {
    let root = k;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    let c = k;
    while (this.parent.has(c) && this.parent.get(c) !== root) {
      const next = this.parent.get(c)!;
      this.parent.set(c, root);
      c = next;
    }
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

/** Şemada toprak sembolüne bağlı uçlar (toprak sembolünün kendi ucu hariç), şemadaki sırayla. */
export function schematicGroundPins(doc: CircuitDoc): string[] {
  const { netlist } = buildConnectivity(doc);
  const uf = new UnionFind();
  for (const link of netlist.links) uf.union(link.a, link.b);
  const grounds = netlist.elements.filter((e) => e.type === 'ground').flatMap((e) => e.pins);
  if (grounds.length === 0) return [];
  const roots = new Set(grounds.map((g) => uf.find(g)));
  return netlist.elements.filter((e) => e.type !== 'ground').flatMap((e) => e.pins.filter((pin) => roots.has(uf.find(pin))));
}

export function boardCircuit(doc: CircuitDoc, build: Build): BoardCircuit {
  const uf = new UnionFind();
  const links: NetlistLink[] = [];
  const join = (a: string, b: string) => {
    uf.union(a, b);
    links.push({ a, b });
  };
  const conductor = (name: string): string | null => {
    const hole = parseHole(name, build.cols);
    return hole ? `tahta:${conductorOf(hole)}` : null;
  };

  const elements: NetlistElement[] = [];
  for (const part of doc.parts) {
    if (part.type === 'ground') continue;
    const placed = build.parts[part.id];
    const pins = Array.from({ length: CATALOG[part.type].pins.length }, (_, i) => pinKey(part.id, i));
    elements.push({ id: part.id, type: part.type, props: part.props, pins });
    if (!placed) continue;
    placed.holes.forEach((name, i) => {
      const c = conductor(name);
      if (c) join(pinKey(part.id, i), c);
    });
    // Basmalı düğme: ikiz bacak, aynı yandaki bacağa içten bağlı.
    if (part.type === 'pushbutton') {
      placed.extra?.forEach((name, i) => {
        const twin = conductor(name);
        const leg = placed.holes[i] !== undefined ? conductor(placed.holes[i]!) : null;
        if (twin && leg) join(twin, leg);
      });
    }
  }
  for (const lead of build.leads) {
    const c = conductor(lead.hole);
    if (c && doc.parts.some((p) => p.id === lead.part)) join(pinKey(lead.part, lead.pin), c);
  }
  for (const wire of build.wires) {
    const a = conductor(wire.a);
    const b = conductor(wire.b);
    if (a && b) join(a, b);
  }

  const nodeOf = new Map<string, string>();
  const loosePins = new Set<string>();
  const joined = new Set(links.flatMap((l) => [l.a, l.b]));
  for (const el of elements) {
    for (const pin of el.pins) {
      nodeOf.set(pin, uf.find(pin));
      if (!joined.has(pin)) loosePins.add(pin);
    }
  }

  // Sıfır düğümü: şemada topraklı uçların tahtada en çok toplandığı düğüm.
  const counts = new Map<string, number>();
  for (const pin of schematicGroundPins(doc)) {
    if (loosePins.has(pin) || !nodeOf.has(pin)) continue;
    const node = nodeOf.get(pin)!;
    counts.set(node, (counts.get(node) ?? 0) + 1);
  }
  let groundNode: string | null = null;
  for (const [node, n] of counts) if (groundNode === null || n > counts.get(groundNode)!) groundNode = node;
  if (groundNode !== null) {
    const pin = `${BOARD_GROUND_ID}#0`;
    elements.push({ id: BOARD_GROUND_ID, type: 'ground', props: {}, pins: [pin] });
    links.push({ a: pin, b: groundNode });
  }

  return { netlist: { elements, links }, nodeOf, loosePins, groundNode };
}
