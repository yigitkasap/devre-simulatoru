// Breadboard yerleşimi (three'siz, saf hesap): şemadaki devreden tezgâhtaki yerleşim.
//
// Breadboard: 63 sütun (küçük devrelerde 30 sütunluk yarım boy); her sütunun üst yarısı (a–e) ve alt yarısı (f–j) beşer delikli birer şerittir
// (şerit = bir düğüm). Orta kanal DIP entegreler içindir. Üstte ve altta ikişer güç rayı (+ kırmızı,
// − mavi), her biri 50 delik. Birim 2,54 mm (delik aralığı).
//
// Kurallar:
//   - Breadboard'a takılan parçalar: direnç, kondansatör, bobin, diyot, zener, LED, LDR, NTC, buzzer,
//     anahtar, sigorta (iki bacak, aynı satırda iki sütun), transistörler ve potansiyometre (üç
//     ardışık sütun), 741 ve 555 (DIP-8, orta kanalın üstünde). Öbürleri (Arduino, pil, cihazlar,
//     lamba, motor, hoparlör, röle modülü, transformatör, hazne) masada, breadboard'un çevresinde
//     durur; uçlarından breadboard'a kablo gelir. Toprak sembolü fiziksel bir parça değildir.
//   - Her ağın bir ya da birkaç şeridi olur; bir ağın şeritleri jumper'larla birleştirilir. Toprak
//     ağı − rayına, ana besleme ağı + rayına bağlanır (şeritleri raya birer jumper'la).
//   - Parçalar şemadaki soldan sağa sırasıyla yerleşir; ardışık iki parçanın ortak ağı varsa aynı
//     şeridi paylaşır (direnç → LED zinciri jumper'sız olur).
//   - Bir şeride en çok 3 bacak ya da kablo takılır; 2 delik şeritleri birleştiren jumper'lara kalır.

import { buildConnectivity, pinKey } from '../model/connectivity';
import type { CircuitDoc, Part } from '../model/types';
import type { DeviceType } from '../sim/netlist';

export const BB = {
  /** Tam boy (830 delik) ve yarım boy (400 delik) breadboard'un sütun sayısı. */
  cols: 63,
  halfCols: 30,
  depth: 21.6,
  height: 3.3,
  /** Birden çok breadboard z boyunca bu aralıkla dizilir. */
  pitch: 26,
};

/** Breadboard'un genişliği (x). */
export const boardWidth = (cols: number) => cols + 3;
/** Bir raydaki delik sayısı: beşli gruplar (tam boyda 50, yarım boyda 25). */
export const railHoles = (cols: number) => (cols >= BB.cols ? 50 : 25);
/** Sütun (1–cols) → x (kartın ortası 0). */
export const colX = (col: number, cols: number = BB.cols) => col - (cols + 1) / 2;
/** Şerit satırı (0–9 = a–j) → z. Orta kanal e ile f arasında (3 birim). */
export const stripRowZ = (row: number) => (row < 5 ? -5.5 + row : 1.5 + (row - 5));
/** Ray (0 üst +, 1 üst −, 2 alt −, 3 alt +) → z. */
export const railZ = (rail: number) => [-9, -8, 8, 9][rail]!;
/** Ray deliği (0–; beşli gruplar arasında bir boşluk) → x. */
export const railX = (k: number, cols: number = BB.cols) => {
  const n = railHoles(cols);
  const span = n - 1 + Math.floor((n - 1) / 5);
  return -span / 2 + k + Math.floor(k / 5);
};
export const boardZ = (board: number) => board * BB.pitch;

export type Hole =
  | { readonly kind: 'strip'; readonly board: number; readonly col: number; readonly row: number }
  | { readonly kind: 'rail'; readonly board: number; readonly rail: number; readonly k: number };

/** Deliğin breadboard üstündeki yeri (x, z); `cols`: kartın sütun sayısı. */
export function holeXZ(h: Hole, cols: number): { x: number; z: number } {
  return h.kind === 'strip'
    ? { x: colX(h.col, cols), z: boardZ(h.board) + stripRowZ(h.row) }
    : { x: railX(h.k, cols), z: boardZ(h.board) + railZ(h.rail) };
}

export type Mount = 'axial' | 'radial' | 'to92' | 'pot' | 'dip8';

export interface BoardPart {
  readonly partId: string;
  readonly mount: Mount;
  /** Pin sırasıyla takıldığı delikler. */
  readonly holes: readonly Hole[];
  /** DIP: kullanılmayan bacakların delikleri (görünüm için). */
  readonly extraHoles?: readonly Hole[];
}

export interface TablePart {
  readonly partId: string;
  readonly x: number;
  readonly z: number;
  /** Derece (y ekseni etrafında; şemadaki dönüş yönüyle). */
  readonly rotation: number;
}

export interface Jumper {
  readonly net: string;
  readonly a: Hole;
  readonly b: Hole;
}

/** Masadaki bir parçanın ucundan breadboard'a giden kablo. */
export interface Lead {
  readonly net: string;
  readonly partId: string;
  readonly pin: number;
  readonly hole: Hole;
}

export type NetRole = 'ground' | 'supply';

export interface BreadboardPlan {
  readonly boards: number;
  /** Kartların sütun sayısı (tam boy 63, yarım boy 30). */
  readonly cols: number;
  readonly onBoard: ReadonlyMap<string, BoardPart>;
  readonly table: ReadonlyMap<string, TablePart>;
  readonly jumpers: readonly Jumper[];
  readonly leads: readonly Lead[];
  /** Pin anahtarı (pinKey) → ağ. */
  readonly netOf: ReadonlyMap<string, string>;
  readonly roles: ReadonlyMap<string, NetRole>;
}

/** Breadboard'a takılan parçaların takılışı ve iki bacaklılarda sütun aralığı. */
const MOUNTS: Partial<Record<DeviceType, { mount: Mount; span?: number }>> = {
  resistor: { mount: 'axial', span: 4 },
  diode: { mount: 'axial', span: 4 },
  zener: { mount: 'axial', span: 3 },
  fuse: { mount: 'axial', span: 9 },
  capacitor: { mount: 'radial', span: 1 },
  inductor: { mount: 'radial', span: 2 },
  led: { mount: 'radial', span: 1 },
  ldr: { mount: 'radial', span: 1 },
  ntc: { mount: 'radial', span: 1 },
  buzzer: { mount: 'radial', span: 3 },
  switch: { mount: 'axial', span: 2 },
  npn: { mount: 'to92' },
  pnp: { mount: 'to92' },
  njfet: { mount: 'to92' },
  pjfet: { mount: 'to92' },
  nmos: { mount: 'to92' },
  pmos: { mount: 'to92' },
  potentiometer: { mount: 'pot' },
  opamp: { mount: 'dip8' },
  timer555: { mount: 'dip8' },
};

/** DIP-8: parça pin sırası → entegre bacak numarası (1–8). */
const DIP_PINS: Partial<Record<DeviceType, readonly number[]>> = {
  opamp: [2, 3, 6, 7, 4], // LM741: −, +, OUT, V+, V− (1, 5, 8 boş)
  timer555: [1, 2, 3, 4, 5, 6, 7, 8],
};

/** Masadaki parçaların yeri: sol sütun, arka sıra (cihazlar), ön sıra. */
type Side = 'left' | 'back' | 'front';
const TABLE: Partial<Record<DeviceType, { side: Side; w: number; d: number; rotation: number }>> = {
  arduino: { side: 'left', w: 21, d: 27, rotation: 0 },
  battery: { side: 'left', w: 12, d: 5.4, rotation: 0 },
  acsource: { side: 'left', w: 10, d: 5, rotation: 0 },
  dcsupply: { side: 'back', w: 11.6, d: 12.8, rotation: -90 },
  funcgen: { side: 'back', w: 8.6, d: 12.8, rotation: -90 },
  oscilloscope: { side: 'back', w: 8.6, d: 13.4, rotation: 90 },
  voltmeter: { side: 'back', w: 11, d: 5.6, rotation: 0 },
  ammeter: { side: 'back', w: 11, d: 5.6, rotation: 0 },
  lamp: { side: 'front', w: 9, d: 5, rotation: 0 },
  motor: { side: 'front', w: 12, d: 6, rotation: 0 },
  speaker: { side: 'front', w: 9, d: 6.5, rotation: 0 },
  relay: { side: 'front', w: 13, d: 10.2, rotation: 0 },
  transformer: { side: 'front', w: 13.6, d: 10.8, rotation: 0 },
  tank: { side: 'front', w: 11.5, d: 11, rotation: 0 },
};

export function isOnBoard(type: DeviceType): boolean {
  return MOUNTS[type] !== undefined;
}

/** Şeridin parçalara ayrılan delik sayısı (kalanlar jumper'lara). */
const LEG_CAPACITY = 3;
const ROWS_TOP = [2, 3, 1, 4, 0];
const ROWS_BOTTOM = [7, 6, 8, 5, 9];
const GAP = 3;

interface Strip {
  readonly board: number;
  readonly half: 0 | 1;
  readonly col: number;
  readonly net: string | null;
  readonly rows: Set<number>;
  legs: number;
}

interface Slot {
  readonly board: number;
  readonly half: 0 | 1;
  /** Bir sonraki boş sütun. */
  cursor: number;
  /** Son yerleşen parçanın son sütunu (zincir paylaşımı için); yoksa 0. */
  frontier: number;
}

/** Devre yarım boy karta sığıyorsa (en çok 28 sütun) yarım boy, yoksa tam boy breadboard. */
export function planBreadboard(doc: CircuitDoc): BreadboardPlan {
  const full = plan(doc, BB.cols);
  if (full.boards > 1) return full;
  const used = [...full.onBoard.values()].flatMap((p) => [...p.holes, ...(p.extraHoles ?? [])]);
  const strips = [...used, ...full.leads.map((l) => l.hole), ...full.jumpers.flatMap((j) => [j.a, j.b])];
  const maxCol = Math.max(0, ...strips.map((h) => (h.kind === 'strip' ? h.col : 0)));
  if (maxCol > BB.halfCols - 2) return full;
  const half = plan(doc, BB.halfCols);
  return half.boards === 1 ? half : full;
}

function plan(doc: CircuitDoc, cols: number): BreadboardPlan {
  // --- Ağlar --------------------------------------------------------------------------------------
  const { netlist } = buildConnectivity(doc);
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    let c = k;
    while (parent.has(c) && parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const el of netlist.elements) for (const pin of el.pins) if (!parent.has(pin)) parent.set(pin, pin);
  for (const link of netlist.links) {
    if (!parent.has(link.a)) parent.set(link.a, link.a);
    if (!parent.has(link.b)) parent.set(link.b, link.b);
    union(link.a, link.b);
  }
  const groundPins = netlist.elements.filter((e) => e.type === 'ground').flatMap((e) => e.pins);
  for (let i = 1; i < groundPins.length; i++) union(groundPins[0]!, groundPins[i]!);

  const netOf = new Map<string, string>();
  const members = new Map<string, number>();
  for (const el of netlist.elements) {
    if (el.type === 'ground') continue;
    el.pins.forEach((pin) => {
      const net = find(pin);
      netOf.set(pin, net);
      members.set(net, (members.get(net) ?? 0) + 1);
    });
  }
  const groundNet = groundPins.length > 0 ? find(groundPins[0]!) : null;
  const net = (part: Part, pin: number) => netOf.get(pinKey(part.id, pin))!;
  /** Başka bir parçanın pinine de bağlı mı (toprak sembolü sayılır)? */
  const connected = (part: Part, pin: number) => {
    const n = net(part, pin);
    return (members.get(n) ?? 0) > 1 || (n === groundNet && groundNet !== null);
  };

  // --- Raylar: toprak ve ana besleme ----------------------------------------------------------------
  const roles = new Map<string, NetRole>();
  const byType = (t: DeviceType) => doc.parts.filter((p) => p.type === t);
  let ground = groundNet !== null && members.has(groundNet) ? groundNet : null;
  if (!ground) {
    const candidates = [...byType('arduino').flatMap((p) => [net(p, 2), net(p, 21)]), ...byType('battery').map((p) => net(p, 1)), ...byType('dcsupply').map((p) => net(p, 1))];
    ground = candidates.filter((n) => (members.get(n) ?? 0) > 1).sort((a, b) => members.get(b)! - members.get(a)!)[0] ?? null;
  }
  if (ground) roles.set(ground, 'ground');
  const supplies = [
    ...byType('arduino').map((p) => net(p, 0)),
    ...byType('battery').map((p) => net(p, 0)),
    ...byType('dcsupply').flatMap((p) => [net(p, 0), net(p, 2)]),
  ].filter((n) => n !== ground && (members.get(n) ?? 0) > 1);
  const supply = supplies.sort((a, b) => members.get(b)! - members.get(a)!)[0];
  if (supply) roles.set(supply, 'supply');

  // --- Breadboard şeritleri ---------------------------------------------------------------------------
  const strips = new Map<string, Strip>();
  const netStrips = new Map<string, Strip[]>();
  const stripKey = (b: number, h: number, c: number) => `${b}:${h}:${c}`;
  const slots: Slot[] = [];
  const slotsOf = (board: number) => {
    while (slots.length < (board + 1) * 2) {
      const b = Math.floor(slots.length / 2);
      slots.push({ board: b, half: (slots.length % 2) as 0 | 1, cursor: 2, frontier: 0 });
    }
    return [slots[board * 2]!, slots[board * 2 + 1]!];
  };
  slotsOf(0);
  let boards = 1;

  const takeStrip = (board: number, half: 0 | 1, col: number, n: string | null): Strip => {
    const key = stripKey(board, half, col);
    let s = strips.get(key);
    if (!s) {
      s = { board, half, col, net: n, rows: new Set(), legs: 0 };
      strips.set(key, s);
      if (n !== null) netStrips.set(n, [...(netStrips.get(n) ?? []), s]);
    }
    return s;
  };
  const freeRow = (s: Strip, prefer: readonly number[]) => prefer.find((r) => !s.rows.has(r));
  const rowsOf = (half: 0 | 1) => (half === 0 ? ROWS_TOP : ROWS_BOTTOM);
  const stripHole = (s: Strip, row: number): Hole => {
    s.rows.add(row);
    return { kind: 'strip', board: s.board, col: s.col, row };
  };
  const capacityLeft = (s: Strip) => LEG_CAPACITY + (s.net !== null && roles.has(s.net) ? 1 : 0) - s.legs;

  /** `width` sütunluk yer: tercihen zincir paylaşımıyla; yoksa en boş yarıda; sığmazsa yeni breadboard. */
  const findSlot = (width: number, shareNets: readonly string[]): { slot: Slot; start: number; shared: string | null } => {
    for (let board = 0; ; board++) {
      if (board >= boards) {
        boards = board + 1;
      }
      const pair = slotsOf(board);
      for (const slot of pair) {
        if (slot.frontier > 0) {
          const s = strips.get(stripKey(slot.board, slot.half, slot.frontier));
          if (s && s.net !== null && shareNets.includes(s.net) && capacityLeft(s) > 0 && slot.frontier + width - 1 <= cols - 1) {
            return { slot, start: slot.frontier, shared: s.net };
          }
        }
      }
      const open = pair.filter((s) => s.cursor + width - 1 <= cols - 1).sort((a, b) => a.cursor - b.cursor);
      if (open[0]) return { slot: open[0], start: open[0].cursor, shared: null };
    }
  };

  const onBoard = new Map<string, BoardPart>();
  const ordered = [...doc.parts].sort((a, b) => a.x - b.x || a.y - b.y);
  for (const part of ordered) {
    const spec = MOUNTS[part.type];
    if (!spec) continue;
    if (spec.mount === 'dip8') {
      // Orta kanalın üstünde: iki yarının aynı dört sütunu.
      let board = 0;
      let start = 0;
      for (; ; board++) {
        if (board >= boards) boards = board + 1;
        const [top, bottom] = slotsOf(board);
        start = Math.max(top!.cursor, bottom!.cursor);
        if (start + 3 <= cols - 1) break;
      }
      const [top, bottom] = slotsOf(board);
      const map = DIP_PINS[part.type]!;
      const legOf = (dip: number): { half: 0 | 1; col: number; row: number } =>
        dip <= 4 ? { half: 1, col: start + dip - 1, row: 5 } : { half: 0, col: start + 8 - dip, row: 4 };
      const holes = map.map((dip, i) => {
        const at = legOf(dip);
        const s = takeStrip(board, at.half, at.col, net(part, i));
        s.legs++;
        return stripHole(s, at.row);
      });
      const extraHoles: Hole[] = [];
      for (let dip = 1; dip <= 8; dip++) {
        if (map.includes(dip)) continue;
        const at = legOf(dip);
        extraHoles.push(stripHole(takeStrip(board, at.half, at.col, null), at.row));
      }
      for (const slot of [top!, bottom!]) {
        slot.frontier = 0;
        slot.cursor = start + 3 + GAP;
      }
      onBoard.set(part.id, { partId: part.id, mount: 'dip8', holes, extraHoles });
      continue;
    }
    const pins = spec.mount === 'to92' || spec.mount === 'pot' ? 3 : 2;
    const span = pins === 3 ? 1 : spec.span!;
    const width = pins === 3 ? 3 : span + 1;
    const nets = Array.from({ length: pins }, (_, i) => net(part, i));
    const ends = [nets[0]!, nets[pins - 1]!];
    const { slot, start, shared } = findSlot(width, ends);
    // Paylaşılan ağ son pindeyse parça ters takılır (o pin ilk sütuna).
    const reversed = shared !== null && shared !== nets[0] && shared === nets[pins - 1];
    const order = Array.from({ length: pins }, (_, i) => (reversed ? pins - 1 - i : i));
    const columns = pins === 3 ? [start, start + 1, start + 2] : [start, start + span];
    const columnStrips = columns.map((col, k) => takeStrip(slot.board, slot.half, col, nets[order[k]!]!));
    // Aynı satır (bütün şeritlerde boş) tercih edilir.
    const pref = rowsOf(slot.half);
    const common = pref.find((r) => columnStrips.every((s) => !s.rows.has(r)));
    const holes: Hole[] = new Array(pins);
    columnStrips.forEach((s, k) => {
      s.legs++;
      holes[order[k]!] = stripHole(s, common ?? freeRow(s, pref) ?? pref[0]!);
    });
    slot.frontier = columns[columns.length - 1]!;
    slot.cursor = slot.frontier + GAP;
    onBoard.set(part.id, { partId: part.id, mount: spec.mount, holes });
  }

  // --- Masadaki parçalar ---------------------------------------------------------------------------
  const table = new Map<string, TablePart>();
  const sides: Record<Side, Part[]> = { left: [], back: [], front: [] };
  for (const part of ordered) {
    const t = TABLE[part.type];
    if (t) sides[t.side].push(part);
  }
  const boardsDepth = boardZ(boards - 1) + BB.depth / 2;
  const top = -BB.depth / 2;
  const leftEdge = -boardWidth(cols) / 2;
  // Sol sütun: yukarıdan aşağı, breadboard'ların ortasına göre.
  {
    const items = sides.left.map((p) => ({ p, t: TABLE[p.type]! }));
    const total = items.reduce((s, i) => s + i.t.d, 0) + GAP * Math.max(0, items.length - 1);
    let z = (top + boardsDepth) / 2 - total / 2;
    for (const { p, t } of items) {
      table.set(p.id, { partId: p.id, x: leftEdge - 4 - t.w / 2, z: z + t.d / 2, rotation: t.rotation });
      z += t.d + GAP;
    }
  }
  for (const side of ['back', 'front'] as const) {
    const items = sides[side].map((p) => ({ p, t: TABLE[p.type]! }));
    const total = items.reduce((s, i) => s + i.t.w, 0) + GAP * Math.max(0, items.length - 1);
    let x = -total / 2;
    for (const { p, t } of items) {
      const z = side === 'back' ? top - 5 - t.d / 2 : boardsDepth + 5 + t.d / 2;
      table.set(p.id, { partId: p.id, x: x + t.w / 2, z, rotation: t.rotation });
      x += t.w + GAP;
    }
  }

  // --- Masadaki parçaların kabloları ------------------------------------------------------------------
  const railUsed = new Set<string>();
  const railKey = (b: number, r: number, k: number) => `${b}:${r}:${k}`;
  /** Rayın `x`'e en yakın boş deliği. */
  const railHole = (board: number, rail: number, x: number): Hole => {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let k = 0; k < railHoles(cols); k++) {
      if (railUsed.has(railKey(board, rail, k))) continue;
      const d = Math.abs(railX(k, cols) - x);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    railUsed.add(railKey(board, rail, best));
    return { kind: 'rail', board, rail, k: best };
  };
  const railFor = (role: NetRole, topSide: boolean) => (role === 'supply' ? (topSide ? 0 : 3) : topSide ? 1 : 2);
  /** Bir ağın ray kullanımı: ray başına (breadboard, ray) kümesi. */
  const railsUsed = new Map<string, Set<string>>();
  const useRail = (n: string, board: number, rail: number) => {
    const set = railsUsed.get(n) ?? new Set<string>();
    set.add(`${board}:${rail}`);
    railsUsed.set(n, set);
  };

  /** Ağ için boş yeri olan şerit (`x`'e yakın, tercihen `half`); yoksa yeni şerit. */
  const stripFor = (n: string, x: number, half: 0 | 1, board: number): Strip => {
    const options = (netStrips.get(n) ?? []).filter((s) => capacityLeft(s) > 0);
    if (options.length > 0) {
      return options.sort((a, b) => Math.abs(colX(a.col, cols) - x) + (a.half === half ? 0 : 6) - (Math.abs(colX(b.col, cols) - x) + (b.half === half ? 0 : 6)))[0]!;
    }
    const pair = slotsOf(board);
    let slot = pair[half]!;
    if (slot.cursor > cols - 1) slot = pair[1 - half]!;
    if (slot.cursor > cols - 1) {
      boards++;
      slot = slotsOf(boards - 1)[half]!;
    }
    const s = takeStrip(slot.board, slot.half, slot.cursor, n);
    slot.frontier = 0;
    slot.cursor += 2;
    return s;
  };

  const leads: Lead[] = [];
  for (const part of ordered) {
    const place = table.get(part.id);
    if (!place) continue;
    const side = TABLE[part.type]!.side;
    const pinCount = netlist.elements.find((e) => e.id === part.id)!.pins.length;
    for (let pin = 0; pin < pinCount; pin++) {
      if (!connected(part, pin)) continue;
      const n = net(part, pin);
      const role = roles.get(n);
      const topSide = side !== 'front';
      const board = side === 'front' ? boards - 1 : 0;
      if (role) {
        const rail = railFor(role, topSide);
        useRail(n, board, rail);
        leads.push({ net: n, partId: part.id, pin, hole: railHole(board, rail, side === 'left' ? leftEdge : place.x) });
        continue;
      }
      const half: 0 | 1 = topSide ? 0 : 1;
      const s = stripFor(n, side === 'left' ? leftEdge : place.x, half, board);
      s.legs++;
      const prefer = s.half === 0 ? (topSide ? [0, 1, 4, 3, 2] : [4, 3, 0, 1, 2]) : topSide ? [5, 6, 9, 8, 7] : [9, 8, 5, 6, 7];
      leads.push({ net: n, partId: part.id, pin, hole: stripHole(s, freeRow(s, prefer) ?? prefer[0]!) });
    }
  }

  // --- Jumper'lar ------------------------------------------------------------------------------------
  const jumpers: Jumper[] = [];
  for (const [n, list] of netStrips) {
    const role = roles.get(n);
    if (role) {
      // Her şerit kendi yarısının rayına.
      for (const s of list) {
        const rail = railFor(role, s.half === 0);
        useRail(n, s.board, rail);
        const near = s.half === 0 ? [0, 1, 2, 3, 4] : [9, 8, 7, 6, 5];
        jumpers.push({ net: n, a: stripHole(s, freeRow(s, near) ?? near[0]!), b: railHole(s.board, rail, colX(s.col, cols)) });
      }
      continue;
    }
    const sorted = [...list].sort((a, b) => a.board - b.board || a.half - b.half || a.col - b.col);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      // Aynı yarıda: ortak boş satır; yarılar farklıysa kanala yakın satırlar.
      const pa = a.half === 0 ? [0, 4, 1, 3, 2] : [9, 5, 8, 6, 7];
      const pb = b.half === 0 ? [0, 4, 1, 3, 2] : [9, 5, 8, 6, 7];
      const same = a.half === b.half ? pa.find((r) => !a.rows.has(r) && !b.rows.has(r)) : undefined;
      jumpers.push({ net: n, a: stripHole(a, same ?? freeRow(a, pa) ?? pa[0]!), b: stripHole(b, same ?? freeRow(b, pb) ?? pb[0]!) });
    }
  }
  // Aynı ağın kullandığı raylar (üst/alt, breadboard'lar arası) sol uçta birleştirilir.
  for (const [n, used] of railsUsed) {
    const list = [...used].map((u) => u.split(':').map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 1; i < list.length; i++) {
      const [b0, r0] = list[i - 1]!;
      const [b1, r1] = list[i]!;
      jumpers.push({ net: n, a: railHole(b0, r0, leftEdge), b: railHole(b1, r1, leftEdge) });
    }
  }

  return { boards, cols, onBoard, table, jumpers, leads, netOf, roles };
}
