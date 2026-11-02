import { GMIN } from '../constants';
import type { MnaSystem } from '../mna';
import { WindowPeak } from '../ratings';
import { Device, type DeviceInit, type DeviceModel, type Measurement, type RatingWarning, type StepContext } from './device';
import { Junction } from './junction';
import { SeriesJunction } from './seriesJunction';

// 1N5819 Schottky diyot (1 A, 40 V, DO-41). Üreticinin tek SPICE modeli (Diodes Inc. DI_1N5819:
// IS=390n RS=0,115 N=1,70) kendi veri sayfasının tablosundan yüksek ileri gerilim verir (1 A'de 0,76 V;
// tablo en çok 0,60 V). Kullanıcı kararı (2026-11-02): IS, N ve RS veri sayfası tablosundaki üç noktadan
// (en çok değerler, 25 °C, darbe ölçümü) bulunmuştur:
//   0,1 A'de 0,34 V  — onsemi 1N5817/D Rev. 11 (Ağustos 2021), Electrical Characteristics
//   1 A'de 0,60 V    — Diodes Inc. DS23001 Rev. 10-2 (Nisan 2023) s. 2; onsemi, Vishay 88525 aynı
//   3 A'de 0,90 V    — Diodes Inc. DS23001 s. 2; onsemi, Vishay aynı
//   ⇒ RS = 0,112 Ω, N = 2,69 (N·VT = 69,4 mV), IS = 0,885 mA (üç noktadan da tam geçer).
// Ters akım (kullanıcı isteği, 2026-11-02): ileri yönün IS'i (0,885 mA) ters yönde kullanılmaz; ters akım
// ters gerilime bağlıdır ve onsemi 1N5817/D Rev. 11 Şekil 9 "Typical Reverse Current" eğrisinin 25 °C,
// 1N5819 çizgisinden okunur (sayfa pikselden sayısallaştırıldı; noktalar ±0,4 V içindeki okumaların
// ortancası, okuma belirsizliği çizgi kalınlığı kadar, ≈ ±%3). Eğri 2,2 V'ta başlar, 38,9 V'ta biter:
//   2,2 V 34,7 µA · 4 V 41,6 · 8 V 57,2 · 12 V 77,3 · 16 V 104 · 20 V 126 · 24 V 157 · 28 V 188 ·
//   32 V 227 · 36 V 271 · 38,9 V 291 µA (tablo: 40 V'ta en çok 1,0 mA).
// Noktaların arası logaritmik doğrusal. Varsayımlar (eğride yok): 2,2 V'un altında akım eğrinin başındaki
// değerde kalır (Schottky'nin ters akımı birkaç onda bir voltta doyar; gerilimle artışı engelin
// alçalmasındandır); 38,9 V'un üstünde son parçanın eğimiyle sürer. 0 V'a yakın ters akım
// L·(1 − exp(−u·g₀/L)) biçimindedir (u ters gerilim, L eğriden akım, g₀ = IS/(N·VT) ileri yönün 0 V'taki
// eğimi): akım ve eğimi 0 V'ta ileri yönle sürekli, birkaç milivoltta L'ye ulaşır.
// Kırılma modellenmez; ters gerilim VRRM'yi (40 V) aşarsa uyarı.
// Eklem kapasitesi: Diodes Inc. SPICE modelinin CJO = 203 pF, M = 0,333 değerleri (VJ modelde yok:
// SPICE varsayılanı 1 V); 4 V'ta 119 pF verir, tablodaki tipik 110 pF'a (DS23001 s. 2, 4 V, 1 MHz)
// yakın. Modelin TT'si (4,32 µs) alınmadı: Schottky'de azınlık taşıyıcı depolanmaz, ters toparlanma
// yoktur. Kapasite, bütün eklemler ters kutuplanınca yalnızca diyotlarla bağlı kalan bir devre
// parçasının (yalıtılmış kaynaklı köprü) Newton çözümünü de kararlı tutar.
export const SCHOTTKY_IS = 8.84838e-4;
export const SCHOTTKY_N = 2.68541;
export const SCHOTTKY_RS = 0.111886;
export const SCHOTTKY_VRRM = 40;
export const SCHOTTKY_CHARGE = { cj0: 203e-12, vj: 1, m: 0.333, tt: 0 };
/** 25 °C ters akım eğrisi (onsemi 1N5817/D Şekil 9, 1N5819): (ters gerilim V, akım A). */
export const SCHOTTKY_REVERSE: ReadonlyArray<readonly [number, number]> = [
  [2.2, 34.7e-6],
  [4, 41.6e-6],
  [8, 57.2e-6],
  [12, 77.3e-6],
  [16, 104e-6],
  [20, 126e-6],
  [24, 157e-6],
  [28, 188e-6],
  [32, 227e-6],
  [36, 271e-6],
  [38.9, 291e-6],
];

/** Ters gerilimde eğriden akım L ve eğimi dL/du (u > 0, ters gerilim). */
export function schottkyLeakage(u: number): { l: number; dl: number } {
  const pts = SCHOTTKY_REVERSE;
  if (u <= pts[0]![0]) return { l: pts[0]![1], dl: 0 };
  for (let k = 1; k < pts.length; k++) {
    const [u0, i0] = pts[k - 1]!;
    const [u1, i1] = pts[k]!;
    if (u <= u1 || k === pts.length - 1) {
      const b = Math.log(i1 / i0) / (u1 - u0);
      const l = i0 * Math.exp(b * (u - u0));
      return { l, dl: b * l };
    }
  }
  return { l: pts[0]![1], dl: 0 };
}

/** Schottky eklemi: ileri yönde Shockley (tablodan uydurulan IS, N), ters yönde eğriden akım. */
export class SchottkyJunction extends Junction {
  /** İleri yönün 0 V'taki eğimi IS/(N·VT) (GMIN hariç). */
  private readonly g0: number;

  constructor() {
    super(SCHOTTKY_IS, SCHOTTKY_N, SCHOTTKY_CHARGE);
    this.g0 = SCHOTTKY_IS / this.nvt;
  }

  override current(vd: number): number {
    if (vd >= 0) return super.current(vd);
    const { l } = schottkyLeakage(-vd);
    return -l * (1 - Math.exp((vd * this.g0) / l)) + GMIN * vd;
  }

  override conductance(vd: number): number {
    if (vd >= 0) return super.conductance(vd);
    const u = -vd;
    const { l, dl } = schottkyLeakage(u);
    const e = Math.exp((-u * this.g0) / l);
    return dl * (1 - e) + e * this.g0 * (1 - (u * dl) / l) + GMIN;
  }
}

export const SCHOTTKY_MODELS = ['1N5819'] as const;
export const SCHOTTKY_DEFAULTS = { model: '1N5819' as (typeof SCHOTTKY_MODELS)[number] };

/** Schottky diyot. Pinler: [0] = anot, [1] = katot; iç düğüm: RS ile eklem arası. */
export class SchottkyDevice extends Device {
  readonly type = 'schottky';
  readonly diode: SeriesJunction;
  /** Ters gerilimin periyot içindeki tepesi (katot − anot). */
  private reverse = new WindowPeak();

  constructor(init: DeviceInit) {
    super(init);
    const [anode, cathode, inner] = init.nodes as [number, number, number];
    this.diode = new SeriesJunction(SCHOTTKY_IS, SCHOTTKY_N, SCHOTTKY_RS, anode, inner, cathode, SCHOTTKY_CHARGE, new SchottkyJunction());
  }

  override get nonlinear(): boolean {
    return true;
  }

  override stampStatic(sys: MnaSystem): void {
    this.diode.stampStatic(sys);
  }

  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    this.diode.stampNonlinear(sys, ctx);
  }

  override updateIterate(x: Float64Array): boolean {
    return this.diode.update(x);
  }

  override restoreIterate(): void {
    this.diode.junction.restore();
  }

  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [this.diode.lteState()!];
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    this.diode.junction.accept(ctx);
    this.reverse.add(Math.max(0, this.v(x, 1) - this.v(x, 0)), ctx.h, ctx.window);
  }

  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    const voltage = this.reverse.value(Math.max(0, this.v(x, 1) - this.v(x, 0)));
    return voltage > SCHOTTKY_VRRM ? [{ code: 'reverse-voltage', params: { voltage, limit: SCHOTTKY_VRRM } }] : [];
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, this.diode.current(x));
  }

  override adoptState(prev: Device): void {
    if (prev instanceof SchottkyDevice) {
      this.diode.junction.copyStateFrom(prev.diode.junction);
      this.reverse.adopt(prev.reverse);
    }
  }
}

export const schottkyModel: DeviceModel = {
  type: 'schottky',
  pinCount: 2,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new SchottkyDevice(init),
};
