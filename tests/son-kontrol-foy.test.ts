// Son kontrol (2026-11-14, sunum öncesi): föy deneylerinin (Akdeniz Üniversitesi klasörü) ölçümleri fiziksel olarak
// makul mü? Her örnek açıldığı hâliyle (föydeki değerlerle) çalıştırılır; ölçülen değer, simülasyondan bağımsız bir
// beklenen aralıkla karşılaştırılır: veri sayfası (1N4001, 1N5819, BC107, BF245A, IRF510, MCR100-6, 5,6 V zener,
// kırmızı LED) ya da devrenin elle hesabı. Aralıklar bilerek geniş: amaç model hatasını (yanlış yön, yanlış
// büyüklük mertebesi, eksik diyot düşümü) yakalamak; kesin sayılar tests/foy-deney.test.ts'te.
//
// FOY_TABLO=<dosya> verilirse tablo JSON olarak yazılır (son kontrol raporu).

import { afterAll, describe, expect, it } from 'vitest';
import type { ExampleId } from '../src/examples';
import type { CircuitDoc } from '../src/model/types';
import type { CircuitSimulator } from '../src/sim';
import { idOf, load, run, withProps } from './ornek-yardimci';

interface Row {
  readonly example: ExampleId;
  readonly experiment: number;
  readonly what: string;
  readonly value: number;
  readonly unit: string;
  readonly lo: number;
  readonly hi: number;
  readonly basis: string;
}
const rows: Row[] = [];
const SCALE: Record<string, number> = { V: 1, mV: 1e-3, mA: 1e-3, 'µA': 1e-6, '': 1, mS: 1e-3, Hz: 1 };
/** Ölçümü tabloya yazar ve aralıkla karşılaştırır (değerler `unit` biriminde). */
function row(example: ExampleId, experiment: number, what: string, si: number, unit: string, lo: number, hi: number, basis: string): void {
  const value = si / SCALE[unit]!;
  rows.push({ example, experiment, what, value, unit, lo, hi, basis });
  expect(value, `${example}: ${what} = ${value} ${unit}, beklenen ${lo}–${hi}`).toBeGreaterThanOrEqual(lo);
  expect(value, `${example}: ${what} = ${value} ${unit}, beklenen ${lo}–${hi}`).toBeLessThanOrEqual(hi);
}
afterAll(async () => {
  // Düğüm türleri projede yok (astro check testleri de denetler): ortam değişkeni ve dosya yazma dolaylı.
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
  const file = env?.FOY_TABLO;
  if (!file) return;
  const moduleName = 'node:fs';
  const fs = (await import(/* @vite-ignore */ moduleName)) as { writeFileSync: (path: string, data: string) => void };
  fs.writeFileSync(file, JSON.stringify(rows, null, 1));
});

/** Bir periyot (n örnek) boyunca büyüklüklerin en büyük, en küçük ve ortalama değerleri. */
function period<K extends string>(sim: CircuitSimulator, T: number, values: Record<K, () => number>, n = 2000): Record<K, { max: number; min: number; avg: number }> {
  const keys = Object.keys(values) as K[];
  const out = Object.fromEntries(keys.map((k) => [k, { max: Number.NEGATIVE_INFINITY, min: Number.POSITIVE_INFINITY, avg: 0 }])) as Record<K, { max: number; min: number; avg: number }>;
  for (let i = 0; i < n; i++) {
    expect(sim.advance(T / n).ok).toBe(true);
    for (const k of keys) {
      const v = values[k]();
      out[k].max = Math.max(out[k].max, v);
      out[k].min = Math.min(out[k].min, v);
      out[k].avg += v / n;
    }
  }
  return out;
}
const v = (sim: CircuitSimulator, doc: CircuitDoc, label: string, pin: number) => sim.voltageAt(`${idOf(doc, label)}#${pin}`)!;
const across = (sim: CircuitSimulator, doc: CircuitDoc, label: string) => sim.measure(idOf(doc, label))!;
const freq = (doc: CircuitDoc, label = 'FG1') => doc.parts.find((p) => p.label === label)!.props.frequency as number;

describe('Föy deneyleri: ölçümler fiziksel olarak makul', () => {
  it('Deney 1: diyot karakteristikleri (1N4001, zener, LED, Schottky)', () => {
    // Şekil-2: 5 V, 1 kΩ. 1N4001 (Vishay 88503 tipik eğrisi: 10 mA'de ≈ 0,60 V, 100 mA'de ≈ 0,72 V) ≈ 4,4 mA'de.
    const dc = load('diyot-dc');
    const s = run(dc, 0.01);
    const d = across(s, dc, 'D1');
    row('diyot-dc', 1, '1N4001 ileri gerilimi V_D (V_i = 5 V, ≈ 4,4 mA)', d.voltage, 'V', 0.5, 0.8, 'Silisyum doğrultma diyodu 0,6–0,8 V; veri sayfası tipik eğrisi 10 mA’de ≈ 0,60 V, 4,4 mA’de ≈ 0,55–0,60 V');
    row('diyot-dc', 1, 'Akım I = (V_i − V_D) / R (ampermetre A1)', d.current, 'mA', 4.15, 4.5, '(5 V − 0,5…0,8 V) / (1 kΩ + 0,1 Ω)');
    row('diyot-dc', 1, 'Çıkış V_o (voltmetre V1)', across(s, dc, 'V1').voltage, 'V', 4.15, 4.5, 'V_i − V_D');
    const low = run(withProps(dc, 'PS1', { voltage1: 0.3 }), 0.01);
    row('diyot-dc', 1, 'V_i = 0,3 V’ta akım (eşiğin altı)', across(low, dc, 'D1').current, 'µA', 0, 60, 'Silisyum eşiğinin (≈ 0,5 V) altında akım µA düzeyinde');

    // Şekil-3 (X-Y): 10 V t-t sinüs (±5 V), 1 kΩ + üretecin 50 Ω’u.
    const xy = load('diyot-karakteristigi');
    const sx = run(xy, 10 / freq(xy));
    const px = period(sx, 1 / freq(xy), { i: () => across(sx, xy, 'D1').current, vd: () => across(sx, xy, 'D1').voltage });
    row('diyot-karakteristigi', 1, 'En büyük ileri akım (±5 V, 1 kΩ + 50 Ω)', px.i.max, 'mA', 4.0, 4.3, '(5 V − 0,5…0,8 V) / 1050 Ω');
    row('diyot-karakteristigi', 1, 'Tepe akımda V_D', px.vd.max, 'V', 0.5, 0.8, '1N4001, ≈ 4 mA');
    row('diyot-karakteristigi', 1, 'En büyük ters akım (1 kHz)', -px.i.min, 'mA', 0, 0.5, 'Ters yönde iletim yok; 1 kHz’te ters toparlanma sivrisi küçük');

    const zener = load('zener-karakteristigi');
    const sz = run(zener, 10 / freq(zener));
    const pz = period(sz, 1 / freq(zener), { vz: () => across(sz, zener, 'Z1').voltage, i: () => across(sz, zener, 'Z1').current });
    // Zener pin 0 = anot ise ileri gerilim +, kırılma −; işaretten bağımsız: küçük olan ileri, büyük olan kırılma.
    const zf = Math.min(Math.abs(pz.vz.max), Math.abs(pz.vz.min));
    const zr = Math.max(Math.abs(pz.vz.max), Math.abs(pz.vz.min));
    row('zener-karakteristigi', 1, 'Zener kırılma gerilimi (±10 V, ≈ 4 mA)', zr, 'V', 5.2, 6.0, '5,6 V’luk zener (BZX55C5V6: 5 mA’de 5,2–6,0 V)');
    row('zener-karakteristigi', 1, 'Zenerin ileri gerilimi (≈ 9 mA)', zf, 'V', 0.6, 0.9, 'Silisyum eklem, ≈ 9 mA');

    const led = load('led-karakteristigi');
    const sl = run(led, 10 / freq(led));
    const pl = period(sl, 1 / freq(led), { vf: () => across(sl, led, 'LED1').voltage, i: () => across(sl, led, 'LED1').current });
    row('led-karakteristigi', 1, 'Kırmızı LED ileri gerilimi (tepe akımda)', pl.vf.max, 'V', 1.6, 2.2, 'Kırmızı LED: 1,6–2,2 V');
    row('led-karakteristigi', 1, 'LED tepe akımı (±5 V, 1 kΩ + 50 Ω)', pl.i.max, 'mA', 2.6, 3.3, '(5 V − 1,6…2,2 V) / 1050 Ω');
    row('led-karakteristigi', 1, 'LED ters akımı', -pl.i.min, 'µA', 0, 10, 'Ters yönde iletmez');

    const sch = load('schottky-1n4001');
    const ss = run(sch, 0.01);
    row('schottky-1n4001', 1, '1N5819 (Schottky) ileri gerilimi (≈ 10 mA)', across(ss, sch, 'D1').voltage, 'V', 0.15, 0.35, 'Veri sayfası: 0,1 A’de ≈ 0,3 V; 10 mA’de 0,2–0,3 V');
    row('schottky-1n4001', 1, '1N4001 ileri gerilimi (≈ 9,4 mA)', across(ss, sch, 'D2').voltage, 'V', 0.55, 0.8, 'Veri sayfası tipik: 10 mA’de ≈ 0,60 V');
  });

  it('Deney 2: doğrultucular', () => {
    // Şekil-4a: 6 V t-t (±3 V), 1 kHz, R_L = 1 kΩ. Çıkış tepe = diyodun anodundaki tepe − V_D.
    const hw = load('yarim-dalga');
    const f = freq(hw);
    const s = run(hw, 10 / f);
    const p = period(s, 1 / f, { vin: () => v(s, hw, 'D1', 0), vout: () => v(s, hw, 'D1', 1), gen: () => v(s, hw, 'FG1', 0) });
    row('yarim-dalga', 2, 'Giriş tepe değeri (diyodun anodu)', p.vin.max, 'V', 2.8, 3.0, '±3 V; üretecin 50 Ω’unda ≈ 0,1 V düşer');
    row('yarim-dalga', 2, 'Çıkış tepe değeri (R_L = 1 kΩ)', p.vout.max, 'V', 2.05, 2.5, 'Giriş tepesi − bir diyot gerilimi (0,45–0,8 V)');
    row('yarim-dalga', 2, 'Giriş tepesi − çıkış tepesi (diyot düşümü)', p.vin.max - p.vout.max, 'V', 0.45, 0.8, '1N4001, ≈ 2,4 mA: 0,5–0,6 V');
    row('yarim-dalga', 2, 'Çıkışın en küçük değeri (negatif yarı)', p.vout.min, 'V', -0.05, 0.05, 'Negatif yarıda diyot kesimde: çıkış ≈ 0');
    row('yarim-dalga', 2, 'Çıkışın ortalaması', p.vout.avg, 'V', 0.6, 0.8, 'Yarım dalga: ≈ V_tepe / π (iletim açısı dar olduğundan biraz azı)');

    // Şekil-5a: köprü, ±5 V, R_L = 100 kΩ (akım ≈ 44 µA: diyot başına ≈ 0,3–0,45 V).
    const br = load('kopru-dogrultmac');
    const fb = freq(br);
    const sb = run(br, 10 / fb);
    const rl = idOf(br, 'RL');
    const pb = period(sb, 1 / fb, { out: () => sb.measure(rl)!.voltage });
    const outPeak = Math.max(Math.abs(pb.out.max), Math.abs(pb.out.min));
    row('kopru-dogrultmac', 2, 'Çıkış tepe değeri (±5 V, R_L = 100 kΩ)', outPeak, 'V', 4.0, 4.5, 'Giriş tepesi − iki diyot (≈ 44 µA’de diyot başına 0,3–0,45 V)');
    row('kopru-dogrultmac', 2, 'Çıkışın ortalaması', Math.abs(pb.out.avg), 'V', 2.4, 2.9, 'Tam dalga: ≈ 2·V_tepe / π');
    row('kopru-dogrultmac', 2, 'Çıkışın en küçük mutlak değeri', Math.min(Math.abs(pb.out.max), Math.abs(pb.out.min)), 'V', 0, 0.1, 'Tam dalga doğrultmada çıkış sıfırdan öteye geçmez');

    // Hazır köprü (KBP307), 10 V tepe, 50 Hz, 1 kΩ.
    const kb = load('kopru-diyot');
    const sk = run(kb, 0.2);
    const pk = period(sk, 0.02, { out: () => across(sk, kb, 'RL').voltage });
    row('kopru-diyot', 2, 'Köprü diyot çıkış tepe değeri (10 V tepe, 1 kΩ)', Math.max(Math.abs(pk.out.max), Math.abs(pk.out.min)), 'V', 8.2, 9.0, '10 V − iki diyot (≈ 9 mA’de 2 × 0,6–0,8 V)');
  });

  it('Deney 3: kenetleyiciler ve gerilim katlayıcı', () => {
    for (const [id, sign] of [['negatif-kenetleyici', -1], ['pozitif-kenetleyici', 1]] as const) {
      const doc = load(id);
      const f = freq(doc);
      const s = run(doc, 60 / f);
      const p = period(s, 1 / f, { out: () => across(s, doc, 'RL').voltage });
      const near = sign < 0 ? p.out.max : -p.out.min;
      const far = sign < 0 ? -p.out.min : p.out.max;
      row(id, 3, 'Kenetlenen uç (diyodun ilettiği tepe)', near, 'V', 0.4, 0.8, 'Bir diyot gerilimi kadar öteye geçer');
      row(id, 3, 'Öbür tepe', far, 'V', 8.9, 9.6, 'Girişin tepe-tepe değeri (10 V) − bir diyot gerilimi');
      row(id, 3, 'Tepe-tepe değer', p.out.max - p.out.min, 'V', 9.4, 10.05, 'Girişinkiyle aynı (10 V t-t; üretecin 50 Ω’u ve yük biraz düşürür)');
    }
    const dbl = load('gerilim-katlayici');
    const f = freq(dbl);
    const s = run(dbl, 0.3);
    const a = across(s, dbl, 'C1').voltage;
    const b = across(s, dbl, 'C2').voltage;
    row('gerilim-katlayici', 3, 'Kondansatör başına gerilim', Math.max(Math.abs(a), Math.abs(b)), 'V', 4.2, 4.8, 'V_tepe (5 V) − bir diyot gerilimi (yüksüz, küçük akım)');
    row('gerilim-katlayici', 3, 'Çıkış (iki kondansatörün toplamı)', Math.abs(a) + Math.abs(b), 'V', 8.5, 9.6, '2 · V_tepe − 2 · V_D ≈ 2 · (5 − 0,4)');
    void f;
  });

  it('Deney 4: kırpıcılar (±10 V giriş, 10 kΩ)', () => {
    const clip = (id: ExampleId, label: string) => {
      const doc = load(id);
      const f = freq(doc);
      const s = run(doc, 10 / f);
      const part = idOf(doc, label);
      return period(s, 1 / f, { out: () => s.measure(part)!.voltage }).out;
    };
    const seri = clip('seri-kirpici', 'R1');
    const sMax = Math.max(Math.abs(seri.max), Math.abs(seri.min));
    const sMin = Math.min(Math.abs(seri.max), Math.abs(seri.min));
    row('seri-kirpici', 4, 'Geçen yarı periyodun tepesi', sMax, 'V', 9.1, 9.6, '10 V − bir diyot gerilimi (≈ 1 mA’de ≈ 0,5 V)');
    row('seri-kirpici', 4, 'Kırpılan yarı periyot (en büyük sapma)', sMin, 'V', 0, 0.3, 'Diyot kesimde: çıkış ≈ 0; yalnızca kesime girerken kısa bir ters toparlanma sivrisi (1N4001 yavaş diyot)');
    const docP = load('paralel-kirpici');
    const fp = freq(docP);
    const sp = run(docP, 10 / fp);
    const pp = period(sp, 1 / fp, { out: () => v(sp, docP, 'D1', 0) - v(sp, docP, 'FG1', 2) }).out;
    row('paralel-kirpici', 4, 'Kırpma seviyesi (4 V kaynak + diyot)', pp.max, 'V', 4.4, 4.8, 'V_kaynak + V_D = 4 V + 0,4…0,8 V (≈ 0,55 mA)');
    row('paralel-kirpici', 4, 'Öbür yarı periyodun tepesi', -pp.min, 'V', 9.7, 10.0, 'Diyot kesimde: giriş aynen geçer (−10 V)');
    for (const id of ['cift-kirpici', 'alt-kirpici'] as const) {
      const doc = load(id);
      const f = freq(doc);
      const s = run(doc, 10 / f);
      const out = period(s, 1 / f, { out: () => v(s, doc, 'R1', 1) - v(s, doc, 'FG1', 2), alt: () => v(s, doc, 'R1', 0) - v(s, doc, 'FG1', 2) });
      // R1'in çıkış tarafındaki ucu: tepe-tepe değeri küçük olan (girişe bağlı uç ±10 V görür).
      const o = out.out.max - out.out.min < out.alt.max - out.alt.min ? out.out : out.alt;
      if (id === 'cift-kirpici') {
        row(id, 4, 'Üst kırpma seviyesi (3 V pil + diyot)', o.max, 'V', 3.4, 3.8, '3 V + V_D');
        row(id, 4, 'Alt kırpma seviyesi (2 V pil + diyot)', o.min, 'V', -2.8, -2.4, '−(2 V + V_D)');
      } else {
        row(id, 4, 'Alt sınır (3 V pil − diyot)', o.min, 'V', 2.2, 2.6, '3 V − V_D');
        row(id, 4, 'Üst tepe (kırpılmaz)', o.max, 'V', 9.7, 10.0, 'Giriş tepesi (10 V); ikinci diyot hiç iletmez');
      }
    }
  });

  it('Deney 5 ve 6: BF245A JFET (I_DSS 2–6,5 mA, V_P −0,4…−2,2 V; NXP veri sayfası)', { timeout: 120000 }, () => {
    const doc = load('jfet-karakteristik');
    const j = idOf(doc, 'J1');
    const at = (vgs: number, vds: number) => {
      // 2. çıkış kapıyı source'a göre eksiye çeker: ayarı |V_GS|.
      const s = run(withProps(doc, 'PS1', { voltage1: vds, voltage2: -vgs }), 0.01);
      const [id] = s.pinCurrents(j)!;
      return { id: id!, vgs: s.voltageAt(`${j}#1`)! - s.voltageAt(`${j}#2`)!, vds: s.voltageAt(`${j}#0`)! - s.voltageAt(`${j}#2`)! };
    };
    const sat = at(0, 10);
    row('jfet-karakteristik', 5, 'V_GS (2. çıkış 0 V)', sat.vgs, 'V', -0.05, 0.05, 'Kapı akımı ≈ 0: R_G’de düşüm yok');
    row('jfet-karakteristik', 5, 'I_D (V_GS = 0, V_DS ≈ 10 V) ≈ I_DSS', sat.id, 'mA', 2.0, 6.5, 'BF245A: I_DSS = 2–6,5 mA');
    const idAt = (vgs: number) => at(vgs, 10).id;
    // Kısılma: I_D'nin 1 µA'in altına indiği kapı gerilimi (0,05 V adımla).
    let vp = 0;
    while (vp > -9 && idAt(vp) > 1e-6) vp -= 0.05;
    row('jfet-karakteristik', 5, 'Kısılma gerilimi V_P (I_D < 1 µA)', vp, 'V', -2.2, -0.4, 'BF245A: V_GS(off) = −0,4…−2,2 V');
    row('jfet-karakteristik', 5, 'Doyumda eğim: I_D(15 V) / I_D(5 V)', at(0, 15).id / at(0, 5).id, '', 1.0, 1.35, 'Doyumda akım V_DS ile az artar (kanal boyu modülasyonu)');
    row('jfet-karakteristik', 5, 'Omik bölge: I_D(V_DS = 0,5 V) / I_DSS', at(0, 0.5).id / sat.id, '', 0.2, 0.75, 'Kısılmadan önce akım V_DS ile artar');

    for (const id of ['fet-yukseltec', 'fet-yukseltec-kuplajli'] as const) {
      const amp = load(id);
      const f = freq(amp);
      const q = idOf(amp, 'J1');
      const s = run(amp, 0.005 + 20 / f);
      const p = period(s, 1 / f, { d: () => s.voltageAt(`${q}#0`)!, g: () => s.voltageAt(`${q}#1`)!, i: () => s.pinCurrents(q)![0]! });
      row(id, 6, 'Dinlenme V_DS (ortalama)', p.d.avg, 'V', 2, 12, 'Aktif bölge: V_P’nin üstünde, beslemenin (15 V) altında');
      row(id, 6, 'I_D (ortalama)', p.i.avg, 'mA', 1.5, 6.5, 'V_GS ≈ 0: I_DSS dolayında (2–6,5 mA)');
      row(id, 6, 'Gerilim kazancı |K| (0,5 V t-t)', (p.d.max - p.d.min) / (p.g.max - p.g.min), '', 7, 16, 'g_m · R_D: BF245A’da |y_fs| = 3–6,5 mS, R_D = 2,7 kΩ → 8–17 (r_o biraz düşürür)');
    }
  });

  it('Deney 7: BC107 yükselteç (h_FE 110–450, V_BE ≈ 0,55–0,7 V; veri sayfası)', { timeout: 60000 }, () => {
    for (const id of ['bjt-yukseltec', 'bjt-yukseltec-kuplajli'] as const) {
      const doc = load(id);
      const f = freq(doc);
      const q = idOf(doc, 'Q1');
      const s = run(doc, 0.005 + 20 / f);
      const p = period(s, 1 / f, {
        c: () => s.voltageAt(`${q}#0`)!,
        b: () => s.voltageAt(`${q}#1`)!,
        ic: () => s.pinCurrents(q)![0]!,
        ib: () => s.pinCurrents(q)![1]!,
        gen: () => v(s, doc, 'FG1', 0),
      });
      row(id, 7, 'V_BE (ortalama)', p.b.avg, 'V', 0.55, 0.75, 'Silisyum NPN, mA düzeyinde akım');
      row(id, 7, 'β_DC = I_C / I_B', p.ic.avg / p.ib.avg, '', 110, 450, 'BC107: h_FE = 110–450 (devrede β = 200 seçili)');
      row(id, 7, 'V_CE (ortalama)', p.c.avg, 'V', 2, 10, 'Aktif bölge: doyumun (≈ 0,2 V) üstünde, beslemenin (12 V) altında');
      if (id === 'bjt-yukseltec') row(id, 7, 'Gerilim kazancı |K| (0,2 V t-t)', (p.c.max - p.c.min) / (p.gen.max - p.gen.min), '', 13, 21, 'β · R_C / (R_B + r_π) = 200 · 1 kΩ / (10 kΩ + ≈ 0,9 kΩ) ≈ 18; β akımla biraz düşer');
      else row(id, 7, 'Kollektör salınımı (tepe-tepe)', p.c.max - p.c.min, 'V', 1, 12, 'Kazanç g_m · R_C ≈ 200 dolayında: 0,2 V t-t giriş çıkışı beslemenin sınırlarına sürer');
    }
  });

  it('Deney 8: IRF510 yükselteç (V_GS(th) 2–4 V; Vishay veri sayfası)', () => {
    const doc = load('mosfet-yukseltec');
    const f = freq(doc);
    const m = idOf(doc, 'M1');
    const s = run(doc, 20 / f);
    const p = period(s, 1 / f, { d: () => s.voltageAt(`${m}#0`)!, g: () => s.voltageAt(`${m}#1`)!, i: () => s.pinCurrents(m)![0]! });
    row('mosfet-yukseltec', 8, 'Kapı kayma gerilimi V_GS (ortalama)', p.g.avg, 'V', 2, 4, 'IRF510: V_GS(th) = 2–4 V; iletim eşiğin hemen üstünde başlar');
    row('mosfet-yukseltec', 8, 'I_D (ortalama)', p.i.avg, 'mA', 2, 13, 'Dinlenme noktası beslemenin ortasında: ≈ 7,5 V / 1 kΩ');
    row('mosfet-yukseltec', 8, 'Gerilim kazancı |K| (0,1 V t-t)', (p.d.max - p.d.min) / (p.g.max - p.g.min), '', 60, 290, 'g_m · R_D; mA düzeyinde g_m en çok I_D / V_T ≈ 0,29 S (1 kΩ ile 290), kare yasasıyla ≈ 0,06 S');
    const rs = load('mosfet-yukseltec-rs');
    const fr = freq(rs);
    const mr = idOf(rs, 'M1');
    const sr = run(rs, 20 / fr);
    const pr = period(sr, 1 / fr, { d: () => sr.voltageAt(`${mr}#0`)!, g: () => sr.voltageAt(`${mr}#1`)!, src: () => sr.voltageAt(`${mr}#2`)!, i: () => sr.pinCurrents(mr)![0]! });
    row('mosfet-yukseltec-rs', 8, 'V_GS (ortalama)', pr.g.avg - pr.src.avg, 'V', 2, 4, 'IRF510: V_GS(th) = 2–4 V');
    row('mosfet-yukseltec-rs', 8, 'Gerilim kazancı |K| (R_D = 10 kΩ, R_S = 1 kΩ)', (pr.d.max - pr.d.min) / (pr.g.max - pr.g.min), '', 8, 10, 'R_D / (R_S + 1 / g_m) ≈ 10’un biraz altı');
    row('mosfet-yukseltec-rs', 8, 'Drain gerilimi (ortalama)', pr.d.avg, 'V', 3, 12, 'Aktif bölge');
  });

  it('Deney 9: transistör anahtar (BC107 doyum ≤ 0,25 V), tristör mandalı', () => {
    // Şekil-24: LED kollektörle toprak arasında (transistöre paralel): giriş 0 V'ta yanar, 5 V'ta doyan transistör söndürür.
    const sw = load('bjt-anahtar');
    const q = idOf(sw, 'Q1');
    // Giriş üretecin TTL çıkışı (1 Hz): periyodun ilk yarısında 5 V, ikinci yarısında 0 V.
    const high = run(sw, 0.25);
    const lo = run(sw, 0.75);
    const vce = (s: CircuitSimulator) => s.voltageAt(`${q}#0`)! - s.voltageAt(`${q}#2`)!;
    row('bjt-anahtar', 9, 'Doyumda V_CE (giriş 5 V)', vce(high), 'V', 0, 0.25, 'BC107: V_CE(sat) ≤ 0,25 V (10 mA / 0,5 mA)');
    row('bjt-anahtar', 9, 'Doyumda V_BE', high.voltageAt(`${q}#1`)! - high.voltageAt(`${q}#2`)!, 'V', 0.6, 0.85, 'BC107: V_BE(sat) ≈ 0,7–0,83 V');
    row('bjt-anahtar', 9, 'Baz akımı (giriş 5 V, 10 kΩ)', high.pinCurrents(q)![1]!, 'mA', 0.38, 0.46, '(5 V − ≈ 0,7 V) / 10 kΩ');
    row('bjt-anahtar', 9, 'Kollektör akımı (doyum)', high.pinCurrents(q)![0]!, 'mA', 11.5, 12.1, '(12 V − V_CE(sat)) / 1 kΩ');
    row('bjt-anahtar', 9, 'LED akımı (giriş 5 V)', Math.abs(across(high, sw, 'LED1').current), 'mA', 0, 0.01, 'V_CE(sat) LED eşiğinin çok altında: LED söner');
    row('bjt-anahtar', 9, 'LED akımı (giriş 0 V)', Math.abs(across(lo, sw, 'LED1').current), 'mA', 9.6, 10.6, '(12 V − 1,6…2,2 V) / 1 kΩ');
    row('bjt-anahtar', 9, 'LED gerilimi (giriş 0 V)', Math.abs(across(lo, sw, 'LED1').voltage), 'V', 1.6, 2.2, 'Kırmızı LED, 10 mA');
    // Şekil-25: LED emetörde (emetör izleyici).
    const ef = load('bjt-anahtar-emetor');
    const qe = idOf(ef, 'Q1');
    const on = run(ef, 0.25);
    const off = run(ef, 0.75);
    row('bjt-anahtar-emetor', 9, 'Emetör gerilimi (giriş 5 V)', on.voltageAt(`${qe}#2`)!, 'V', 4.0, 4.45, 'Giriş − V_BE (0,6–0,75 V) − I_B · 10 kΩ');
    row('bjt-anahtar-emetor', 9, 'LED akımı (giriş 5 V)', Math.abs(across(on, ef, 'LED1').current), 'mA', 1.9, 2.9, '(V_E − V_LED) / 1 kΩ = (≈ 4,2 − 1,6…2,2) V / 1 kΩ');
    row('bjt-anahtar-emetor', 9, 'V_CE (giriş 5 V): aktif bölge', on.voltageAt(`${qe}#0`)! - on.voltageAt(`${qe}#2`)!, 'V', 7, 8.2, '12 V − V_E: transistör doymaz');
    row('bjt-anahtar-emetor', 9, 'LED akımı (giriş 0 V)', Math.abs(across(off, ef, 'LED1').current), 'mA', 0, 0.01, 'Transistör kesimde');

    // Tristör mandalı (MCR100-6): BT1 kapıyı tetikler, bırakınca da iletimde kalır; BT2 (normalde kapalı) akımı keser.
    const scr = load('tristor-mandal');
    const led = idOf(scr, 'LED1');
    const idle = run(scr, 0.05);
    row('tristor-mandal', 9, 'Tetiklenmeden LED akımı', Math.abs(idle.measure(led)!.current), 'mA', 0, 0.02, 'Tristör kesimde');
    idle.update(buildNet(withProps(scr, 'BT1', { pressed: true })));
    expect(idle.advance(0.05).ok).toBe(true);
    idle.update(buildNet(scr));
    expect(idle.advance(0.1).ok).toBe(true);
    const anode = across(idle, scr, 'SCR1');
    row('tristor-mandal', 9, 'Tetik bırakıldıktan sonra LED akımı (mandal)', Math.abs(idle.measure(led)!.current), 'mA', 11.5, 15, '(9 V − V_LED (1,7–2,2) − V_T (0,7–1,2)) / 470 Ω; tutma akımının (≤ 5 mA) üstünde');
    row('tristor-mandal', 9, 'Tristörün iletim gerilimi V_T', Math.abs(anode.voltage), 'V', 0.6, 1.3, 'MCR100-6: V_TM ≤ 1,7 V (1 A’de); mA düzeyinde ≈ 0,7–1 V');
    idle.update(buildNet(withProps(scr, 'BT2', { pressed: true })));
    expect(idle.advance(0.05).ok).toBe(true);
    idle.update(buildNet(scr));
    expect(idle.advance(0.1).ok).toBe(true);
    row('tristor-mandal', 9, 'BT2 ile akım kesildikten sonra LED akımı', Math.abs(idle.measure(led)!.current), 'mA', 0, 0.02, 'Akım tutma akımının altına inince tristör kesime döner');
  });

  it('Baraj projesi: su seviyesine göre LED’ler', { timeout: 120000 }, () => {
    for (const id of ['baraj-cubuk', 'baraj-tek-isik'] as const) {
      const doc = load(id);
      const lit = (level: number) => {
        const s = run(withProps(doc, 'H1', { level, mode: 'stop' }), 1.5);
        return ['LED1', 'LED2', 'LED3'].map((l) => Math.abs(across(s, doc, l).current));
      };
      // Problar %12,5 (ortak), %37,5, %62,5 ve %87,5 yüksekliğinde.
      const counts = [20, 50, 75, 95].map((level) => lit(level));
      const on = counts.map((c) => c.filter((i) => i > 2e-3).length);
      const full = lit(95);
      row(id, 9, 'Yanan LED sayısı: seviye %20', on[0]!, '', 0, 0, 'Su hiçbir proba değmiyor');
      row(id, 9, 'Yanan LED sayısı: seviye %50', on[1]!, '', 1, 1, 'Yalnızca 1. seviye');
      row(id, 9, 'Yanan LED sayısı: seviye %75', on[2]!, '', id === 'baraj-cubuk' ? 2 : 1, id === 'baraj-cubuk' ? 2 : 1, id === 'baraj-cubuk' ? 'Çubuk gösterge: 1. ve 2. seviye' : 'Tek ışık: yalnızca en üstteki seviye');
      row(id, 9, 'Yanan LED sayısı: seviye %95', on[3]!, '', id === 'baraj-cubuk' ? 3 : 1, id === 'baraj-cubuk' ? 3 : 1, id === 'baraj-cubuk' ? 'Üç seviye de' : 'Yalnızca kırmızı (3. seviye)');
      row(id, 9, 'Yanan LED’in akımı (seviye %95, kırmızı)', full[2]!, 'mA', 11, 16.5, '(9 V − V_LED − V_CE(sat)) / 470 Ω');
    }
  });
});

import { buildConnectivity } from '../src/model/connectivity';
function buildNet(doc: CircuitDoc) {
  return buildConnectivity(doc).netlist;
}
