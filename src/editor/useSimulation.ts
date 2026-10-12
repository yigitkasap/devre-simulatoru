// Simülasyon döngüsü: Oynat / Duraklat / Durdur, her animasyon karesinde motoru ilerletme ve
// tuvalde gösterilecek değerleri (kablo gerilimleri, akımlar, LED parlaklığı...) hazırlama.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wireKey, type Connectivity } from '../model/connectivity';
import { solveFlows, type FlowGraph } from '../model/flow';
import { structureKey } from '../model/serialize';
import type { CircuitDoc } from '../model/types';
import { CircuitSimulator, type DeviceStatus, type Diagnostic, type Measurement } from '../sim';
import type { LiveVisual } from './symbols';

export type SimStatus = 'stopped' | 'running' | 'paused';

export interface PartFlow {
  /** Pin 0'dan pin 1'e akan akım (A). */
  readonly current: number;
  /** Animasyon noktalarının konumu (dünya pikseli). */
  readonly phase: number;
}

/** Bir animasyon karesinde tuvale aktarılan değerler. */
export interface SimFrame {
  readonly time: number;
  /** Renk ölçeği: devredeki en büyük kaynak gerilimi. */
  readonly vmax: number;
  readonly wireVoltages: ReadonlyMap<string, number>;
  /** Akım çizgesindeki her kablo parçasının akımı ve nokta konumu. */
  readonly segmentFlows: Float64Array;
  readonly segmentPhases: Float64Array;
  readonly partFlows: ReadonlyMap<string, PartFlow>;
  readonly live: ReadonlyMap<string, LiveVisual>;
  readonly measurements: ReadonlyMap<string, Measurement>;
  readonly statuses: ReadonlyMap<string, DeviceStatus>;
  /** Simülasyon sırasında oluşan uyarılar (kısa devre, yanmış LED). */
  readonly runtime: readonly Diagnostic[];
  /** Kısa devre olan pillerin kimlikleri (kırmızı yanıp sönen çerçeve). */
  readonly alarms: ReadonlySet<string>;
}

export type SimNotice =
  | { readonly kind: 'error'; readonly diagnostic: Diagnostic }
  | { readonly kind: 'stopped-by-edit' }
  | null;

export interface SimulationApi {
  readonly status: SimStatus;
  readonly frame: SimFrame | null;
  readonly notice: SimNotice;
  readonly speed: number;
  readonly setSpeed: (speed: number) => void;
  readonly play: () => void;
  readonly pause: () => void;
  readonly stop: () => void;
  /** Yanmış bir LED'i onarır. */
  readonly repair: (partId: string) => void;
}

/**
 * Bu akımın altında noktalar hareketsiz kalır: ters diyot sızıntısı ve gmin kaynaklı
 * 10⁻¹¹ A düzeyindeki akımlar gösterilmez, voltmetrenin çektiği µA düzeyindeki akım gösterilir.
 */
export const MIN_ANIMATED_CURRENT = 10e-9;

/**
 * Akım noktalarının hızı (dünya pikseli/saniye), logaritmik ölçek:
 * 1 µA ≈ 8, 1 mA ≈ 74, 1 A ≈ 140 piksel/s; böylece hem µA hem A düzeyi görülebilir.
 * Simülasyon hızı ayarından bağımsızdır: yalnızca akımın büyüklüğünü gösterir.
 */
export function dotSpeed(current: number): number {
  const abs = Math.abs(current);
  if (abs < MIN_ANIMATED_CURRENT) return 0;
  return Math.min(150, Math.max(4, 8 + 22 * Math.log10(abs / 1e-6)));
}

/** Bir karede atılabilecek en fazla zaman adımı (yavaş bilgisayarda donmayı önler). */
const MAX_STEPS_PER_FRAME = 6000;
/** Gerçek zamanlı kare süresinin üst sınırı: sekme arka planda kalınca büyük sıçramaları önler. */
const MAX_FRAME_SECONDS = 0.1;

export function useSimulation(
  doc: CircuitDoc,
  connectivity: Connectivity,
  flowGraph: FlowGraph,
  electronFlow: boolean,
): SimulationApi {
  const simRef = useRef<CircuitSimulator | null>(null);
  const [status, setStatusState] = useState<SimStatus>('stopped');
  const statusRef = useRef<SimStatus>('stopped');
  const [frame, setFrame] = useState<SimFrame | null>(null);
  const [notice, setNotice] = useState<SimNotice>(null);
  const [speed, setSpeedState] = useState(1);
  const speedRef = useRef(1);
  const structure = useMemo(() => structureKey(doc), [doc]);
  const startedStructure = useRef<string | null>(null);
  const phases = useRef({ segments: new Float64Array(0), parts: new Map<string, number>() });

  const latest = useRef({ doc, connectivity, flowGraph, electronFlow, structure });
  latest.current = { doc, connectivity, flowGraph, electronFlow, structure };

  const setStatus = useCallback((next: SimStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  /** Motorun şu anki durumundan bir kare hazırlar; noktaları dtReal kadar ilerletir. */
  const buildFrame = useCallback((sim: CircuitSimulator, dtReal: number): SimFrame => {
    const { doc: d, flowGraph: graph, electronFlow: electrons } = latest.current;
    const vmax = Math.max(sim.maxSourceVoltage(), 1e-6);
    const direction = electrons ? -1 : 1;

    const wireVoltages = new Map<string, number>();
    for (const wire of d.wires) {
      const v = sim.voltageAt(wireKey(wire.id));
      if (v !== null) wireVoltages.set(wire.id, v);
    }
    const measurements = new Map<string, Measurement>();
    const types = new Map<string, string>();
    for (const part of d.parts) {
      types.set(part.id, part.type);
      const m = sim.measure(part.id);
      if (m) measurements.set(part.id, m);
    }

    const flows = solveFlows(graph, (id, pin) => {
      if (types.get(id) === 'ground') return null;
      const m = measurements.get(id);
      if (!m) return null;
      return pin === 0 ? m.current : -m.current;
    });
    const ph = phases.current;
    if (ph.segments.length !== flows.length) ph.segments = new Float64Array(flows.length);
    for (let i = 0; i < flows.length; i++) {
      const f = flows[i]!;
      ph.segments[i] = (ph.segments[i]! + direction * Math.sign(f) * dotSpeed(f) * dtReal) % 1e6;
    }

    const partFlows = new Map<string, PartFlow>();
    const live = new Map<string, LiveVisual>();
    const statuses = new Map<string, DeviceStatus>();
    const alarms = new Set<string>();
    for (const part of d.parts) {
      const m = measurements.get(part.id);
      if (!m || part.type === 'ground') continue;
      const status = sim.status(part.id);
      statuses.set(part.id, status);
      if (status.shortCircuit) alarms.add(part.id);
      const phase = ((ph.parts.get(part.id) ?? 0) + direction * Math.sign(m.current) * dotSpeed(m.current) * dtReal) % 1e6;
      ph.parts.set(part.id, phase);
      partFlows.set(part.id, { current: m.current, phase });
      if (part.type === 'led') {
        live.set(part.id, {
          brightness: status.brightness ?? 0,
          burned: status.burned ?? false,
          overCurrent: status.overCurrent ?? false,
        });
      } else if (part.type === 'capacitor') {
        live.set(part.id, { charge: m.voltage / vmax });
      }
    }

    return {
      time: sim.time,
      vmax,
      wireVoltages,
      segmentFlows: flows,
      segmentPhases: Float64Array.from(ph.segments),
      partFlows,
      live,
      measurements,
      statuses,
      runtime: sim.runtimeDiagnostics,
      alarms,
    };
  }, []);

  const stop = useCallback(() => {
    simRef.current = null;
    startedStructure.current = null;
    phases.current = { segments: new Float64Array(0), parts: new Map() };
    setStatus('stopped');
    setFrame(null);
    setNotice(null);
  }, [setStatus]);

  const play = useCallback(() => {
    setNotice(null);
    let sim = simRef.current;
    if (!sim) {
      // Yeni simülasyon: LED'ler onarılmış, kondansatörler başlangıç geriliminde başlar.
      sim = new CircuitSimulator(latest.current.connectivity.netlist);
      simRef.current = sim;
      startedStructure.current = latest.current.structure;
    }
    if (!sim.canRun) {
      const error = sim.topologyDiagnostics.find((d) => d.severity === 'error');
      if (error) setNotice({ kind: 'error', diagnostic: error });
      if (statusRef.current === 'stopped') simRef.current = null;
      return;
    }
    setStatus('running');
  }, [setStatus]);

  const pause = useCallback(() => {
    if (statusRef.current === 'running') setStatus('paused');
  }, [setStatus]);

  const repair = useCallback(
    (partId: string) => {
      const sim = simRef.current;
      if (!sim?.repair(partId)) return;
      // Duraklatılmışsa sonucu hemen göster (LED aşırı akımda yeniden yanabilir).
      if (statusRef.current === 'paused') {
        sim.advance(0);
        setFrame(buildFrame(sim, 0));
      }
    },
    [buildFrame],
  );

  const setSpeed = useCallback((value: number) => {
    speedRef.current = value;
    setSpeedState(value);
  }, []);

  // Devrenin yapısı değişirse (parça/kablo eklenip silinirse ya da taşınırsa) simülasyon durur.
  useEffect(() => {
    if (simRef.current && startedStructure.current !== structure) {
      stop();
      setNotice({ kind: 'stopped-by-edit' });
    }
  }, [structure, stop]);

  // Yalnızca değerler değiştiyse (direnç değeri, anahtar...) simülasyon durumunu koruyarak güncellenir.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim || startedStructure.current !== latest.current.structure) return;
    sim.update(connectivity.netlist);
    if (!sim.canRun) {
      const error = sim.topologyDiagnostics.find((d) => d.severity === 'error');
      setStatus('paused');
      if (error) setNotice({ kind: 'error', diagnostic: error });
      return;
    }
    if (statusRef.current === 'paused') {
      const result = sim.advance(0);
      setFrame(buildFrame(sim, 0));
      if (!result.ok && result.error) setNotice({ kind: 'error', diagnostic: result.error });
    }
  }, [connectivity, buildFrame, setStatus]);

  // Animasyon döngüsü
  useEffect(() => {
    if (status !== 'running') return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const sim = simRef.current;
      if (!sim) return;
      const dtReal = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
      last = now;
      const simDt = dtReal * speedRef.current;
      const maxSteps = Math.min(MAX_STEPS_PER_FRAME, Math.ceil(simDt / sim.timeStep) * 4 + 8);
      const result = sim.advance(simDt, maxSteps);
      if (!result.ok) {
        setStatus('paused');
        if (result.error) setNotice({ kind: 'error', diagnostic: result.error });
        setFrame(buildFrame(sim, 0));
        return;
      }
      setFrame(buildFrame(sim, dtReal));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, buildFrame, setStatus]);

  return { status, frame, notice, speed, setSpeed, play, pause, stop, repair };
}
