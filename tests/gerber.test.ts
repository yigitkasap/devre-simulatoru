// Üretim dosyaları: her örnekte Gerber katmanları ve delik dosyaları okunabilir; pedler, via'lar ve
// yollar dosyada birebir; koordinatlar kartın içinde; serigrafi yazıları yazı tipinde var.

import { describe, expect, it } from 'vitest';
import { fabricationFiles } from '../src/bench3d/gerber';
import { designPcb } from '../src/bench3d/kicad';
import { routePcb, RULES } from '../src/bench3d/router';
import { foldText, textStrokes } from '../src/bench3d/strokeFont';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';

interface Parsed {
  attributes: string[];
  apertures: Map<number, string>;
  flashes: Array<{ d: number; x: number; y: number }>;
  draws: number;
}

/** Küçük Gerber okuyucusu: sözdizimi, açıklık tanımları ve komutlar. */
function parseGerber(text: string): Parsed {
  const lines = text.trim().split('\n');
  expect(lines.at(-1)).toBe('M02*');
  const out: Parsed = { attributes: [], apertures: new Map(), flashes: [], draws: 0 };
  let current = -1;
  let fs = false;
  let mo = false;
  for (const line of lines) {
    if (line.startsWith('%')) {
      expect(line.endsWith('*%'), line).toBe(true);
      const body = line.slice(1, -2);
      if (body.startsWith('TF.') || body.startsWith('TA.') || body === 'TD') out.attributes.push(body);
      else if (body === 'FSLAX46Y46') fs = true;
      else if (body === 'MOMM') mo = true;
      else if (body === 'LPD') continue;
      else {
        const m = /^ADD(\d+)(C,\d+\.\d{6}|R,\d+\.\d{6}X\d+\.\d{6})$/.exec(body);
        expect(m, line).not.toBeNull();
        out.apertures.set(Number(m![1]), m![2]!);
      }
      continue;
    }
    expect(line.endsWith('*'), line).toBe(true);
    if (line.startsWith('G04') || line === 'G01*' || line === 'M02*') continue;
    const select = /^D(\d+)\*$/.exec(line);
    if (select) {
      current = Number(select[1]);
      expect(out.apertures.has(current), line).toBe(true);
      continue;
    }
    const op = /^X(-?\d+)Y(-?\d+)D0([123])\*$/.exec(line);
    expect(op, line).not.toBeNull();
    expect(current).toBeGreaterThanOrEqual(10);
    if (op![3] === '3') out.flashes.push({ d: current, x: Number(op![1]) / 1e6, y: -Number(op![2]) / 1e6 });
    if (op![3] === '1') out.draws++;
  }
  expect(fs && mo).toBe(true);
  return out;
}

function parseDrill(text: string): Array<{ drill: number; x: number; y: number }> {
  const lines = text.trim().split('\n');
  expect(lines[0]).toBe('M48');
  expect(lines.at(-1)).toBe('M30');
  expect(lines).toContain('METRIC');
  const tools = new Map<number, number>();
  const hits: Array<{ drill: number; x: number; y: number }> = [];
  let tool = 0;
  let header = true;
  for (const line of lines.slice(1, -1)) {
    if (line.startsWith(';') || line === 'FMAT,2' || line === 'METRIC' || line === 'G90' || line === 'G05') continue;
    if (line === '%') {
      header = false;
      continue;
    }
    const def = /^T(\d+)C(\d+\.\d{3})$/.exec(line);
    if (def) {
      expect(header).toBe(true);
      tools.set(Number(def[1]), Number(def[2]));
      continue;
    }
    const sel = /^T(\d+)$/.exec(line);
    if (sel) {
      tool = Number(sel[1]);
      expect(tools.has(tool), line).toBe(true);
      continue;
    }
    const hit = /^X(-?\d+(?:\.\d+)?)Y(-?\d+(?:\.\d+)?)$/.exec(line);
    expect(hit, line).not.toBeNull();
    hits.push({ drill: tools.get(tool)!, x: Number(hit![1]), y: -Number(hit![2]) });
  }
  return hits;
}

describe('Üretim dosyaları (Gerber, Excellon)', () => {
  it('yazı tipi: Türkçe harfler sadeleşir, bilinmeyen karakter boşluk olur', () => {
    expect(foldText('Sev. 1')).toBe('SEV. 1');
    expect(foldText('+ uç')).toBe('+ UC');
    expect(foldText('− uç')).toBe('- UC');
    expect(foldText('İçi')).toBe('ICI');
    expect(foldText('Ω')).toBe(' ');
    // Yazı ortalanır ve yükseklik tutar.
    const strokes = textStrokes('HB', 10, 20, 1).flat();
    const xs = strokes.map((p) => p[0]);
    const ys = strokes.map((p) => p[1]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(10);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1);
  });

  for (const id of EXAMPLE_IDS) {
    it(`${id}: katmanlar ve delikler kartla birebir`, () => {
      const doc = exampleDoc(id)!;
      const result = designPcb(doc);
      if (!result.ok) return;
      const { design } = result;
      const routing = routePcb(design);
      const files = new Map(fabricationFiles(design, routing, 'kart').map((f) => [f.name, f.text]));
      expect([...files.keys()]).toEqual(['kart-F_Cu.gtl', 'kart-B_Cu.gbl', 'kart-F_Mask.gts', 'kart-B_Mask.gbs', 'kart-F_Silkscreen.gto', 'kart-Edge_Cuts.gm1', 'kart-PTH.drl', 'kart-NPTH.drl']);
      const pads = design.footprints.flatMap((f) => f.pads);
      const copperPads = pads.filter((p) => !p.npth);
      const o = design.outline;
      const inside = (x: number, y: number) => x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1;

      for (const [name, layer, fn] of [
        ['kart-F_Cu.gtl', 0, 'Copper,L1,Top'],
        ['kart-B_Cu.gbl', 1, 'Copper,L2,Bot'],
      ] as const) {
        const g = parseGerber(files.get(name)!);
        expect(g.attributes).toContain(`TF.FileFunction,${fn}`);
        expect(g.attributes).toContain('TF.FilePolarity,Positive');
        // Her ped ve via bir kez basılır; yollar katmanındaki kadar çizgi.
        expect(g.flashes.length).toBe(copperPads.length + routing.vias.length);
        expect(g.draws).toBe(routing.tracks.filter((t) => t.layer === layer).length);
        for (const f of g.flashes) expect(inside(f.x, f.y)).toBe(true);
        for (const p of copperPads) expect(g.flashes.some((f) => Math.abs(f.x - p.x) < 1e-6 && Math.abs(f.y - p.y) < 1e-6)).toBe(true);
      }
      for (const name of ['kart-F_Mask.gts', 'kart-B_Mask.gbs']) {
        const g = parseGerber(files.get(name)!);
        expect(g.attributes).toContain('TF.FilePolarity,Negative');
        expect(g.flashes.length).toBe(pads.length); // via'lar kapalı
      }
      const silk = parseGerber(files.get('kart-F_Silkscreen.gto')!);
      expect(silk.draws).toBeGreaterThan(design.footprints.length * 4);
      const edge = parseGerber(files.get('kart-Edge_Cuts.gm1')!);
      expect(edge.attributes).toContain('TF.FileFunction,Profile,NP');
      expect(edge.draws).toBe(4);

      // Delikler: kaplamalı = pedler + via'lar, kaplamasız = 4 montaj deliği; koordinatlar Gerber'le aynı.
      const pth = parseDrill(files.get('kart-PTH.drl')!);
      expect(pth.length).toBe(copperPads.length + routing.vias.length);
      for (const p of copperPads) expect(pth.some((h) => Math.abs(h.x - p.x) < 1e-3 && Math.abs(h.y - p.y) < 1e-3 && h.drill === p.drill)).toBe(true);
      for (const v of routing.vias) expect(pth.some((h) => Math.abs(h.x - v.x) < 1e-3 && Math.abs(h.y - v.y) < 1e-3 && h.drill === RULES.viaDrill)).toBe(true);
      const npth = parseDrill(files.get('kart-NPTH.drl')!);
      expect(npth.length).toBe(4);
      // Serigrafideki adlar yazı tipinde: sadeleşmiş yazı boşluk dışında karakter kaybetmez.
      for (const f of design.footprints) {
        for (const text of [f.ref, ...f.pads.map((p) => p.label ?? '')]) {
          expect(foldText(text).replace(/ /g, '').length, text).toBe(text.replace(/\s/g, '').length);
        }
      }
    });
  }
});
