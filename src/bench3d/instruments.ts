// Ekranlı cihazlar: multimetre (voltmetre, ampermetre), DC güç kaynağı, fonksiyon üreteci, osiloskop
// ve su haznesi. Ekranlar tuval dokusudur; değer değişince (en çok saniyede 10 kez) yeniden çizilir.

import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, Vector3 } from 'three';
import { SCOPE_DIVISIONS_X, SCOPE_DIVISIONS_Y } from '../sim/scope';
import { formatSI } from '../sim/units';
import { numProp, strProp, type DeviceType } from '../sim/netlist';
import { LEAD_Y, M, SPREAD, mat, mesh, ownMat, pinAnchors, wirePath } from './kit';
import type { LiveContext, PartModel } from './model';

const FONT = '"IBM Plex Mono", ui-monospace, monospace';
const SANS = '"IBM Plex Sans", system-ui, sans-serif';

/** Üst yüzü yeniden çizilebilen kutu. */
function panelBox(w: number, d: number, h: number, body: MeshStandardMaterial, ppu = 40) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * ppu);
  canvas.height = Math.round(d * ppu);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const face = new MeshStandardMaterial({ map: texture, roughness: 0.55 });
  const box = new Mesh(new BoxGeometry(w, h, d), [body, body, face, body, body, body]);
  box.position.y = h / 2;
  box.userData.ownsMaterial = true;
  box.userData.live = true;
  let last = '';
  let lastTime = -1;
  return {
    box,
    ctx: canvas.getContext('2d')!,
    W: canvas.width,
    H: canvas.height,
    /** key değiştiyse (ve son çizimden 0,1 s geçtiyse) çizer. */
    redraw(key: string, now: number, draw: () => void, force = false) {
      if (!force && (key === last || now - lastTime < 0.1)) return;
      last = key;
      lastTime = now;
      draw();
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
      face.dispose();
    },
  };
}

function bananaJack(at: Vector3, color: string): Group {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(0.62, 0.62, 0.7, 18), mat(color, 0.45), at.x, at.y - 0.35, at.z));
  g.add(mesh(new CylinderGeometry(0.28, 0.28, 0.04, 12), mat('#0b0b0b', 0.9), at.x, at.y + 0.01, at.z));
  return g;
}

function bnc(at: Vector3): Group {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(0.75, 0.75, 0.9, 18), M.steel(), at.x, at.y - 0.45, at.z));
  g.add(mesh(new CylinderGeometry(0.22, 0.22, 0.05, 10), M.gold(), at.x, at.y + 0.02, at.z));
  return g;
}

function lcd(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#1e2a25';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#0d1411';
  ctx.lineWidth = Math.max(2, h * 0.04);
  ctx.strokeRect(x, y, w, h);
}

// --- Multimetre ----------------------------------------------------------------------------------------

export function meterModel(type: 'voltmeter' | 'ammeter'): PartModel {
  const root = new Group();
  const pins = pinAnchors(type);
  const w = 11;
  const d = 5.6;
  const panel = panelBox(w, d, 1.6, mat('#f2c230', 0.6), 44);
  root.add(panel.box);
  const anchors = [new Vector3(-w / 2 + 1.1, 1.75, 1.2), new Vector3(w / 2 - 1.1, 1.75, 1.2)];
  root.add(bananaJack(anchors[0]!, '#c8312a'), bananaJack(anchors[1]!, '#1d1f23'));
  // Bacak yerine pinlere kısa uçlar (şemadaki pinlerle kablo uçları aynı yerde kalsın).
  void pins;
  const unit = type === 'voltmeter' ? 'V' : 'A';
  const draw = (text: string, mode: string) => {
    const { ctx, W, H } = panel;
    ctx.fillStyle = '#2b2f35';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(0, 0, W, H * 0.06);
    ctx.fillRect(0, H * 0.94, W, H * 0.06);
    lcd(ctx, W * 0.2, H * 0.12, W * 0.6, H * 0.46);
    ctx.fillStyle = '#a6f4bd';
    ctx.font = `600 ${Math.round(H * 0.3)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W * 0.5, H * 0.36, W * 0.56);
    ctx.font = `600 ${Math.round(H * 0.12)}px ${SANS}`;
    ctx.fillStyle = '#d7dbe0';
    ctx.fillText(mode, W * 0.5, H * 0.7);
    ctx.fillStyle = '#d7dbe0';
    ctx.fillText(unit === 'V' ? 'V Ω' : 'mA', W * 0.9, H * 0.7);
    ctx.fillText('COM', W * 0.1, H * 0.7);
  };
  draw('– – –', type === 'voltmeter' ? 'VOLTMETRE' : 'AMPERMETRE');
  return {
    root,
    anchors,
    update(ctx: LiveContext) {
      const reading = ctx.status?.reading ?? ctx.measurement?.[type === 'voltmeter' ? 'voltage' : 'current'];
      const mode = strProp(ctx.props, 'mode', ['dc', 'ac'], 'dc') === 'ac' ? 'AC' : 'DC';
      const text = ctx.active && reading !== undefined ? formatSI(reading, unit, { digits: 4 }) : '– – –';
      panel.redraw(text + mode, ctx.now, () => draw(text, `${type === 'voltmeter' ? 'VOLTMETRE' : 'AMPERMETRE'} · ${mode}`));
      return false;
    },
    dispose: panel.dispose,
  };
}

// --- Masa üstü cihazlar (güç kaynağı, fonksiyon üreteci, osiloskop) -------------------------------------------

function footprint(type: DeviceType) {
  const pins = pinAnchors(type);
  return pins;
}

export function dcsupplyModel(): PartModel {
  const root = new Group();
  const pins = footprint('dcsupply');
  const w = 12.8;
  const d = 11.6;
  const cx = -0.4;
  const panel = panelBox(w, d, 5.5, mat('#d9dde2', 0.5), 36);
  panel.box.position.x = cx;
  root.add(panel.box);
  const anchors = pins.map((p) => new Vector3(cx + w / 2 - 1.0, 5.65, p.z));
  anchors.forEach((a, i) => root.add(bananaJack(a, i % 2 === 0 ? '#c8312a' : '#1d1f23')));
  const draw = (lines: readonly string[]) => {
    const { ctx, W, H } = panel;
    ctx.fillStyle = '#e7eaee';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3d4957';
    ctx.font = `600 ${Math.round(H * 0.07)}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText('DC GÜÇ KAYNAĞI', W * 0.06, H * 0.1);
    for (let k = 0; k < 2; k++) {
      const y = H * (0.18 + k * 0.4);
      lcd(ctx, W * 0.06, y, W * 0.66, H * 0.3);
      ctx.fillStyle = '#a6f4bd';
      ctx.font = `600 ${Math.round(H * 0.11)}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(lines[2 * k] ?? '', W * 0.68, y + H * 0.13);
      ctx.fillText(lines[2 * k + 1] ?? '', W * 0.68, y + H * 0.26);
      ctx.fillStyle = '#5f6b7a';
      ctx.font = `600 ${Math.round(H * 0.06)}px ${SANS}`;
      ctx.textAlign = 'left';
      ctx.fillText(`ÇIKIŞ ${k + 1}`, W * 0.06, y + H * 0.35);
    }
  };
  draw(['– – – V', '– – – A', '– – – V', '– – – A']);
  return {
    root,
    anchors,
    update(ctx) {
      const outs = ctx.status?.outputs;
      const lines = [0, 1].flatMap((k) => {
        const o = outs?.[k];
        return ctx.active && o ? [formatSI(o.voltage, 'V', { digits: 4 }), formatSI(o.current, 'A', { digits: 3 })] : ['– – – V', '– – – A'];
      });
      panel.redraw(lines.join('|'), ctx.now, () => draw(lines));
      return false;
    },
    dispose: panel.dispose,
  };
}

export function funcgenModel(): PartModel {
  const root = new Group();
  const pins = footprint('funcgen');
  const w = 12.8;
  const d = 8.6;
  const cx = -0.4;
  const panel = panelBox(w, d, 5.0, mat('#d9dde2', 0.5), 36);
  panel.box.position.x = cx;
  root.add(panel.box);
  const anchors = pins.map((p) => new Vector3(cx + w / 2 - 1.1, 5.1, p.z));
  anchors.forEach((a, i) => root.add(i === 2 ? bananaJack(a, '#1d1f23') : bnc(a)));
  const draw = (wave: string, freq: string, amp: string) => {
    const { ctx, W, H } = panel;
    ctx.fillStyle = '#e7eaee';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3d4957';
    ctx.font = `600 ${Math.round(H * 0.09)}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText('FONKSİYON ÜRETECİ', W * 0.06, H * 0.13);
    lcd(ctx, W * 0.06, H * 0.22, W * 0.7, H * 0.56);
    ctx.strokeStyle = '#a6f4bd';
    ctx.lineWidth = H * 0.025;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const ph = (t * 2) % 1;
      const v = wave === 'square' ? (ph < 0.5 ? 1 : -1) : wave === 'triangle' ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(ph * 2 * Math.PI);
      const x = W * (0.1 + 0.3 * t);
      const y = H * (0.5 - 0.17 * v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#a6f4bd';
    ctx.font = `600 ${Math.round(H * 0.12)}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(freq, W * 0.73, H * 0.44);
    ctx.fillText(amp, W * 0.73, H * 0.66);
    ctx.fillStyle = '#5f6b7a';
    ctx.font = `600 ${Math.round(H * 0.07)}px ${SANS}`;
    ctx.fillText('OUT · TTL · COM', W * 0.97, H * 0.94);
  };
  return {
    root,
    anchors,
    update(ctx) {
      const wave = strProp(ctx.props, 'waveform', ['sine', 'square', 'triangle'], 'sine');
      const freq = formatSI(numProp(ctx.props, 'frequency', 1000), 'Hz', { trim: true, digits: 4 });
      const amp = `${formatSI(numProp(ctx.props, 'amplitude', 2), 'V', { trim: true, digits: 3 })}pp`;
      panel.redraw(wave + freq + amp, ctx.now, () => draw(wave, freq, amp));
      return false;
    },
    dispose: panel.dispose,
  };
}

export function oscilloscopeModel(): PartModel {
  const root = new Group();
  const pins = footprint('oscilloscope');
  const w = 13.4;
  const d = 8.6;
  const cx = -0.6;
  const panel = panelBox(w, d, 6.0, mat('#cfd4da', 0.5), 48);
  panel.box.position.x = cx;
  root.add(panel.box);
  const anchors = pins.map((p) => new Vector3(cx - w / 2 + 1.1, 6.1, p.z));
  anchors.forEach((a, i) => root.add(i === 2 ? bananaJack(a, '#1d1f23') : bnc(a)));
  const draw = (paths: readonly string[], xy: string) => {
    const { ctx, W, H } = panel;
    ctx.fillStyle = '#e4e7eb';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3d4957';
    ctx.font = `600 ${Math.round(H * 0.07)}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText('A    B    COM', W * 0.02, H * 0.97);
    const sx = W * 0.18;
    const sy = H * 0.07;
    const sw = W * 0.78;
    const sh = H * 0.8;
    ctx.fillStyle = '#0f1713';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = '#2b3b32';
    ctx.lineWidth = 1;
    for (let i = 1; i < SCOPE_DIVISIONS_X; i++) {
      ctx.beginPath();
      ctx.moveTo(sx + (sw * i) / SCOPE_DIVISIONS_X, sy);
      ctx.lineTo(sx + (sw * i) / SCOPE_DIVISIONS_X, sy + sh);
      ctx.stroke();
    }
    for (let i = 1; i < SCOPE_DIVISIONS_Y; i++) {
      ctx.beginPath();
      ctx.moveTo(sx, sy + (sh * i) / SCOPE_DIVISIONS_Y);
      ctx.lineTo(sx + sw, sy + (sh * i) / SCOPE_DIVISIONS_Y);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(sw / SCOPE_DIVISIONS_X, sh / SCOPE_DIVISIONS_Y);
    ctx.lineWidth = 0.06;
    ctx.lineJoin = 'round';
    const colors = ['#ffd43b', '#4dd4ff'];
    if (xy) {
      ctx.strokeStyle = colors[0]!;
      ctx.stroke(new Path2D(xy));
    } else {
      paths.forEach((path, i) => {
        if (!path) return;
        ctx.strokeStyle = colors[i]!;
        ctx.stroke(new Path2D(path));
      });
    }
    ctx.restore();
  };
  draw(['', ''], '');
  return {
    root,
    anchors,
    update(ctx) {
      const view = ctx.active ? ctx.scope : undefined;
      const paths = view ? view.channels.map((c) => c.path) : ['', ''];
      const xy = view?.xyPath ?? '';
      panel.redraw(paths.join('|') + xy, ctx.now, () => draw(paths, xy));
      return false;
    },
    dispose: panel.dispose,
  };
}

// --- Su haznesi: saydam kap, su, dört prob ---------------------------------------------------------------------

export function tankModel(): PartModel {
  const root = new Group();
  const pins = pinAnchors('tank');
  const w = 10.5;
  const d = 10;
  const h = 9;
  const cx = -0.3;
  const wall = mat('#dfe9ef', 0.05, 0, { transparent: true, opacity: 0.22 });
  const box = mesh(new BoxGeometry(w, h, d), wall, cx, h / 2 + 0.3, 0);
  box.userData.ownsMaterial = false;
  root.add(box);
  root.add(mesh(new BoxGeometry(w + 0.6, 0.3, d + 0.6), mat('#3b4148', 0.6), cx, 0.15, 0));
  const waterMat = ownMat('#3d8fd8', 0.15, 0, { transparent: true, opacity: 0.55 });
  const water = mesh(new BoxGeometry(w - 0.3, 1, d - 0.3), waterMat, cx, 0, 0);
  water.userData.live = true;
  root.add(water);
  // Problar sağ duvarın içinde; uçları sırayla %12,5 / 37,5 / 62,5 / 87,5 yüksekliğe iner.
  const depths = [0.125, 0.375, 0.625, 0.875];
  const anchors: Vector3[] = [];
  pins.forEach((p, i) => {
    const x = cx + w / 2 - 1.0 - i * 0.2;
    const tip = 0.3 + h * depths[i]!;
    const top = h + 1.2;
    root.add(wirePath([new Vector3(x, tip, p.z * 0.85), new Vector3(x, top, p.z * 0.85), new Vector3(p.x + 0.4, top, p.z)], 0.13, M.steel()));
    const a = new Vector3(p.x + 0.4, top, p.z);
    root.add(mesh(new CylinderGeometry(0.45, 0.45, 0.8, 14), mat('#1d1f23', 0.5), a.x, top - 0.45, a.z));
    anchors.push(a);
  });
  const setLevel = (level: number) => {
    const fill = Math.max(0.001, Math.min(1, level / 100)) * h;
    water.scale.y = fill;
    water.position.y = 0.3 + fill / 2;
  };
  return {
    root,
    anchors,
    update(ctx) {
      setLevel(ctx.live?.level ?? numProp(ctx.props, 'level', 50));
      return false;
    },
    dispose() {
      waterMat.dispose();
    },
  };
}

export { SPREAD, LEAD_Y };
