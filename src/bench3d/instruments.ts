// Laboratuvar cihazları: el multimetresi (multimetre, voltmetre, ampermetre), DC güç kaynağı, fonksiyon
// üreteci, osiloskop; ayrıca su haznesi. Bu cihaz tiplerinin genel görünümü: markasız (logo, marka ve model
// adı yok), panel yazıları laboratuvardaki gibi İngilizce standart işaretler. Masa üstü cihazlar dik durur,
// ön paneli kameraya (+z) bakar; el multimetresi arkadaki ayağıyla hafif geriye yaslanır.
//
// Boyutlar gerçek cihazın milimetresiyle verilir; tahta okunaklı kalsın diye tezgâhta gerçeğin %60'ı (mm()); DC güç
// kaynağı %50'si (SUPPLY_SCALE), el multimetresi kılıflı PM8233D ölçüsüne (75 × 150 mm) küçültülür (DMM_FIT).
// Gövdeler yuvarlatılmış kutular, düğmeler silindir, tuşlar kutu; malzemeler paylaşılır (kit.mat). Panel
// baskısı bir kez çizilen tuval dokusudur; ekranlar ayrı, küçük tuval dokuları (en çok 1024 px) ve değer
// değişince (en çok saniyede 10 kez) yeniden çizilir. Sıklık sınırına takılan değişiklik bekletilir
// (update true döner, sahne bir sonraki karede yeniden dener): duraklatılınca ekran son değerde kalır.
//
// Kablolar ön paneldeki soketlerden çıkar: modelin anchorDirs'i soketin dışa bakan yönü (sahne kabloyu önce
// o yönde, sonra masaya sarkıtarak çizer). Gerçek cihazda olup simülatörde karşılığı olmayan soket ve tuşlar
// (10A soketi, GND soketleri, sabit 5 V çıkışı, SWEEP…) görünür ama kablo bağlanmaz.

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Shape,
  SRGBColorSpace,
  Box3,
  Vector3,
  type Material,
} from 'three';
import { SCREEN_H, SCREEN_W } from '../editor/scopeView';
import { SCOPE_DIVISIONS_X, SCOPE_DIVISIONS_Y } from '../sim/scope';
import { multimeterMode, type MultimeterMode } from '../sim/devices/multimeter';
import { scopeSettings } from '../sim/devices/oscilloscope';
import { boolProp, numProp, strProp } from '../sim/netlist';
import { LEAD_Y, M, SPREAD, mat, mesh, ownMat, pinAnchors, wirePath } from './kit';
import type { LiveContext, PartModel } from './model';

const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const SANS = '"IBM Plex Sans", system-ui, sans-serif';

/** Cihazlar gerçek boyutun bu kadarı (tahta okunaklı kalsın; en çok %40 küçültme). */
export const INSTRUMENT_SCALE = 0.6;
/** DC güç kaynağı daha küçük: gerçeğin %50'si (%60'a göre ≈ %15 küçük; 2026-11-09). */
export const SUPPLY_SCALE = 0.5;
/**
 * El multimetresi: model 92 × 182 mm kılıflı gövdeyle çizilir; laboratuvardaki tip (PM8233D) kılıfla yaklaşık
 * 75 × 150 mm (PM8233D+: 148 × 74 × 42 mm): bütün model 150 / 182 oranında küçülür (75,8 × 150 × 41,2 mm).
 */
export const DMM_FIT = 150 / 182;
/** El multimetreleri öbür cihazlara göre %30 küçük çizilir (yanlarındaki güç kaynağı, üreteç ve osiloskoba göre çok büyük duruyordu; 2026-11-14). */
export const DMM_SHRINK = 0.7;

/** Modeli kökünden `k` oranında küçültür (uçlar da; yönler aynı). */
function resized(model: PartModel, k: number): PartModel {
  model.root.scale.setScalar(k);
  return { ...model, anchors: model.anchors.map((a) => a.clone().multiplyScalar(k)) };
}
/** Gerçek boyut (mm) → tezgâh birimi (2,54 mm), INSTRUMENT_SCALE ile. */
const mm = (v: number) => (v * INSTRUMENT_SCALE) / 2.54;
/** Tuval dokularının en büyük kenarı (px). */
const MAX_TEXTURE = 1024;
const FRONT = new Vector3(0, 0, 1);
/** Soketlerin renkleri: kırmızı (+, VΩmA), siyah (−, COM), yeşil (GND); osiloskobun kanal halkaları. */
const SOCKET = { red: '#c8312a', black: '#1d1f23', green: '#2f8f4e', ch1: '#f2c230', ch2: '#3d8fe0' } as const;

// --- Ortak parçalar ------------------------------------------------------------------------------------------

/** Ortası (cx, cy) olan, köşeleri r yarıçapla yuvarlatılmış dikdörtgen. */
function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0): Shape {
  const s = new Shape();
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const q = Math.min(r, w / 2, h / 2);
  s.moveTo(x0 + q, y0);
  s.lineTo(x1 - q, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + q);
  s.lineTo(x1, y1 - q);
  s.quadraticCurveTo(x1, y1, x1 - q, y1);
  s.lineTo(x0 + q, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - q);
  s.lineTo(x0, y0 + q);
  s.quadraticCurveTo(x0, y0, x0 + q, y0);
  return s;
}

/**
 * Gövde: önden bakınca köşeleri yuvarlatılmış, ön ve arka kenarları pahlı kutu (x: −w/2…w/2, y: 0…h,
 * z: −d/2…d/2). Ön yüzün düz kısmı (w − 2·pah) × (h − 2·pah).
 */
function shell(w: number, h: number, d: number, r: number, material: Material): Mesh {
  const b = Math.min(r * 0.45, mm(2.5));
  const g = new ExtrudeGeometry(roundedRect(w - 2 * b, h - 2 * b, Math.max(0.05, r - b)), {
    depth: d - 2 * b,
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, h / 2, -(d - 2 * b) / 2);
  return new Mesh(g, material);
}

/** Ön yüzü çevreleyen çerçeve (kauçuk kılıfın ağzı): dış w × h, iç çerçeve kalınlığı t, derinliği depth. */
function frame(w: number, h: number, r: number, t: number, depth: number, material: Material): Mesh {
  const outer = roundedRect(w, h, r);
  outer.holes.push(roundedRect(w - 2 * t, h - 2 * t, Math.max(0.05, r - t)));
  const g = new ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 5 });
  return new Mesh(g, material);
}

/** Tuval dokulu, +z'ye bakan dikdörtgen (w × h birim). Doku en çok MAX_TEXTURE px. */
function texturedPlane(w: number, h: number, maxPpu = 40) {
  const ppu = Math.min(maxPpu, MAX_TEXTURE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(w * ppu));
  canvas.height = Math.max(8, Math.round(h * ppu));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.6 });
  const plane = new Mesh(new PlaneGeometry(w, h), material);
  plane.userData.ownsMaterial = true;
  return { plane, ctx: canvas.getContext('2d')!, W: canvas.width, H: canvas.height, texture, material };
}

/** Değeri canlı değişen ekran: redraw(key) anahtar değiştiyse (ve son çizimden 0,1 s geçtiyse) çizer. */
function liveScreen(w: number, h: number, emissive: boolean, maxPpu = 40) {
  const t = texturedPlane(w, h, maxPpu);
  if (emissive) {
    // Kendi ışığı olan gösterge (LED, LCD arka ışığı): sahnenin ışığından bağımsız okunur.
    t.material.emissive.set('#ffffff');
    t.material.emissiveMap = t.texture;
    t.material.emissiveIntensity = 0.85;
    t.material.color.set('#202020');
  }
  t.plane.userData.live = true;
  let last = '';
  let lastTime = -1;
  return {
    ...t,
    /** Sıklık sınırı yüzünden çizilmediyse true (bekliyor). */
    redraw(key: string, now: number, draw: () => void, force = false): boolean {
      if (!force && key === last) return false;
      if (!force && now - lastTime < 0.1) return true;
      last = key;
      lastTime = now;
      draw();
      t.texture.needsUpdate = true;
      return false;
    },
    dispose() {
      t.texture.dispose();
      t.material.dispose();
    },
  };
}

/** Panel baskısı: milimetre cinsinden çizim (sol alt köşe 0,0; y yukarı). */
interface Print {
  readonly c: CanvasRenderingContext2D;
  /** mm → px (x soldan, y alttan). */
  X(x: number): number;
  Y(y: number): number;
  S(v: number): number;
  text(t: string, x: number, y: number, size: number, color?: string, align?: CanvasTextAlign, weight?: number, font?: string): void;
  rect(x: number, y: number, w: number, h: number, fill: string, r?: number): void;
  stroke(x: number, y: number, w: number, h: number, color: string, width: number, r?: number): void;
  circle(x: number, y: number, r: number, fill: string | null, stroke?: string, width?: number): void;
  line(x0: number, y0: number, x1: number, y1: number, color: string, width: number): void;
}

/** wMm × hMm'lik ön panel baskısı (statik doku); `draw` bir kez çağrılır. */
function printedPanel(wMm: number, hMm: number, bg: string, draw: (p: Print) => void): Mesh {
  const t = texturedPlane(mm(wMm), mm(hMm), 1e9);
  const k = t.W / wMm;
  const c = t.ctx;
  const p: Print = {
    c,
    X: (x) => x * k,
    Y: (y) => (hMm - y) * k,
    S: (v) => v * k,
    text(s, x, y, size, color = '#2b2e33', align = 'center', weight = 600, font = SANS) {
      c.fillStyle = color;
      c.font = `${weight} ${Math.round(size * k)}px ${font}`;
      c.textAlign = align;
      c.textBaseline = 'middle';
      c.fillText(s, x * k, (hMm - y) * k);
    },
    rect(x, y, w, h, fill, r = 0) {
      c.fillStyle = fill;
      c.beginPath();
      c.roundRect(x * k, (hMm - y - h) * k, w * k, h * k, r * k);
      c.fill();
    },
    stroke(x, y, w, h, color, width, r = 0) {
      c.strokeStyle = color;
      c.lineWidth = width * k;
      c.beginPath();
      c.roundRect(x * k, (hMm - y - h) * k, w * k, h * k, r * k);
      c.stroke();
    },
    circle(x, y, r, fill, stroke, width = 0.4) {
      c.beginPath();
      c.arc(x * k, (hMm - y) * k, r * k, 0, Math.PI * 2);
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = width * k;
        c.stroke();
      }
    },
    line(x0, y0, x1, y1, color, width) {
      c.strokeStyle = color;
      c.lineWidth = width * k;
      c.beginPath();
      c.moveTo(x0 * k, (hMm - y0) * k);
      c.lineTo(x1 * k, (hMm - y1) * k);
      c.stroke();
    },
  };
  c.fillStyle = bg;
  c.fillRect(0, 0, t.W, t.H);
  draw(p);
  t.texture.needsUpdate = true;
  t.material.roughness = 0.5;
  return t.plane;
}

/**
 * Ön paneldeki bir yere koymak için: gövde (w birim genişlik, ön yüzü z = front) üstünde, paneldeki
 * milimetre konumu (x soldan, y alttan) → yerel konum.
 */
function panelAt(wMm: number, front: number) {
  return (x: number, y: number, dz = 0) => new Vector3(mm(x - wMm / 2), mm(y), front + dz);
}

/** Döner düğme (ekseni +z): gövde, ön yüzünde çizgi; `rotation.z` ile döner (saat yönü negatif). */
function knob(rMm: number, depthMm: number, color = '#25282d', pointer = '#f1f1f1'): Group {
  const g = new Group();
  const r = mm(rMm);
  const d = mm(depthMm);
  const body = new CylinderGeometry(r * 0.88, r, d, 28, 1);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, d / 2);
  g.add(new Mesh(body, mat(color, 0.42)));
  const skirt = new CylinderGeometry(r * 1.12, r * 1.12, d * 0.18, 28, 1);
  skirt.rotateX(Math.PI / 2);
  skirt.translate(0, 0, d * 0.09);
  g.add(new Mesh(skirt, mat(color, 0.5)));
  const line = new BoxGeometry(Math.max(mm(0.9), r * 0.11), r * 0.62, mm(0.4));
  line.translate(0, r * 0.42, d + mm(0.2));
  g.add(new Mesh(line, mat(pointer, 0.5)));
  return g;
}

/** Saat yönünde açı (derece, 12 yönünden) → düğmenin rotation.z'si. */
const turnTo = (degrees: number) => (-degrees * Math.PI) / 180;

/** Basmalı tuş (ön yüzü +z'de). */
function key(wMm: number, hMm: number, depthMm: number, color: string): Mesh {
  const g = new BoxGeometry(mm(wMm), mm(hMm), mm(depthMm));
  g.translate(0, 0, mm(depthMm) / 2);
  return new Mesh(g, mat(color, 0.55));
}

/** Gösterge lambası (LED): kendi malzemesi, set(yanık) ile parlar. */
function lamp(rMm: number, color: string) {
  const material = ownMat('#3a3a3a', 0.35);
  const g = new CylinderGeometry(mm(rMm), mm(rMm), mm(1.6), 14);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, mm(0.8));
  const m = new Mesh(g, material);
  m.userData.live = true;
  m.userData.ownsMaterial = true;
  let state: boolean | null = null;
  return {
    mesh: m,
    material,
    set(on: boolean) {
      if (state === on) return;
      state = on;
      material.color.set(on ? color : '#3d3f43');
      material.emissive.set(on ? color : '#000000');
      material.emissiveIntensity = on ? 0.9 : 0;
    },
  };
}

/** Muz soketi (ön panelde, ağzı +z'de): renkli yaka ve koyu delik. */
function jack(color: string): Group {
  const g = new Group();
  const collar = new CylinderGeometry(mm(5.2), mm(5.6), mm(5), 20);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0, mm(2.5));
  g.add(new Mesh(collar, mat(color, 0.4)));
  const hole = new CylinderGeometry(mm(2.1), mm(2.1), mm(0.6), 12);
  hole.rotateX(Math.PI / 2);
  hole.translate(0, 0, mm(5.05));
  g.add(new Mesh(hole, mat('#0b0b0c', 0.9)));
  return g;
}

/** BNC soketi (ön panelde, ağzı +z'de); `ring` verilirse arkasında renkli halka (osiloskobun kanal rengi). */
function bnc(ring?: string): Group {
  const g = new Group();
  if (ring) {
    const disc = new CylinderGeometry(mm(8.5), mm(8.5), mm(0.6), 24);
    disc.rotateX(Math.PI / 2);
    disc.translate(0, 0, mm(0.3));
    g.add(new Mesh(disc, mat(ring, 0.45)));
  }
  const nut = new CylinderGeometry(mm(6.6), mm(6.6), mm(2.2), 6);
  nut.rotateX(Math.PI / 2);
  nut.translate(0, 0, mm(1.1));
  g.add(new Mesh(nut, M.steel()));
  const body = new CylinderGeometry(mm(4.8), mm(4.8), mm(9), 18);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, mm(4.5));
  g.add(new Mesh(body, M.steel()));
  for (const s of [-1, 1]) {
    const pin = new CylinderGeometry(mm(0.9), mm(0.9), mm(2.2), 6);
    pin.rotateZ(Math.PI / 2);
    pin.translate(s * mm(5.4), 0, mm(6.5));
    g.add(new Mesh(pin, M.steel()));
  }
  const insulator = new CylinderGeometry(mm(3.3), mm(3.3), mm(0.4), 14);
  insulator.rotateX(Math.PI / 2);
  insulator.translate(0, 0, mm(9.05));
  g.add(new Mesh(insulator, mat('#efeae0', 0.6)));
  const pin = new CylinderGeometry(mm(0.7), mm(0.7), mm(0.6), 8);
  pin.rotateX(Math.PI / 2);
  pin.translate(0, 0, mm(9.2));
  g.add(new Mesh(pin, M.gold()));
  return g;
}

/** Bir nesneyi verilen yerel konuma koyar ve döndürür. */
function put<T extends Object3D>(o: T, at: Vector3): T {
  o.position.copy(at);
  return o;
}

/** Masa üstü cihazın lastik ayakları (gövdenin altında, dört köşe). */
function feet(group: Group, w: number, d: number, lift: number) {
  const g = new CylinderGeometry(mm(6), mm(7), lift, 12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(mesh(g, mat('#1e1f22', 0.85), sx * (w / 2 - mm(16)), lift / 2, sz * (d / 2 - mm(18))));
}

// --- Yedi bölmeli gösterge -----------------------------------------------------------------------------------

/** Bölmeler: a üst, b sağ üst, c sağ alt, d alt, e sol alt, f sol üst, g orta. */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg',
  '9': 'abcfgd', '-': 'g', ' ': '', E: 'afged', r: 'eg', o: 'cdeg', L: 'fed', H: 'bcefg', P: 'abefg', O: 'abcdef', n: 'ceg', F: 'aefg', u: 'cde',
};

/**
 * `slots` haneli yedi bölmeli yazı: sağa yaslı; nokta önceki hanenin ondalık noktası. Sönük bölmeler `off`
 * rengiyle (gerçek göstergede olduğu gibi hafifçe görünür).
 */
function sevenSeg(c: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, slots: number, on: string, off: string, gap = 0.18) {
  const cells: { ch: string; dp: boolean }[] = [];
  for (const ch of text) {
    if (ch === '.' && cells.length > 0) cells[cells.length - 1]!.dp = true;
    else if (ch === '.') cells.push({ ch: ' ', dp: true });
    else cells.push({ ch, dp: false });
  }
  while (cells.length < slots) cells.unshift({ ch: ' ', dp: false });
  const shown = cells.slice(-slots);
  const w = h * 0.5;
  const t = h * 0.12;
  const pitch = w * (1 + gap) + t * 1.8;
  const skew = h * 0.08;
  shown.forEach((cell, i) => {
    const x0 = x + i * pitch;
    const lit = SEGMENTS[cell.ch] ?? '';
    const seg = (name: string, ax: number, ay: number, bx: number, by: number) => {
      c.fillStyle = lit.includes(name) ? on : off;
      // Bölme: uçları sivri altıgen; yatık (sağa eğik).
      const horizontal = ay === by;
      const sk = (yy: number) => skew * (1 - (yy - y) / h);
      c.beginPath();
      if (horizontal) {
        c.moveTo(x0 + ax + sk(ay), ay);
        c.lineTo(x0 + ax + t / 2 + sk(ay - t / 2), ay - t / 2);
        c.lineTo(x0 + bx - t / 2 + sk(ay - t / 2), ay - t / 2);
        c.lineTo(x0 + bx + sk(ay), ay);
        c.lineTo(x0 + bx - t / 2 + sk(ay + t / 2), ay + t / 2);
        c.lineTo(x0 + ax + t / 2 + sk(ay + t / 2), ay + t / 2);
      } else {
        c.moveTo(x0 + ax + sk(ay), ay);
        c.lineTo(x0 + ax + t / 2 + sk(ay + t / 2), ay + t / 2);
        c.lineTo(x0 + ax + t / 2 + sk(by - t / 2), by - t / 2);
        c.lineTo(x0 + bx + sk(by), by);
        c.lineTo(x0 + ax - t / 2 + sk(by - t / 2), by - t / 2);
        c.lineTo(x0 + ax - t / 2 + sk(ay + t / 2), ay + t / 2);
      }
      c.closePath();
      c.fill();
    };
    const top = y;
    const mid = y + h / 2;
    const bot = y + h;
    seg('a', 0, top, w, top);
    seg('g', 0, mid, w, mid);
    seg('d', 0, bot, w, bot);
    seg('f', 0, top, 0, mid);
    seg('b', w, top, w, mid);
    seg('e', 0, mid, 0, bot);
    seg('c', w, mid, w, bot);
    c.fillStyle = cell.dp ? on : off;
    c.beginPath();
    c.arc(x0 + w + t * 1.55, bot - t * 0.05, t * 0.95, 0, Math.PI * 2);
    c.fill();
  });
  return slots * pitch;
}

/** Sayıyı `digits` haneye sığdırır (ondalık nokta haneden sayılmaz): 12.0, 0.153, 5.000. */
function fitDigits(value: number, digits: number, maxDecimals = digits - 1): string {
  const a = Math.abs(value);
  const intDigits = a < 1 ? 1 : Math.floor(Math.log10(a)) + 1;
  const decimals = Math.max(0, Math.min(maxDecimals, digits - intDigits));
  let s = a.toFixed(decimals);
  if (s.replace('.', '').length > digits) s = a.toFixed(Math.max(0, decimals - 1));
  if (s.replace('.', '').length > digits) return '9'.repeat(digits);
  return (value < 0 ? '-' : '') + s;
}

/** Mühendislik gösterimi, noktalı (osiloskop ekranı): 0.0002 → "200µ", 2 → "2.00". */
function eng(value: number, unit: string): string {
  const a = Math.abs(value);
  const prefixes: readonly [number, string][] = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
  const [scale, p] = prefixes.find(([s]) => a >= s * 0.9995) ?? [1e-9, 'n'];
  const v = value / scale;
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${s}${p}${unit}`;
}

// --- El multimetresi ---------------------------------------------------------------------------------------

type DmmKind = 'multimeter' | 'voltmeter' | 'ammeter';

/** Döner anahtarın kademeleri ve açıları (derece, saat yönünde 12 yönünden). */
const DIAL: readonly (readonly [string, number])[] = [
  ['OFF', -105],
  ['V⎓', -70],
  ['V∿', -35],
  ['Ω', 0],
  ['mA', 35],
  ['A', 70],
  ['Hz', 105],
];

/** Anahtarın durduğu kademe: multimetrede seçili kip; voltmetrede V⎓/V∿; ampermetrede mA. */
function dialOf(kind: DmmKind, ctx: { props: LiveContext['props'] }): string {
  if (kind === 'ammeter') return 'mA';
  if (kind === 'voltmeter') return strProp(ctx.props, 'mode', ['dc', 'ac'], 'dc') === 'ac' ? 'V∿' : 'V⎓';
  const mode: MultimeterMode = multimeterMode(ctx.props);
  return mode === 'ac' ? 'V∿' : mode === 'ohm' ? 'Ω' : mode === 'a' ? 'A' : 'V⎓';
}

/** Okumanın ekrandaki hali: "≈ −1,23 mA" → { digits: "-1.23", unit: "mA" }; sayı değilse null. */
function lcdReading(reading: string): { digits: string; unit: string } | null {
  const m = /^(?:≈\s*)?([−-]?)([\d.,]+)\s*([kMmµnG]?)(V|A|Ω|Hz)/.exec(reading.trim());
  if (!m) return null;
  const value = Number(m[2]!.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  return { digits: fitDigits((m[1] ? -1 : 1) * value, 4, 3), unit: `${m[3]}${m[4]}` };
}

const DMM = { w: 92, h: 182, d: 50, lean: 20 };

/** El multimetresi: turuncu kauçuk kılıf, gri LCD, dört tuş, döner anahtar, üç soket; ayağıyla geriye yaslı. */
export function dmmModel(kind: DmmKind): PartModel {
  const root = new Group();
  const device = new Group();
  const w = mm(DMM.w);
  const h = mm(DMM.h);
  const d = mm(DMM.d);
  const rubber = mat('#e3742b', 0.85);
  // Kılıf: arka gövde ve öne taşan ağız (yüz içeride kalır).
  device.add(shell(w, h, d, mm(12), rubber));
  const lip = frame(w, h, mm(12), mm(6), mm(2.5), rubber);
  lip.position.set(0, h / 2, d / 2);
  device.add(lip);
  // Ön yüz baskısı (koyu gri): kademe yazıları, tuş ve soket yazıları.
  const fw = DMM.w - 12;
  const fh = DMM.h - 12;
  const front = d / 2 + 0.01;
  const at = panelAt(fw, front);
  const face = printedPanel(fw, fh, '#2c2f34', (p) => {
    // LCD çerçevesi
    p.rect(5, fh - 50, fw - 10, 40, '#1d1f23', 2);
    // Tuş yazıları
    ['FUNC', 'RANGE', 'MAX', 'HOLD'].forEach((t, i) => p.text(t, 12 + i * 18.7, fh - 64.5, 3.2, '#e6e8eb'));
    // Döner anahtarın kademeleri
    const cx = fw / 2;
    const cy = 64;
    p.circle(cx, cy, 24, null, '#596069', 0.6);
    for (const [t, a] of DIAL) {
      const rad = (a * Math.PI) / 180;
      p.line(cx + 25.5 * Math.sin(rad), cy + 25.5 * Math.cos(rad), cx + 28 * Math.sin(rad), cy + 28 * Math.cos(rad), '#e6e8eb', 0.7);
      const lx = cx + 33 * Math.sin(rad);
      const ly = cy + 33 * Math.cos(rad);
      const color = t === 'OFF' ? '#9aa1a9' : '#f3f4f6';
      if (t === 'V⎓') {
        // Doğru akım işareti (⎓, yazı tipinde yok): düz çizgi ve altında kesikli çizgi.
        p.text('V', lx - 1.6, ly, 5, color, 'center', 700);
        p.line(lx + 0.6, ly + 1.1, lx + 4.6, ly + 1.1, color, 0.6);
        for (let k = 0; k < 3; k++) p.line(lx + 0.6 + k * 1.5, ly - 0.6, lx + 1.5 + k * 1.5, ly - 0.6, color, 0.6);
      } else p.text(t, lx, ly, t.length > 2 ? 4.2 : 5, color, 'center', 700);
    }
    // Soket yazıları
    p.text('10A', 15, 26, 4.2, '#e9533a', 'center', 700);
    p.text('COM', fw / 2, 26, 4.2, '#f3f4f6', 'center', 700);
    p.text('VΩmA', fw - 15, 26, 4.2, '#e9533a', 'center', 700);
    p.text('FUSED', 15, 6, 2.6, '#9aa1a9');
    p.text('CAT III 600V', fw / 2 + 12, 6, 2.6, '#9aa1a9');
  });
  face.position.set(0, mm(6) + mm(fh) / 2, front);
  device.add(face);
  // LCD: gri, yedi bölmeli 4 hane; AC/DC ve birim işaretleri.
  const lcd = liveScreen(mm(fw - 14), mm(32), false, 30);
  lcd.material.roughness = 0.35;
  lcd.plane.position.copy(at(fw / 2, 6 + fh - 30, 0.03));
  device.add(lcd.plane);
  ['#3a3d42', '#3a3d42', '#3a3d42', '#3a3d42'].forEach((color, i) => device.add(put(key(13, 6, 2.2, color), at(12 + i * 18.7, 6 + fh - 58))));
  // Döner anahtar: büyük siyah gövde ve tutamak.
  const dial = new Group();
  const base = new CylinderGeometry(mm(21), mm(22), mm(4), 32);
  base.rotateX(Math.PI / 2);
  base.translate(0, 0, mm(2));
  dial.add(new Mesh(base, mat('#16181b', 0.45)));
  const grip = new BoxGeometry(mm(9), mm(40), mm(7));
  grip.translate(0, 0, mm(4 + 3.5));
  dial.add(new Mesh(grip, mat('#1d2024', 0.4)));
  const mark = new BoxGeometry(mm(2), mm(11), mm(0.5));
  mark.translate(0, mm(13), mm(11.3));
  dial.add(new Mesh(mark, mat('#f2f2f2', 0.5)));
  dial.position.copy(at(fw / 2, 6 + 64));
  dial.userData.live = true;
  device.add(dial);
  // Soketler: 10A (kırmızı, kablo bağlanmaz), COM (siyah), VΩmA (kırmızı).
  const socketY = 6 + 15;
  const jacks = [at(fw - 15, socketY), at(fw / 2, socketY), at(15, socketY)];
  device.add(put(jack(SOCKET.red), jacks[0]!), put(jack(SOCKET.black), jacks[1]!), put(jack(SOCKET.red), jacks[2]!));
  // Ayak (arkada, yarı yükseklikte menteşeli).
  device.rotation.x = -(DMM.lean * Math.PI) / 180;
  device.updateMatrix();
  root.add(device);
  // Yaslanınca gövdenin masaya değmesi: en alt nokta y = 0, izdüşüm ortada.
  device.updateMatrixWorld(true);
  const box = new Box3().setFromObject(device);
  const shift = new Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  device.position.add(shift);
  device.updateMatrix();
  const toRoot = (v: Vector3) => v.clone().applyMatrix4(device.matrix);
  const hinge = toRoot(new Vector3(0, h * 0.62, -d / 2));
  const foot = new Vector3(0, mm(1.5), hinge.z - mm(48));
  const stand = new BoxGeometry(mm(52), hinge.distanceTo(foot), mm(3));
  const standMesh = new Mesh(stand, mat('#3b3f45', 0.6));
  standMesh.position.addVectors(hinge, foot).multiplyScalar(0.5);
  standMesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3().subVectors(hinge, foot).normalize());
  root.add(standMesh);
  // Kablolar: VΩmA (pin 0, kırmızı) ve COM (pin 1); 10A boş.
  const mouth = (v: Vector3) => toRoot(v.clone().add(new Vector3(0, 0, mm(5.2))));
  const anchors = [mouth(jacks[0]!), mouth(jacks[1]!)];
  const dir = FRONT.clone().applyQuaternion(new Quaternion().setFromEuler(device.rotation));
  /** Ekranın sol üstündeki işaret: AC ya da DC (Ω ve Hz'de yok). */
  const acdc = (dialAt: string, props: LiveContext['props']) =>
    dialAt === 'V∿' ? 'AC' : dialAt === 'V⎓' || dialAt === 'A' ? 'DC' : dialAt === 'mA' ? (strProp(props, 'mode', ['dc', 'ac'], 'dc') === 'ac' ? 'AC' : 'DC') : '';
  const draw = (reading: string, dialAt: string, active: boolean, mark: string) => {
    const { ctx: c, W, H } = lcd;
    root.userData.screen = reading;
    c.fillStyle = '#a9b39a';
    c.fillRect(0, 0, W, H);
    const shown = dialAt === 'OFF' ? null : lcdReading(reading);
    const ink = '#1b2016';
    const ghost = 'rgba(27,32,22,0.07)';
    const digitsText = !active && dialAt !== 'Ω' ? '----' : shown ? shown.digits : dialAt === 'Ω' && /∞|açık|OL/i.test(reading) ? ' OL ' : '----';
    sevenSeg(c, digitsText.replace(/^(-?)/, '$1'), W * 0.13, H * 0.2, H * 0.58, 4, ink, ghost, 0.22);
    c.fillStyle = ink;
    c.textBaseline = 'middle';
    c.font = `700 ${Math.round(H * 0.15)}px ${SANS}`;
    c.textAlign = 'left';
    if (mark) c.fillText(mark, W * 0.03, H * 0.14);
    c.fillText('AUTO', W * 0.03, H * 0.86);
    c.textAlign = 'right';
    c.font = `700 ${Math.round(H * 0.2)}px ${SANS}`;
    c.fillText(shown && active ? shown.unit : dialAt === 'Ω' ? 'Ω' : dialAt.startsWith('V') ? 'V' : dialAt === 'Hz' ? 'Hz' : dialAt, W * 0.97, H * 0.78);
  };
  const turn = (label: string) => {
    const a = DIAL.find(([t]) => t === label)?.[1] ?? -70;
    dial.rotation.z = turnTo(a);
    // Anahtarın kademesi (denetim betikleri okur).
    root.userData.dial = label;
  };
  const initial = kind === 'ammeter' ? 'mA' : 'V⎓';
  draw('– – –', initial, false, 'DC');
  turn(initial);
  return resized({
    root,
    anchors,
    anchorDirs: [dir, dir.clone()],
    anchorColors: [SOCKET.red, SOCKET.black],
    update(ctx: LiveContext) {
      const at = dialOf(kind, ctx);
      turn(at);
      const ohm = at === 'Ω';
      // Şemadaki gösterge ve defter kartıyla aynı okuma (multimetre "≈"yi yazmaz, eskisi gibi).
      const raw = ctx.reading !== undefined && (ctx.active || ohm) ? ctx.reading : '– – –';
      const text = kind === 'multimeter' ? raw.replace(/^≈ /, '') : raw;
      const mark = acdc(at, ctx.props);
      return lcd.redraw(`${text}|${at}|${ctx.active}|${mark}`, ctx.now, () => draw(text, at, ctx.active || ohm, mark));
    },
    dispose: lcd.dispose,
  }, DMM_FIT * DMM_SHRINK);
}

// --- DC güç kaynağı ------------------------------------------------------------------------------------------

const PSU = { w: 300, h: 145, d: 270 };

/**
 * İki kanallı DC güç kaynağı: krem gövde. Her kanalda kırmızı A ve V göstergeleri, CURRENT ve VOLTAGE
 * düğmeleri, C.C ve C.V lambaları, − (siyah), GND (yeşil), + (kırmızı) soketleri; ortada INDEP / SERIES /
 * PARALLEL tuşları, altta POWER, sağda sabit 5V/3A çıkışı (son üçü işlevsiz).
 */
export function dcsupplyModel(): PartModel {
  const root = new Group();
  const w = mm(PSU.w);
  const h = mm(PSU.h);
  const d = mm(PSU.d);
  const lift = mm(8);
  feet(root, w, d, lift);
  const body = shell(w, h, d, mm(7), mat('#e6dfca', 0.55));
  body.position.y = lift;
  root.add(body);
  const front = d / 2 + 0.01;
  const pw = PSU.w - 8;
  const ph = PSU.h - 8;
  const at = (x: number, y: number, dz = 0) => panelAt(pw, front)(x, y, dz).add(new Vector3(0, lift + mm(4), 0));
  // Kanallar: CH1 x 8…118, CH2 x 128…238; ortada tuşlar; sağda sabit çıkış.
  const chX = [8, 140];
  const chW = 104;
  const panel = printedPanel(pw, ph, '#efe9d6', (p) => {
    for (let k = 0; k < 2; k++) {
      const x = chX[k]!;
      p.text(k === 0 ? 'CH1' : 'CH2', x + 4, ph - 7, 4.4, '#2b2e33', 'left', 700);
      p.text(k === 0 ? 'MASTER' : 'SLAVE', x + chW - 4, ph - 7, 3.2, '#6b6f76', 'right');
      p.rect(x, ph - 47, chW, 34, '#26282c', 2.5);
      p.text('CURRENT', x + 26, 58, 3.4);
      p.text('VOLTAGE', x + chW - 26, 58, 3.4);
      p.text('C.C', x + chW / 2 - 9, 82, 3, '#2b2e33');
      p.text('C.V', x + chW / 2 + 9, 82, 3, '#2b2e33');
      // Soketler: − GND +
      const jx = [x + 24, x + chW / 2, x + chW - 24];
      p.circle(jx[0]!, 13, 8.2, null, '#2b2e33', 0.5);
      p.circle(jx[1]!, 13, 8.2, null, '#2f8f4e', 0.5);
      p.circle(jx[2]!, 13, 8.2, null, '#c8312a', 0.5);
      p.text('−', jx[0]!, 25, 6, '#2b2e33', 'center', 700);
      p.text('GND', jx[1]!, 25, 3.4, '#2f8f4e', 'center', 700);
      p.text('+', jx[2]!, 25, 6, '#c8312a', 'center', 700);
    }
    // Ortadaki tuşlar
    const mx = 124;
    p.text('TRACKING', mx, ph - 20, 2.9, '#2b2e33', 'center', 700);
    ['INDEP', 'SERIES', 'PARALLEL'].forEach((t, i) => p.text(t, mx, ph - 33 - i * 15, 2.7, '#4a4e55'));
    p.text('POWER', mx, 26, 3, '#2b2e33', 'center', 700);
    // Sabit çıkış
    p.line(254, 8, 254, ph - 8, '#c9c1a8', 0.6);
    p.text('FIXED', 273, 58, 3.4, '#2b2e33', 'center', 700);
    p.text('5V 3A', 273, 52, 3.4, '#2b2e33', 'center', 700);
    p.text('+', 265, 25, 5, '#c8312a', 'center', 700);
    p.text('−', 281, 25, 5, '#2b2e33', 'center', 700);
  });
  panel.position.copy(at(pw / 2, ph / 2));
  root.add(panel);
  // Göstergeler (kanal başına bir doku: A ve V; kırmızı yedi bölmeli).
  const screens = chX.map((x) => {
    const s = liveScreen(mm(chW - 6), mm(28), true, 30);
    s.plane.position.copy(at(x + chW / 2, ph - 30, 0.03));
    root.add(s.plane);
    return s;
  });
  // Düğmeler: CURRENT (sol), VOLTAGE (sağ); lambalar; soketler.
  const knobs = chX.map((x) => {
    const current = put(knob(10, 9), at(x + 26, 44));
    const voltage = put(knob(10, 9), at(x + chW - 26, 44));
    current.userData.live = true;
    voltage.userData.live = true;
    root.add(current, voltage);
    return { current, voltage };
  });
  const lamps = chX.map((x) => {
    const cc = lamp(2.6, '#ff3b2f');
    const cv = lamp(2.6, '#3dde62');
    root.add(put(cc.mesh, at(x + chW / 2 - 9, 76)), put(cv.mesh, at(x + chW / 2 + 9, 76)));
    return { cc, cv };
  });
  const anchors: Vector3[] = [];
  chX.forEach((x) => {
    const jx = [x + 24, x + chW / 2, x + chW - 24];
    root.add(put(jack(SOCKET.black), at(jx[0]!, 13)), put(jack(SOCKET.green), at(jx[1]!, 13)), put(jack(SOCKET.red), at(jx[2]!, 13)));
    // Pin sırası: 1+, 1−, 2+, 2− (katalog).
    anchors.push(at(jx[2]!, 13, mm(5.2)), at(jx[0]!, 13, mm(5.2)));
  });
  for (let i = 0; i < 3; i++) root.add(put(key(14, 6, 3, '#d4ccb5'), at(124, ph - 38 - i * 15)));
  root.add(put(key(16, 9, 4, '#2b2e33'), at(124, 15)));
  root.add(put(jack('#c8312a'), at(265, 13)), put(jack('#1d1f23'), at(281, 13)));
  const draw = (k: number, amps: string, volts: string) => {
    const { ctx: c, W, H } = screens[k]!;
    c.fillStyle = '#120708';
    c.fillRect(0, 0, W, H);
    const on = '#ff3a2c';
    const off = 'rgba(255,58,44,0.08)';
    sevenSeg(c, amps, W * 0.04, H * 0.18, H * 0.62, 3, on, off);
    sevenSeg(c, volts, W * 0.56, H * 0.18, H * 0.62, 3, on, off);
    c.fillStyle = '#d9d4c4';
    c.font = `700 ${Math.round(H * 0.22)}px ${SANS}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('A', W * 0.47, H * 0.72);
    c.fillText('V', W * 0.985 - H * 0.08, H * 0.72);
  };
  const dashes = '---';
  screens.forEach((_, k) => draw(k, dashes, dashes));
  lamps.forEach((l) => {
    l.cc.set(false);
    l.cv.set(false);
  });
  return resized({
    root,
    anchors,
    anchorDirs: anchors.map(() => FRONT.clone()),
    anchorColors: [SOCKET.red, SOCKET.black, SOCKET.red, SOCKET.black],
    update(ctx) {
      const outs = ctx.status?.outputs;
      let waiting = false;
      const modes = ['', ''];
      for (let k = 0; k < 2; k++) {
        const o = outs?.[k];
        const setV = numProp(ctx.props, `voltage${k + 1}`, 0);
        const setI = numProp(ctx.props, `currentLimit${k + 1}`, 1);
        // VOLTAGE düğmesi ayarlı gerilime (0–30 V), CURRENT düğmesi akım sınırına (0–5 A) göre döner.
        knobs[k]!.voltage.rotation.z = turnTo(-135 + 270 * Math.min(1, Math.max(0, setV / 30)));
        knobs[k]!.current.rotation.z = turnTo(-135 + 270 * Math.min(1, Math.max(0, setI / 5)));
        const live = ctx.active && o !== undefined;
        const limited = live && (ctx.status?.currentLimited?.[k] ?? false);
        lamps[k]!.cc.set(limited);
        lamps[k]!.cv.set(live && !limited);
        // Yanan lamba (denetim betikleri okur).
        modes[k] = limited ? 'C.C' : live ? 'C.V' : '';
        const amps = live ? fitDigits(Math.abs(o.current), 3, 2) : dashes;
        const volts = live ? fitDigits(o.voltage, 3, 2) : dashes;
        waiting = screens[k]!.redraw(`${amps}|${volts}`, ctx.now, () => draw(k, amps, volts)) || waiting;
      }
      root.userData.lamps = modes.join('|');
      return waiting;
    },
    dispose() {
      screens.forEach((s) => s.dispose());
      lamps.forEach((l) => {
        l.cc.material.dispose();
        l.cv.material.dispose();
      });
    },
  }, SUPPLY_SCALE / INSTRUMENT_SCALE);
}

// --- Fonksiyon üreteci ---------------------------------------------------------------------------------------

const FG = { w: 250, h: 95, d: 280 };

/**
 * Fonksiyon üreteci: açık gri gövde, öne katlanmış taşıma kolu. Solda yeşil frekans göstergesi (5 hane,
 * Hz/kHz/MHz), üstte aralık tuşları ve lambalı dalga biçimi tuşları, FREQUENCY, DUTY, OFFSET, AMPL düğmeleri;
 * sağda OUTPUT 50Ω BNC (OUT), TTL BNC ve COM soketi.
 */
export function funcgenModel(): PartModel {
  const root = new Group();
  const w = mm(FG.w);
  const h = mm(FG.h);
  const d = mm(FG.d);
  const lift = mm(10);
  feet(root, w, d, lift);
  const body = shell(w, h, d, mm(6), mat('#d3d6da', 0.5));
  body.position.y = lift;
  root.add(body);
  // Taşıma kolu: yanlardan öne ve aşağı katlanmış.
  const handleMat = mat('#55595f', 0.45);
  const pivotZ = d / 2 - mm(40);
  const pivotY = lift + h * 0.5;
  for (const s of [-1, 1]) {
    const hub = new CylinderGeometry(mm(11), mm(11), mm(6), 20);
    hub.rotateZ(Math.PI / 2);
    root.add(mesh(hub, handleMat, s * (w / 2 + mm(3)), pivotY, pivotZ));
  }
  const bar = mm(3.2);
  const side = (s: number) => [new Vector3(s * (w / 2 + mm(4)), pivotY, pivotZ), new Vector3(s * (w / 2 + mm(4)), mm(5), d / 2 + mm(20))];
  root.add(wirePath([...side(-1), ...side(1).reverse()], bar, handleMat, 10));
  const front = d / 2 + 0.01;
  const pw = FG.w - 8;
  const ph = FG.h - 8;
  const at = (x: number, y: number, dz = 0) => panelAt(pw, front)(x, y, dz).add(new Vector3(0, lift + mm(4), 0));
  const ranges = ['1', '10', '100', '1k', '10k', '100k', '1M'];
  const panel = printedPanel(pw, ph, '#e2e4e7', (p) => {
    p.rect(6, 44, 92, 36, '#101311', 2.5);
    p.text('FREQUENCY', 52, 37, 3.3);
    // Dalga biçimi tuşlarının simgeleri
    const glyph = (cx: number, cy: number, kind: number) => {
      const c = p.c;
      c.strokeStyle = '#2b2e33';
      c.lineWidth = p.S(0.7);
      c.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const v = kind === 0 ? (t < 0.5 ? 1 : -1) : kind === 1 ? 1 - 4 * Math.abs(t - 0.5) : Math.sin(t * 2 * Math.PI);
        const x = p.X(cx - 4 + 8 * t);
        const y = p.Y(cy + 2.2 * v);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    };
    [0, 1, 2].forEach((k) => glyph(112 + k * 15, ph - 6, k));
    p.text('FUNCTION', 127, ph - 26, 2.8, '#4a4e55');
    ranges.forEach((t, i) => p.text(t, 164 + i * 11, ph - 6, 2.8, '#2b2e33', 'center', 700));
    p.text('RANGE (Hz)', 197, ph - 26, 2.8, '#4a4e55');
    p.text('DUTY', 120, 39, 3, '#2b2e33');
    p.text('OFFSET', 146, 39, 3, '#2b2e33');
    p.text('AMPL', 170, 39, 3, '#2b2e33');
    p.text('SWEEP', 120, 13, 2.6, '#4a4e55');
    p.text('−20dB', 146, 13, 2.6, '#4a4e55');
    p.text('TTL', 194, 33, 3, '#2b2e33', 'center', 700);
    p.text('OUTPUT 50Ω', 215, 33, 3, '#2b2e33', 'center', 700);
    p.text('COM', 235, 33, 3, '#2b2e33', 'center', 700);
    p.text('POWER', 14, 8, 2.6, '#2b2e33', 'center', 700);
  });
  panel.position.copy(at(pw / 2, ph / 2));
  root.add(panel);
  const screen = liveScreen(mm(88), mm(32), true, 30);
  screen.plane.position.copy(at(52, 62, 0.03));
  root.add(screen.plane);
  // Dalga biçimi tuşları ve lambaları; aralık tuşları.
  const waveLamps = [0, 1, 2].map((k) => {
    root.add(put(key(9, 6, 3, '#b4b8be'), at(112 + k * 15, ph - 16)));
    const l = lamp(1.4, '#3dde62');
    root.add(put(l.mesh, at(112 + k * 15, ph - 21.5)));
    return l;
  });
  ranges.forEach((_, i) => root.add(put(key(7, 6, 3, '#b4b8be'), at(164 + i * 11, ph - 16))));
  // Düğmeler: FREQUENCY büyük; DUTY, OFFSET, AMPL; işlevsiz SWEEP ve −20dB tuşları.
  const freqKnob = put(knob(13, 11), at(52, 19));
  freqKnob.userData.live = true;
  const dutyKnob = put(knob(6.5, 8), at(120, 28));
  const offsetKnob = put(knob(6.5, 8), at(146, 28));
  const amplKnob = put(knob(7.5, 8), at(170, 26));
  for (const k of [dutyKnob, offsetKnob, amplKnob]) k.userData.live = true;
  root.add(freqKnob, dutyKnob, offsetKnob, amplKnob);
  root.add(put(key(8, 5, 3, '#c9ccd1'), at(120, 18)), put(key(8, 5, 3, '#c9ccd1'), at(146, 18)));
  const attLamp = lamp(1.2, '#ffb43b');
  root.add(put(attLamp.mesh, at(153, 18)));
  root.add(put(key(12, 8, 4, '#2b2e33'), at(14, 17)));
  // Çıkışlar: OUT (BNC), TTL (BNC), COM (siyah soket). Pin sırası: OUT, TTL, COM.
  const outAt = at(215, 20);
  const ttlAt = at(194, 20);
  const comAt = at(235, 20);
  root.add(put(bnc(), outAt), put(bnc(), ttlAt), put(jack(SOCKET.black), comAt));
  const anchors = [outAt.clone().add(new Vector3(0, 0, mm(9.3))), ttlAt.clone().add(new Vector3(0, 0, mm(9.3))), comAt.clone().add(new Vector3(0, 0, mm(5.2)))];
  const draw = (digits: string, unit: string) => {
    const { ctx: c, W, H } = screen;
    c.fillStyle = '#050a06';
    c.fillRect(0, 0, W, H);
    sevenSeg(c, digits, W * 0.03, H * 0.25, H * 0.5, 5, '#46f06a', 'rgba(70,240,106,0.07)');
    c.font = `700 ${Math.round(H * 0.17)}px ${SANS}`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    ['MHz', 'kHz', 'Hz'].forEach((u, i) => {
      c.fillStyle = u === unit ? '#46f06a' : 'rgba(70,240,106,0.16)';
      c.fillText(u, W * 0.85, H * (0.25 + i * 0.25));
    });
  };
  return {
    root,
    anchors,
    anchorDirs: anchors.map(() => FRONT.clone()),
    // OUTPUT ve TTL renksiz (çelik) BNC: kablo ağın rengini alır.
    anchorColors: [undefined, undefined, SOCKET.black],
    update(ctx) {
      const wave = strProp(ctx.props, 'waveform', ['sine', 'square', 'triangle'], 'sine');
      const f = numProp(ctx.props, 'frequency', 1000);
      const [scale, unit] = f >= 1e6 ? [1e6, 'MHz'] : f >= 1e3 ? [1e3, 'kHz'] : [1, 'Hz'];
      const digits = fitDigits(f / scale, 5, 4);
      waveLamps.forEach((l, k) => l.set(['square', 'triangle', 'sine'][k] === wave));
      root.userData.wave = wave;
      attLamp.set(boolProp(ctx.props, 'attenuate', false));
      // Düğmeler ayarlara göre: frekans on yılın içinde, AMPL 0–20 Vpp, OFFSET ±10 V, DUTY %10–90.
      freqKnob.rotation.z = turnTo(-135 + 270 * (Math.log10(Math.max(1e-3, f)) % 1));
      amplKnob.rotation.z = turnTo(-135 + 270 * Math.min(1, numProp(ctx.props, 'amplitude', 2) / 20));
      offsetKnob.rotation.z = turnTo(13.5 * numProp(ctx.props, 'offset', 0));
      dutyKnob.rotation.z = turnTo(-135 + 270 * ((numProp(ctx.props, 'duty', 50) - 10) / 80));
      return screen.redraw(`${digits}|${unit}`, ctx.now, () => draw(digits, unit));
    },
    dispose() {
      screen.dispose();
      waveLamps.forEach((l) => l.material.dispose());
      attLamp.material.dispose();
    },
  };
}

// --- Osiloskop -----------------------------------------------------------------------------------------------

const OSC = { w: 320, h: 155, d: 125 };

/**
 * Dijital masa üstü osiloskop: açık gri gövde. Solda renkli ekran (siyah zemin, ızgara, CH1 sarı ve CH2 mavi
 * izler; üst ve alt bilgi çubuğunda zaman/bölme ve volt/bölme), yanında menü tuşları; sağda VOLTS/DIV,
 * POSITION, TIME/DIV ve TRIGGER düğmeleri, sarı CH1 ve mavi CH2 tuşları, kırmızı RUN/STOP, mavi AUTO; altta
 * sarı halkalı CH1 (A) ve mavi halkalı CH2 (B) BNC, yanında COM.
 */
export function oscilloscopeModel(): PartModel {
  const root = new Group();
  const w = mm(OSC.w);
  const h = mm(OSC.h);
  const d = mm(OSC.d);
  const lift = mm(9);
  feet(root, w, d, lift);
  const body = shell(w, h, d, mm(8), mat('#d8dbde', 0.5));
  body.position.y = lift;
  root.add(body);
  // Arka çıkıntı (gerçek cihazdaki gibi gövdenin arkası daralır).
  const rear = shell(w * 0.82, h * 0.78, mm(40), mm(8), mat('#cfd2d6', 0.55));
  rear.position.set(0, lift + h * 0.08, -d / 2 - mm(18));
  root.add(rear);
  const front = d / 2 + 0.01;
  const pw = OSC.w - 8;
  const ph = OSC.h - 8;
  const at = (x: number, y: number, dz = 0) => panelAt(pw, front)(x, y, dz).add(new Vector3(0, lift + mm(4), 0));
  const SX = 10;
  const SY = 34;
  const SW = 160;
  const SH = 100;
  const panel = printedPanel(pw, ph, '#e1e3e6', (p) => {
    p.rect(SX - 4, SY - 4, SW + 8, SH + 8, '#2a2d31', 3);
    // Sağ bölüm: üstte RUN/STOP, AUTO, MENU, MEASURE; altında POSITION, kanal tuşları, VOLTS/DIV; sağ
    // sütunda yatay POSITION, TIME/DIV ve TRIGGER LEVEL; en altta girişler.
    p.line(198, 34, 198, ph - 6, '#c3c7cc', 0.5);
    p.line(266, 34, 266, 118, '#c3c7cc', 0.5);
    p.text('RUN/STOP', 210, 128, 2.6, '#2b2e33');
    p.text('AUTO', 236, 128, 2.6, '#2b2e33');
    p.text('MENU', 268, 128, 2.6, '#2b2e33');
    p.text('MEASURE', 294, 128, 2.6, '#2b2e33');
    p.text('VERTICAL', 223, 121, 2.8, '#4a4e55', 'center', 700);
    p.text('POSITION', 223, 114, 2.4, '#4a4e55');
    p.text('VOLTS/DIV', 223, 51, 2.8, '#2b2e33');
    p.text('HORIZONTAL', 290, 121, 2.8, '#4a4e55', 'center', 700);
    p.text('POSITION', 290, 114, 2.4, '#4a4e55');
    p.text('TIME/DIV', 290, 70, 2.8, '#2b2e33');
    p.text('TRIGGER LEVEL', 290, 40, 2.4, '#2b2e33', 'center', 700);
    p.text('CH1', 206, 25, 3, '#9a7d00', 'center', 700);
    p.text('CH2', 236, 25, 3, '#1f6fb5', 'center', 700);
    p.text('COM', 262, 25, 3, '#2b2e33', 'center', 700);
    p.text('EXT TRIG', 290, 25, 2.6, '#4a4e55');
    p.text('POWER', 22, 8, 2.6, '#2b2e33', 'center', 700);
    p.rect(150, 10, 12, 5, '#2a2d31', 1);
    p.text('USB', 156, 20, 2.4, '#4a4e55');
  });
  panel.position.copy(at(pw / 2, ph / 2));
  root.add(panel);
  const screen = liveScreen(mm(SW), mm(SH), true, 1e9);
  screen.plane.position.copy(at(SX + SW / 2, SY + SH / 2, 0.03));
  root.add(screen.plane);
  // Menü tuşları (ekranın sağında), üstte RUN/STOP ve AUTO, ötekiler gri.
  for (let i = 0; i < 5; i++) root.add(put(key(10, 8, 3, '#b9bdc3'), at(SX + SW + 12, SY + 10 + i * 20)));
  root.add(put(key(14, 7, 3, '#d23a32'), at(210, 137)), put(key(14, 7, 3, '#2f6fd6'), at(236, 137)));
  root.add(put(key(14, 7, 3, '#b9bdc3'), at(268, 137)), put(key(14, 7, 3, '#b9bdc3'), at(294, 137)));
  root.add(put(key(12, 7, 3, '#f2c230'), at(210, 87)), put(key(12, 7, 3, '#3d8fe0'), at(236, 87)));
  const live = (k: Group) => {
    k.userData.live = true;
    return k;
  };
  const voltsKnobs = [live(put(knob(8, 9), at(210, 66))), live(put(knob(8, 9), at(236, 66)))];
  const posKnobs = [put(knob(4.5, 7), at(210, 106)), put(knob(4.5, 7), at(236, 106)), put(knob(4.5, 7), at(290, 106))];
  const timeKnob = live(put(knob(10, 10), at(290, 85)));
  const levelKnob = put(knob(6, 8), at(290, 51));
  root.add(...voltsKnobs, ...posKnobs, timeKnob, levelKnob);
  // Girişler: CH1 (A, sarı halka), CH2 (B, mavi halka), COM; işlevsiz EXT TRIG.
  const aAt = at(206, 12);
  const bAt = at(236, 12);
  const comAt = at(262, 12);
  root.add(put(bnc(SOCKET.ch1), aAt), put(bnc(SOCKET.ch2), bAt), put(jack(SOCKET.black), comAt), put(bnc(), at(290, 12)));
  root.add(put(key(12, 8, 4, '#2b2e33'), at(22, 17)));
  const anchors = [aAt.clone().add(new Vector3(0, 0, mm(9.3))), bAt.clone().add(new Vector3(0, 0, mm(9.3))), comAt.clone().add(new Vector3(0, 0, mm(5.2)))];
  const COLORS = ['#ffd43b', '#4dc3ff'];
  const draw = (paths: readonly string[], xy: string, info: { time: string; volts: readonly string[]; coupling: readonly string[]; running: boolean; xyMode: boolean }) => {
    const { ctx: c, W, H } = screen;
    c.fillStyle = '#05070a';
    c.fillRect(0, 0, W, H);
    const bar = H * 0.075;
    const gx = W * 0.02;
    const gy = bar + H * 0.01;
    const gw = W * 0.96;
    const gh = H - 2 * bar - H * 0.02;
    // Izgara: bölme çizgileri ve orta eksenlerde küçük çentikler.
    c.strokeStyle = 'rgba(160,170,180,0.28)';
    c.lineWidth = Math.max(1, W / 700);
    c.setLineDash([W / 300, W / 160]);
    for (let i = 1; i < SCOPE_DIVISIONS_X; i++) {
      c.beginPath();
      c.moveTo(gx + (gw * i) / SCOPE_DIVISIONS_X, gy);
      c.lineTo(gx + (gw * i) / SCOPE_DIVISIONS_X, gy + gh);
      c.stroke();
    }
    for (let i = 1; i < SCOPE_DIVISIONS_Y; i++) {
      c.beginPath();
      c.moveTo(gx, gy + (gh * i) / SCOPE_DIVISIONS_Y);
      c.lineTo(gx + gw, gy + (gh * i) / SCOPE_DIVISIONS_Y);
      c.stroke();
    }
    c.setLineDash([]);
    c.strokeStyle = 'rgba(190,200,210,0.55)';
    c.strokeRect(gx, gy, gw, gh);
    c.save();
    c.beginPath();
    c.rect(gx, gy, gw, gh);
    c.clip();
    // İzler ekranın birimiyle (bölme başına SCREEN_DIV).
    c.translate(gx, gy);
    c.scale(gw / SCREEN_W, gh / SCREEN_H);
    c.lineWidth = 2.4;
    c.lineJoin = 'round';
    if (xy) {
      c.strokeStyle = COLORS[0]!;
      c.stroke(new Path2D(xy));
    } else {
      paths.forEach((path, i) => {
        if (!path) return;
        c.strokeStyle = COLORS[i]!;
        c.stroke(new Path2D(path));
      });
    }
    c.restore();
    // Bilgi çubukları
    c.textBaseline = 'middle';
    c.font = `600 ${Math.round(bar * 0.62)}px ${MONO}`;
    c.textAlign = 'left';
    c.fillStyle = info.running ? '#46f06a' : '#ff5a4f';
    c.fillText(info.running ? 'RUN' : 'STOP', W * 0.02, bar / 2);
    c.fillStyle = '#e8eaed';
    c.fillText(info.xyMode ? 'X-Y' : `M ${info.time}`, W * 0.2, bar / 2);
    c.textAlign = 'right';
    c.fillStyle = COLORS[0]!;
    c.fillText('T CH1', W * 0.98, bar / 2);
    c.textAlign = 'left';
    info.volts.forEach((v, i) => {
      const x = W * (0.02 + i * 0.28);
      c.fillStyle = COLORS[i]!;
      c.fillRect(x, H - bar * 0.85, bar * 1.6, bar * 0.7);
      c.fillStyle = '#05070a';
      c.fillText(`${i + 1}`, x + bar * 0.5, H - bar / 2);
      c.fillStyle = COLORS[i]!;
      c.fillText(`${v} ${info.coupling[i]}`, x + bar * 1.9, H - bar / 2);
    });
  };
  const infoOf = (ctx: LiveContext) => {
    const s = scopeSettings(ctx.props);
    return {
      time: `${eng(s.timePerDiv, 's')}`,
      volts: s.voltsPerDiv.map((v) => eng(v, 'V')),
      coupling: s.coupling.map((cpl) => (cpl === 'ac' ? 'AC' : cpl === 'gnd' ? 'GND' : 'DC')),
      running: ctx.active,
      xyMode: s.mode === 'xy',
    };
  };
  draw(['', ''], '', { time: '5.00ms', volts: ['2.00V', '2.00V'], coupling: ['DC', 'DC'], running: false, xyMode: false });
  return {
    root,
    anchors,
    anchorDirs: anchors.map(() => FRONT.clone()),
    anchorColors: [SOCKET.ch1, SOCKET.ch2, SOCKET.black],
    update(ctx) {
      const view = ctx.active ? ctx.scope : undefined;
      const paths = view ? view.channels.map((c) => c.path) : ['', ''];
      const xy = view?.xyPath ?? '';
      const info = infoOf(ctx);
      // Ekrandaki iz sayısı (denetim betikleri okur).
      root.userData.traces = xy ? 1 : paths.filter(Boolean).length;
      // Düğmeler: VOLTS/DIV ve TIME/DIV 1-2-5 dizisinde adım adım.
      const step = (v: number) => {
        const e = Math.floor(Math.log10(v));
        const m = v / 10 ** e;
        return 3 * e + (m >= 5 ? 2 : m >= 2 ? 1 : 0);
      };
      info.volts.forEach((_, i) => (voltsKnobs[i]!.rotation.z = turnTo(step(scopeSettings(ctx.props).voltsPerDiv[i]!) * 22.5)));
      timeKnob.rotation.z = turnTo(step(scopeSettings(ctx.props).timePerDiv) * 22.5);
      return screen.redraw(paths.join('|') + xy + JSON.stringify(info), ctx.now, () => draw(paths, xy, info));
    },
    dispose: screen.dispose,
  };
}


// --- Su haznesi: saydam kap, su, dört prob ---------------------------------------------------------------------

export function tankModel(): PartModel {
  const root = new Group();
  const pins = pinAnchors('tank');
  const w = 10.5;
  const d = 10;
  const h = 9;
  const cx = -0.3;
  const wall = mat('#dfe9ef', 0.05, 0, { transparent: true, opacity: 0.22 });
  const box = mesh(new BoxGeometry(w, h, d), wall, cx, h / 2 + 0.3, 0);
  box.userData.ownsMaterial = false;
  root.add(box);
  root.add(mesh(new BoxGeometry(w + 0.6, 0.3, d + 0.6), mat('#3b4148', 0.6), cx, 0.15, 0));
  const waterMat = ownMat('#3d8fd8', 0.15, 0, { transparent: true, opacity: 0.55 });
  const water = mesh(new BoxGeometry(w - 0.3, 1, d - 0.3), waterMat, cx, 0, 0);
  water.userData.live = true;
  root.add(water);
  // Problar sağ duvarın içinde; uçları sırayla %12,5 / 37,5 / 62,5 / 87,5 yüksekliğe iner.
  const depths = [0.125, 0.375, 0.625, 0.875];
  const anchors: Vector3[] = [];
  pins.forEach((p, i) => {
    const x = cx + w / 2 - 1.0 - i * 0.2;
    const tip = 0.3 + h * depths[i]!;
    const top = h + 1.2;
    root.add(wirePath([new Vector3(x, tip, p.z * 0.85), new Vector3(x, top, p.z * 0.85), new Vector3(p.x + 0.4, top, p.z)], 0.13, M.steel()));
    const a = new Vector3(p.x + 0.4, top, p.z);
    root.add(mesh(new CylinderGeometry(0.45, 0.45, 0.8, 14), mat('#1d1f23', 0.5), a.x, top - 0.45, a.z));
    anchors.push(a);
  });
  const setLevel = (level: number) => {
    const fill = Math.max(0.001, Math.min(1, level / 100)) * h;
    water.scale.y = fill;
    water.position.y = 0.3 + fill / 2;
  };
  return {
    root,
    anchors,
    update(ctx) {
      setLevel(ctx.live?.level ?? numProp(ctx.props, 'level', 50));
      return false;
    },
    dispose() {
      waterMat.dispose();
    },
  };
}

export { SPREAD, LEAD_Y };
