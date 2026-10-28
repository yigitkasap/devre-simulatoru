// Ayrık parçaların 3B modelleri: direnç, kondansatör, bobin, potansiyometre, LDR, NTC, sigorta,
// diyotlar, LED, transistörler, anahtar, lamba, hoparlör, buzzer, motor, röle, transformatör, pil,
// AC kaynak, toprak ve entegre modülleri (741, 555). Ölçüler gerçek parçalardan (birim 2,54 mm).

import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { LED_COLORS, LED_MODELS } from '../sim/devices/led';
import { boolProp, numProp, strProp } from '../sim/netlist';
import type { DeviceType, Props } from '../sim/netlist';
import {
  LEAD_Y,
  M,
  SPREAD,
  canvasTexture,
  labelPlate,
  lead,
  legDown,
  mat,
  mesh,
  ownMat,
  pinAnchors,
  resistorBands,
  rod,
  wirePath,
} from './kit';
import { glowSprite, type LiveContext, type PartModel } from './model';

const X_AXIS = Math.PI / 2;

/** Eksenli gövde (X ekseni boyunca) için döndürülmüş silindir. */
function axialCylinder(r: number, length: number, material: MeshStandardMaterial, x = 0, y = 0, z = 0, segments = 20): Mesh {
  const m = mesh(new CylinderGeometry(r, r, length, segments), material, x, y, z);
  m.rotation.z = X_AXIS;
  return m;
}

/** İki uçlu eksenli parça: gövde ortada, bacaklar pinlere. */
function axial(type: DeviceType, body: Group, halfLength: number, height: number): PartModel {
  const root = new Group();
  const anchors = pinAnchors(type);
  body.position.y = height;
  root.add(body);
  root.add(lead(new Vector3(-halfLength, height, 0), anchors[0]!));
  root.add(lead(new Vector3(halfLength, height, 0), anchors[1]!));
  return { root, anchors };
}

/** Dik duran (radyal) iki bacaklı parça: bacaklar gövdenin altından iner, masada pinlere gider. */
function radial(type: DeviceType, body: Group, spacing: number, legTop: number): PartModel {
  const root = new Group();
  const anchors = pinAnchors(type);
  root.add(body);
  root.add(legDown(new Vector3(-spacing / 2, legTop, 0), anchors[0]!));
  root.add(legDown(new Vector3(spacing / 2, legTop, 0), anchors[1]!));
  return { root, anchors };
}

// --- Direnç ------------------------------------------------------------------------------------------

export function resistorModel(props: Props): PartModel {
  const ohms = numProp(props, 'resistance', 1000);
  const body = new Group();
  const L = 1.3;
  const profile = [
    [0, -L], [0.28, -L], [0.46, -1.15], [0.5, -0.85], [0.42, -0.62], [0.42, 0.62], [0.5, 0.85], [0.46, 1.15], [0.28, L], [0, L],
  ].map(([r, y]) => new Vector2(r!, y!));
  const shell = mesh(new LatheGeometry(profile, 24), mat('#d9c49a', 0.6));
  shell.rotation.z = X_AXIS;
  body.add(shell);
  const bands = resistorBands(ohms);
  [-0.8, -0.42, -0.08, 0.85].forEach((x, i) => {
    const r = Math.abs(x) > 0.7 ? 0.505 : 0.43;
    body.add(axialCylinder(r, 0.17, mat(bands[i]!, 0.5), x, 0, 0, 20));
  });
  return axial('resistor', body, L, 1.0);
}

// --- Kondansatör ---------------------------------------------------------------------------------------

export function capacitorModel(props: Props): PartModel {
  const kind = strProp(props, 'kind', ['electrolytic', 'film'], 'electrolytic');
  const C = numProp(props, 'capacitance', 1e-6);
  const body = new Group();
  if (kind === 'electrolytic') {
    const r = Math.min(3, Math.max(0.8, 1.0 * (C / 10e-6) ** (1 / 6)));
    const h = 2.1 * r + 2;
    const base = 0.9;
    body.add(mesh(new CylinderGeometry(r, r, h, 28), mat('#20325c', 0.45), 0, base + h / 2, 0));
    // − ucunu gösteren açık şerit (sağdaki pin −).
    body.add(mesh(new CylinderGeometry(r + 0.01, r + 0.01, h * 0.96, 10, 1, true, -0.35 + X_AXIS, 0.7), mat('#c9ced6', 0.5), 0, base + h / 2, 0));
    const top = mesh(new CylinderGeometry(r * 0.92, r * 0.92, 0.06, 28), M.steel(), 0, base + h + 0.02, 0);
    body.add(top);
    const vent = mesh(new BoxGeometry(r * 1.2, 0.02, 0.08), mat('#6b7178', 0.4, 1), 0, base + h + 0.06, 0);
    body.add(vent, mesh(new BoxGeometry(0.08, 0.02, r * 1.2), mat('#6b7178', 0.4, 1), 0, base + h + 0.06, 0));
    return radial('capacitor', body, Math.min(r, 1), base);
  }
  // Seramik disk.
  const disc = mesh(new CylinderGeometry(1.1, 1.1, 0.45, 26), mat('#d9862f', 0.6), 0, 2.4, 0);
  disc.rotation.x = X_AXIS;
  body.add(disc);
  return radial('capacitor', body, 1, 1.4);
}

// --- Bobin (radyal ferrit, Bourns RLB1314) --------------------------------------------------------------

export function inductorModel(): PartModel {
  const body = new Group();
  const ferrite = mat('#2f3236', 0.7);
  body.add(mesh(new CylinderGeometry(2.4, 2.4, 0.5, 28), ferrite, 0, 1.05, 0));
  body.add(mesh(new CylinderGeometry(2.15, 2.15, 3.6, 28), M.copper(), 0, 3.1, 0));
  body.add(mesh(new CylinderGeometry(2.4, 2.4, 0.5, 28), ferrite, 0, 5.15, 0));
  return radial('inductor', body, 2, 0.8);
}

// --- Potansiyometre (Bourns PTV09A, döner düğme) -----------------------------------------------------

export function potentiometerModel(props: Props): PartModel {
  const root = new Group();
  const anchors = pinAnchors('potentiometer');
  root.add(mesh(new BoxGeometry(4, 2, 4.4), mat('#2c5aa0', 0.5), 0, 1.4, 0));
  root.add(mesh(new CylinderGeometry(0.9, 0.9, 0.6, 20), M.steel(), 0, 2.7, 0));
  const knob = new Group();
  knob.userData.live = true;
  const grip = mesh(new CylinderGeometry(1.45, 1.55, 1.6, 24), mat('#1f2328', 0.55), 0, 0, 0);
  knob.add(grip);
  const mark = mesh(new BoxGeometry(0.22, 0.05, 1.1), M.white(), 0, 0.82, -0.75);
  knob.add(mark);
  knob.position.y = 3.8;
  root.add(knob);
  // Bacaklar gövdenin önünden (üç bacak yan yana), sürgü bacağı arkaya.
  root.add(legDown(new Vector3(-1.2, 0.5, 1.6), anchors[0]!));
  root.add(legDown(new Vector3(0, 0.5, -1.6), anchors[1]!));
  root.add(legDown(new Vector3(1.2, 0.5, 1.6), anchors[2]!));
  const angle = (position: number) => (0.5 - position / 100) * 1.5 * Math.PI;
  knob.rotation.y = angle(numProp(props, 'position', 50));
  return {
    root,
    anchors,
    interaction: 'knob',
    update(ctx: LiveContext) {
      knob.rotation.y = angle(numProp(ctx.props, 'position', 50));
      return false;
    },
  };
}

// --- LDR ve NTC --------------------------------------------------------------------------------------

export function ldrModel(): PartModel {
  const body = new Group();
  const face = canvasTexture(2.2, 2.2, (ctx, W, H) => {
    ctx.fillStyle = '#e9e3d6';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c4572a';
    ctx.lineWidth = W * 0.07;
    ctx.beginPath();
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const y = H * (0.2 + (0.6 * i) / n);
      ctx.moveTo(W * 0.22, y);
      ctx.lineTo(W * 0.78, y);
    }
    ctx.stroke();
  });
  const disc = mesh(new CylinderGeometry(1.0, 1.0, 0.45, 26), mat('#efe9dd', 0.4), 0, 2.0, 0);
  body.add(disc);
  const top = new Mesh(new PlaneGeometry(1.9, 1.9), new MeshStandardMaterial({ map: face, transparent: true, roughness: 0.35 }));
  top.rotation.x = -X_AXIS;
  top.position.y = 2.235;
  top.userData.ownsMaterial = true;
  body.add(top);
  return radial('ldr', body, 1.4, 1.8);
}

export function ntcModel(): PartModel {
  const body = new Group();
  const bead = mesh(new SphereGeometry(0.62, 18, 14), mat('#262a30', 0.35), 0, 2.2, 0);
  bead.scale.set(1, 1.25, 0.8);
  body.add(bead);
  return radial('ntc', body, 0.6, 1.7);
}

// --- Sigorta (5 × 20 mm cam, yuvada) -------------------------------------------------------------------

export function fuseModel(): PartModel {
  const root = new Group();
  const anchors = pinAnchors('fuse');
  root.add(mesh(new BoxGeometry(9.6, 0.6, 2.6), mat('#24272b', 0.6), 0, 0.3, 0));
  for (const x of [-3.4, 3.4]) {
    root.add(mesh(new BoxGeometry(1.0, 1.6, 2.0), M.tin(), x, 1.3, 0));
  }
  const glass = axialCylinder(0.95, 5.4, mat('#dfe9ef', 0.05, 0, { transparent: true, opacity: 0.35 }), 0, 1.9, 0, 22);
  root.add(glass);
  root.add(axialCylinder(1.0, 1.1, M.tin(), -3.4, 1.9, 0), axialCylinder(1.0, 1.1, M.tin(), 3.4, 1.9, 0));
  const element = axialCylinder(0.06, 5.4, M.tin(), 0, 1.9, 0, 6);
  element.userData.live = true;
  root.add(element);
  const soot = axialCylinder(0.9, 2.2, ownMat('#2a2420', 0.9, 0, { transparent: true, opacity: 0.7 }), 0, 1.9, 0, 18);
  soot.userData.live = true;
  soot.visible = false;
  root.add(soot);
  root.add(legDown(new Vector3(-3.4, 0.4, 0), anchors[0]!), legDown(new Vector3(3.4, 0.4, 0), anchors[1]!));
  return {
    root,
    anchors,
    update(ctx) {
      const blown = ctx.live?.burned ?? false;
      element.visible = !blown;
      soot.visible = blown;
      return false;
    },
  };
}

// --- Diyotlar ------------------------------------------------------------------------------------------

export function diodeModel(): PartModel {
  const body = new Group();
  body.add(axialCylinder(0.53, 2.05, mat('#1c1d20', 0.4)));
  body.add(axialCylinder(0.545, 0.3, mat('#c8ccd0', 0.4), 0.72, 0, 0));
  return axial('diode', body, 1.03, 1.0);
}

export function zenerModel(): PartModel {
  const body = new Group();
  body.add(axialCylinder(0.36, 1.5, mat('#d9792b', 0.05, 0, { transparent: true, opacity: 0.8 })));
  body.add(axialCylinder(0.37, 0.22, mat('#151515', 0.4), 0.55, 0, 0));
  return axial('zener', body, 0.75, 1.0);
}

// --- LED (5 mm) --------------------------------------------------------------------------------------------

export function ledModel(props: Props): PartModel {
  const color = strProp(props, 'color', LED_COLORS, 'red');
  const light = LED_MODELS[color]?.lightColor ?? '#ff3b30';
  const body = new Group();
  const lens = new MeshStandardMaterial({ color: light, roughness: 0.15, transparent: true, opacity: 0.82, emissive: light, emissiveIntensity: 0 });
  const dome = new Group();
  dome.userData.live = true;
  dome.add(mesh(new CylinderGeometry(1.0, 1.0, 1.7, 26), lens, 0, 2.95, 0));
  dome.add(mesh(new SphereGeometry(1.0, 26, 14, 0, Math.PI * 2, 0, Math.PI / 2), lens, 0, 3.8, 0));
  // Taban halkasının katot tarafı (+x, ikinci uç) düzdür: gerçek 5 mm LED'deki kutup işareti.
  const flat = 0.95;
  const cut = Math.acos(flat / 1.15);
  const rim = new Shape();
  rim.absarc(0, 0, 1.15, cut, Math.PI * 2 - cut, false);
  rim.lineTo(flat, 1.15 * Math.sin(cut));
  const flange = new ExtrudeGeometry(rim, { depth: 0.3, bevelEnabled: false, curveSegments: 26 });
  flange.rotateX(-Math.PI / 2);
  dome.add(mesh(flange, lens, 0, 2.0, 0));
  body.add(dome);
  const glow = glowSprite(light, 7);
  glow.position.y = 3.5;
  body.add(glow);
  // Anot bacağı daha uzundur: deliğe takılınca fazlası küçük bir kıvrım olarak görünür.
  const root = new Group();
  const anchors = pinAnchors('led');
  root.add(body);
  const top = new Vector3(-0.5, 2.0, 0);
  const bend = [top, new Vector3(-0.5, 1.75, 0), new Vector3(-0.78, 1.5, 0), new Vector3(-0.5, 1.25, 0)];
  root.add(wirePath(bend, 0.14, M.tin(), 6), legDown(bend[3]!, anchors[0]!));
  root.add(legDown(new Vector3(0.5, 2.0, 0), anchors[1]!));
  const model: PartModel = { root, anchors };
  return {
    ...model,
    update(ctx) {
      const b = ctx.active && !(ctx.live?.burned ?? false) ? (ctx.live?.brightness ?? 0) : 0;
      lens.emissiveIntensity = 0.1 + 2.4 * b;
      lens.color.set(ctx.live?.burned ? '#3a3a3a' : light);
      glow.set(b);
      return false;
    },
    dispose() {
      lens.dispose();
    },
  };
}

// --- Transistörler (TO-92) -----------------------------------------------------------------------------

const TRANSISTOR_TEXT: Partial<Record<DeviceType, string>> = { npn: 'BC547', pnp: 'BC557', njfet: '2N5457', pjfet: '2N5460', nmos: '2N7000', pmos: 'BS250' };

export function transistorModel(type: DeviceType, props: Props): PartModel {
  const root = new Group();
  const anchors = pinAnchors(type);
  const model = typeof props.model === 'string' ? props.model : '';
  const text = model && model !== 'genel' ? model.replace(/B$/, '') : (TRANSISTOR_TEXT[type] ?? '');
  const h = 1.8;
  const y0 = 2.0;
  // Yarım silindirin eğri yüzü +x'te; düz (yazılı) yüz -x'e bakar.
  const shell = mesh(new CylinderGeometry(0.95, 0.95, h, 24, 1, false, 0, Math.PI), mat('#1b1c1f', 0.45), 0, y0 + h / 2, 0);
  root.add(shell);
  const flat = mesh(new BoxGeometry(0.02, h, 1.9), mat('#1b1c1f', 0.45), 0, y0 + h / 2, 0);
  root.add(flat);
  const plate = labelPlate(text, 1.8, 0.6, { fg: '#cfd3d8' });
  plate.rotation.set(0, -X_AXIS, 0);
  plate.position.set(-0.02, y0 + h / 2, 0);
  root.add(plate);
  // Bacaklar Z boyunca sıralı (0,5 aralıkla); her biri en yakın pine.
  const order = anchors.map((a, i) => ({ a, i })).sort((p, q) => p.a.z - q.a.z);
  order.forEach(({ a }, k) => root.add(legDown(new Vector3(0.25, y0, (k - 1) * 0.5), a, 0.07)));
  return { root, anchors };
}

// --- Entegre modülleri (741, 555): küçük bir kart üstünde DIP-8, kenarlarda pin başlıkları -----------------------

function headerPin(at: Vector3): Group {
  const g = new Group();
  g.add(mesh(new BoxGeometry(1, 1, 1), M.header(), at.x, 0.5 + 0.2, at.z));
  g.add(mesh(new BoxGeometry(0.25, 2.4, 0.25), M.gold(), at.x, 1.4, at.z));
  return g;
}

const HEADER_TOP = 2.6;

export function icModuleModel(type: 'opamp' | 'timer555', labels: readonly string[]): PartModel {
  const root = new Group();
  const pins = pinAnchors(type);
  const xs = pins.map((p) => p.x);
  const zs = pins.map((p) => p.z);
  const w = Math.max(...xs) - Math.min(...xs) + 1.4;
  const d = Math.max(...zs) - Math.min(...zs) + 1.4;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  const chip = { w: 2.6, d: 4 };
  const top = canvasTexture(w, d, (ctx, W, H) => {
    const s = W / w;
    ctx.fillStyle = '#1f5f3d';
    ctx.fillRect(0, 0, W, H);
    const px = (x: number) => (x - cx + w / 2) * s;
    const pz = (z: number) => (z - cz + d / 2) * s;
    ctx.strokeStyle = '#c99a4e';
    ctx.lineWidth = s * 0.28;
    ctx.lineCap = 'round';
    // Her başlıktan entegrenin yanına dik açılı yol.
    pins.forEach((p, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const pinZ = cz - 1.5 + (i % 4);
      ctx.beginPath();
      ctx.moveTo(px(p.x), pz(p.z));
      ctx.lineTo(px(p.x), pz(pinZ));
      ctx.lineTo(px(cx + side * (chip.w / 2 + 0.4)), pz(pinZ));
      ctx.stroke();
    });
    ctx.fillStyle = '#f0f2ee';
    ctx.font = `600 ${Math.round(s * 0.62)}px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    pins.forEach((p, i) => {
      const dx = p.x < cx - 0.1 ? 1.25 : p.x > cx + 0.1 ? -1.25 : 0;
      const dz = Math.abs(dx) > 0 ? 0.25 : p.z < cz ? 1.35 : -0.95;
      ctx.fillText(labels[i] ?? '', px(p.x + dx), pz(p.z + dz));
    });
  });
  const board = new Mesh(new BoxGeometry(w, 0.3, d), [M.pcbGreen(), M.pcbGreen(), new MeshStandardMaterial({ map: top, roughness: 0.6 }), M.pcbGreen(), M.pcbGreen(), M.pcbGreen()]);
  board.position.set(cx, 0.35, cz);
  board.userData.ownsMaterial = true;
  root.add(board);
  const chipBody = mesh(new BoxGeometry(chip.w, 1.2, chip.d), mat('#17181b', 0.55), cx, 1.15, cz);
  root.add(chipBody);
  const notch = mesh(new CylinderGeometry(0.28, 0.28, 0.05, 14), mat('#2a2c30', 0.6), cx, 1.78, cz - chip.d / 2 + 0.3);
  root.add(notch);
  const label = labelPlate(type === 'opamp' ? 'LM741' : 'NE555', chip.w * 0.9, 0.8, { fg: '#c6cad0' });
  label.position.set(cx, 1.76, cz + 0.4);
  label.rotation.z = Math.PI / 2;
  root.add(label);
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      root.add(mesh(new BoxGeometry(0.5, 0.15, 0.3), M.tin(), cx + side * (chip.w / 2 + 0.25), 0.62, cz - 1.5 + i));
    }
  }
  for (const p of pins) root.add(headerPin(p));
  const anchors = pins.map((p) => new Vector3(p.x, HEADER_TOP, p.z));
  return { root, anchors };
}

// --- Anahtar (iki konumlu kollu anahtar) -------------------------------------------------------------------

export function switchModel(props: Props): PartModel {
  const root = new Group();
  const anchors = pinAnchors('switch');
  root.add(mesh(new BoxGeometry(4.4, 1.6, 2.6), mat('#22252a', 0.5), 0, 1.0, 0));
  root.add(mesh(new CylinderGeometry(0.7, 0.7, 0.9, 20), M.steel(), 0, 2.2, 0));
  const lever = new Group();
  lever.userData.live = true;
  lever.add(mesh(new CylinderGeometry(0.25, 0.32, 2.6, 14), M.steel(), 0, 1.3, 0));
  lever.add(mesh(new SphereGeometry(0.34, 14, 10), M.steel(), 0, 2.6, 0));
  lever.position.y = 2.5;
  root.add(lever);
  for (const x of [-1.4, 0, 1.4]) root.add(mesh(new BoxGeometry(0.5, 0.6, 0.12), M.tin(), x, 0.1, 1.35));
  root.add(lead(new Vector3(-1.4, 0.4, 1.35), anchors[0]!), lead(new Vector3(1.4, 0.4, 1.35), anchors[1]!));
  const set = (closed: boolean) => (lever.rotation.z = closed ? -0.45 : 0.45);
  set(boolProp(props, 'closed', false));
  return {
    root,
    anchors,
    interaction: 'toggle',
    update(ctx) {
      set(boolProp(ctx.props, 'closed', false));
      return false;
    },
  };
}

// --- Akkor lamba (E10 duy) ---------------------------------------------------------------------------------

export function lampModel(): PartModel {
  const root = new Group();
  const anchors = pinAnchors('lamp');
  root.add(mesh(new CylinderGeometry(1.9, 2.1, 1.0, 26), mat('#1f2226', 0.55), 0, 0.5, 0));
  root.add(mesh(new CylinderGeometry(1.1, 1.1, 1.6, 22), M.steel(), 0, 1.8, 0));
  const glass = new MeshStandardMaterial({ color: '#f5f2e8', roughness: 0.05, transparent: true, opacity: 0.32, emissive: '#ffb347', emissiveIntensity: 0, depthWrite: false });
  const bulb = mesh(new SphereGeometry(1.7, 26, 20), glass, 0, 4.1, 0);
  bulb.userData.live = true;
  root.add(bulb);
  const filamentMat = new MeshStandardMaterial({ color: '#6b5a48', roughness: 0.5, emissive: '#ffcf7a', emissiveIntensity: 0 });
  const filament = new Group();
  filament.userData.live = true;
  filament.add(rod(new Vector3(-0.5, 2.6, 0), new Vector3(-0.5, 4.0, 0), 0.05, M.steel()), rod(new Vector3(0.5, 2.6, 0), new Vector3(0.5, 4.0, 0), 0.05, M.steel()));
  const coil = mesh(new TorusGeometry(0.5, 0.06, 6, 20, Math.PI), filamentMat, 0, 4.0, 0);
  filament.add(coil);
  root.add(filament);
  const glow = glowSprite('#ffc874', 11);
  glow.position.y = 4.1;
  root.add(glow);
  root.add(lead(new Vector3(-2.0, 0.5, 0), anchors[0]!), lead(new Vector3(2.0, 0.5, 0), anchors[1]!));
  return {
    root,
    anchors,
    update(ctx) {
      const burned = ctx.live?.burned ?? false;
      const g = ctx.active && !burned ? Math.min(1, ctx.live?.glow ?? 0) : 0;
      filamentMat.emissiveIntensity = 3 * g;
      glass.emissiveIntensity = 0.6 * g;
      glass.color.set(burned ? '#9a9389' : '#f5f2e8');
      glow.set(g);
      coil.visible = !burned;
      return false;
    },
    dispose() {
      glass.dispose();
      filamentMat.dispose();
    },
  };
}

// --- Hoparlör ve buzzer ----------------------------------------------------------------------------------------

export function speakerModel(): PartModel {
  const root = new Group();
  const anchors = pinAnchors('speaker');
  root.add(mesh(new CylinderGeometry(1.5, 1.5, 1.2, 22), mat('#2b2e33', 0.4, 0.4), 0, 0.6, 0));
  root.add(mesh(new TorusGeometry(2.55, 0.18, 8, 36), mat('#3a3d42', 0.5), 0, 1.75, 0).rotateX(X_AXIS));
  const cone = new Group();
  cone.userData.live = true;
  const profile = [new Vector2(0.55, 0), new Vector2(1.5, 0.35), new Vector2(2.45, 0.55)];
  cone.add(mesh(new LatheGeometry(profile, 32), mat('#25272b', 0.85), 0, 0, 0));
  cone.add(mesh(new SphereGeometry(0.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#202226', 0.6), 0, -0.05, 0));
  cone.position.y = 1.2;
  root.add(cone);
  root.add(lead(new Vector3(-1.2, 0.5, 1.0), anchors[0]!), lead(new Vector3(1.2, 0.5, 1.0), anchors[1]!));
  let phase = 0;
  return {
    root,
    anchors,
    update(ctx) {
      const level = ctx.active ? (ctx.live?.loudness ?? 0) : 0;
      phase += ctx.dt * 60;
      cone.position.y = 1.2 + level * 0.12 * Math.sin(phase);
      return level > 0.01;
    },
  };
}

export function buzzerModel(): PartModel {
  const body = new Group();
  body.add(mesh(new CylinderGeometry(1.2, 1.2, 1.0, 26), mat('#16171a', 0.45), 0, 1.5, 0));
  body.add(mesh(new CylinderGeometry(0.25, 0.25, 0.02, 14), mat('#050505', 0.9), 0, 2.01, 0));
  const plus = labelPlate('+', 0.6, 0.6, { fg: '#d4d7db' });
  plus.position.set(-0.75, 2.02, 0);
  body.add(plus);
  const model = radial('buzzer', body, 1.2, 1.0);
  let phase = 0;
  return {
    ...model,
    update(ctx) {
      const on = ctx.active && (ctx.live?.loudness ?? 0) > 0.5;
      phase += ctx.dt * 90;
      body.position.y = on ? 0.03 * Math.sin(phase) : 0;
      return on;
    },
  };
}

// --- DC motor (maxon A-max 26: silindir gövde, milde pervane) ----------------------------------------------

export function motorModel(): PartModel {
  const root = new Group();
  const anchors = pinAnchors('motor');
  const can = axialCylinder(2.3, 6.0, mat('#b9bec4', 0.3, 1), 0, 2.4, 0, 30);
  root.add(can);
  root.add(axialCylinder(2.31, 1.0, mat('#2a2d31', 0.5), -2.6, 2.4, 0, 30));
  root.add(axialCylinder(0.3, 1.6, M.steel(), 3.8, 2.4, 0, 12));
  const fan = new Group();
  fan.userData.live = true;
  fan.position.set(4.6, 2.4, 0);
  for (let k = 0; k < 3; k++) {
    const blade = mesh(new BoxGeometry(0.12, 3.6, 1.1), mat('#d6402e', 0.5), 0, 1.8, 0);
    const holder = new Group();
    holder.rotation.x = (k * 2 * Math.PI) / 3;
    holder.add(blade);
    fan.add(holder);
  }
  fan.add(axialCylinder(0.55, 0.6, mat('#d6402e', 0.5)));
  root.add(fan);
  for (const z of [-0.8, 0.8]) root.add(mesh(new BoxGeometry(0.2, 0.9, 0.5), M.tin(), -3.2, 2.4, z));
  root.add(lead(new Vector3(-3.3, 2.4, -0.8), anchors[0]!), lead(new Vector3(-3.3, 2.4, 0.8), anchors[1]!));
  root.add(mesh(new BoxGeometry(5, 0.5, 3.6), mat('#3b3f45', 0.6), 0, 0.25, 0));
  return {
    root,
    anchors,
    update(ctx) {
      fan.rotation.x = ctx.live?.angle ?? 0;
      return false;
    },
  };
}

// --- Röle modülü (Omron G2R-1, vida terminalleri) ------------------------------------------------------------

function screwTerminal(at: Vector3): Group {
  const g = new Group();
  g.add(mesh(new BoxGeometry(1.2, 1.5, 1.2), mat('#2b74c9', 0.5), at.x, 1.15, at.z));
  g.add(mesh(new CylinderGeometry(0.32, 0.32, 0.12, 14), M.steel(), at.x, 1.95, at.z));
  return g;
}

export function relayModel(): PartModel {
  const root = new Group();
  const pins = pinAnchors('relay');
  root.add(mesh(new BoxGeometry(13, 0.3, 10.2), M.pcbBlue(), 0, 0.35, -1.2));
  const cube = mesh(new BoxGeometry(7.2, 4.6, 5.4), mat('#1c1e22', 0.5), 0, 2.8, -1.5);
  root.add(cube);
  const label = labelPlate('G2R-1  12 VDC', 6.6, 1.0, { fg: '#c9cdd3' });
  label.position.set(0, 5.12, -1.5);
  root.add(label);
  const ledMat = new MeshStandardMaterial({ color: '#7a1d17', roughness: 0.3, emissive: '#ff3b30', emissiveIntensity: 0 });
  const led = mesh(new BoxGeometry(0.6, 0.35, 0.35), ledMat, -4.6, 0.68, 2.6);
  led.userData.live = true;
  root.add(led);
  const glow = glowSprite('#ff5040', 3);
  glow.position.set(-4.6, 1.0, 2.6);
  root.add(glow);
  for (const p of pins) root.add(screwTerminal(p));
  const anchors = pins.map((p) => new Vector3(p.x, 2.0, p.z));
  return {
    root,
    anchors,
    update(ctx) {
      const on = ctx.active && (ctx.live?.energized ?? false);
      ledMat.emissiveIntensity = on ? 2.2 : 0;
      glow.set(on ? 0.6 : 0);
      return false;
    },
    dispose() {
      ledMat.dispose();
    },
  };
}

// --- Transformatör (EI çekirdek, iki sargı) --------------------------------------------------------------------

export function transformerModel(): PartModel {
  const root = new Group();
  const pins = pinAnchors('transformer');
  const steel = mat('#5b6168', 0.45, 0.6);
  root.add(mesh(new BoxGeometry(8, 6.0, 4.0), steel, 0, 3.0, 0));
  const bobbin = mat('#e8dfc8', 0.7);
  root.add(mesh(new BoxGeometry(5.4, 4.2, 4.6), bobbin, 0, 3.0, 0));
  root.add(mesh(new BoxGeometry(2.4, 3.9, 4.8), mat('#b5651d', 0.45, 0.4), -1.35, 3.0, 0));
  root.add(mesh(new BoxGeometry(2.4, 3.9, 4.8), mat('#c47a3d', 0.45, 0.4), 1.35, 3.0, 0));
  root.add(mesh(new BoxGeometry(13.6, 0.5, 10.8), mat('#2e3135', 0.6), 0, 0.25, 0));
  const plate = labelPlate('230 V : 12 V', 5.2, 1.0, { fg: '#3a3f45' });
  plate.position.set(0, 6.02, 0);
  root.add(plate);
  for (const p of pins) root.add(screwTerminal(p));
  const anchors = pins.map((p) => new Vector3(p.x, 2.0, p.z));
  return { root, anchors };
}

// --- Pil ve AC kaynak --------------------------------------------------------------------------------------------

export function batteryModel(props: Props): PartModel {
  const root = new Group();
  const anchors = pinAnchors('battery');
  const V = numProp(props, 'voltage', 9);
  const length = 9.6;
  root.add(axialCylinder(1.9, length, mat('#2a3d66', 0.4, 0.3), 0, 2.0, 0, 28));
  root.add(axialCylinder(1.92, 2.6, mat('#c9a646', 0.35, 0.8), -3.4, 2.0, 0, 28));
  root.add(axialCylinder(0.55, 0.5, M.steel(), -length / 2 - 0.2, 2.0, 0, 14));
  const plate = labelPlate(`${String(V).replace('.', ',')} V`, 3.4, 1.6, { fg: '#f2f4f6' });
  plate.position.set(1.2, 3.92, 0);
  root.add(plate);
  const plus = labelPlate('+', 1.0, 1.0, { fg: '#1d2733' });
  plus.position.set(-3.4, 3.93, 0);
  root.add(plus);
  root.add(mesh(new BoxGeometry(length + 0.4, 0.4, 2.6), mat('#1e2125', 0.6), 0, 0.2, 0));
  root.add(wirePath([new Vector3(-length / 2 - 0.45, 2.0, 0), new Vector3(anchors[0]!.x, 2.0, 0), new Vector3(anchors[0]!.x, LEAD_Y, anchors[0]!.z)], 0.16, mat('#c8312a', 0.5)));
  root.add(wirePath([new Vector3(length / 2, 2.0, 0), new Vector3(anchors[1]!.x, 2.0, 0), new Vector3(anchors[1]!.x, LEAD_Y, anchors[1]!.z)], 0.16, mat('#1c1c1c', 0.5)));
  return { root, anchors };
}

function bananaJack(at: Vector3, color: string): Group {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(0.65, 0.65, 1.2, 18), mat(color, 0.45), at.x, at.y - 0.6, at.z));
  g.add(mesh(new CylinderGeometry(0.3, 0.3, 0.05, 12), mat('#0b0b0b', 0.9), at.x, at.y + 0.01, at.z));
  return g;
}

/** Küçük kutu ve yüzünde simge; uçlar üstte muz soketleri (AC kaynak, toprak). */
export function sourceBoxModel(type: 'acsource', title: string): PartModel {
  const root = new Group();
  const pins = pinAnchors(type);
  const w = 9.6;
  const d = 4.8;
  const top = canvasTexture(w, d, (ctx, W, H) => {
    ctx.fillStyle = '#e9ecef';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1d2733';
    ctx.lineWidth = H * 0.05;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const x = W * (0.32 + (0.36 * i) / 40);
      const y = H * (0.5 - 0.22 * Math.sin((i / 40) * Math.PI * 2));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#5f6b7a';
    ctx.font = `600 ${Math.round(H * 0.16)}px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title, W / 2, H * 0.92);
  });
  const box = new Mesh(new BoxGeometry(w, 2.4, d), [M.white(), M.white(), new MeshStandardMaterial({ map: top, roughness: 0.6 }), M.white(), M.white(), M.white()]);
  box.position.y = 1.2;
  box.userData.ownsMaterial = true;
  root.add(box);
  const anchors = pins.map((_, i) => new Vector3(i === 0 ? -(w / 2 - 1.0) : w / 2 - 1.0, 2.5, 0));
  anchors.forEach((a, i) => root.add(bananaJack(a, i === 0 ? '#c8312a' : '#1d1f23')));
  return { root, anchors };
}

export function groundModel(): PartModel {
  const root = new Group();
  root.add(mesh(new CylinderGeometry(1.3, 1.5, 0.5, 22), mat('#2e3238', 0.55), 0, 0.25, 0));
  root.add(mesh(new CylinderGeometry(0.75, 0.75, 1.8, 18), mat('#1b1d21', 0.45), 0, 1.4, 0));
  root.add(mesh(new CylinderGeometry(0.85, 0.85, 0.4, 18, 1, false), mat('#1b1d21', 0.45), 0, 2.4, 0));
  const plate = labelPlate('GND', 2.6, 1.0, { fg: '#2c6e49', bg: '#e8f5ed' });
  plate.position.set(0, 0.52, 2.0);
  root.add(plate);
  return { root, anchors: [new Vector3(0, 2.6, 0)] };
}

export { SPREAD };
