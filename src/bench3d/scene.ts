// 3B tezgâh sahnesi: masa, ışık, kamera ve yörünge denetimi; parçalar breadboard'da ya da masada,
// kablolar uçlarından alçak kavisle kalkan atlama kabloları. Yalnızca bir şey değişince (kamera, canlı
// değer, devre) çizer. Tasarım v3 (E1, E3) eklemeleri: kamera görünümleri (Serbest, Üstten, Önden,
// seçiliye yaklaş) ve yakınlaştırma; HTML etiket katmanının konumları (her çizimden sonra; çakışan
// etiketlerden önceliği düşük olan gizlenir); çalışırken kabloların üstünde akım yönünde akan noktalar.

import {
  Box3,
  CanvasTexture,
  Color,
  CubicBezierCurve3,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  type PMREMGenerator,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TubeGeometry,
  Vector2,
  Vector3,
  type WebGLRenderer,
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  SphereGeometry,
  type Curve,
} from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { dotSpeed, type SimFrame } from '../editor/useSimulation';
import type { CircuitDoc, Part } from '../model/types';
import { BB, boardWidth, boardZ, holeXZ, netColors, planBreadboard, type BoardPart, type BreadboardPlan, type Hole, type TablePart } from './breadboard';
import { HOLE_DEPTH, breadboardMesh, jumperMesh } from './breadboardModel';
import { collisions, leadCurve, type Obstacle } from './leadRoute';
import { cableCurrents } from './cableFlow';
import { M, mat, mergeStatic, mesh, rod } from './kit';
import type { PartModel } from './model';
import { buildPartModel } from './registry';
import { BACKGROUND, createControls, createRenderer, lightScene, radialTexture } from './stage';

export interface BenchCallbacks {
  onSelect(partId: string | null): void;
  /** Anahtar: simülasyon çalışırken tıklanınca açılıp kapanır. */
  onToggle(partId: string): void;
  /** Potansiyometre düğmesi sürükleniyor: yeni konum (%); done: bırakıldı. */
  onKnob(partId: string, position: number, done: boolean): void;
  /** Kullanıcı kamerayı elle oynattı (kamera menüsü "Serbest"e döner). */
  onCamera?(): void;
}

/** Kamera görünümleri: Serbest (önden ve yukarıdan, 52°), Üstten, Önden (alçaktan). */
export type CameraView = 'free' | 'top' | 'front';
const ELEVATION: Record<CameraView, number> = { free: (52 * Math.PI) / 180, top: Math.PI * 0.47, front: (14 * Math.PI) / 180 };

/** Akım noktaları: aralık (birim), yarıçap ve hız ölçeği (şemadaki piksel/s → birim/s). */
const DOT_SPACING = 2.6;
const DOT_RADIUS = 0.32;
const DOT_SPEED = 0.1;
const MAX_DOTS = 2000;

/** Akım noktalarının yürüdüğü kablo: eşit aralıklı noktaları ve uzunluğu. */
interface CablePath {
  readonly points: readonly Vector3[];
  readonly length: number;
}

/** Eğrinin eşit aralıklı noktaları (nokta konumu doğrusal ara değerle bulunur). */
function cablePath(curve: Curve<Vector3>): CablePath {
  const length = curve.getLength();
  return { points: curve.getSpacedPoints(Math.max(8, Math.round(length * 3))), length };
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
  /** Etiketin bağlandığı nokta: gövdenin üstünün ortası (dünya). */
  readonly top: Vector3;
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

/** Kesim altlığı: açık temada açık, koyu temada koyu (modeller aynı kalır). */
const MAT = {
  light: { fill: '#e9ebe6', thin: 'rgba(80, 96, 110, 0.10)', thick: 'rgba(80, 96, 110, 0.22)' },
  dark: { fill: '#1f262d', thin: 'rgba(170, 186, 200, 0.08)', thick: 'rgba(170, 186, 200, 0.18)' },
} as const;

function matTexture(dark = false): CanvasTexture {
  // Kesim altlığı: 1 birim (2,54 mm) aralıklı ince, 10 birimde kalın çizgiler.
  const colors = dark ? MAT.dark : MAT.light;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 400;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colors.fill;
  ctx.fillRect(0, 0, 400, 400);
  ctx.strokeStyle = colors.thin;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 40, 0);
    ctx.lineTo(i * 40, 400);
    ctx.moveTo(0, i * 40);
    ctx.lineTo(400, i * 40);
    ctx.stroke();
  }
  ctx.strokeStyle = colors.thick;
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
  private dark = false;
  /** Kullanıcı kamerayı elle oynattı mı (oynatmadıysa alan değişince yeniden sığdırılır). */
  private userMoved = false;
  private lastView: CameraView = 'free';
  private plan: BreadboardPlan | null = null;
  /** Kablolar: önce plan.leads, sonra plan.jumpers sırasıyla. */
  private cablePaths: CablePath[] = [];
  /** Masadaki parçalardan gelen kabloların eğrileri ve engelleri (denetim: `cableHits`). */
  private leadCurves: CubicBezierCurve3[] = [];
  private leadObstacles: Obstacle[][] = [];
  private cableAmps = new Float64Array(0);
  private cablePhases = new Float64Array(0);
  private readonly dotMaterial = new MeshBasicMaterial({ color: '#ffd43b' });
  private readonly dots = new InstancedMesh(new SphereGeometry(DOT_RADIUS, 10, 8), this.dotMaterial, MAX_DOTS);
  private dotsOn = true;
  private electronFlow = false;
  /** Duraklatılınca noktalar yerinde durur (şemadaki gibi). */
  private running = false;
  private overlay: HTMLElement | null = null;
  private readonly overlayObserver = new MutationObserver(() => (this.dirty = true));
  private drag: { id: string; x: number; start: number; position: number } | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  /** Son kare süresi (ms) ve çizim sayısı: performans taraması okur. */
  stats = { frames: 0, renderMs: 0 };

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: BenchCallbacks,
  ) {
    this.renderer = createRenderer(container);
    const canvas = this.renderer.domElement;
    // Işık ve arka plan Karta aktar'ın kart sahnesiyle ortak (stage.ts).
    this.pmrem = lightScene(this.scene, this.renderer);

    const texture = matTexture();
    texture.repeat.set(200, 200);
    this.table = new Mesh(new PlaneGeometry(2000, 2000), new MeshStandardMaterial({ map: texture, roughness: 0.92 }));
    this.table.rotation.x = -Math.PI / 2;
    this.scene.add(this.table);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.scene.add(this.ring, this.boards, this.partsGroup, this.cables, this.dots);

    // Fare eşlemesi stage.ts'te (sol kaydırır, orta / sağ döndürür). Tıklama (sürüklemeden) seçer.
    this.controls = createControls(this.camera, canvas, { min: 8, max: 900 });
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => {
      this.userMoved = true;
      this.cb.onCamera?.();
    });

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);

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
    if (this.fitted && !this.userMoved) this.fit(this.lastView);
    this.dirty = true;
  }

  // --- Etiket katmanı ve akım noktaları -------------------------------------------------------------

  /**
   * HTML etiket katmanı: içindeki [data-anchor] öğeleri her çizimden sonra parçanın (data-id) ya da
   * ucunun (data-pin) ekran konumuna taşınır. İçerik değişince (React) yeniden konumlanır.
   */
  setOverlay(el: HTMLElement | null): void {
    this.overlayObserver.disconnect();
    this.overlay = el;
    if (el) this.overlayObserver.observe(el, { childList: true, subtree: true, characterData: true });
    this.dirty = true;
  }

  /** Akım noktaları açık mı (Ayarlar → Akım noktaları; 3B'deki Akım düğmesi), elektron yönü ve simülasyon ilerliyor mu. */
  setDots(on: boolean, electronFlow: boolean, running: boolean): void {
    this.dotsOn = on;
    this.electronFlow = electronFlow;
    this.running = running;
    this.applyFrame();
  }

  private positionOverlay(): void {
    const el = this.overlay;
    if (!el) return;
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // Önce boyutlar okunur, sonra yazılır (düzen bir kez hesaplanır). Öncelik: uç harfleri, seçili
    // parça, ölçü aletleri, öbürleri; çakışan etiketlerden önceliği düşük olan gizlenir. Katmandaki
    // engellerle ([data-obstacle]: telefonda hareket ipucu) çakışan etiket de gizlenir.
    const items = [...el.querySelectorAll<HTMLElement>('[data-anchor]')].map((node) => ({
      node,
      w: node.offsetWidth,
      h: node.offsetHeight,
      priority: Number(node.dataset.priority ?? 0),
    }));
    items.sort((a, b) => b.priority - a.priority);
    const taken: Array<{ x0: number; y0: number; x1: number; y1: number }> = [...el.querySelectorAll<HTMLElement>('[data-obstacle]')].map((o) => ({
      x0: o.offsetLeft,
      y0: o.offsetTop,
      x1: o.offsetLeft + o.offsetWidth,
      y1: o.offsetTop + o.offsetHeight,
    }));
    const p = new Vector3();
    const toScreen = (world: Vector3) => {
      p.copy(world).project(this.camera);
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, z: p.z };
    };
    // Uç harfleri: bacaklar ekranda çok yakınsa harfler aynı doğru üstünde en az 28 px arayla açılır.
    const pinSpots = new Map<HTMLElement, { x: number; y: number; z: number }>();
    const pinNodes = items.filter((i) => i.node.dataset.pin !== undefined).map((i) => i.node);
    for (const id of new Set(pinNodes.map((n) => n.dataset.id ?? ''))) {
      const placed = this.parts.get(id);
      const nodes = pinNodes.filter((n) => n.dataset.id === id);
      if (!placed) continue;
      const spots = nodes.map((n) => {
        const a = placed.anchors[Number(n.dataset.pin)] ?? placed.top;
        return toScreen(new Vector3(a.x, Math.max(a.y, BB.height) + 2.2, a.z));
      });
      const first = spots[0]!;
      const last = spots[spots.length - 1]!;
      const span = Math.hypot(last.x - first.x, last.y - first.y);
      const gap = 28 * (spots.length - 1);
      if (spots.length > 1 && span < gap) {
        const cx = spots.reduce((s, q) => s + q.x, 0) / spots.length;
        const cy = spots.reduce((s, q) => s + q.y, 0) / spots.length;
        const dx = span > 1 ? (last.x - first.x) / span : 1;
        const dy = span > 1 ? (last.y - first.y) / span : 0;
        spots.forEach((q, k) => {
          const t = (k - (spots.length - 1) / 2) * 28;
          q.x = cx + dx * t;
          q.y = cy + dy * t;
        });
      }
      nodes.forEach((n, k) => pinSpots.set(n, spots[k]!));
    }
    for (const item of items) {
      const { node } = item;
      const placed = this.parts.get(node.dataset.id ?? '');
      const pin = node.dataset.pin;
      const world = placed ? (pin !== undefined ? placed.anchors[Number(pin)] : placed.top) : undefined;
      let show = false;
      if (world) {
        const { x, y, z } = pinSpots.get(node) ?? toScreen(world);
        const box = pin !== undefined ? { x0: x - item.w / 2, y0: y - item.h / 2 } : { x0: x - item.w / 2, y0: y - item.h - 4 };
        const rect = { ...box, x1: box.x0 + item.w, y1: box.y0 + item.h };
        const inView = z > -1 && z < 1 && rect.x1 > 0 && rect.y1 > 0 && rect.x0 < w && rect.y0 < h;
        const clash = pin === undefined && taken.some((r) => rect.x0 < r.x1 && rect.x1 > r.x0 && rect.y0 < r.y1 && rect.y1 > r.y0);
        if (inView && !clash) {
          show = true;
          if (pin === undefined) taken.push(rect);
          node.style.transform = `translate(${Math.round(rect.x0)}px, ${Math.round(rect.y0)}px)`;
        }
      }
      node.style.opacity = show ? '1' : '0';
    }
  }

  /** Noktaları akım yönünde ilerletir ve yerleştirir; hareket eden nokta varsa true. */
  private updateDots(dt: number): boolean {
    const matrix = new Matrix4();
    const at = new Vector3();
    let count = 0;
    let moving = false;
    const show = this.dotsOn && this.active && this.frame !== null;
    const direction = this.electronFlow ? -1 : 1;
    for (let i = 0; show && i < this.cablePaths.length; i++) {
      const amps = this.cableAmps[i] ?? 0;
      const speed = dotSpeed(amps) * DOT_SPEED;
      if (speed === 0) continue;
      moving = true;
      const path = this.cablePaths[i]!;
      const step = this.running ? direction * Math.sign(amps) * speed * dt : 0;
      const phase = (((this.cablePhases[i]! + step) % DOT_SPACING) + DOT_SPACING) % DOT_SPACING;
      this.cablePhases[i] = phase;
      const last = path.points.length - 1;
      for (let s = phase; s < path.length && count < MAX_DOTS; s += DOT_SPACING) {
        const f = (s / path.length) * last;
        const k = Math.min(last - 1, Math.floor(f));
        at.lerpVectors(path.points[k]!, path.points[k + 1]!, f - k);
        matrix.makeTranslation(at.x, at.y, at.z);
        this.dots.setMatrixAt(count++, matrix);
      }
    }
    if (count !== this.dots.count || count > 0) {
      this.dots.count = count;
      this.dots.instanceMatrix.needsUpdate = true;
      this.dirty = true;
    }
    return moving && this.running;
  }

  /** Koyu tema: arka plan ve masa koyu; ışık ve modeller aynı kalır. */
  setTheme(dark: boolean): void {
    if (dark === this.dark) return;
    this.dark = dark;
    this.scene.background = new Color(dark ? BACKGROUND.dark : BACKGROUND.light);
    const material = this.table.material as MeshStandardMaterial;
    const old = material.map;
    const texture = matTexture(dark);
    texture.repeat.set(200, 200);
    material.map = texture;
    material.needsUpdate = true;
    old?.dispose();
    this.dirty = true;
  }

  /** Denetim (ios-kontrol): masadaki bir parçanın gövdesinin içinden geçen kablo sayısı. */
  cableHits(): number {
    return this.leadCurves.filter((curve, i) => collisions(curve, this.leadObstacles[i] ?? []).length > 0).length;
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
        this.fit(this.lastView);
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
    this.plan = plan;
    const paths: CablePath[] = [];
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
    const jumperPaths: CablePath[] = [];
    for (const j of plan.jumpers) {
      const jumper = jumperMesh(holeTop(j.a), holeTop(j.b), colorOf(j.net));
      this.cables.add(jumper);
      jumperPaths.push(cablePath(jumper.userData.curve as Curve<Vector3>));
    }
    const plug = new BoxGeometry(0.75, 1.5, 0.75);
    const plugMat = mat('#1b1c1f', 0.6);
    // Masadaki parçaların gövdeleri: kablolar içlerinden geçmez (pilin uzak ucundan çıkan kablo üstünden aşar).
    const bodies = [...plan.table.keys()].flatMap((id) => {
      const placed = this.parts.get(id);
      return placed ? [{ id, box: new Box3().setFromObject(placed.model.root) }] : [];
    });
    this.leadObstacles = [];
    this.leadCurves = [];
    for (const lead of plan.leads) {
      const placed = this.parts.get(lead.partId);
      const from = placed?.anchors[lead.pin];
      if (!from) {
        paths.push({ points: [], length: 0 });
        continue;
      }
      const to = holeTop(lead.hole);
      const color = colorOf(lead.net);
      const a1 = from.clone().add(new Vector3(0, 1.4, 0));
      const b1 = to.clone().add(new Vector3(0, 1.5, 0));
      const dist = a1.distanceTo(b1);
      const obstacles: Obstacle[] = bodies.map((b) => ({ box: b.box, own: b.id === lead.partId }));
      this.leadObstacles.push(obstacles);
      const curve = leadCurve(a1, b1, obstacles);
      this.leadCurves.push(curve);
      paths.push(cablePath(curve));
      this.cables.add(new Mesh(new TubeGeometry(curve, Math.max(12, Math.round(dist * 1.5)), 0.28, 8, false), mat(color, 0.55)));
      this.cables.add(mesh(plug, plugMat, from.x, from.y + 0.75, from.z));
      this.cables.add(mesh(plug, plugMat, to.x, to.y + 0.75, to.z));
      this.cables.add(rod(new Vector3(to.x, to.y - HOLE_DEPTH, to.z), to, 0.1, M.tin(), 6));
    }
    this.cablePaths = [...paths, ...jumperPaths];
    this.cableAmps = new Float64Array(this.cablePaths.length);
    this.cablePhases = new Float64Array(this.cablePaths.length);
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
    const top = new Vector3(center.x, box.max.y + 0.6, center.z);
    return { key: partKey(part), part, model, group, shadow, anchors, top };
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
        reading: this.frame?.meterTexts.get(id),
        scope: this.frame?.scopes.get(id),
        props: placed.part.props,
        active: this.active && this.frame !== null,
        now,
        dt,
      });
      if (more) animating = true;
    }
    // Kablo akımları (akım noktaları): breadboard grupları için Kirchhoff akım kuralı (cableFlow.ts).
    if (this.plan && this.frame && this.active && this.dotsOn) {
      const { leads, jumpers } = cableCurrents(this.plan, this.frame.pinFlows);
      this.cableAmps = Float64Array.from([...leads, ...jumpers]);
    } else {
      this.cableAmps = new Float64Array(this.cablePaths.length);
    }
    if (this.updateDots(0)) animating = true;
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

  /** Bütün devre görünsün: Serbest (önden ve yukarıdan, 52°), Üstten ya da Önden (alçaktan). */
  fit(view: CameraView = 'free'): void {
    this.lastView = view;
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
    const distance = (radius / Math.tan(fov / 2)) * (aspect < 1 ? 1.15 / aspect : 1.05) * (view === 'front' ? 1.12 : 1);
    const elevation = ELEVATION[view];
    this.controls.target.copy(center).setY(0);
    this.camera.position.set(center.x, distance * Math.sin(elevation), center.z + distance * Math.cos(elevation));
    this.camera.near = Math.max(0.5, distance / 200);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.dirty = true;
  }

  /** Seçiliye yaklaş: parça kadrajın ortasında, yakından; bakış yönü (azimut) korunur. */
  focus(partId: string): void {
    const placed = this.parts.get(partId);
    if (!placed) return;
    const box = new Box3().setFromObject(placed.group);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const distance = Math.max(30, 5 * Math.max(size.x, size.y, size.z));
    const azimuth = Math.atan2(this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z);
    const elevation = (40 * Math.PI) / 180;
    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      center.y + distance * Math.sin(elevation),
      center.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.camera.near = Math.max(0.3, distance / 200);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.userMoved = true;
    this.dirty = true;
  }

  /** Yakınlaştır (factor < 1) ya da uzaklaştır (> 1): kamera hedefe doğru yaklaşır. */
  zoom(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const length = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, offset.length() * factor));
    this.camera.position.copy(this.controls.target).add(offset.setLength(length));
    this.controls.update();
    this.userMoved = true;
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
    if (this.animating) {
      this.applyFrame();
      this.updateDots(Math.min(0.1, (now - this.lastTime) / 1000));
    }
    this.lastTime = now;
    if (!(this.dirty || moved || this.animating)) return;
    this.dirty = false;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.positionOverlay();
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
    this.overlayObserver.disconnect();
    this.dots.geometry.dispose();
    this.dotMaterial.dispose();
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

