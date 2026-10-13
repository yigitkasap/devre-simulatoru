// Osiloskop ekranının içeriği: kayıttan (sim/scope.ts) gösterilecek pencereyi seçer (tetikleme),
// iki kanalın çizgisini ve ölçümlerini hazırlar. Saf fonksiyonlar; arayüzden bağımsız test edilir.
//
// Tetikleme (otomatik kip): tetik kanalının son birkaç ekranlık kaydında orta seviye
// ((en küçük + en büyük) / 2) bulunur; sinyalin bu seviyeyi yukarı doğru kestiği en son an,
// ardından tam bir ekranlık kayıt varsa ekranın sol kenarı olur. Böylece periyodik bir sinyal
// ekranda durur. Kesim yoksa (DC ya da çok yavaş sinyal) ekran en son kaydı kaydırarak gösterir.

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
}

type Channel = 0 | 1;

/** Kayıt aralığındaki bir kanalın `last` değerlerinin en küçüğü/en büyüğü. */
function range(rec: ScopeRecorder, channel: Channel, from: number, to: number): { lo: number; hi: number } {
  const last = rec.channels[channel].last;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let k = from; k < to; k++) {
    const v = last[rec.slot(k)]!;
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
function risingCrossings(rec: ScopeRecorder, channel: Channel, from: number, to: number): number[] {
  const { lo, hi } = range(rec, channel, from, to);
  const span = hi - lo;
  if (!(span > 1e-9 * Math.max(1, Math.abs(hi), Math.abs(lo)))) return [];
  const level = (lo + hi) / 2;
  const armLevel = level - HYSTERESIS * span;
  const last = rec.channels[channel].last;
  const result: number[] = [];
  let armed = false;
  for (let k = from + 1; k < to; k++) {
    const previous = last[rec.slot(k - 1)]!;
    const current = last[rec.slot(k)]!;
    if (previous <= armLevel) armed = true;
    if (armed && previous < level && current >= level) {
      result.push(k - 1 + (level - previous) / (current - previous));
      armed = false;
    }
  }
  return result;
}

function frequencyOf(rec: ScopeRecorder, channel: Channel): number | null {
  const crossings = risingCrossings(rec, channel, rec.start, rec.end);
  if (crossings.length < 2) return null;
  const first = crossings[0]!;
  const last = crossings[crossings.length - 1]!;
  return (crossings.length - 1) / ((last - first) * rec.bucketTime);
}

/** Gösterilecek pencerenin ilk kovası ve tetiklenip tetiklenmediği. */
function windowStart(rec: ScopeRecorder, channel: Channel | null): { start: number; triggered: boolean } {
  const latest = rec.end - SCOPE_BUCKETS;
  if (channel !== null && latest > rec.start) {
    // Kesim, ardından tam bir ekranlık kayıt kalacak kadar önce olmalı.
    const from = Math.max(rec.start, rec.end - 3 * SCOPE_BUCKETS);
    const crossings = risingCrossings(rec, channel, from, latest + 1);
    const trigger = crossings[crossings.length - 1];
    if (trigger !== undefined) return { start: Math.ceil(trigger), triggered: true };
  }
  return { start: Math.max(rec.start, latest), triggered: false };
}

function channelView(
  rec: ScopeRecorder,
  channel: Channel,
  start: number,
  voltsPerDiv: number,
  position: number,
): ScopeChannelView {
  const { min, max, last } = rec.channels[channel];
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
    const x = ((k - start) * dx).toFixed(1);
    const yMax = toY(max[s]!);
    const yMin = toY(min[s]!);
    const command = parts.length === 0 ? 'M' : 'L';
    if (Math.abs(yMin - yMax) < 0.75) {
      const y = toY(last[s]!);
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
    hi = Math.max(hi, max[s]!);
    lo = Math.min(lo, min[s]!);
    sum += last[s]!;
    sumSquares += last[s]! * last[s]!;
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
      frequency: frequencyOf(rec, channel),
    },
  };
}

const EMPTY_CHANNEL: ScopeChannelView = { connected: false, path: '', stats: null };

/** Kayıttan ekran görüntüsü: tetikleme, iki kanalın çizgisi ve ölçümleri. */
export function buildScopeView(
  rec: ScopeRecorder,
  settings: ScopeSettings,
  connected: readonly [boolean, boolean],
): ScopeView {
  const preferred: Channel = settings.trigger === 'B' ? 1 : 0;
  const triggerChannel: Channel | null = connected[preferred] ? preferred : connected[1 - preferred] ? ((1 - preferred) as Channel) : null;
  const { start, triggered } = windowStart(rec, triggerChannel);
  const view = (channel: Channel) =>
    connected[channel] ? channelView(rec, channel, start, settings.voltsPerDiv[channel], settings.position[channel]) : EMPTY_CHANNEL;
  return { channels: [view(0), view(1)], triggered };
}

/** Değeri karşılayan en küçük adım (1-2-5 dizisi); hiçbiri yetmezse en büyüğü. */
function stepAtLeast(steps: readonly number[], value: number): number {
  return steps.find((s) => s >= value * (1 - 1e-9)) ?? steps[steps.length - 1]!;
}

export interface AutoSetFallback {
  /** Kayıttan frekans bulunamazsa kullanılacak frekans (ör. devredeki AC kaynağın). */
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
  const frequency = (hasData ? frequencyOf(rec, triggerChannel) : null) ?? fallback.frequency;
  if (frequency !== null && frequency > 0) {
    patch.timePerDiv = stepAtLeast(TIME_PER_DIV_STEPS, 2.5 / frequency / SCOPE_DIVISIONS_X);
  }
  (['A', 'B'] as const).forEach((name, index) => {
    const channel = index as Channel;
    let peak: number | null = fallback.peak;
    if (hasData && connected[channel]) {
      const { lo, hi } = range(rec, channel, rec.start, rec.end);
      peak = Math.max(Math.abs(lo), Math.abs(hi));
    }
    if (peak !== null && peak > 1e-6) patch[`voltsPerDiv${name}`] = stepAtLeast(VOLTS_PER_DIV_STEPS, peak / 3.5);
  });
  return patch;
}
