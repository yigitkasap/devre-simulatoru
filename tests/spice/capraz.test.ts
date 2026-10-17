// Fizik 6: ngspice ile çapraz doğrulama. Aynı devre hem bizim çözücümüzle hem ngspice ile çözülür
// (parametreler aynen aktarılır: tests/spice/netlist.ts) ve sonuçlar karşılaştırılır:
//   DC (.op) en fazla %0,1, geçici durum (.tran) en fazla %1, AC en fazla %1 fark.
// ngspice'ın kendi yakınsama toleransı karşılaştırmayı bozmasın diye sıkılaştırılır (RELTOL 1e-6;
// geçici durumda 1e-5 ve küçük en büyük adım). Çalıştırma: `npm run test:spice` (ya da `npm test`).
// `SPICE_RAPOR=dosya.txt` her karşılaştırmayı dosyaya yazar.

import { afterAll, describe, expect, it } from 'vitest';
import { CircuitSimulator, type Netlist } from '../../src/sim';
import { circuit } from '../helpers';
import { spiceNode, toSpice } from './netlist';
import { complexValues, realValues, spiceEngine } from './run';

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const spice = await spiceEngine();
const suite = spice.ok ? describe : describe.skip;
if (!spice.ok) {
  // Karşılaştırmalar atlanır (describe.skip); nedeni bu bilgi testinin çıktısında görünür.
  it(`ngspice karşılaştırması atlandı: ${spice.reason}`, () => {
    console.warn(`ngspice karşılaştırma testleri atlandı: ${spice.reason}`);
  });
}

const rows: string[] = [];
function record(group: string, what: string, ref: number, ours: number, diff: number, limit: number): void {
  rows.push(`${diff <= limit ? 'GEÇTİ' : 'KALDI'} | ${group} | ${what} | ngspice ${ref.toPrecision(7)} | bizim ${ours.toPrecision(7)} | fark %${(diff * 100).toFixed(4)} (sınır %${limit * 100})`);
}

const run = async (text: string) => {
  if (!spice.ok) throw new Error(spice.reason);
  return spice.run(text);
};

/** .op: bizim DC çözümümüz ile ngspice'ın düğüm gerilimleri; `keys` netlist pin/ağ adları. */
async function compareOp(group: string, netlist: Netlist, keys: readonly string[], extra: (v: (key: string) => { ours: number; ref: number }) => Array<{ what: string; ours: number; ref: number }> = () => []) {
  const ours = new CircuitSimulator(netlist);
  expect(ours.advance(0).ok).toBe(true);
  const sp = toSpice(netlist);
  const result = await run(['* ' + group, ...sp.lines, '.options RELTOL=1e-6 VNTOL=1e-9 ABSTOL=1e-15', '.op', '.end'].join('\n'));
  const v = (key: string) => {
    const node = spiceNode(sp.compiled, key);
    return { ours: ours.voltageAt(key)!, ref: node === '0' ? 0 : realValues(result, `v(${node})`)[0]! };
  };
  const checks = [...keys.map((key) => ({ what: `V(${key})`, ...v(key) })), ...extra(v)];
  for (const c of checks) {
    const diff = Math.abs(c.ours - c.ref) / Math.max(Math.abs(c.ref), 1e-9);
    record(group, c.what, c.ref, c.ours, diff, 1e-3);
    expect(diff, `${group}: ${c.what} (ngspice ${c.ref}, bizim ${c.ours})`).toBeLessThanOrEqual(1e-3);
  }
}

/**
 * .tran: `times` anlarında bir düğüm geriliminin (ya da iki düğüm farkının) karşılaştırması. Fark,
 * dalganın ölçeğine (en büyük |değer|) oranlanır; sıfırdan geçen dalgada (doğrultucu) noktasal
 * oran anlamsızdır.
 */
async function compareTran(group: string, netlist: Netlist, plus: string, minus: string | null, times: readonly number[], options: { tmax: number; uic: boolean }) {
  const ours = new CircuitSimulator(netlist);
  const oursValues = times.map((t) => {
    expect(ours.runUntil(t).ok).toBe(true);
    return ours.voltageAt(plus)! - (minus ? ours.voltageAt(minus)! : 0);
  });
  const sp = toSpice(netlist);
  const step = times[1]! - times[0]!;
  const stop = times[times.length - 1]!;
  const result = await run(
    ['* ' + group, ...sp.lines, '.options RELTOL=1e-5 VNTOL=1e-9 ABSTOL=1e-15 INTERP', `.tran ${step} ${stop} 0 ${options.tmax}${options.uic ? ' uic' : ''}`, '.end'].join('\n'),
  );
  const time = realValues(result, 'time');
  const node = (key: string) => spiceNode(sp.compiled, key);
  const values = (key: string | null) => (key === null || node(key) === '0' ? time.map(() => 0) : realValues(result, `v(${node(key)})`));
  const a = values(plus);
  const b = values(minus);
  /** ngspice'ın çıktısı tstep aralıklıdır (INTERP); t anındaki değer doğrusal ara değerle. */
  const at = (t: number) => {
    let k = time.findIndex((x) => x >= t - 1e-15);
    if (k <= 0) k = 1;
    const f = (t - time[k - 1]!) / (time[k]! - time[k - 1]!);
    return a[k - 1]! - b[k - 1]! + f * (a[k]! - b[k]! - (a[k - 1]! - b[k - 1]!));
  };
  const refs = times.map(at);
  const scale = Math.max(...refs.map(Math.abs));
  let worst = 0;
  let worstAt = 0;
  times.forEach((_, k) => {
    const diff = Math.abs(oursValues[k]! - refs[k]!) / scale;
    if (diff > worst) {
      worst = diff;
      worstAt = k;
    }
  });
  record(group, `en büyük fark (t = ${(times[worstAt]! * 1e3).toPrecision(4)} ms; ölçek ${scale.toPrecision(4)} V)`, refs[worstAt]!, oursValues[worstAt]!, worst, 1e-2);
  expect(worst, `${group}: t = ${times[worstAt]} s'de ngspice ${refs[worstAt]}, bizim ${oursValues[worstAt]}`).toBeLessThanOrEqual(1e-2);
  return { ours: oursValues, ref: refs };
}

const range = (from: number, to: number, step: number) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, k) => from + k * step);

suite('Fizik 6: ngspice ile DC karşılaştırması (.op, en fazla %0,1)', () => {
  it('Wheatstone köprüsü (dengesiz)', async () => {
    const n = circuit().battery('B', 'A', 'g', 10).ground('G', 'g')
      .resistor('R1', 'A', 'B', 1000).resistor('R2', 'B', 'g', 2000).resistor('R3', 'A', 'C', 3000).resistor('R4', 'C', 'g', 4000).resistor('R5', 'B', 'C', 5000).build();
    await compareOp('Wheatstone', n, ['B', 'C'], (v) => [{ what: 'I(R5)', ours: (v('B').ours - v('C').ours) / 5000, ref: (v('B').ref - v('C').ref) / 5000 }]);
  });

  it('Süperpozisyon (iki kaynak)', async () => {
    const n = circuit().battery('V1', 'a', 'g', 10).battery('V2', 'b', 'g', 5).ground('G', 'g')
      .resistor('R1', 'a', 'm', 1000).resistor('R2', 'b', 'm', 2000).resistor('R3', 'm', 'g', 3000).build();
    await compareOp('Süperpozisyon', n, ['m']);
  });

  it('Diyot: 1N4001 ve genel model, 5 V ve 1 kΩ', async () => {
    for (const model of ['1N4001', 'genel']) {
      const n = circuit().battery('B', 'a', 'g', 5).ground('G', 'g').resistor('R', 'a', 'd', 1000).add('diode', 'D', ['d', 'g'], { model }).build();
      await compareOp(`Diyot ${model}`, n, ['d'], (v) => [{ what: 'I', ours: (5 - v('d').ours) / 1000, ref: (5 - v('d').ref) / 1000 }]);
    }
  });

  it('LED: dört renk, 9 V ve 470 Ω', async () => {
    for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
      const n = circuit().battery('B', 'a', 'g', 9).ground('G', 'g').resistor('R', 'a', 'd', 470).led('L', 'd', 'g', color).build();
      await compareOp(`LED ${color}`, n, ['d'], (v) => [{ what: 'I', ours: (9 - v('d').ours) / 470, ref: (9 - v('d').ref) / 470 }]);
    }
  });

  it('Zener (5,1 V): 12 V ve 330 Ω', async () => {
    const n = circuit().battery('B', 'a', 'g', 12).ground('G', 'g').resistor('R', 'a', 'k', 330).add('zener', 'Z', ['g', 'k'], { zenerVoltage: 5.1 }).build();
    await compareOp('Zener', n, ['k']);
  });

  it('BJT ortak emetör (BC107, β = 200): aktif bölge ve doyum', async () => {
    const ce = (rb: number) =>
      circuit().battery('B', 'v', 'g', 9).ground('G', 'g').resistor('RB', 'v', 'b', rb).resistor('RC', 'v', 'c', 1000).add('npn', 'Q', ['c', 'b', 'g'], { model: 'BC107', beta: 200 }).build();
    await compareOp('BJT aktif (R_B = 430 kΩ)', ce(430e3), ['b', 'c'], (v) => [{ what: 'I_C', ours: (9 - v('c').ours) / 1000, ref: (9 - v('c').ref) / 1000 }]);
    await compareOp('BJT doyum (R_B = 10 kΩ)', ce(10e3), ['b', 'c']);
  });

  it('MOSFET (IRF510): doyum ve omik bölge', async () => {
    const cs = (vg: number) =>
      circuit().battery('BD', 'v', 'g', 12).battery('BG', 'gate', 'g', vg).ground('G', 'g').resistor('RD', 'v', 'd', 100).add('nmos', 'M', ['d', 'gate', 'g'], { model: 'IRF510' }).build();
    await compareOp('MOSFET doyum (V_GS = 4 V)', cs(4), ['d'], (v) => [{ what: 'I_D', ours: (12 - v('d').ours) / 100, ref: (12 - v('d').ref) / 100 }]);
    await compareOp('MOSFET omik (V_GS = 5 V)', cs(5), ['d']);
  });
});

suite('Fizik 6: ngspice ile geçici durum karşılaştırması (.tran, en fazla %1)', () => {
  it('RC dolma, τ = 0,1 s (10 V, 1 kΩ, 100 µF)', async () => {
    const n = circuit().battery('B', 'a', 'g', 10).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C', 'c', 'g', 100e-6).build();
    await compareTran('RC τ = 0,1 s', n, 'c', null, range(0.02, 0.5, 0.02), { tmax: 1e-4, uic: true });
  });

  it('RC dolma, τ = 10 µs (10 V, 1 kΩ, 10 nF)', async () => {
    const n = circuit().battery('B', 'a', 'g', 10).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C', 'c', 'g', 10e-9).build();
    await compareTran('RC τ = 10 µs', n, 'c', null, range(1e-6, 60e-6, 1e-6), { tmax: 1e-8, uic: true });
  });

  it('Yük paylaşımı (100 µF 10 V’ta, 10 Ω, 100 µF boş)', async () => {
    const n = circuit().ground('G', 'g').capacitor('C1', 'a', 'g', 100e-6, 10).resistor('R', 'a', 'b', 10).capacitor('C2', 'b', 'g', 100e-6, 0).build();
    await compareTran('Yük paylaşımı C1', n, 'a', null, range(0.1e-3, 5e-3, 0.1e-3), { tmax: 1e-6, uic: true });
    await compareTran('Yük paylaşımı C2', n, 'b', null, range(0.1e-3, 5e-3, 0.1e-3), { tmax: 1e-6, uic: true });
  });

  it('Yarım dalga doğrultucu (50 Hz, 10 V tepe, 1N4001, 1 kΩ)', async () => {
    const n = circuit().acsource('S', 'a', 'g', { waveform: 'sine', amplitude: 10, frequency: 50, offset: 0, internalResistance: 0 }).ground('G', 'g')
      .add('diode', 'D', ['a', 'k'], { model: '1N4001' }).resistor('R', 'k', 'g', 1000).build();
    const r = await compareTran('Yarım dalga', n, 'k', null, range(0.25e-3, 40e-3, 0.25e-3), { tmax: 1e-6, uic: false });
    // Tepe değer ve ortalama da (ikinci periyot).
    const second = (xs: number[]) => xs.slice(80);
    const peak = (xs: number[]) => Math.max(...xs);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    for (const [what, f] of [['tepe', peak], ['ortalama', mean]] as const) {
      const ref = f(second(r.ref));
      const ours = f(second(r.ours));
      const diff = Math.abs(ours - ref) / ref;
      record('Yarım dalga', what, ref, ours, diff, 1e-2);
      expect(diff).toBeLessThanOrEqual(1e-2);
    }
  });
});

suite('Fizik 6: ngspice ile AC karşılaştırması (.ac, en fazla %1)', () => {
  it('RC süzgeç (1 kΩ, 159,15 nF): kesim frekansında (1 kHz) genlik ve faz', async () => {
    const n = circuit().acsource('S', 'a', 'g', { waveform: 'sine', amplitude: 1, frequency: 1000, offset: 0, internalResistance: 0 }).ground('G', 'g')
      .resistor('R', 'a', 'o', 1000).capacitor('C', 'o', 'g', 159.15e-9).build();
    const sp = toSpice(n, { acMagnitude: true });
    const result = await run(['* RC süzgeç', ...sp.lines, '.ac lin 1 1000 1000', '.end'].join('\n'));
    const h = complexValues(result, `v(${spiceNode(sp.compiled, 'o')})`)[0]!;
    const refAmp = Math.hypot(h.real, h.img);
    const refPhase = (Math.atan2(h.img, h.real) * 180) / Math.PI;
    // Bizim: zaman uzayında, oturduktan sonra bir periyot boyunca kilitlemeli ölçüm.
    const s = new CircuitSimulator(n);
    s.runUntil(0.02);
    let si = 0;
    let co = 0;
    const N = 400;
    for (let k = 1; k <= N; k++) {
      const t = 0.02 + k / (1000 * N);
      s.runUntil(t);
      const w = 2 * Math.PI * 1000 * t;
      si += s.voltageAt('o')! * Math.sin(w);
      co += s.voltageAt('o')! * Math.cos(w);
    }
    const amp = (2 / N) * Math.hypot(si, co);
    const phase = (Math.atan2(co, si) * 180) / Math.PI;
    const dAmp = Math.abs(amp - refAmp) / refAmp;
    const dPhase = Math.abs(phase - refPhase) / Math.abs(refPhase);
    record('RC süzgeç (AC)', '|H|', refAmp, amp, dAmp, 1e-2);
    record('RC süzgeç (AC)', 'faz (°)', refPhase, phase, dPhase, 1e-2);
    expect(dAmp).toBeLessThanOrEqual(1e-2);
    expect(dPhase).toBeLessThanOrEqual(1e-2);
  });
});

afterAll(async () => {
  const file = process.env.SPICE_RAPOR;
  if (!file || rows.length === 0) return;
  const fsModule = 'node:fs';
  const { writeFileSync } = (await import(/* @vite-ignore */ fsModule)) as { writeFileSync: (path: string, data: string, encoding: string) => void };
  writeFileSync(file, rows.join(String.fromCharCode(10)), 'utf8');
});
