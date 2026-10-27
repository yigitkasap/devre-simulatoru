// Osiloskop ekranının içeriği: kayıttan (sim/scope.ts) gösterilecek pencereyi seçer (tetikleme),
// iki kanalın çizgisini ve ölçümlerini hazırlar. Saf fonksiyonlar; arayüzden bağımsız test edilir.
//
// X-Y kipinde son bir ekran süresindeki (10 · zaman/bölme) ölçümler, A yatay ve B dikey eksende
// noktalar olarak çizilir: diyot ve transistör karakteristikleri böyle görülür. B kanalı ters
// çevrilebilir (akım ölçme direnci ters yönde bağlıysa); ters çevirme çizime ve ölçümlere uygulanır.
//
// Tetikleme (otomatik kip): tetik kanalının son birkaç ekranlık kaydında orta seviye
// ((en küçük + en büyük) / 2) bulunur; sinyalin bu seviyeyi yukarı doğru kestiği en son an,
// ardından tam bir ekranlık kayıt varsa ekranın sol kenarı olur. Böylece periyodik bir sinyal
// ekranda durur. Kesim yoksa (DC ya da çok yavaş sinyal) ekran en son kaydı kaydırarak gösterir.
//
// Ekran sinyalin periyodundan kısaysa (geçmişte kesim yok) ya da geçmiş, motorun adımlarına göre
// ekranı çizmeye yetmeyecek kadar seyrekse, kaydın tetikli yakalaması (sim/scope.ts) gösterilir:
// tetik anından başlayan, ince adımlarla çözülmüş bir ekran.

import type { ScopeSettings } from '../sim/devices/oscilloscope';
import { TIME_PER_DIV_STEPS, VOLTS_PER_DIV_STEPS } from '../sim/devices/oscilloscope';
import { SCOPE_BUCKETS, SCOPE_DIVISIONS_X, SCOPE_DIVISIONS_Y, type ScopeRecorder } from '../sim/scope';

/** Ekranın çizim birimleri: bir bölme 50 birim. */
export const SCREEN_DIV = 50;
export const SCREEN_W = SCOPE_DIVISIONS_X * SCREEN_DIV;
export const SCREEN_H = SCOPE_DIVISIONS_Y * SCREEN_DIV;

/** Tetikleme seviyesinin çevresindeki ölü bant (sinyalin tepe-tepe değerine oranı). */
const HYSTERESIS = 0.1;

export interface ChannelStats {
  readonly max: number;
  readonly min: number;
  readonly peakToPeak: number;
  readonly mean: number;
  readonly rms: number;
  /** Frekans (Hz); periyodik değilse null. */
  readonly frequency: number | null;
}

export interface ScopeChannelView {
  readonly connected: boolean;
  /** SVG yol tanımı (ekran birimlerinde); çizilecek bir şey yoksa boş. */
  readonly path: string;
  readonly stats: ChannelStats | null;
}

export interface ScopeView {
  readonly channels: readonly [ScopeChannelView, ScopeChannelView];
  /** Ekran bir tetik anına kilitlendi mi (yoksa kayıyor). */
  readonly triggered: boolean;
  /** X-Y kipinde A–B eğrisi (ekran birimlerinde); Y-t kipinde boş. */
  readonly xyPath: string;
}

type Channel = 0 | 1;

/**
 * Bir kanalın kovaları, ters çevirme uygulanmış olarak: ters çevrilen kanalda değerlerin işareti
 * değişir, en küçük ile en büyük yer değiştirir.
 */
interface ChannelData {
  readonly min: (s: number) => number;
  readonly max: (s: number) => number;
  readonly last: (s: number) => number;
}

function channelData(rec: ScopeRecorder, channel: Channel, inverted: boolean): ChannelData {
  const { min, max, last } = rec.channels[channel];
  return inverted
    ? { min: (s) => -max[s]!, max: (s) => -min[s]!, last: (s) => -last[s]! }
    : { min: (s) => min[s]!, max: (s) => max[s]!, last: (s) => last[s]! };
}

/** Kayıt aralığındaki `last` değerlerinin en küçüğü/en büyüğü. */
function range(rec: ScopeRecorder, data: ChannelData, from: number, to: number): { lo: number; hi: number } {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let k = from; k < to; k++) {
    const v = data.last(rec.slot(k));
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}

/**
 * [from, to) aralığında sinyalin orta seviyeyi yukarı doğru kestiği kovalar. Kesim, seviyenin
 * altındaki ölü bandın altına inildikten sonra sayılır (gürültüde art arda tetiklenmesin).
 * Dönen değerler kesimin kova cinsinden (kesirli) konumudur.
 */
function risingCrossings(rec: ScopeRecorder, data: ChannelData, from: number, to: number): number[] {
  const { lo, hi } = range(rec, data, from, to);
  const span = hi - lo;
  if (!(span > 1e-9 * Math.max(1, Math.abs(hi), Math.abs(lo)))) return [];
  const level = (lo + hi) / 2;
  const armLevel = level - HYSTERESIS * span;
  const result: number[] = [];
  let armed = false;
  for (let k = from + 1; k < to; k++) {
    const previous = data.last(rec.slot(k - 1));
    const current = data.last(rec.slot(k));
    if (previous <= armLevel) armed = true;
    if (armed && previous < level && current >= level) {
      result.push(k - 1 + (level - previous) / (current - previous));
      armed = false;
    }
  }
  return result;
}

function frequencyOf(rec: ScopeRecorder, data: ChannelData): number | null {
  const crossings = risingCrossings(rec, data, rec.start, rec.end);
  if (crossings.length < 2) return null;
  const first = crossings[0]!;
  const last = crossings[crossings.length - 1]!;
  return (crossings.length - 1) / ((last - first) * rec.bucketTime);
}

/** Gösterilecek pencerenin ilk kovası ve tetiklenip tetiklenmediği. */
function windowStart(rec: ScopeRecorder, data: ChannelData | null): { start: number; triggered: boolean } {
  const latest = rec.end - SCOPE_BUCKETS;
  if (data !== null && latest > rec.start) {
    // Kesim, ardından tam bir ekranlık kayıt kalacak kadar önce olmalı.
    const from = Math.max(rec.start, rec.end - 3 * SCOPE_BUCKETS);
    const crossings = risingCrossings(rec, data, from, latest + 1);
    const trigger = crossings[crossings.length - 1];
    if (trigger !== undefined) return { start: Math.ceil(trigger), triggered: true };
  }
  return { start: Math.max(rec.start, latest), triggered: false };
}

function channelView(
  rec: ScopeRecorder,
  data: ChannelData,
  start: number,
  voltsPerDiv: number,
  position: number,
  draw: boolean,
  /** Kaydın tetik izlemesinden gelen frekans (geçmişte iki kesim yoksa kullanılır). */
  fallbackFrequency: number | null = null,
): ScopeChannelView {
  const end = Math.min(rec.end, start + SCOPE_BUCKETS);
  if (end <= start) return { connected: true, path: '', stats: null };
  const dx = SCREEN_W / SCOPE_BUCKETS;
  const toY = (v: number) => {
    const y = SCREEN_H / 2 - (v / voltsPerDiv + position) * SCREEN_DIV;
    return Math.min(SCREEN_H + 2, Math.max(-2, y));
  };
  const parts: string[] = [];
  let previousY: number | null = null;
  let hi = Number.NEGATIVE_INFINITY;
  let lo = Number.POSITIVE_INFINITY;
  let sum = 0;
  let sumSquares = 0;
  for (let k = start; k < end; k++) {
    const s = rec.slot(k);
    const max = data.max(s);
    const min = data.min(s);
    const last = data.last(s);
    if (draw) {
      const x = ((k - start) * dx).toFixed(1);
      const yMax = toY(max);
      const yMin = toY(min);
      const command = parts.length === 0 ? 'M' : 'L';
      if (Math.abs(yMin - yMax) < 0.75) {
        const y = toY(last);
        parts.push(`${command}${x},${y.toFixed(1)}`);
        previousY = y;
      } else {
        // Kovanın içinde sinyal hızla değişmiş: en küçükten en büyüğe dikey çizgi (önceki noktaya yakın uçtan).
        const nearMax = previousY !== null && Math.abs(previousY - yMax) < Math.abs(previousY - yMin);
        const first: number = nearMax ? yMax : yMin;
        const second: number = nearMax ? yMin : yMax;
        parts.push(`${command}${x},${first.toFixed(1)} L${x},${second.toFixed(1)}`);
        previousY = second;
      }
    }
    hi = Math.max(hi, max);
    lo = Math.min(lo, min);
    sum += last;
    sumSquares += last * last;
  }
  const n = end - start;
  return {
    connected: true,
    path: parts.join(' '),
    stats: {
      max: hi,
      min: lo,
      peakToPeak: hi - lo,
      mean: sum / n,
      rms: Math.sqrt(sumSquares / n),
      frequency: frequencyOf(rec, data) ?? fallbackFrequency,
    },
  };
}

/** X-Y eğrisi: son bir ekran süresindeki (A, B) noktaları. */
function xyPath(rec: ScopeRecorder, a: ChannelData, b: ChannelData, settings: ScopeSettings): string {
  const start = Math.max(rec.start, rec.end - SCOPE_BUCKETS);
  const toX = (v: number) => Math.min(SCREEN_W + 2, Math.max(-2, SCREEN_W / 2 + (v / settings.voltsPerDiv[0] + settings.position[0]) * SCREEN_DIV));
  const toY = (v: number) => Math.min(SCREEN_H + 2, Math.max(-2, SCREEN_H / 2 - (v / settings.voltsPerDiv[1] + settings.position[1]) * SCREEN_DIV));
  const parts: string[] = [];
  for (let k = start; k < rec.end; k++) {
    const s = rec.slot(k);
    parts.push(`${parts.length === 0 ? 'M' : 'L'}${toX(a.last(s)).toFixed(1)},${toY(b.last(s)).toFixed(1)}`);
  }
  return parts.join(' ');
}

/**
 * Gösterilecek tetikli yakalama: geçmişte tetik bulunamadıysa ya da geçmiş ekranı çizmeye
 * yetmeyecek kadar seyrekse (adım ekrana göre büyük) son yakalama; yoksa null.
 */
function capturedTrace(rec: ScopeRecorder, historyTriggered: boolean): ScopeRecorder | null {
  if (historyTriggered && !rec.coarse) return null;
  const trace = rec.trace();
  return trace && trace.end - trace.start >= SCOPE_BUCKETS ? trace : null;
}

const EMPTY_CHANNEL: ScopeChannelView = { connected: false, path: '', stats: null };

/** Kayıttan ekran görüntüsü: tetikleme, iki kanalın çizgisi ve ölçümleri. */
export function buildScopeView(
  rec: ScopeRecorder,
  settings: ScopeSettings,
  connected: readonly [boolean, boolean],
): ScopeView {
  const data = [channelData(rec, 0, false), channelData(rec, 1, settings.invertB)] as const;
  if (settings.mode === 'xy') {
    // X-Y: son ekran süresi; ölçümler de o pencereden.
    const start = Math.max(rec.start, rec.end - SCOPE_BUCKETS);
    const view = (channel: Channel) =>
      connected[channel]
        ? channelView(rec, data[channel], start, settings.voltsPerDiv[channel], settings.position[channel], false)
        : EMPTY_CHANNEL;
    const both = connected[0] && connected[1] && rec.end > rec.start;
    return { channels: [view(0), view(1)], triggered: false, xyPath: both ? xyPath(rec, data[0], data[1], settings) : '' };
  }
  if (settings.mode === 'add') {
    // ADD: tek çizgi A + B (B ters çevrilmişse A − B), A'nın volt/bölme ve konumuyla; tetik bu toplamdan.
    if (!connected[0] && !connected[1]) return { channels: [EMPTY_CHANNEL, EMPTY_CHANNEL], triggered: false, xyPath: '' };
    const [a, b] = data;
    const sum: ChannelData = {
      min: (s) => a.min(s) + b.min(s),
      max: (s) => a.max(s) + b.max(s),
      last: (s) => a.last(s) + b.last(s),
    };
    const history = windowStart(rec, sum);
    const trace = capturedTrace(rec, history.triggered);
    const frequency = rec.triggerFrequency();
    if (trace) {
      const [ta, tb] = [channelData(trace, 0, false), channelData(trace, 1, settings.invertB)];
      const traceSum: ChannelData = {
        min: (s) => ta.min(s) + tb.min(s),
        max: (s) => ta.max(s) + tb.max(s),
        last: (s) => ta.last(s) + tb.last(s),
      };
      return {
        channels: [channelView(trace, traceSum, trace.start, settings.voltsPerDiv[0], settings.position[0], true, frequency), EMPTY_CHANNEL],
        triggered: true,
        xyPath: '',
      };
    }
    return {
      channels: [channelView(rec, sum, history.start, settings.voltsPerDiv[0], settings.position[0], true, frequency), EMPTY_CHANNEL],
      triggered: history.triggered,
      xyPath: '',
    };
  }
  const preferred: Channel = settings.trigger === 'B' ? 1 : 0;
  const triggerChannel: Channel | null = connected[preferred] ? preferred : connected[1 - preferred] ? ((1 - preferred) as Channel) : null;
  const history = windowStart(rec, triggerChannel === null ? null : data[triggerChannel]);
  const trace = triggerChannel === null ? null : capturedTrace(rec, history.triggered);
  const source = trace ?? rec;
  const start = trace ? trace.start : history.start;
  const sourceData = trace ? ([channelData(trace, 0, false), channelData(trace, 1, settings.invertB)] as const) : data;
  const view = (channel: Channel) =>
    connected[channel]
      ? channelView(
          source,
          sourceData[channel],
          start,
          settings.voltsPerDiv[channel],
          settings.position[channel],
          true,
          channel === triggerChannel ? rec.triggerFrequency() : null,
        )
      : EMPTY_CHANNEL;
  return { channels: [view(0), view(1)], triggered: trace !== null || history.triggered, xyPath: '' };
}

/** Değeri karşılayan en küçük adım (1-2-5 dizisi); hiçbiri yetmezse en büyüğü. */
function stepAtLeast(steps: readonly number[], value: number): number {
  return steps.find((s) => s >= value * (1 - 1e-9)) ?? steps[steps.length - 1]!;
}

export interface AutoSetFallback {
  /** Devredeki kaynağın frekansı (varsa kayıttaki ölçüme tercih edilir); yoksa null. */
  readonly frequency: number | null;
  /** Kayıt yoksa kullanılacak tepe gerilimi (ör. devredeki en büyük kaynak gerilimi). */
  readonly peak: number | null;
}

/**
 * "Oto" düğmesi: ekranda yaklaşık 2,5 periyot görünecek bölme süresi ve sinyalin dikeyde
 * ±3,5 bölmeye sığacağı volt/bölme seçer; kanalların konumu sıfırlanır.
 */
export function autoSettings(
  rec: ScopeRecorder | null,
  settings: ScopeSettings,
  connected: readonly [boolean, boolean],
  fallback: AutoSetFallback,
): Record<string, number> {
  const patch: Record<string, number> = { positionA: 0, positionB: 0 };
  const hasData = rec !== null && rec.end > rec.start;
  const triggerChannel: Channel = settings.trigger === 'B' && connected[1] ? 1 : connected[0] ? 0 : 1;
  // Devrede bir kaynağın frekansı biliniyorsa o esas alınır: frekans yeni değiştirildiyse kayıtta
  // hâlâ eski sinyal vardır.
  const frequency =
    fallback.frequency ??
    (hasData ? (frequencyOf(rec, channelData(rec, triggerChannel, triggerChannel === 1 && settings.invertB)) ?? rec.triggerFrequency()) : null);
  if (frequency !== null && frequency > 0) {
    patch.timePerDiv = stepAtLeast(TIME_PER_DIV_STEPS, 2.5 / frequency / SCOPE_DIVISIONS_X);
  }
  (['A', 'B'] as const).forEach((name, index) => {
    const channel = index as Channel;
    let peak: number | null = fallback.peak;
    if (hasData && connected[channel]) {
      const { lo, hi } = range(rec, channelData(rec, channel, false), rec.start, rec.end);
      peak = Math.max(Math.abs(lo), Math.abs(hi));
    }
    if (peak !== null && peak > 1e-6) patch[`voltsPerDiv${name}`] = stepAtLeast(VOLTS_PER_DIV_STEPS, peak / 3.5);
  });
  return patch;
}
