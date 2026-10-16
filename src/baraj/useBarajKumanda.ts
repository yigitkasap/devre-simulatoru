// Baraj sayfasının kumanda mantığı (BN kartı, "Kumanda davranışı"): tek kumanda. Su akışı tankın mode
// özelliğini değiştirir; simülasyon hep çalışır, seviye kaldığı yerden sürer. Doldur %100'de, Boşalt
// %0'da kendiliğinden Durdur'a geçer. Kuru / Seviye 1–3: sayfa bir hedef tutar, doldurarak ya da
// boşaltarak gider, hedefi geçince durur (su atlamaz). Sürükleme bırakılınca seviye uygulanır ve akış
// durur. Başa al: su %20, akış Durdur, simülasyon baştan.

import { useEffect, useRef, useState } from 'react';
import type { PropValue } from '../sim/netlist';
import type { TankMode } from '../sim/devices/tank';
import { flowToward, START_LEVEL, STOP_TARGETS, targetReached, type Stop } from './seviye';

export interface KumandaApi {
  /** Gidilen hedef (%); yoksa null. */
  readonly target: number | null;
  readonly setFlow: (mode: TankMode) => void;
  /** Boşluk: akış varsa durdurur, duruyorsa son akışı sürdürür. */
  readonly toggleStop: () => void;
  readonly goTo: (stop: Stop | null) => void;
  /** Sürükleme ya da tuşla seçilen seviye: uygulanır, akış durur. */
  readonly commitLevel: (level: number) => void;
  readonly reset: () => void;
}

/**
 * Tankın `level` özelliği değişmezse motor anlık seviyeyi korur (adoptState). Aynı değer yeniden
 * istenirse (ör. iki kez %50'ye sürükleme) özellik görünmez bir payla değiştirilir ki su o seviyeye gelsin.
 */
export function forcedLevel(value: number, propsLevel: number): number {
  return Math.abs(value - propsLevel) < 1e-12 ? value + 1e-9 : value;
}

export function useBarajKumanda({
  level,
  propsLevel,
  mode,
  running,
  changeTank,
  restart,
}: {
  /** Anlık seviye (%). */
  level: number;
  /** Tankın `level` özelliği (simülasyonun başlangıç ya da en son uygulanan seviyesi). */
  propsLevel: number;
  mode: TankMode;
  running: boolean;
  changeTank: (patch: Record<string, PropValue>) => void;
  /** Simülasyonu baştan başlatır (zaman 0). */
  restart: () => void;
}): KumandaApi {
  const [target, setTarget] = useState<number | null>(null);
  const lastFlow = useRef<'fill' | 'drain'>('fill');

  // Her karede: hedef geçildiyse ya da hazne uca geldiyse dur.
  useEffect(() => {
    if (!running) return;
    if (target !== null) {
      if (mode === 'stop' || targetReached(level, target, mode)) {
        setTarget(null);
        if (mode !== 'stop') changeTank({ mode: 'stop', level: forcedLevel(target, propsLevel) });
      }
      return;
    }
    if ((mode === 'fill' && level >= 100 - 1e-6) || (mode === 'drain' && level <= 1e-6)) changeTank({ mode: 'stop' });
  }, [level, propsLevel, mode, running, target, changeTank]);

  const setFlow = (next: TankMode) => {
    setTarget(null);
    if (next !== 'stop') lastFlow.current = next;
    if (next === mode) return;
    if ((next === 'fill' && level >= 100 - 1e-6) || (next === 'drain' && level <= 1e-6)) {
      if (mode !== 'stop') changeTank({ mode: 'stop' });
      return;
    }
    changeTank({ mode: next });
  };

  return {
    target,
    setFlow,
    toggleStop: () => setFlow(mode === 'stop' ? lastFlow.current : 'stop'),
    goTo: (stop) => {
      if (stop === null) return;
      const goal = STOP_TARGETS[stop];
      const flow = flowToward(level, goal);
      if (flow === 'stop') {
        setTarget(null);
        if (mode !== 'stop') changeTank({ mode: 'stop' });
        return;
      }
      lastFlow.current = flow;
      setTarget(goal);
      if (flow !== mode) changeTank({ mode: flow });
    },
    commitLevel: (value) => {
      setTarget(null);
      changeTank({ level: forcedLevel(Math.min(100, Math.max(0, Math.round(value))), propsLevel), mode: 'stop' });
    },
    reset: () => {
      setTarget(null);
      changeTank({ level: START_LEVEL, mode: 'stop' });
      // Simülasyon baştan başlar: seviye özellikten okunur, pay gerekmez.
      restart();
    },
  };
}
