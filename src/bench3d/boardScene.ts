// Karta aktar'ın 3B sahnesi: tek kart (baskı devre ya da delikli plaket), tezgâhla aynı ışık, yörünge
// denetimi ve koyu tema (stage.ts). Üst yüz / alt yüz kartı çevirir; vurgulanan parçanın çevresinde mavi
// çerçeve (yalın kartta pedlerinde halka). HTML katmanı ([data-anchor] öğeleri: eksik bağlantı
// rozetleri, delik etiketleri, ipucu) her çizimden sonra 3B noktaların ekrandaki yerine taşınır.
// Yalnızca bir şey değişince çizer.

import { Box3, Color, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, TorusGeometry, Vector2, Vector3, type Object3D, type PMREMGenerator, type WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ACCENT, T, type BoardModel } from './boardModels';
import { BACKGROUND, createControls, createRenderer, lightScene, radialTexture } from './stage';

export interface BoardSceneCallbacks {
  /** İmleç bir parçanın üstüne geldi (ref; yoksa null). Konum HTML katmanındaki "hover" bağlantısıyla. */
  onHover(ref: string | null): void;
}

export type BoardSide = 'top' | 'bottom';

/** Kamera: önden sola yukarıdan (azimut −28°, yükseklik 52°), çizimlerdeki gibi. */
const AZIMUTH = (-28 * Math.PI) / 180;
const ELEVATION = (52 * Math.PI) / 180;
/** Kart masanın biraz üstünde: altındaki gölge görünsün; alt yüzde parçalar aşağı sarkar. */
const LIFT = 0.35;

export class BoardScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.3, 4000);
  private readonly controls: OrbitControls;
  private readonly pmrem: PMREMGenerator;
  private readonly holder = new Group();
  private readonly marks = new Group();
  private readonly shadowTexture = radialTexture('rgba(20,30,40,0.34)', 'rgba(20,30,40,0)');
  private readonly shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false }));
  private readonly observer: ResizeObserver;
  private model: BoardModel | null = null;
  private side: BoardSide = 'top';
  private highlight: string | null = null;
  private hover: string | null = null;
  private overlay: HTMLElement | null = null;
  private readonly overlayObserver = new MutationObserver(() => (this.dirty = true));
  private dirty = true;
  private fitted = false;
  private userMoved = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: BoardSceneCallbacks,
  ) {
    this.renderer = createRenderer(container);
    this.pmrem = lightScene(this.scene, this.renderer);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.scene.add(this.shadow, this.holder);
    this.holder.add(this.marks);
    const canvas = this.renderer.domElement;
    this.controls = createControls(this.camera, canvas, { min: 6, max: 600 });
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => (this.userMoved = true));
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.fitted && !this.userMoved) this.fit();
    this.dirty = true;
  }

  /** Yeni kart (ya da aynı kartın yeni adımı): eskisi bırakılır; kamera kullanıcı oynatmadıysa sığdırılır. */
  setModel(model: BoardModel, refit = false): void {
    if (this.model) {
      this.model.root.removeFromParent();
      this.model.dispose();
    }
    this.model = model;
    this.holder.add(model.root);
    this.applySide();
    this.applyHighlight();
    if (!this.fitted || refit) {
      this.fit();
      this.fitted = true;
    }
    this.dirty = true;
  }

  setSide(side: BoardSide): void {
    if (side === this.side) return;
    this.side = side;
    this.applySide();
    this.dirty = true;
  }

  /** Alt yüz: kart x ekseni çevresinde çevrilir (parçalar aşağıda, lehim noktaları ve alt bakır üstte). */
  private applySide(): void {
    const bottom = this.side === 'bottom';
    this.holder.rotation.x = bottom ? Math.PI : 0;
    this.holder.position.y = bottom ? T + LIFT : LIFT;
    this.holder.updateMatrixWorld(true);
    const box = this.model ? new Box3().setFromObject(this.model.root) : null;
    if (box && !box.isEmpty()) {
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      this.shadow.position.set(center.x, 0.01, center.z);
      this.shadow.scale.set(size.x * 1.3 + 2, size.z * 1.3 + 2, 1);
    }
  }

  /** Parçayı vurgula: gövdesinin çevresinde mavi çerçeve; gövde yoksa pedlerinde halka. */
  setHighlight(ref: string | null): void {
    if (ref === this.highlight) return;
    this.highlight = ref;
    this.applyHighlight();
    this.dirty = true;
  }

  private applyHighlight(): void {
    for (const child of [...this.marks.children]) {
      child.removeFromParent();
      if (child instanceof Mesh) child.geometry.dispose();
    }
    const info = this.highlight ? this.model?.parts.get(this.highlight) : undefined;
    if (!info) return;
    if (info.group) {
      const b = info.box;
      const pad = 0.6;
      const w = b.max.x - b.min.x + pad;
      const d = b.max.z - b.min.z + pad;
      const cx = (b.min.x + b.max.x) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      for (const [x, z, sx, sz] of [
        [cx, cz - d / 2, w, 0.12],
        [cx, cz + d / 2, w, 0.12],
        [cx - w / 2, cz, 0.12, d],
        [cx + w / 2, cz, 0.12, d],
      ] as const) {
        const edge = new Mesh(new PlaneGeometry(sx, sz), ACCENT);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(x, T + 0.08, z);
        this.marks.add(edge);
      }
    } else {
      for (const p of info.pads) {
        const ring = new Mesh(new TorusGeometry(0.62, 0.06, 8, 28), ACCENT);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.x, T + 0.08, p.z);
        this.marks.add(ring);
      }
    }
  }

  setTheme(dark: boolean): void {
    this.scene.background = new Color(dark ? BACKGROUND.dark : BACKGROUND.light);
    this.dirty = true;
  }

  /** Bütün kart görünsün: önden, sola ve yukarıdan. */
  fit(): void {
    this.userMoved = false;
    const box = this.model ? new Box3().setFromObject(this.holder) : new Box3(new Vector3(-20, 0, -15), new Vector3(20, 4, 15));
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const radius = Math.max(size.x, size.z * 1.15, 12) / 2;
    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect;
    const distance = (radius / Math.tan(fov / 2)) * (aspect < 1.2 ? 1.45 / Math.max(0.5, aspect) : 1.22);
    // Hedef kartın ortasından biraz öne: kart sahnenin üst kısmında, alttaki araç hapının üstünde kalır.
    const aim = center.clone().add(new Vector3(Math.sin(AZIMUTH), 0, Math.cos(AZIMUTH)).multiplyScalar(size.z * 0.1));
    this.controls.target.copy(aim);
    this.camera.position.set(
      aim.x + distance * Math.cos(ELEVATION) * Math.sin(AZIMUTH),
      aim.y + distance * Math.sin(ELEVATION),
      aim.z + distance * Math.cos(ELEVATION) * Math.cos(AZIMUTH),
    );
    this.camera.near = Math.max(0.2, distance / 300);
    this.camera.far = distance * 30;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.dirty = true;
  }

  /** Yakınlaştır (factor < 1) ya da uzaklaştır (> 1). */
  zoom(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const length = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, offset.length() * factor));
    this.camera.position.copy(this.controls.target).add(offset.setLength(length));
    this.controls.update();
    this.userMoved = true;
    this.dirty = true;
  }

  /** Kartın bir noktasına yaklaş ("Göster"): bakış yönü korunur. */
  focus(key: string, distance = 22): void {
    const local = this.model?.focus.get(key);
    if (!local || !this.model) return;
    const point = local.clone().applyMatrix4(this.model.root.matrixWorld);
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(distance);
    this.controls.target.copy(point);
    this.camera.position.copy(point).add(offset);
    this.controls.update();
    this.userMoved = true;
    this.dirty = true;
  }

  /** HTML katmanı: [data-anchor] öğeleri kart noktalarının ekran yerine taşınır. */
  setOverlay(el: HTMLElement | null): void {
    this.overlayObserver.disconnect();
    this.overlay = el;
    if (el) this.overlayObserver.observe(el, { childList: true, subtree: true });
    this.dirty = true;
  }

  private anchorWorld(key: string): Vector3 | null {
    const model = this.model;
    if (!model) return null;
    if (key === 'hover') {
      const info = this.hover ? model.parts.get(this.hover) : undefined;
      if (!info) return null;
      const b = info.box;
      const top = this.side === 'bottom' ? b.min.y : b.max.y;
      return new Vector3((b.min.x + b.max.x) / 2, top, (b.min.z + b.max.z) / 2).applyMatrix4(model.root.matrixWorld);
    }
    const local = model.anchors.get(key);
    return local ? local.clone().applyMatrix4(model.root.matrixWorld) : null;
  }

  private positionOverlay(): void {
    const el = this.overlay;
    if (!el) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (const item of el.querySelectorAll<HTMLElement>('[data-anchor]')) {
      const world = this.anchorWorld(item.dataset.anchor ?? '');
      const p = world?.project(this.camera);
      if (!p || p.z > 1) {
        item.style.visibility = 'hidden';
        continue;
      }
      item.style.visibility = '';
      item.style.transform = `translate(${Math.round(((p.x + 1) / 2) * w)}px, ${Math.round(((1 - p.y) / 2) * h)}px)`;
    }
  }

  // --- İşaretçi: parçanın üstüne gelince ipucu ------------------------------------------------------

  private pick(e: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    for (const hit of ray.intersectObject(this.holder, true)) {
      let o: Object3D | null = hit.object;
      while (o && o.userData.ref === undefined) o = o.parent;
      if (o) return o.userData.ref as string;
    }
    return null;
  }

  private readonly onPointerMove = (e: PointerEvent) => {
    if (e.buttons !== 0) return;
    const ref = this.pick(e);
    if (ref === this.hover) return;
    this.hover = ref;
    this.cb.onHover(ref);
    this.dirty = true;
  };

  private readonly onPointerLeave = () => {
    if (this.hover === null) return;
    this.hover = null;
    this.cb.onHover(null);
  };

  private readonly tick = () => {
    const moved = this.controls.update();
    if (!(this.dirty || moved)) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.positionOverlay();
  };

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.overlayObserver.disconnect();
    this.controls.dispose();
    this.model?.dispose();
    this.applyHighlightClear();
    this.shadow.geometry.dispose();
    (this.shadow.material as MeshBasicMaterial).dispose();
    this.shadowTexture.dispose();
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private applyHighlightClear(): void {
    this.highlight = null;
    this.applyHighlight();
  }
}
