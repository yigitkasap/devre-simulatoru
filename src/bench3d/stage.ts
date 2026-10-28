// 3B sahnelerin ortak kurulumu: çizici (ACES ton eşleme), ışık (RoomEnvironment, yarımküre ışığı,
// güneş), yörünge denetimi (fare eşlemesi) ve tema arka planı. Tezgâh (scene.ts) ve Karta aktar'ın kart
// sahnesi (boardScene.ts) aynı ayarları kullanır: ikisi yan yana görününce ışık ve kamera aynı davranır.

import { ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight, HemisphereLight, MOUSE, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Arka plan: açık temada açık gri, koyu temada koyu (global.css'teki --color-bench ile aynı). */
export const BACKGROUND = { light: '#dfe3e8', dark: '#161c22' } as const;

/** Çizici: kenar yumuşatma, en çok 2× piksel oranı, ACES ton eşleme; tuval kapsayıcıyı doldurur. */
export function createRenderer(container: HTMLElement): WebGLRenderer {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  return renderer;
}

/** Işık: oda ortamı (yansımalar), yarımküre ışığı ve yukarıdan güneş; arka plan açık tema. */
export function lightScene(scene: Scene, renderer: WebGLRenderer): PMREMGenerator {
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  scene.background = new Color(BACKGROUND.light);
  scene.add(new HemisphereLight('#ffffff', '#aab4bf', 0.55));
  const sun = new DirectionalLight('#ffffff', 1.5);
  sun.position.set(40, 90, 30);
  scene.add(sun);
  return pmrem;
}

/**
 * Yörünge denetimi. Fare: sol tuş kaydırır, orta tuş döndürür (kullanıcı isteği); orta tuşu olmayan
 * dokunmatik yüzeyler için sağ tuş da döndürür. Tekerlek yakınlaştırır. Dokunmatikte tek parmak döndürür,
 * iki parmak yakınlaştırıp kaydırır.
 */
export function createControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement, distance: { min: number; max: number }): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.ROTATE };
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = distance.min;
  controls.maxDistance = distance.max;
  // Orta tuş: tarayıcının otomatik kaydırması (Windows) döndürmeyi bozmasın.
  canvas.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());
  canvas.addEventListener('auxclick', (e) => e.button === 1 && e.preventDefault());
  // iOS: dokunuş sayfayı kaydırmasın, yakınlaştırmasın.
  const prevent = (e: TouchEvent) => e.preventDefault();
  canvas.addEventListener('touchstart', prevent, { passive: false });
  canvas.addEventListener('touchmove', prevent, { passive: false });
  return controls;
}

/** Yumuşak gölge lekesi (parçaların ve kartın altında). */
export function radialTexture(inner: string, outer: string): CanvasTexture {
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
