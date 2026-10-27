// Arduino Uno R3 modeli: gerçek ölçülerde kart (68,6 × 53,3 mm = 27 × 21 birim), USB tarafı yukarıda
// (−z). Dijital başlık sağ kenarda (SCL … D0), güç ve analog başlıklar sol kenarda (NC … VIN, A0 … A5);
// kablolar dişi başlıkların deliklerine takılır. ON, L ve TX LED'leri simülasyonla yanar.

import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { M, canvasTexture, labelPlate, mat, mesh } from './kit';
import { glowSprite, type PartModel } from './model';

const W = 21;
const L = 27;
const BOARD_Y = 0.55;
const T = 0.63;
const TOP = BOARD_Y + T / 2;
const HEADER_H = 3.3;
const HX = W / 2 - 1.0;

/** Sağ kenar (dijital) ve sol kenar (güç, analog) başlık deliklerinin z konumları. */
const DIGITAL = ['SCL', 'SDA', 'AREF', 'GND', '13', '12', '~11', '~10', '~9', '8', '7', '~6', '~5', '4', '~3', '2', 'TX→1', 'RX←0'];
const digitalZ = (k: number) => -9.5 + k + (k >= 10 ? 0.6 : 0);
const POWER = ['', 'IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'Vin', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const powerZ = (k: number) => -4.5 + k + (k >= 8 ? 1.0 : 0);

/** Çözücünün pin sırası (5V, 3V3, GND, A0–A5, D2–D13, GND) → başlık deliği. */
function holeOfPin(pin: number): Vector3 {
  const y = TOP + HEADER_H;
  if (pin === 0) return new Vector3(-HX, y, powerZ(4));
  if (pin === 1) return new Vector3(-HX, y, powerZ(3));
  if (pin === 2) return new Vector3(-HX, y, powerZ(5));
  if (pin <= 8) return new Vector3(-HX, y, powerZ(8 + pin - 3));
  if (pin <= 20) {
    const d = pin - 7; // D2 … D13
    return new Vector3(HX, y, digitalZ(17 - d));
  }
  return new Vector3(HX, y, digitalZ(3));
}

function boardTexture() {
  return canvasTexture(
    W,
    L,
    (ctx, w, h) => {
      const s = w / W;
      const X = (x: number) => (x + W / 2) * s;
      const Z = (z: number) => (z + L / 2) * s;
      ctx.fillStyle = '#00727f';
      ctx.fillRect(0, 0, w, h);
      // İnce bakır yollar (süs): kenarlardan çipe.
      ctx.strokeStyle = 'rgba(120, 200, 205, 0.35)';
      ctx.lineWidth = s * 0.12;
      for (let k = 0; k < 14; k++) {
        ctx.beginPath();
        ctx.moveTo(X(HX - 0.9), Z(digitalZ(k + 4)));
        ctx.lineTo(X(5.5), Z(digitalZ(k + 4)));
        ctx.lineTo(X(4.2), Z(-3 + k * 1.0));
        ctx.stroke();
      }
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.moveTo(X(-HX + 0.9), Z(powerZ(8 + k)));
        ctx.lineTo(X(-1), Z(powerZ(8 + k)));
        ctx.lineTo(X(0.8), Z(4 + k));
        ctx.stroke();
      }
      ctx.fillStyle = '#f2f4f2';
      ctx.textBaseline = 'middle';
      // Başlık yazıları.
      ctx.font = `600 ${Math.round(s * 0.62)}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.textAlign = 'right';
      DIGITAL.forEach((name, k) => ctx.fillText(name, X(HX - 0.95), Z(digitalZ(k))));
      ctx.textAlign = 'left';
      POWER.forEach((name, k) => ctx.fillText(name, X(-HX + 0.95), Z(powerZ(k))));
      ctx.save();
      ctx.translate(X(HX - 4.1), Z(0.6));
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(s * 0.7)}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.fillText('DIGITAL (PWM ~)', 0, 0);
      ctx.restore();
      ctx.save();
      ctx.translate(X(-HX + 4.0), Z(powerZ(2)));
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('POWER', 0, 0);
      ctx.translate(Z(powerZ(10.5)) - Z(powerZ(2)), 0);
      ctx.fillText('ANALOG IN', 0, 0);
      ctx.restore();
      // Kart adı.
      ctx.save();
      ctx.translate(X(-2.2), Z(-1));
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(s * 2.2)}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.fillText('UNO', 0, 0);
      ctx.font = `600 ${Math.round(s * 0.95)}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.fillText('ARDUINO', 0, s * 1.8);
      ctx.restore();
      ctx.font = `600 ${Math.round(s * 0.5)}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('L', X(4.4), Z(-5.5));
      ctx.fillText('TX', X(4.4), Z(-3.9));
      ctx.fillText('RX', X(4.4), Z(-3.1));
      ctx.fillText('ON', X(5.4), Z(10.5));
      // Delikler.
      ctx.fillStyle = '#d9dcd8';
      for (const [x, z] of [[-8.8, -12.2], [8.6, -11.4], [-8.8, 12.4], [8.6, 12.4]] as const) {
        ctx.beginPath();
        ctx.arc(X(x), Z(z), s * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a1d20';
        ctx.beginPath();
        ctx.arc(X(x), Z(z), s * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d9dcd8';
      }
    },
    40,
  );
}

function femaleHeader(x: number, zs: readonly number[]): Group {
  const g = new Group();
  const z0 = Math.min(...zs) - 0.5;
  const z1 = Math.max(...zs) + 0.5;
  g.add(mesh(new BoxGeometry(1.0, HEADER_H, z1 - z0), M.header(), x, TOP + HEADER_H / 2, (z0 + z1) / 2));
  const hole = new BoxGeometry(0.42, 0.04, 0.42);
  for (const z of zs) g.add(mesh(hole, mat('#050506', 0.95), x, TOP + HEADER_H + 0.01, z));
  return g;
}

function smdLed(x: number, z: number, color: string) {
  const material = new MeshStandardMaterial({ color: '#e9ecee', roughness: 0.3, emissive: color, emissiveIntensity: 0 });
  const led = mesh(new BoxGeometry(0.6, 0.3, 0.36), material, x, TOP + 0.15, z);
  led.userData.live = true;
  const glow = glowSprite(color, 3.2);
  glow.position.set(x, TOP + 0.5, z);
  return {
    objects: [led, glow],
    set(on: boolean) {
      material.emissiveIntensity = on ? 2.6 : 0;
      material.color.set(on ? color : '#e9ecee');
      glow.set(on ? 0.75 : 0);
    },
    dispose: () => material.dispose(),
  };
}

export function arduinoModel(): PartModel {
  const root = new Group();
  const top = boardTexture();
  const pcb = mat('#005f6b', 0.55);
  const board = new Mesh(new BoxGeometry(W, T, L), [pcb, pcb, new MeshStandardMaterial({ map: top, roughness: 0.55 }), pcb, pcb, pcb]);
  board.position.y = BOARD_Y;
  board.userData.ownsMaterial = true;
  root.add(board);
  for (const [x, z] of [[-8.8, -12.2], [8.6, -11.4], [-8.8, 12.4], [8.6, 12.4]] as const) {
    root.add(mesh(new CylinderGeometry(0.7, 0.7, BOARD_Y - T / 2, 12), mat('#2b2e33', 0.8), x, (BOARD_Y - T / 2) / 2, z));
  }
  // Başlıklar.
  root.add(femaleHeader(HX, DIGITAL.slice(0, 10).map((_, k) => digitalZ(k))));
  root.add(femaleHeader(HX, DIGITAL.slice(10).map((_, k) => digitalZ(k + 10))));
  root.add(femaleHeader(-HX, POWER.slice(0, 8).map((_, k) => powerZ(k))));
  root.add(femaleHeader(-HX, POWER.slice(8).map((_, k) => powerZ(k + 8))));
  // USB-B ve güç girişi.
  root.add(mesh(new BoxGeometry(4.7, 4.3, 6.3), mat('#b8bdc3', 0.3, 1), 4.2, TOP + 2.15, -L / 2 + 2.4));
  root.add(mesh(new BoxGeometry(3.4, 2.4, 0.2), mat('#2a2d31', 0.6), 4.2, TOP + 2.15, -L / 2 - 0.8));
  root.add(mesh(new BoxGeometry(3.6, 4.3, 5.6), mat('#121315', 0.5), -6.2, TOP + 2.15, -L / 2 + 2.2));
  root.add(mesh(new CylinderGeometry(1.1, 1.1, 0.2, 16), mat('#050505', 0.9), -6.2, TOP + 2.15, -L / 2 - 0.62).rotateX(Math.PI / 2));
  // ATmega328P (DIP-28, yuvada) ve yazısı.
  root.add(mesh(new BoxGeometry(3.6, 0.6, 14.6), mat('#d8d2c2', 0.7), 2.6, TOP + 0.3, 3.8));
  root.add(mesh(new BoxGeometry(2.9, 1.25, 14.0), mat('#16171a', 0.5), 2.6, TOP + 1.2, 3.8));
  for (let k = 0; k < 14; k++) {
    for (const side of [-1, 1]) root.add(mesh(new BoxGeometry(0.5, 0.5, 0.22), M.tin(), 2.6 + side * 1.65, TOP + 0.85, -2.7 + k));
  }
  const chipLabel = labelPlate('ATMEGA328P', 9, 1.1, { fg: '#bfc4ca' });
  chipLabel.position.set(2.6, TOP + 1.84, 4);
  chipLabel.rotation.z = -Math.PI / 2;
  root.add(chipLabel);
  root.add(mesh(new SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2a2c30', 0.6), 2.6, TOP + 1.83, -2.7));
  // Kristal, 16U2, düzenleyici, kondansatörler, reset düğmesi, ICSP.
  const crystal = mesh(new CylinderGeometry(0.75, 0.75, 4.2, 18), mat('#c9cdd2', 0.25, 1), -0.8, TOP + 0.8, -3.2);
  crystal.rotation.x = Math.PI / 2;
  crystal.scale.set(1, 1, 0.55);
  root.add(crystal);
  root.add(mesh(new BoxGeometry(2.0, 0.35, 2.0), mat('#1b1c1f', 0.5), 1.4, TOP + 0.18, -7.6));
  root.add(mesh(new BoxGeometry(2.6, 0.7, 2.6), mat('#1b1c1f', 0.5), -6.2, TOP + 0.35, -7.4));
  for (const z of [-5.0, -3.0]) root.add(mesh(new CylinderGeometry(1.0, 1.0, 2.2, 18), mat('#26262a', 0.45), -6.4, TOP + 1.1, z));
  root.add(mesh(new BoxGeometry(2.4, 1.2, 2.4), mat('#2b2e33', 0.5), 8.2, TOP + 0.6, -6.8));
  root.add(mesh(new CylinderGeometry(0.7, 0.7, 0.5, 16), mat('#c9372c', 0.5), 8.2, TOP + 1.45, -6.8));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) root.add(mesh(new BoxGeometry(0.25, 2.3, 0.25), M.gold(), 1.5 + i, TOP + 1.15, 11.5 + j));
  root.add(mesh(new BoxGeometry(3.0, 1.0, 2.0), M.header(), 2.5, TOP + 0.5, 12.0));
  // LED'ler.
  const ledL = smdLed(5.5, -5.5, '#ffb020');
  const ledTx = smdLed(5.5, -3.9, '#ffd84a');
  const ledRx = smdLed(5.5, -3.1, '#ffd84a');
  const ledOn = smdLed(6.6, 10.5, '#3ddc84');
  for (const led of [ledL, ledTx, ledRx, ledOn]) root.add(...led.objects);
  const anchors = Array.from({ length: 22 }, (_, pin) => holeOfPin(pin));
  return {
    root,
    anchors,
    update(ctx) {
      const a = ctx.status?.arduino;
      ledOn.set(ctx.active);
      ledL.set(ctx.active && (a?.ledL ?? false));
      ledTx.set(ctx.active && (a?.ledTx ?? false));
      ledRx.set(false);
      return false;
    },
    dispose() {
      for (const led of [ledL, ledTx, ledRx, ledOn]) led.dispose();
    },
  };
}
