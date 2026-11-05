// Lojik entegrelerin 3B modelleri: masada (şema pinleri × SPREAD'deki pin
// başlıklı küçük bir kart üstünde) ve breadboard'da (DIP orta kanalın üstünde; gösterge d ve h
// satırlarında). Gösterge segmentleri simülasyonla yanar.

import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { LOGIC_CHIPS, chipPinNames, type LogicChipType } from '../model/logicChips';
import { M, canvasTexture, labelPlate, mat, mesh, pinAnchors, rod } from './kit';
import type { PartModel } from './model';

/**
 * DIP entegre (breadboard'da): gövde bacakların arasında, çentik ve 1. bacak noktası 1. bacak
 * tarafında, üstte model yazısı. `anchors` + `extra`: bütün bacakların delikleri (yerel).
 * `pinOne`: 1. bacağın deliği (çentiğin hangi uçta olduğu buradan bulunur).
 */
export function dipChipModel(label: string, anchors: readonly Vector3[], extra: readonly Vector3[], pinOne: Vector3 | undefined = anchors[0]): PartModel {
  const root = new Group();
  const all = [...anchors, ...extra];
  const xs = all.map((a) => a.x);
  const length = Math.max(...xs) - Math.min(...xs) + 0.9;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const body = mesh(new BoxGeometry(length, 1.25, 2.3), mat('#17181b', 0.5), cx, 1.15, 0);
  root.add(body);
  // Çentik ve nokta 1. bacağın ucunda (1. bacak alt sıranın en solunda; döndürülmüşse sağında).
  const left = !pinOne || pinOne.x <= cx;
  const end = cx + (left ? -1 : 1) * (length / 2 - 0.45);
  root.add(mesh(new CylinderGeometry(0.3, 0.3, 0.05, 14), mat('#2a2c30', 0.6), end, 1.79, 0));
  root.add(mesh(new CylinderGeometry(0.14, 0.14, 0.05, 12), mat('#c6cad0', 0.5), end + (left ? 0.55 : -0.55), 1.79, Math.sign(pinOne?.z ?? 1) * 0.75));
  const plate = labelPlate(label, Math.min(length * 0.7, 6), 0.9, { fg: '#c6cad0' });
  plate.position.set(cx, 1.78, 0);
  if (!left) plate.rotation.z = Math.PI;
  root.add(plate);
  for (const a of all) {
    const side = Math.sign(a.z) || 1;
    const shoulder = new Vector3(a.x, 0.95, side * 1.15);
    const knee = new Vector3(a.x, 0.95, a.z);
    root.add(rod(shoulder, knee, 0.09, M.tin(), 6), rod(knee, a, 0.09, M.tin(), 6));
  }
  return { root, anchors };
}

function headerPin(at: Vector3): Group {
  const g = new Group();
  g.add(mesh(new BoxGeometry(1, 1, 1), M.header(), at.x, 0.5 + 0.2, at.z));
  g.add(mesh(new BoxGeometry(0.25, 2.4, 0.25), M.gold(), at.x, 1.4, at.z));
  return g;
}

const HEADER_TOP = 2.6;

/** Kartın üstü: yeşil zemin, başlıklardan entegrenin bacaklarına yollar, başlıkların yanında adlar. */
function carrierBoard(pins: readonly Vector3[], legs: readonly Vector3[], labels: readonly string[]): { mesh: Mesh; w: number; d: number; cx: number; cz: number } {
  const xs = pins.map((p) => p.x);
  const zs = pins.map((p) => p.z);
  const w = Math.max(...xs) - Math.min(...xs) + 1.6;
  const d = Math.max(...zs) - Math.min(...zs) + 1.6;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  const top = canvasTexture(w, d, (ctx, W) => {
    const s = W / w;
    ctx.fillStyle = '#1f5f3d';
    ctx.fillRect(0, 0, W, d * s);
    const px = (x: number) => (x - cx + w / 2) * s;
    const pz = (z: number) => (z - cz + d / 2) * s;
    ctx.strokeStyle = '#c99a4e';
    ctx.lineWidth = s * 0.24;
    ctx.lineCap = 'round';
    pins.forEach((p, i) => {
      const leg = legs[i];
      if (!leg) return;
      ctx.beginPath();
      ctx.moveTo(px(p.x), pz(p.z));
      ctx.lineTo(px(leg.x), pz(leg.z));
      ctx.stroke();
    });
    ctx.fillStyle = '#f0f2ee';
    ctx.font = `600 ${Math.round(s * 0.62)}px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    pins.forEach((p, i) => {
      const dx = p.x < cx - 0.1 ? 1.5 : p.x > cx + 0.1 ? -1.5 : 0;
      const dz = Math.abs(dx) > 0 ? -0.75 : -1.1;
      ctx.fillText(labels[i] ?? '', px(p.x + dx), pz(p.z + dz));
    });
  });
  const board = new Mesh(new BoxGeometry(w, 0.3, d), [M.pcbGreen(), M.pcbGreen(), new MeshStandardMaterial({ map: top, roughness: 0.6 }), M.pcbGreen(), M.pcbGreen(), M.pcbGreen()]);
  board.position.set(cx, 0.35, cz);
  board.userData.ownsMaterial = true;
  return { mesh: board, w, d, cx, cz };
}

/**
 * Lojik entegre masada: şema pinlerinin yerindeki pin başlıkları olan küçük bir kartın ortasında DIP
 * (uzun kenarı z boyunca, çentik −z'de); her başlıktan entegrenin bacağına bir yol.
 */
export function logicModuleModel(type: LogicChipType, model: string): PartModel {
  const root = new Group();
  const pins = pinAnchors(type);
  const count = LOGIC_CHIPS[type].names.length;
  const half = count / 2;
  const chip = { w: 2.6, d: half + 0.6 };
  const zOf = (k: number) => -(half - 1) / 2 + k;
  // Bacak n'nin kart üstündeki ucu: sol yanda yukarıdan aşağı 1…n/2, sağ yanda aşağıdan yukarı.
  const legAt = (n: number) => (n <= half ? new Vector3(-chip.w / 2 - 0.35, 0, zOf(n - 1)) : new Vector3(chip.w / 2 + 0.35, 0, zOf(count - n)));
  const legs = Array.from({ length: count }, (_, i) => legAt(i + 1));
  const board = carrierBoard(pins, legs, chipPinNames(type, model));
  root.add(board.mesh);
  root.add(mesh(new BoxGeometry(chip.w, 1.2, chip.d), mat('#17181b', 0.55), 0, 1.15, 0));
  root.add(mesh(new CylinderGeometry(0.28, 0.28, 0.05, 14), mat('#2a2c30', 0.6), 0, 1.78, -chip.d / 2 + 0.3));
  root.add(mesh(new CylinderGeometry(0.13, 0.13, 0.05, 12), mat('#c6cad0', 0.5), -chip.w / 2 + 0.45, 1.78, -chip.d / 2 + 0.75));
  const label = labelPlate(model, chip.d * 0.8, 0.8, { fg: '#c6cad0' });
  label.position.set(0.15, 1.76, 0.3);
  label.rotation.z = Math.PI / 2;
  root.add(label);
  for (const leg of legs) root.add(mesh(new BoxGeometry(0.5, 0.15, 0.3), M.tin(), leg.x, 0.62, leg.z));
  for (const p of pins) root.add(headerPin(p));
  return { root, anchors: pins.map((p) => new Vector3(p.x, HEADER_TOP, p.z)) };
}

