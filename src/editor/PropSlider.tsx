// Özellik alanının altındaki kaydırıcı (potansiyometrenin konumu, LDR'nin aydınlığı, NTC'nin sıcaklığı).
// Sürüklerken değer canlı uygulanır (geçmişe yazılmaz); bırakınca tek bir geri alma adımı olur.
// Logaritmik kaydırıcıda konum 0..1000, değer min·(max/min)^(konum/1000) (iki anlamlı basamak).

import { useState } from 'react';
import type { NumberPropDef } from '../model/catalog';
import { formatNumber } from '../sim/units';

const LOG_STEPS = 1000;

function niceRound(value: number): number {
  if (value <= 0) return 0;
  const digits = Math.floor(Math.log10(value));
  const unit = 10 ** (digits - 1);
  return Math.round(value / unit) * unit;
}

export function PropSlider({
  def,
  value,
  label,
  touch,
  onSlide,
}: {
  def: NumberPropDef;
  value: number;
  label: string;
  touch: boolean;
  /** Sürüklerken (done = false) ve bırakınca (done = true). */
  onSlide: (value: number, done: boolean) => void;
}) {
  const slider = def.slider!;
  const log = slider.log === true;
  const ratio = Math.log10(slider.max / slider.min);
  const toPos = (v: number) => (log ? (Math.log10(Math.max(slider.min, v) / slider.min) / ratio) * LOG_STEPS : v);
  const fromPos = (pos: number) => (log ? niceRound(slider.min * 10 ** ((pos / LOG_STEPS) * ratio)) : pos);
  const [drag, setDrag] = useState<number | null>(null);
  const position = drag ?? Math.min(log ? LOG_STEPS : slider.max, Math.max(log ? 0 : slider.min, toPos(value)));
  const shown = drag === null ? value : fromPos(drag);
  const finish = () => {
    if (drag === null) return;
    onSlide(fromPos(drag), true);
    setDrag(null);
  };
  return (
    <input
      type="range"
      min={log ? 0 : slider.min}
      max={log ? LOG_STEPS : slider.max}
      step={log ? 1 : (slider.step ?? 1)}
      value={position}
      aria-label={label}
      aria-valuetext={`${formatNumber(shown, shown < 10 ? 2 : 0)} ${def.unit}`.trim()}
      onChange={(e) => {
        const pos = Number(e.target.value);
        setDrag(pos);
        onSlide(fromPos(pos), false);
      }}
      onPointerUp={finish}
      onKeyUp={finish}
      onBlur={finish}
      className={`w-full accent-accent ${touch ? 'h-11' : 'h-7'}`}
    />
  );
}
