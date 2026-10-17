// Netlist → çözülebilir devre.
//
// 1. Kablolar (links) union-find ile birleştirilir: aynı kümedeki anahtarlar aynı düğümdür.
// 2. Toprak sembollerinin uçları ve topraklı laboratuvar cihazlarının COM uçları (şebeke toprağı)
//    özel toprak ağına bağlanır.
// 2b. Toprak isteğe bağlıdır: toprağa bağlı olmayan her ada (birbirine bağlı devre parçası) için bir
//    pin sıfır noktası (referans) seçilir ve toprak ağına katılır (autoReferences).
// 3. Toprak dışındaki her düğüme bir bilinmeyen indeksi verilir; ardından bileşenlerin iç
//    düğümleri ve akım bilinmeyenleri (gerilim kaynağı satırları) eklenir.
// 4. Her bileşen için Device örneği oluşturulur ve topoloji kontrolleri çalıştırılır.

import type { Diagnostic } from './diagnostics';
import { DEVICE_MODELS, type Device } from './devices';
import { GROUND } from './mna';
import { GROUND_NET, type Netlist } from './netlist';
import { checkTopology } from './topology';
import { KeyedUnionFind } from './unionFind';

/** Toprağa bağlı olmayan bir ada için otomatik seçilen sıfır noktası (0 V referansı). */
export interface AutoReference {
  /** Sıfır noktası seçilen pinin anahtarı. */
  readonly key: string;
  readonly elementId: string;
  readonly pin: number;
  /** Adadaki bileşenler (toprak sembolleri hariç). */
  readonly elementIds: readonly string[];
  /** Adada bir enerji kaynağı (pil, AC kaynak, güç kaynağı, fonksiyon üreteci) var mı. */
  readonly hasSource: boolean;
}

/** Enerji kaynağı türleri (arayüz "0 V" işaretini yalnızca kaynaklı adalarda gösterir). */
const SOURCE_TYPES: ReadonlySet<string> = new Set(['battery', 'acsource', 'dcsupply', 'funcgen']);

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
  /** Devrede toprak sembolü ya da topraklı cihaz var mı (otomatik sıfır noktaları sayılmaz). */
  readonly hasGround: boolean;
  /** Toprağa bağlı olmayan adalar için seçilen sıfır noktaları (devre sırasıyla, kararlı). */
  readonly autoReferences: readonly AutoReference[];
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
  const autoReferences = chooseReferences(netlist, groundElements, earthedPins);
  if (autoReferences.length > 0) {
    nets.add(GROUND_NET);
    for (const ref of autoReferences) nets.union(ref.key, GROUND_NET);
  }
  const groundRoot = nets.has(GROUND_NET) ? nets.findKey(GROUND_NET) : null;

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

  const partial = { netlist, wiring, nets, nodeOfRoot, devices, hasGround, autoReferences, earthedPins, nodeUnknowns };
  return {
    ...partial,
    size: next,
    externalNodes,
    deviceById,
    diagnostics: checkTopology(partial),
  };
}

/**
 * Toprağa bağlı olmayan her ada için sıfır noktası. Ada: kablolar ve bileşenlerin içinden birbirine
 * bağlanan pinler (couplingPins). Seçim sırası: adadaki ilk kaynağın − ucu, yoksa adanın ilk pini
 * (bileşen ve pin sırasıyla; devre değişmedikçe aynı nokta seçilir).
 *
 * Her ada çözücünün referansına (toprak ağına) tek bir noktadan bağlanır. Bu bağlantılar ağaç
 * biçimindedir, döngü oluşturmaz: bir adaya yalnızca bir noktadan girilebildiği için o noktadan geçen
 * net akım 0'dır (KCL), adalar arasında akım yolu oluşmaz. Adayı fazla geniş tutmak (ör. bir
 * kondansatörün iki yanını aynı ada saymak) güvenlidir; bir iletken yolu iki referansa bölmek
 * değildir (toprak üzerinden sahte bir döngü oluşurdu).
 */
function chooseReferences(netlist: Netlist, groundElements: readonly Netlist['elements'][number][], earthedPins: readonly string[]): AutoReference[] {
  const islands = new KeyedUnionFind();
  for (const el of netlist.elements) for (const pin of el.pins) islands.add(pin);
  for (const link of netlist.links) islands.union(link.a, link.b);
  const grounded = groundElements.length > 0 || earthedPins.length > 0;
  if (grounded) {
    islands.add(GROUND_NET);
    for (const g of groundElements) for (const pin of g.pins) islands.union(pin, GROUND_NET);
    for (const pin of earthedPins) islands.union(pin, GROUND_NET);
  }
  for (const el of netlist.elements) {
    if (el.type === 'ground') continue;
    const groups = DEVICE_MODELS[el.type].couplingPins?.(el.props) ?? [el.pins.map((_, i) => i)];
    for (const group of groups) {
      const first = el.pins[group[0]!];
      if (first === undefined) continue;
      for (const k of group.slice(1)) islands.union(first, el.pins[k]!);
    }
  }
  const groundIsland = grounded ? islands.findKey(GROUND_NET) : null;

  interface Island {
    first: { el: string; pin: number; key: string };
    source: { el: string; pin: number; key: string } | null;
    elements: string[];
    hasSource: boolean;
  }
  const byRoot = new Map<string, Island>();
  for (const el of netlist.elements) {
    if (el.type === 'ground') continue;
    const model = DEVICE_MODELS[el.type];
    const refs = model.referencePins?.(el.props) ?? [];
    el.pins.forEach((key, pin) => {
      const root = islands.findKey(key);
      if (root === groundIsland) return;
      let island = byRoot.get(root);
      if (!island) {
        island = { first: { el: el.id, pin, key }, source: null, elements: [], hasSource: false };
        byRoot.set(root, island);
      }
      if (!island.elements.includes(el.id)) island.elements.push(el.id);
      if (SOURCE_TYPES.has(el.type)) island.hasSource = true;
      if (island.source === null && refs.includes(pin)) island.source = { el: el.id, pin, key };
    });
  }
  return [...byRoot.values()].map((island) => {
    const ref = island.source ?? island.first;
    return { key: ref.key, elementId: ref.el, pin: ref.pin, elementIds: island.elements, hasSource: island.hasSource };
  });
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
