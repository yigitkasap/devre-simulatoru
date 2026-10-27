// 3B tezgâh sahnesi: masa, ışık, kamera ve yörünge denetimi; parçalar şemadaki yerlerinde, kablolar
// uçlarından yukarı kıvrılan atlama kabloları. Yalnızca bir şey değişince (kamera, canlı değer,
// devre) çizer.

import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  Color,
  CubicBezierCurve3,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
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
import { pinPositions } from '../model/geometry';
import type { CircuitDoc, Part } from '../model/types';
import { M, SPREAD, mat, mergeStatic, mesh } from './kit';
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

/** Kablo renkleri (ağ başına); toprak siyah, besleme kırmızı. */
const CABLE_COLORS = ['#f08a24', '#f2c230', '#2f9e5b', '#2f6fd6', '#8e5bd1', '#e9ecef', '#18a3a8', '#d64b8a'];

interface Placed {
  readonly key: string;
  part: Part;
  readonly model: PartModel;
  readonly group: Group;
  readonly shadow: Mesh;
  /** Kabloların bağlandığı uçlar (dünya koordinatı). */
  readonly anchors: Vector3[];
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
    this.scene.add(this.ring, this.partsGroup, this.cables);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 900;
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => (this.userMoved = true));

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
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
    const seen = new Set<string>();
    let changed = false;
    for (const part of doc.parts) {
      seen.add(part.id);
      const key = partKey(part);
      const old = this.parts.get(part.id);
      if (old && old.key === key) {
        old.part = part;
        continue;
      }
      if (old) this.removePart(old);
      this.parts.set(part.id, this.placePart(part, key));
      changed = true;
    }
    for (const [id, placed] of this.parts) {
      if (!seen.has(id)) {
        this.removePart(placed);
        this.parts.delete(id);
        changed = true;
      }
    }
    this.buildCables(doc);
    if (changed || !this.fitted) {
      if (!this.fitted && doc.parts.length > 0) {
        this.fit();
        this.fitted = true;
      }
    }
    this.applyFrame();
    this.updateRing();
    this.dirty = true;
  }

  private placePart(part: Part, key: string): Placed {
    const model = buildPartModel(part);
    const group = new Group();
    group.add(model.root);
    group.position.set(part.x * SPREAD, 0, part.y * SPREAD);
    group.rotation.y = (-part.rotation * Math.PI) / 180;
    group.userData.partId = part.id;
    mergeStatic(model.root);
    this.partsGroup.add(group);
    group.updateMatrixWorld(true);
    const anchors = model.anchors.map((a) => a.clone().applyMatrix4(group.matrixWorld));
    // Gölge: gövdenin kapladığı alanın altında yumuşak leke.
    const box = new Box3().setFromObject(model.root);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const shadow = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(center.x, 0.02, center.z);
    shadow.scale.set(size.x * 1.35 + 2, size.z * 1.35 + 2, 1);
    this.scene.add(shadow);
    return { key, part, model, group, shadow, anchors };
  }

  private removePart(placed: Placed): void {
    placed.group.removeFromParent();
    placed.shadow.removeFromParent();
    (placed.shadow.material as Material).dispose();
    placed.shadow.geometry.dispose();
    placed.model.dispose?.();
    disposeObject(placed.group);
  }

  /** Kablolar: her kablo uçtan uca bir atlama kablosu; pin olmayan uçlarda bir bağlantı klemensi. */
  private buildCables(doc: CircuitDoc): void {
    for (const child of [...this.cables.children]) {
      child.removeFromParent();
      disposeObject(child);
    }
    const at = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    const pins = new Map<string, { part: Placed; pin: number }>();
    for (const placed of this.parts.values()) {
      pinPositions(placed.part).forEach((p, pin) => pins.set(at(p), { part: placed, pin }));
    }
    // Ağlar: kablo uçları ve pinler (birleşim-bulma).
    const parent = new Map<string, string>();
    const find = (k: string): string => {
      let r = k;
      while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
      parent.set(k, r);
      return r;
    };
    const union = (a: string, b: string) => parent.set(find(a), find(b));
    for (const w of doc.wires) {
      const a = at(w.points[0]!);
      const b = at(w.points[w.points.length - 1]!);
      if (!parent.has(a)) parent.set(a, a);
      if (!parent.has(b)) parent.set(b, b);
      union(a, b);
    }
    const netColor = new Map<string, string>();
    const role = (k: string): 'ground' | 'supply' | null => {
      const pin = pins.get(k);
      if (!pin) return null;
      const t = pin.part.part.type;
      if (t === 'ground' || (t === 'arduino' && (pin.pin === 2 || pin.pin === 21))) return 'ground';
      if ((t === 'battery' && pin.pin === 1) || (t === 'dcsupply' && pin.pin % 2 === 1)) return 'ground';
      if ((t === 'arduino' && pin.pin <= 1) || (t === 'battery' && pin.pin === 0) || (t === 'dcsupply' && pin.pin % 2 === 0)) return 'supply';
      return null;
    };
    const roles = new Map<string, 'ground' | 'supply'>();
    for (const k of parent.keys()) {
      const r = role(k);
      if (r && roles.get(find(k)) !== 'ground') roles.set(find(k), r);
    }
    let next = 0;
    const colorOf = (k: string) => {
      const root = find(k);
      let c = netColor.get(root);
      if (!c) {
        const r = roles.get(root);
        c = r === 'ground' ? '#1b1c1f' : r === 'supply' ? '#d22f27' : CABLE_COLORS[next++ % CABLE_COLORS.length]!;
        netColor.set(root, c);
      }
      return c;
    };
    const junctions = new Map<string, Vector3>();
    const endpoint = (p: { x: number; y: number }): Vector3 => {
      const pin = pins.get(at(p));
      if (pin) return pin.part.anchors[pin.pin]!.clone();
      let j = junctions.get(at(p));
      if (!j) {
        j = new Vector3(p.x * SPREAD, 1.9, p.y * SPREAD);
        junctions.set(at(p), j);
      }
      return j.clone();
    };
    const plug = new BoxGeometry(0.75, 1.5, 0.75);
    const plugMat = mat('#1b1c1f', 0.6);
    for (const w of doc.wires) {
      const a = endpoint(w.points[0]!);
      const b = endpoint(w.points[w.points.length - 1]!);
      const color = colorOf(at(w.points[0]!));
      const dist = a.distanceTo(b);
      const lift = Math.min(16, 2.5 + 0.22 * dist);
      const a1 = a.clone().add(new Vector3(0, 1.4, 0));
      const b1 = b.clone().add(new Vector3(0, 1.4, 0));
      const curve = new CubicBezierCurve3(a1, a1.clone().add(new Vector3(0, lift, 0)), b1.clone().add(new Vector3(0, lift, 0)), b1);
      const tube = new Mesh(new TubeGeometry(curve, Math.max(12, Math.round(dist * 1.5)), 0.3, 8, false), mat(color, 0.55));
      this.cables.add(tube);
      for (const p of [a, b]) this.cables.add(mesh(plug, plugMat, p.x, p.y + 0.75, p.z));
    }
    const post = new CylinderGeometry(0.55, 0.7, 1.9, 14);
    for (const j of junctions.values()) {
      this.cables.add(mesh(post, M.gold(), j.x, 0.95, j.z));
    }
    this.dirty = true;
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
      this.ring.position.set(placed.shadow.position.x, 0.03, placed.shadow.position.z);
      this.ring.scale.set(placed.shadow.scale.x * 0.8, placed.shadow.scale.y * 0.8, 1);
    }
    this.dirty = true;
  }

  // --- Kamera ---------------------------------------------------------------------------------------

  /** Bütün devre görünsün: önden ve yukarıdan (55°) bakış. */
  fit(top = false): void {
    this.lastFitTop = top;
    this.userMoved = false;
    const box = new Box3();
    for (const placed of this.parts.values()) box.expandByObject(placed.group);
    for (const c of this.cables.children) box.expandByObject(c);
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

