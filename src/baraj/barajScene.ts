// Baraj sahnesi (three.js; tasarım v3: README "Baraj sayfası" 11, 14; başlangıç docs/tasarim-v3/baraj-3b/main.js).
// Kesitten bakılan vadi: toprak bloğu, beton baraj (kesit yüzü koyu), taç yolu ve korkuluk, kontrol evi
// (içinde üç katlı devre kartı, klemens, 9 V pil), hazne suyu, mansap deresi, paslanmaz problar (renkli
// bilezik, grafit uç), beton içinde kablo kanalı, üç lambalı ışık kulesi ve evden kuleye kablo. Işık ve
// malzeme dili 3B tezgâhla aynı (ACES ton eşleme, RoomEnvironment, MeshStandardMaterial, yumuşak gölge).
// Kamera sabit (kullanıcı döndürmez): sahne alanının en-boy oranına göre README'deki ön ayarlardan
// seçilir, lambalar ve problar kadrajda kalmazsa geri çekilir. Su seviyesi, ıslak problardaki elektroliz
// kabarcıkları ve lambalar canlı güncellenir. Numaralar, ıslak prob halkası, tutamak, ölçek ve iyonlar
// HTML katmanında (BarajSahnesi3B): konumları `screen()` ile 3B noktaların ekrandaki izdüşümünden.
// Yalnızca bir şey değişince çizer (kabarcıklar akarken sürekli).
//
// "İçini göster" (README 13, B6): beton, kesit yüzü, taç yolu, ev duvarları, çatı, camlar ve kablo
// kanalı yarı saydam olur, kenarları ince çizgiyle çizilir; kamera eve ve kablo kanalına yumuşakça
// yaklaşır (ön ayar "xray"). Evin yakın planı ("house") aynı çiziciyle sahnenin içindeki bir pencereye
// (setInset; HTML çerçevesi BarajSahnesi3B'de) çizilir. Su, kabarcıklar ve lambalar canlı kalır.

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  ExtrudeGeometry,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RepeatWrapping,
  Scene,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createRenderer } from '../bench3d/stage';
import { TANK_PROBE_HEIGHTS } from '../sim/devices/tank';

/** %100 su yüksekliği (m); prob yükseklikleri tankın prob yükseklikleriyle aynı (ortak, 1, 2, 3). */
export const FULL = 8;
/** Kesit yüzünün z'si. */
const FRONT = 3;
const DAM_DEPTH = 18;
const PROBE_Z = FRONT - 0.5;
const TIP_X = -1.45;
const COLLAR_X = -0.35;
/** Ölçek ve su yüzeyi tutamağı: kesit yüzünde, barajın solunda. */
const STAFF_X = -3.2;
const TOWER_X = 12.5;
const TOWER_Z = 0.4;
const HEAD_Y = 9.3;
/** Lambalar yukarıdan aşağı: kırmızı (3), sarı (2), yeşil (1). */
const LAMP_Y = [1.35, 0, -1.35] as const;
const LAMP_COLORS = ['#e8322a', '#f2b014', '#14b85a'] as const;
const LAMP_KEYS = ['red', 'yellow', 'green'] as const;
const PROBE_RINGS = ['#1d2733', '#1b7d44', '#e8b10f', '#d92d20'] as const;

export const probeY = (k: number) => (FULL * TANK_PROBE_HEIGHTS[k]!) / 100;

export interface BarajLamps {
  readonly green: number;
  readonly yellow: number;
  readonly red: number;
}

export interface BarajState {
  /** Su seviyesi (%). */
  readonly level: number;
  /** Islak problar: ortak, 1, 2, 3. */
  readonly wet: readonly boolean[];
  readonly lamps: BarajLamps;
  /** Her probdan suya akan akım (A): elektroliz kabarcıkları; simülasyon durunca null. */
  readonly currents: readonly number[] | null;
}

/** Kamera ön ayarları (README 14): masaüstü tam genişlik, devre açık, tüm devre, telefon; içini göster. */
type CameraName = 'desk' | 'open' | 'all' | 'phone' | 'xray' | 'house';
const CAMERAS: Readonly<Record<CameraName, { fov: number; pos: readonly [number, number, number]; look: readonly [number, number, number] }>> = {
  desk: { fov: 32, pos: [13, 7.6, 31], look: [2.2, 5.0, 0] },
  open: { fov: 38, pos: [7, 7.4, 30], look: [4.6, 5.6, 0] },
  all: { fov: 42, pos: [6.5, 8, 36], look: [5.6, 5.4, 0] },
  phone: { fov: 54, pos: [6.6, 8, 34], look: [6, 6, 0] },
  xray: { fov: 31, pos: [9.5, 8.6, 22], look: [1.2, 5.9, 0] },
  house: { fov: 38, pos: [1.6, 10.3, FRONT + 1.6], look: [0.6, 9.75, FRONT - 2.1] },
};

/** Sahne alanının en-boy oranına göre ön ayar: geniş → desk, kareye yakın → open, dar → all, en dar → phone. */
function cameraFor(aspect: number): CameraName {
  if (aspect >= 1.35) return 'desk';
  if (aspect >= 0.85) return 'open';
  if (aspect >= 0.66) return 'all';
  return 'phone';
}

/** Kadraj denetimi için geçici kamera: noktanın görüş alanında (kenarlardan pay bırakarak) olup olmadığı. */
class Camera3 {
  private readonly cam: PerspectiveCamera;
  constructor(fov: number, aspect: number) {
    this.cam = new PerspectiveCamera(fov, aspect, 0.5, 200);
  }
  place(pos: Vector3, look: Vector3): void {
    this.cam.position.copy(pos);
    this.cam.lookAt(look);
    this.cam.updateMatrixWorld(true);
  }
  inside(p: Vector3): boolean {
    const q = p.clone().project(this.cam);
    return Math.abs(q.x) <= 0.9 && Math.abs(q.y) <= 0.86 && q.z < 1;
  }
}

/** Tohumlu sözde rastgele (dokular her açılışta aynı görünsün). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

const std = (color: string, roughness = 0.8, metalness = 0, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) =>
  new MeshStandardMaterial({ color, roughness, metalness, ...extra });

export class BarajScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.5, 200);
  private readonly pmrem: PMREMGenerator;
  private readonly observer: ResizeObserver;
  private readonly textures: CanvasTexture[] = [];
  private width = 1;
  private height = 1;
  private dirty = true;
  private cameraName: CameraName = 'desk';
  /** Sabit ön ayar (Tüm devre: dar sahnenin "all" kamerası); null: en-boy oranına göre. */
  private preset: CameraName | null = null;
  /** Su yüzeyi tutamağı sahnede (masaüstü): kadrajda kalması gerekir. */
  private handle = false;
  /** Kameranın baktığı nokta (geçişte ara değer). */
  private readonly look = new Vector3();
  /** İçini göster: istenen durum ve 0..1 arası ara değer (malzeme saydamlığı). */
  private xray = false;
  private xrayAmount = 0;
  private transition: { from: { pos: Vector3; look: Vector3; fov: number; amount: number }; start: number } | null = null;
  /** Evin yakın planı: kapsayıcıya göre px (null: yok). */
  private inset: { x: number; y: number; w: number; h: number } | null = null;
  private readonly houseCamera = new PerspectiveCamera(38, 1.37, 0.05, 80);
  private readonly ghostMeshes: Mesh[] = [];
  // Canlı parçalar
  private readonly water: Mesh;
  private readonly surface: Mesh;
  private readonly surfaceLine: Mesh;
  private readonly lamps: Array<{ lens: MeshStandardMaterial; light: PointLight; glow: Sprite; color: Color; dark: Color }> = [];
  private readonly bubbles: Mesh[][] = [];
  private state: BarajState = { level: 0, wet: [false, false, false, false], lamps: { green: 0, yellow: 0, red: 0 }, currents: null };
  private readonly start = performance.now();
  /** "İçini göster" (4. aşama): yarı saydam yapılacak malzemeler ve kenar çizgileri. */
  readonly ghosts: Array<{ material: MeshStandardMaterial; opacity: number }> = [];
  readonly outlines: LineSegments[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: { onLayout(): void },
  ) {
    this.renderer = createRenderer(container);
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.style.touchAction = 'auto';

    this.pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const sky = this.texture(4, 512, (g) => {
      const lg = g.createLinearGradient(0, 0, 0, 512);
      lg.addColorStop(0, '#b9d3ea');
      lg.addColorStop(0.6, '#dfeaf3');
      lg.addColorStop(1, '#eef3f6');
      g.fillStyle = lg;
      g.fillRect(0, 0, 4, 512);
    });
    this.scene.background = sky;
    this.scene.fog = new Fog('#dfe9f1', 40, 120);
    this.scene.add(new HemisphereLight('#ffffff', '#8a7f6a', 0.45));
    const sun = new DirectionalLight('#fff3e0', 2.1);
    sun.position.set(-14, 26, 22);
    sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 4;
    this.scene.add(sun);

    this.buildGround();
    this.buildDam();
    const { water, surface, line } = this.buildWater();
    this.water = water;
    this.surface = surface;
    this.surfaceLine = line;
    this.buildProbes();
    this.buildTower();
    const ghostSet = new Set<Material>(this.ghosts.map((g) => g.material));
    this.scene.traverse((o) => {
      if (o instanceof Mesh && !Array.isArray(o.material) && ghostSet.has(o.material)) this.ghostMeshes.push(o);
    });
    const hc = CAMERAS.house;
    this.houseCamera.position.set(...hc.pos);
    this.houseCamera.lookAt(new Vector3(...hc.look));
    this.houseCamera.fov = hc.fov;

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  // --- Kurulum ------------------------------------------------------------------------------------------

  private texture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): CanvasTexture {
    const t = canvasTexture(w, h, draw, repeat);
    this.textures.push(t);
    return t;
  }

  private add(geo: BufferGeometry, material: Material | Material[], x = 0, y = 0, z = 0, parent: Object3D = this.scene): Mesh {
    const m = new Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** İçini göster'de yarı saydam olacak malzeme (opaklığı) ve kenar çizgisi. */
  private ghost(material: MeshStandardMaterial, opacity: number): MeshStandardMaterial {
    this.ghosts.push({ material, opacity });
    return material;
  }
  private outline(mesh: Mesh, color = '#3d4957'): void {
    const l = new LineSegments(new EdgesGeometry(mesh.geometry, 20), new LineBasicMaterial({ color, transparent: true, opacity: 0.6 }));
    l.position.copy(mesh.position);
    l.rotation.copy(mesh.rotation);
    l.visible = false;
    mesh.parent?.add(l);
    this.outlines.push(l);
  }

  private buildGround(): void {
    const soil = this.texture(
      256,
      256,
      (g) => {
        const r = rng(7);
        g.fillStyle = '#7f6a50';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = `rgba(${60 + r() * 60},${50 + r() * 40},${35 + r() * 30},0.5)`;
          g.beginPath();
          g.arc(r() * 256, r() * 256, 0.6 + r() * 1.6, 0, 7);
          g.fill();
        }
      },
      true,
    );
    soil.repeat.set(26, 7);
    const soilMat = std('#ffffff', 0.95, 0, { map: soil });
    const grass = std('#8f9a70', 0.95);
    this.add(new BoxGeometry(80, 20, 60), [soilMat, soilMat, grass, soilMat, soilMat, soilMat], 4, -10, FRONT - 30);
    // Arka sırtlar (sis içinde)
    for (const [x, z, r, h, col] of [
      [-26, -40, 22, 9, '#8ea1b2'],
      [-2, -52, 30, 13, '#9aacbc'],
      [24, -44, 24, 8, '#93a6b6'],
      [44, -56, 30, 12, '#a2b3c2'],
    ] as const) {
      const m = this.add(new SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(col, 1), x, -0.5, z);
      m.scale.y = h / r;
      m.castShadow = false;
    }
    // Mansap deresi
    const river = this.add(new BoxGeometry(22, 0.12, 2.6), std('#4f97d3', 0.15, 0, { transparent: true, opacity: 0.85 }), 16.5, 0.02, -1.4);
    river.castShadow = false;
  }

  private buildDam(): void {
    const ct = this.texture(
      512,
      512,
      (g) => {
        const r = rng(11);
        g.fillStyle = '#c9ccd0';
        g.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 2600; i++) {
          const v = (180 + r() * 40) | 0;
          g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.25)`;
          g.fillRect(r() * 512, r() * 512, 2 + r() * 6, 2 + r() * 6);
        }
        g.strokeStyle = 'rgba(90,96,104,0.45)';
        g.lineWidth = 2;
        for (let y = 0; y <= 512; y += 128) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(512, y);
          g.stroke();
        }
        for (let x = 0; x <= 512; x += 256) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, 512);
          g.stroke();
        }
      },
      true,
    );
    ct.repeat.set(0.3, 0.3);
    // Gövde: kesit profili z boyunca uzatılmış; kesit yüzü daha koyu (kesilmiş beton).
    const profile = new Shape();
    profile.moveTo(0, 0);
    profile.lineTo(0, 9);
    profile.lineTo(1.3, 9);
    profile.lineTo(5.6, 0);
    profile.lineTo(0, 0);
    const damGeo = new ExtrudeGeometry(profile, { depth: DAM_DEPTH, bevelEnabled: false });
    damGeo.translate(0, 0, FRONT - DAM_DEPTH);
    const dam = this.add(damGeo, this.ghost(std('#d4d6d8', 0.92, 0, { map: ct }), 0.16));
    this.outline(dam);
    const cut = new Mesh(new ExtrudeGeometry(profile, { depth: 0.02, bevelEnabled: false }), this.ghost(std('#9ea4ab', 0.95, 0, { map: ct }), 0.22));
    cut.position.z = FRONT;
    this.scene.add(cut);
    // Taç yolu ve korkuluk
    this.add(new BoxGeometry(1.5, 0.18, DAM_DEPTH), this.ghost(std('#8f969d', 0.85), 0.35), 0.65, 9.09, FRONT - DAM_DEPTH / 2);
    const railMat = std('#5d656e', 0.5, 0.6);
    const post = new CylinderGeometry(0.04, 0.04, 0.8, 8);
    for (let z = FRONT - 0.3; z > FRONT - DAM_DEPTH; z -= 1.2) {
      this.add(post, railMat, 1.3, 9.58, z);
      this.add(post, railMat, 0.02, 9.58, z);
    }
    for (const x of [0.02, 1.3]) this.add(new BoxGeometry(0.06, 0.06, DAM_DEPTH), railMat, x, 9.95, FRONT - DAM_DEPTH / 2);

    // Kontrol evi ve içi: arka duvarda üç katlı devre kartı, yerde 9 V pil, klemens.
    const house = new Group();
    house.position.set(0.65, 9.18, FRONT - 1.4);
    this.scene.add(house);
    const walls = this.add(new BoxGeometry(1.25, 1.1, 1.5), this.ghost(std('#eef0ee', 0.7), 0.12), 0, 0.55, 0, house);
    this.outline(walls);
    const roofShape = new Shape();
    roofShape.moveTo(-0.8, 0);
    roofShape.lineTo(0, 0.6);
    roofShape.lineTo(0.8, 0);
    roofShape.lineTo(-0.8, 0);
    const roofGeo = new ExtrudeGeometry(roofShape, { depth: 1.7, bevelEnabled: false });
    roofGeo.translate(0, 0, -0.85);
    const roof = this.add(roofGeo, this.ghost(std('#b5473f', 0.6), 0.18), 0, 1.1, 0, house);
    this.outline(roof, '#8a3a33');
    const glass = this.ghost(std('#2c4a6b', 0.15, 0.2), 0.2);
    this.add(new BoxGeometry(0.02, 0.4, 0.5), glass, 0.63, 0.65, 0.2, house);
    this.add(new BoxGeometry(0.5, 0.75, 0.02), this.ghost(std('#5a4a3a', 0.6), 0.2), 0.1, 0.38, 0.76, house);
    this.add(new BoxGeometry(0.42, 0.32, 0.02), glass, -0.3, 0.7, 0.76, house);
    this.add(new BoxGeometry(1.0, 0.6, 0.03), std('#1f5f3d', 0.55), 0, 0.62, -0.7, house);
    const rowY = [0.8, 0.62, 0.44];
    const rowCol = ['#d92d20', '#e8b10f', '#1b7d44'];
    const resistorMat = std('#e3cfa4', 0.5);
    const res = new CylinderGeometry(0.018, 0.018, 0.13, 10);
    const smallRes = (x: number, y: number) => {
      const r = this.add(res, resistorMat, x, y, -0.66, house);
      r.rotation.z = Math.PI / 2;
    };
    rowY.forEach((y, i) => {
      this.add(new SphereGeometry(0.028, 12, 8), std(rowCol[i]!, 0.4, 0, { emissive: rowCol[i]!, emissiveIntensity: 0.25 }), -0.44, y, -0.67, house);
      smallRes(-0.29, y);
      const c = this.add(new CylinderGeometry(0.03, 0.03, 0.08, 14), std('#2a4c9b', 0.45), -0.12, y, -0.645, house);
      c.rotation.x = Math.PI / 2;
      smallRes(0.02, y);
      const q = this.add(new CylinderGeometry(0.035, 0.035, 0.07, 14, 1, false, 0, Math.PI), std('#1d1f23', 0.6), 0.17, y, -0.655, house);
      q.rotation.x = Math.PI / 2;
      smallRes(0.33, y);
    });
    this.add(new BoxGeometry(0.3, 0.07, 0.06), std('#2f8a4c', 0.6), -0.3, 0.36, -0.66, house);
    for (let i = 0; i < 4; i++) this.add(new CylinderGeometry(0.015, 0.015, 0.02, 8), std('#b7bdc4', 0.3, 1), -0.41 + i * 0.075, 0.4, -0.63, house);
    this.add(new BoxGeometry(0.17, 0.3, 0.1), std('#24292f', 0.55), -0.42, 0.16, -0.5, house);
    this.add(new BoxGeometry(0.17, 0.05, 0.1), std('#c9a227', 0.4, 0.6), -0.42, 0.33, -0.5, house);
    const tube = (pts: ReadonlyArray<readonly [number, number, number]>, color: string, r = 0.012) =>
      this.add(new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), 40, r, 8), std(color, 0.5), 0, 0, 0, house);
    tube([[-0.38, 0.35, -0.5], [-0.38, 0.45, -0.6], [-0.2, 0.52, -0.66]], '#c8312a');
    tube([[-0.46, 0.35, -0.5], [-0.5, 0.45, -0.6], [-0.48, 0.5, -0.66]], '#1d1f23');
    tube([[0.5, 0.62, -0.66], [0.56, 0.7, -0.4], [0.55, 0.92, 0]], '#3a3f45', 0.02);

    // Kablo kanalı: beton içinde, problardan kontrol evinin tabanına; dört kablo (Prob 1–3, ortak).
    const CX = 0.35;
    const CZ = FRONT - 0.85;
    const conduit = this.add(new CylinderGeometry(0.11, 0.11, 9.0, 16), this.ghost(std('#8a929b', 0.6), 0.28), CX, 4.65, CZ);
    this.outline(conduit, '#5f6b7a');
    const wireCols = ['#1b7d44', '#e8b10f', '#d92d20', '#1d1f23'];
    [probeY(1), probeY(2), probeY(3), probeY(0)].forEach((y, i) => {
      const dx = [-0.04, 0.0, 0.04, 0.0][i]!;
      const dz = [0, 0.04, 0, -0.04][i]!;
      const pts = [
        [0.02, y, PROBE_Z],
        [CX * 0.6, y + 0.05, (PROBE_Z + CZ) / 2],
        [CX + dx, y + 0.2, CZ + dz],
        [CX + dx, 9.1, CZ + dz],
        [CX + dx, 9.35, CZ - 0.4],
        [0.24 + i * 0.075, 9.57, FRONT - 1.4 - 0.62],
      ] as const;
      this.add(new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), 120, 0.022, 8), std(wireCols[i]!, 0.5));
    });
  }

  private buildWater(): { water: Mesh; surface: Mesh; line: Mesh } {
    const waterMat = new MeshPhysicalMaterial({ color: '#2a78c2', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.58, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.1 });
    const water = this.add(new BoxGeometry(36, 1, DAM_DEPTH - 0.02), waterMat, -18, 0.5, FRONT - DAM_DEPTH / 2);
    water.castShadow = false;
    // Yüzey: hafif dalgalı açık mavi; kesit yüzünde yüzey çizgisi.
    const sg = new PlaneGeometry(36, DAM_DEPTH, 144, 40);
    const pos = sg.attributes.position!;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.04 * Math.sin(pos.getX(i) * 2.1) * Math.cos(pos.getY(i) * 1.7));
    sg.computeVertexNormals();
    const surface = this.add(sg, std('#5aa3e0', 0.1, 0, { transparent: true, opacity: 0.75, depthWrite: false }), -18, 0, FRONT - DAM_DEPTH / 2);
    surface.rotation.x = -Math.PI / 2;
    surface.castShadow = false;
    const line = this.add(new BoxGeometry(36, 0.05, 0.02), std('#cfe8fb', 0.2), -18, 0, FRONT + 0.001);
    line.castShadow = false;
    return { water, surface, line };
  }

  private buildProbes(): void {
    const steel = std('#b7bdc4', 0.3, 1);
    const plate = std('#6b737c', 0.5, 0.7);
    const graphite = std('#3a3f45', 0.45, 0.3);
    const bubbleGeo = new SphereGeometry(1, 8, 8);
    const bubbleMat = std('#ffffff', 0.1, 0, { transparent: true, opacity: 0.8 });
    for (let k = 0; k < 4; k++) {
      const g = new Group();
      g.position.set(0, probeY(k), PROBE_Z);
      this.scene.add(g);
      this.add(new BoxGeometry(0.06, 0.5, 0.5), plate, -0.03, 0, 0, g);
      const rod = this.add(new CylinderGeometry(0.06, 0.06, 1.4, 16), steel, -0.7, 0, 0, g);
      rod.rotation.z = Math.PI / 2;
      const tip = this.add(new CylinderGeometry(0.11, 0.11, 0.35, 20), graphite, TIP_X, 0, 0, g);
      tip.rotation.z = Math.PI / 2;
      const ring = this.add(new CylinderGeometry(0.1, 0.1, 0.14, 20), std(PROBE_RINGS[k]!, 0.45), COLLAR_X, 0, 0, g);
      ring.rotation.z = Math.PI / 2;
      // Elektroliz kabarcıkları: uçtan yükselir (setState / tick).
      const pool: Mesh[] = [];
      for (let m = 0; m < 8; m++) {
        const b = new Mesh(bubbleGeo, bubbleMat);
        b.visible = false;
        g.add(b);
        pool.push(b);
      }
      this.bubbles.push(pool);
    }
  }

  private buildTower(): void {
    this.add(new CylinderGeometry(0.16, 0.2, 7.2, 20), std('#59616a', 0.4, 0.8), TOWER_X, 3.6, TOWER_Z);
    this.add(new CylinderGeometry(0.5, 0.6, 0.25, 24), std('#6b737c', 0.7), TOWER_X, 0.12, TOWER_Z);
    const head = new Group();
    head.position.set(TOWER_X, HEAD_Y, TOWER_Z);
    this.scene.add(head);
    const body = std('#1f252c', 0.45);
    this.add(new RoundedBoxGeometry(1.5, 4.4, 1.0, 4, 0.18), body, 0, 0, 0, head);
    this.add(new BoxGeometry(1.0, 0.08, 1.0), body, 0, -2.24, 0, head);
    const glowTex = this.texture(128, 128, (g) => {
      const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
    });
    const rimMat = std('#11151a', 0.5);
    const visorMat = std('#14191e', 0.5, 0, { side: 2 });
    LAMP_Y.forEach((y, i) => {
      const color = new Color(LAMP_COLORS[i]);
      const dark = color.clone().multiplyScalar(0.07);
      const lens = new MeshStandardMaterial({ color: dark.clone(), emissive: color.clone(), emissiveIntensity: 0, roughness: 0.55, envMapIntensity: 0.08 });
      const lensMesh = this.add(new CylinderGeometry(0.5, 0.5, 0.12, 40), lens, 0, y, 0.52, head);
      lensMesh.rotation.x = Math.PI / 2;
      const rim = this.add(new CylinderGeometry(0.56, 0.56, 0.1, 40, 1, true), rimMat, 0, y, 0.52, head);
      rim.rotation.x = Math.PI / 2;
      const visor = this.add(new CylinderGeometry(0.6, 0.6, 0.55, 40, 1, true, -Math.PI / 2, Math.PI), visorMat, 0, y + 0.02, 0.8, head);
      visor.rotation.x = Math.PI / 2;
      const light = new PointLight(LAMP_COLORS[i], 0, 9, 1.6);
      light.position.set(0, y, 1.2);
      head.add(light);
      const glow = new Sprite(new SpriteMaterial({ map: glowTex, color: LAMP_COLORS[i], blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      glow.position.set(0, y, 0.75);
      glow.scale.setScalar(2.4);
      glow.visible = false;
      head.add(glow);
      this.lamps.push({ lens, light, glow, color, dark });
    });
    // Evden kuleye kablo (sarkık)
    const cable = new CatmullRomCurve3([new Vector3(1.2, 10.1, FRONT - 1.4), new Vector3(5, 9.6, 1.6), new Vector3(9, 10.2, 0.8), new Vector3(TOWER_X - 0.5, 11.2, TOWER_Z)]);
    this.add(new TubeGeometry(cable, 60, 0.035, 8), std('#23282e', 0.6));
  }

  // --- Kamera ----------------------------------------------------------------------------------------------

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.applyCamera();
    this.dirty = true;
    this.cb.onLayout();
  }

  /**
   * Kamera hedefi: ön ayar en-boy oranına göre (içini gösterirken "xray"); kadrajda kalması gerekenler
   * (lambalar, problar ve ev; içini gösterirken problar, ev ve kablo kanalı) dışarıda kalırsa geri çekilir.
   */
  private cameraTarget(): { name: CameraName; pos: Vector3; look: Vector3; fov: number } {
    const aspect = this.width / this.height;
    const name: CameraName = this.xray ? 'xray' : (this.preset ?? cameraFor(aspect));
    const c = CAMERAS[name];
    const probe = new Camera3(c.fov, aspect);
    const look = new Vector3(...c.look);
    const offset = new Vector3(...c.pos).sub(look);
    const keep = this.xray
      ? [...[0, 1, 2, 3].map((k) => new Vector3(TIP_X - 0.6, probeY(k), PROBE_Z)), new Vector3(0.65, 10.9, FRONT - 1.4), new Vector3(1.4, 9.2, FRONT - 1.4)]
      : [
          ...LAMP_Y.flatMap((y) => [new Vector3(TOWER_X - 0.8, HEAD_Y + y + 0.7, TOWER_Z), new Vector3(TOWER_X + 0.8, HEAD_Y + y - 0.7, TOWER_Z)]),
          ...[0, 1, 2, 3].map((k) => new Vector3(TIP_X - 0.6, probeY(k), PROBE_Z)),
          new Vector3(0.65, 10.9, FRONT - 1.4),
          // Tutamak (≈ 44 px): ölçeğin iki ucunda, yarı genişliği kadar payla.
          ...(this.handle ? [0, FULL].map((y) => new Vector3(STAFF_X - 1.1, y, FRONT)) : []),
        ];
    for (let i = 0; i < 40; i++) {
      probe.place(look.clone().add(offset), look);
      if (keep.every((p) => probe.inside(p))) break;
      offset.multiplyScalar(1.05);
    }
    return { name, pos: look.clone().add(offset), look, fov: c.fov };
  }

  /** Kamerayı hedefe hemen yerleştirir (boyut değişince; geçiş sürüyorsa hedefi güncellenir). */
  private applyCamera(): void {
    const t = this.cameraTarget();
    this.cameraName = t.name;
    this.camera.aspect = this.width / this.height;
    if (this.transition) return;
    this.camera.fov = t.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(t.pos);
    this.look.copy(t.look);
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld(true);
  }

  /** İçini göster: aç / kapat. Kamera ve malzemeler yaklaşık 0,7 s'de yumuşakça geçer. */
  setXray(on: boolean): void {
    if (on === this.xray) return;
    this.xray = on;
    this.transition = {
      from: { pos: this.camera.position.clone(), look: this.look.clone(), fov: this.camera.fov, amount: this.xrayAmount },
      start: performance.now(),
    };
    if (on) for (const l of this.outlines) l.visible = true;
    this.cameraName = on ? 'xray' : (this.preset ?? cameraFor(this.width / this.height));
    this.dirty = true;
  }

  /** Kadraj: sabit ön ayar (null: en-boy oranına göre) ve tutamağın kadrajda tutulması. */
  setFraming(preset: 'all' | null, handle: boolean): void {
    if (preset === this.preset && handle === this.handle) return;
    this.preset = preset;
    this.handle = handle;
    this.applyCamera();
    this.dirty = true;
    this.cb.onLayout();
  }

  /** Evin yakın planının yeri (kapsayıcıya göre px); null kapatır. */
  setInset(rect: { x: number; y: number; w: number; h: number } | null): void {
    const same = rect && this.inset && rect.x === this.inset.x && rect.y === this.inset.y && rect.w === this.inset.w && rect.h === this.inset.h;
    if (same || (!rect && !this.inset)) return;
    this.inset = rect;
    if (rect) {
      this.houseCamera.aspect = rect.w / rect.h;
      this.houseCamera.updateProjectionMatrix();
      this.houseCamera.updateMatrixWorld(true);
    }
    this.dirty = true;
  }

  /** Yakın plan penceresinde ekran konumu (pencereye göre px). */
  insetScreen(p: Vector3): { x: number; y: number } {
    const r = this.inset ?? { x: 0, y: 0, w: 1, h: 1 };
    const q = p.clone().project(this.houseCamera);
    return { x: ((q.x + 1) / 2) * r.w, y: ((1 - q.y) / 2) * r.h };
  }

  /** Hayalet malzemeler: a = 0 opak, 1 içini göster. */
  private applyGhosts(a: number): void {
    this.xrayAmount = a;
    for (const g of this.ghosts) {
      const transparent = a > 0.001;
      if (g.material.transparent !== transparent) g.material.needsUpdate = true;
      g.material.transparent = transparent;
      g.material.opacity = 1 + (g.opacity - 1) * a;
      g.material.depthWrite = !transparent;
    }
    for (const m of this.ghostMeshes) m.castShadow = a < 0.5;
  }

  private stepTransition(now: number): void {
    const tr = this.transition;
    if (!tr) return;
    const t = Math.min(1, (now - tr.start) / 700);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const target = this.cameraTarget();
    this.camera.position.lerpVectors(tr.from.pos, target.pos, e);
    this.look.lerpVectors(tr.from.look, target.look, e);
    this.camera.fov = tr.from.fov + (target.fov - tr.from.fov) * e;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld(true);
    this.applyGhosts(tr.from.amount + ((this.xray ? 1 : 0) - tr.from.amount) * e);
    if (t >= 1) {
      this.transition = null;
      if (!this.xray) for (const l of this.outlines) l.visible = false;
    }
    this.dirty = true;
    this.cb.onLayout();
  }

  /** İçini göster açık mı ve geçiş bitti mi (katman yakın planı ve etiketleri buna göre gösterir). */
  get xrayState(): { on: boolean; settled: boolean } {
    return { on: this.xray, settled: this.transition === null };
  }

  /** Ekran konumu (kapsayıcıya göre px). */
  screen(p: Vector3): { x: number; y: number } {
    const q = p.clone().project(this.camera);
    return { x: ((q.x + 1) / 2) * this.width, y: ((1 - q.y) / 2) * this.height };
  }

  /** Bir 3B uzunluğun (m) p noktasındaki ekran boyu (px). */
  scaleAt(p: Vector3, meters: number): number {
    const a = this.screen(p);
    const b = this.screen(p.clone().add(new Vector3(0, meters, 0)));
    return Math.abs(a.y - b.y);
  }

  /** Katman için noktalar: prob ucu ve bileziği, lamba, su yüzeyi, ölçek ve hazne bölgesi. */
  readonly points = {
    tip: (k: number) => new Vector3(TIP_X, probeY(k), PROBE_Z),
    collar: (k: number) => new Vector3(COLLAR_X, probeY(k), PROBE_Z),
    /** Lamba merkezi (1 yeşil, 2 sarı, 3 kırmızı). */
    lamp: (n: 1 | 2 | 3) => new Vector3(TOWER_X, HEAD_Y + LAMP_Y[3 - n]!, TOWER_Z + 0.6),
    /** Ölçek ve tutamak: kesit yüzünde, barajın biraz solunda. */
    staff: (level: number) => new Vector3(STAFF_X, (FULL * Math.min(100, Math.max(0, level))) / 100, FRONT),
    /** Hazne: kesit yüzündeki su bölgesinin köşesi (iyonlar). */
    water: (x: number, level: number) => new Vector3(x, (FULL * level) / 100, FRONT),
    /** Kablo kanalı (beton içinde, ortası). */
    conduit: () => new Vector3(0.35, 5.5, FRONT - 0.85),
    /** Kontrol evinin köşeleri (çatı dahil): ekranda kesikli çerçeve. */
    houseCorners: () =>
      [-0.8, 0.8].flatMap((x) => [0, 1.72].flatMap((y) => [-0.86, 0.86].map((z) => new Vector3(0.65 + x, 9.18 + y, FRONT - 1.4 + z)))),
    /** Yakın plandaki etiketlerin noktaları (evin içi). */
    house: {
      rows: [0.8, 0.62, 0.44].map((y) => new Vector3(0.65 - 0.44, 9.18 + y, FRONT - 1.4 - 0.67)),
      pcb: new Vector3(0.65 + 0.02, 9.18 + 0.92, FRONT - 1.4 - 0.7),
      battery: new Vector3(0.65 - 0.42, 9.18 + 0.16, FRONT - 1.4 - 0.5),
      terminal: new Vector3(0.65 - 0.3, 9.18 + 0.36, FRONT - 1.4 - 0.66),
      probeCables: new Vector3(0.38, 9.3, FRONT - 0.95),
      lampCable: new Vector3(0.65 + 0.55, 9.18 + 0.92, FRONT - 1.4),
    },
  };

  // --- Canlı durum -------------------------------------------------------------------------------------------

  setState(next: BarajState): void {
    const prev = this.state;
    this.state = next;
    if (prev.level !== next.level) {
      const h = Math.max(0.001, (FULL * Math.min(100, Math.max(0, next.level))) / 100);
      this.water.scale.y = h;
      this.water.position.y = h / 2;
      this.water.visible = next.level > 0.2;
      this.surface.position.y = h + 0.005;
      this.surface.visible = next.level > 0.2;
      this.surfaceLine.position.y = h;
      this.surfaceLine.visible = next.level > 0.2;
      this.dirty = true;
    }
    // Lambalar her çizimde yeni nesne olarak gelir: değer değişmediyse yeniden çizilmez.
    if (LAMP_KEYS.some((key) => Math.abs(prev.lamps[key] - next.lamps[key]) > 0.004)) {
      LAMP_KEYS.forEach((key, i) => {
        const b = Math.min(1, Math.max(0, next.lamps[key]));
        const lamp = this.lamps[i]!;
        lamp.lens.color.copy(lamp.dark).lerp(lamp.color, b);
        lamp.lens.emissiveIntensity = 0.75 * b;
        lamp.lens.roughness = 0.55 - 0.25 * b;
        lamp.lens.envMapIntensity = 0.08 + 0.92 * b;
        lamp.light.intensity = 6 * b;
        lamp.light.visible = b > 0.02;
        (lamp.glow.material as SpriteMaterial).opacity = 0.55 * b;
        lamp.glow.visible = b > 0.02;
      });
      this.dirty = true;
    }
    if (prev.currents !== next.currents && !this.bubbling()) this.placeBubbles(0);
  }

  /** Akım taşıyan ıslak prob var mı (kabarcıklar akar, sahne sürekli çizilir). */
  private bubbling(): boolean {
    const c = this.state.currents;
    return c !== null && c.some((a, k) => Math.abs(a) >= 2e-6 && this.state.wet[k] === true);
  }

  /** Kabarcıklar: katotta (akım probdan suya değil, sudan proba) H₂ daha çok, anotta O₂ yarısı kadar. */
  private placeBubbles(t: number): void {
    const c = this.state.currents;
    const surfaceY = (FULL * this.state.level) / 100;
    this.bubbles.forEach((pool, k) => {
      const current = c?.[k] ?? 0;
      const abs = Math.abs(current);
      const active = c !== null && abs >= 2e-6 && this.state.wet[k] === true;
      const streams = Math.min(4, 1 + Math.floor(abs / 0.15e-3));
      const count = !active ? 0 : current < 0 ? streams * 2 : Math.max(1, streams);
      pool.forEach((b, m) => {
        if (m >= count) {
          b.visible = false;
          return;
        }
        const seed = Math.sin((k * 9 + m) * 127.1) * 43758.5453;
        const phase = seed - Math.floor(seed);
        const age = (t * (0.45 + 0.12 * (m % 4)) + phase) % 1;
        const y = 0.14 + age * 1.1;
        b.visible = probeY(k) + y < surfaceY - 0.04;
        b.position.set(TIP_X + (phase - 0.5) * 0.3 + 0.03 * Math.sin(t * 5 + m), y, (((m * 0.37) % 1) - 0.5) * 0.2);
        b.scale.setScalar(current < 0 ? 0.03 : 0.045);
      });
    });
    this.dirty = true;
  }

  // --- Çizim ------------------------------------------------------------------------------------------------

  private readonly tick = () => {
    const now = performance.now();
    this.stepTransition(now);
    if (this.bubbling()) this.placeBubbles((now - this.start) / 1000);
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    // Evin yakın planı: aynı sahne, ikinci kamera, sahnenin içindeki pencereye.
    const r = this.inset;
    if (r) {
      const y = this.height - r.y - r.h;
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(r.x, y, r.w, r.h);
      this.renderer.setViewport(r.x, y, r.w, r.h);
      this.renderer.render(this.scene, this.houseCamera);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.width, this.height);
    }
  };

  /** Hangi kamera ön ayarı seçildi (denetim). */
  get view(): string {
    return this.cameraName;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.scene.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineSegments) {
        o.geometry.dispose();
        const materials: Material[] = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials) m.dispose();
      }
      if (o instanceof Sprite) o.material.dispose();
    });
    for (const t of this.textures) t.dispose();
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
