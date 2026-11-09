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
  OrthographicCamera,
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
import { pinKey } from '../model/connectivity';
import type { CircuitDoc, Part } from '../model/types';
import { BB, boardWidth, boardZ, holeXZ, netColors, planBreadboard, type BoardPart, type BreadboardPlan, type Hole, type TablePart } from './breadboard';
import { HOLE_DEPTH, breadboardMesh, jumperMesh } from './breadboardModel';
import { collisions, leadCurve, socketCurve, type Obstacle } from './leadRoute';
import { cableCurrents } from './cableFlow';
import { CLIP_DEVICES, clipGroups } from './clipPlan';
import { clipMesh, stubMesh } from './clipModel';
import { CABLE_RADIUS, CLIP, PLUG, clipPose, clipTail, clippedPlan, jumperShapes, layoutClips, type BoardBody, type ClipLayout } from './clips';
import { M, mat, mergeStatic, mesh, rod } from './kit';
import type { PartModel } from './model';
import { holeAt, placeBoardPart, placeTablePart, type Placement } from './placement';
import { BACKGROUND, createControls, createRenderer, lightScene, radialTexture } from './stage';

export interface BenchCallbacks {
  onSelect(partId: string | null): void;
  /** Anahtar: simülasyon çalışırken tıklanınca açılıp kapanır. */
  onToggle(partId: string): void;
  /** Potansiyometre düğmesi sürükleniyor: yeni konum (%); done: bırakıldı. */
  onKnob(partId: string, position: number, done: boolean): void;
  /** Basmalı düğme: simülasyon çalışırken basıldı (down) ya da bırakıldı. */
  onPress(partId: string, down: boolean): void;
  /** Kullanıcı kamerayı elle oynattı (kamera menüsü "Serbest"e döner). */
  onCamera?(): void;
  /** Tepeden görünüm (Tahtada kur) kaydırıldı, yakınlaştı ya da boyutu değişti. */
  onView?(): void;
  /** Bir ağın kabloları vurgulandı (kablonun ya da kıskacın üstüne gelince, telefonda dokununca) ya da vurgu kalktı (null). */
  onNet?(net: string | null): void;
}

/** Tepeden görünümde ekran = dünya · scale + (ox, oy) (piksel; x sağa, z aşağı). */
export interface TopTransform {
  readonly scale: number;
  readonly ox: number;
  readonly oy: number;
}

/** Tepeden görünümde sığdırırken boş bırakılacak kenarlar (piksel; üst çubuk, araç çubuğu). */
export interface TopInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  /** Telefonda (T5): yalnızca tahtanın yüksekliğine sığdırılır, sol kenarı görünür; tahta yatay kaydırılır, masadaki aletler ekran dışında. */
  readonly boardOnly?: boolean;
}

/**
 * Kamera görünümleri: Serbest (önden ve yukarıdan, 52°; masa üstü cihaz varsa 40° ve tahtaya odaklı), Üstten,
 * Önden (alçaktan), Cihazlar (masa üstü cihazların ön panelleri, alçaktan).
 */
export type CameraView = 'free' | 'top' | 'front' | 'bench';
const ELEVATION: Record<CameraView, number> = {
  free: (52 * Math.PI) / 180,
  top: Math.PI * 0.47,
  front: (14 * Math.PI) / 180,
  bench: (12 * Math.PI) / 180,
};
/** Bundan yüksek parça (birim) masa üstü cihaz sayılır. */
const TALL = 12;

/** Kutunun sekiz köşesi. */
function boxCorners(b: Box3): Vector3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
}

/**
 * Masa üstü cihaz varken Serbest: yükseklik açısı (alçaldıkça tahta daha az yer kaplar, arkadaki ön paneller
 * daha çok görünür; telefonun 3B alanı kısa) ve tahtanın kadraj genişliğindeki payı.
 */
const BENCH_FREE = { desktop: { elevation: (36 * Math.PI) / 180, share: 0.47 }, phone: { elevation: (30 * Math.PI) / 180, share: 0.72 } };
/** Bu genişlikten dar tuval telefon sayılır (px). */
const PHONE_WIDTH = 640;

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
  /** Kabloların bağlandığı uçlar (dünya koordinatı); Tepeden görünümde ön soketli cihazlarda `compact`. */
  anchors: Vector3[];
  /** Uçların gerçek yeri (3B). */
  readonly real: Vector3[];
  /** Tepeden görünümde ön soketli cihazın uçları: tahtanın arkasında sıkışık sırada (yoksa null). */
  compact: Vector3[] | null;
  /** Ön paneldeki soketlerin dışa baktığı yön (dünya); yoksa kablo uçtan dik kalkar. */
  readonly dirs: readonly (Vector3 | undefined)[];
  /** Etiketin bağlandığı nokta: gövdenin üstünün ortası (dünya). */
  readonly top: Vector3;
  /** Soketlerin rengi (cihaz kablosu bu renkte; modelde varsa). */
  readonly colors: readonly (string | undefined)[];
  /** Bütün modelin ve bacaksız gövdenin kutusu (dünya, yerleşirken). */
  readonly box: Box3;
  readonly body: Box3;
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
  /** Tahtada kur → Tepeden: dik (ortografik) kamera, tam tepeden; yörünge denetimi kapalı. */
  private readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  /** Tepeden görünüm: ekranın ortasındaki dünya noktası ve ölçek (piksel / birim); null: 3B kamera. */
  private topView: { cx: number; cz: number; scale: number } | null = null;
  /** Tepeden sığdırma kartlar DOM'a gelmeden yapıldı (3B gövdelerle): kartlar gelince bir kez yeniden. */
  private topFitPending = false;
  private topInsets: TopInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  private interactive = true;
  private readonly controls: OrbitControls;
  private readonly pmrem: PMREMGenerator;
  private readonly parts = new Map<string, Placed>();
  /** Parçanın gövde kutusu (dünya); yerleşim değişince parçalar yeniden kurulur, önbellek kendiliğinden boşalır. */
  private readonly bodyBoxes = new WeakMap<Placed, Box3>();
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
  /** Multimetrelerin Ω okuması (simülasyon durmuşken). */
  private ohmTexts: ReadonlyMap<string, string> | null = null;
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
  /** Telefonda Cihazlar görünümünün yaklaştığı cihaz (soldan sıra; −1: henüz seçilmedi). */
  private benchIndex = -1;
  /** Cihazlar görünümünde (kamera oynatılana dek) yalnızca bu parçaların (masa üstü cihazlar) etiketi gösterilir. */
  private benchLabels: ReadonlySet<string> | null = null;
  private plan: BreadboardPlan | null = null;
  /** Kablolar: önce plan.leads, sonra plan.jumpers sırasıyla. */
  private cablePaths: CablePath[] = [];
  /** Masadaki parçalardan gelen kabloların eğrileri ve engelleri (denetim: `cableHits`). */
  private leadCurves: Curve<Vector3>[] = [];
  /** Son kurulan belge ve Tahtada kur kurulumu (Tepeden görünüme geçince kablolar yeniden kurulur). */
  private lastDoc: CircuitDoc | null = null;
  private lastOverride: BreadboardPlan | null = null;
  /** Cihaz kablolarının kıskaçları (3B; Tepeden görünümde yok: kablolar deliklere iner). */
  private clipLayout: ClipLayout | null = null;
  /** Akım noktaları için plan: cihaz kablolarının delikleri kıskacın tuttuğu yerinki. */
  private flowPlan: BreadboardPlan | null = null;
  /** Birleşme noktaları (ağ → dünya noktası): HTML katmanındaki [data-anchor="junction"] etiketleri. */
  private junctionAt = new Map<string, Vector3>();
  /** Vurgulanan ağ, bacaklarının işaretleri ve malzemelerin soluk / parlak kopyaları. */
  private highlighted: string | null = null;
  private readonly legGlow = new Group();
  private readonly dimmed = new Map<Material, Material>();
  private readonly lit = new Map<Material, Material>();
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
  /** Basılı tutulan düğme. */
  private pressing: string | null = null;
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
    this.scene.add(this.ring, this.boards, this.partsGroup, this.cables, this.dots, this.legGlow);

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
    canvas.addEventListener('pointerleave', this.onPointerLeave);

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
    if (this.topView) this.applyTop();
    this.dirty = true;
  }

  /** Çizimde ve seçimde kullanılan kamera. */
  private get view(): PerspectiveCamera | OrthographicCamera {
    return this.topView ? this.ortho : this.camera;
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
    if (this.topFitPending && this.topView && el.querySelector('[data-anchor="footprint"]')) {
      this.topFitPending = false;
      this.fitTop();
    }
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
    // Tuvalin üstüne binen denetimler ([data-label-obstacle]: telefonda sol üstteki Şema | 3B): üst kenara inen
    // etiket bunların altına girmez.
    const c = canvas.getBoundingClientRect();
    for (const o of document.querySelectorAll<HTMLElement>('[data-label-obstacle]')) {
      const r = o.getBoundingClientRect();
      if (r.width > 0 && r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom) {
        taken.push({ x0: r.left - c.left, y0: r.top - c.top, x1: r.right - c.left, y1: r.bottom - c.top });
      }
    }
    const p = new Vector3();
    const toScreen = (world: Vector3) => {
      p.copy(world).project(this.view);
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, z: p.z };
    };
    // Uç harfleri: bacaklar ekranda çok yakınsa harfler aynı doğru üstünde en az 28 px arayla açılır.
    const pinSpots = new Map<HTMLElement, { x: number; y: number; z: number }>();
    // Tepeden görünümde masadaki parçanın kartı (data-anchor="footprint"): gövdenin ekrandaki genişliğinde
    // (en az data-minw piksel), alt kenarı uçların 24 px altında, yüksekliği data-h piksel.
    for (const item of items.filter((i) => i.node.dataset.anchor === 'footprint')) {
      const placed = this.parts.get(item.node.dataset.id ?? '');
      if (!placed) continue;
      const box = this.cardBox(placed);
      const corners = [box.min, box.max, new Vector3(box.min.x, box.max.y, box.max.z), new Vector3(box.max.x, box.min.y, box.min.z)].map(toScreen);
      const left = Math.min(...corners.map((c) => c.x));
      const right = Math.max(...corners.map((c) => c.x));
      const width = Math.max(right - left, Number(item.node.dataset.minw ?? 0));
      const pins = placed.anchors.map(toScreen);
      const bottom = (pins.length > 0 ? Math.max(...pins.map((q) => q.y)) : Math.max(...corners.map((c) => c.y))) + 24;
      const height = Number(item.node.dataset.h ?? bottom - Math.min(...corners.map((c) => c.y)));
      const st = item.node.style;
      st.transform = `translate(${Math.round((left + right) / 2 - width / 2)}px, ${Math.round(bottom - height)}px)`;
      st.width = `${Math.round(width)}px`;
      st.height = `${Math.round(height)}px`;
      st.opacity = '1';
    }
    // Uç harfleri (data-exact: tam ucun üstünde, aralanmaz; Tepeden görünümde cihaz uçları).
    const pinNodes = items.filter((i) => i.node.dataset.pin !== undefined && i.node.dataset.exact === undefined).map((i) => i.node);
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
      if (node.dataset.anchor === 'footprint') continue;
      const placed = this.parts.get(node.dataset.id ?? '');
      const pin = node.dataset.pin;
      // Birleşme noktasının etiketi (ağın adı ve kablo sayısı): ilk kıskacın ağzının biraz üstünde.
      const junction = node.dataset.anchor === 'junction' ? this.junctionAt.get(node.dataset.net ?? '') : undefined;
      const world = placed ? (pin !== undefined ? placed.anchors[Number(pin)] : placed.top) : junction?.clone().setY(junction.y + 1.5);
      let show = false;
      // Cihazlar görünümünde devre parçalarının etiketleri cihazların ön panellerini örterdi.
      const hidden = this.benchLabels !== null && !this.userMoved && (placed === undefined || !this.benchLabels.has(placed.part.id));
      if (world && !hidden) {
        const { x, y, z } = pinSpots.get(node) ?? toScreen(world);
        if (node.dataset.exact !== undefined) {
          node.style.transform = `translate(${Math.round(x - item.w / 2)}px, ${Math.round(y - item.h / 2)}px)`;
          node.style.opacity = z > -1 && z < 1 ? '1' : '0';
          continue;
        }
        // Parça etiketi: önce ucun üstünde; başka bir etiketle (4 px aralı) çakışırsa sağında, solunda, bir
        // kat yukarıda ya da altında; hiçbiri olmazsa gizlenir. Uç harfi her zaman ucun üstünde.
        const spots =
          pin !== undefined
            ? [{ x0: x - item.w / 2, y0: y - item.h / 2 }]
            : [
                { x0: x - item.w / 2, y0: y - item.h - 4 },
                { x0: x + 6, y0: y - item.h - 4 },
                { x0: x - item.w - 6, y0: y - item.h - 4 },
                { x0: x - item.w / 2, y0: y - 2 * item.h - 12 },
                { x0: x - item.w / 2, y0: y + 8 },
              ];
        // Varsayılan kadrajda arkadaki cihazların üstü kırpılır: etiketin noktası görüntünün üstünde kalınca
        // etiket üst kenara, gövdenin görünen kısmının üstüne iner (iki sıra). Gövdenin görünen genişliği etiketin
        // yarısından azsa (cihaz kadrajın kenarında) etiket başka cihazın üstüne kaymasın diye gösterilmez.
        // Parça etiketi üst kenardan taşmaz.
        if (pin === undefined && placed && y - item.h - 4 < 0) {
          const body = this.screenBox(placed, toScreen);
          const lo = Math.max(body.x0, 0);
          const hi = Math.min(body.x1, w);
          if (hi - lo >= item.w / 2 && body.y1 > item.h + 8) {
            const x0 = Math.max(4, Math.min(Math.max(x - item.w / 2, lo), hi - item.w, w - item.w - 4));
            spots.push({ x0, y0: 4 }, { x0, y0: item.h + 12 });
          }
        }
        const GAP = 4;
        for (const box of spots) {
          const rect = { ...box, x1: box.x0 + item.w, y1: box.y0 + item.h };
          const inView = z > -1 && z < 1 && rect.x1 > 0 && (pin === undefined ? rect.y0 >= 0 : rect.y1 > 0) && rect.x0 < w && rect.y0 < h;
          const clash = pin === undefined && taken.some((r) => rect.x0 < r.x1 + GAP && rect.x1 > r.x0 - GAP && rect.y0 < r.y1 + GAP && rect.y1 > r.y0 - GAP);
          if (!inView || clash) continue;
          show = true;
          if (pin === undefined) taken.push(rect);
          node.style.transform = `translate(${Math.round(rect.x0)}px, ${Math.round(rect.y0)}px)`;
          break;
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

  /** Denetim (ios-kontrol): tahtanın (kullanılan bölümü) tuvaldeki dikdörtgeni (px). */
  boardRect(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (this.boardView.isEmpty()) return null;
    const canvas = this.renderer.domElement;
    const pts = boxCorners(this.boardView).map((c) => c.project(this.view));
    const xs = pts.map((q) => ((q.x + 1) / 2) * canvas.clientWidth);
    const ys = pts.map((q) => ((1 - q.y) / 2) * canvas.clientHeight);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }

  /** Denetim (ios-kontrol): masa üstü cihazların tuvaldeki dikdörtgenleri (px), parça kimliğiyle. */
  deviceRects(): Array<{ id: string; x0: number; y0: number; x1: number; y1: number }> {
    const canvas = this.renderer.domElement;
    return [...this.parts.values()].flatMap((placed) => {
      const box = new Box3().setFromObject(placed.group);
      if (box.max.y <= TALL) return [];
      const pts = boxCorners(box).map((c) => c.project(this.view));
      const xs = pts.map((q) => ((q.x + 1) / 2) * canvas.clientWidth);
      const ys = pts.map((q) => ((1 - q.y) / 2) * canvas.clientHeight);
      return [{ id: placed.part.id, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }];
    });
  }

  /** Parça gövdesinin ekrandaki dikdörtgeni (px); dünya kutusu parça başına bir kez hesaplanır. */
  private screenBox(placed: Placed, toScreen: (world: Vector3) => { x: number; y: number }): { x0: number; y0: number; x1: number; y1: number } {
    let box = this.bodyBoxes.get(placed);
    if (!box) this.bodyBoxes.set(placed, (box = new Box3().setFromObject(placed.group)));
    const pts = boxCorners(box).map((q) => toScreen(q));
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }

  /**
   * Denetim (ios-kontrol): tahtadaki dolu delikler (bacaklar, köprüler, kıskaçsız kablolar, kısa teller) ve iki
   * şey takılı delik sayısı; cihaz kablolarının kıskaçları (bacak, kısa tel, zincir) ve birleşme noktaları.
   */
  clipReport(): { holes: number; doubled: number; clips: Array<{ part: string; pin: number; kind: string; net: string }>; plugged: number; junctions: Array<{ net: string; count: number }> } {
    const plan = this.plan;
    const layout = this.clipLayout;
    if (!plan) return { holes: 0, doubled: 0, clips: [], plugged: 0, junctions: [] };
    const key = (h: Hole) => (h.kind === 'strip' ? `${h.board}:s${h.col}:${h.row}` : `${h.board}:r${h.rail}:${h.k}`);
    const all = [
      ...[...plan.onBoard.values()].flatMap((p) => [...p.holes, ...(p.extraHoles ?? [])]),
      ...plan.jumpers.flatMap((j) => [j.a, j.b]),
      ...plan.leads.filter((_, i) => !layout?.clips.has(i)).map((l) => l.hole),
      ...(layout?.stubs ?? []).map((s) => s.hole),
    ].map(key);
    const devices = plan.leads.flatMap((l, i) => (CLIP_DEVICES.has(this.parts.get(l.partId)?.part.type ?? 'ground') ? [i] : []));
    return {
      holes: new Set(all).size,
      doubled: all.length - new Set(all).size,
      clips: [...(layout?.clips.values() ?? [])].map((c) => ({ part: plan.leads[c.lead]!.partId, pin: plan.leads[c.lead]!.pin, kind: c.kind, net: c.net })),
      plugged: devices.filter((i) => !layout?.clips.has(i)).length,
      junctions: [...this.junctionAt.keys()].map((net) => ({ net, count: layout?.junctions.find((j) => j.net === net)?.count ?? 0 })),
    };
  }

  /** Denetim (ios-kontrol): masadaki bir parçanın gövdesinin içinden geçen kablo sayısı. */
  cableHits(): number {
    return this.leadCurves.filter((curve, i) => collisions(curve, this.leadObstacles[i] ?? []).length > 0).length;
  }

  /** Dokunmaya (çekmece açıkken) kapalı: tuval sayfa kaydırmasına izin verir. */
  setInteractive(on: boolean): void {
    this.interactive = on;
    this.controls.enabled = on && !this.topView;
    this.renderer.domElement.style.touchAction = on ? 'none' : 'auto';
  }

  // --- Devre --------------------------------------------------------------------------------------

  /** Devre; `override` verilirse (Tahtada kur: öğrencinin kurulumu) tezgâh onunla kurulur. */
  setDoc(doc: CircuitDoc, override: BreadboardPlan | null = null): void {
    const plan = override ?? planBreadboard(doc);
    this.lastOverride = override;
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
      this.lastDoc = doc;
      this.rebuild(doc, plan);
      this.applyTopLook();
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
    if (this.highlighted !== null) this.highlightNet(null);
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
      shadow.userData.shadow = true;
      this.boards.add(shadow);
    }
    for (const part of doc.parts) {
      const onBoard = plan.onBoard.get(part.id);
      const table = plan.table.get(part.id);
      if (onBoard) this.parts.set(part.id, this.placeOnBoard(part, onBoard, plan.cols));
      else if (table) this.parts.set(part.id, this.placeOnTable(part, table));
    }
    this.compactInstruments(plan);
    // Renkler: ağ başına (toprak siyah, besleme kırmızı, öbürleri sırayla; lehim rehberiyle aynı).
    const colorOf = netColors(plan);
    const holeTop = (h: Hole) => holeAt(h, plan.cols, BB.height);
    const jumperPaths: CablePath[] = [];
    // Kıskaçlı cihaz kablolarının fişi yok; jumper telleri birbirinin ve fişlerin içinden geçmez (clips.ts).
    const clipLeads = new Set(this.topView ? [] : clipGroups(doc, plan, this.lastOverride === null).flatMap((g) => g.leads));
    const shapes = jumperShapes(plan, clipLeads);
    for (const [i, j] of plan.jumpers.entries()) {
      const jumper = jumperMesh(holeTop(j.a), holeTop(j.b), j.color ?? colorOf(j.net), shapes[i]);
      this.cables.add(this.netTag(jumper, j.net));
      jumperPaths.push(cablePath(jumper.userData.curve as Curve<Vector3>));
    }
    const plug = new BoxGeometry(PLUG.width, PLUG.height, PLUG.width);
    const plugMat = mat('#1b1c1f', 0.6);
    // Masadaki parçaların gövdeleri: kablolar içlerinden geçmez (pilin uzak ucundan çıkan kablo üstünden aşar).
    const bodies = [...plan.table.keys()].flatMap((id) => {
      const placed = this.parts.get(id);
      return placed ? [{ id, box: new Box3().setFromObject(placed.model.root) }] : [];
    });
    // Cihaz kabloları timsah kıskaçla biter (clips.ts): kıskaç bacağı ya da kısa dik telin ucunu tutar, aynı ağdakiler
    // zincirlenir. Tepeden görünümde (Tahtada kur) kablolar eskisi gibi deliklere iner.
    const layout = this.topView ? null : layoutClips({ doc, plan, chain: this.lastOverride === null, bodies: this.boardBodies(plan), shapes, socket: (i) => {
      const lead = plan.leads[i]!;
      return this.parts.get(lead.partId)?.anchors[lead.pin];
    } });
    this.clipLayout = layout;
    this.flowPlan = layout ? clippedPlan(plan, layout) : plan;
    this.junctionAt = new Map((layout?.junctions ?? []).map((j) => [j.net, j.at]));
    this.leadObstacles = [];
    this.leadCurves = [];
    const leadColor = new Map<number, string>();
    plan.leads.forEach((lead, i) => {
      const placed = this.parts.get(lead.partId);
      const from = placed?.anchors[lead.pin];
      if (!placed || !from) {
        paths.push({ points: [], length: 0 });
        return;
      }
      const clip = layout?.clips.get(i);
      // Cihaz kablosu soketin renginde (renksiz BNC'de ağın renginde); öbürleri ağın renginde.
      const color = lead.color ?? (clip ? placed.colors[lead.pin] : undefined) ?? colorOf(lead.net);
      leadColor.set(i, color);
      const to = clip ? clipTail(clip) : holeTop(lead.hole);
      const dir = placed.dirs[lead.pin];
      const b1 = clip ? to : to.clone().add(new Vector3(0, 1.5, 0));
      // Ön paneldeki soketten çıkan kablo kendi gövdesinden dışarı çıkar: kendi kutusu (öndeki düğmeler,
      // katlanmış kol) engel sayılmaz.
      const obstacles: Obstacle[] = bodies.filter((b) => !(dir && b.id === lead.partId)).map((b) => ({ box: b.box, own: b.id === lead.partId }));
      this.leadObstacles.push(obstacles);
      // Ön paneldeki soket: kablo önce öne çıkar, masaya sarkar; öbür uçlar dik kalkan alçak kavis.
      const a1 = dir ? from.clone().addScaledVector(dir, 1.5) : from.clone().add(new Vector3(0, 1.4, 0));
      const curve = dir ? socketCurve(a1, dir, b1, this.boardBox(plan), clip?.axis) : leadCurve(a1, b1, obstacles);
      this.leadCurves.push(curve);
      paths.push(cablePath(curve));
      this.cables.add(this.netTag(new Mesh(new TubeGeometry(curve, Math.max(16, Math.round(curve.getLength() * 1.5)), CABLE_RADIUS, 8, false), mat(color, 0.55)), lead.net));
      const tip = mesh(plug, plugMat, from.x, from.y + 0.75, from.z);
      if (dir) {
        tip.position.copy(from).addScaledVector(dir, 0.75);
        tip.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      }
      this.cables.add(tip);
      if (clip) {
        this.cables.add(this.netTag(clipMesh(clip, color), lead.net));
        return;
      }
      this.cables.add(this.netTag(mesh(plug, plugMat, to.x, to.y + 0.75, to.z), lead.net));
      this.cables.add(rod(new Vector3(to.x, to.y - HOLE_DEPTH, to.z), to, 0.1, M.tin(), 6));
    });
    // Kısa dik teller: onları tutan (zincirin ilk) kıskacın kablosunun renginde.
    for (const stub of layout?.stubs ?? []) this.cables.add(this.netTag(stubMesh(stub, leadColor.get(stub.lead) ?? colorOf(stub.net)), stub.net));
    // Tahtada kur: takılmamış alet kabloları aletin önünde masaya sarkar (ucundaki kıskaç masada).
    for (const loose of plan.loose ?? []) {
      const placed = this.parts.get(loose.partId);
      const from = placed?.anchors[loose.pin];
      if (!placed || !from) continue;
      const center = new Box3().setFromObject(placed.group).getCenter(new Vector3());
      const socket = placed.dirs[loose.pin];
      const dir = socket ? new Vector3(socket.x, 0, socket.z) : new Vector3(from.x - center.x, 0, from.z - center.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const end = from.clone().addScaledVector(dir, 3.4).setY(0.4);
      const curve = new CubicBezierCurve3(from.clone().add(new Vector3(0, 0.4, 0)), from.clone().addScaledVector(dir, 1.2).add(new Vector3(0, 1.4, 0)), end.clone().addScaledVector(dir, -0.6).add(new Vector3(0, 0.8, 0)), end);
      const color = (CLIP_DEVICES.has(placed.part.type) ? placed.colors[loose.pin] : undefined) ?? loose.color;
      this.cables.add(new Mesh(new TubeGeometry(curve, 16, CABLE_RADIUS, 8, false), mat(color, 0.55)));
      if (CLIP_DEVICES.has(placed.part.type)) {
        // Kıskaç masada yatar: kuyruğu kablonun ucunda, ağzı öne bakar.
        this.cables.add(clipMesh(clipPose(end.clone().addScaledVector(dir, CLIP.length).setY(CLIP.height * 0.39), dir.clone().negate(), 0), color));
      } else {
        const tip = mesh(plug, plugMat, end.x, 0.4, end.z);
        tip.rotation.set(Math.PI / 2, 0, -Math.atan2(dir.x, dir.z));
        this.cables.add(tip);
      }
    }
    this.cablePaths = [...paths, ...jumperPaths];
    this.cableAmps = new Float64Array(this.cablePaths.length);
    this.cablePhases = new Float64Array(this.cablePaths.length);
    this.dirty = true;
  }

  /** Breadboard'a takılan parça: gövde deliklerin arasında, bacaklar deliklere. */
  private placeOnBoard(part: Part, at: BoardPart, cols: number): Placed {
    return this.finishPlacement(part, placeBoardPart(part, at, cols));
  }

  /** Masadaki parça: plandaki yerde; bacakları/uçları kendi modelinde. */
  private placeOnTable(part: Part, at: TablePart): Placed {
    return this.finishPlacement(part, placeTablePart(part, at));
  }

  /** Kablonun (ve alt nesnelerinin) ağı: üstüne gelince o ağ vurgulanır. */
  private netTag<T extends Object3D>(o: T, net: string): T {
    o.userData.net = net;
    return o;
  }

  /** Tahtadaki parçaların kutuları (kıskaçların yerleşimi: clips.ts). */
  private boardBodies(plan: BreadboardPlan): Map<string, BoardBody> {
    const out = new Map<string, BoardBody>();
    for (const id of plan.onBoard.keys()) {
      const placed = this.parts.get(id);
      if (placed) out.set(id, { body: placed.body });
    }
    return out;
  }

  /** Breadboard'ların dünya kutusu (sokete takılı kablo masada sürünürken altına girmesin). */
  private boardBox(plan: BreadboardPlan): Box3 {
    const half = boardWidth(plan.cols) / 2;
    return new Box3(new Vector3(-half, 0, -BB.depth / 2), new Vector3(half, BB.height, boardZ(plan.boards - 1) + BB.depth / 2));
  }

  private finishPlacement(part: Part, placement: Placement): Placed {
    const { model, group, anchors, base, dirs } = placement;
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
    return { key: partKey(part), part, model, group, shadow, anchors, real: anchors, compact: null, dirs, top, colors: placement.colors, box: placement.box, body: placement.body };
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

  setFrame(frame: SimFrame | null, active: boolean, ohmTexts?: ReadonlyMap<string, string>): void {
    this.frame = frame;
    this.active = active;
    this.ohmTexts = ohmTexts ?? null;
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
        reading: this.frame?.meterTexts.get(id) ?? this.ohmTexts?.get(id),
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
      const { leads, jumpers } = cableCurrents(this.flowPlan ?? this.plan, this.frame.pinFlows);
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

  // --- Tepeden görünüm (Tahtada kur) ----------------------------------------------------------------

  /** Tepeden görünüm açık/kapalı. Açılınca tahtaya ve masadaki parçalara sığdırılır. */
  setTop(on: boolean, insets?: TopInsets): void {
    if (insets) this.topInsets = insets;
    if (on === (this.topView !== null)) return;
    this.topView = on ? { cx: 0, cz: 0, scale: 10 } : null;
    // Ön soketli cihazların uçları görünüme göre yer değiştirir: kablolar yeniden kurulur.
    if (this.plan && this.lastDoc && [...this.parts.values()].some((p) => p.dirs.some(Boolean))) {
      this.layoutKey = '';
      this.setDoc(this.lastDoc, this.lastOverride);
    }
    this.controls.enabled = this.interactive && !on;
    this.applyTopLook();
    if (on) this.fitTop();
    else {
      this.dirty = true;
      this.cb.onView?.();
    }
  }

  /**
   * Tepeden görünümde tahtanın tamamı ve masadaki aletlerin kartları görünsün, kullanılabilir alanı
   * doldursun. Aletlerin 3B gövdesi tepeden görünmez (yerinde düz kart var): kartın ekrandaki yeri
   * (positionOverlay: uçların 24 px altından data-h piksel yukarı, en az data-minw piksel genişlik)
   * ölçeğe bağlı olduğu için sığan en büyük ölçek ikili aramayla bulunur.
   */
  fitTop(): void {
    if (!this.topView) return;
    const plan = this.plan;
    const canvas = this.renderer.domElement;
    const { top, right, bottom, left } = this.topInsets;
    const w = Math.max(40, canvas.clientWidth - left - right);
    const h = Math.max(40, canvas.clientHeight - top - bottom);
    if (this.topInsets.boardOnly && plan) {
      const half = boardWidth(plan.cols) / 2;
      const z0 = -BB.depth / 2;
      const z1 = boardZ(plan.boards - 1) + BB.depth / 2;
      const scale = Math.min(60, h / ((z1 - z0) * 1.02));
      const viewW = canvas.clientWidth / scale;
      const viewH = canvas.clientHeight / scale;
      this.topView = { scale, cx: -half - left / scale + viewW / 2 - 0.4, cz: z0 - top / scale + viewH / 2 - ((h / scale - (z1 - z0)) / 2) };
      this.applyTop();
      return;
    }
    const half = plan ? boardWidth(plan.cols) / 2 : 20;
    const z0 = plan ? -BB.depth / 2 : -15;
    const z1 = plan ? boardZ(plan.boards - 1) + BB.depth / 2 : 15;
    // Kartlar: alet, gövdesinin x aralığı, uçlarının en büyük z'si; kartın en küçük genişliği ve yüksekliği (piksel).
    const nodes = this.overlay ? [...this.overlay.querySelectorAll<HTMLElement>('[data-anchor="footprint"]')] : [];
    const cards = (plan ? [...plan.table.keys()] : []).flatMap((id) => {
      const placed = this.parts.get(id);
      if (!placed) return [];
      const box = this.cardBox(placed);
      const node = nodes.find((n) => n.dataset.id === id);
      const pinZ = placed.anchors.length > 0 ? Math.max(...placed.anchors.map((a) => a.z)) : box.max.z;
      return [{ x0: box.min.x, x1: box.max.x, zTop: node ? null : box.min.z, pinZ, minW: Number(node?.dataset.minw ?? 0), h: Number(node?.dataset.h ?? 0) }];
    });
    this.topFitPending = cards.some((c) => c.zTop !== null);
    const bounds = (scale: number) => {
      let xa = -half;
      let xb = half;
      let za = z0;
      let zb = z1;
      for (const c of cards) {
        const width = Math.max(c.x1 - c.x0, c.minW / scale);
        const cx = (c.x0 + c.x1) / 2;
        xa = Math.min(xa, cx - width / 2);
        xb = Math.max(xb, cx + width / 2);
        za = Math.min(za, c.zTop ?? c.pinZ + (24 - c.h) / scale);
        zb = Math.max(zb, c.pinZ + 24 / scale);
      }
      return { xa, xb, za, zb };
    };
    let lo = 1;
    let hi = 120;
    for (let i = 0; i < 40; i++) {
      const scale = (lo + hi) / 2;
      const b = bounds(scale);
      if ((b.xb - b.xa) * scale * 1.02 <= w && (b.zb - b.za) * scale * 1.02 <= h) lo = scale;
      else hi = scale;
    }
    const scale = lo;
    const b = bounds(scale);
    // Ekranın ortası, kenarlar çıkarılınca kalan alanın ortasına göre kayar.
    this.topView = { scale, cx: (b.xa + b.xb) / 2 - (left - right) / 2 / scale, cz: (b.za + b.zb) / 2 - (top - bottom) / 2 / scale };
    this.applyTop();
  }

  /**
   * Tepeden görünümde masadaki parçaların 3B modeli ve gölgeler gizlenir: cihazlar düz kartlarla
   * çizilir (BoardMode), gölgeler dik kamerada gri leke bırakır. Kablolar uçların yerinden çıkar.
   */
  private applyTopLook(): void {
    const top = this.topView !== null;
    for (const [id, placed] of this.parts) {
      const onTable = this.plan?.table.has(id) ?? false;
      placed.group.visible = !(top && onTable);
      placed.shadow.visible = !top;
    }
    for (const child of this.boards.children) if (child.userData.shadow) child.visible = !top;
    this.dirty = true;
  }

  private applyTop(): void {
    const v = this.topView;
    if (!v) return;
    const canvas = this.renderer.domElement;
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    this.ortho.left = -w / 2 / v.scale;
    this.ortho.right = w / 2 / v.scale;
    this.ortho.top = h / 2 / v.scale;
    this.ortho.bottom = -h / 2 / v.scale;
    this.ortho.position.set(v.cx, 400, v.cz);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(v.cx, 0, v.cz);
    this.ortho.updateProjectionMatrix();
    this.dirty = true;
    this.cb.onView?.();
  }

  /** Tepeden görünümde dünya (x, z) → ekran (piksel, tuvale göre) dönüşümü; 3B'de null. */
  topTransform(): TopTransform | null {
    const v = this.topView;
    if (!v) return null;
    const canvas = this.renderer.domElement;
    return { scale: v.scale, ox: canvas.clientWidth / 2 - v.cx * v.scale, oy: canvas.clientHeight / 2 - v.cz * v.scale };
  }

  /** Tepeden görünümü ekranda (dx, dy) piksel kaydırır. */
  panTop(dx: number, dy: number): void {
    const v = this.topView;
    if (!v) return;
    this.topView = { ...v, cx: v.cx - dx / v.scale, cz: v.cz - dy / v.scale };
    this.applyTop();
  }

  /** Tepeden görünümü (px, py) noktası yerinde kalacak biçimde yakınlaştırır (factor > 1) ya da uzaklaştırır. */
  zoomTop(factor: number, px?: number, py?: number): void {
    const v = this.topView;
    if (!v) return;
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const sx = px ?? w / 2;
    const sy = py ?? h / 2;
    const wx = v.cx + (sx - w / 2) / v.scale;
    const wz = v.cz + (sy - h / 2) / v.scale;
    const scale = Math.min(120, Math.max(3, v.scale * factor));
    this.topView = { scale, cx: wx - (sx - w / 2) / scale, cz: wz - (sy - h / 2) / scale };
    this.applyTop();
  }

  // --- Kamera ---------------------------------------------------------------------------------------

  /**
   * Bütün devre görünsün: Serbest (önden ve yukarıdan, 52°), Üstten ya da Önden (alçaktan); Cihazlar masa üstü
   * cihazlara. `request`: kullanıcı seçti (telefonda Cihazlar yeniden seçilince sıradaki cihaza geçer).
   */
  fit(view: CameraView = 'free', request = false): void {
    if (view === 'bench' && request) this.benchIndex = this.lastView === 'bench' && !this.userMoved ? this.benchIndex + 1 : -1;
    this.lastView = view;
    this.userMoved = false;
    this.benchLabels = view === 'bench' ? new Set(this.tallParts().map((p) => p.part.id)) : null;
    // Masa üstü cihazlar (dik, uzun) varsa: Serbest tahtaya odaklanır (cihazların ön panelleri arkada, üstleri
    // kırpılabilir), Cihazlar ön panellere yaklaşır.
    if (view === 'free' || view === 'bench') {
      const framed = view === 'bench' ? this.benchFrame() : this.circuitFrame();
      if (framed) {
        this.placeCamera(framed.target, framed.distance, framed.elevation);
        return;
      }
    }
    const box = new Box3();
    // Parçalara, kablolara ve breadboard'un kullanılan bölümüne sığdırılır.
    // Üstten görünümde uzun (dik duran) cihazlar ve kabloları sayılmaz: kadraj tahtaya ve alçak parçalara.
    const top = view === 'top';
    const tallTop = top && [...this.parts.values()].some((p) => new Box3().setFromObject(p.group).max.y > 12);
    for (const placed of this.parts.values()) {
      const own = new Box3().setFromObject(placed.group);
      if (!(tallTop && own.max.y > 12)) box.union(own);
    }
    if (!tallTop) for (const c of this.cables.children) box.expandByObject(c);
    if (!this.boardView.isEmpty()) box.union(this.boardView);
    if (box.isEmpty()) box.set(new Vector3(-20, 0, -20), new Vector3(20, 5, 20));
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const elevation = ELEVATION[view];
    // Masa üstü cihazlar (dik, uzun) varsa: kameranın açısıyla bütün nesnelerin köşeleri kadraja sığdırılır
    // (yükseklik dahil, ortalı); yoksa düz tezgâh için eski yarıçap kuralı.
    const tall = top ? null : this.tallFit(elevation, view);
    if (tall) {
      this.placeCamera(tall.target, tall.distance, elevation);
      return;
    }
    const radius = Math.max(size.x, size.z * 1.1, 20) / 2;
    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = Math.min(1.6, this.camera.aspect);
    const distance = (radius / Math.tan(fov / 2)) * (aspect < 1 ? 1.15 / aspect : 1.05) * (view === 'front' ? 1.12 : 1);
    this.controls.target.copy(center).setY(0);
    this.camera.position.set(center.x, distance * Math.sin(elevation), center.z + distance * Math.cos(elevation));
    this.camera.near = Math.max(0.5, distance / 200);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.dirty = true;
  }

  /**
   * Tepeden görünümde ön paneli soketli cihazların uçları: gerçek boyutlu cihazlar tahtadan çok geniş bir sıra
   * kurar, kartlar tahtayı küçültürdü. Kartlar (soketlerin çevresi) tahtanın hemen arkasında yan yana dizilir;
   * uçlar kartla birlikte kayar (kablolar kartlardan çıkar). 3B görünümde uçlar gerçek yerinde kalır.
   */
  private compactInstruments(plan: BreadboardPlan): void {
    const devices = [...plan.table.keys()].flatMap((id) => {
      const placed = this.parts.get(id);
      return placed && placed.dirs.some(Boolean) && placed.real.length > 0 ? [placed] : [];
    });
    // Kartta uçlar soldan sağa gerçek sırasıyla, kısa sabit aralıkla (gerçek aralık kartı gereksiz genişletir).
    const GAP = 4;
    const PITCH = 5;
    const PAD = 6;
    const cards = devices.map((p) => ({ p, width: (p.real.length - 1) * PITCH + 2 * PAD }));
    const total = cards.reduce((sum, c) => sum + c.width, 0) + GAP * Math.max(0, cards.length - 1);
    let x = -total / 2;
    const z = -BB.depth / 2 - 6;
    for (const c of cards) {
      const order = c.p.real.map((a, i) => ({ a, i })).sort((u, v) => u.a.x - v.a.x);
      const compact: Vector3[] = new Array(c.p.real.length);
      order.forEach(({ a, i }, k) => (compact[i] = new Vector3(x + PAD + k * PITCH, a.y, z)));
      c.p.compact = compact;
      x += c.width + GAP;
    }
    const top = this.topView !== null;
    for (const p of this.parts.values()) p.anchors = top && p.compact ? p.compact : p.real;
  }

  /**
   * Tepeden görünümdeki kartın kutusu: ön paneli soketli (dik duran) cihazda soketlerin çevresi (gövdenin
   * tamamı kartı ve kadrajı tahtaya göre çok büyütürdü), öbür parçalarda modelin kutusu.
   */
  private cardBox(placed: Placed): Box3 {
    const box = new Box3().setFromObject(placed.model.root);
    if (!placed.dirs.some(Boolean) || placed.anchors.length === 0) return box;
    const around = new Box3().setFromPoints(placed.anchors);
    around.min.x -= 6;
    around.max.x += 6;
    around.min.z -= 10;
    around.min.y = box.min.y;
    around.max.y = Math.max(around.max.y, 1);
    return around;
  }

  /** Kamerayı hedefe verilen uzaklıktan ve yükseklik açısından (azimut 0: önden) bakacak biçimde yerleştirir. */
  private placeCamera(target: Vector3, distance: number, elevation: number): void {
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new Vector3(0, Math.sin(elevation), Math.cos(elevation)).multiplyScalar(distance));
    this.camera.near = Math.max(0.5, distance / 200);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.dirty = true;
  }

  /** Masa üstü cihazlar (dik duran, uzun parçalar). */
  private tallParts(): Placed[] {
    return [...this.parts.values()].filter((p) => new Box3().setFromObject(p.group).max.y > TALL);
  }

  /**
   * Tuvalin altındaki denetimlerin (3B düğmeleri, küçük şema: [data-fit-reserve]) kapladığı yükseklik (px):
   * yalnızca yatayda verilen aralıkla (0–1, tuval genişliğine göre) örtüşenler sayılır.
   */
  private bottomReserve(from: number, to: number): number {
    const canvas = this.renderer.domElement;
    const host = this.overlay?.parentElement;
    const c = canvas.getBoundingClientRect();
    if (!host || c.height === 0) return 0;
    let top = c.bottom;
    for (const el of host.querySelectorAll<HTMLElement>('[data-fit-reserve]')) {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.right < c.left + from * c.width || r.left > c.left + to * c.width) continue;
      top = Math.min(top, r.top);
    }
    return c.bottom - top + 8;
  }

  /**
   * Serbest (masa üstü cihaz varken): tahta kadraj genişliğinin BENCH_FREE payı kadarı, tahta ve masadaki alçak
   * parçalar alttaki denetimlerin üstünde; arkadaki cihazların ön panelleri tahtanın üstünde görünür, üstleri
   * ve yanları kırpılabilir. Masa üstü cihaz yoksa null (eski kadraj).
   */
  private circuitFrame(): { target: Vector3; distance: number; elevation: number } | null {
    const tall = this.tallParts();
    if (tall.length === 0 || this.boardView.isEmpty()) return null;
    const keep = boxCorners(this.boardView);
    for (const placed of this.parts.values()) {
      if (tall.includes(placed)) continue;
      keep.push(...boxCorners(new Box3().setFromObject(placed.group)));
    }
    const canvas = this.renderer.domElement;
    const { elevation, share } = canvas.clientWidth < PHONE_WIDTH ? BENCH_FREE.phone : BENCH_FREE.desktop;
    const reserve = this.bottomReserve(0.5 - share / 2, 0.5 + share / 2) / Math.max(1, canvas.clientHeight);
    const solved = this.solveFrame(elevation, boxCorners(this.boardView), keep, share, -1 + 2 * reserve, 0.9);
    return { ...solved, elevation };
  }

  /**
   * Cihazlar: masa üstü cihazların ön panelleri alçaktan, kadraja sığacak en yakından (ekranlar okunsun),
   * alttaki denetimlerin üstünde ortalı. Telefonda bütün sıra göstergeleri okunamayacak kadar küçültür: tek
   * cihaz (önce osiloskop, yoksa ortadaki), Cihazlar yeniden seçilince sağdaki; yanlardakiler kaydırılarak
   * görülür. Masa üstü cihaz yoksa null.
   */
  private benchFrame(): { target: Vector3; distance: number; elevation: number } | null {
    const tall = this.tallParts().sort((a, b) => a.group.position.x - b.group.position.x);
    if (tall.length === 0) return null;
    const canvas = this.renderer.domElement;
    let shown = tall;
    if (canvas.clientWidth < PHONE_WIDTH && tall.length > 1) {
      if (this.benchIndex < 0) {
        const scope = tall.findIndex((p) => p.part.type === 'oscilloscope');
        this.benchIndex = scope >= 0 ? scope : Math.floor((tall.length - 1) / 2);
      }
      shown = [tall[this.benchIndex % tall.length]!];
    }
    const corners = shown.flatMap((p) => boxCorners(new Box3().setFromObject(p.group)));
    const reserve = this.bottomReserve(0, 1) / Math.max(1, canvas.clientHeight);
    const solved = this.solveFrame(ELEVATION.bench, corners, corners, 0.96, -1 + 2 * reserve, 0.96, true);
    return { ...solved, elevation: ELEVATION.bench };
  }

  /**
   * Verilen yükseklik açısından (azimut 0) bakan kamera için hedef ve uzaklık, sayısal yinelemeyle (perspektifte
   * her noktanın derinliği ayrı): `focus` köşelerinin ekrandaki genişliği kadraj genişliğinin `share` kadarı;
   * `keep` köşeleri yatayda kadraja, dikeyde `bottom` ile `top` (NDC, −1 ekranın altı) arasına sığar ve alttan
   * `bottom` çizgisine oturur (`middle`: ikisinin ortasında). Sığmazsa uzaklık artar (focus `share`'den küçük kalır).
   */
  private solveFrame(
    elevation: number,
    focus: readonly Vector3[],
    keep: readonly Vector3[],
    share: number,
    bottom: number,
    top: number,
    middle = false,
  ): { target: Vector3; distance: number } {
    const toCamera = new Vector3(0, Math.sin(elevation), Math.cos(elevation));
    const forward = toCamera.clone().negate();
    const right = new Vector3(1, 0, 0);
    const up = new Vector3().crossVectors(right, forward);
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const tanH = tanV * Math.max(0.2, this.camera.aspect);
    const target = new Box3().setFromPoints([...focus]).getCenter(new Vector3());
    let distance = new Box3().setFromPoints([...keep]).getSize(new Vector3()).length() * 2;
    const extent = (points: readonly Vector3[], eye: Vector3) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of points) {
        const v = p.clone().sub(eye);
        const depth = Math.max(1e-3, v.dot(forward));
        const x = v.dot(right) / (depth * tanH);
        const y = v.dot(up) / (depth * tanV);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      return { x0, x1, y0, y1 };
    };
    for (let i = 0; i < 60; i++) {
      const eye = target.clone().addScaledVector(toCamera, distance);
      const f = extent(focus, eye);
      const k = extent(keep, eye);
      const ratio = Math.max((f.x1 - f.x0) / (2 * share), (k.x1 - k.x0) / (2 * 0.94), (k.y1 - k.y0) / ((top - bottom) * 0.97));
      // Kaydırma: keep yatayda ortada, alt kenarı `bottom`un hemen üstünde (hedef sağa/yukarı gidince içerik sola/aşağı).
      target.addScaledVector(right, ((k.x0 + k.x1) / 2) * distance * tanH * 0.8);
      const shift = middle ? (k.y0 + k.y1) / 2 - (bottom + top) / 2 : k.y0 - (bottom + 0.02);
      target.addScaledVector(up, shift * distance * tanV * 0.8);
      distance *= Math.pow(ratio, 0.7);
    }
    return { target, distance };
  }

  /**
   * Uzun (dik duran) cihaz varsa kadraj: nesnelerin kutularının köşeleri, verilen yükseklik açısından bakan
   * kameranın görüş alanına sığacak uzaklık ve ortalanmış hedef. Uzun nesne yoksa null.
   */
  private tallFit(elevation: number, view: CameraView): { target: Vector3; distance: number } | null {
    const boxes: Box3[] = [];
    for (const placed of this.parts.values()) boxes.push(new Box3().setFromObject(placed.group));
    if (!boxes.some((b) => b.max.y > 12)) return null;
    for (const c of this.cables.children) boxes.push(new Box3().setFromObject(c));
    if (!this.boardView.isEmpty()) boxes.push(this.boardView.clone());
    const corners = boxes.flatMap((b) =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)),
    );
    const toCamera = new Vector3(0, Math.sin(elevation), Math.cos(elevation));
    const right = new Vector3(1, 0, 0);
    const up = new Vector3().crossVectors(right, toCamera.clone().negate());
    // Altta düğme şeridi için pay (telefonda daha çok): içerik kadrajın üst kısmına sığdırılır.
    const reserve = this.camera.aspect < 1 ? 0.2 : 0.06;
    const tanFull = Math.tan((this.camera.fov * Math.PI) / 360);
    const tanV = tanFull * (1 - reserve);
    const tanH = tanFull * Math.min(1.6, this.camera.aspect);
    const margin = view === 'front' ? 1.1 : 1.04;
    const target = new Box3().setFromPoints(corners).getCenter(new Vector3());
    let distance = 0;
    for (let pass = 0; pass < 3; pass++) {
      // Gereken uzaklık: her köşe görüş konisinin içinde kalsın.
      distance = 0;
      for (const p of corners) {
        const v = p.clone().sub(target);
        const along = v.dot(toCamera);
        distance = Math.max(distance, along + Math.abs(v.dot(right)) / tanH, along + Math.abs(v.dot(up)) / tanV);
      }
      // Kadrajdaki yerleri (görüş açısının tanjantı): hedef, köşelerin ortasına kayar.
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of corners) {
        const v = p.clone().sub(target);
        const depth = distance - v.dot(toCamera);
        x0 = Math.min(x0, v.dot(right) / depth);
        x1 = Math.max(x1, v.dot(right) / depth);
        y0 = Math.min(y0, v.dot(up) / depth);
        y1 = Math.max(y1, v.dot(up) / depth);
      }
      target.addScaledVector(right, ((x0 + x1) / 2) * distance * 0.8).addScaledVector(up, ((y0 + y1) / 2) * distance * 0.8);
    }
    // Ortalanmış içerik paydan yukarı kayar (hedef aşağı).
    target.addScaledVector(up, -reserve * tanFull * distance * margin);
    return { target, distance: distance * margin };
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
    ray.setFromCamera(ndc, this.view);
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
    if (hit?.model.interaction === 'press' && this.active) {
      this.pressing = hit.part.id;
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.cb.onPress(hit.part.id, true);
      return;
    }
    if (hit?.model.interaction === 'knob') {
      const position = Number(hit.part.props.position ?? 50);
      this.drag = { id: hit.part.id, x: e.clientX, start: position, position };
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    // Fareyle bir kablonun ya da kıskacın üstüne gelince o ağ vurgulanır (dokunmatikte dokununca: onPointerUp).
    if (!this.drag && e.pointerType === 'mouse' && e.buttons === 0 && !this.topView) this.highlightNet(this.pickNet(e));
    if (!this.drag) return;
    const position = Math.max(0, Math.min(100, this.drag.start + (e.clientX - this.drag.x) * 0.5));
    if (Math.abs(position - this.drag.position) >= 0.5) {
      this.drag.position = Math.round(position);
      this.cb.onKnob(this.drag.id, this.drag.position, false);
    }
  };

  private readonly onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.highlightNet(null);
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    const down = this.down;
    this.down = null;
    if (this.pressing) {
      const id = this.pressing;
      this.pressing = null;
      this.controls.enabled = true;
      this.cb.onPress(id, false);
      return;
    }
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
    // Dokunmatikte parçanın dışında bir kabloya ya da kıskaca dokununca o ağ vurgulanır; yeniden dokununca kalkar.
    const net = e.pointerType !== 'mouse' && !this.topView ? this.pickNet(e) : null;
    if (net && !hit) {
      this.highlightNet(this.highlighted === net ? null : net);
      return;
    }
    if (e.pointerType !== 'mouse') this.highlightNet(null);
    if (hit && hit.model.interaction === 'toggle' && this.active) this.cb.onToggle(hit.part.id);
    else this.cb.onSelect(hit?.part.id ?? null);
  };

  /** İşaretçinin altındaki kablonun (kıskaç, kısa tel, köprü dahil) ağı; önünde parça varsa null. */
  private pickNet(e: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.view);
    const parts = ray.intersectObject(this.partsGroup, true)[0]?.distance ?? Infinity;
    for (const hit of ray.intersectObject(this.cables, true)) {
      if (hit.distance > parts) break;
      let o: Object3D | null = hit.object;
      while (o && o.userData.net === undefined) o = o.parent;
      if (o) return o.userData.net as string;
    }
    return null;
  }

  /**
   * Ağı vurgular: o ağın kabloları, kıskaçları, kısa telleri ve köprüleri parlar, tahtadaki bacaklarının üstünde
   * mavi işaret (seçim halkasının rengi); öbür kablolar ve ağa dokunmayan parçalar soluklaşır. null: vurgu kalkar.
   */
  private highlightNet(net: string | null): void {
    if (net === this.highlighted) return;
    this.highlighted = net;
    for (const g of this.legGlow.children) (g as Mesh).geometry.dispose();
    this.legGlow.clear();
    const swap = (root: Object3D, kind: 'dim' | 'lit' | null) => {
      root.traverse((o) => {
        if (!(o instanceof Mesh) || Array.isArray(o.material)) return;
        const base = (o.userData.baseMaterial as Material | undefined) ?? o.material;
        o.userData.baseMaterial = base;
        o.material = kind ? this.tinted(base, kind) : base;
      });
    };
    const plan = this.plan;
    const touches = new Set<string>();
    if (net && plan) for (const [key, n] of plan.netOf) if (n === net) touches.add(key.split('#')[0]!);
    for (const child of this.cables.children) swap(child, net === null ? null : child.userData.net === net ? 'lit' : 'dim');
    for (const placed of this.parts.values()) swap(placed.group, net === null || touches.has(placed.part.id) ? null : 'dim');
    if (net && plan) {
      for (const [id, at] of plan.onBoard) {
        at.holes.forEach((h, pin) => {
          if (plan.netOf.get(pinKey(id, pin)) !== net) return;
          const foot = holeAt(h, plan.cols, BB.height);
          this.legGlow.add(rod(foot, foot.clone().setY(BB.height + 1.3), 0.24, this.ringMaterial, 10));
        });
      }
    }
    this.cb.onNet?.(net);
    this.dirty = true;
  }

  /** Malzemenin soluk (yarı saydam) ya da parlak (kendi renginde ışıyan) kopyası (önbellekte). */
  private tinted(base: Material, kind: 'dim' | 'lit'): Material {
    const cache = kind === 'dim' ? this.dimmed : this.lit;
    let m = cache.get(base);
    if (!m) {
      m = base.clone();
      if (kind === 'dim') {
        m.transparent = true;
        m.opacity = 0.18;
        m.depthWrite = false;
      } else if (m instanceof MeshStandardMaterial) {
        m.emissive = m.color.clone();
        m.emissiveIntensity = 0.55;
      }
      cache.set(base, m);
    }
    return m;
  }

  /** Denetim (ios-kontrol): vurgulanan ağ, parlayan ve soluklaşan kablo sayısı, işaretli bacak sayısı. */
  netHighlight(): { net: string | null; lit: number; dim: number; legs: number } {
    const state = (child: Object3D): 'lit' | 'dim' | null => {
      let found: 'lit' | 'dim' | null = null;
      child.traverse((o) => {
        if (found || !(o instanceof Mesh)) return;
        const base = o.userData.baseMaterial as Material | undefined;
        if (base && o.material === this.lit.get(base)) found = 'lit';
        else if (base && o.material === this.dimmed.get(base)) found = 'dim';
      });
      return found;
    };
    const states = this.cables.children.map(state);
    return { net: this.highlighted, lit: states.filter((x) => x === 'lit').length, dim: states.filter((x) => x === 'dim').length, legs: this.legGlow.children.length };
  }

  /** Denetim (ios-kontrol): ağı vurgular (kablonun üstüne gelmek gibi); null kaldırır. */
  highlight(net: string | null): void {
    this.highlightNet(net);
  }

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
    this.renderer.render(this.scene, this.view);
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
    for (const m of [...this.dimmed.values(), ...this.lit.values()]) m.dispose();
    for (const g of this.legGlow.children) (g as Mesh).geometry.dispose();
    this.shadowTexture.dispose();
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

