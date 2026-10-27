// 3B tezgâh sahnesi: masa, ışık, kamera ve yörünge denetimi; parçalar şemadaki yerlerinde, kablolar
// uçlarından yukarı kıvrılan atlama kabloları. Yalnızca bir şey değişince (kamera, canlı değer,
// devre) çizer.

import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  Color,
  CubicBezierCurve3,
  DirectionalLight,
  Group,
  HemisphereLight,
  MOUSE,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  BoxGeometry,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SimFrame } from '../editor/useSimulation';
import type { CircuitDoc, Part } from '../model/types';
import { BB, boardWidth, boardZ, holeXZ, netColors, planBreadboard, type BoardPart, type BreadboardPlan, type Hole, type TablePart } from './breadboard';
import { HOLE_DEPTH, breadboardMesh, jumperMesh } from './breadboardModel';
import { M, mat, mergeStatic, mesh, rod } from './kit';
import type { PartModel } from './model';
import { buildPartModel } from './registry';

export interface BenchCallbacks {
  onSelect(partId: string | null): void;
  /** Anahtar: simülasyon çalışırken tıklanınca açılıp kapanır. */
  onToggle(partId: string): void;
  /** Potansiyometre düğmesi sürükleniyor: yeni konum (%); done: bırakıldı. */
  onKnob(partId: string, position: number, done: boolean): void;
}

/** Modeli değiştirmeyen, canlı değişen özellikler (model yeniden kurulmaz, update() uygular). */
const LIVE_PROPS = new Set(['closed', 'position', 'illuminance', 'temperature', 'level', 'mode', 'loadTorque', 'amplitude', 'frequency', 'waveform', 'offset']);


interface Placed {
  readonly key: string;
  part: Part;
  readonly model: PartModel;
  readonly group: Group;
  readonly shadow: Mesh;
  /** Kabloların bağlandığı uçlar (dünya koordinatı). */
  readonly anchors: Vector3[];
}

/** Deliğin dünya koordinatı (`y`: ağzı BB.height, bacağın bittiği yer BB.height − HOLE_DEPTH). */
function holeAt(h: Hole, cols: number, y: number): Vector3 {
  const { x, z } = holeXZ(h, cols);
  return new Vector3(x, y, z);
}

function partKey(part: Part): string {
  const props = Object.entries(part.props)
    .filter(([k]) => !LIVE_PROPS.has(k))
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([part.type, part.x, part.y, part.rotation, props]);
}

function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      const materials: Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials) {
        if (!(o.userData.ownsMaterial || m.userData.own)) continue;
        for (const value of Object.values(m)) if (value instanceof Texture) value.dispose();
        m.dispose();
      }
    }
  });
}

function radialTexture(inner: string, outer: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function matTexture(): CanvasTexture {
  // Kesim altlığı: 1 birim (2,54 mm) aralıklı ince, 10 birimde kalın çizgiler.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 400;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e9ebe6';
  ctx.fillRect(0, 0, 400, 400);
  ctx.strokeStyle = 'rgba(80, 96, 110, 0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 40, 0);
    ctx.lineTo(i * 40, 400);
    ctx.moveTo(0, i * 40);
    ctx.lineTo(400, i * 40);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(80, 96, 110, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 400, 400);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export class BenchScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.5, 4000);
  private readonly controls: OrbitControls;
  private readonly pmrem: PMREMGenerator;
  private readonly parts = new Map<string, Placed>();
  private readonly cables = new Group();
  private readonly boards = new Group();
  /** Son kurulan yerleşimin imzası (değişmediyse sahne yeniden kurulmaz). */
  private layoutKey = '';
  /** Kadrajda kalması gereken breadboard bölümü: yarım boy kartın tamamı, tam boyda kullanılan sütunlar. */
  private boardView = new Box3();
  private readonly partsGroup = new Group();
  private readonly shadowTexture = radialTexture('rgba(20,30,40,0.38)', 'rgba(20,30,40,0)');
  private readonly ringMaterial = new MeshBasicMaterial({ color: '#1f6feb', transparent: true, opacity: 0.32, depthWrite: false });
  private readonly ring = new Mesh(new PlaneGeometry(1, 1), this.ringMaterial);
  private readonly table: Mesh;
  private readonly observer: ResizeObserver;
  private frame: SimFrame | null = null;
  private active = false;
  private selection: readonly string[] = [];
  private dirty = true;
  private animating = false;
  private lastTime = performance.now();
  private fitted = false;
  /** Kullanıcı kamerayı elle oynattı mı (oynatmadıysa alan değişince yeniden sığdırılır). */
  private userMoved = false;
  private lastFitTop = false;
  private drag: { id: string; x: number; start: number; position: number } | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  /** Son kare süresi (ms) ve çizim sayısı: performans taraması okur. */
  stats = { frames: 0, renderMs: 0 };

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: BenchCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    this.pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.85;
    this.scene.background = new Color('#dfe3e8');
    this.scene.add(new HemisphereLight('#ffffff', '#aab4bf', 0.55));
    const sun = new DirectionalLight('#ffffff', 1.5);
    sun.position.set(40, 90, 30);
    this.scene.add(sun);

    const texture = matTexture();
    texture.repeat.set(200, 200);
    this.table = new Mesh(new PlaneGeometry(2000, 2000), new MeshStandardMaterial({ map: texture, roughness: 0.92 }));
    this.table.rotation.x = -Math.PI / 2;
    this.scene.add(this.table);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.scene.add(this.ring, this.boards, this.partsGroup, this.cables);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    // Fare: sol tuş kaydırır, orta tuş döndürür (kullanıcı isteği); orta tuşu olmayan dokunmatik
    // yüzeyler için sağ tuş da döndürür. Tekerlek yakınlaştırır. Tıklama (sürüklemeden) seçer.
    this.controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.ROTATE };
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 900;
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => (this.userMoved = true));

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    // Orta tuş: tarayıcının otomatik kaydırması (Windows) döndürmeyi bozmasın.
    canvas.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());
    canvas.addEventListener('auxclick', (e) => e.button === 1 && e.preventDefault());
    // iOS: dokunuş sayfayı kaydırmasın, yakınlaştırmasın.
    const prevent = (e: TouchEvent) => e.preventDefault();
    canvas.addEventListener('touchstart', prevent, { passive: false });
    canvas.addEventListener('touchmove', prevent, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.camera.position.set(0, 120, 120);
    this.renderer.setAnimationLoop(this.tick);
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.fitted && !this.userMoved) this.fit(this.lastFitTop);
    this.dirty = true;
  }

  /** Dokunmaya (çekmece açıkken) kapalı: tuval sayfa kaydırmasına izin verir. */
  setInteractive(on: boolean): void {
    this.controls.enabled = on;
    this.renderer.domElement.style.touchAction = on ? 'none' : 'auto';
  }

  // --- Devre --------------------------------------------------------------------------------------

  setDoc(doc: CircuitDoc): void {
    const plan = planBreadboard(doc);
    const key = JSON.stringify([
      doc.parts.map(partKey),
      [...plan.onBoard.values()],
      [...plan.table.values()],
      plan.jumpers,
      plan.leads,
    ]);
    if (key === this.layoutKey) {
      for (const part of doc.parts) {
        const placed = this.parts.get(part.id);
        if (placed) placed.part = part;
      }
    } else {
      this.layoutKey = key;
      this.rebuild(doc, plan);
      if (!this.fitted && doc.parts.length > 0) {
        this.fit();
        this.fitted = true;
      } else if (this.fitted && !this.userMoved) {
        this.fit(this.lastFitTop);
      }
    }
    this.applyFrame();
    this.updateRing();
    this.dirty = true;
  }

  /** Breadboard'lar, parçalar, jumper'lar ve kablolar baştan kurulur. */
  private rebuild(doc: CircuitDoc, plan: BreadboardPlan): void {
    for (const placed of this.parts.values()) this.removePart(placed);
    this.parts.clear();
    for (const child of [...this.boards.children, ...this.cables.children]) {
      child.removeFromParent();
      disposeObject(child);
    }
    const usedX = [
      ...[...plan.onBoard.values()].flatMap((p) => [...p.holes, ...(p.extraHoles ?? [])]),
      ...plan.leads.map((l) => l.hole),
      ...plan.jumpers.flatMap((j) => [j.a, j.b]),
    ].map((h) => holeXZ(h, plan.cols).x);
    const halfWidth = boardWidth(plan.cols) / 2;
    const full = plan.cols >= BB.cols && usedX.length > 0;
    this.boardView = new Box3(
      new Vector3(full ? Math.max(-halfWidth, Math.min(...usedX) - 4) : -halfWidth, 0, -BB.depth / 2),
      new Vector3(full ? Math.min(halfWidth, Math.max(...usedX) + 4) : halfWidth, BB.height, boardZ(plan.boards - 1) + BB.depth / 2),
    );
    for (let b = 0; b < plan.boards; b++) {
      const board = breadboardMesh(plan.cols);
      board.position.z = boardZ(b);
      this.boards.add(board);
      const shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, 0.02, boardZ(b));
      shadow.scale.set(boardWidth(plan.cols) * 1.25, BB.depth * 1.6, 1);
      shadow.userData.ownsMaterial = true;
      this.boards.add(shadow);
    }
    for (const part of doc.parts) {
      const onBoard = plan.onBoard.get(part.id);
      const table = plan.table.get(part.id);
      if (onBoard) this.parts.set(part.id, this.placeOnBoard(part, onBoard, plan.cols));
      else if (table) this.parts.set(part.id, this.placeOnTable(part, table));
    }
    // Renkler: ağ başına (toprak siyah, besleme kırmızı, öbürleri sırayla; lehim rehberiyle aynı).
    const colorOf = netColors(plan);
    const holeTop = (h: Hole) => holeAt(h, plan.cols, BB.height);
    for (const j of plan.jumpers) this.cables.add(jumperMesh(holeTop(j.a), holeTop(j.b), colorOf(j.net)));
    const plug = new BoxGeometry(0.75, 1.5, 0.75);
    const plugMat = mat('#1b1c1f', 0.6);
    for (const lead of plan.leads) {
      const placed = this.parts.get(lead.partId);
      const from = placed?.anchors[lead.pin];
      if (!from) continue;
      const to = holeTop(lead.hole);
      const color = colorOf(lead.net);
      const a1 = from.clone().add(new Vector3(0, 1.4, 0));
      const b1 = to.clone().add(new Vector3(0, 1.5, 0));
      const dist = a1.distanceTo(b1);
      const lift = Math.min(14, 2 + 0.2 * dist);
      const curve = new CubicBezierCurve3(a1, a1.clone().add(new Vector3(0, lift, 0)), b1.clone().add(new Vector3(0, lift, 0)), b1);
      this.cables.add(new Mesh(new TubeGeometry(curve, Math.max(12, Math.round(dist * 1.5)), 0.28, 8, false), mat(color, 0.55)));
      this.cables.add(mesh(plug, plugMat, from.x, from.y + 0.75, from.z));
      this.cables.add(mesh(plug, plugMat, to.x, to.y + 0.75, to.z));
      this.cables.add(rod(new Vector3(to.x, to.y - HOLE_DEPTH, to.z), to, 0.1, M.tin(), 6));
    }
    this.dirty = true;
  }

  /** Breadboard'a takılan parça: gövde deliklerin arasında, bacaklar deliklere. */
  private placeOnBoard(part: Part, at: BoardPart, cols: number): Placed {
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
      // Yerel z ekseni sütunlar boyunca: düz (yazılı) yüz izleyiciye bakar.
      group.position.set(holes[1]!.x, BB.height, holes[1]!.z);
      group.rotation.y = Math.PI / 2;
    } else {
      group.position.set(center.x, BB.height, center.z);
    }
    group.updateMatrixWorld(true);
    const local = (v: Vector3) => group.worldToLocal(v.clone());
    const model = buildPartModel(part, holes.map(local), extra.map(local));
    return this.finishPlacement(part, model, group, holes, BB.height);
  }

  /** Masadaki parça: plandaki yerde; bacakları/uçları kendi modelinde. */
  private placeOnTable(part: Part, at: TablePart): Placed {
    const model = buildPartModel(part);
    const group = new Group();
    group.position.set(at.x, 0, at.z);
    group.rotation.y = (at.rotation * Math.PI) / 180;
    group.updateMatrixWorld(true);
    const anchors = model.anchors.map((a) => a.clone().applyMatrix4(group.matrixWorld));
    return this.finishPlacement(part, model, group, anchors, 0);
  }

  private finishPlacement(part: Part, model: PartModel, group: Group, anchors: Vector3[], base: number): Placed {
    group.add(model.root);
    group.userData.partId = part.id;
    mergeStatic(model.root);
    this.partsGroup.add(group);
    group.updateMatrixWorld(true);
    // Gölge: gövdenin kapladığı alanın altında yumuşak leke.
    const box = new Box3().setFromObject(model.root);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(center.x, base + 0.03, center.z);
    shadow.scale.set(size.x * 1.2 + 1, size.z * 1.2 + 1, 1);
    this.scene.add(shadow);
    return { key: partKey(part), part, model, group, shadow, anchors };
  }

  private removePart(placed: Placed): void {
    placed.group.removeFromParent();
    placed.shadow.removeFromParent();
    (placed.shadow.material as Material).dispose();
    placed.shadow.geometry.dispose();
    placed.model.dispose?.();
    disposeObject(placed.group);
  }

  // --- Canlı değerler -----------------------------------------------------------------------------

  setFrame(frame: SimFrame | null, active: boolean): void {
    this.frame = frame;
    this.active = active;
    this.applyFrame();
  }

  private applyFrame(): void {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastTime / 1000));
    let animating = false;
    for (const placed of this.parts.values()) {
      const id = placed.part.id;
      const more = placed.model.update?.({
        live: this.frame?.live.get(id),
        status: this.frame?.statuses.get(id),
        measurement: this.frame?.measurements.get(id),
        scope: this.frame?.scopes.get(id),
        props: placed.part.props,
        active: this.active && this.frame !== null,
        now,
        dt,
      });
      if (more) animating = true;
    }
    this.animating = animating;
    this.dirty = true;
  }

  // --- Seçim ----------------------------------------------------------------------------------------

  setSelection(ids: readonly string[]): void {
    this.selection = ids;
    this.updateRing();
  }

  private updateRing(): void {
    const placed = this.selection.length === 1 ? this.parts.get(this.selection[0]!) : undefined;
    this.ring.visible = Boolean(placed);
    if (placed) {
      this.ring.position.set(placed.shadow.position.x, placed.shadow.position.y + 0.01, placed.shadow.position.z);
      this.ring.scale.set(placed.shadow.scale.x * 0.8, placed.shadow.scale.y * 0.8, 1);
    }
    this.dirty = true;
  }

  // --- Kamera ---------------------------------------------------------------------------------------

  /** Bütün devre görünsün: önden ve yukarıdan (52°) bakış. */
  fit(top = false): void {
    this.lastFitTop = top;
    this.userMoved = false;
    const box = new Box3();
    // Parçalara, kablolara ve breadboard'un kullanılan bölümüne sığdırılır.
    for (const placed of this.parts.values()) box.expandByObject(placed.group);
    for (const c of this.cables.children) box.expandByObject(c);
    if (!this.boardView.isEmpty()) box.union(this.boardView);
    if (box.isEmpty()) box.set(new Vector3(-20, 0, -20), new Vector3(20, 5, 20));
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const radius = Math.max(size.x, size.z * 1.1, 20) / 2;
    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = Math.min(1.6, this.camera.aspect);
    const distance = (radius / Math.tan(fov / 2)) * (aspect < 1 ? 1.15 / aspect : 1.05);
    const elevation = top ? Math.PI * 0.47 : (52 * Math.PI) / 180;
    this.controls.target.copy(center).setY(0);
    this.camera.position.set(center.x, distance * Math.sin(elevation), center.z + distance * Math.cos(elevation));
    this.camera.near = Math.max(0.5, distance / 200);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.dirty = true;
  }

  // --- İşaretçi ---------------------------------------------------------------------------------------

  private pick(e: PointerEvent): Placed | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObject(this.partsGroup, true);
    for (const hit of hits) {
      let o: Object3D | null = hit.object;
      while (o && o.userData.partId === undefined) o = o.parent;
      if (o) return this.parts.get(o.userData.partId as string) ?? null;
    }
    return null;
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    const hit = this.pick(e);
    if (hit?.model.interaction === 'knob') {
      const position = Number(hit.part.props.position ?? 50);
      this.drag = { id: hit.part.id, x: e.clientX, start: position, position };
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.drag) return;
    const position = Math.max(0, Math.min(100, this.drag.start + (e.clientX - this.drag.x) * 0.5));
    if (Math.abs(position - this.drag.position) >= 0.5) {
      this.drag.position = Math.round(position);
      this.cb.onKnob(this.drag.id, this.drag.position, false);
    }
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    const down = this.down;
    this.down = null;
    if (this.drag) {
      const { id, position, start } = this.drag;
      this.drag = null;
      this.controls.enabled = true;
      if (position !== start) {
        this.cb.onKnob(id, position, true);
        return;
      }
    }
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || e.type === 'pointercancel') return;
    const hit = this.pick(e);
    if (hit && hit.model.interaction === 'toggle' && this.active) this.cb.onToggle(hit.part.id);
    else this.cb.onSelect(hit?.part.id ?? null);
  };

  // --- Çizim döngüsü ----------------------------------------------------------------------------------

  private readonly tick = () => {
    const now = performance.now();
    const moved = this.controls.update();
    if (this.animating) this.applyFrame();
    this.lastTime = now;
    if (!(this.dirty || moved || this.animating)) return;
    this.dirty = false;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.stats.renderMs = performance.now() - t0;
    this.stats.frames++;
  };

  /** Çizim çağrısı ve üçgen sayısı (performans taraması). */
  get info(): { calls: number; triangles: number; geometries: number; textures: number } {
    const { render, memory } = this.renderer.info;
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.controls.dispose();
    for (const placed of this.parts.values()) this.removePart(placed);
    this.parts.clear();
    disposeObject(this.cables);
    disposeObject(this.boards);
    disposeObject(this.table);
    (this.table.material as MeshStandardMaterial).map?.dispose();
    (this.table.material as Material).dispose();
    this.ring.geometry.dispose();
    this.ringMaterial.dispose();
    this.shadowTexture.dispose();
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

