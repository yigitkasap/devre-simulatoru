// Gerçek parçaların sınırları (Fizik 5). Değerler üretici belgelerindendir; kaynaklar README'de,
// "Fizik 5". Sınır aşılınca yalnızca uyarı verilir: bozulmanın nasıl ve ne zaman olacağına dair
// veri sayfalarında dayanak yok (yanma modellenmez).

/**
 * LED'in en büyük ters gerilimi (V): Kingbright 5 mm (T-1 3/4) LED'ler, L-53 serisi veri sayfası,
 * "Absolute Maximum Ratings": Reverse Voltage VR = 5 V (kırmızı, yeşil, sarı ve mavi).
 */
export const LED_MAX_REVERSE_VOLTAGE = 5;

/** 1N4001'in tekrarlanan tepe ters gerilimi VRRM (V): Vishay 1N4001–1N4007 veri sayfası. */
export const DIODE_1N4001_VRRM = 50;

/**
 * Alüminyum elektrolitik kondansatörde izin verilen ters gerilim (V): Nippon Chemi-Con,
 * "Guidelines for Using Aluminum Electrolytic Capacitors": "Generally, an intermittent reverse
 * voltage of 1 volt DC is allowed." (Nichicon hiç ters gerilim uygulanmamasını, Cornell Dubilier
 * en fazla 1,5 V'u söyler; en sıkı sayısal sınır seçildi.)
 */
export const ELECTROLYTIC_MAX_REVERSE_VOLTAGE = 1;

/** Direncin güç sınırı seçenekleri (W); varsayılan 1/4 W (öğrenci laboratuvarlarındaki karbon film). */
export const RESISTOR_POWER_RATINGS = ['0.125', '0.25', '0.5', '1', '2', '5'] as const;
export type ResistorPowerRating = (typeof RESISTOR_POWER_RATINGS)[number];
export const DEFAULT_RESISTOR_POWER: ResistorPowerRating = '0.25';

/**
 * AC devrede bir periyotluk pencerede en büyük değer (ters gerilimin tepesi): son tamamlanan
 * pencerenin değeri (uyarı her yarım periyotta yanıp sönmesin), ilk pencere bitmeden o ana kadarki
 * en büyük değer. AC kaynak yoksa (window = 0) anlık değer.
 */
export class WindowPeak {
  private window = 0;
  private running = 0;
  private elapsed = 0;
  private last: number | null = null;

  add(value: number, dt: number, window: number): void {
    if (window !== this.window) {
      this.window = window;
      this.running = 0;
      this.elapsed = 0;
      this.last = null;
    }
    if (window <= 0 || dt <= 0) return;
    this.running = Math.max(this.running, value);
    this.elapsed += dt;
    if (this.elapsed >= window * (1 - 1e-9)) {
      this.last = this.running;
      this.running = 0;
      this.elapsed = 0;
    }
  }

  value(instantaneous: number): number {
    if (this.window <= 0) return instantaneous;
    return this.last ?? Math.max(this.running, instantaneous);
  }

  adopt(previous: WindowPeak): void {
    this.window = previous.window;
    this.running = previous.running;
    this.elapsed = previous.elapsed;
    this.last = previous.last;
  }
}
