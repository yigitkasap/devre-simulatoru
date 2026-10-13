// Ölçü aletlerinin AC devrede gösterdiği değer: ardışık pencereler (bir periyot) üzerinden
// ortalama ve etkin (RMS) değer. Gerçek bir multimetre gibi gösterge her pencere bitince
// güncellenir; böylece rakamlar sinyalle birlikte titremez.
//
//   ortalama   = (1/T) · ∫ v dt
//   etkin değer = √( (1/T) · ∫ v² dt )
//
// İntegraller adım sonundaki değerle (geri Euler'in çözdüğü değer) dikdörtgen kuralıyla alınır.

export type MeterMode = 'dc' | 'ac';
export const METER_MODES: readonly MeterMode[] = ['dc', 'ac'];

export class WindowAverager {
  private window = 0;
  private sum = 0;
  private sumSquares = 0;
  private elapsed = 0;
  /** Son tamamlanan pencerenin sonuçları; henüz yoksa null. */
  private last: { mean: number; rms: number } | null = null;

  /** `dt` süresince `value` değerinde kalan bir ölçümü ekler. */
  add(value: number, dt: number, window: number): void {
    if (window !== this.window) {
      this.reset();
      this.window = window;
    }
    if (window <= 0 || dt <= 0) return;
    let remaining = dt;
    // Bir adım pencere sınırını aşarsa, adımın iki pencereye düşen kısımları ayrı eklenir.
    while (remaining > window * 1e-12) {
      const part = Math.min(window - this.elapsed, remaining);
      this.sum += value * part;
      this.sumSquares += value * value * part;
      this.elapsed += part;
      remaining -= part;
      if (this.elapsed >= window * (1 - 1e-9)) {
        this.last = { mean: this.sum / this.elapsed, rms: Math.sqrt(this.sumSquares / this.elapsed) };
        this.sum = 0;
        this.sumSquares = 0;
        this.elapsed = 0;
      }
    }
  }

  /**
   * Göstergedeki değer: DC kipinde ortalama, AC kipinde etkin değer. İlk pencere bitmeden
   * o ana kadarki kısmi sonuç, hiç ölçüm yoksa (AC kaynaksız devre) anlık değer kullanılır.
   */
  reading(mode: MeterMode, instantaneous: number): number {
    if (this.last) return mode === 'dc' ? this.last.mean : this.last.rms;
    if (this.elapsed > 0) {
      return mode === 'dc' ? this.sum / this.elapsed : Math.sqrt(this.sumSquares / this.elapsed);
    }
    return mode === 'dc' ? instantaneous : Math.abs(instantaneous);
  }

  reset(): void {
    this.sum = 0;
    this.sumSquares = 0;
    this.elapsed = 0;
    this.last = null;
  }

  /** Devre yeniden derlenince (değer değişikliği) önceki aletin ölçümü devralınır. */
  adopt(previous: WindowAverager): void {
    this.window = previous.window;
    this.sum = previous.sum;
    this.sumSquares = previous.sumSquares;
    this.elapsed = previous.elapsed;
    this.last = previous.last;
  }
}
