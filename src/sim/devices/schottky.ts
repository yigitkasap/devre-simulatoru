import type { MnaSystem } from '../mna';
import { WindowPeak } from '../ratings';
import { Device, type DeviceInit, type DeviceModel, type Measurement, type RatingWarning, type StepContext } from './device';
import { SeriesJunction } from './seriesJunction';

// 1N5819 Schottky diyot (1 A, 40 V, DO-41). Üreticinin tek SPICE modeli (Diodes Inc. DI_1N5819:
// IS=390n RS=0,115 N=1,70) kendi veri sayfasının tablosundan yüksek ileri gerilim verir (1 A'de 0,76 V;
// tablo en çok 0,60 V). Kullanıcı kararı (2026-11-02): IS, N ve RS veri sayfası tablosundaki üç noktadan
// (en çok değerler, 25 °C, darbe ölçümü) bulunmuştur:
//   0,1 A'de 0,34 V  — onsemi 1N5817/D Rev. 11 (Ağustos 2021), Electrical Characteristics
//   1 A'de 0,60 V    — Diodes Inc. DS23001 Rev. 10-2 (Nisan 2023) s. 2; onsemi, Vishay 88525 aynı
//   3 A'de 0,90 V    — Diodes Inc. DS23001 s. 2; onsemi, Vishay aynı
//   ⇒ RS = 0,112 Ω, N = 2,69 (N·VT = 69,4 mV), IS = 0,885 mA (üç noktadan da tam geçer).
// Sızıntı: ters yönde akım ≈ IS = 0,88 mA (tablo: 40 V'ta, 25 °C'de en çok 1,0 mA; dört üreticide aynı).
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
    this.diode = new SeriesJunction(SCHOTTKY_IS, SCHOTTKY_N, SCHOTTKY_RS, anode, inner, cathode, SCHOTTKY_CHARGE);
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
