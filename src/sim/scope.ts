// Osiloskop kaydı: iki kanalın zaman içindeki gerilimi, ekran çözünürlüğünde "kovalara"
// (bucket) bölünerek saklanır. Her kova bir zaman aralığıdır (ekran genişliği / SCOPE_BUCKETS);
// içindeki en küçük, en büyük ve son değer tutulur. En küçük/en büyük değer sayesinde
// ekranın çözünürlüğünden hızlı bir sinyal kaybolmaz, bir bant olarak görünür (tepe yakalama).
//
// Tetikli yakalama (gerçek bir osiloskop gibi): tetik sinyali her ölçümde izlenir; orta seviyeyi
// ((zarfın en küçüğü + en büyüğü) / 2) yukarı doğru kestiği an, ölçümler arasında doğrusal
// aradeğerle bulunur. Kurulu (armed) kayıt bu anda bir ekranlık yakalamaya başlar; yakalama
// sürerken motorun adımı ekranın 1/CAPTURE_STEPS'iyle sınırlanır (stepLimit), kenarın kendisi de
// motorun olay mekanizmasıyla adımın içinde bulunur (triggerFraction). Böylece ekran, sinyalin
// periyodundan ve motorun olağan adımından çok kısa olsa da (ör. 1 µs/bölme) doğru çizilir.
// Arayüz yakalamadan sonra kaydı her karede bir kez yeniden kurar (perFrame): yakalama maliyeti
// karede bir ekranla sınırlı kalır.

/** Ekranın yatay ve dikey bölme sayısı. */
export const SCOPE_DIVISIONS_X = 10;
export const SCOPE_DIVISIONS_Y = 8;
/** Bir ekran genişliğindeki kova sayısı. */
export const SCOPE_BUCKETS = 500;
/** Saklanan ekran sayısı (tetikleme için geçmiş). */
const SCREENS_KEPT = 4;
/** Yakalama sırasında bir ekranın en az bu kadar adımla çözülmesi (adım sınırı). */
export const CAPTURE_STEPS = 250;
/** Tetik seviyesinin çevresindeki ölü bant (sinyalin tepe-tepe değerine oranı). */
export const TRIGGER_HYSTERESIS = 0.1;
/**
 * Bu kadar ölçüm aralığı bir ekranın 1/COARSE_SAMPLES'ından uzunsa kayıt "kaba"dır: geçmişten
 * çizilen ekran birkaç noktadan oluşur, yakalanan ekran yeğlenir.
 */
const COARSE_SAMPLES = 50;
/** Frekans için saklanan son tetik kesimi sayısı. */
const CROSSINGS_KEPT = 9;

export interface ScopeChannelData {
  readonly min: Float64Array;
  readonly max: Float64Array;
  readonly last: Float64Array;
}

/** Tetik kaynağı: A, B ya da (ADD kipinde) A + B; B ters çevrilmişse işareti değişir. */
export interface TriggerConfig {
  readonly enabled: boolean;
  readonly source: 'A' | 'B' | 'sum';
  readonly invertB: boolean;
}

const DEFAULT_TRIGGER: TriggerConfig = { enabled: true, source: 'A', invertB: false };

export class ScopeRecorder {
  /** Bir kovanın süresi (s). */
  readonly bucketTime: number;
  /** Bir ekranın süresi (s). */
  readonly screenTime: number;
  readonly capacity: number;
  readonly channels: readonly [ScopeChannelData, ScopeChannelData];
  /** Saklanan ilk kovanın mutlak sırası (zaman / kova süresi). */
  start = 0;
  /** Son kovanın bir sonrası; start === end ise kayıt yok. */
  end = 0;
  private previous: { t: number; a: number; b: number } | null = null;

  // --- Tetik ---
  private trigger: TriggerConfig = DEFAULT_TRIGGER;
  /** Tetik sinyalinin zarfı: en büyük/en küçük değere hemen çıkar, yavaşça (release) içeri çekilir. */
  private envelope: { hi: number; lo: number } | null = null;
  /** Sinyal seviyenin altındaki ölü banda indi mi (bir sonraki yukarı kesim sayılır). */
  private belowArm = false;
  /** Son tetik kesimlerinin zamanları (frekans ve tazelik için). */
  private crossings: number[] = [];
  /** Kayıt yeni bir ekran yakalamaya hazır mı. */
  private armed = true;
  /** true: yakalamadan sonra yeniden kurma arayüzden (rearm, karede bir); false: hemen. */
  perFrame = false;
  /** Süren yakalama ve başladığı an. */
  private capture: { rec: ScopeRecorder; start: number } | null = null;
  /** Son tamamlanan yakalama. */
  private captured: { rec: ScopeRecorder; start: number } | null = null;
  /** Son ölçüm aralıklarının (yavaşça unutulan) en büyüğü. */
  private recentGap = 0;

  constructor(timePerDiv: number, screens = SCREENS_KEPT) {
    this.screenTime = timePerDiv * SCOPE_DIVISIONS_X;
    this.bucketTime = this.screenTime / SCOPE_BUCKETS;
    this.capacity = SCOPE_BUCKETS * screens;
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

  /** Tetik ayarı; değiştiyse tetik durumu sıfırlanır (kayıt korunur). */
  setTrigger(config: TriggerConfig): void {
    const t = this.trigger;
    if (t.enabled === config.enabled && t.source === config.source && t.invertB === config.invertB) return;
    this.trigger = config;
    this.envelope = null;
    this.belowArm = false;
    this.crossings = [];
    this.capture = null;
    this.captured = null;
    this.armed = true;
  }

  /** t anındaki iki kanal değerini kaydeder. Atlanan kovalar iki ölçüm arasında doğrusal doldurulur. */
  record(t: number, a: number, b: number): void {
    const previous = this.previous;
    this.store(t, a, b);
    if (previous && t > previous.t) this.recentGap = Math.max(t - previous.t, this.recentGap * 0.9);
    if (this.trigger.enabled) this.watchTrigger(previous, t, a, b);
    this.previous = { t, a, b };
  }

  private store(t: number, a: number, b: number): void {
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
      // İki ölçüm arası bir ekrandan uzunsa yalnızca son ekran doldurulur (öncesi zaten
      // gösterilemeyecek kadar seyrek; her adımda bütün kaydı yeniden yazmak kareyi yavaşlatır).
      const from = Math.max(current + 1, k - SCOPE_BUCKETS);
      if (from > current + 1) this.start = from;
      const span = t - previous.t;
      for (let j = from; j < k; j++) {
        const f = span > 0 ? Math.min(1, Math.max(0, ((j + 0.5) * this.bucketTime - previous.t) / span)) : 1;
        this.open(j, previous.a + (a - previous.a) * f, previous.b + (b - previous.b) * f);
      }
      this.open(k, a, b);
    }
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

  // ---------------------------------------------------------------------------
  // Tetik

  private triggerValue(a: number, b: number): number {
    const vb = this.trigger.invertB ? -b : b;
    return this.trigger.source === 'A' ? a : this.trigger.source === 'B' ? vb : a + vb;
  }

  /** Tetik seviyesi ve kurma eşiği; sinyal düzse (DC) null. */
  private levels(): { level: number; arm: number } | null {
    const env = this.envelope;
    if (!env) return null;
    const span = env.hi - env.lo;
    if (!(span > 1e-9 * Math.max(1, Math.abs(env.hi), Math.abs(env.lo)))) return null;
    const level = (env.hi + env.lo) / 2;
    return { level, arm: level - TRIGGER_HYSTERESIS * span };
  }

  private watchTrigger(previous: { t: number; a: number; b: number } | null, t: number, a: number, b: number): void {
    const v = this.triggerValue(a, b);
    const env = this.envelope;
    if (!env || !previous) {
      this.envelope = { hi: v, lo: v };
    } else {
      // Zarf, sinyalin uçlarına hemen çıkar; ekranın 10 katı (en az 0,1 s) zaman sabitiyle daralır.
      const release = Math.max(10 * this.screenTime, 0.1);
      const shrink = ((env.hi - env.lo) / 2) * Math.min(1, Math.max(0, t - previous.t) / release);
      env.hi = Math.max(v, env.hi - shrink);
      env.lo = Math.min(v, env.lo + shrink);
    }
    const lv = this.levels();
    if (lv && previous) {
      const pv = this.triggerValue(previous.a, previous.b);
      if (pv <= lv.arm) this.belowArm = true;
      if (this.belowArm && pv < lv.level && v >= lv.level) {
        this.belowArm = false;
        const f = v > pv ? (lv.level - pv) / (v - pv) : 1;
        const tc = previous.t + (t - previous.t) * f;
        this.crossings.push(tc);
        if (this.crossings.length > CROSSINGS_KEPT) this.crossings.shift();
        if (this.armed && !this.capture) {
          const rec = new ScopeRecorder(this.screenTime / SCOPE_DIVISIONS_X, 1);
          rec.store(0, previous.a + (a - previous.a) * f, previous.b + (b - previous.b) * f);
          rec.previous = { t: 0, a: previous.a + (a - previous.a) * f, b: previous.b + (b - previous.b) * f };
          this.capture = { rec, start: tc };
        }
      }
      if (v <= lv.arm) this.belowArm = true;
    }
    const capture = this.capture;
    if (capture) {
      const offset = t - capture.start;
      capture.rec.store(offset, a, b);
      capture.rec.previous = { t: offset, a, b };
      if (offset >= this.screenTime * (1 - 1e-9)) {
        this.captured = capture;
        this.capture = null;
        this.armed = !this.perFrame;
      }
    }
  }

  /**
   * Motorun aday çözümünde tetik sinyali (a, b) seviyeyi yukarı kesiyorsa kesimin, son kaydedilen
   * ölçümden bu adayın sonuna kadarki kesri (0..1); kesmiyorsa ya da kayıt kurulu değilse null.
   */
  triggerFraction(a: number, b: number): number | null {
    if (!this.trigger.enabled || !this.armed || this.capture || !this.previous) return null;
    const lv = this.levels();
    if (!lv) return null;
    const pv = this.triggerValue(this.previous.a, this.previous.b);
    const v = this.triggerValue(a, b);
    if (!(this.belowArm || pv <= lv.arm) || !(pv < lv.level && v >= lv.level) || v <= pv) return null;
    return (lv.level - pv) / (v - pv);
  }

  /** Yakalama sürerken motorun adımının üst sınırı (s); yoksa sonsuz. */
  get stepLimit(): number {
    return this.capture ? this.screenTime / CAPTURE_STEPS : Number.POSITIVE_INFINITY;
  }

  /** Kaydı yeniden kurar: bir sonraki tetik kesimi yeni bir ekran yakalar. */
  rearm(): void {
    this.armed = true;
  }

  /** Geçmişteki ölçümler ekranı çizmeye yetmeyecek kadar seyrek mi. */
  get coarse(): boolean {
    return this.recentGap > this.screenTime / COARSE_SAMPLES;
  }

  /** Tetik sinyalinin frekansı (son kesimlerden, Hz); kesim yoksa ya da eskiyse null. */
  triggerFrequency(): number | null {
    const c = this.crossings;
    if (c.length < 2 || !this.fresh()) return null;
    return (c.length - 1) / (c[c.length - 1]! - c[0]!);
  }

  /** Son tetik kesimi yakın zamanda mı (sinyal hâlâ periyodik mi). */
  private fresh(): boolean {
    const c = this.crossings;
    const now = this.previous?.t;
    if (c.length === 0 || now === undefined) return false;
    const period = c.length >= 2 ? (c[c.length - 1]! - c[0]!) / (c.length - 1) : 0;
    return now - c[c.length - 1]! <= 3 * Math.max(period, this.screenTime);
  }

  /** Gösterilecek son tamamlanmış yakalama (kova 0 = tetik anı); yoksa ya da sinyal durduysa null. */
  trace(): ScopeRecorder | null {
    return this.captured && this.fresh() ? this.captured.rec : null;
  }
}
