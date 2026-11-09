// Breadboard ve breadboard'a özgü parçalar: kart gövdesi (delikler, numaralar, raylar),
// yatık jumper teli.

import { BoxGeometry, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three';
import { BB, boardWidth, colX, railHoles, railX, railZ, stripRowZ } from './breadboard';
import { M, canvasTexture, mat, rod } from './kit';

/** Deliğin breadboard yüzeyinden ne kadar içine girilir (bacak ve tel uçları). */
export const HOLE_DEPTH = 0.5;

const boardTextures = new Map<number, ReturnType<typeof canvasTexture>>();

function texture(cols: number) {
  const cached = boardTextures.get(cols);
  if (cached) return cached;
  const W = boardWidth(cols);
  const D = BB.depth;
  const half = W / 2 - 3;
  const made = canvasTexture(
    W,
    D,
    (ctx, w, h) => {
      const s = w / W;
      const X = (x: number) => (x + W / 2) * s;
      const Z = (z: number) => (z + D / 2) * s;
      ctx.fillStyle = '#f3f1ea';
      ctx.fillRect(0, 0, w, h);
      // Orta kanal ve rayları ayıran hafif oluklar.
      ctx.fillStyle = '#dcd8cc';
      ctx.fillRect(0, Z(-0.45), w, 0.9 * s);
      ctx.fillStyle = '#e7e4da';
      ctx.fillRect(0, Z(-7.0), w, 0.25 * s);
      ctx.fillRect(0, Z(6.75), w, 0.25 * s);
      // Ray çizgileri: + kırmızı, − mavi.
      const line = (z: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.12 * s;
        ctx.beginPath();
        ctx.moveTo(X(-half), Z(z));
        ctx.lineTo(X(half), Z(z));
        ctx.stroke();
      };
      line(railZ(0) - 0.75, '#d0342c');
      line(railZ(1) + 0.75, '#2b62c4');
      line(railZ(2) - 0.75, '#2b62c4');
      line(railZ(3) + 0.75, '#d0342c');
      // Delikler.
      const hole = (x: number, z: number) => {
        ctx.fillStyle = '#2b2d30';
        ctx.fillRect(X(x) - 0.24 * s, Z(z) - 0.24 * s, 0.48 * s, 0.48 * s);
      };
      for (let col = 1; col <= cols; col++) for (let row = 0; row < 10; row++) hole(colX(col, cols), stripRowZ(row));
      for (let rail = 0; rail < 4; rail++) for (let k = 0; k < railHoles(cols); k++) hole(railX(k, cols), railZ(rail));
      // Numaralar ve harfler.
      ctx.fillStyle = '#6b6f75';
      ctx.font = `600 ${Math.round(0.62 * s)}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let col = 1; col <= cols; col++) {
        if (col !== 1 && col % 5 !== 0) continue;
        ctx.fillText(String(col), X(colX(col, cols)), Z(stripRowZ(0) - 0.85));
        ctx.fillText(String(col), X(colX(col, cols)), Z(stripRowZ(9) + 0.85));
      }
      'abcdefghij'.split('').forEach((letter, row) => {
        ctx.fillText(letter, X(colX(1, cols) - 1.2), Z(stripRowZ(row)));
        ctx.fillText(letter, X(colX(cols, cols) + 1.2), Z(stripRowZ(row)));
      });
      ctx.font = `700 ${Math.round(0.8 * s)}px "IBM Plex Sans", system-ui, sans-serif`;
      for (const [rail, sign, color] of [[0, '+', '#d0342c'], [1, '−', '#2b62c4'], [2, '−', '#2b62c4'], [3, '+', '#d0342c']] as const) {
        ctx.fillStyle = color;
        ctx.fillText(sign, X(-half - 1.2), Z(railZ(rail)));
        ctx.fillText(sign, X(half + 1.2), Z(railZ(rail)));
      }
    },
    24,
  );
  boardTextures.set(cols, made);
  return made;
}

/** Bir breadboard (merkezi yerel 0, alt yüzü masada); `cols`: 63 tam boy, 30 yarım boy. */
export function breadboardMesh(cols: number): Mesh {
  const side = mat('#e9e6dc', 0.7);
  const top = new MeshStandardMaterial({ map: texture(cols), roughness: 0.75 });
  const board = new Mesh(new BoxGeometry(boardWidth(cols), BB.height, BB.depth), [side, side, top, side, side, side]);
  board.position.y = BB.height / 2;
  board.userData.ownsMaterial = true;
  return board;
}

/** Jumper telinin yarıçapı (yalıtım; 22 AWG, Ø ≈ 1 mm). */
export const JUMPER_RADIUS = 0.2;

/** Jumper telinin olağan yüksekliği (kartın üstünden): kısa tel alçakta, uzun tel biraz yukarıda. */
export function jumperLift(a: Vector3, b: Vector3): number {
  return 0.45 + Math.min(1.6, 0.05 * Math.hypot(b.x - a.x, b.z - a.z));
}

/** Jumper telinin biçimi: kartın üstünden yüksekliği ve ortasının yana açılması (birim; 0 düz). */
export interface JumperShape {
  readonly lift: number;
  readonly bow: number;
}

/**
 * Jumper telinin yolunun dayanak noktaları: uçlardan dik kalkar, alçak bir kavisle öbür deliğe iner. `shape`
 * verilirse (başka bir telin ya da fişin üstünden geçen tel) o yükseklikte; `bow` ile ortası yana açılır (öbür
 * telin dik ucunun yanından geçer).
 */
export function jumperPoints(a: Vector3, b: Vector3, shape: JumperShape = { lift: jumperLift(a, b), bow: 0 }): Vector3[] {
  const top = BB.height;
  const { lift, bow } = shape;
  const at = (t: number, dy: number, side: number) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    return new Vector3(a.x + dx * t + (-dz / len) * side, top + dy, a.z + dz * t + (dx / len) * side);
  };
  if (bow === 0) return [at(0, 0.05, 0), at(0, lift, 0), at(0.5, lift + 0.05, 0), at(1, lift, 0), at(1, 0.05, 0)];
  // Yana açılan tel: dik ucundan hemen sonra (≈ 0,7 birim) yana çıkar, öbür ucuna yakın geri döner.
  const d = Math.min(0.3, Math.max(0.08, 0.7 / (Math.hypot(b.x - a.x, b.z - a.z) || 1)));
  return [at(0, 0.05, 0), at(0, lift, 0), at(d, lift + 0.05, bow), at(0.5, lift + 0.05, bow), at(1 - d, lift + 0.05, bow), at(1, lift, 0), at(1, 0.05, 0)];
}

/** Breadboard üstünde iki delik arasında yatık jumper teli (uçları soyuk). */
/** Jumper telinin eğrisi (dayanak noktalarından geçen yumuşak eğri). */
export function jumperCurve(a: Vector3, b: Vector3, shape?: JumperShape): CatmullRomCurve3 {
  return new CatmullRomCurve3(jumperPoints(a, b, shape), false, 'centripetal');
}

/** Breadboard üstünde iki delik arasında yatık jumper teli (uçları soyuk). */
export function jumperMesh(a: Vector3, b: Vector3, color: string, shape?: JumperShape): Group {
  const g = new Group();
  const top = BB.height;
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const curve = jumperCurve(a, b, shape);
  g.userData.curve = curve;
  g.add(new Mesh(new TubeGeometry(curve, Math.max(12, Math.round(dist * 2)), JUMPER_RADIUS, 8, false), mat(color, 0.5)));
  for (const p of [a, b]) g.add(rod(new Vector3(p.x, top - HOLE_DEPTH, p.z), new Vector3(p.x, top + 0.1, p.z), 0.1, M.tin(), 6));
  return g;
}
