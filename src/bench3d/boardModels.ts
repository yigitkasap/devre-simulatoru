// Karta aktar'ın 3B kartları (tasarım v3: K1–K4, L1–L2; başlangıç docs/tasarim-v3/karta-aktar-3b/main.ts).
// Baskı devre: FR-4 kenarlı 1,6 mm levha, parlak yeşil maske, maskenin altında kabarık yollar, kubbeli
// kalaylı (HASL) pedler, kartı delip geçen kaplamalı delikler, beyaz serigrafi (ref ve uç adları), montaj
// delikleri; parçalar tezgâhın modelleriyle (buildPartModel),
// bacakları ped deliklerinde; eklenen dekuplaj kondansatörü, vidalı klemens ve pin başlık. Eksik
// bağlantılar turuncu kesikli çizgi ve uçlarında halka. Delikli plaket: breadboard düzeninde (sütun
// numaraları, a–j, raylar) altın kaplama delikler; parçalar ve jumper'lar tezgâhtaki yerleşimle aynı
// deliklerde, dışarı giden teller kartın kenarından çıkar. Kart birimi tezgâhınki gibi 2,54 mm.

import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { CATALOG } from '../model/catalog';
import type { CircuitDoc, Part } from '../model/types';
import type { MissingConnection, StepTarget } from './boardData';
import { holeLabels } from './boardData';
import { BB, boardWidth, boardZ, colX, holeXZ, netColors, railHoles, railX, railZ, stripRowZ, type BreadboardPlan, type Hole } from './breadboard';
import { refAnchor, type PcbDesign, type PcbFootprint } from './kicad';
import { M, mat, rod } from './kit';
import type { PartModel } from './model';
import { buildPartModel } from './registry';
import type { Routing } from './router';

/** Kart kalınlığı (1,6 mm, birim 2,54 mm). */
export const T = 1.6 / 2.54;
const U = (mm: number) => mm / 2.54;

const MASK = new MeshPhysicalMaterial({ color: '#0a4a28', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.35 });
const FR4 = new MeshStandardMaterial({ color: '#c8c08f', roughness: 0.8 });
const HASL = new MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.22, metalness: 1 });
const GOLD = new MeshStandardMaterial({ color: '#d9b45a', roughness: 0.3, metalness: 1 });
const HOLE = new MeshStandardMaterial({ color: '#0b0f0c', roughness: 0.9 });
/** Vurgu (seçili parça, şimdiki adımın delikleri) ve eksik bağlantı. */
export const ACCENT = new MeshStandardMaterial({ color: '#2f7bff', emissive: '#2f7bff', emissiveIntensity: 0.9, roughness: 0.4 });
const RAT = new MeshStandardMaterial({ color: '#ff7a00', emissive: '#ff6a00', emissiveIntensity: 0.55 });

/** Kartın 3B modeli ve pencerenin ona bağlanan bilgileri. */
export interface BoardModel {
  readonly root: Group;
  /** Parçalar (ref ya da etiket): ipucu, vurgulama ve kamerayı yaklaştırma için gövde kutusu (root içinde). */
  readonly parts: ReadonlyMap<string, BoardPartInfo>;
  /** HTML katmanının bağlandığı noktalar (root içinde): eksik bağlantı rozetleri, delik etiketleri. */
  readonly anchors: ReadonlyMap<string, Vector3>;
  /** Odaklanılacak noktalar (eksik bağlantı → "Göster"). */
  readonly focus: ReadonlyMap<string, Vector3>;
  dispose(): void;
}

export interface BoardPartInfo {
  readonly name: string;
  readonly detail: string;
  readonly box: Box3;
  /** Gövde varsa onun grubu (ışın izleme); yalın kartta yok (pedlerin çevresi vurgulanır). */
  readonly group: Group | null;
  /** Pedler / delikler (root içinde): yalın kartta vurgu halkaları. */
  readonly pads: readonly Vector3[];
}

function box(w: number, h: number, d: number, m: Material, x: number, y: number, z: number): Mesh {
  const b = new Mesh(new BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
}
function disc(r: number, h: number, m: Material, x: number, y: number, z: number, seg = 24): Mesh {
  const c = new Mesh(new CylinderGeometry(r, r, h, seg), m);
  c.position.set(x, y, z);
  return c;
}

/** Yuvarlak köşeli levha: üst ve alt yüz maske, kenarı FR-4. */
function boardSlab(w: number, d: number, radius: number, x = 0, z = 0): Mesh {
  const s = new Shape();
  const x0 = -w / 2;
  const z0 = -d / 2;
  const r = radius;
  s.moveTo(x0 + r, z0);
  s.lineTo(x0 + w - r, z0);
  s.quadraticCurveTo(x0 + w, z0, x0 + w, z0 + r);
  s.lineTo(x0 + w, z0 + d - r);
  s.quadraticCurveTo(x0 + w, z0 + d, x0 + w - r, z0 + d);
  s.lineTo(x0 + r, z0 + d);
  s.quadraticCurveTo(x0, z0 + d, x0, z0 + d - r);
  s.lineTo(x0, z0 + r);
  s.quadraticCurveTo(x0, z0, x0 + r, z0);
  const g = new ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(Math.PI / 2);
  g.translate(x, T, z);
  return new Mesh(g, [MASK, FR4]);
}

/** Serigrafi katmanı: tuvale çizilen saydam doku (ppu: birim başına piksel). */
function silkPlane(w: number, d: number, ppu: number, draw: (ctx: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number, s: number) => void, y: number, cx = 0, cz = 0): Mesh {
  const c = document.createElement('canvas');
  c.width = Math.min(8192, Math.round(w * ppu));
  c.height = Math.min(8192, Math.round(d * ppu));
  const ctx = c.getContext('2d')!;
  const sx = c.width / w;
  draw(ctx, (x) => (x - cx + w / 2) * sx, (z) => (z - cz + d / 2) * sx, sx);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  const material = new MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, depthWrite: false });
  material.userData.own = true;
  const m = new Mesh(new PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, y, cz);
  return m;
}

/** Vidalı klemens (karta eklenen bağlantı): mavi gövde, vidalar, tel ağızları kartın kenarına bakar. */
function screwTerminal(pads: Vector3[], outward: boolean): Group {
  const g = new Group();
  const xs = pads.map((p) => p.x);
  const zc = pads[0]!.z;
  const w = Math.max(...xs) - Math.min(...xs) + 2.0;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  g.add(box(w, 3.9, 3.0, mat('#2c6fb8', 0.45), cx, T + 1.95, zc));
  for (const p of pads) {
    g.add(disc(0.62, 0.2, M.steel(), p.x, T + 3.95, zc - 0.35));
    g.add(box(1.0, 0.08, 0.16, mat('#5f666e', 0.4, 1), p.x, T + 4.07, zc - 0.35));
    g.add(box(1.25, 1.25, 0.2, mat('#0d1015', 0.8), p.x, T + 1.6, zc + (outward ? 1.52 : -1.52)));
  }
  return g;
}

/** Pin başlık (karta eklenen bağlantı). */
function pinHeader(pads: Vector3[]): Group {
  const g = new Group();
  for (const p of pads) {
    g.add(box(1.0, 1.0, 1.0, M.header(), p.x, T + 0.5, p.z));
    g.add(box(0.25, 2.4, 0.25, GOLD, p.x, T + 1.9, p.z));
  }
  return g;
}

/** Parçayı deliklerine oturtur (tezgâhtaki placeOnBoard mantığı): gövde deliklerin arasında, bacaklar deliklerde. */
function seat(part: Part, mount: 'pair' | 'to92' | 'center', holes: Vector3[], extra: Vector3[], models: PartModel[]): Group {
  const g = new Group();
  const all = [...holes, ...extra];
  const center = all.reduce((c, h) => c.add(h), new Vector3()).multiplyScalar(1 / all.length);
  if (mount === 'pair') {
    const [a, b] = holes as [Vector3, Vector3];
    g.position.set((a.x + b.x) / 2, T, (a.z + b.z) / 2);
    g.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
  } else if (mount === 'to92') {
    // Yerel z ekseni bacaklar boyunca: düz (yazılı) yüz izleyiciye bakar.
    g.position.set(holes[1]!.x, T, holes[1]!.z);
    g.rotation.y = Math.PI / 2;
  } else {
    g.position.set(center.x, T, center.z);
  }
  g.updateMatrixWorld(true);
  const local = (v: Vector3) => g.worldToLocal(v.clone());
  const model = buildPartModel(part, holes.map(local), extra.map(local));
  models.push(model);
  g.add(model.root);
  return g;
}

const TO92: ReadonlySet<string> = new Set(['npn', 'pnp', 'njfet', 'pjfet', 'nmos', 'pmos']);

/** Ağaçtaki geometrileri ve yalnızca bu karta ait malzemeleri (dokularıyla) bırakır. */
function disposeTree(root: Object3D, models: readonly PartModel[]): void {
  for (const m of models) m.dispose?.();
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    const materials: Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of materials) {
      if (!(o.userData.ownsMaterial || m.userData.own)) continue;
      for (const value of Object.values(m)) if (value instanceof CanvasTexture) value.dispose();
      m.dispose();
    }
  });
}

/** Turuncu kesikli çizgi ve uçlarında halka (eksik bağlantı). */
function ratsnest(a: Vector3, b: Vector3, ringR: number, root: Group): void {
  const len = a.distanceTo(b);
  const n = Math.max(2, Math.round(len / 0.7));
  for (let k = 0; k < n; k += 2) root.add(rod(a.clone().lerp(b, k / n), a.clone().lerp(b, Math.min(1, (k + 1) / n)), 0.08, RAT, 8));
  for (const e of [a, b]) {
    const ring = new Mesh(new TorusGeometry(ringR, 0.07, 8, 32), RAT);
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(e).setY(T + 0.12);
    root.add(ring);
  }
}

// --- Baskı devre ----------------------------------------------------------------------------------
// Yüzey gerçek kart gibi: parlak yeşil lehim maskesi, maskenin altında yollar (biraz açık renkli ve
// kabarık; ışık kenarlarında parlar), maskede ince "portakal kabuğu". Renk dokusu (maske, yollar,
// serigrafi) ile normal dokusu (kabartılar) aynı çizimden tuvalde üretilir. Delikler levhayı gerçekten
// deler; kaplamalı deliklerin içi kalaylı. Gerber'de olmayan bir şey (dolgu, yazı) eklenmez.

const MASK_COLOR = '#04561f';
const MASK_TRACK = '#10702a';
/** Portakal kabuğunun yüksekliği (yolun kabarıklığı 1). */
const PEEL = 0.3;
const SILK = '#f3f4ee';
/** Kapalı via'nın ortası (maske deliğe çöker, biraz koyu). */
const MASK_DIMPLE = '#03461a';
const HIDDEN = new MeshBasicMaterial({ visible: false });
const BARREL = new MeshStandardMaterial({ color: '#c9ced4', roughness: 0.35, metalness: 1, side: DoubleSide });

interface Drill {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/** Kartın dış çizgisi (yuvarlak köşeli) ve delikleri; `flip`: şekil y'si −z (üst yüz için, bkz. pcbFace). */
function pcbOutline(w: number, d: number, radius: number, drills: readonly Drill[], flip: boolean): Shape {
  const k = flip ? -1 : 1;
  const s = new Shape();
  const x0 = -w / 2;
  const z0 = -d / 2;
  const r = radius;
  s.moveTo(x0 + r, k * z0);
  s.lineTo(x0 + w - r, k * z0);
  s.quadraticCurveTo(x0 + w, k * z0, x0 + w, k * (z0 + r));
  s.lineTo(x0 + w, k * (z0 + d - r));
  s.quadraticCurveTo(x0 + w, k * (z0 + d), x0 + w - r, k * (z0 + d));
  s.lineTo(x0 + r, k * (z0 + d));
  s.quadraticCurveTo(x0, k * (z0 + d), x0, k * (z0 + d - r));
  s.lineTo(x0, k * (z0 + r));
  s.quadraticCurveTo(x0, k * z0, x0 + r, k * z0);
  for (const h of drills) s.holes.push(new Path().absarc(h.x, k * h.z, h.r, 0, Math.PI * 2, true));
  return s;
}

/** Delikli levha: yalnızca kenarlar ve delik duvarları (FR-4); iki yüzü pcbFace çizer. */
function pcbSlab(w: number, d: number, radius: number, drills: readonly Drill[]): Mesh {
  const g = new ExtrudeGeometry(pcbOutline(w, d, radius, drills, false), { depth: T, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(Math.PI / 2);
  g.translate(0, T, 0);
  return new Mesh(g, [HIDDEN, FR4]);
}

/** Kartın bir yüzü (delikleriyle); dokular kartın x, z koordinatına göre (tuvalin üst kenarı −z). */
function pcbFace(w: number, d: number, radius: number, drills: readonly Drill[], top: boolean, material: Material): Mesh {
  const g = new ShapeGeometry(pcbOutline(w, d, radius, drills, top), 8);
  g.rotateX(top ? -Math.PI / 2 : Math.PI / 2);
  const pos = g.attributes.position!;
  const uv = g.attributes.uv!;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, 1 - (pos.getZ(i) + d / 2) / d);
  g.translate(0, top ? T : 0, 0);
  return new Mesh(g, material);
}

/** Yerinde kutu bulanıklığı (yatay + dikey); `wrap`: kenarlar karşıdan sarılır (döşeme). */
function blur(h: Float32Array, W: number, H: number, r: number, wrap = false): void {
  if (r < 1) return;
  const n = 2 * r + 1;
  const line = new Float32Array(Math.max(W, H) + n);
  // Satır ya da sütun: `len` öğe, ilki `o`, aralarında `step`.
  const pass = (len: number, count: number, stride: number, step: number) => {
    for (let k = 0; k < count; k++) {
      const o = k * stride;
      for (let i = -r; i < len + r; i++) {
        const j = wrap ? (i + len) % len : i < 0 ? 0 : i >= len ? len - 1 : i;
        line[i + r] = h[o + j * step]!;
      }
      let sum = 0;
      for (let i = 0; i < n; i++) sum += line[i]!;
      for (let i = 0; i < len; i++) {
        h[o + i * step] = sum / n;
        sum += line[i + n]! - line[i]!;
      }
    }
  };
  pass(W, H, W, 1);
  pass(H, W, 1, W);
}

/** Maskenin "portakal kabuğu": 128 × 128 döşenen yumuşak gürültü (sabit tohum: her açılışta aynı). */
let peelTile: Float32Array | null = null;
function peel(): Float32Array {
  if (peelTile) return peelTile;
  const t = new Float32Array(128 * 128);
  let seed = 7;
  for (let i = 0; i < t.length; i++) {
    seed = (seed * 16807) % 2147483647;
    t[i] = seed / 2147483647 - 0.5;
  }
  blur(t, 128, 128, 2, true);
  blur(t, 128, 128, 2, true);
  peelTile = t;
  return t;
}

type FacePaint = (ctx: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number, s: number, relief: boolean) => void;

/**
 * Bir yüzün dokuları. `paint` iki kez çağrılır: renk (relief: false) ve kabartı (relief: true; siyah
 * zemine yollar beyaz, serigrafi gri). Kabartı bulanıklaştırılıp portakal kabuğu eklenir, eğiminden
 * normal dokusu çıkar.
 */
function faceTextures(w: number, d: number, paint: FacePaint): { map: CanvasTexture; normal: CanvasTexture } {
  const canvas = (scale: number, fill: string, relief: boolean) => {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w * scale));
    c.height = Math.max(2, Math.round(d * scale));
    const ctx = c.getContext('2d', { willReadFrequently: relief })!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paint(ctx, (x) => (x + w / 2) * scale, (z) => (z + d / 2) * scale, scale, relief);
    return { c, ctx };
  };
  // Renk: milimetrede en çok 28 piksel; telefon belleği için doku başına en çok ~2,6 milyon piksel.
  const s = Math.min(28 * 2.54, Math.sqrt(2.6e6 / (w * d)));
  const color = canvas(s, MASK_COLOR, false);
  // Kabartı yarı çözünürlükte: yumuşak eğimlere yeter, hesap dört kat kısa.
  const sn = s / 2;
  const relief = canvas(sn, '#000', true);
  const W = relief.c.width;
  const H = relief.c.height;
  const img = relief.ctx.getImageData(0, 0, W, H);
  const px = img.data;
  const h = new Float32Array(W * H);
  for (let i = 0; i < h.length; i++) h[i] = px[i * 4]! / 255;
  // Maske yolun kenarında ~0,15 mm'de iner.
  const r = Math.max(1, Math.round(sn * U(0.08)));
  blur(h, W, H, r);
  blur(h, W, H, r);
  const tile = peel();
  for (let y = 0; y < H; y++) {
    const row = (y & 127) << 7;
    for (let x = 0; x < W; x++) h[y * W + x] = h[y * W + x]! + tile[row + (x & 127)]! * PEEL;
  }
  const k = 0.9 * r;
  for (let y = 0; y < H; y++) {
    const up = Math.max(0, y - 1) * W;
    const down = Math.min(H - 1, y + 1) * W;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const nx = (h[y * W + (x > 0 ? x - 1 : 0)]! - h[y * W + (x < W - 1 ? x + 1 : x)]!) * k;
      const ny = (h[down + x]! - h[up + x]!) * k;
      const inv = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      px[i * 4] = nx * inv + 127.5;
      px[i * 4 + 1] = ny * inv + 127.5;
      px[i * 4 + 2] = inv + 127.5;
      px[i * 4 + 3] = 255;
    }
  }
  relief.ctx.putImageData(img, 0, 0);
  const map = new CanvasTexture(color.c);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  const normal = new CanvasTexture(relief.c);
  normal.anisotropy = 8;
  return { map, normal };
}

/** Maske malzemesi: parlak vernik (clearcoat) da kabartıları izler. */
function maskMaterial(t: { map: CanvasTexture; normal: CanvasTexture }): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map: t.map,
    normalMap: t.normal,
    normalScale: new Vector2(1, 1),
    roughness: 0.5,
    specularIntensity: 0.4,
    clearcoat: 0.85,
    // Biraz pürüzlü vernik: ortamdaki ayrı lambaların yansıması yol kenarında kesik kesik görünmesin.
    clearcoatRoughness: 0.24,
    clearcoatNormalMap: t.normal,
    clearcoatNormalScale: new Vector2(0.7, 0.7),
  });
}

/**
 * Baskı devrenin iki yüzünün maskesi (renk ve kabartı dokuları). Dokuların üretimi pahalı: kart yeniden
 * kurulurken (Parçalarla / Yalın kart) aynı yüzey kullanılır, yalnızca tasarım ya da yollar değişince
 * yenisi üretilir. Kartın dispose'u bunları bırakmaz; `dispose` ayrı çağrılır.
 */
export interface PcbSurface {
  readonly top: Material;
  readonly bottom: Material;
  dispose(): void;
}

export function buildPcbSurface(design: PcbDesign, routing: Routing | null): PcbSurface {
  const o = design.outline;
  const cx = (o.x0 + o.x1) / 2;
  const cy = (o.y0 + o.y1) / 2;
  const bw = U(o.x1 - o.x0);
  const bd = U(o.y1 - o.y0);
  // Maske, altındaki yollar; üstte serigrafi (kılıf çizgileri, ref ve uç adları).
  const face = (top: boolean) =>
    maskMaterial(
      faceTextures(bw, bd, (ctx, X, Z, s, relief) => {
        const x = (mm: number) => X(U(mm - cx));
        const z = (mm: number) => Z(U(mm - cy));
        ctx.strokeStyle = relief ? '#fff' : MASK_TRACK;
        for (const t of routing?.tracks ?? []) {
          if (t.layer !== (top ? 0 : 1)) continue;
          ctx.lineWidth = U(t.width) * s;
          ctx.beginPath();
          ctx.moveTo(x(t.x0), z(t.y0));
          ctx.lineTo(x(t.x1), z(t.y1));
          ctx.stroke();
        }
        // Via'lar maskeyle kapalı (Gerber'deki gibi): maskenin altında halka, ortasında küçük çukur.
        for (const v of routing?.vias ?? []) {
          for (const [r, fill] of [
            [U(0.4), relief ? '#fff' : MASK_TRACK],
            [U(0.2), relief ? '#000' : MASK_DIMPLE],
          ] as const) {
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(x(v.x), z(v.y), r * s, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (relief) {
          // Pedin bakırı da kabarık: yol pede yumuşakça bağlanır.
          ctx.fillStyle = '#fff';
          for (const f of design.footprints)
            for (const p of f.pads) {
              if (p.npth) continue;
              ctx.beginPath();
              ctx.arc(x(p.x), z(p.y), (U(p.size) / 2) * s, 0, Math.PI * 2);
              ctx.fill();
            }
        }
        if (!top) return;
        const ink = relief ? '#666' : SILK;
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        ctx.lineWidth = U(0.15) * s;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const f of design.footprints) {
          for (const [a, b, c2, d] of f.silk) {
            ctx.beginPath();
            ctx.moveTo(x(a), z(b));
            ctx.lineTo(x(c2), z(d));
            ctx.stroke();
          }
          for (const [a, b, r] of f.circles) {
            ctx.beginPath();
            ctx.arc(x(a), z(b), U(r) * s, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (!f.pads.some((p) => p.npth)) {
            const an = refAnchor(f);
            ctx.font = `600 ${U(1.3) * s}px "IBM Plex Sans", sans-serif`;
            ctx.fillText(f.ref, x(an.x), z(an.y));
          }
          ctx.font = `500 ${U(0.95) * s}px "IBM Plex Sans", sans-serif`;
          for (const p of f.pads) if (p.label) ctx.fillText(p.label, x(p.x), z(p.y + (p.labelDy ?? 2.4)));
        }
      }),
    );
  const top = face(true);
  const bottom = face(false);
  return {
    top,
    bottom,
    dispose: () => {
      for (const m of [top, bottom]) {
        m.map?.dispose();
        m.normalMap?.dispose();
        m.dispose();
      }
    },
  };
}

/** Kubbeli kalay ped (ortası delik); kenarları yuvarlatılmış. Aynı ölçüdekiler ortak geometri kullanır. */
function padGeometry(cache: Map<string, ExtrudeGeometry>, shape: 'circle' | 'rect' | 'oval', size: number, drill: number, top: boolean): ExtrudeGeometry {
  const key = `${shape} ${size} ${drill} ${top}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const a = U(size) / 2;
  const s = new Shape();
  if (shape === 'circle') s.absarc(0, 0, a, 0, Math.PI * 2, false);
  else {
    // Kare ped; oval: 0,8 × 1 boyunda, uçları yarım daire.
    const hx = shape === 'oval' ? a * 0.8 : a;
    const rr = shape === 'oval' ? hx : U(0.05);
    s.moveTo(-hx + rr, -a);
    s.lineTo(hx - rr, -a);
    s.quadraticCurveTo(hx, -a, hx, -a + rr);
    s.lineTo(hx, a - rr);
    s.quadraticCurveTo(hx, a, hx - rr, a);
    s.lineTo(-hx + rr, a);
    s.quadraticCurveTo(-hx, a, -hx, a - rr);
    s.lineTo(-hx, -a + rr);
    s.quadraticCurveTo(-hx, -a, -hx + rr, -a);
  }
  s.holes.push(new Path().absarc(0, 0, U(drill) / 2, 0, Math.PI * 2, true));
  const bevel = Math.min(U(0.09), (U(size) - U(drill)) / 5);
  const thick = U(0.03);
  const g = new ExtrudeGeometry(s, { depth: U(0.02), bevelEnabled: true, bevelThickness: thick, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, thick);
  g.rotateX(top ? -Math.PI / 2 : Math.PI / 2);
  cache.set(key, g);
  return g;
}

/** `surface`: aynı tasarımla buildPcbSurface'in ürettiği yüzey (yollar ve via'lar onda). */
export function buildPcbBoard(
  doc: CircuitDoc,
  design: PcbDesign,
  surface: PcbSurface,
  missing: readonly MissingConnection[],
  withParts: boolean,
  tip: (f: PcbFootprint) => { name: string; detail: string },
): BoardModel {
  const o = design.outline;
  const cx = (o.x0 + o.x1) / 2;
  const cy = (o.y0 + o.y1) / 2;
  const P = (x: number, y: number, h = T) => new Vector3(U(x - cx), h, U(y - cy));
  const bw = U(o.x1 - o.x0);
  const bd = U(o.y1 - o.y0);
  const root = new Group();
  const models: PartModel[] = [];

  // Delikler: pedler ve montaj delikleri (via'lar maskeyle kapalı; yüzeyde çizilir).
  const drills: Drill[] = [];
  for (const f of design.footprints) for (const p of f.pads) drills.push({ x: U(p.x - cx), z: U(p.y - cy), r: U(p.drill / 2) });
  const corner = U(0.8);
  root.add(pcbSlab(bw, bd, corner, drills));

  // İki yüz: maske, altındaki yollar, serigrafi (buildPcbSurface).
  root.add(pcbFace(bw, bd, corner, drills, true, surface.top), pcbFace(bw, bd, corner, drills, false, surface.bottom));

  // Pedler (iki yüzde kubbeli kalay) ve kaplamalı delik duvarları; montaj delikleri kaplamasız.
  const pads = new Map<string, ExtrudeGeometry>();
  const barrels = new Map<number, CylinderGeometry>();
  const barrel = (c: Vector3, r: number) => {
    let g = barrels.get(r);
    if (!g) barrels.set(r, (g = new CylinderGeometry(r * 0.985, r * 0.985, T, 16, 1, true)));
    const m = new Mesh(g, BARREL);
    m.position.set(c.x, T / 2, c.z);
    root.add(m);
  };
  for (const f of design.footprints)
    for (const p of f.pads) {
      if (p.npth) continue;
      const c = P(p.x, p.y);
      for (const top of [true, false]) {
        const m = new Mesh(padGeometry(pads, p.shape, p.size, p.drill, top), HASL);
        m.position.set(c.x, top ? T : 0, c.z);
        root.add(m);
      }
      barrel(c, U(p.drill / 2));
    }

  // Eksik bağlantılar: kesikli turuncu çizgi, uçlarda halka; rozet HTML katmanında (orta nokta).
  const anchors = new Map<string, Vector3>();
  const focus = new Map<string, Vector3>();
  for (const m of missing) {
    const a = P(m.a.x, m.a.y, T + 0.25);
    const b = P(m.b.x, m.b.y, T + 0.25);
    ratsnest(a, b, U(1.5), root);
    const mid = a.clone().lerp(b, 0.5);
    anchors.set(`rat-${m.n}`, mid.clone().setY(T + 0.6));
    focus.set(`rat-${m.n}`, mid);
  }

  // Parçalar: tezgâhın modelleri; eklenen dekuplaj, klemens ve pin başlık.
  const byId = new Map(doc.parts.map((p) => [p.id, p] as const));
  const parts = new Map<string, BoardPartInfo>();
  for (const f of design.footprints) {
    if (f.pads.some((p) => p.npth)) continue;
    const anchorsIn = f.pads.map((p) => P(p.x, p.y, T - 0.25));
    const padTops = f.pads.map((p) => P(p.x, p.y, T + 0.05));
    let g: Group | null = null;
    if (withParts) {
      const part = f.partId ? byId.get(f.partId) : undefined;
      if (part) {
        const n = CATALOG[part.type].pins.length;
        const holes = anchorsIn.slice(0, n);
        const extra = anchorsIn.slice(n);
        const mount = holes.length === 2 && part.type !== 'opamp' && part.type !== 'timer555' ? 'pair' : TO92.has(part.type) ? 'to92' : 'center';
        g = seat(part, mount, holes, extra, models);
      } else if (f.ref.startsWith('C_D')) {
        const decoupling = { id: f.ref, type: 'capacitor', label: f.ref, x: 0, y: 0, rotation: 0, props: { capacitance: 1e-7, kind: 'film' } } as unknown as Part;
        g = seat(decoupling, 'pair', anchorsIn.slice(0, 2), [], models);
      } else if (f.name.includes('TerminalBlock')) {
        g = screwTerminal(anchorsIn.map((a) => a.clone().setY(T)), anchorsIn[0]!.z > 0);
      } else if (f.name.includes('PinHeader')) {
        g = pinHeader(anchorsIn.map((a) => a.clone().setY(T)));
      }
      if (g) {
        g.userData.ref = f.ref;
        root.add(g);
      }
    }
    root.updateMatrixWorld(true);
    const b = g ? new Box3().setFromObject(g) : new Box3().setFromPoints(padTops).expandByScalar(0.5);
    const { name, detail } = tip(f);
    parts.set(f.ref, { name, detail, box: b, group: g, pads: padTops });
  }
  return { root, parts, anchors, focus, dispose: () => disposeTree(root, models) };
}

// --- Delikli plaket ---------------------------------------------------------------------------------

/**
 * Breadboard düzeninde delikli plaket. `upto`: bu adıma kadar takılanlar görünür (−1: hiçbiri);
 * `current`: şimdiki adım (delikleri mavi halkalı; null: halka yok, "Tamamı").
 */
export function buildPerfboard(
  plan: BreadboardPlan,
  targets: readonly (StepTarget | null)[],
  upto: number,
  current: number | null,
): BoardModel {
  const cols = plan.cols;
  const bw = boardWidth(cols);
  const bd = BB.depth;
  const root = new Group();
  const models: PartModel[] = [];
  const holeIn = (h: Hole) => {
    const { x, z } = holeXZ(h, cols);
    return new Vector3(x, T - 0.25, z);
  };
  for (let b = 0; b < plan.boards; b++) {
    const z0 = boardZ(b);
    root.add(boardSlab(bw, bd, 0.5, 0, z0));
    // Serigrafi: şerit çerçeveleri, raylar (kırmızı / mavi çizgi), sütun numaraları, a–j satırları.
    root.add(
      silkPlane(
        bw,
        bd,
        64,
        (ctx, X, Z, s) => {
          ctx.strokeStyle = '#f4f4ee';
          ctx.lineWidth = 0.07 * s;
          for (let c = 1; c <= cols; c++)
            for (const [r0, r1] of [
              [0, 4],
              [5, 9],
            ] as const) {
              const x = X(colX(c, cols));
              ctx.beginPath();
              ctx.roundRect(x - 0.42 * s, Z(z0 + stripRowZ(r0)) - 0.5 * s, 0.84 * s, (stripRowZ(r1) - stripRowZ(r0) + 1) * s, 0.35 * s);
              ctx.stroke();
            }
          const line = (z: number, color: string) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.14 * s;
            ctx.beginPath();
            ctx.moveTo(X(-bw / 2 + 2), Z(z0 + z));
            ctx.lineTo(X(bw / 2 - 2), Z(z0 + z));
            ctx.stroke();
          };
          line(railZ(0) - 0.7, '#ff6b5e');
          line(railZ(1) + 0.7, '#7fb0ff');
          line(railZ(2) - 0.7, '#7fb0ff');
          line(railZ(3) + 0.7, '#ff6b5e');
          ctx.fillStyle = '#f4f4ee';
          ctx.font = `600 ${0.62 * s}px "IBM Plex Sans", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (let c = 1; c <= cols; c++)
            if (c === 1 || c % 5 === 0) {
              ctx.fillText(String(c), X(colX(c, cols)), Z(z0 + stripRowZ(0) - 1.05));
              ctx.fillText(String(c), X(colX(c, cols)), Z(z0 + stripRowZ(9) + 1.05));
            }
          'abcdefghij'.split('').forEach((l, r) => {
            ctx.fillText(l, X(-bw / 2 + 0.9), Z(z0 + stripRowZ(r)));
            ctx.fillText(l, X(bw / 2 - 0.9), Z(z0 + stripRowZ(r)));
          });
          ctx.font = `700 ${0.75 * s}px "IBM Plex Sans", sans-serif`;
          ctx.fillStyle = '#ff6b5e';
          ctx.fillText('+', X(-bw / 2 + 0.9), Z(z0 + railZ(0)));
          ctx.fillText('+', X(-bw / 2 + 0.9), Z(z0 + railZ(3)));
          ctx.fillStyle = '#7fb0ff';
          ctx.fillText('−', X(-bw / 2 + 0.9), Z(z0 + railZ(1)));
          ctx.fillText('−', X(-bw / 2 + 0.9), Z(z0 + railZ(2)));
        },
        T + 0.058,
        0,
        z0,
      ),
    );
    // Delikler: altın kaplama halka ve koyu delik, iki yüzde.
    const holes: { x: number; z: number }[] = [];
    for (let c = 1; c <= cols; c++) for (let r = 0; r < 10; r++) holes.push({ x: colX(c, cols), z: z0 + stripRowZ(r) });
    for (let rl = 0; rl < 4; rl++) for (let k = 0; k < railHoles(cols); k++) holes.push({ x: railX(k, cols), z: z0 + railZ(rl) });
    for (const h of holes)
      for (const y of [T + 0.03, -0.03]) {
        root.add(disc(0.36, 0.05, GOLD, h.x, y, h.z, 18));
        root.add(disc(0.2, 0.06, HOLE, h.x, y, h.z, 12));
      }
    for (const [mx, mz] of [
      [-bw / 2 + 1.2, -bd / 2 + 1.2],
      [bw / 2 - 1.2, -bd / 2 + 1.2],
      [-bw / 2 + 1.2, bd / 2 - 1.2],
      [bw / 2 - 1.2, bd / 2 - 1.2],
    ] as const)
      root.add(disc(0.62, T + 0.02, HOLE, mx, T / 2, z0 + mz, 24));
  }

  const colorOf = netColors(plan);
  const parts = new Map<string, BoardPartInfo>();
  const anchors = new Map<string, Vector3>();
  const focus = new Map<string, Vector3>();
  const solder = mat('#c9ccd0', 0.35, 1);
  targets.forEach((target, i) => {
    if (!target || i > upto) return;
    let g: Group;
    let label: string;
    if (target.kind === 'jumper') {
      const j = plan.jumpers[target.index]!;
      const a = holeIn(j.a);
      const b = holeIn(j.b);
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      const lift = 0.35 + Math.min(1.0, 0.04 * dist);
      const pts = [
        new Vector3(a.x, T + 0.05, a.z),
        new Vector3(a.x, T + lift, a.z),
        new Vector3((a.x + b.x) / 2, T + lift + 0.05, (a.z + b.z) / 2),
        new Vector3(b.x, T + lift, b.z),
        new Vector3(b.x, T + 0.05, b.z),
      ];
      g = new Group();
      const tube = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, false, 'centripetal'), 40, 0.2, 8, false), mat(colorOf(j.net), 0.5));
      g.add(tube);
      label = `jumper-${target.index}`;
    } else if (target.kind === 'part') {
      const at = plan.onBoard.get(target.part.id)!;
      const hs = at.holes.map(holeIn);
      const ex = (at.extraHoles ?? []).map(holeIn);
      g = seat(target.part, at.mount === 'axial' || at.mount === 'radial' ? 'pair' : at.mount === 'to92' ? 'to92' : 'center', hs, ex, models);
      label = target.part.label;
    } else {
      // Dışarı giden tel: delikten kalkar, kartın en yakın kenarından çıkar.
      const lead = plan.leads[target.index]!;
      const a = holeIn(lead.hole);
      const edgeZ = a.z < boardZ(lead.hole.board) ? boardZ(lead.hole.board) - bd / 2 - 3 : boardZ(lead.hole.board) + bd / 2 + 3;
      const dir = Math.sign(edgeZ - a.z);
      const pts = [new Vector3(a.x, T + 0.05, a.z), new Vector3(a.x, T + 1.0, a.z), new Vector3(a.x + 0.3, T + 1.4, a.z + dir * 1.5), new Vector3(a.x + 0.6, T + 1.2, edgeZ)];
      g = new Group();
      g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.24, 10, false), mat(colorOf(lead.net), 0.5)));
      label = `lead-${target.index}`;
    }
    // Alt yüzde lehim noktaları (takılan her adımın deliklerinde).
    for (const h of target.holes) {
      const { x, z } = holeXZ(h, cols);
      root.add(disc(0.3, 0.16, solder, x, -0.1, z, 14));
    }
    g.userData.ref = label;
    root.add(g);
    root.updateMatrixWorld(true);
    const pads = target.holes.map((h) => {
      const { x, z } = holeXZ(h, cols);
      return new Vector3(x, T + 0.05, z);
    });
    parts.set(label, { name: label, detail: '', box: new Box3().setFromObject(g), group: g, pads });
  });

  // Şimdiki adım: deliklerin çevresinde mavi halka; delik etiketleri HTML katmanında.
  const step = current === null ? null : targets[current];
  if (step) {
    const labels = holeLabels(step, plan);
    step.holes.forEach((h) => {
      const { x, z } = holeXZ(h, cols);
      const ring = new Mesh(new TorusGeometry(0.72, 0.13, 10, 32), ACCENT);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, T + 0.12, z);
      root.add(ring);
    });
    labels.forEach((l, i) => {
      const { x, z } = holeXZ(l.hole, cols);
      anchors.set(`hole-${i}`, new Vector3(x, T + 0.45, z));
    });
    const mid = step.holes.reduce((c, h) => {
      const { x, z } = holeXZ(h, cols);
      return c.add(new Vector3(x, T, z));
    }, new Vector3());
    focus.set('step', mid.multiplyScalar(1 / step.holes.length));
  }
  return { root, parts, anchors, focus, dispose: () => disposeTree(root, models) };
}
