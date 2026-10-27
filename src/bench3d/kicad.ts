// PCB tasarımı ve KiCad'e aktarma (three'siz, saf hesap).
//
// Yerleşim breadboard yerleşiminden çıkar: breadboard'un 2,54 mm'lik delik ızgarası gerçek kılıfların
// bacak aralığıyla aynıdır (direnç 10,16 mm = 4 delik, LED 2,54 mm, TO-92 2,54 mm, DIP-8 sıraları
// 7,62 mm = e–f satırları). Gövdeleri çakışan parçalar en yakın boş yere kaydırılır. Breadboard'un
// şeritleri ve jumper'ları PCB'de yoktur: aynı ağın pedleri KiCad'de ince çizgiyle (ratsnest)
// gösterilir, yollar KiCad'de çizilir. Karttan dışarı giden
// bağlantılar (pil, Arduino, cihazlar, lamba, motor...) kart kenarında vidalı klemens ya da pin
// başlık olur. 555 ve 741'e 100 nF dekuplaj kondansatörü eklenir. Şebekeli devre aktarılmaz.
//
// Çıktı KiCad 7 biçimindedir (sürüm 20221018); KiCad 8 ve 9 açıp yükseltir. Kılıflar dosyanın
// içindedir (kullanıcının kitaplıklarına bağımlı değil); her birinin açıklamasında eşdeğer standart
// KiCad kılıfının adı yazar.

import { partValueText } from '../editor/PartView';
import { tr } from '../i18n/tr';
import { pinKey } from '../model/connectivity';
import type { CircuitDoc, Part } from '../model/types';
import { strProp, type DeviceType } from '../sim/netlist';
import { holeXZ, planBreadboard, type BreadboardPlan, type Hole } from './breadboard';
import { makeZip } from './zip';

const PITCH = 2.54;
const round = (v: number) => Math.round(v * 1000) / 1000;
/** Kart kenarına ve montaj deliklerine pay (mm). */
const MARGIN = 6;

export interface PcbPad {
  readonly number: string;
  /** Kart koordinatı (mm; y aşağı). */
  readonly x: number;
  readonly y: number;
  readonly net: string | null;
  readonly shape: 'circle' | 'rect' | 'oval';
  readonly size: number;
  readonly drill: number;
  /** Kaplamasız delik (montaj deliği). */
  readonly npth?: boolean;
  /** Pedin yanına serigrafiyle yazılacak ad (klemenslerde +, −, D13) ve pede göre dikey yeri (mm). */
  readonly label?: string;
  readonly labelDy?: number;
}

export interface PcbFootprint {
  readonly ref: string;
  readonly value: string;
  /** Kılıfın adı (dosyadaki) ve eşdeğer standart KiCad kılıfı. */
  readonly name: string;
  readonly equivalent: string;
  readonly pads: readonly PcbPad[];
  /** Serigrafi çizgileri (kart koordinatı). */
  readonly silk: ReadonlyArray<readonly [number, number, number, number]>;
  readonly circles: ReadonlyArray<readonly [number, number, number]>;
  /** Malzeme listesindeki açıklama (yoksa listeye girmez: montaj deliği). */
  readonly bom?: string;
  /** Simülatördeki parça; eklenen parçalarda (dekuplaj, klemens) yok. */
  readonly partId?: string;
}

export interface PcbDesign {
  readonly footprints: readonly PcbFootprint[];
  /** Ağ adları; kod = sıra + 1 (0 boş ağdır). */
  readonly nets: readonly string[];
  readonly outline: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  /** Eklenen dekuplaj kondansatörleri ve klemensler (kullanıcıya gösterilir). */
  readonly added: readonly string[];
}

export type PcbResult = { readonly ok: true; readonly design: PcbDesign } | { readonly ok: false; readonly reason: string };

/** Karttan dışarı giden bağlantının türü: güç/yük için vidalı klemens, sinyal ve ölçüm için pin başlık. */
const SCREW: ReadonlySet<string> = new Set(['battery', 'dcsupply', 'acsource', 'lamp', 'motor', 'speaker', 'relay', 'tank']);

interface Geometry {
  readonly name: string;
  readonly equivalent: string;
  readonly drill: number;
  readonly size: number;
  /** Kare pedin pin sırası (kutuplu parçada 1. ped: katot ya da + uç). */
  readonly square?: number;
  readonly body: 'axial' | 'radial' | 'to92' | 'dip' | 'rect';
  /** Radyal gövdenin yarıçapı (mm). */
  readonly radius?: number;
}

function geometry(part: Part): Geometry {
  switch (part.type) {
    case 'resistor':
      return { name: 'R_Axial_P10.16mm', equivalent: 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal', drill: 0.8, size: 1.6, body: 'axial' };
    case 'diode':
      return { name: 'D_DO-41_P10.16mm', equivalent: 'Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal', drill: 1.0, size: 2.0, square: 1, body: 'axial' };
    case 'zener':
      return { name: 'D_DO-35_P7.62mm', equivalent: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal', drill: 0.8, size: 1.6, square: 1, body: 'axial' };
    case 'fuse':
      return { name: 'Fuseholder_5x20_P22.86mm', equivalent: 'Fuse:Fuseholder_Cylinder-5x20mm_Schurter_0031_8201_Horizontal_Open', drill: 1.3, size: 2.6, body: 'rect' };
    case 'switch':
      return { name: 'Switch_P5.08mm', equivalent: 'Button_Switch_THT:SW_Slide_1P2T_CK_OS102011MS2Q', drill: 1.0, size: 1.8, body: 'rect' };
    case 'led':
      return { name: 'LED_D5.0mm_P2.54mm', equivalent: 'LED_THT:LED_D5.0mm', drill: 0.8, size: 1.6, square: 1, body: 'radial', radius: 2.5 };
    case 'capacitor':
      return strProp(part.props, 'kind', ['electrolytic', 'film'], 'electrolytic') === 'electrolytic'
        ? { name: 'CP_Radial_D5.0mm_P2.54mm', equivalent: 'Capacitor_THT:CP_Radial_D5.0mm_P2.50mm', drill: 0.8, size: 1.6, square: 0, body: 'radial', radius: 2.5 }
        : { name: 'C_Disc_P2.54mm', equivalent: 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P2.50mm', drill: 0.8, size: 1.6, body: 'radial', radius: 1.8 };
    case 'inductor':
      return { name: 'L_Radial_D13mm_P5.08mm', equivalent: 'Inductor_THT:L_Radial_D13.0mm_P5.00mm_Fastron_09HCP', drill: 1.0, size: 2.0, body: 'radial', radius: 6.5 };
    case 'ldr':
      return { name: 'LDR_P2.54mm', equivalent: 'OptoDevice:R_LDR_5.1x4.3mm_P3.4mm_Vertical', drill: 0.8, size: 1.6, body: 'radial', radius: 2.6 };
    case 'ntc':
      return { name: 'NTC_P2.54mm', equivalent: 'Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P2.54mm_Vertical', drill: 0.8, size: 1.6, body: 'radial', radius: 1.6 };
    case 'buzzer':
      return { name: 'Buzzer_D12mm_P7.62mm', equivalent: 'Buzzer_Beeper:Buzzer_12x9.5RM7.6', drill: 0.9, size: 1.8, square: 0, body: 'radial', radius: 6 };
    case 'potentiometer':
      return { name: 'Potentiometer_3pin_P2.54mm', equivalent: 'Potentiometer_THT:Potentiometer_Bourns_PTV09A-1_Single_Vertical', drill: 1.0, size: 1.8, body: 'rect' };
    case 'opamp':
    case 'timer555':
      return { name: 'DIP-8_W7.62mm', equivalent: 'Package_DIP:DIP-8_W7.62mm_Socket', drill: 0.8, size: 1.6, square: 0, body: 'dip' };
    default:
      // Transistörler (TO-92, geniş adım: elle lehimlemeye uygun).
      return { name: 'TO-92_Inline_Wide', equivalent: 'Package_TO_SOT_THT:TO-92_Inline_Wide', drill: 0.75, size: 1.5, body: 'to92' };
  }
}

/** DIP-8: parça pin sırası → entegrenin bacak numarası (breadboard.ts ile aynı). */
const DIP_PINS: Partial<Record<DeviceType, readonly number[]>> = { opamp: [2, 3, 6, 7, 4], timer555: [1, 2, 3, 4, 5, 6, 7, 8] };

/**
 * Parça pininin ped numarası, eşdeğer standart KiCad kılıfıyla aynı: kılıf standart kitaplıktakiyle
 * değiştirilirse ağlar yerinde kalır. Diyot ve LED'de 1 = katot, entegrede bacak numarası.
 */
export function padNumber(type: DeviceType, pin: number): string {
  const dip = DIP_PINS[type];
  if (dip) return String(dip[pin]);
  if (type === 'diode' || type === 'zener' || type === 'led') return pin === 0 ? '2' : '1';
  return String(pin + 1);
}

type Shape = Pick<PcbFootprint, 'pads' | 'silk' | 'circles'>;

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Kılıflar arasında bırakılan pay (her kılıfın çevresinde, mm). */
const COURTYARD = 0.4;

/** Kılıfın kapladığı alan (pedler ve gövde çizgileri), çevresinde `margin` payıyla. */
export function boxOf(f: Shape, margin = 0): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of f.pads) {
    xs.push(p.x - p.size / 2, p.x + p.size / 2);
    ys.push(p.y - p.size / 2, p.y + p.size / 2);
  }
  for (const [a, b, c, d] of f.silk) {
    xs.push(a, c);
    ys.push(b, d);
  }
  for (const [x, y, r] of f.circles) {
    xs.push(x - r, x + r);
    ys.push(y - r, y + r);
  }
  return { x0: Math.min(...xs) - margin, y0: Math.min(...ys) - margin, x1: Math.max(...xs) + margin, y1: Math.max(...ys) + margin };
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function moveFootprint<T extends Shape>(f: T, dx: number, dy: number): T {
  return {
    ...f,
    pads: f.pads.map((p) => ({ ...p, x: round(p.x + dx), y: round(p.y + dy) })),
    silk: f.silk.map(([a, b, c, d]) => [round(a + dx), round(b + dy), round(c + dx), round(d + dy)] as const),
    circles: f.circles.map(([x, y, r]) => [round(x + dx), round(y + dy), r] as const),
  };
}

/** Kaydırma adayları, 2,54 mm ızgarada yakından uzağa (eşitlikte önce dikey, önce aşağı). */
const OFFSETS: ReadonlyArray<readonly [number, number]> = (() => {
  const list: Array<[number, number]> = [];
  for (let i = -16; i <= 16; i++) for (let j = -16; j <= 16; j++) list.push([i, j]);
  return list
    .sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]) || Math.abs(a[0]) - Math.abs(b[0]) || b[1] - a[1] || a[0] - b[0])
    .map(([i, j]) => [i * PITCH, j * PITCH] as const);
})();

function rectSilk(x0: number, y0: number, x1: number, y1: number): Array<readonly [number, number, number, number]> {
  return [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ];
}

export function designPcb(doc: CircuitDoc, plan: BreadboardPlan = planBreadboard(doc)): PcbResult {
  if (doc.parts.some((p) => p.type === 'transformer')) return { ok: false, reason: tr.pcb.mains };
  const at = (h: Hole) => {
    const { x, z } = holeXZ(h, plan.cols);
    return { x: x * PITCH, y: z * PITCH };
  };
  // --- Ağ adları --------------------------------------------------------------------------------------
  const byId = new Map(doc.parts.map((p) => [p.id, p]));
  const netName = new Map<string, string>();
  for (const [net, role] of plan.roles) netName.set(net, role === 'ground' ? 'GND' : 'VCC');
  const name = (net: string | undefined, fallback: string) => {
    if (net === undefined) return null;
    let n = netName.get(net);
    if (!n) {
      n = fallback;
      netName.set(net, n);
    }
    return n;
  };

  const footprints: PcbFootprint[] = [];
  const added: string[] = [];
  for (const [id, placed] of plan.onBoard) {
    const part = byId.get(id)!;
    const g = geometry(part);
    const pins = placed.holes.map(at);
    const netOfPin = (pin: number) => plan.netOf.get(pinKey(id, pin));
    let pads: PcbPad[];
    if (g.body === 'dip') {
      const map = DIP_PINS[part.type]!;
      const all: PcbPad[] = [];
      const extras = [...(placed.extraHoles ?? [])].map(at);
      // Bacak numaraları: parçanın pinleri DIP_PINS'ten, boşlar sırayla kalan numaralar.
      const free = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => !map.includes(n));
      pins.forEach((p, i) => all.push({ number: String(map[i]), x: p.x, y: p.y, net: name(netOfPin(i), `Net-(${part.label}-Pad${map[i]})`), shape: map[i] === 1 ? 'rect' : 'oval', size: g.size, drill: g.drill }));
      // Boş bacakların numarası konumdan: alt sıra (f) soldan 1–4, üst sıra (e) sağdan 5–8.
      for (const p of extras) {
        const bottom = p.y > Math.min(...pins.map((q) => q.y), ...extras.map((q) => q.y)) + PITCH;
        const xs = [...pins, ...extras].map((q) => q.x);
        const k = Math.round((p.x - Math.min(...xs)) / PITCH);
        const number = bottom ? k + 1 : 8 - k;
        if (free.includes(number)) all.push({ number: String(number), x: p.x, y: p.y, net: null, shape: number === 1 ? 'rect' : 'oval', size: g.size, drill: g.drill });
      }
      pads = all.sort((a, b) => Number(a.number) - Number(b.number));
    } else {
      pads = pins.map((p, i) => ({
        number: padNumber(part.type, i),
        x: p.x,
        y: p.y,
        net: name(netOfPin(i), `Net-(${part.label}-Pad${padNumber(part.type, i)})`),
        shape: g.square === i ? 'rect' : 'circle',
        size: g.size,
        drill: g.drill,
      }));
    }
    const xs = pads.map((p) => p.x);
    const ys = pads.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const silk: Array<readonly [number, number, number, number]> = [];
    const circles: Array<readonly [number, number, number]> = [];
    if (g.body === 'axial' && pads.length === 2) {
      // Gövde iki pedin arasında, ped doğrultusunda.
      const [a, b] = pads as [PcbPad, PcbPad];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const half = Math.max(1, len / 2 - 1.8);
      const w = part.type === 'zener' ? 1.0 : 1.3;
      const corner = (s: number, t: number) => [cx + ux * s - uy * t, cy + uy * s + ux * t] as const;
      const c = [corner(-half, -w), corner(half, -w), corner(half, w), corner(-half, w)];
      for (let i = 0; i < 4; i++) silk.push([c[i]![0], c[i]![1], c[(i + 1) % 4]![0], c[(i + 1) % 4]![1]]);
      if (part.type === 'diode' || part.type === 'zener') {
        // Katot bandı (2. ped tarafı).
        const p0 = corner(half - 0.8, -w);
        const p1 = corner(half - 0.8, w);
        silk.push([p0[0], p0[1], p1[0], p1[1]]);
      }
    } else if (g.body === 'radial') {
      circles.push([cx, cy, g.radius!]);
    } else if (g.body === 'to92') {
      silk.push(...rectSilk(Math.min(...xs) - 1.3, cy - 1.9, Math.max(...xs) + 1.3, cy + 1.9));
    } else if (g.body === 'dip') {
      const x0 = Math.min(...xs) - 1.3;
      const x1 = Math.max(...xs) + 1.3;
      silk.push(...rectSilk(x0, cy - 2.6, x1, cy + 2.6));
      circles.push([x0 + 0.9, cy, 0.5]);
    } else {
      silk.push(...rectSilk(Math.min(...xs) - 2.2, Math.min(...ys) - 2.2, Math.max(...xs) + 2.2, Math.max(...ys) + 2.2));
    }
    footprints.push({
      ref: part.label,
      value: partValueText(part) || tr.devices.names[part.type],
      name: `devre:${g.name}`,
      equivalent: g.equivalent,
      pads,
      silk,
      circles,
      bom: `${tr.devices.names[part.type]}${partValueText(part) ? ` ${partValueText(part)}` : ''}`,
      partId: id,
    });
  }

  // --- Gövdeler çakışmasın ---------------------------------------------------------------------------
  // Breadboard'da parçalar yan yana satırlarda (2,54 mm arayla) durabilir: bacaklar ayrı deliklere
  // girer, gövdeler havada kalır. Kartta gövdeler çakışacağından her kılıf (büyükten küçüğe) breadboard
  // yerine en yakın boş yere, 2,54 mm ızgarada kaydırılır. Bağlantılar ağlarla gider.
  const boxes: Box[] = [];
  const settle = <T extends Shape>(f: T): T => {
    const box = boxOf(f, COURTYARD);
    for (const [dx, dy] of OFFSETS) {
      const b = { x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy };
      if (boxes.every((o) => !overlaps(o, b))) {
        boxes.push(b);
        return dx === 0 && dy === 0 ? f : moveFootprint(f, dx, dy);
      }
    }
    // Yakında yer yoksa en alta.
    const dy = Math.ceil((Math.max(...boxes.map((o) => o.y1)) - box.y0) / PITCH) * PITCH;
    boxes.push({ ...box, y0: box.y0 + dy, y1: box.y1 + dy });
    return moveFootprint(f, 0, dy);
  };
  const area = (f: Shape) => {
    const b = boxOf(f);
    return (b.x1 - b.x0) * (b.y1 - b.y0);
  };
  const settled = new Map<PcbFootprint, PcbFootprint>();
  for (const f of [...footprints].sort((a, b) => area(b) - area(a))) settled.set(f, settle(f));
  footprints.forEach((f, i) => (footprints[i] = settled.get(f)!));

  // --- Dekuplaj kondansatörleri (555, 741) ----------------------------------------------------------
  let nextC = 1;
  for (const f of [...footprints]) {
    const part = f.partId ? byId.get(f.partId) : undefined;
    if (!part || (part.type !== 'opamp' && part.type !== 'timer555')) continue;
    const padOf = (n: number) => f.pads.find((p) => p.number === String(n));
    const ground = [...netName.entries()].find(([, n]) => n === 'GND')?.[1];
    const pairs: Array<[PcbPad, string | null]> =
      part.type === 'timer555'
        ? [[padOf(8)!, padOf(1)!.net]]
        : [
            [padOf(7)!, ground ?? padOf(4)!.net],
            ...(ground ? ([[padOf(4)!, ground]] as Array<[PcbPad, string | null]>) : []),
          ];
    for (const [supply, other] of pairs) {
      if (!supply.net || !other || supply.net === other) continue;
      // Besleme bacağının üstünden başlayıp en yakın boş yere (5,08 mm adımlı disk kondansatör).
      const ref = `C_D${nextC++}`;
      const [x, y] = [supply.x, supply.y];
      footprints.push(
        settle({
          ref,
          value: '100 nF',
          name: 'devre:C_Disc_P5.08mm',
          equivalent: 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm',
          pads: [
            { number: '1', x, y, net: supply.net, shape: 'circle', size: 1.6, drill: 0.8 },
            { number: '2', x: x + 2 * PITCH, y, net: other, shape: 'circle', size: 1.6, drill: 0.8 },
          ],
          silk: rectSilk(x - 1, y - 1.3, x + 2 * PITCH + 1, y + 1.3),
          circles: [],
          bom: 'Seramik kondansatör 100 nF (dekuplaj)',
        }),
      );
      added.push(tr.pcb.addedDecoupling(ref, f.ref));
    }
  }

  // --- Karttan dışarı giden bağlantılar: kart üstünde klemens ya da pin başlık -----------------------
  const top = Math.min(...boxes.map((b) => b.y0), 0);
  const groups = new Map<string, Array<{ pin: number; net: string }>>();
  for (const lead of plan.leads) groups.set(lead.partId, [...(groups.get(lead.partId) ?? []), { pin: lead.pin, net: lead.net }]);
  const targetX = (net: string) => {
    const xs = footprints.flatMap((f) => f.pads.filter((p) => p.net !== null && p.net === netName.get(net)).map((p) => p.x));
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  };
  const connectors = [...groups.entries()]
    .map(([partId, pins]) => ({ part: byId.get(partId)!, pins: pins.sort((a, b) => a.pin - b.pin), x: pins.reduce((s, p) => s + targetX(p.net), 0) / pins.length }))
    .sort((a, b) => a.x - b.x);
  let cursor = Math.min(...boxes.map((b) => b.x0), 0);
  let nextJ = 1;
  for (const c of connectors) {
    const screw = SCREW.has(c.part.type);
    const pitch = screw ? 5.08 : 2.54;
    // Pedlerin altındaki adlarla birlikte parçaların üstünde kalır.
    const y = top - (screw ? 6.5 : 4.2);
    const x0 = Math.max(cursor + pitch / 2, c.x - ((c.pins.length - 1) * pitch) / 2);
    const ref = `J${nextJ++}`;
    const pinNames = tr.devices.pinShort[c.part.type];
    const pads: PcbPad[] = c.pins.map((p, i) => ({
      number: String(i + 1),
      x: x0 + i * pitch,
      y,
      net: name(p.net, `Net-(${ref}-Pad${i + 1})`),
      shape: i === 0 ? 'rect' : 'circle',
      size: screw ? 2.6 : 1.7,
      drill: screw ? 1.3 : 1.0,
      label: pinNames[p.pin] ?? String(p.pin + 1),
      // Pin başlıkta (2,54 mm) adlar sırayla alta ve üste: yan yana sığmazlar.
      labelDy: screw ? 5 : i % 2 === 0 ? 2.4 : -2.4,
    }));
    const x1 = x0 + (c.pins.length - 1) * pitch;
    footprints.push({
      ref,
      value: `${c.part.label} ${tr.devices.names[c.part.type]}`,
      name: screw ? `devre:TerminalBlock_1x${c.pins.length}_P5.08mm` : `devre:PinHeader_1x${c.pins.length}_P2.54mm`,
      equivalent: screw ? `TerminalBlock:TerminalBlock_bornier-${c.pins.length}_P5.08mm` : `Connector_PinHeader_2.54mm:PinHeader_1x${String(c.pins.length).padStart(2, '0')}_P2.54mm_Vertical`,
      pads,
      silk: rectSilk(x0 - pitch / 2, y - (screw ? 4 : 1.4), x1 + pitch / 2, y + (screw ? 3.5 : 1.4)),
      circles: [],
      bom: screw ? `Vidalı klemens ${c.pins.length}'li, 5,08 mm (${c.part.label})` : `Pin başlık 1×${c.pins.length}, 2,54 mm (${c.part.label})`,
    });
    added.push(tr.pcb.addedConnector(ref, c.part.label, tr.devices.names[c.part.type]) + (c.part.type === 'ammeter' ? tr.pcb.ammeterBridge : ''));
    cursor = x1 + pitch / 2 + 1.5;
  }

  // --- Kart kenarı ve montaj delikleri ------------------------------------------------------------------
  const extents = footprints.map((f) => boxOf(f));
  const raw = {
    x0: Math.min(...extents.map((e) => e.x0)) - MARGIN,
    y0: Math.min(...extents.map((e) => e.y0)) - MARGIN,
    x1: Math.max(...extents.map((e) => e.x1)) + MARGIN,
    y1: Math.max(...extents.map((e) => e.y1)) + MARGIN,
  };
  // Kart (50, 50) mm'den başlar, kenarlar 0,5 mm'ye yuvarlanır.
  const shiftX = 50 - Math.floor(raw.x0 * 2) / 2;
  const shiftY = 50 - Math.floor(raw.y0 * 2) / 2;
  const outline = { x0: 50, y0: 50, x1: Math.ceil((raw.x1 + shiftX) * 2) / 2, y1: Math.ceil((raw.y1 + shiftY) * 2) / 2 };
  const moved = footprints.map((f) => moveFootprint(f, shiftX, shiftY));
  const hole = 3.2;
  [
    [outline.x0 + 3.5, outline.y0 + 3.5],
    [outline.x1 - 3.5, outline.y0 + 3.5],
    [outline.x0 + 3.5, outline.y1 - 3.5],
    [outline.x1 - 3.5, outline.y1 - 3.5],
  ].forEach(([x, y], i) =>
    moved.push({
      ref: `H${i + 1}`,
      value: 'M3',
      name: 'devre:MountingHole_3.2mm_M3',
      equivalent: 'MountingHole:MountingHole_3.2mm_M3',
      pads: [{ number: '', x: x!, y: y!, net: null, shape: 'circle', size: hole, drill: hole, npth: true }],
      silk: [],
      circles: [],
    }),
  );
  const nets = [...new Set(moved.flatMap((f) => f.pads.map((p) => p.net)).filter((n): n is string => n !== null))].sort((a, b) =>
    a === 'GND' ? -1 : b === 'GND' ? 1 : a === 'VCC' ? -1 : b === 'VCC' ? 1 : a.localeCompare(b, 'tr'),
  );
  return { ok: true, design: { footprints: moved, nets, outline, added } };
}

// --- KiCad dosyaları --------------------------------------------------------------------------------------

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const n = (v: number) => String(round(v));

/** Belirli (tekrarlanabilir) UUID'ler: aynı devre aynı dosyayı verir. */
function uuids(): () => string {
  let k = 0;
  return () => {
    k++;
    return `00000000-0000-4000-8000-${k.toString(16).padStart(12, '0')}`;
  };
}

export function kicadPcb(design: PcbDesign, title: string): string {
  const id = uuids();
  const code = (net: string | null) => (net === null ? 0 : design.nets.indexOf(net) + 1);
  const font = '(effects (font (size 1 1) (thickness 0.15)))';
  const small = '(effects (font (size 0.8 0.8) (thickness 0.12)))';
  const lines: string[] = [];
  lines.push('(kicad_pcb (version 20221018) (generator devre_simulatoru)');
  lines.push('  (general (thickness 1.6))');
  lines.push('  (paper "A4")');
  lines.push(`  (title_block (title ${q(title)}) (comment 1 ${q('Devre Simülatörü breadboard yerleşiminden aktarıldı')}))`);
  lines.push('  (layers');
  for (const l of [
    '(0 "F.Cu" signal)',
    '(31 "B.Cu" signal)',
    '(32 "B.Adhes" user "B.Adhesive")',
    '(33 "F.Adhes" user "F.Adhesive")',
    '(34 "B.Paste" user)',
    '(35 "F.Paste" user)',
    '(36 "B.SilkS" user "B.Silkscreen")',
    '(37 "F.SilkS" user "F.Silkscreen")',
    '(38 "B.Mask" user)',
    '(39 "F.Mask" user)',
    '(40 "Dwgs.User" user "User.Drawings")',
    '(41 "Cmts.User" user "User.Comments")',
    '(44 "Edge.Cuts" user)',
    '(45 "Margin" user)',
    '(46 "B.CrtYd" user "B.Courtyard")',
    '(47 "F.CrtYd" user "F.Courtyard")',
    '(48 "B.Fab" user)',
    '(49 "F.Fab" user)',
  ])
    lines.push(`    ${l}`);
  lines.push('  )');
  lines.push('  (setup (pad_to_mask_clearance 0))');
  lines.push('  (net 0 "")');
  design.nets.forEach((net, i) => lines.push(`  (net ${i + 1} ${q(net)})`));
  for (const f of design.footprints) {
    const ox = f.pads[0]?.x ?? 0;
    const oy = f.pads[0]?.y ?? 0;
    const rel = (x: number, y: number) => `${n(x - ox)} ${n(y - oy)}`;
    const ys = [...f.pads.map((p) => p.y), ...f.silk.flatMap((s) => [s[1], s[3]]), ...f.circles.map((c) => c[1] - c[2])];
    const xs = [...f.pads.map((p) => p.x), ...f.silk.flatMap((s) => [s[0], s[2]])];
    const labelX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : ox;
    lines.push(`  (footprint ${q(f.name)} (layer "F.Cu")`);
    lines.push(`    (tstamp ${id()})`);
    lines.push(`    (at ${n(ox)} ${n(oy)})`);
    lines.push(`    (descr ${q(`Eşdeğer: ${f.equivalent}`)})`);
    lines.push(f.pads.some((p) => p.npth) ? '    (attr exclude_from_pos_files exclude_from_bom)' : '    (attr through_hole)');
    lines.push(`    (fp_text reference ${q(f.ref)} (at ${rel(labelX, Math.min(...ys, oy) - 1.5)}) (layer "F.SilkS") ${font} (tstamp ${id()}))`);
    lines.push(`    (fp_text value ${q(f.value)} (at ${rel(labelX, Math.max(...f.pads.map((p) => p.y)) + 2.5)}) (layer "F.Fab") ${font} (tstamp ${id()}))`);
    for (const [x0, y0, x1, y1] of f.silk) {
      lines.push(`    (fp_line (start ${rel(x0, y0)}) (end ${rel(x1, y1)}) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (tstamp ${id()}))`);
    }
    for (const [x, y, r] of f.circles) {
      lines.push(`    (fp_circle (center ${rel(x, y)}) (end ${rel(x + r, y)}) (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS") (tstamp ${id()}))`);
    }
    for (const p of f.pads) {
      if (p.label) lines.push(`    (fp_text user ${q(p.label)} (at ${rel(p.x, p.y + (p.labelDy ?? 2.4))}) (layer "F.SilkS") ${small} (tstamp ${id()}))`);
      const kind = p.npth ? 'np_thru_hole' : 'thru_hole';
      const net = p.net === null ? '' : ` (net ${code(p.net)} ${q(p.net)})`;
      lines.push(`    (pad ${q(p.number)} ${kind} ${p.shape} (at ${rel(p.x, p.y)}) (size ${n(p.size)} ${n(p.size)}) (drill ${n(p.drill)}) (layers "*.Cu" "*.Mask")${net} (tstamp ${id()}))`);
    }
    lines.push('  )');
  }
  const o = design.outline;
  lines.push(`  (gr_rect (start ${n(o.x0)} ${n(o.y0)}) (end ${n(o.x1)} ${n(o.y1)}) (stroke (width 0.1) (type default)) (fill none) (layer "Edge.Cuts") (tstamp ${id()}))`);
  lines.push(')');
  return `${lines.join('\n')}\n`;
}

/** KiCad projesi: tasarım kuralları ve ağ sınıfları (güç ağları kalın yol). */
export function kicadProject(file: string): string {
  const netclass = (name: string, track: number, clearance: number) => ({
    name,
    bus_width: 12,
    clearance,
    diff_pair_gap: 0.25,
    diff_pair_via_gap: 0.25,
    diff_pair_width: 0.2,
    line_style: 0,
    microvia_diameter: 0.3,
    microvia_drill: 0.1,
    pcb_color: 'rgba(0, 0, 0, 0.000)',
    schematic_color: 'rgba(0, 0, 0, 0.000)',
    track_width: track,
    via_diameter: 0.8,
    via_drill: 0.4,
    wire_width: 6,
  });
  return `${JSON.stringify(
    {
      board: {
        design_settings: {
          rules: { min_clearance: 0.2, min_copper_edge_clearance: 0.5, min_hole_clearance: 0.25, min_through_hole_diameter: 0.3, min_track_width: 0.25, min_via_annular_width: 0.13, min_via_diameter: 0.6 },
        },
      },
      meta: { filename: file, version: 1 },
      net_settings: {
        classes: [netclass('Default', 0.3, 0.25), netclass('Guc', 0.8, 0.3)],
        meta: { version: 3 },
        netclass_patterns: [
          { netclass: 'Guc', pattern: 'GND' },
          { netclass: 'Guc', pattern: 'VCC' },
        ],
      },
    },
    null,
    2,
  )}\n`;
}

export function bomCsv(design: PcbDesign): string {
  const groups = new Map<string, { refs: string[]; equivalent: string }>();
  for (const f of design.footprints) {
    if (!f.bom) continue;
    const key = `${f.bom}|${f.equivalent}`;
    const g = groups.get(key) ?? { refs: [], equivalent: f.equivalent };
    g.refs.push(f.ref);
    groups.set(key, g);
  }
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [['Adet', 'Parça', 'Adlar', 'Kılıf (KiCad eşdeğeri)'].map(cell).join(';')];
  for (const [key, g] of groups) rows.push([String(g.refs.length), key.split('|')[0]!, g.refs.join(', '), g.equivalent].map(cell).join(';'));
  return `﻿${rows.join('\r\n')}\r\n`;
}

/** Kart boyutu, Türkçe ondalıkla (ör. "71,5 × 45,5 mm"). */
export function boardSize(design: PcbDesign): string {
  const mm = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
  return `${mm(design.outline.x1 - design.outline.x0)} × ${mm(design.outline.y1 - design.outline.y0)} mm`;
}

export function slug(title: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  return (
    title
      .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c]!)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'devre'
  );
}

/** İndirilecek zip: KiCad projesi, PCB, malzeme listesi ve Türkçe talimat. */
export function kicadZip(doc: CircuitDoc, title: string): { ok: true; name: string; data: Uint8Array; design: PcbDesign } | { ok: false; reason: string } {
  const result = designPcb(doc);
  if (!result.ok) return result;
  const base = slug(title);
  const { design } = result;
  const data = makeZip([
    { name: `${base}/${base}.kicad_pro`, text: kicadProject(`${base}.kicad_pro`) },
    { name: `${base}/${base}.kicad_pcb`, text: kicadPcb(design, title) },
    { name: `${base}/malzeme-listesi.csv`, text: bomCsv(design) },
    { name: `${base}/OKU.txt`, text: tr.pcb.readme(title, boardSize(design), design.added) },
  ]);
  return { ok: true, name: `${base}-kicad.zip`, data, design };
}
