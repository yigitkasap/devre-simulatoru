// Simülasyonun sesi (hoparlör ve aktif buzzer), tarayıcının WebAudio arayüzüyle. Her karede
// simülasyonun ilerlediği aralığın sesi hazırlanıp çalma sırasına eklenir (küçük bir gecikmeyle):
//   - hoparlör: C_mes'in akımı (zarın ivmesi, yani ses basıncı) adım adım kaydedilir ve ses kartının
//     örnekleme hızına doğrusal aradeğerle çevrilir; 1 W'lık (1 kHz) ses tepe değeri 0,35'tir.
//   - aktif buzzer: içindeki osilatör simülasyonda yoktur; uç gerilimi ≥ 3 V iken 2400 Hz'lik ton
//     üretilir, genliği gerilimle orantılı.
// Ses yalnızca simülasyon gerçek zamanda (×1) çalışırken çalınır: yavaş çekimde ses perdesi de
// kayardı. Tarayıcılar sesi ancak bir kullanıcı etkileşiminden sonra açar (Oynat düğmesi).

import { BUZZER, buzzerLevel, BuzzerDevice, SpeakerDevice, SPEAKER_REFERENCE_CURRENT, type SoundSample } from '../sim/devices';
import type { Device } from '../sim/devices';

/** Sesin sıraya eklendiği gecikme (s): kare süresindeki dalgalanma boşluk bırakmasın. */
const LATENCY = 0.09;
const SPEAKER_GAIN = 0.35;
const BUZZER_GAIN = 0.22;

/** Örnek dizisinden t anındaki değer (doğrusal aradeğer; dizinin dışında uçtaki değer). */
function sampleAt(samples: readonly SoundSample[], t: number, from: { i: number }): number {
  if (samples.length === 0) return 0;
  let i = from.i;
  while (i + 1 < samples.length && samples[i + 1]!.t <= t) i++;
  from.i = i;
  const a = samples[i]!;
  const b = samples[i + 1];
  if (!b || t <= a.t) return a.v;
  return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
}

/** Çalınmış örnekleri atar; aradeğer için `t`'den önceki son örnek kalır. */
function drain(samples: SoundSample[], t: number): void {
  let keep = 0;
  while (keep + 1 < samples.length && samples[keep + 1]!.t <= t) keep++;
  if (keep > 0) samples.splice(0, keep);
}

export class SimAudio {
  private ctx: AudioContext | null = null;
  /** Bir sonraki parçanın çalınacağı ses zamanı ve son parçanın bittiği simülasyon zamanı. */
  private cursor = 0;
  private lastTime: number | null = null;
  private buzzerPhase = new Map<string, number>();

  /** Kullanıcı etkileşiminde (Oynat) çağrılır: ses bağlamı kurulur ya da sürdürülür. */
  unlock(): void {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return;
    try {
      if (!this.ctx) this.ctx = new window.AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  /** Sesi kesip sırayı sıfırlar (durdurma, hız değişimi). */
  reset(): void {
    this.lastTime = null;
    this.buzzerPhase.clear();
  }

  /**
   * Simülasyonun son çağrıdan bu yana geçen aralığının sesini sıraya ekler. `enabled` değilse
   * (ses kapalı, hız ×1 değil, simülasyon yetişemiyor) örnekler atılır.
   */
  render(devices: readonly Device[], time: number, enabled: boolean): void {
    const speakers = devices.filter((d): d is SpeakerDevice => d instanceof SpeakerDevice);
    const buzzers = devices.filter((d): d is BuzzerDevice => d instanceof BuzzerDevice);
    if (speakers.length === 0 && buzzers.length === 0) {
      this.lastTime = time;
      return;
    }
    const ctx = this.ctx;
    const t0 = this.lastTime;
    this.lastTime = time;
    const dur = t0 === null ? 0 : time - t0;
    if (!ctx || !enabled || ctx.state !== 'running' || t0 === null || dur <= 0 || dur > 0.25) {
      for (const d of [...speakers, ...buzzers]) drain(d.sound, time);
      return;
    }
    const rate = ctx.sampleRate;
    const n = Math.round(dur * rate);
    if (n <= 0) return;
    const out = new Float32Array(n);
    for (const speaker of speakers) {
      const from = { i: 0 };
      const scale = SPEAKER_GAIN / SPEAKER_REFERENCE_CURRENT;
      for (let k = 0; k < n; k++) out[k]! += scale * sampleAt(speaker.sound, t0 + (k + 0.5) / rate, from);
      drain(speaker.sound, time);
    }
    for (const buzzer of buzzers) {
      const from = { i: 0 };
      let phase = this.buzzerPhase.get(buzzer.id) ?? 0;
      const step = (2 * Math.PI * BUZZER.frequency) / rate;
      for (let k = 0; k < n; k++) {
        const level = buzzerLevel(sampleAt(buzzer.sound, t0 + (k + 0.5) / rate, from));
        // Manyetik buzzerin diyaframı rezonansta titrer: temel frekans ve biraz üçüncü harmonik.
        if (level > 0) out[k]! += BUZZER_GAIN * level * (Math.sin(phase) + 0.25 * Math.sin(3 * phase));
        phase = (phase + step) % (2 * Math.PI);
      }
      this.buzzerPhase.set(buzzer.id, phase);
      drain(buzzer.sound, time);
    }
    for (let k = 0; k < n; k++) out[k] = Math.tanh(out[k]!);
    const buffer = ctx.createBuffer(1, n, rate);
    buffer.copyToChannel(out, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const now = ctx.currentTime;
    if (this.cursor < now + 0.01 || this.cursor > now + 0.5) this.cursor = now + LATENCY;
    source.start(this.cursor);
    this.cursor += n / rate;
  }
}
