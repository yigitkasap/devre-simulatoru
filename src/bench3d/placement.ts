// Parçaların tezgâhtaki yeri (sahne ve testler ortak): breadboard'a takılan parça deliklerin arasında,
// bacakları deliklere; masadaki parça plandaki yerde. Model kurulur, gruba konur; kabloların bağlandığı
// uçlar (dünya), soketlerin yönleri ve gövde kutuları hesaplanır. Çizim (birleştirme, gölge) sahnede.

import { Box3, Group, Vector3 } from 'three';
import type { Part } from '../model/types';
import { BB, holeXZ, type BoardPart, type Hole, type TablePart } from './breadboard';
import { HOLE_DEPTH } from './breadboardModel';
import type { PartModel } from './model';
import { buildPartModel } from './registry';

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
}

/** Deliğin dünya koordinatı (`y`: ağzı BB.height, bacağın bittiği yer BB.height − HOLE_DEPTH). */
export function holeAt(h: Hole, cols: number, y: number): Vector3 {
  const { x, z } = holeXZ(h, cols);
  return new Vector3(x, y, z);
}

function finish(model: PartModel, group: Group, anchors: Vector3[], base: number, dirs: readonly (Vector3 | undefined)[] = []): Placement {
  group.add(model.root);
  group.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model.root);
  let body: Box3 | null = null;
  model.root.traverse((o) => {
    if (o.userData.body) body = (body ?? new Box3()).union(new Box3().setFromObject(o));
  });
  return { model, group, anchors, dirs, colors: model.anchorColors ?? [], box, body: body ?? box.clone(), base };
}

/** Breadboard'a takılan parça: gövde deliklerin arasında, bacaklar deliklere. */
export function placeBoardPart(part: Part, at: BoardPart, cols: number): Placement {
  const holeIn = (h: Hole) => holeAt(h, cols, BB.height - HOLE_DEPTH);
  const holes = at.holes.map(holeIn);
  const extra = (at.extraHoles ?? []).map(holeIn);
  const group = new Group();
  const all = [...holes, ...extra];
  const center = all.reduce((c, h) => c.add(h), new Vector3()).multiplyScalar(1 / all.length);
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
  const model = buildPartModel(part, holes.map(local), extra.map(local));
  return finish(model, group, holes, BB.height);
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
