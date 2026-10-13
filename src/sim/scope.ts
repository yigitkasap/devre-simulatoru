// Osiloskop kaydı: iki kanalın zaman içindeki gerilimi, ekran çözünürlüğünde "kovalara"
// (bucket) bölünerek saklanır. Her kova bir zaman aralığıdır (ekran genişliği / SCOPE_BUCKETS);
// içindeki en küçük, en büyük ve son değer tutulur. En küçük/en büyük değer sayesinde
// ekranın çözünürlüğünden hızlı bir sinyal kaybolmaz, bir bant olarak görünür (tepe yakalama).

/** Ekranın yatay ve dikey bölme sayısı. */
export const SCOPE_DIVISIONS_X = 10;
export const SCOPE_DIVISIONS_Y = 8;
/** Bir ekran genişliğindeki kova sayısı. */
export const SCOPE_BUCKETS = 500;
/** Saklanan ekran sayısı (tetikleme için geçmiş). */
const SCREENS_KEPT = 4;

export interface ScopeChannelData {
  readonly min: Float64Array;
  readonly max: Float64Array;
  readonly last: Float64Array;
}

export class ScopeRecorder {
  /** Bir kovanın süresi (s). */
  readonly bucketTime: number;
  readonly capacity = SCOPE_BUCKETS * SCREENS_KEPT;
  readonly channels: readonly [ScopeChannelData, ScopeChannelData];
  /** Saklanan ilk kovanın mutlak sırası (zaman / kova süresi). */
  start = 0;
  /** Son kovanın bir sonrası; start === end ise kayıt yok. */
  end = 0;
  private previous: { t: number; a: number; b: number } | null = null;

  constructor(timePerDiv: number) {
    this.bucketTime = (timePerDiv * SCOPE_DIVISIONS_X) / SCOPE_BUCKETS;
    const channel = (): ScopeChannelData => ({
      min: new Float64Array(this.capacity),
      max: new Float64Array(this.capacity),
      last: new Float64Array(this.capacity),
    });
    this.channels = [channel(), channel()];
  }

  /** Mutlak kova sırasının dizideki yeri. */
  slot(index: number): number {
    return ((index % this.capacity) + this.capacity) % this.capacity;
  }

  /** t anındaki iki kanal değerini kaydeder. Atlanan kovalar iki ölçüm arasında doğrusal doldurulur. */
  record(t: number, a: number, b: number): void {
    const k = Math.floor(t / this.bucketTime + 1e-9);
    const previous = this.previous;
    const current = this.end - 1;
    if (!previous || k < current) {
      this.start = k;
      this.end = k;
      this.open(k, a, b);
    } else if (k === current) {
      this.update(k, a, b);
    } else {
      const from = Math.max(current + 1, k - this.capacity);
      const span = t - previous.t;
      for (let j = from; j < k; j++) {
        const f = span > 0 ? Math.min(1, Math.max(0, ((j + 0.5) * this.bucketTime - previous.t) / span)) : 1;
        this.open(j, previous.a + (a - previous.a) * f, previous.b + (b - previous.b) * f);
      }
      this.open(k, a, b);
    }
    this.previous = { t, a, b };
  }

  private open(k: number, a: number, b: number): void {
    const s = this.slot(k);
    const [ca, cb] = this.channels;
    ca.min[s] = a;
    ca.max[s] = a;
    ca.last[s] = a;
    cb.min[s] = b;
    cb.max[s] = b;
    cb.last[s] = b;
    this.end = k + 1;
    if (this.end - this.start > this.capacity) this.start = this.end - this.capacity;
  }

  private update(k: number, a: number, b: number): void {
    const s = this.slot(k);
    const [ca, cb] = this.channels;
    ca.min[s] = Math.min(ca.min[s]!, a);
    ca.max[s] = Math.max(ca.max[s]!, a);
    ca.last[s] = a;
    cb.min[s] = Math.min(cb.min[s]!, b);
    cb.max[s] = Math.max(cb.max[s]!, b);
    cb.last[s] = b;
  }
}
