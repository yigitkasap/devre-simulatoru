// Parçaların tezgâhtaki yeri (sahne ve testler ortak): breadboard'a takılan parça deliklerin arasında,
// bacakları deliklere; masadaki parça plandaki yerde. Model kurulur, gruba konur; kabloların bağlandığı
// uçlar (dünya), soketlerin yönleri ve gövde kutuları hesaplanır. Çizim (birleştirme, gölge) sahnede.

import { Box3, Group, Vector3 } from 'three';
import type { CircuitDoc, Part } from '../model/types';
import { BB, holeXZ, type BoardPart, type BreadboardPlan, type Hole, type TablePart } from './breadboard';
import { HOLE_DEPTH } from './breadboardModel';
import { PLUG } from './jumpers';
import type { PartModel } from './model';
import { instrumentLeads } from './posts';
import { buildPartModel } from './registry';
import { roundSpec, sizeRoundBodies, type RoundConflict, type RoundItem, type RoundObstacle } from './roundBody';

export interface Placement {
  readonly model: PartModel;
  readonly group: Group;
  /** Kabloların bağlandığı uçlar (dünya): breadboard'da bacakların bittiği delikler, masada modelin uçları. */
  readonly anchors: Vector3[];
  /** Ön paneldeki soketlerin dışa baktığı yön (dünya). */
  readonly dirs: readonly (Vector3 | undefined)[];
  /** Soketlerin rengi (modelde varsa). */
  readonly colors: readonly (string | undefined)[];
  /** Bütün modelin kutusu (dünya). */
  readonly box: Box3;
  /** Gövdenin kutusu (bacaklar hariç; modelde `userData.body` işaretli değilse bütün model). */
  readonly body: Box3;
  /** Yerin taban yüksekliği (gölge): breadboard'da kartın üstü, masada 0. */
  readonly base: number;
  /** Tahtadaki yuvarlak gövde (LED, elektrolitik, TO-18…): merkezi (dünya) ve yarıçapı; yuvarlak değilse null. */
  readonly round: { readonly x: number; readonly z: number; readonly r: number } | null;
}

/** Başka bir parçanın bacağının (deliğinin) çevresinde yuvarlak gövdeye bırakılmayan yarıçap. */
const LEG_KEEPOUT = 0.1;

/** Deliğin dünya koordinatı (`y`: ağzı BB.height, bacağın bittiği yer BB.height − HOLE_DEPTH). */
export function holeAt(h: Hole, cols: number, y: number): Vector3 {
  const { x, z } = holeXZ(h, cols);
  return new Vector3(x, y, z);
}

function finish(model: PartModel, group: Group, anchors: Vector3[], base: number, dirs: readonly (Vector3 | undefined)[] = [], round: Placement['round'] = null): Placement {
  group.add(model.root);
  group.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model.root);
  let body: Box3 | null = null;
  model.root.traverse((o) => {
    if (o.userData.body) body = (body ?? new Box3()).union(new Box3().setFromObject(o));
  });
  return { model, group, anchors, dirs, colors: model.anchorColors ?? [], box, body: body ?? box.clone(), base, round };
}

/** Tahtadaki parçanın gövdesinin merkezi (dünya, tahta düzlemi): iki bacaklıda deliklerin ortası, öbürlerinde ağırlık merkezi. */
function bodyCenter(at: BoardPart, cols: number): { x: number; z: number } {
  const holes = (at.mount === 'axial' || at.mount === 'radial' ? at.holes.slice(0, 2) : [...at.holes, ...(at.extraHoles ?? [])]).map((h) => holeXZ(h, cols));
  return { x: holes.reduce((s, h) => s + h.x, 0) / holes.length, z: holes.reduce((s, h) => s + h.z, 0) / holes.length };
}

/**
 * Breadboard'a takılan parça: gövde deliklerin arasında, bacaklar deliklere. `round`: yuvarlak gövdenin çapı
 * (verilmezse olağan çap; yerleşime göre seçilen çap için `placeBoardParts`).
 */
export function placeBoardPart(part: Part, at: BoardPart, cols: number, round?: number): Placement {
  const holeIn = (h: Hole) => holeAt(h, cols, BB.height - HOLE_DEPTH);
  const holes = at.holes.map(holeIn);
  const extra = (at.extraHoles ?? []).map(holeIn);
  const group = new Group();
  const all = [...holes, ...extra];
  const center = all.reduce((c, h) => c.add(h), new Vector3()).multiplyScalar(1 / all.length);
  const spec = roundSpec(part);
  const diameter = spec ? (round ?? spec.max) : undefined;
  if (at.mount === 'axial' || at.mount === 'radial') {
    const [a, b] = holes as [Vector3, Vector3];
    group.position.set((a.x + b.x) / 2, BB.height, (a.z + b.z) / 2);
    group.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
  } else if (at.mount === 'to92') {
    // Yerel z ekseni sütunlar boyunca: düz (yazılı) yüz izleyiciye bakar. Gövde üç deliğin ortasında.
    group.position.set(center.x, BB.height, center.z);
    group.rotation.y = Math.PI / 2;
  } else {
    group.position.set(center.x, BB.height, center.z);
  }
  group.updateMatrixWorld(true);
  const local = (v: Vector3) => group.worldToLocal(v.clone());
  const model = buildPartModel(part, holes.map(local), extra.map(local), diameter);
  return finish(model, group, holes, BB.height, [], diameter === undefined ? null : { ...bodyCenter(at, cols), r: diameter / 2 });
}

/**
 * Tahtadaki bütün parçalar (kimlik → yerleşim) ve en küçük çapta da başka bir şeye değen yuvarlak gövdeler.
 * Yuvarlak gövdelerin (roundBody.ts) çapı yerleşime göre seçilir: önce öbür parçalar kurulur; yuvarlak gövde onların
 * gövde kutusuna, bacaklarına, Arduino kablolarının fişlerine ve öbür yuvarlak gövdelere değmeyecek en büyük çapı alır.
 */
export function placeBoardParts(doc: CircuitDoc, plan: BreadboardPlan): { placements: Map<string, Placement>; conflicts: RoundConflict[] } {
  const placements = new Map<string, Placement>();
  const items: RoundItem[] = [];
  const obstacles: RoundObstacle[] = [];
  const onBoard = doc.parts.flatMap((part) => {
    const at = plan.onBoard.get(part.id);
    return at ? [{ part, at }] : [];
  });
  for (const { part, at } of onBoard) {
    const spec = roundSpec(part);
    if (spec) items.push({ id: part.id, ...bodyCenter(at, plan.cols), spec });
    else {
      const placed = placeBoardPart(part, at, plan.cols);
      placements.set(part.id, placed);
      obstacles.push({ kind: 'box', owner: part.id, name: part.id, x0: placed.body.min.x, x1: placed.body.max.x, z0: placed.body.min.z, z1: placed.body.max.z });
    }
    // Bacaklar: yuvarlak gövde başka bir parçanın bacağının üstüne taşmaz.
    for (const h of [...at.holes, ...(at.extraHoles ?? [])]) {
      const { x, z } = holeXZ(h, plan.cols);
      obstacles.push({ kind: 'circle', owner: part.id, name: part.id, x, z, r: LEG_KEEPOUT });
    }
  }
  // Masadaki parçadan (Arduino) deliğe gelen kablonun fişi.
  const posted = new Set(instrumentLeads(doc, plan));
  plan.leads.forEach((lead, i) => {
    if (posted.has(i)) return;
    const { x, z } = holeXZ(lead.hole, plan.cols);
    obstacles.push({ kind: 'box', owner: `fiş:${i}`, name: `fiş (${lead.partId})`, x0: x - PLUG.width / 2, x1: x + PLUG.width / 2, z0: z - PLUG.width / 2, z1: z + PLUG.width / 2 });
  });
  const { sizes, conflicts } = sizeRoundBodies(items, obstacles);
  for (const { part, at } of onBoard) if (sizes.has(part.id)) placements.set(part.id, placeBoardPart(part, at, plan.cols, sizes.get(part.id)));
  return { placements, conflicts };
}

/** Masadaki parça: plandaki yerde; bacakları/uçları kendi modelinde. */
export function placeTablePart(part: Part, at: TablePart): Placement {
  const model = buildPartModel(part);
  const group = new Group();
  group.position.set(at.x, 0, at.z);
  group.rotation.y = (at.rotation * Math.PI) / 180;
  group.updateMatrixWorld(true);
  const anchors = model.anchors.map((a) => a.clone().applyMatrix4(group.matrixWorld));
  const dirs = model.anchorDirs?.map((d) => d.clone().applyQuaternion(group.quaternion).normalize()) ?? [];
  return finish(model, group, anchors, 0, dirs);
}
