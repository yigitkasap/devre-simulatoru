// Fizik denetimi (Ek A, commit 3d9bc92): her temel yasa için analitik olarak hesaplanan değer ile
// çözücünün sonucu karşılaştırılır. Her kontrol bir testtir. Denetimde kalan kontroller `it.fails`
// ile işaretlidir; yanlarında hangi aşamada düzeldikleri yazar (düzelince normal teste çevrilir).
// `FIZIK_RAPOR=dosya.txt npx vitest run tests/fizik-denetimi.test.ts` bütün değerleri dosyaya yazar
// (önce/sonra karşılaştırması için).

import { afterAll, describe, expect, it } from 'vitest';
import { CircuitSimulator, type Netlist } from '../src/sim';
import { circuit } from './helpers';

type Row = { group: string; name: string; expected: string; got: string; ok: boolean; note?: string };
const rows: Row[] = [];
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-15);
const fmt = (v: number) =>
  Number.isFinite(v) ? (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : v.toFixed(4)) : String(v);

/** Bağıl hata `tol` içinde mi (beklenen ≈ 0 ise mutlak). */
function check(group: string, name: string, got: number, expected: number, tol: number, unit = '', note?: string) {
  const ok = Number.isFinite(got) && (Math.abs(expected) < 1e-12 ? Math.abs(got) < tol : rel(got, expected) <= tol);
  rows.push({ group, name, expected: `${fmt(expected)} ${unit}`, got: `${fmt(got)} ${unit}`, ok, ...(note ? { note } : {}) });
  expect(ok, `${name}: beklenen ${fmt(expected)} ${unit}, bulunan ${fmt(got)} ${unit}`).toBe(true);
}
function flag(group: string, name: string, ok: boolean, expected: string, got: string, note?: string) {
  rows.push({ group, name, expected, got, ok, ...(note ? { note } : {}) });
  expect(ok, `${name}: beklenen ${expected}, bulunan ${got}`).toBe(true);
}

const sim = (n: Netlist) => new CircuitSimulator(n);
const I = (s: CircuitSimulator, id: string) => s.measure(id)!.current;
const V = (s: CircuitSimulator, id: string) => s.measure(id)!.voltage;
const P = (s: CircuitSimulator, id: string) => s.measure(id)!.power;
const codes = (s: CircuitSimulator): string[] => s.diagnostics.map((d) => d.code);

/** KCL: her ağda, o ağa bağlı bütün pinlere giren akımların toplamı 0 olmalı. */
function kclResidual(s: CircuitSimulator, n: Netlist): { worst: number; scale: number } {
  const byNet = new Map<string, number>();
  let scale = 0;
  for (const el of n.elements) {
    const pc = s.pinCurrents(el.id);
    if (!pc) continue;
    el.pins.forEach((pin, k) => {
      const net = s.netOf(pin) ?? pin;
      byNet.set(net, (byNet.get(net) ?? 0) + (pc[k] ?? 0));
      scale = Math.max(scale, Math.abs(pc[k] ?? 0));
    });
  }
  let worst = 0;
  for (const v of byNet.values()) worst = Math.max(worst, Math.abs(v));
  return { worst, scale };
}

/** Bir kez kurulup birkaç testte kullanılan sonuç. */
function once<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

describe('A. Doğru akım temel yasaları', () => {
  const g = 'A. DC';
  it('Ohm yasası I = V/R (9 V, 1 kΩ)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').resistor('R', 'a', 'g', 1000).build());
    s.advance(0);
    check(g, 'Ohm yasası I = V/R (9 V, 1 kΩ)', I(s, 'R') * 1e3, 9, 1e-6, 'mA');
  });
  it('Pil iç direnci: uç gerilimi ε − I·r', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 1).ground('G', 'g').resistor('R', 'a', 'g', 10).build());
    s.advance(0);
    check(g, 'Pil iç direnci: uç gerilimi ε − I·r (9 V, r = 1 Ω, R = 10 Ω)', V(s, 'R'), (9 * 10) / 11, 1e-6, 'V');
  });
  const series = once(() => {
    const s = sim(circuit().battery('B', 'a', 'g', 12, 0).ground('G', 'g').resistor('R1', 'a', 'b', 1000).resistor('R2', 'b', 'c', 2000).resistor('R3', 'c', 'g', 3000).build());
    s.advance(0);
    return s;
  });
  it('Seri: ortak akım 12 V / 6 kΩ', () => check(g, 'Seri: ortak akım 12 V / 6 kΩ', I(series(), 'R2') * 1e3, 2, 1e-6, 'mA'));
  it('Seri: KVL ΣV = ε', () => {
    const s = series();
    check(g, 'Seri: KVL ΣV = ε', V(s, 'R1') + V(s, 'R2') + V(s, 'R3'), 12, 1e-9, 'V');
  });
  it('Paralel: toplam akım 12 + 6 + 4 mA', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 12, 0).ground('G', 'g').resistor('R1', 'a', 'g', 1000).resistor('R2', 'a', 'g', 2000).resistor('R3', 'a', 'g', 3000).build());
    s.advance(0);
    check(g, 'Paralel: toplam akım 12+6+4 mA', -I(s, 'B') * 1e3, 22, 1e-6, 'mA');
  });
  const bridgeNet = circuit().battery('B', 'A', 'g', 10, 0).ground('G', 'g')
    .resistor('R1', 'A', 'B', 1000).resistor('R2', 'B', 'g', 2000).resistor('R3', 'A', 'C', 3000).resistor('R4', 'C', 'g', 4000).resistor('R5', 'B', 'C', 5000).build();
  const bridge = once(() => {
    const s = sim(bridgeNet);
    s.advance(0);
    return s;
  });
  it('Köprü: V(B)', () => check(g, 'Köprü: V(B)', bridge().voltageAt('B')!, 6.580645161290323, 1e-6, 'V'));
  it('Köprü: V(C)', () => check(g, 'Köprü: V(C)', bridge().voltageAt('C')!, 5.935483870967743, 1e-6, 'V'));
  it('Köprü: köprü akımı I(R5)', () => check(g, 'Köprü: köprü akımı I(R5)', I(bridge(), 'R5') * 1e3, 0.12903225806451601, 1e-5, 'mA'));
  it('KCL: her düğümde ΣI = 0 (köprü)', () => {
    const k = kclResidual(bridge(), bridgeNet);
    check(g, 'KCL: her düğümde ΣI = 0 (köprü)', k.worst / k.scale, 0, 1e-6, '(oran)', 'artık gmin kaçağından');
  });
  it('KVL: A→B→C→A döngüsü ΣV = 0', () => {
    const s = bridge();
    check(g, 'KVL: A→B→C→A döngüsü ΣV = 0', V(s, 'R1') + V(s, 'R5') - V(s, 'R3'), 0, 1e-9, 'V');
  });
  it('Enerji korunumu (Tellegen): ΣP = 0', () => {
    const s = bridge();
    const sumP = ['B', 'R1', 'R2', 'R3', 'R4', 'R5'].reduce((a, id) => a + P(s, id), 0);
    check(g, 'Enerji korunumu (Tellegen): ΣP = 0', sumP / Math.abs(P(s, 'B')), 0, 1e-6, '(oran)', 'artık gmin kaçağından');
  });
  const superposition = (v1: number, v2: number) => {
    const s = sim(circuit().battery('B1', 'A', 'g', v1, 0).battery('B2', 'C', 'g', v2, 0).ground('G', 'g')
      .resistor('R1', 'A', 'B', 1000).resistor('R2', 'B', 'g', 2000).resistor('R3', 'B', 'C', 3000).build());
    s.advance(0);
    return s.voltageAt('B')!;
  };
  it('Süperpozisyon: V(B) = V(B)₁ + V(B)₂', () =>
    check(g, 'Süperpozisyon: V(B) = V(B)₁ + V(B)₂', superposition(10, 5), superposition(10, 0) + superposition(0, 5), 1e-9, 'V'));
  it('Süperpozisyon: analitik V(B)', () => check(g, 'Süperpozisyon: analitik V(B)', superposition(10, 5), 70 / 11, 1e-6, 'V'));
  const thevenin = (load: (b: ReturnType<typeof circuit>) => ReturnType<typeof circuit>) => {
    const s = sim(load(circuit().battery('B', 'a', 'g', 12, 0).ground('G', 'g').resistor('R1', 'a', 'x', 1000).resistor('R2', 'x', 'g', 2000)).build());
    s.advance(0);
    return s;
  };
  const voc = () => thevenin((b) => b.voltmeter('VM', 'x', 'g', 'ideal')).status('VM').reading!;
  const isc = () => thevenin((b) => b.ammeter('AM', 'x', 'g', 'ideal')).status('AM').reading!;
  const loadPower = (r: number) => P(thevenin((b) => b.resistor('RL', 'x', 'g', r)), 'RL');
  it('Thévenin: açık devre gerilimi Vth', () => check(g, 'Thévenin: açık devre gerilimi Vth', voc(), 8, 1e-6, 'V'));
  it('Thévenin: kısa devre akımı (Norton) 12 mA', () => check(g, 'Thévenin: kısa devre akımı (Norton) 12 mA', isc() * 1e3, 12, 1e-6, 'mA'));
  it('Thévenin: yük akımı Vth/(Rth + RL)', () => {
    const rth = voc() / isc();
    const il = I(thevenin((b) => b.resistor('RL', 'x', 'g', 1000)), 'RL');
    check(g, 'Thévenin: yük akımı Vth/(Rth+RL)', il * 1e3, (voc() / (rth + 1000)) * 1e3, 1e-6, 'mA');
  });
  it('En büyük güç aktarımı: RL = Rth iken P en büyük', () => {
    const rth = voc() / isc();
    const pm = loadPower(rth);
    flag(g, 'En büyük güç aktarımı: RL = Rth iken P en büyük', pm > loadPower(rth * 0.8) && pm > loadPower(rth * 1.25), 'P(Rth) > P(0,8Rth), P(1,25Rth)', `${fmt(pm * 1e3)} mW`);
  });
  it('En büyük güç: Pmax = Vth²/4Rth', () => {
    const rth = voc() / isc();
    check(g, 'En büyük güç: Pmax = Vth²/4Rth', loadPower(rth) * 1e3, ((voc() * voc()) / (4 * rth)) * 1e3, 1e-6, 'mW');
  });
  it('Voltmetre yüklemesi (Rv = 1 MΩ)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 12, 0).ground('G', 'g').resistor('R1', 'a', 'x', 200e3).resistor('R2', 'x', 'g', 1e6).voltmeter('VM', 'x', 'g', 1e6).build());
    s.advance(0);
    check(g, 'Voltmetre yüklemesi (Rv = 1 MΩ, 200k/1M bölücü)', s.status('VM').reading!, (12 * 0.5e6) / 0.7e6, 1e-6, 'V');
  });
  it('Ampermetre yüklemesi (Ra = 1 Ω)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 12, 0).ground('G', 'g').resistor('R1', 'a', 'x', 100).ammeter('AM', 'x', 'g', 1).build());
    s.advance(0);
    check(g, 'Ampermetre yüklemesi (Ra = 1 Ω, 100 Ω)', s.status('AM').reading! * 1e3, (12 / 101) * 1e3, 1e-6, 'mA');
  });
  it('Akım bölücü: I1 = I·R2/(R1 + R2)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 10, 0).ground('G', 'g').resistor('R0', 'a', 'x', 1000).resistor('R1', 'x', 'g', 1000).resistor('R2', 'x', 'g', 3000).build());
    s.advance(0);
    check(g, 'Akım bölücü: I1 = I·R2/(R1+R2)', I(s, 'R1') * 1e3, (10 / 1750) * 0.75 * 1e3, 1e-6, 'mA');
  });
});

describe('B. Açık devre, anahtar, kısa devre, toprak', () => {
  const g = 'B. Açık/kapalı devre ve toprak';
  const open = once(() => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').switch('S', 'a', 'b', false).resistor('R', 'b', 'g', 1000).build());
    s.advance(0);
    return s;
  });
  it('Açık anahtar: akım 0', () => check(g, 'Açık anahtar: akım 0', I(open(), 'R'), 0, 1e-9, 'A'));
  it('Açık anahtar: ε anahtarın uçlarında görünür (KVL)', () => check(g, 'Açık anahtar: ε anahtarın uçlarında görünür (KVL)', V(open(), 'S'), 9, 1e-6, 'V'));
  it('Kapalı anahtar: akım 9 mA', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').switch('S', 'a', 'b', true).resistor('R', 'b', 'g', 1000).build());
    s.advance(0);
    check(g, 'Kapalı anahtar: akım 9 mA', I(s, 'R') * 1e3, 9, 1e-5, 'mA');
  });
  it('Kablosu eksik devre: akım 0', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').resistor('R1', 'a', 'b', 470).led('L', 'b', 'c').build());
    const r = s.advance(0);
    check(g, 'Kablosu eksik devre: akım 0', I(s, 'R1'), 0, 1e-9, 'A', r.ok ? undefined : r.error?.code);
  });
  // Aşama 2'de düzelir: gmin yalnızca gerçekten gerekli düğümlere.
  it.fails('Açık devrede ampermetre tam 0 göstermeli (Aşama 2)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').ammeter('A', 'a', 'x').resistor('R', 'x', 'y', 1000).led('L', 'y', 'z').build());
    s.advance(0);
    const r = s.status('A').reading!;
    flag(g, 'Açık devrede ampermetre tam 0 göstermeli', Math.abs(r) < 1e-15, '0 A', `${fmt(r)} A`);
  });
  it('Kısa devre: I = ε/r (r = 1 Ω)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 1).ground('G', 'g').wire('a', 'g').build());
    s.advance(0);
    check(g, 'Kısa devre: I = ε/r (r = 1 Ω)', -I(s, 'B'), 9, 1e-6, 'A');
  });
  // Aşama 1'de düzeldi: toprak isteğe bağlı.
  it('Topraksız kapalı devre çalışmalı: pil + direnç + LED', () => {
    const s = sim(circuit().battery('B', 'a', 'n', 9, 0).resistor('R', 'a', 'b', 470).led('L', 'b', 'n').build());
    const r = s.advance(0);
    flag(g, 'Topraksız kapalı devre çalışmalı (pil + direnç + LED)', r.ok && I(s, 'R') > 1e-3, 'çalışır, ≈ 15 mA', r.ok ? `${fmt(I(s, 'R') * 1e3)} mA` : `çalışmıyor: ${r.error?.code}`);
  });
  // Aşama 3'te düzelir: toprak hattı üzerinden dönen akım uyarısı.
  it.fails('Devre yalnızca iki toprak sembolü üzerinden kapanıyor: kullanıcı uyarılmalı (Aşama 3)', () => {
    const s = sim(circuit().battery('B', 'a', 'x', 9, 0).ground('G1', 'x').resistor('R', 'a', 'b', 470).led('L', 'b', 'y').ground('G2', 'y').build());
    s.advance(0);
    const diag = codes(s).join(',') || 'yok';
    flag(g, 'Devre yalnızca iki toprak sembolü üzerinden kapanıyor: kullanıcı uyarılmalı', codes(s).includes('ground-return'), 'uyarı', `akım ${fmt(I(s, 'R') * 1e3)} mA, uyarı: ${diag}`);
  });
  it('Yüzer ada: topraksız ikinci devrede akım 5 mA', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').resistor('R', 'a', 'g', 1000).battery('B2', 'p', 'q', 5, 0).resistor('R2', 'p', 'q', 1000).build());
    const r = s.advance(0);
    check(g, 'Yüzer ada: topraksız ikinci devrede akım 5 mA', r.ok ? I(s, 'R2') * 1e3 : NaN, 5, 1e-6, 'mA', s.topologyDiagnostics.map((d) => d.code).join(','));
  });
});

describe('C. Kondansatör', () => {
  const g = 'C. Kondansatör';
  const charging = once(() => {
    const s = sim(circuit().battery('B', 'a', 'g', 10, 0).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C', 'c', 'g', 100e-6).build());
    s.runUntil(0.1);
    const atTau = V(s, 'C');
    s.runUntil(1.0);
    return { atTau, steadyCurrent: I(s, 'R') };
  });
  it('RC dolma: v(τ) = ε(1 − 1/e)', () => check(g, 'RC dolma: v(τ) = ε(1 − 1/e)', charging().atTau, 10 * (1 - Math.exp(-1)), 2e-3, 'V'));
  it('Kararlı durumda kondansatör DC akımı geçirmez', () => check(g, 'Kararlı durumda kondansatör DC akımı geçirmez', charging().steadyCurrent, 0, 1e-6, 'A'));
  it('RC boşalma: v(τ) = V₀/e', () => {
    const s = sim(circuit().ground('G', 'g').resistor('R', 'c', 'g', 1000).capacitor('C', 'c', 'g', 100e-6, 10).build());
    s.runUntil(0.1);
    check(g, 'RC boşalma: v(τ) = V₀/e', V(s, 'C'), 10 * Math.exp(-1), 2e-3, 'V');
  });
  const energy = once(() => {
    const s = sim(circuit().battery('B', 'a', 'g', 10, 0).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C', 'c', 'g', 100e-6).build());
    const h = s.timeStep;
    let eR = 0;
    let eB = 0;
    for (let k = 1; k <= Math.round(1.0 / h); k++) {
      s.runUntil(k * h);
      eR += P(s, 'R') * h;
      eB += -P(s, 'B') * h;
    }
    return { eR, eB, stored: 0.5 * 100e-6 * V(s, 'C') ** 2 };
  });
  it('Enerji: dirençte harcanan = ½CV² = 5 mJ', () => check(g, 'Enerji: dirençte harcanan = ½CV² = 5 mJ', energy().eR * 1e3, 5, 5e-3, 'mJ'));
  it('Enerji: kaynaktan çekilen = CV² = 10 mJ', () => check(g, 'Enerji: kaynaktan çekilen = CV² = 10 mJ', energy().eB * 1e3, 10, 5e-3, 'mJ'));
  it('Enerji: kondansatörde depolanan ½CV²', () => check(g, 'Enerji: kondansatörde depolanan ½CV²', energy().stored * 1e3, 5, 1e-3, 'mJ'));
  const seriesC = once(() => {
    const s = sim(circuit().battery('B', 'a', 'g', 10, 0).ground('G', 'g').resistor('R', 'a', 'b', 100).capacitor('C1', 'b', 'm', 10e-6).capacitor('C2', 'm', 'g', 40e-6).build());
    s.runUntil(0.05);
    return s;
  });
  it('Seri C: V1 = ε·C2/(C1 + C2)', () => check(g, 'Seri C: V1 = ε·C2/(C1+C2)', V(seriesC(), 'C1'), 8, 2e-3, 'V'));
  it('Seri C: Q1 = Q2', () => check(g, 'Seri C: Q1 = Q2', 10e-6 * V(seriesC(), 'C1') * 1e6, 40e-6 * V(seriesC(), 'C2') * 1e6, 2e-3, 'µC'));
  it('Paralel C: Ceş = C1 + C2 (τ = 0,1 s)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 10, 0).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C1', 'c', 'g', 60e-6).capacitor('C2', 'c', 'g', 40e-6).build());
    s.runUntil(0.1);
    check(g, 'Paralel C: Ceş = C1 + C2 (τ = 0,1 s)', V(s, 'C1'), 10 * (1 - Math.exp(-1)), 2e-3, 'V');
  });
  const sharing = once(() => {
    const s = sim(circuit().ground('G', 'g').capacitor('C1', 'a', 'g', 100e-6, 10).resistor('R', 'a', 'b', 10).capacitor('C2', 'b', 'g', 100e-6, 0).build());
    s.runUntil(0.02);
    return s;
  });
  it('Yük korunumu: Q1 + Q2 = 1 mC', () => {
    const s = sharing();
    check(g, 'Yük korunumu: Q1 + Q2 = 1 mC', (100e-6 * V(s, 'C1') + 100e-6 * V(s, 'C2')) * 1e3, 1, 1e-6, 'mC');
  });
  it('Yük paylaşımı: son gerilim 5 V', () => check(g, 'Yük paylaşımı: son gerilim 5 V', V(sharing(), 'C2'), 5, 1e-3, 'V'));
  it('Yük paylaşımı: enerjinin yarısı kaybolur', () => {
    const s = sharing();
    const e = 0.5 * 100e-6 * (V(s, 'C1') ** 2 + V(s, 'C2') ** 2);
    check(g, 'Yük paylaşımı: enerjinin yarısı kaybolur (2,5 mJ kalır)', e * 1e3, 2.5, 1e-3, 'mJ');
  });
  const smallTau = once(() => {
    const s = sim(circuit().battery('B', 'a', 'g', 10, 0).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C', 'c', 'g', 10e-9).build());
    s.runUntil(10e-6);
    const atTau = V(s, 'C');
    const step = s.timeStep;
    s.runUntil(50e-6);
    return { atTau, at5Tau: V(s, 'C'), step };
  });
  // Aşama 4'te düzelir: LTE denetimli uyarlanır adım.
  it.fails('Küçük τ (10 µs): v(τ) = 6,32 V (Aşama 4)', () =>
    check(g, 'Küçük τ (10 µs): v(τ) = 6,32 V', smallTau().atTau, 10 * (1 - Math.exp(-1)), 2e-2, 'V', `zaman adımı ${fmt(smallTau().step * 1e6)} µs`));
  it.fails('Küçük τ (10 µs): v(5τ) = 9,93 V (Aşama 4)', () =>
    check(g, 'Küçük τ (10 µs): v(5τ) = 9,93 V', smallTau().at5Tau, 10 * (1 - Math.exp(-5)), 2e-2, 'V'));
  it('İlk an: akım ε/R (kondansatör kısa devre gibi)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 10, 0).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C', 'c', 'g', 100e-6).build());
    s.runUntil(s.timeStep);
    check(g, 'İlk an: akım ε/R (kondansatör kısa devre gibi)', I(s, 'R') * 1e3, 10, 2e-3, 'mA');
  });
});

describe('D. Alternatif akım', () => {
  const g = 'D. AC';
  const ac = (f: number, amp: number) => ({ waveform: 'sine', amplitude: amp, frequency: f, offset: 0, internalResistance: 0 });
  const meters = once(() => {
    const s = sim(circuit().acsource('S', 'a', 'g', ac(50, 5)).ground('G', 'g').resistor('R', 'a', 'g', 1000)
      .voltmeter('VAC', 'a', 'g', 'ideal', 'ac').voltmeter('VDC', 'a', 'g', 'ideal', 'dc').ammeter('AM', 'a', 'x', 'ideal', 'ac').resistor('R2', 'x', 'g', 1000).build());
    s.advance(0.2);
    s.advance(0.02);
    return s;
  });
  it('Sinüs etkin değeri Vrms = Vp/√2', () => check(g, 'Sinüs etkin değeri Vrms = Vp/√2', meters().status('VAC').reading!, 5 / Math.SQRT2, 5e-3, 'V'));
  it('Sinüsün ortalaması (DC kipi) 0', () => check(g, 'Sinüsün ortalaması (DC kipi) 0', meters().status('VDC').reading!, 0, 2e-2, 'V'));
  it('Etkin akım Irms = Vrms/R', () => check(g, 'Etkin akım Irms = Vrms/R', meters().status('AM').reading! * 1e3, 5 / Math.SQRT2, 5e-3, 'mA'));
  it('Ortalama güç P = Vrms²/R = 12,5 mW', () => {
    const s = sim(circuit().acsource('S', 'a', 'g', ac(50, 5)).ground('G', 'g').resistor('R', 'a', 'g', 1000).build());
    s.runUntil(0.1);
    const h = s.timeStep;
    let e = 0;
    let t = 0;
    for (let k = 1; k <= Math.round(0.02 / h); k++) {
      s.runUntil(0.1 + k * h);
      e += P(s, 'R') * h;
      t += h;
    }
    check(g, 'Ortalama güç P = Vrms²/R = 12,5 mW', (e / t) * 1e3, 12.5, 1e-2, 'mW');
  });
  const capacitive = once(() => {
    const C = 10e-6;
    const f = 50;
    const s = sim(circuit().acsource('S', 'a', 'g', ac(f, 5)).ground('G', 'g').ammeter('AM', 'a', 'b', 'ideal', 'ac').capacitor('C', 'b', 'g', C).build());
    s.advance(0.2);
    s.advance(0.02);
    const irms = s.status('AM').reading!;
    // Faz: kilitlemeli (lock-in) karşılaştırma, bir periyot boyunca.
    const h = s.timeStep;
    let si = 0;
    let ci = 0;
    let sv = 0;
    let cv = 0;
    const start = 0.4;
    s.runUntil(start);
    const n = Math.round(1 / f / h);
    for (let k = 1; k <= n; k++) {
      const t = start + k * h;
      s.runUntil(t);
      const w = 2 * Math.PI * f * t;
      const i = I(s, 'C');
      const v = V(s, 'C');
      si += i * Math.sin(w);
      ci += i * Math.cos(w);
      sv += v * Math.sin(w);
      cv += v * Math.cos(w);
    }
    let phase = ((Math.atan2(ci, si) - Math.atan2(cv, sv)) * 180) / Math.PI;
    if (phase < -180) phase += 360;
    return { irms, phase, xc: 1 / (2 * Math.PI * f * C), h };
  });
  it('Kapasitif reaktans: Irms = Vrms/Xc', () =>
    check(g, 'Kapasitif reaktans: Irms = Vrms/Xc (Xc = 318 Ω)', capacitive().irms * 1e3, (5 / Math.SQRT2 / capacitive().xc) * 1e3, 1e-2, 'mA'));
  it('Faz: kondansatörde akım gerilimden 90° önde', () =>
    check(g, 'Faz: kondansatörde akım gerilimden 90° önde', capacitive().phase, 90, 2e-2, '°', `adım ${fmt(capacitive().h * 1e3)} ms`));
  // Aşama 4'te düzelir: ikinci dereceden integrasyon.
  it.fails('RC süzgeç: fc noktasında |H| = 1/√2 (Aşama 4)', () => {
    const s = sim(circuit().acsource('S', 'a', 'g', ac(1000, 1)).ground('G', 'g').resistor('R', 'a', 'o', 1000).capacitor('C', 'o', 'g', 1.5915494e-7).voltmeter('VO', 'o', 'g', 'ideal', 'ac').build());
    s.advance(0.02);
    s.advance(0.001);
    check(g, 'RC süzgeç: fc = 1/(2πRC) noktasında |H| = 1/√2', s.status('VO').reading! / (1 / Math.SQRT2), 1 / Math.SQRT2, 1e-2, '');
  });
  it('Yarım dalga doğrultucu: ortalama ≈ (Vp − Vd)/π', () => {
    const s = sim(circuit().acsource('S', 'a', 'g', ac(50, 10)).ground('G', 'g').add('diode', 'D', ['a', 'k'], { model: '1N4001' }).resistor('R', 'k', 'g', 1000)
      .voltmeter('VD', 'k', 'g', 'ideal', 'dc').build());
    s.advance(0.1);
    s.advance(0.02);
    flag(g, 'Yarım dalga doğrultucu: ortalama ≈ (Vp − Vd)/π', Math.abs(s.status('VD').reading! - 2.95) < 0.12, '≈ 2,9-3,0 V', `${fmt(s.status('VD').reading!)} V`);
  });
});

describe('E. Yarı iletkenler', () => {
  const g = 'E. Yarı iletken';
  it('Diyot ileri yönde: Vd ≈ 0,6 V (10 mA, 1N4001)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').resistor('R', 'a', 'b', 820).add('diode', 'D', ['b', 'g'], { model: '1N4001' }).build());
    s.advance(0);
    flag(g, 'Diyot ileri yönde: Vd ≈ 0,6 V (10 mA, 1N4001)', Math.abs(V(s, 'D') - 0.6) < 0.03, '≈ 0,60 V', `${fmt(V(s, 'D'))} V, ${fmt(I(s, 'D') * 1e3)} mA`);
  });
  const reverseDiode = once(() => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').resistor('R', 'a', 'b', 820).add('diode', 'D', ['g', 'b'], { model: '1N4001' }).build());
    s.advance(0);
    return s;
  });
  it('Ters kutuplu diyot: akım ≈ 0', () => check(g, 'Ters kutuplu diyot: akım ≈ 0', I(reverseDiode(), 'R'), 0, 1e-6, 'A'));
  it('Ters kutuplu diyot: bütün gerilim diyotta (KVL)', () => check(g, 'Ters kutuplu diyot: bütün gerilim diyotta (KVL)', -V(reverseDiode(), 'D'), 9, 1e-4, 'V'));
  for (const [color, vf] of [['red', 1.85], ['yellow', 2.1], ['green', 2.2], ['blue', 3.3]] as const) {
    it(`LED (${color}): 20 mA'de ileri gerilim`, () => {
      const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').resistor('R', 'a', 'b', (9 - vf) / 0.02).led('L', 'b', 'g', color).build());
      s.advance(0);
      check(g, `LED (${color}): 20 mA'de ileri gerilim`, V(s, 'L'), vf, 1e-2, 'V');
    });
  }
  // Aşama 5'te düzelir: LED'in ters gerilim sınırı.
  it.fails('Ters kutuplu LED: 9 V ters gerilimde uyarı (Aşama 5)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').resistor('R', 'a', 'b', 470).led('L', 'g', 'b').build());
    s.advance(0);
    flag(g, 'Ters kutuplu LED: 9 V ters gerilim (gerçek LED en fazla ≈ 5 V dayanır)', codes(s).includes('reverse-voltage'), 'uyarı', `uyarı: ${codes(s).join(',') || 'yok'}, LED gerilimi ${fmt(V(s, 'L'))} V`);
  });
  // Aşama 5'te düzelir: direncin güç sınırı.
  it.fails('Joule ısınması: 1/4 W dirence 0,81 W düşerse uyarı (Aşama 5)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').resistor('R', 'a', 'g', 100).build());
    s.advance(0);
    flag(g, 'Joule ısınması: 1/4 W dirence 0,81 W düşerse uyarı', codes(s).includes('resistor-overpower'), 'uyarı', `P = ${fmt(P(s, 'R'))} W, uyarı: ${codes(s).join(',') || 'yok'}`);
  });
  // Aşama 5'te düzelir: kutuplu (elektrolitik) kondansatörün ters gerilim sınırı.
  it.fails('Kutuplu (+/−) kondansatöre ters gerilim uyarısı (Aşama 5)', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 9, 0).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C', 'g', 'c', 100e-6).build());
    s.runUntil(1);
    flag(g, 'Kutuplu (+/−) kondansatöre ters gerilim uyarısı', codes(s).includes('capacitor-reverse'), 'uyarı', `kondansatör gerilimi ${fmt(V(s, 'C'))} V, uyarı: ${codes(s).join(',') || 'yok'}`);
  });
  it('Zener regülasyonu ≈ 5,1 V', () => {
    const s = sim(circuit().battery('B', 'a', 'g', 12, 0).ground('G', 'g').resistor('R', 'a', 'k', 330).add('zener', 'Z', ['g', 'k'], { zenerVoltage: 5.1 }).build());
    s.advance(0);
    flag(g, 'Zener regülasyonu ≈ 5,1 V', Math.abs(-V(s, 'Z') - 5.1) < 0.1, '≈ 5,1 V', `${fmt(-V(s, 'Z'))} V, ${fmt(I(s, 'R') * 1e3)} mA`);
  });
  const bjtNet = circuit().battery('B', 'v', 'g', 9, 0).ground('G', 'g').resistor('RB', 'v', 'b', 430e3).resistor('RC', 'v', 'c', 1000).add('npn', 'Q', ['c', 'b', 'g'], { model: 'BC107' }).build();
  const bjt = once(() => {
    const s = sim(bjtNet);
    s.advance(0);
    return s;
  });
  it('BJT: IE = IB + IC (KCL)', () => {
    const pc = bjt().pinCurrents('Q')!;
    check(g, 'BJT: IE = IB + IC (KCL)', Math.abs(pc[0]! + pc[1]! + pc[2]!) / Math.abs(pc[2]!), 0, 1e-9, '(oran)');
  });
  it('BJT devresi: her düğümde KCL', () => {
    const k = kclResidual(bjt(), bjtNet);
    check(g, 'BJT devresi: her düğümde KCL', k.worst / k.scale, 0, 1e-6, '(oran)', 'artık gmin kaçağından');
  });
  it('BJT aktif bölge: IC/IB = β (≈ 100-300)', () => {
    const pc = bjt().pinCurrents('Q')!;
    flag(g, 'BJT aktif bölge: IC/IB = β (≈ 100-300)', pc[0]! / pc[1]! > 80 && pc[0]! / pc[1]! < 400, 'β ≈ 100-300', `β = ${fmt(pc[0]! / pc[1]!)}, bölge ${bjt().status('Q').region}`);
  });
  it('BJT doyum: VCE ≈ 0,1-0,3 V', () => {
    const s = sim(circuit().battery('B', 'v', 'g', 9, 0).ground('G', 'g').resistor('RB', 'v', 'b', 10e3).resistor('RC', 'v', 'c', 1000).add('npn', 'Q', ['c', 'b', 'g'], { model: 'BC107' }).build());
    s.advance(0);
    flag(g, 'BJT doyum: VCE ≈ 0,1-0,3 V', s.voltageAt('c')! < 0.35, '< 0,35 V', `${fmt(s.voltageAt('c')!)} V, bölge ${s.status('Q').region}`);
  });
  it('MOSFET: kapı akımı 0 (yalıtılmış kapı)', () => {
    const s = sim(circuit().battery('B', 'v', 'g', 12, 0).ground('G', 'g').resistor('R1', 'v', 'gt', 100e3).resistor('R2', 'gt', 'g', 100e3).resistor('RD', 'v', 'd', 100).add('nmos', 'M', ['d', 'gt', 'g'], { model: 'IRF510' }).build());
    s.advance(0);
    check(g, 'MOSFET: kapı akımı 0 (yalıtılmış kapı)', s.pinCurrents('M')![1]!, 0, 1e-9, 'A');
  });
});

describe('F. Laboratuvar cihazları ve toprak döngüsü', () => {
  const g = 'F. Cihazlar';
  it('Güç kaynağı akım sınırı (CC): I = 0,5 A', () => {
    const s = sim(circuit().add('dcsupply', 'PS', ['p', 'm', 'p2', 'm2'], { voltage1: 5, currentLimit1: 0.5 }).ground('G', 'm').resistor('R', 'p', 'm', 1).build());
    s.advance(0);
    check(g, 'Güç kaynağı akım sınırı (CC): I = 0,5 A', I(s, 'R'), 0.5, 2e-2, 'A');
  });
  it('Toprak döngüsü: osiloskop COM yanlış noktaya bağlanınca R2 kısa devre olur', () => {
    const fg = { waveform: 'sine', frequency: 1000, amplitude: 2, offset: 0, earthed: true };
    const s1 = sim(circuit().add('funcgen', 'FG', ['o', 't', 'c'], fg).resistor('R1', 'o', 'm', 1000).resistor('R2', 'm', 'c', 1000).voltmeter('V2', 'm', 'c', 'ideal', 'ac').build());
    s1.advance(0.01);
    s1.advance(0.002);
    const s2 = sim(circuit().add('funcgen', 'FG', ['o', 't', 'c'], fg).resistor('R1', 'o', 'm', 1000).resistor('R2', 'm', 'c', 1000).voltmeter('V2', 'm', 'c', 'ideal', 'ac')
      .oscilloscope('OS', 'o', 'o', 'm', { earthed: true, input: 'real' }).build());
    s2.advance(0.01);
    s2.advance(0.002);
    flag(g, 'Toprak döngüsü: osiloskop COM yanlış noktaya bağlanınca R2 kısa devre olur', s2.status('V2').reading! < 0.01 * s1.status('V2').reading!, 'V(R2) ≈ 0', `önce ${fmt(s1.status('V2').reading!)} V, sonra ${fmt(s2.status('V2').reading!)} V`);
  });
});

// Rapor dosyası için Node (projede @types/node yok; yalnızca gereken kadarı).
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

afterAll(async () => {
  const file = process.env.FIZIK_RAPOR;
  if (!file) return;
  const fsModule = 'node:fs';
  const { writeFileSync } = (await import(/* @vite-ignore */ fsModule)) as { writeFileSync: (path: string, data: string, encoding: string) => void };
  const lines = rows.map((r) => `${r.ok ? 'GEÇTİ' : 'KALDI'} | ${r.group} | ${r.name} | beklenen ${r.expected} | bulunan ${r.got}${r.note ? ` | ${r.note}` : ''}`);
  lines.push(`TOPLAM ${rows.length}, KALAN ${rows.filter((r) => !r.ok).length}`);
  writeFileSync(file, lines.join(String.fromCharCode(10)), 'utf8');
});
