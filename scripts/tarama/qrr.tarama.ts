// Ters toparlanma yükü (1N4001, 1 kΩ, ±5 V): bizim motor ile ngspice'ın (eecircuit-engine)
// varsayılan toleranslarla verdiği sonuç, sıkı toleranslı ngspice'a (referans) göre. Hata
// denetiminin (LTE) kıyası: kare (kenar) ve sinüs (sıfır geçişi) sürüş.
//
// Çalıştırma: npx vitest run --config scripts/tarama/vitest.config.ts scripts/tarama/qrr.tarama.ts

import { it } from 'vitest';
import { CircuitSimulator } from '../../src/sim';
import { circuit } from '../../tests/helpers';
import { spiceNode, toSpice } from '../../tests/spice/netlist';
import { realValues, spiceEngine } from '../../tests/spice/run';

type Wave = 'square' | 'sine';

const build = (waveform: Wave, frequency: number) =>
  circuit().acsource('V', 'a', 'g', { waveform, amplitude: 5, frequency }).ground('G', 'g').add('diode', 'D', ['a', 'b'], { model: '1N4001' }).resistor('R', 'b', 'g', 1000).build();

/** (t, i) noktalarından negatif akımın yamuk tümlevi (C). */
function negativeCharge(points: ReadonlyArray<readonly [number, number]>): number {
  let q = 0;
  for (let k = 1; k < points.length; k++) {
    const [t0, i0] = points[k - 1]!;
    const [t1, i1] = points[k]!;
    q += ((Math.min(0, i0) + Math.min(0, i1)) / 2) * (t1 - t0);
  }
  return -q;
}

function ours(waveform: Wave, frequency: number) {
  const sim = new CircuitSimulator(build(waveform, frequency));
  const [from, to] = [10 / frequency, 11 / frequency];
  const pts: Array<[number, number]> = [];
  const r = sim.device('R')!;
  const orig = r.observe.bind(r);
  r.observe = (x: Float64Array, t: number) => {
    orig(x, t);
    if (t >= from && t <= to) pts.push([t, r.measure(x).current]);
  };
  const c0 = sim.counters.accepted;
  sim.runUntil(to);
  return { q: negativeCharge(pts), points: sim.counters.accepted - c0 };
}

async function spice(waveform: Wave, frequency: number, options: string) {
  const engine = await spiceEngine();
  if (!engine.ok) throw new Error(engine.reason);
  // Dışa aktarıcı yalnızca sinüsü bilir: kare için kaynak satırı PULSE ile yazılır (1 ns kenar).
  const sp = toSpice(build('sine', frequency));
  const half = 1 / frequency / 2;
  const lines =
    waveform === 'square'
      ? sp.lines.map((line) => line.replace(/DC \S+ SIN\([^)]*\)/, `DC -5 PULSE(-5 5 0 1e-9 1e-9 ${half - 1e-9} ${1 / frequency})`))
      : sp.lines;
  const [from, to] = [10 / frequency, 11 / frequency];
  const result = await engine.run(['* qrr', ...lines, options, `.tran ${1 / frequency / 100} ${to} 0`, '.end'].join('\n'));
  const time = realValues(result, 'time');
  const node = spiceNode(sp.compiled, 'b');
  const v = realValues(result, `v(${node})`);
  const pts: Array<[number, number]> = [];
  time.forEach((t, k) => {
    if (t >= from && t <= to) pts.push([t, v[k]! / 1000]);
  });
  return { q: negativeCharge(pts), points: pts.length };
}

it('ters toparlanma yükü: bizim motor ve ngspice varsayılanı, sıkı ngspice’a göre', async () => {
  for (const [w, f] of [['square', 10000], ['sine', 20000], ['sine', 5000]] as const) {
    const ref = await spice(w, f, '.options RELTOL=1e-6 VNTOL=1e-9 ABSTOL=1e-15 CHGTOL=1e-18 TRTOL=1');
    const def = await spice(w, f, '');
    const our = ours(w, f);
    const pct = (q: number) => `${((q / ref.q - 1) * 100).toFixed(1)}%`;
    console.log(
      `${w} ${f} Hz: referans ${(ref.q * 1e9).toFixed(3)} nC (${ref.points} nokta) | ngspice varsayılan ${(def.q * 1e9).toFixed(3)} nC ${pct(def.q)} (${def.points}) | bizim ${(our.q * 1e9).toFixed(3)} nC ${pct(our.q)} (${our.points})`,
    );
  }
});
