// Bağlantı direklerinin 3B modelleri (posts.ts'in yerleşimine göre): taban plakası, direk, üst üste takılan muz
// fiş ve direkten tahtaya giden tel. Sade: az kenarlı silindirler, paylaşılan malzemeler.

import { BoxGeometry, CylinderGeometry, Group, Mesh, Vector3 } from 'three';
import { BB } from './breadboard';
import { HOLE_DEPTH } from './breadboardModel';
import { CABLE_RADIUS } from './jumpers';
import { M, mat, mesh, rod, wirePath } from './kit';
import { BANANA, PLATE, POST, POST_WIRE, plateRect, plugBase, plugEntry, type Post } from './posts';

/** Taban plakası: tahtaların altında ince koyu levha; arkada direk sırası kadar geniş. */
export function plateMesh(cols: number, boardsDepth: number): Mesh {
  const r = plateRect(cols, boardsDepth);
  return mesh(new BoxGeometry(r.x1 - r.x0, PLATE.thickness, r.z1 - r.z0), mat('#474c53', 0.8), (r.x0 + r.x1) / 2, PLATE.thickness / 2, (r.z0 + r.z1) / 2);
}

/** Direk: plakada çelik taban, renkli gövde (ağın kablo rengi), tepesinde fiş yuvası; önünde telin bağlandığı kulak. */
export function postMesh(post: Post): Group {
  const g = new Group();
  const base = PLATE.thickness;
  g.add(mesh(new CylinderGeometry(POST.radius + 0.18, POST.radius + 0.18, 0.3, 14), M.steel(), post.x, base + 0.15, post.z));
  const h = POST.top - base - 0.3;
  g.add(mesh(new CylinderGeometry(POST.radius, POST.radius, h, 14), mat(post.color, 0.5), post.x, base + 0.3 + h / 2, post.z));
  g.add(mesh(new CylinderGeometry(0.3, 0.3, 0.06, 10), mat('#0b0b0b', 0.9), post.x, POST.top + 0.03, post.z));
  g.add(mesh(new BoxGeometry(0.3, 0.2, POST.radius), M.steel(), post.x, BB.height + POST_WIRE.lift, post.z + POST.radius * 0.6));
  return g;
}

/** Muz fiş (üst üste takılır): renkli silindir; kablo arkasından (cihazlara bakan yandan) girer. */
export function bananaMesh(post: Post, level: number, color: string): Group {
  const g = new Group();
  const at = plugBase(post, level);
  g.add(mesh(new CylinderGeometry(BANANA.radius, BANANA.radius, BANANA.height - 0.06, 12), mat(color, 0.5), at.x, at.y + BANANA.height / 2, at.z));
  const entry = plugEntry(post, level);
  g.add(rod(entry.clone().setZ(entry.z + 0.05), entry.clone().setZ(entry.z - 0.45), CABLE_RADIUS + 0.07, mat(color, 0.5), 8));
  return g;
}

/** Direkten deliğe giden tel: ince, düz, kartın hemen üstünde; ucu deliğe girer. */
export function postWireMesh(points: readonly Vector3[], color: string): Group {
  const g = wirePath(points, POST_WIRE.radius, mat(color, 0.5), 6);
  const end = points[points.length - 1]!;
  g.add(rod(new Vector3(end.x, BB.height - HOLE_DEPTH, end.z), new Vector3(end.x, BB.height + 0.05, end.z), 0.07, M.tin(), 6));
  return g;
}
