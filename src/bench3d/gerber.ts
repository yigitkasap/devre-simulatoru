// Üretim dosyaları (three'siz, saf hesap): Gerber RS-274X (X2 öznitelikli) katmanları ve Excellon
// delik dosyaları. Üretici (JLCPCB, PCBWay, Türkiye'deki üreticiler) bu zip'i doğrudan okur.
//
// Katmanlar: üst/alt bakır, üst/alt lehim maskesi, üst serigrafi, kart kenarı; kaplamalı (PTH) ve
// kaplamasız (NPTH, montaj) delikler ayrı. Birim mm, biçim 4.6. Gerber'de y yukarı olduğundan kart
// koordinatının y'si ters çevrilir (KiCad gibi); delik dosyası aynı koordinatları kullanır.
// Dosya adları KiCad'in Protel uzantılı adlarıdır (üreticiler katmanı addan da tanır).

import { refAnchor, type PcbDesign } from './kicad';
import { RULES, type Routing } from './router';
import { textStrokes } from './strokeFont';
import { makeZip } from './zip';

/** Lehim maskesi açıklığı: pedin her yanından (mm). */
const MASK_EXPANSION = 0.05;
const SILK_WIDTH = 0.15;
/** Serigrafi yazı yüksekliği (mm): üreticilerin çoğunun alt sınırı 1 mm. */
const TEXT_HEIGHT = 1;

const coord = (v: number) => String(Math.round(v * 1e6));
const xy = (x: number, y: number) => `X${coord(x)}Y${coord(-y)}`;
const mm = (v: number) => v.toFixed(6);

type Function = 'ComponentPad' | 'ViaPad' | 'Conductor' | 'Profile' | 'Other' | 'NonConductor';

class Gerber {
  private readonly apertures = new Map<string, number>();
  private readonly defs: string[] = [];
  private readonly body: string[] = [];
  private current = -1;
  constructor(
    private readonly fileFunction: string,
    private readonly polarity: 'Positive' | 'Negative',
  ) {}
  private aperture(template: string, fn: Function): number {
    const key = `${template}|${fn}`;
    let d = this.apertures.get(key);
    if (d === undefined) {
      d = 10 + this.apertures.size;
      this.apertures.set(key, d);
      this.defs.push(`%TA.AperFunction,${fn}*%`, `%ADD${d}${template}*%`, '%TD*%');
    }
    if (d !== this.current) {
      this.body.push(`D${d}*`);
      this.current = d;
    }
    return d;
  }
  flash(shape: 'circle' | 'rect', size: number, x: number, y: number, fn: Function) {
    this.aperture(shape === 'circle' ? `C,${mm(size)}` : `R,${mm(size)}X${mm(size)}`, fn);
    this.body.push(`${xy(x, y)}D03*`);
  }
  /** Kırık çizgi (en az iki nokta). */
  line(points: ReadonlyArray<readonly [number, number]>, width: number, fn: Function) {
    this.aperture(`C,${mm(width)}`, fn);
    points.forEach(([x, y], i) => this.body.push(`${xy(x, y)}${i === 0 ? 'D02' : 'D01'}*`));
  }
  text(): string {
    return [
      '%TF.GenerationSoftware,yigitkasap,Devre Simulatoru,1.0*%',
      '%TF.SameCoordinates,Original*%',
      `%TF.FileFunction,${this.fileFunction}*%`,
      `%TF.FilePolarity,${this.polarity}*%`,
      '%FSLAX46Y46*%',
      'G04 Devre Simulatoru: https://yigitkasap.github.io/devre-simulatoru/*',
      '%MOMM*%',
      '%LPD*%',
      'G01*',
      ...this.defs,
      ...this.body,
      'M02*',
      '',
    ].join('\n');
  }
}

/** Çember, kırık çizgi olarak (serigrafi için). */
function circlePoints(cx: number, cy: number, r: number): Array<readonly [number, number]> {
  const n = 48;
  return Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as const);
}

function copper(design: PcbDesign, routing: Routing, layer: 0 | 1): string {
  const g = new Gerber(layer === 0 ? 'Copper,L1,Top' : 'Copper,L2,Bot', 'Positive');
  for (const t of routing.tracks) {
    if (t.layer !== layer) continue;
    g.line(
      [
        [t.x0, t.y0],
        [t.x1, t.y1],
      ],
      t.width,
      'Conductor',
    );
  }
  for (const f of design.footprints) for (const p of f.pads) if (!p.npth) g.flash(p.shape === 'rect' ? 'rect' : 'circle', p.size, p.x, p.y, 'ComponentPad');
  for (const v of routing.vias) g.flash('circle', RULES.via, v.x, v.y, 'ViaPad');
  return g.text();
}

function mask(design: PcbDesign, layer: 0 | 1): string {
  // Lehim maskesi negatif: çizilen yerler açıklıktır (bakır açıkta). Via'lar kapalı (tented).
  const g = new Gerber(layer === 0 ? 'Soldermask,Top' : 'Soldermask,Bot', 'Negative');
  for (const f of design.footprints) for (const p of f.pads) g.flash(p.shape === 'rect' ? 'rect' : 'circle', p.size + 2 * MASK_EXPANSION, p.x, p.y, p.npth ? 'Other' : 'ComponentPad');
  return g.text();
}

function silkscreen(design: PcbDesign): string {
  const g = new Gerber('Legend,Top', 'Positive');
  for (const f of design.footprints) {
    for (const [x0, y0, x1, y1] of f.silk) {
      g.line(
        [
          [x0, y0],
          [x1, y1],
        ],
        SILK_WIDTH,
        'Other',
      );
    }
    for (const [x, y, r] of f.circles) g.line(circlePoints(x, y, r), SILK_WIDTH, 'Other');
    if (f.pads.some((p) => p.npth)) continue;
    const at = refAnchor(f);
    for (const stroke of textStrokes(f.ref, at.x, at.y, TEXT_HEIGHT)) g.line(stroke, SILK_WIDTH, 'Other');
    for (const p of f.pads) {
      if (!p.label) continue;
      for (const stroke of textStrokes(p.label, p.x, p.y + (p.labelDy ?? 2.4), TEXT_HEIGHT)) g.line(stroke, SILK_WIDTH, 'Other');
    }
  }
  return g.text();
}

function profile(design: PcbDesign): string {
  const g = new Gerber('Profile,NP', 'Positive');
  const o = design.outline;
  g.line(
    [
      [o.x0, o.y0],
      [o.x1, o.y0],
      [o.x1, o.y1],
      [o.x0, o.y1],
      [o.x0, o.y0],
    ],
    0.1,
    'Profile',
  );
  return g.text();
}

/** Excellon delik dosyası; `plated`: kaplamalı (ped, via) ya da kaplamasız (montaj) delikler. */
function drill(design: PcbDesign, routing: Routing, plated: boolean): string {
  const hits = new Map<string, { drill: number; via: boolean; points: Array<[number, number]> }>();
  const add = (drill: number, via: boolean, x: number, y: number) => {
    const key = `${drill.toFixed(3)}|${via}`;
    const h = hits.get(key) ?? { drill, via, points: [] };
    h.points.push([x, y]);
    hits.set(key, h);
  };
  for (const f of design.footprints) for (const p of f.pads) if (Boolean(p.npth) !== plated) add(p.drill, false, p.x, p.y);
  if (plated) for (const v of routing.vias) add(RULES.viaDrill, true, v.x, v.y);
  const tools = [...hits.values()].sort((a, b) => a.drill - b.drill || Number(a.via) - Number(b.via));
  const num = (v: number) => String(Math.round(v * 1000) / 1000);
  const lines = [
    'M48',
    '; DRILL file {Devre Simulatoru}',
    '; FORMAT={-:-/ absolute / metric / decimal}',
    '; #@! TF.GenerationSoftware,yigitkasap,Devre Simulatoru,1.0',
    plated ? '; #@! TF.FileFunction,Plated,1,2,PTH' : '; #@! TF.FileFunction,NonPlated,1,2,NPTH',
    'FMAT,2',
    'METRIC',
  ];
  tools.forEach((t, i) => {
    lines.push(plated ? `; #@! TA.AperFunction,Plated,PTH,${t.via ? 'ViaDrill' : 'ComponentDrill'}` : '; #@! TA.AperFunction,NonPlated,NPTH,ComponentDrill');
    lines.push(`T${i + 1}C${t.drill.toFixed(3)}`);
  });
  lines.push('%', 'G90', 'G05');
  tools.forEach((t, i) => {
    lines.push(`T${i + 1}`);
    for (const [x, y] of t.points) lines.push(`X${num(x)}Y${num(-y)}`);
  });
  lines.push('M30', '');
  return lines.join('\n');
}

export interface FabFile {
  readonly name: string;
  readonly text: string;
}

/** Üreticiye yüklenecek dosyalar (zip'in kökünde). */
export function fabricationFiles(design: PcbDesign, routing: Routing, base: string): FabFile[] {
  return [
    { name: `${base}-F_Cu.gtl`, text: copper(design, routing, 0) },
    { name: `${base}-B_Cu.gbl`, text: copper(design, routing, 1) },
    { name: `${base}-F_Mask.gts`, text: mask(design, 0) },
    { name: `${base}-B_Mask.gbs`, text: mask(design, 1) },
    { name: `${base}-F_Silkscreen.gto`, text: silkscreen(design) },
    { name: `${base}-Edge_Cuts.gm1`, text: profile(design) },
    { name: `${base}-PTH.drl`, text: drill(design, routing, true) },
    { name: `${base}-NPTH.drl`, text: drill(design, routing, false) },
  ];
}

export function fabricationZip(design: PcbDesign, routing: Routing, base: string): Uint8Array {
  return makeZip(fabricationFiles(design, routing, base));
}
