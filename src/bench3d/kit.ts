// 3B tezgâhın yapı taşları: birimler, malzemeler, bacak/tel çizimi, yazı dokuları, renk halkaları.
//
// Birim: 1 = 2,54 mm (devre tahtası adımı). Masa y = 0 düzlemidir. Şemanın ızgara birimi tezgâhta
// SPREAD kadar açılır: parçalar gerçeğe yakın boyutta, şemadaki yerlerinde durur.

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CATALOG } from '../model/catalog';
import type { DeviceType } from '../sim/netlist';

/** Şemanın bir ızgara birimi tezgâhta kaç birim (2,54 mm) eder. */
export const SPREAD = 1.5;
/** Bacakların masaya değdiği uç yüksekliği. */
export const LEAD_Y = 0.12;

// --- Malzemeler -------------------------------------------------------------------------------

const cache = new Map<string, MeshStandardMaterial>();

/** Paylaşılan malzeme (aynı renk ve yüzey özellikleri için tek örnek). */
export function mat(color: string, roughness = 0.55, metalness = 0, extra: { emissive?: string; transparent?: boolean; opacity?: number } = {}): MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${extra.emissive ?? ''}|${extra.opacity ?? 1}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...(extra.emissive ? { emissive: new Color(extra.emissive) } : {}),
      ...(extra.transparent ? { transparent: true, opacity: extra.opacity ?? 1, depthWrite: false } : {}),
    });
    cache.set(key, m);
  }
  return m;
}

export const M = {
  tin: () => mat('#aeb4bb', 0.3, 1),
  gold: () => mat('#d8b04c', 0.3, 1),
  steel: () => mat('#9aa1a9', 0.38, 1),
  copper: () => mat('#c47a3d', 0.35, 1),
  black: () => mat('#1d1f23', 0.62),
  blackGloss: () => mat('#16181b', 0.3),
  white: () => mat('#f1f2f0', 0.5),
  red: () => mat('#c8312a', 0.5),
  blue: () => mat('#2a5db0', 0.5),
  yellow: () => mat('#f2c230', 0.55),
  pcbGreen: () => mat('#1f5f3d', 0.55),
  pcbBlue: () => mat('#0f6d8c', 0.5),
  header: () => mat('#141518', 0.7),
};

/** Tek kullanımlık (canlı değişen) malzeme: paylaşılmaz, parça silinince atılır. */
export function ownMat(color: string, roughness = 0.5, metalness = 0, opts: { transparent?: boolean; opacity?: number } = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness, ...(opts.transparent ? { transparent: true, opacity: opts.opacity ?? 1, depthWrite: false } : {}) });
}

// --- Geometri yardımcıları ----------------------------------------------------------------------

export function mesh(geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

const UP = new Vector3(0, 1, 0);

/** a'dan b'ye r yarıçaplı silindir (tel parçası). */
export function rod(a: Vector3, b: Vector3, r: number, material: Material, segments = 8): Mesh {
  const dir = new Vector3().subVectors(b, a);
  const length = dir.length();
  const m = new Mesh(new CylinderGeometry(r, r, Math.max(length, 1e-4), segments, 1, true), material);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  if (length > 1e-6) m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.normalize()));
  return m;
}

/** Kırık çizgi boyunca tel: köşelerde küre, uçlarda kapak. */
export function wirePath(points: readonly Vector3[], r: number, material: Material, segments = 8): Group {
  const g = new Group();
  for (let i = 1; i < points.length; i++) g.add(rod(points[i - 1]!, points[i]!, r, material, segments));
  const ball = new SphereGeometry(r, segments, 6);
  for (const p of points) g.add(mesh(ball, material, p.x, p.y, p.z));
  return g;
}

let anchorOverride: readonly Vector3[] | null = null;

/**
 * Bir parçanın bacaklarının bittiği yerel konumlar: breadboard'a takılırken deliklerin konumu
 * (withAnchors), masada şema pinleri × SPREAD.
 */
export function pinAnchors(type: DeviceType): Vector3[] {
  if (anchorOverride) return anchorOverride.map((a) => a.clone());
  return CATALOG[type].pins.map((p) => new Vector3(p.x * SPREAD, LEAD_Y, p.y * SPREAD));
}

/** `build` içinde pinAnchors verilen konumları döndürür (breadboard delikleri, yerel koordinat). */
export function withAnchors<T>(anchors: readonly Vector3[] | null, build: () => T): T {
  const previous = anchorOverride;
  anchorOverride = anchors;
  try {
    return build();
  } finally {
    anchorOverride = previous;
  }
}

/**
 * Gövdeden çıkan bir bacak: gövdedeki çıkış noktasından yatay ilerler, uca yakın aşağı kıvrılır
 * ve masadaki pine değer.
 */
export function lead(from: Vector3, anchor: Vector3, r = 0.14, material: Material = M.tin()): Group {
  const bend = new Vector3(anchor.x, from.y, anchor.z);
  const pts = [from];
  const toBend = new Vector3().subVectors(bend, from);
  if (toBend.length() > 0.3) {
    const before = bend.clone().addScaledVector(toBend.normalize(), -0.25);
    pts.push(before, new Vector3(anchor.x, from.y - 0.25, anchor.z));
  }
  pts.push(anchor);
  return wirePath(pts, r, material, 6);
}

/**
 * Dikey bacak: gövdenin altından iner, ucun biraz üstünde uca doğru kıvrılır (masada pine, breadboard'da
 * deliğe).
 */
export function legDown(from: Vector3, anchor: Vector3, r = 0.14, material: Material = M.tin()): Group {
  const offset = Math.hypot(anchor.x - from.x, anchor.z - from.z);
  if (offset <= 0.05) return wirePath([from, anchor], r, material, 6);
  const knee = Math.max(anchor.y + 0.25, Math.min(from.y, anchor.y + 0.6 + 0.3 * offset));
  return wirePath([from, new Vector3(from.x, knee, from.z), new Vector3(anchor.x, knee - 0.25, anchor.z), anchor], r, material, 6);
}

// --- Yazı dokuları --------------------------------------------------------------------------------

export interface LabelOptions {
  readonly bg?: string;
  readonly fg?: string;
  readonly font?: string;
  /** Doku çözünürlüğü (birim başına piksel). */
  readonly ppu?: number;
}

/** w × h birimlik bir yüzeye çizilecek tuval; çiz() ile doldurulur. */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void, ppu = 48): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(4, Math.round(w * ppu));
  canvas.height = Math.max(4, Math.round(h * ppu));
  const ctx = canvas.getContext('2d')!;
  draw(ctx, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Yüzü yukarı bakan, üstünde yazı olan ince levha. */
export function labelPlate(text: string, w: number, h: number, opts: LabelOptions = {}): Mesh {
  const texture = canvasTexture(
    w,
    h,
    (ctx, W, H) => {
      if (opts.bg) {
        ctx.fillStyle = opts.bg;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = opts.fg ?? '#e9ecef';
      ctx.font = opts.font ?? `600 ${Math.round(H * 0.62)}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, W / 2, H / 2 + H * 0.04, W * 0.94);
    },
    opts.ppu ?? 48,
  );
  const plate = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: texture, transparent: !opts.bg, roughness: 0.7 }));
  plate.rotation.x = -Math.PI / 2;
  plate.userData.ownsMaterial = true;
  return plate;
}

// --- Direnç renk halkaları (bands.ts) -------------------------------------------------------------

export { resistorBands } from './bands';

// --- Birleştirme -------------------------------------------------------------------------------------

/**
 * Bir grubun değişmeyen alt nesnelerini malzemeye göre birleştirir (çizim çağrısı sayısı azalır).
 * userData.live olanlar (döner, yanar, değişir) ve kendi malzemesi olanlar dokunulmadan kalır.
 */
export function mergeStatic(group: Group): void {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const byMaterial = new Map<Material, BufferGeometry[]>();
  const remove: Object3D[] = [];
  group.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    let p: Object3D | null = o;
    while (p && p !== group) {
      if (p.userData.live || p.userData.ownsMaterial) return;
      p = p.parent;
    }
    if (Array.isArray(o.material)) return;
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld.clone().premultiply(inverse));
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const name of Object.keys(nonIndexed.attributes)) if (!['position', 'normal', 'uv'].includes(name)) nonIndexed.deleteAttribute(name);
    if (!nonIndexed.attributes.uv) return;
    const list = byMaterial.get(o.material) ?? [];
    list.push(nonIndexed);
    byMaterial.set(o.material, list);
    remove.push(o);
  });
  for (const o of remove) o.removeFromParent();
  // Boş kalan ara grupları temizle.
  const empty: Object3D[] = [];
  group.traverse((o) => {
    if (o !== group && o.type === 'Group' && o.children.length === 0 && !o.userData.live) empty.push(o);
  });
  for (const o of empty) o.removeFromParent();
  for (const [material, geometries] of byMaterial) {
    const merged = mergeGeometries(geometries, false);
    if (merged) group.add(new Mesh(merged, material));
  }
}
