// Timsah kıskacı ve kısa dik tel (3B modeller; ölçüler clips.ts'te, Mueller BU-30C ve 22 AWG tel). Kıskacın
// metal çeneleri ağızda, arkası kablonun renginde yumuşak PVC kılıfla örtülü (Mueller BU-2030-A gibi: kılıf
// kablonun renginde). Yerel çerçeve: x ağızdan kuyruğa, y çenelerin açıldığı yön, z genişlik.

import { BoxGeometry, CylinderGeometry, Group, Matrix4, Mesh } from 'three';
import { CLIP, STUB, stubPoints, type ClipPose, type StubShape } from './clips';
import { HOLE_DEPTH } from './breadboardModel';
import { M, mat, rod, wirePath } from './kit';

const L = CLIP.length;
const jawGeometry = (() => {
  const g = new BoxGeometry(L * CLIP.jaw, 0.13, CLIP.width * 0.72);
  g.translate((L * CLIP.jaw) / 2, 0, 0);
  return g;
})();
const bootGeometry = (() => {
  // Kılıf: kuyrukta tam kesit, ağza doğru daralır; kesit elips (yükseklik × genişlik).
  const g = new CylinderGeometry(1, 0.62, 1, 12, 1);
  g.rotateZ(-Math.PI / 2);
  g.translate(0.5, 0, 0);
  g.scale(L * (1 - CLIP.jaw + 0.04), CLIP.height / 2 * 0.78, CLIP.width / 2);
  g.translate(L * (CLIP.jaw - 0.04), 0, 0);
  return g;
})();
const hingeGeometry = (() => {
  const g = new CylinderGeometry(0.16, 0.16, CLIP.width * 0.8, 8);
  g.rotateX(Math.PI / 2);
  g.translate(L * CLIP.jaw * 0.92, 0, 0);
  return g;
})();

/** Kıskacın ağız ucu `pose.jaw`'da, kuyruğu eksen boyunca; kılıf `color` renginde. */
export function clipMesh(pose: ClipPose, color: string): Group {
  const g = new Group();
  const steel = M.steel();
  const lower = new Mesh(jawGeometry, steel);
  lower.position.y = -0.14;
  const upper = new Mesh(jawGeometry, steel);
  upper.position.y = 0.14;
  // Üst çene telin üstünde hafifçe açık.
  upper.rotation.z = 0.06;
  g.add(lower, upper, new Mesh(hingeGeometry, steel), new Mesh(bootGeometry, mat(color, 0.6)));
  g.matrixAutoUpdate = false;
  g.matrix.copy(new Matrix4().makeBasis(pose.axis, pose.up, pose.side).setPosition(pose.jaw));
  g.userData.shared = true;
  return g;
}

/** Deliğe takılı kısa dik tel: yalıtım (`color`), üstünde soyuk uç; alt soyuk uç deliğin içinde. Eğik telde yalıtım dirseklerden geçer. */
export function stubMesh(stub: StubShape, color: string): Group {
  const g = new Group();
  const { foot, top } = stub;
  const points = stubPoints(stub);
  const insulationTop = top.clone().setY(top.y - STUB.bare);
  g.add(rod(foot.clone().setY(foot.y - HOLE_DEPTH), foot.clone().setY(foot.y + 0.05), STUB.core, M.tin(), 6));
  g.add(wirePath([...points.slice(0, -1), insulationTop], STUB.radius, mat(color, 0.5), 10));
  g.add(rod(insulationTop, top, STUB.core, M.tin(), 6));
  return g;
}
