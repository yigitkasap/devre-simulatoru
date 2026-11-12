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
  RingGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { LED_COLORS, LED_MODELS } from '../sim/devices/led';
import { spdtThrow } from '../sim/devices/spdt';
import { boolProp, numProp, strProp } from '../sim/netlist';
import { formatSI } from '../sim/units';
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
import { AA, BUZZER, CERAMIC_DISC, E10, FILM_BOX, MLCC, MOTOR, PP3, RELAY, SPEAKER, TO18, TO220, TO92, batteryPack, mm, nonPolarPackage, transistorPackage } from './dimensions';
import { glowSprite, type LiveContext, type PartModel } from './model';

const X_AXIS = Math.PI / 2;

/** Eksenli gövde (X ekseni boyunca) için döndürülmüş silindir. */
function axialCylinder(r: number, length: number, material: MeshStandardMaterial, x = 0, y = 0, z = 0, segments = 20): Mesh {
  const m = mesh(new CylinderGeometry(r, r, length, segments), material, x, y, z);
  m.rotation.z = X_AXIS;
  return m;
}

/** Ölçüsü birim testinde denetlenen gövde parçası (tests/model-olcek.test.ts adıyla bulur). */
function named<T extends Mesh>(name: string, m: T): T {
  m.name = name;
  return m;
}

/** İki uçlu eksenli parça: gövde ortada, bacaklar pinlere. */
function axial(type: DeviceType, body: Group, halfLength: number, height: number): PartModel {
  const root = new Group();
  const anchors = pinAnchors(type);
  body.position.y = height;
  // Gövde (bacaklar hariç): kıskaçlar ve kısa teller bacaklara değil gövdeye göre yerleşir (clips.ts).
  body.userData.body = true;
  root.add(body);
  root.add(lead(new Vector3(-halfLength, height, 0), anchors[0]!));
  root.add(lead(new Vector3(halfLength, height, 0), anchors[1]!));
  return { root, anchors };
}

/** Dik duran (radyal) iki bacaklı parça: bacaklar gövdenin altından iner, masada pinlere gider. */
function radial(type: DeviceType, body: Group, spacing: number, legTop: number): PartModel {
  const root = new Group();
  const anchors = pinAnchors(type);
  body.userData.body = true;
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
  // Kutupsuz: kapasiteye göre seramik disk (≤ 10 nF), radyal çok katmanlı seramik (≤ 1 µF) ya da kutu film.
  const legTop = 1.2;
  const pack = nonPolarPackage(C);
  if (pack === 'disc') {
    const r = mm(CERAMIC_DISC.diameter) / 2;
    const disc = named('kondansator', mesh(new CylinderGeometry(r, r, mm(CERAMIC_DISC.thickness), 22), mat('#c98a45', 0.6), 0, legTop + r - 0.1, 0));
    disc.rotation.x = X_AXIS;
    body.add(disc);
  } else if (pack === 'mlcc') {
    // Daldırma kaplı gövde: köşeleri yuvarlak (elipsoit), hardal sarısı.
    const blob = named('kondansator', mesh(new SphereGeometry(0.5, 14, 10), mat('#d2a233', 0.5), 0, legTop + mm(MLCC.height) / 2 - 0.1, 0));
    blob.scale.set(mm(MLCC.width), mm(MLCC.height), mm(MLCC.thickness));
    body.add(blob);
  } else {
    body.add(named('kondansator', mesh(new BoxGeometry(mm(FILM_BOX.width), mm(FILM_BOX.height), mm(FILM_BOX.thickness)), mat('#b3261e', 0.5), 0, legTop + mm(FILM_BOX.height) / 2, 0)));
  }
  return radial('capacitor', body, 1, legTop);
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
      // Arıza bulmada atmış sigorta (faultBurnt) simülasyon dururken de atmış görünür.
      const blown = (ctx.live?.burned ?? false) || ctx.props.faultBurnt === true;
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

/**
 * Schottky diyot (DO-41, 1N5819): 1N4001 ile aynı gövde, gövdeye basılı yazıyla ayrılır (tasarım:
 * parcalar-3b/newParts.ts). Doku silindirin çevresi boyunca; katot halkası +x (2. uç) tarafında.
 */
export function schottkyModel(props: Props): PartModel {
  const text = typeof props.model === 'string' ? props.model : '1N5819';
  const L = 2.05;
  const R = 0.53;
  const C = 2 * Math.PI * R;
  const tex = canvasTexture(C, L, (c, W, H) => {
    c.fillStyle = '#1c1d20';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#c8ccd0';
    c.fillRect(0, H * 0.78, W, H * 0.14);
    for (const cx of [W * 0.25, W * 0.75]) {
      c.save();
      c.translate(cx, H * 0.4);
      c.rotate(Math.PI / 2);
      c.fillStyle = '#d6dade';
      c.font = `600 ${Math.round(W * 0.075)}px "IBM Plex Sans", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, 0, 0);
      c.restore();
    }
  }, 120);
  const cap = mat('#1c1d20', 0.4);
  const cyl = new Mesh(new CylinderGeometry(R, R, L, 28, 1, false), [new MeshStandardMaterial({ map: tex, roughness: 0.4 }), cap, cap]);
  cyl.rotation.z = X_AXIS;
  cyl.userData.ownsMaterial = true;
  const body = new Group();
  body.add(cyl);
  return axial('schottky', body, 1.03, 1.0);
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
      // Arıza bulmada yanmış LED (faultBurnt) simülasyon dururken de yanık görünür.
      const burned = (ctx.live?.burned ?? false) || ctx.props.faultBurnt === true;
      const b = ctx.active && !burned ? (ctx.live?.brightness ?? 0) : 0;
      lens.emissiveIntensity = 0.1 + 2.4 * b;
      lens.color.set(burned ? '#3a3a3a' : light);
      glow.set(b);
      return false;
    },
    dispose() {
      lens.dispose();
    },
  };
}

// --- Transistörler: TO-92 (plastik), TO-18 (metal kapak: BC107), TO-220 (IRF510) -------------------------------
//
// Ölçüler dimensions.ts'te (veri sayfaları: docs/KARARLAR.md → "3B modeller: gerçek ölçüler"). Yerel çerçeve:
// bacaklar z boyunca dizili, öndeki (izleyiciye bakan) yüz −x'te (placement.ts, 'to92' takılışı).

const TRANSISTOR_TEXT: Partial<Record<DeviceType, string>> = { npn: 'BC547', pnp: 'BC557', njfet: '2N5457', pjfet: '2N5460', nmos: '2N7000', pmos: 'BS250' };

/** Gövdenin kartın üstündeki yüksekliği (bacakların açıkta kalan boyu ≈ 5 mm). */
const STANDOFF = 2.0;

let to92Shell: ExtrudeGeometry | null = null;

/** TO-92 gövdesinin geometrisi (paylaşılır): D kesitli, düz yüz −x'te, taban y = 0. */
function to92Geometry(): ExtrudeGeometry {
  if (to92Shell) return to92Shell;
  const r = mm(TO92.diameter) / 2;
  const flat = mm(TO92.depth) - r;
  const beta = Math.acos(flat / r);
  const shape = new Shape();
  shape.absarc(0, 0, r, -Math.PI + beta, Math.PI - beta, false);
  shape.closePath();
  to92Shell = new ExtrudeGeometry(shape, { depth: mm(TO92.height), bevelEnabled: false, curveSegments: 14 });
  to92Shell.rotateX(-Math.PI / 2);
  return to92Shell;
}

/** TO-92 gövdesi (yazısıyla): D kesit, düz yüzde model adı. Bacaklar ayrıca eklenir. */
function to92Body(text: string, textHeight = 0.6): Group {
  const body = new Group();
  body.userData.body = true;
  const r = mm(TO92.diameter) / 2;
  const flat = mm(TO92.depth) - r;
  const h = mm(TO92.height);
  body.add(named('to92', mesh(to92Geometry(), mat('#1b1c1f', 0.45), 0, STANDOFF, 0)));
  const chord = 2 * Math.sqrt(r * r - flat * flat);
  const plate = labelPlate(text, chord * 0.92, textHeight, { fg: '#cfd3d8' });
  plate.rotation.set(0, -X_AXIS, 0);
  plate.position.set(-flat - 0.012, STANDOFF + h * 0.55, 0);
  body.add(plate);
  return body;
}

/** TO-92'nin bacağının gövdeden çıktığı yer (k = 0, 1, 2): gövdenin derinliğinin ortasında, 1,27 mm aralıkla. */
function to92Leg(k: number, sign = 1): Vector3 {
  const r = mm(TO92.diameter) / 2;
  const middle = (r - (mm(TO92.depth) - r)) / 2;
  return new Vector3(middle * sign, STANDOFF, (k - 1) * mm(TO92.pitch) * sign);
}

/**
 * TO-18 metal kılıf (BC107: NXP/Philips SOT18/13): alt flanş, silindir kapak, flanşta emetörün yanında sekme;
 * üç bacak 2,54 mm'lik daire üzerinde (E ve C karşılıklı, B aralarında, arkada). Yazı kapağın yanında.
 * `emitter`: emetör ucunun sırası (BJT'de 2).
 */
export function to18Model(type: DeviceType, text: string, emitter = 2): PartModel {
  const root = new Group();
  const anchors = pinAnchors(type);
  const rc = mm(TO18.can) / 2;
  const rf = mm(TO18.flange) / 2;
  const tf = mm(TO18.flangeThickness);
  const H = mm(TO18.height);
  const chamfer = 0.07;
  const metal = mat('#c9ced3', 0.3, 1);
  const body = new Group();
  body.userData.body = true;
  body.add(named('to18-flans', mesh(new CylinderGeometry(rf, rf, tf, 20), metal, 0, STANDOFF + tf / 2, 0)));
  body.add(named('to18-kapak', mesh(new CylinderGeometry(rc, rc, H - tf - chamfer, 20, 1, true), metal, 0, STANDOFF + tf + (H - tf - chamfer) / 2, 0)));
  body.add(named('to18-tepe', mesh(new CylinderGeometry(rc - chamfer, rc, chamfer, 20), metal, 0, STANDOFF + H - chamfer / 2, 0)));
  // Bacakların sırası z'ye göre: uçtakiler E ve C (karşılıklı), ortadaki B (arkada, +x).
  const order = anchors.map((a, i) => ({ a, i })).sort((p, q) => p.a.z - q.a.z);
  const lc = mm(TO18.leadCircle) / 2;
  const emitterSide = order[0]!.i === emitter ? -1 : 1;
  // Sekme: emetörün yanında, B'den uzağa 45° (JEDEC TO-206AA); flanşın düzleminde, öne (−x) bakar.
  const tabR = rf + mm(TO18.tabLength) / 2 - 0.05;
  const tab = mesh(new BoxGeometry(mm(TO18.tabLength) + 0.1, tf, mm(TO18.tabWidth)), metal, -tabR * Math.SQRT1_2, STANDOFF + tf / 2, emitterSide * tabR * Math.SQRT1_2);
  tab.rotation.y = emitterSide * (Math.PI / 4);
  body.add(tab);
  // Yazı: kapağın çevresinde iki kez (her yönden okunur).
  const around = 2 * Math.PI * rc;
  const band = H * 0.55;
  const tex = canvasTexture(around, band, (c, W, Hh) => {
    c.clearRect(0, 0, W, Hh);
    c.fillStyle = '#2b2f35';
    c.font = `600 ${Math.round(Hh * 0.44)}px "IBM Plex Sans", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // Öndeki yüz (−x) silindirin u = 0,75'inde; yazı çevrenin ≈ üçte birine sığar (yandan da okunur).
    for (const u of [0.25, 0.75]) c.fillText(text, W * u, Hh / 2, W * 0.3);
  }, 72);
  const print = new Mesh(new CylinderGeometry(rc + 0.006, rc + 0.006, band, 20, 1, true), new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 }));
  print.position.y = STANDOFF + tf + (H - tf) * 0.52;
  print.userData.ownsMaterial = true;
  body.add(print);
  root.add(body);
  const r = mm(TO18.lead) / 2;
  order.forEach(({ a }, k) => {
    const from = k === 1 ? new Vector3(lc, STANDOFF, 0) : new Vector3(0, STANDOFF, (k - 1) * lc);
    root.add(legDown(from, a, r));
  });
  return { root, anchors };
}

export function transistorModel(type: DeviceType, props: Props): PartModel {
  const model = typeof props.model === 'string' ? props.model : '';
  const text = model && model !== 'genel' ? model.replace(/B$/, '') : (TRANSISTOR_TEXT[type] ?? '');
  const pack = transistorPackage(model);
  if (pack === 'to18') return to18Model(type, text);
  if (pack === 'to220') return to220Model(type, text, '100 V · 5,6 A', null, 'z');
  const root = new Group();
  const anchors = pinAnchors(type);
  root.add(to92Body(text));
  // Bacaklar z boyunca sıralı (1,27 mm aralıkla); her biri en yakın uca.
  const order = anchors.map((a, i) => ({ a, i })).sort((p, q) => p.a.z - q.a.z);
  order.forEach(({ a }, k) => root.add(legDown(to92Leg(k), a, mm(TO92.lead) / 2)));
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

// --- Sıralı bacaklı gövdeler (köprü diyot, TO-220) --------------------------------------------------------------

/** Ön yüzüne yazı çizilen kutu (ön yüz +z). */
function frontTexBox(w: number, h: number, d: number, side: MeshStandardMaterial, draw: (c: CanvasRenderingContext2D, W: number, H: number) => void, ppu = 64): Mesh {
  const tex = canvasTexture(w, h, draw, ppu);
  const box = new Mesh(new BoxGeometry(w, h, d), [side, side, side, side, new MeshStandardMaterial({ map: tex, roughness: 0.5 }), side]);
  box.userData.ownsMaterial = true;
  return box;
}

/**
 * Bacakları gerçek kılıftaki sırayla (soldan sağa `legs`: pin sırası) uçlarına bağlar. Breadboard'da
 * uçlar bir satırdadır; yerleşim parçayı ters takmışsa (ilk bacağın deliği sağda) gövde arkasını döner.
 */
function inlineLegs(root: Group, anchors: readonly Vector3[], legs: readonly number[], pitch: number, y0: number, z: number): void {
  const first = anchors[legs[0]!]!;
  const last = anchors[legs[legs.length - 1]!]!;
  const inRow = anchors.every((a) => Math.abs(a.z - first.z) < 0.1);
  if (inRow && first.x > last.x) root.rotation.y = Math.PI;
  const toLocal = (a: Vector3) => (root.rotation.y ? new Vector3(-a.x, a.y, -a.z) : a);
  legs.forEach((pin, k) => root.add(legDown(new Vector3((k - (legs.length - 1) / 2) * pitch, y0, z), toLocal(anchors[pin]!), 0.12)));
}

// --- TO-220 regülatörler (7805, LM317): siyah gövde, delikli metal tırnak, 3 bacak (newParts.ts) ----------

/**
 * `legs`: soldan sağa bacakların pin sırası; null ise uçların dizilişine göre (transistörler). `along`: uçların
 * dizildiği yerel eksen ('z': transistörlerin takılışı; gövde yazılı yüzü −x'e bakacak biçimde döner).
 */
export function to220Model(type: DeviceType, text: string, subtitle: string, legs: readonly number[] | null, along: 'x' | 'z' = 'x'): PartModel {
  const root = new Group();
  const anchors = pinAnchors(type);
  // Gövdenin çerçevesi: bacaklar x boyunca, yazılı yüz +z. 'z' dizilişinde gövde −90° döner: (X, Z) → (Z, −X).
  const local = along === 'z' ? anchors.map((a) => new Vector3(a.z, a.y, -a.x)) : anchors;
  const order = legs ?? local.map((a, i) => ({ a, i })).sort((p, q) => p.a.x - q.a.x).map((o) => o.i);
  const w = mm(TO220.width);
  const h = mm(TO220.body);
  const t = mm(TO220.thickness);
  const tabT = mm(TO220.tabThickness);
  const y0 = 2.6;
  const body = new Group();
  const box = frontTexBox(w, h, t - tabT, mat('#18191c', 0.5), (c, W, H) => {
    c.fillStyle = '#18191c';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#d6dade';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `600 ${Math.round(H * 0.17)}px "IBM Plex Sans", system-ui, sans-serif`;
    c.fillText(text, W / 2, H * 0.42);
    c.font = `500 ${Math.round(H * 0.11)}px "IBM Plex Sans", system-ui, sans-serif`;
    c.fillStyle = '#9aa1a9';
    c.fillText(subtitle, W / 2, H * 0.64);
  }, 96);
  box.position.set(0, y0 + h / 2, tabT / 2);
  body.add(named('to220-govde', box));
  // Metal tırnak (arkada, gövdenin üstüne uzanır), delikli.
  const tab = new Shape();
  tab.moveTo(-w / 2, 0);
  tab.lineTo(w / 2, 0);
  tab.lineTo(w / 2, mm(TO220.overall));
  tab.lineTo(-w / 2, mm(TO220.overall));
  tab.lineTo(-w / 2, 0);
  tab.holes.push(new Shape().absarc(0, h + (mm(TO220.overall) - h) / 2, mm(TO220.hole) / 2, 0, Math.PI * 2, true));
  const tabGeo = new ExtrudeGeometry(tab, { depth: tabT, bevelEnabled: false, curveSegments: 16 });
  body.add(named('to220-tirnak', mesh(tabGeo, mat('#c9ced3', 0.32, 1), 0, y0, -t / 2)));
  // Bacaklar 1 birim aralıkla gövdeden aşağı, gerçek sırayla.
  inlineLegs(body, local, order, mm(TO220.pitch), y0, tabT / 2);
  if (along === 'z') body.rotation.y += -Math.PI / 2;
  root.add(body);
  return { root, anchors };
}

// --- Tristör (SCR, TO-92: MCR100-6): transistörle aynı gövde, yazı farklı (newParts.ts) ---------------------

/** Bacak sırası düz (yazılı) yüze bakınca soldan K, G, A (onsemi MCR100/D, STYLE 10: 1 K, 2 G, 3 A). */
export function scrModel(props: Props): PartModel {
  const root = new Group();
  const anchors = pinAnchors('scr');
  const text = typeof props.model === 'string' ? props.model : 'MCR100-6';
  const body = to92Body(text, 0.5);
  // Breadboard'da uçlar bir sütunda (yerel z boyunca); ters takıldıysa (K'nin deliği A'nınkinden sonra) gövde döner.
  const order = [1, 2, 0];
  const first = anchors[order[0]!]!;
  const last = anchors[order[2]!]!;
  const flip = Math.abs(first.x - last.x) < 0.1 && first.z > last.z;
  if (flip) body.rotation.y = Math.PI;
  root.add(body);
  order.forEach((pin, k) => root.add(legDown(to92Leg(k, flip ? -1 : 1), anchors[pin]!, mm(TO92.lead) / 2)));
  return { root, anchors };
}

// --- Optokuplör (PC817, DIP-4): krem gövde, 1. bacak noktası (newParts.ts) -------------------------------------

/**
 * Gövde uçlara göre yönlenir: LED tarafı (A, K) ile çıkış tarafı (C, E) karşılıklı kenarlarda. Masada
 * şema pinleri, breadboard'da orta kanalın iki yanındaki delikler (A, K bir yanda; E, C öbür yanda).
 */
export function optoModel(props: Props): PartModel {
  const root = new Group();
  const anchors = pinAnchors('opto');
  const [a, k, c, e] = anchors as [Vector3, Vector3, Vector3, Vector3];
  const center = [a, k, c, e].reduce((s, p) => s.add(p), new Vector3()).multiplyScalar(0.25);
  const across = c.clone().add(e).sub(a).sub(k).setY(0).normalize();
  const along = k.clone().sub(a).setY(0).normalize();
  const bw = 2.56;
  const bd = 1.8;
  const bh = 1.4;
  const y0 = 0.9;
  const text = typeof props.model === 'string' ? props.model : 'PC817';
  const body = new Group();
  const chip = new Mesh(new BoxGeometry(bd, bh, bw), mat('#e9e4d6', 0.55));
  chip.position.y = y0 + bh / 2;
  body.add(chip);
  const plate = labelPlate(text, bw * 0.8, 0.6, { fg: '#26292e', bg: '#e9e4d6' });
  plate.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  plate.position.set(0, y0 + bh + 0.01, 0);
  body.add(plate);
  body.position.set(center.x, 0, center.z);
  body.rotation.y = Math.atan2(-across.z, across.x);
  root.add(body);
  // 1. bacak noktası (A'nın köşesinde).
  const dot = center.clone().addScaledVector(across, -bd / 2 + 0.3).addScaledVector(along, -bw / 2 + 0.35);
  root.add(mesh(new CylinderGeometry(0.13, 0.13, 0.04, 14), mat('#26292e', 0.6), dot.x, y0 + bh + 0.02, dot.z));
  // Bacaklar: gövdenin iki yanından, kendi uçlarına.
  for (const [pin, side, row] of [[a, -1, -0.5], [k, -1, 0.5], [c, 1, -0.5], [e, 1, 0.5]] as const) {
    const root0 = center.clone().addScaledVector(across, (side * bd) / 2).addScaledVector(along, row).setY(y0 + 0.4);
    root.add(legDown(root0, pin, 0.1));
  }
  return { root, anchors };
}

// --- Köprü diyot (KBP tipi, düz sıralı 4 bacak: + ~ ~ −; tasarım: parcalar-3b/newParts.ts) -----------------

export function bridgeModel(props: Props): PartModel {
  const root = new Group();
  const anchors = pinAnchors('bridge');
  const text = typeof props.model === 'string' ? props.model : 'KBP307';
  const w = 5.6;
  const h = 4.4;
  const t = 1.4;
  const y0 = 1.8;
  const box = frontTexBox(w, h, t, mat('#1b1c1f', 0.5), (c, W, H) => {
    c.fillStyle = '#1b1c1f';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#d6dade';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `600 ${Math.round(H * 0.15)}px "IBM Plex Sans", system-ui, sans-serif`;
    c.fillText(text, W / 2, H * 0.32);
    c.font = `700 ${Math.round(H * 0.17)}px "IBM Plex Sans", system-ui, sans-serif`;
    ['+', '~', '~', '−'].forEach((m, i) => c.fillText(m, W * (0.2 + 0.2 * i), H * 0.78));
  });
  box.position.set(0, y0 + h / 2, 0);
  const body = new Group();
  body.add(box);
  // Gerçek sıra soldan: +, ~, ~, − → şema pinleri 1, 0, 2, 3.
  inlineLegs(body, anchors, [1, 0, 2, 3], 1.12, y0, 0);
  root.add(body);
  return { root, anchors };
}

// --- Çift yollu anahtar (SPDT): bugünkü kollu anahtarın gövdesi, üç bacak; kol bağlı ucun tersine yatar ---

/**
 * Tasarım: parcalar-3b/newParts.ts. Bacaklar gövdenin kenarında A, C, B sırasıyla (gerçek anahtardaki
 * gibi ortak uç ortada); her bacak kendi ucuna (masada şema pinleri, breadboard'da delikler) iner.
 */
export function spdtModel(props: Props): PartModel {
  const root = new Group();
  const anchors = pinAnchors('spdt');
  root.add(mesh(new BoxGeometry(4.4, 1.6, 2.6), mat('#22252a', 0.5), 0, 1.0, 0));
  root.add(mesh(new CylinderGeometry(0.7, 0.7, 0.9, 20), M.steel(), 0, 2.2, 0));
  const lever = new Group();
  lever.userData.live = true;
  lever.add(mesh(new CylinderGeometry(0.25, 0.32, 2.6, 14), M.steel(), 0, 1.3, 0));
  lever.add(mesh(new SphereGeometry(0.34, 14, 10), M.steel(), 0, 2.6, 0));
  lever.position.y = 2.5;
  root.add(lever);
  // A ve B'nin gövdedeki yanı: uçlarının z konumuna göre (C ortada).
  const sideA = Math.sign(anchors[1]!.z - anchors[0]!.z) || -1;
  const plateA = labelPlate('A', 0.8, 0.8, { fg: '#cfd3d8' });
  plateA.position.set(1.6, 1.82, 0.75 * sideA);
  const plateB = labelPlate('B', 0.8, 0.8, { fg: '#cfd3d8' });
  plateB.position.set(1.6, 1.82, -0.75 * sideA);
  root.add(plateA, plateB);
  for (const [pin, z] of [[0, 0], [1, 0.9 * sideA], [2, -0.9 * sideA]] as const) {
    root.add(mesh(new BoxGeometry(0.12, 0.6, 0.5), M.tin(), 1.6, 0.1, z));
    const end = anchors[pin]!;
    root.add(wirePath([new Vector3(1.6, 0.35, z), new Vector3(end.x, 0.35, z), new Vector3(end.x, 0.35, end.z), end], 0.13, M.tin(), 6));
  }
  // Kol, bağlı olduğu ucun TERSİNE yatar (gerçek kollu anahtardaki gibi).
  const set = (to: string) => (lever.rotation.x = (to === 'b' ? -1 : 1) * sideA * -0.45);
  set(spdtThrow(props));
  return {
    root,
    anchors,
    interaction: 'toggle',
    update(ctx) {
      set(spdtThrow(ctx.props));
      return false;
    },
  };
}

// --- Basmalı düğme: 12 mm dokunmatik anahtar, renkli yuvarlak başlık; 4 bacak, ikişer içten bağlı --------------

/**
 * Tasarım: parcalar-3b/newParts.ts. Bacak çiftleri uçlara göre yerleşir: her ucun yanındaki ikiz bacak
 * (içten bağlı) uçtan uca doğrultuya dik 2 delik ötede. Masada ikizler masaya iner; breadboard'da orta
 * kanalın iki yanındaki deliklere (breadboard.ts, 'button').
 */
export function pushButtonModel(boardTwins: readonly Vector3[] = []): PartModel {
  const root = new Group();
  const anchors = pinAnchors('pushbutton');
  const [a, b] = anchors as [Vector3, Vector3];
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  // İkizler: breadboard'da verilen delikler, masada uçlardan 2 birim yanda.
  const side = boardTwins[0] ? Math.sign((boardTwins[0].x - a.x) * -(b.z - a.z) + (boardTwins[0].z - a.z) * (b.x - a.x)) || 1 : 1;
  const n = new Vector3((-(b.z - a.z) / L) * side, 0, ((b.x - a.x) / L) * side);
  const twins = boardTwins.length === 2 ? boardTwins.map((p) => p.clone()) : anchors.map((p) => p.clone().addScaledVector(n, 2));
  const center = [a, b, ...twins].reduce((c, p) => c.add(p), new Vector3()).multiplyScalar(0.25);
  const body = 4.72;
  const bh = 1.45;
  const y0 = 0.9;
  root.add(mesh(new BoxGeometry(body, bh, body), mat('#1c1d20', 0.6), center.x, y0 + bh / 2, center.z));
  root.add(mesh(new BoxGeometry(body + 0.05, 0.12, body + 0.05), M.steel(), center.x, y0 + bh + 0.06, center.z));
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) {
    root.add(mesh(new CylinderGeometry(0.22, 0.22, 0.14, 10), mat('#0f1012', 0.7), center.x + x, y0 + bh + 0.13, center.z + z));
  }
  const cap = new Group();
  cap.add(mesh(new CylinderGeometry(1.5, 1.6, 0.9, 32), mat('#c8312a', 0.4), 0, 0.45, 0));
  cap.add(mesh(new CylinderGeometry(0.75, 0.75, 0.6, 16), mat('#2b2d31', 0.5), 0, -0.2, 0));
  cap.position.set(center.x, 0, center.z);
  cap.userData.live = true;
  root.add(cap);
  const press = (pressed: boolean) => (cap.position.y = y0 + bh + 0.12 + (pressed ? 0.2 : 0.55));
  press(false);
  // Bacaklar gövdenin köşelerinden: uçların yanındakiler uçlara, öbürleri ikizlere.
  const u = new Vector3((b.x - a.x) / L, 0, (b.z - a.z) / L);
  const corner = (along: number, side: number) => center.clone().addScaledVector(u, along * 2.26).addScaledVector(n, side * 0.98).setY(y0);
  root.add(legDown(corner(-1, -1), a, 0.12), legDown(corner(1, -1), b, 0.12));
  root.add(legDown(corner(-1, 1), twins[0]!, 0.12), legDown(corner(1, 1), twins[1]!, 0.12));
  return {
    root,
    anchors,
    interaction: 'press',
    update(ctx) {
      press(ctx.active && ctx.status?.pressed === true);
      return false;
    },
  };
}

// --- Akkor lamba (E10 duy) ---------------------------------------------------------------------------------

export function lampModel(): PartModel {
  const root = new Group();
  const anchors = pinAnchors('lamp');
  const rt = mm(E10.thread) / 2;
  const rb = mm(E10.bulb) / 2;
  // Duy: taban ve yuva; lambanın vida dişi yuvanın içinde, üstte ≈ 2 mm görünür.
  const socketTop = 2.9;
  const threadTop = socketTop + 0.8;
  const lampBottom = threadTop - mm(E10.threadLength);
  const lampTop = lampBottom + mm(E10.length);
  root.add(mesh(new CylinderGeometry(3.3, 3.5, 0.7, 26), mat('#1f2226', 0.55), 0, 0.35, 0));
  root.add(mesh(new CylinderGeometry(rt + 0.4, rt + 0.4, socketTop - 0.7, 24), mat('#1f2226', 0.55), 0, 0.7 + (socketTop - 0.7) / 2, 0));
  root.add(named('lamba-dis', mesh(new CylinderGeometry(rt, rt, mm(E10.threadLength), 22), M.steel(), 0, lampBottom + mm(E10.threadLength) / 2, 0)));
  const glass = new MeshStandardMaterial({ color: '#f5f2e8', roughness: 0.05, transparent: true, opacity: 0.32, emissive: '#ffb347', emissiveIntensity: 0, depthWrite: false });
  // Balon: Ø 11 mm, vida dişine kısa bir boyunla bağlanır; tepesi lambanın toplam boyunda.
  const stretch = 1.15;
  const centerY = lampTop - rb * stretch;
  const bulb = new Group();
  bulb.userData.live = true;
  const globe = named('lamba-balon', mesh(new SphereGeometry(rb, 24, 16), glass, 0, centerY, 0));
  globe.scale.y = stretch;
  bulb.add(globe);
  const neckTop = centerY - rb * stretch * 0.75;
  if (neckTop > threadTop) bulb.add(mesh(new CylinderGeometry(rb * 0.68, rt * 0.92, neckTop - threadTop, 20, 1, true), glass, 0, (neckTop + threadTop) / 2, 0));
  root.add(bulb);
  const filamentMat = new MeshStandardMaterial({ color: '#6b5a48', roughness: 0.5, emissive: '#ffcf7a', emissiveIntensity: 0 });
  const filament = new Group();
  filament.userData.live = true;
  const fy = centerY - 0.2;
  filament.add(rod(new Vector3(-0.6, threadTop, 0), new Vector3(-0.6, fy, 0), 0.05, M.steel()), rod(new Vector3(0.6, threadTop, 0), new Vector3(0.6, fy, 0), 0.05, M.steel()));
  const coil = mesh(new TorusGeometry(0.6, 0.06, 6, 16, Math.PI), filamentMat, 0, fy, 0);
  filament.add(coil);
  root.add(filament);
  const glow = glowSprite('#ffc874', 13);
  glow.position.y = centerY;
  root.add(glow);
  root.add(lead(new Vector3(-3.4, 0.5, 0), anchors[0]!), lead(new Vector3(3.4, 0.5, 0), anchors[1]!));
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

/** Visaton FRS 5: masada yüzü yukarı; altta mıknatıs, üstünde sepet ve konik zar; uçlar sepetin arkasındaki (tahtaya bakan) lehim kulaklarında. */
export function speakerModel(): PartModel {
  const root = new Group();
  const R = mm(SPEAKER.basket) / 2;
  const D = mm(SPEAKER.depth);
  const rm = mm(SPEAKER.magnet) / 2;
  const hm = mm(SPEAKER.magnetHeight);
  const frame = mat('#3a3d42', 0.5, 0.5);
  root.add(named('hoparlor-miknatis', mesh(new CylinderGeometry(rm, rm, hm, 24), mat('#2b2e33', 0.6), 0, hm / 2, 0)));
  // Sepet: mıknatıstan çembere açılan koni; çemberin üstünde düz halka ve iki bağlama kulağı.
  const coneH = D - hm - 0.3;
  root.add(mesh(new CylinderGeometry(R - 0.3, rm * 0.8, coneH, 28, 1, true), mat('#3a3d42', 0.5, 0.5, { double: true }), 0, hm + coneH / 2, 0));
  root.add(named('hoparlor-cember', mesh(new CylinderGeometry(R, R, 0.3, 28, 1, true), frame, 0, D - 0.15, 0)));
  const ring = mesh(new RingGeometry(R - 1.2, R, 28), frame, 0, D, 0);
  ring.rotation.x = -X_AXIS;
  root.add(ring);
  const lug = mm(SPEAKER.lugs) / 2 - R + 0.4;
  for (const side of [-1, 1]) root.add(named('hoparlor-kulak', mesh(new BoxGeometry(lug, 0.25, 3.2), frame, side * (R - 0.4 + lug / 2), D - 0.13, 0)));
  root.add(mesh(new TorusGeometry(R - 1.6, 0.42, 8, 28), mat('#1c1d20', 0.8), 0, D - 0.1, 0).rotateX(X_AXIS));
  const cone = new Group();
  cone.userData.live = true;
  const profile = [new Vector2(2.2, -3.4), new Vector2(5.4, -1.7), new Vector2(R - 2.0, -0.25)];
  cone.add(mesh(new LatheGeometry(profile, 28), mat('#25272b', 0.85, 0, { double: true }), 0, 0, 0));
  cone.add(mesh(new SphereGeometry(2.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#202226', 0.6), 0, -3.6, 0));
  const rest = D - 0.2;
  cone.position.y = rest;
  root.add(cone);
  // Lehim kulakları: sepetin arkasında (−z, tahtaya bakan yan), küçük bir yalıtkan levhada.
  const ty = hm + 1.9;
  const tz = -(rm * 0.8 + ((R - 0.3 - rm * 0.8) * 1.9) / coneH) - 0.3;
  root.add(mesh(new BoxGeometry(3.4, 1.7, 0.3), mat('#8a5a2b', 0.7), 0, ty, tz));
  const anchors = [-1, 1].map((side) => new Vector3(side * 0.95, ty, tz - 0.45));
  for (const a of anchors) root.add(mesh(new BoxGeometry(0.7, 0.9, 0.5), M.tin(), a.x, a.y, a.z + 0.15));
  let phase = 0;
  return {
    root,
    anchors,
    update(ctx) {
      const level = ctx.active ? (ctx.live?.loudness ?? 0) : 0;
      phase += ctx.dt * 60;
      cone.position.y = rest + level * 0.25 * Math.sin(phase);
      return level > 0.01;
    },
  };
}

/** Aktif buzzer (CMI-1295IC-0585T): Ø 12 × 9,5 mm siyah silindir, üstte ses deliği ve + işareti; karta oturur. */
export function buzzerModel(): PartModel {
  const body = new Group();
  const r = mm(BUZZER.diameter) / 2;
  const h = mm(BUZZER.height);
  const y0 = 0.12;
  body.add(named('buzzer', mesh(new CylinderGeometry(r, r, h, 28), mat('#16171a', 0.45), 0, y0 + h / 2, 0)));
  body.add(mesh(new CylinderGeometry(mm(2.2) / 2, mm(2.2) / 2, 0.02, 14), mat('#050505', 0.9), 0, y0 + h + 0.011, 0));
  const plus = labelPlate('+', 0.9, 0.9, { fg: '#d4d7db' });
  plus.position.set(-r * 0.58, y0 + h + 0.02, 0);
  body.add(plus);
  const model = radial('buzzer', body, mm(BUZZER.pitch), y0);
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
  const r = mm(MOTOR.diameter) / 2;
  const L = mm(MOTOR.length);
  const rs = mm(MOTOR.shaft) / 2;
  const ls = mm(MOTOR.shaftLength);
  const yc = r + 1.0;
  // Gövde: çelik kovan, arkada (−x) fırça kapağı; önde yatak çıkıntısı ve mil.
  root.add(named('motor', axialCylinder(r, L * 0.8, mat('#b9bec4', 0.3, 1), L * 0.1, yc, 0, 28)));
  root.add(named('motor', axialCylinder(r, L * 0.2, mat('#2a2d31', 0.5), -L * 0.4, yc, 0, 28)));
  root.add(axialCylinder(mm(10) / 2, 0.5, M.steel(), L / 2 + 0.25, yc, 0, 16));
  root.add(named('motor-mil', axialCylinder(rs, ls, M.steel(), L / 2 + ls / 2, yc, 0, 12)));
  const fan = new Group();
  fan.userData.live = true;
  fan.position.set(L / 2 + ls - 0.7, yc, 0);
  for (let k = 0; k < 3; k++) {
    const blade = mesh(new BoxGeometry(0.14, 4.4, 1.7), mat('#d6402e', 0.5), 0, 2.9, 0);
    const holder = new Group();
    holder.rotation.x = (k * 2 * Math.PI) / 3;
    holder.add(blade);
    fan.add(holder);
  }
  fan.add(axialCylinder(1.2, 1.0, mat('#d6402e', 0.5), 0, 0, 0, 16));
  root.add(fan);
  // Uçlar arka kapaktaki iki lehim kulağında.
  const anchors = [-1, 1].map((side) => new Vector3(-L / 2 - 0.75, yc, side * mm(10) / 2));
  for (const a of anchors) root.add(mesh(new BoxGeometry(0.9, 0.2, 0.8), M.tin(), a.x + 0.35, a.y, a.z));
  // Yatak: taban ve gövdeyi tutan iki eyer.
  root.add(mesh(new BoxGeometry(L * 0.75, 0.5, r * 1.7), mat('#3b3f45', 0.6), 0, 0.25, 0));
  const saddle = yc - r * 0.55;
  for (const x of [-L * 0.25, L * 0.25]) root.add(mesh(new BoxGeometry(1.4, saddle, r * 1.5), mat('#3b3f45', 0.6), x, saddle / 2, 0));
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

/** Vida terminallerinin kartın ortasından uzaklığı (x): 29 mm'lik röle aralarına sığsın diye şema pinlerinden dışarıda. */
const RELAY_TERMINAL_X = 7.3;

export function relayModel(): PartModel {
  const root = new Group();
  const pins = pinAnchors('relay').map((p) => new Vector3(Math.sign(p.x) * RELAY_TERMINAL_X, p.y, p.z));
  const l = mm(RELAY.length);
  const w = mm(RELAY.width);
  const h = mm(RELAY.height);
  root.add(mesh(new BoxGeometry(2 * RELAY_TERMINAL_X + 1.6, 0.3, 10.2), M.pcbBlue(), 0, 0.35, -1.2));
  const cube = named('role', mesh(new BoxGeometry(l, h, w), mat('#1c1e22', 0.5), 0, 0.5 + h / 2, -1.2));
  root.add(cube);
  const label = labelPlate('G2R-1  12 VDC', l * 0.86, 1.3, { fg: '#c9cdd3' });
  label.position.set(0, 0.5 + h + 0.02, -1.2);
  root.add(label);
  const ledMat = new MeshStandardMaterial({ color: '#7a1d17', roughness: 0.3, emissive: '#ff3b30', emissiveIntensity: 0 });
  const led = mesh(new BoxGeometry(0.6, 0.35, 0.35), ledMat, -4.6, 0.68, 3.0);
  led.userData.live = true;
  root.add(led);
  const glow = glowSprite('#ff5040', 3);
  glow.position.set(-4.6, 1.0, 3.0);
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

/** Pilin uçlarından masaya inen kırmızı / siyah kablolar ve kabloların bittiği uçlar (+ önce). */
function batteryWires(root: Group, from: readonly [Vector3, Vector3], endX: number): Vector3[] {
  const anchors = [new Vector3(endX, LEAD_Y, -1.5), new Vector3(endX, LEAD_Y, 1.5)];
  ['#c8312a', '#1c1c1c'].forEach((color, i) => {
    const a = from[i]!;
    const b = anchors[i]!;
    root.add(wirePath([a, new Vector3((a.x + b.x) / 2 + 0.4, a.y, (a.z + b.z) / 2), new Vector3(b.x, Math.min(a.y, 0.9), b.z), b], 0.16, mat(color, 0.5)));
  });
  return anchors;
}

/** 9 V'luk blok pil (6LR61), geniş yüzü masada; uçta kopçalı bağlantı başlığı ve iki kablo. */
function pp3Model(text: string): PartModel {
  const root = new Group();
  const L = mm(PP3.length);
  const W = mm(PP3.width);
  const H = mm(PP3.height);
  const tail = 4.4;
  const x0 = -(L + tail) / 2;
  const g = new Group();
  g.position.x = x0 + L / 2;
  g.add(named('pp3', mesh(new BoxGeometry(L * 0.76, H, W), mat('#2a3d66', 0.4, 0.3), -L * 0.12, H / 2, 0)));
  g.add(named('pp3', mesh(new BoxGeometry(L * 0.24, H, W), mat('#c9a646', 0.35, 0.8), L * 0.38, H / 2, 0)));
  // Kopçalar: + küçük ve yuvarlak, − büyük ve altıgen; merkezleri 12,7 mm.
  const half = mm(PP3.snapPitch) / 2;
  g.add(axialCylinder(mm(5.7) / 2, 0.7, M.steel(), L / 2 + 0.35, H / 2, -half, 14));
  g.add(axialCylinder(mm(8) / 2, 0.7, M.steel(), L / 2 + 0.35, H / 2, half, 6));
  // Bağlantı başlığı: kopçalara oturan siyah plaka.
  g.add(mesh(new BoxGeometry(0.5, H * 0.7, W * 0.92), mat('#16171a', 0.6), L / 2 + 0.95, H / 2, 0));
  const plate = labelPlate(text, 6.2, 2.6, { fg: '#f2f4f6' });
  plate.position.set(-L * 0.12, H + 0.02, 0);
  g.add(plate);
  const plus = labelPlate('+', 1.6, 1.6, { fg: '#1d2733' });
  plus.position.set(L * 0.38, H + 0.02, -half);
  g.add(plus);
  root.add(g);
  const startX = g.position.x + L / 2 + 1.2;
  const anchors = batteryWires(root, [new Vector3(startX, H / 2, -half), new Vector3(startX, H / 2, half)], (L + tail) / 2 - 0.3);
  return { root, anchors };
}

/** AA pil yatağı: 1,5 V'luk hücreler yan yana (4'ten çoksa iki katta), yönleri dönüşümlü; uçta iki kablo. */
function aaHolderModel(text: string, cells: number, layers: number, perLayer: number): PartModel {
  const root = new Group();
  const r = mm(AA.diameter) / 2;
  const len = mm(AA.length);
  const nub = mm(1.5);
  const pitch = mm(AA.holderPitch);
  const HL = mm(AA.holderLength);
  const HW = perLayer * pitch + mm(3);
  const tail = 3.2;
  const g = new Group();
  g.position.x = -tail / 2;
  const plastic = mat('#1e2125', 0.6);
  const layerH = 2 * r + 0.5;
  g.add(mesh(new BoxGeometry(HL, 0.5, HW), plastic, 0, 0.25, 0));
  for (const side of [-1, 1]) g.add(mesh(new BoxGeometry(0.6, 0.5 + (layers - 1) * layerH + r * 1.35, HW), plastic, side * (HL / 2 - 0.3), (0.5 + (layers - 1) * layerH + r * 1.35) / 2, 0));
  if (layers > 1) g.add(mesh(new BoxGeometry(HL, 0.4, HW), plastic, 0, 0.5 + layerH - 0.25, 0));
  const blue = mat('#2a3d66', 0.4, 0.3);
  const gold = mat('#c9a646', 0.35, 0.8);
  for (let i = 0; i < cells; i++) {
    const layer = Math.floor(i / perLayer);
    const j = i % perLayer;
    const count = Math.min(perLayer, cells - layer * perLayer);
    const z = (j - (count - 1) / 2) * pitch;
    const y = 0.5 + r + layer * layerH;
    const dir = i % 2 === 0 ? -1 : 1;
    g.add(named(`aa-${i}`, axialCylinder(r, len - nub, blue, -dir * (nub / 2), y, z, 18)));
    g.add(axialCylinder(r + 0.012, len * 0.2, gold, dir * (len * 0.32), y, z, 18));
    g.add(named(`aa-${i}`, axialCylinder(mm(5.5) / 2, nub, M.steel(), dir * (len / 2 - nub / 2), y, z, 12)));
  }
  const top = 0.5 + 2 * r + (layers - 1) * layerH;
  const plate = labelPlate(text, 6.4, 2.0, { fg: '#f2f4f6' });
  const firstCount = Math.min(perLayer, cells - (layers - 1) * perLayer);
  plate.position.set(-1.2, top + 0.03, (0 - (firstCount - 1) / 2) * pitch);
  g.add(plate);
  root.add(g);
  const startX = g.position.x + HL / 2;
  const anchors = batteryWires(root, [new Vector3(startX, 0.7, -HW / 2 + 0.9), new Vector3(startX, 0.7, HW / 2 - 0.9)], (HL + tail) / 2 - 0.3);
  return { root, anchors };
}

/** Pil: 9 V dolayında blok pil (6LR61), öbür gerilimlerde AA pil yatağı (dimensions.ts → batteryPack). */
export function batteryModel(props: Props): PartModel {
  const V = numProp(props, 'voltage', 9);
  const text = `${String(V).replace('.', ',')} V`;
  const pack = batteryPack(V);
  return pack.kind === 'pp3' ? pp3Model(text) : aaHolderModel(text, pack.cells, pack.layers, pack.perLayer);
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

/** DC akım kaynağı: AC kaynakla aynı kutu ailesi; yüzde ok ve değer (tasarım: parcalar-3b/newParts.ts). */
export function currentSourceModel(props: Props): PartModel {
  const root = new Group();
  const value = formatSI(numProp(props, 'current', 1e-3), 'A', { trim: true, digits: 4 });
  const w = 9.6;
  const d = 4.8;
  const top = canvasTexture(w, d, (c, W, H) => {
    c.fillStyle = '#e9ecef';
    c.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.42;
    const R = H * 0.28;
    c.strokeStyle = '#1d2733';
    c.lineWidth = H * 0.045;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(cx - R * 0.6, cy);
    c.lineTo(cx + R * 0.45, cy);
    c.stroke();
    c.fillStyle = '#1d2733';
    c.beginPath();
    c.moveTo(cx + R * 0.7, cy);
    c.lineTo(cx + R * 0.3, cy - R * 0.28);
    c.lineTo(cx + R * 0.3, cy + R * 0.28);
    c.fill();
    c.fillStyle = '#5f6b7a';
    c.font = `600 ${Math.round(H * 0.15)}px "IBM Plex Sans", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.fillText(`AKIM KAYNAĞI · ${value}`, W / 2, H * 0.92);
  });
  const box = new Mesh(new BoxGeometry(w, 2.4, d), [M.white(), M.white(), new MeshStandardMaterial({ map: top, roughness: 0.6 }), M.white(), M.white(), M.white()]);
  box.position.y = 1.2;
  box.userData.ownsMaterial = true;
  root.add(box);
  const anchors = [new Vector3(-(w / 2 - 1.0), 2.5, 0), new Vector3(w / 2 - 1.0, 2.5, 0)];
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
