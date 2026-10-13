// Netlist → çözülebilir devre.
//
// 1. Kablolar (links) union-find ile birleştirilir: aynı kümedeki anahtarlar aynı düğümdür.
// 2. Toprak sembollerinin uçları ve topraklı laboratuvar cihazlarının COM uçları (şebeke toprağı)
//    özel toprak ağına bağlanır.
// 3. Toprak dışındaki her düğüme bir bilinmeyen indeksi verilir; ardından bileşenlerin iç
//    düğümleri ve akım bilinmeyenleri (gerilim kaynağı satırları) eklenir.
// 4. Her bileşen için Device örneği oluşturulur ve topoloji kontrolleri çalıştırılır.

import type { Diagnostic } from './diagnostics';
import { DEVICE_MODELS, type Device } from './devices';
import { GROUND } from './mna';
import { GROUND_NET, type Netlist } from './netlist';
import { checkTopology } from './topology';
import { KeyedUnionFind } from './unionFind';

export interface CompiledCircuit {
  readonly netlist: Netlist;
  /** Bilinmeyen sayısı (düğüm gerilimleri + akımlar). */
  readonly size: number;
  /** Toprak dışı dış düğüm sayısı. */
  readonly externalNodes: number;
  /** Gerilim bilinmeyeni sayısı (dış + iç düğümler); bunların hepsine toprağa gmin eklenir. */
  readonly nodeUnknowns: number;
  readonly devices: readonly Device[];
  readonly deviceById: ReadonlyMap<string, Device>;
  /** Toprak birleştirmesinden SONRAKİ ağlar (elektriksel düğümler). */
  readonly nets: KeyedUnionFind;
  /** Yalnızca kabloların oluşturduğu ağlar (toprak birleştirmesinden önce). */
  readonly wiring: KeyedUnionFind;
  /** Kök ağ anahtarı → bilinmeyen indeksi (toprak = −1). */
  readonly nodeOfRoot: ReadonlyMap<string, number>;
  readonly hasGround: boolean;
  /** Şebeke toprağına bağlı cihaz uçlarının anahtarları (osiloskop ve fonksiyon üretecinin COM'u). */
  readonly earthedPins: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

export function compileNetlist(netlist: Netlist): CompiledCircuit {
  const wiring = new KeyedUnionFind();
  const nets = new KeyedUnionFind();
  for (const el of netlist.elements) {
    const model = DEVICE_MODELS[el.type];
    if (!model) throw new Error(`Bilinmeyen bileşen türü: ${String(el.type)}`);
    if (el.pins.length !== model.pinCount) {
      throw new Error(`${el.id}: ${model.pinCount} pin bekleniyordu, ${el.pins.length} verildi`);
    }
    for (const pin of el.pins) {
      wiring.add(pin);
      nets.add(pin);
    }
  }
  for (const link of netlist.links) {
    wiring.union(link.a, link.b);
    nets.union(link.a, link.b);
  }

  const groundElements = netlist.elements.filter((el) => el.type === 'ground');
  const earthedPins: string[] = [];
  for (const el of netlist.elements) {
    const pin = DEVICE_MODELS[el.type].earthPin?.(el.props);
    if (pin !== null && pin !== undefined && el.pins[pin] !== undefined) earthedPins.push(el.pins[pin]!);
  }
  const hasGround = groundElements.length > 0 || earthedPins.length > 0;
  if (hasGround) {
    nets.add(GROUND_NET);
    for (const g of groundElements) for (const pin of g.pins) nets.union(pin, GROUND_NET);
    for (const pin of earthedPins) nets.union(pin, GROUND_NET);
  }
  const groundRoot = hasGround ? nets.findKey(GROUND_NET) : null;

  // Dış düğümleri numarala (pin sırasına göre, böylece numaralama kararlıdır).
  const nodeOfRoot = new Map<string, number>();
  if (groundRoot !== null) nodeOfRoot.set(groundRoot, GROUND);
  let next = 0;
  for (const el of netlist.elements) {
    for (const pin of el.pins) {
      const root = nets.findKey(pin);
      if (!nodeOfRoot.has(root)) nodeOfRoot.set(root, next++);
    }
  }
  const externalNodes = next;

  // İç düğümler, sonra akım bilinmeyenleri.
  const internalStart: number[] = [];
  for (const el of netlist.elements) {
    internalStart.push(next);
    next += DEVICE_MODELS[el.type].internalNodes;
  }
  const nodeUnknowns = next;
  const devices: Device[] = [];
  const deviceById = new Map<string, Device>();
  netlist.elements.forEach((el, i) => {
    const model = DEVICE_MODELS[el.type];
    const nodes = el.pins.map((pin) => nodeOfRoot.get(nets.findKey(pin))!);
    for (let k = 0; k < model.internalNodes; k++) nodes.push(internalStart[i]! + k);
    const branches: number[] = [];
    for (let k = 0; k < model.branchCount; k++) branches.push(next++);
    if (deviceById.has(el.id)) throw new Error(`Aynı kimlikli iki bileşen: ${el.id}`);
    const device = model.create({ id: el.id, props: el.props, nodes, branches });
    devices.push(device);
    deviceById.set(el.id, device);
  });

  const partial = { netlist, wiring, nets, nodeOfRoot, devices, hasGround, earthedPins, nodeUnknowns };
  return {
    ...partial,
    size: next,
    externalNodes,
    deviceById,
    diagnostics: checkTopology(partial),
  };
}

/** Bir bilinmeyen indeksinin hangi ağlara karşılık geldiği (hata mesajlarında vurgulama için). */
export function netKeysOfNode(circuit: CompiledCircuit, node: number): string[] {
  const keys: string[] = [];
  for (const [root, index] of circuit.nodeOfRoot) if (index === node) keys.push(root);
  return keys;
}

/** Bir bilinmeyene (düğüm ya da akım) dokunan bileşenler. */
export function devicesTouching(circuit: CompiledCircuit, unknown: number): string[] {
  return circuit.devices
    .filter((d) => d.nodes.includes(unknown) || d.branches.includes(unknown))
    .map((d) => d.id);
}
