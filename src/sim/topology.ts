// Topoloji ve bağlantı kontrolleri. Simülasyon başlamadan önce ve devre her değiştiğinde çalışır.
// Hatalar simülasyonu başlatmaz, uyarılar başlatır.

import type { Diagnostic } from './diagnostics';
import type { Device } from './devices';
import { GROUND } from './mna';
import type { Netlist } from './netlist';
import { KeyedUnionFind, UnionFind } from './unionFind';

export interface TopologyInput {
  readonly netlist: Netlist;
  readonly wiring: KeyedUnionFind;
  readonly nets: KeyedUnionFind;
  readonly nodeOfRoot: ReadonlyMap<string, number>;
  readonly devices: readonly Device[];
  readonly hasGround: boolean;
  /** Şebeke toprağına bağlı cihaz uçları: devrenin toprağı sayılır. */
  readonly earthedPins: readonly string[];
  readonly nodeUnknowns: number;
}

export function checkTopology(input: TopologyInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { netlist, wiring } = input;

  // --- Bağlantı sayımı: her kablo ağında kaç pin var? ---------------------------------
  const pinCount = new Map<string, number>();
  const nonGroundPinCount = new Map<string, number>();
  for (const el of netlist.elements) {
    for (const pin of el.pins) {
      const root = wiring.findKey(pin);
      pinCount.set(root, (pinCount.get(root) ?? 0) + 1);
      if (el.type !== 'ground') nonGroundPinCount.set(root, (nonGroundPinCount.get(root) ?? 0) + 1);
    }
  }

  // --- Toprak ----------------------------------------------------------------------
  // Topraklı bir laboratuvar cihazı (osiloskop, fonksiyon üreteci) varsa devrenin toprağı odur.
  const grounds = netlist.elements.filter((el) => el.type === 'ground');
  const earthed = input.earthedPins.length > 0;
  let groundConnected = earthed;
  if (grounds.length === 0) {
    if (netlist.elements.length > 0 && !earthed) {
      diagnostics.push({ severity: 'error', code: 'no-ground', elementIds: [], netKeys: [] });
    }
  } else {
    groundConnected =
      earthed || grounds.some((g) => g.pins.some((pin) => (nonGroundPinCount.get(wiring.findKey(pin)) ?? 0) > 0));
    if (!groundConnected) {
      diagnostics.push({
        severity: 'error',
        code: 'ground-unconnected',
        elementIds: grounds.map((g) => g.id),
        netKeys: [],
      });
    }
  }

  // --- Boşta uçlar ------------------------------------------------------------------
  for (const el of netlist.elements) {
    if (el.type === 'ground' && !groundConnected) continue; // zaten hata olarak bildirildi
    const floating = (index: number) => (pinCount.get(wiring.findKey(el.pins[index]!)) ?? 0) <= 1;
    el.pins.forEach((pin, index) => {
      // Osiloskobun kullanılmayan bir kanalı (A ya da B), fonksiyon üretecinin kullanılmayan OUT ya
      // da TTL çıkışı ve güç kaynağının iki ucu da boş olan çıkışı normaldir; ortak uçlar ise
      // bağlanmalıdır.
      if (el.type === 'oscilloscope' && index < 2) return;
      if (el.type === 'funcgen' && index < 2) return;
      if (el.type === 'dcsupply' && floating(index) && floating(index ^ 1)) return;
      const root = wiring.findKey(pin);
      if ((pinCount.get(root) ?? 0) <= 1) {
        diagnostics.push({
          severity: 'warning',
          code: 'floating-pin',
          elementIds: [el.id],
          netKeys: [root],
          pin: index,
        });
      }
    });
  }

  diagnostics.push(...findVoltageLoops(input));
  diagnostics.push(...findAmmetersAcrossBatteries(input));
  if (groundConnected) diagnostics.push(...findFloatingIslands(input));
  return diagnostics;
}

/** Bilinmeyen indeksini union-find indeksine çevirir (toprak en sona). */
function ufIndex(node: number, groundIndex: number): number {
  return node === GROUND ? groundIndex : node;
}

function rootKeysOf(input: TopologyInput, nodes: Iterable<number>): string[] {
  const wanted = new Set(nodes);
  const keys: string[] = [];
  for (const [root, index] of input.nodeOfRoot) if (wanted.has(index)) keys.push(root);
  return keys;
}

/**
 * Yalnızca ideal gerilim kaynakları, ideal ampermetreler ve kablolardan oluşan döngüler.
 * Böyle bir döngüde Kirchhoff'un gerilim yasası ya çelişir (ör. 9 V = 0 V) ya da akım belirsizdir;
 * MNA matrisi tekil olur. Her ideal gerilim dalını bir union-find'a ekleriz: iki ucu zaten aynı
 * kümedeyse dal bir döngüyü kapatıyordur.
 */
function findVoltageLoops(input: TopologyInput): Diagnostic[] {
  const groundIndex = input.nodeUnknowns;
  const uf = new UnionFind();
  for (let i = 0; i <= groundIndex; i++) uf.add();
  const adjacency = new Map<number, Array<{ to: number; id: string }>>();
  const result: Diagnostic[] = [];

  for (const device of input.devices) {
    for (const [p, n] of device.idealVoltageBranches()) {
      const a = ufIndex(p, groundIndex);
      const b = ufIndex(n, groundIndex);
      if (a === b) {
        // Kaynağın iki ucu doğrudan (kabloyla) birleştirilmiş.
        result.push({
          severity: 'error',
          code: 'voltage-loop',
          elementIds: [device.id],
          netKeys: rootKeysOf(input, [p]),
        });
        continue;
      }
      if (uf.same(a, b)) {
        const path = findPath(adjacency, a, b);
        const loopIds = [...new Set([device.id, ...path.ids])];
        result.push({
          severity: 'error',
          code: 'voltage-loop',
          elementIds: loopIds,
          netKeys: rootKeysOf(input, path.nodes.map((v) => (v === groundIndex ? GROUND : v))),
        });
        continue;
      }
      uf.union(a, b);
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a)!.push({ to: b, id: device.id });
      adjacency.get(b)!.push({ to: a, id: device.id });
    }
  }
  return result;
}

/** Ağaç (orman) üzerinde a'dan b'ye giden yolu genişlik öncelikli arama ile bulur. */
function findPath(
  adjacency: Map<number, Array<{ to: number; id: string }>>,
  from: number,
  to: number,
): { ids: string[]; nodes: number[] } {
  const previous = new Map<number, { node: number; id: string }>();
  const queue = [from];
  const visited = new Set([from]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const edge of adjacency.get(cur) ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      previous.set(edge.to, { node: cur, id: edge.id });
      queue.push(edge.to);
    }
  }
  const ids: string[] = [];
  const nodes: number[] = [to];
  let cur = to;
  while (cur !== from) {
    const step = previous.get(cur);
    if (!step) break;
    ids.push(step.id);
    nodes.push(step.node);
    cur = step.node;
  }
  return { ids, nodes };
}

/** Ampermetre doğrudan bir pilin (ya da AC kaynağın) iki ucuna bağlanmışsa (paralel) eğitsel uyarı. */
function findAmmetersAcrossBatteries(input: TopologyInput): Diagnostic[] {
  const result: Diagnostic[] = [];
  const ammeters = input.devices.filter((d) => d.type === 'ammeter');
  const batteries = input.devices.filter((d) => d.type === 'battery' || d.type === 'acsource' || d.type === 'funcgen');
  for (const ammeter of ammeters) {
    const [a0, a1] = ammeter.nodes;
    if (a0 === a1) continue;
    for (const battery of batteries) {
      const [b0, b1] = battery.nodes;
      if ((a0 === b0 && a1 === b1) || (a0 === b1 && a1 === b0)) {
        result.push({
          severity: 'warning',
          code: 'ammeter-parallel',
          elementIds: [ammeter.id, battery.id],
          netKeys: rootKeysOf(input, [b0!, b1!]),
        });
      }
    }
  }
  return result;
}

/**
 * Toprağa hiçbir bileşen üzerinden ulaşamayan devre parçaları. Bu parçalardaki gerilimler
 * yalnızca 1e-12 S'lik gmin üzerinden belirlenir ve anlamsızdır.
 */
function findFloatingIslands(input: TopologyInput): Diagnostic[] {
  const groundIndex = input.nodeUnknowns;
  const uf = new UnionFind();
  for (let i = 0; i <= groundIndex; i++) uf.add();
  for (const device of input.devices) {
    // Osiloskobun girişleri ideal (akım çekmez); uçlarını elektriksel olarak birleştirmez.
    if (device.type === 'oscilloscope') continue;
    const first = device.nodes[0];
    if (first === undefined) continue;
    for (const node of device.nodes) uf.union(ufIndex(first, groundIndex), ufIndex(node, groundIndex));
  }
  const groundRoot = uf.find(groundIndex);
  const islands = new Map<number, Device[]>();
  for (const device of input.devices) {
    if (device.type === 'ground' || device.type === 'oscilloscope') continue;
    const root = uf.find(ufIndex(device.nodes[0]!, groundIndex));
    if (root === groundRoot) continue;
    if (!islands.has(root)) islands.set(root, []);
    islands.get(root)!.push(device);
  }
  const result: Diagnostic[] = [];
  for (const members of islands.values()) {
    // Tek başına duran bileşenin uçları zaten "boşta uç" olarak bildirilir.
    if (members.length < 2) continue;
    const nodes = new Set<number>();
    for (const d of members) for (const n of d.nodes) nodes.add(n);
    result.push({
      severity: 'warning',
      code: 'floating-island',
      elementIds: members.map((d) => d.id),
      netKeys: rootKeysOf(input, nodes),
    });
  }
  return result;
}
