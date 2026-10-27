// Simülasyon döngüsü: Oynat / Duraklat / Durdur, her animasyon karesinde motoru ilerletme ve
// tuvalde gösterilecek değerleri (kablo gerilimleri, akımlar, LED parlaklığı...) hazırlama.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pinKey, wireKey, type Connectivity } from '../model/connectivity';
import { solveFlows, type FlowGraph } from '../model/flow';
import { structureKey } from '../model/serialize';
import type { CircuitDoc } from '../model/types';
import { numProp } from '../sim/netlist';
import {
  CircuitSimulator,
  LED_NOMINAL_CURRENT,
  OscilloscopeDevice,
  ledBrightness,
  scopeSettings,
  type DeviceStatus,
  type Diagnostic,
  type Measurement,
  type ScopeRecorder,
} from '../sim';
import { SimAudio } from './audio';
import { IonPhases } from './ions';
import { LiveWindow, type LiveSummary } from './liveReadout';
import { buildScopeView, type ScopeView } from './scopeView';
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
  /** İzlenen parçaların son ölçüm penceresi (salınan değerlerin kararlı gösterimi için). */
  readonly summaries: ReadonlyMap<string, LiveSummary>;
  /** Simülasyon sırasında oluşan uyarılar (kısa devre, yanmış LED). */
  readonly runtime: readonly Diagnostic[];
  /** Kısa devre olan pillerin kimlikleri (kırmızı yanıp sönen çerçeve). */
  readonly alarms: ReadonlySet<string>;
  /** Osiloskopların ekran görüntüleri. */
  readonly scopes: ReadonlyMap<string, ScopeView>;
  /** Bu karede istenen simülasyon süresinin hepsi hesaplanamadı (hız, bilgisayara göre fazla). */
  readonly lagging: boolean;
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
  /** Çalışan simülasyondaki bir osiloskobun kaydı (Oto ayar için); yoksa null. */
  readonly scopeRecorder: (partId: string) => ScopeRecorder | null;
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

/** Bir karede atılabilecek zaman adımı bütçesi (yavaş bilgisayarda donmayı önler). */
const MAX_STEPS_PER_FRAME = 6000;
/**
 * Kare başına hesap süresi (ms): adım bütçesi dolduktan sonra da bu süre kaldıkça adım atılır
 * (en çok 4 katı). Küçük adım isteyen devre (yüksek frekanslı LC) bilgisayar yetiştirebildiği
 * sürece "yetişemiyor" uyarısı almaz; 60 Hz'lik karenin geri kalanı çizime kalır.
 */
const FRAME_COMPUTE_MS = 10;
/** Gerçek zamanlı kare süresinin üst sınırı: sekme arka planda kalınca büyük sıçramaları önler. */
const MAX_FRAME_SECONDS = 0.1;
/**
 * AC devrede LED parlaklığının gerçek zamandaki yumuşatma süresi (s): göz hızlı yanıp sönmeyi
 * ortalama bir parlaklık olarak görür. Yavaşlatılmış simülasyonda LED'in yanıp söndüğü yine görülür.
 */
const LED_PERSISTENCE = 0.06;
/** DC motorun tuvaldeki dönüşü gerçek hızının bu kadarda biri (8000 dev/dk ekranda ≈ 80 dev/dk). */
const MOTOR_VISUAL_RATIO = 100;

export function useSimulation(
  doc: CircuitDoc,
  connectivity: Connectivity,
  flowGraph: FlowGraph,
  electronFlow: boolean,
  /** Hoparlör ve buzzerin sesi çalınsın mı (Ayarlar). */
  sound = true,
  /** Canlı ölçümleri gösterilen parçalar: her adımda istatistikleri tutulur. */
  watched: readonly string[] = [],
): SimulationApi {
  const watchedRef = useRef(watched);
  watchedRef.current = watched;
  /** İzlenen parçaların ölçüm pencereleri. */
  const liveWindows = useRef(new Map<string, LiveWindow>());
  const simRef = useRef<CircuitSimulator | null>(null);
  const audio = useRef<SimAudio | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const [status, setStatusState] = useState<SimStatus>('stopped');
  const statusRef = useRef<SimStatus>('stopped');
  const [frame, setFrame] = useState<SimFrame | null>(null);
  const [notice, setNotice] = useState<SimNotice>(null);
  const [speed, setSpeedState] = useState(1);
  const speedRef = useRef(1);
  const structure = useMemo(() => structureKey(doc), [doc]);
  const startedStructure = useRef<string | null>(null);
  const phases = useRef({ segments: new Float64Array(0), parts: new Map<string, number>() });
  /** AC devrede LED'lerin yumuşatılmış parlaklığı. */
  const ledGlow = useRef(new Map<string, number>());
  /** Su haznelerinde iyonların sürüklenme konumları. */
  const ionPhases = useRef(new Map<string, IonPhases>());
  /** DC motorların görsel dönme açısı ve son karenin simülasyon zamanı. */
  const motorAngles = useRef(new Map<string, { angle: number; time: number }>());

  const latest = useRef({ doc, connectivity, flowGraph, electronFlow, structure });
  latest.current = { doc, connectivity, flowGraph, electronFlow, structure };

  const setStatus = useCallback((next: SimStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  /**
   * Motorun şu anki durumundan bir kare hazırlar; noktaları dtReal kadar ilerletir.
   * AC devrede kablo renkleri, akım noktaları ve LED parlaklığı karenin ortalamasından çizilir:
   * anlık değerler kare hızında örneklenince titrer ya da yanıltıcı biçimde yavaş dalgalanırdı.
   */
  const buildFrame = useCallback((sim: CircuitSimulator, dtReal: number, lagging = false): SimFrame => {
    const { doc: d, flowGraph: graph, electronFlow: electrons, connectivity: conn } = latest.current;
    const vmax = Math.max(sim.maxSourceVoltage(), 1e-6);
    const direction = electrons ? -1 : 1;
    const averaged = sim.hasAcSources;
    const voltageOf = (key: string) => (averaged ? sim.averageVoltageAt(key) : sim.voltageAt(key));

    const wireVoltages = new Map<string, number>();
    for (const wire of d.wires) {
      const v = voltageOf(wireKey(wire.id));
      if (v !== null) wireVoltages.set(wire.id, v);
    }
    const measurements = new Map<string, Measurement>();
    /** Uçlara giren akımlar (AC devrede karenin ortalaması). */
    const pinFlows = new Map<string, readonly number[]>();
    const types = new Map<string, string>();
    for (const part of d.parts) {
      types.set(part.id, part.type);
      const m = sim.measure(part.id);
      if (!m) continue;
      measurements.set(part.id, m);
      const pins = averaged ? sim.averagePinCurrents(part.id) : sim.pinCurrents(part.id);
      if (pins) pinFlows.set(part.id, pins);
    }
    const flowCurrents = new Map<string, number>();
    for (const [id, pins] of pinFlows) flowCurrents.set(id, pins[0] ?? 0);

    const flows = solveFlows(graph, (id, pin) => {
      if (types.get(id) === 'ground') return null;
      return pinFlows.get(id)?.[pin] ?? null;
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
    const scopes = new Map<string, ScopeView>();
    const glow = ledGlow.current;
    const smoothing = 1 - Math.exp(-dtReal / LED_PERSISTENCE);
    for (const part of d.parts) {
      const m = measurements.get(part.id);
      if (!m || part.type === 'ground') continue;
      const status = sim.status(part.id);
      statuses.set(part.id, status);
      if (status.shortCircuit) alarms.add(part.id);
      const current = flowCurrents.get(part.id) ?? m.current;
      const phase = ((ph.parts.get(part.id) ?? 0) + direction * Math.sign(current) * dotSpeed(current) * dtReal) % 1e6;
      ph.parts.set(part.id, phase);
      partFlows.set(part.id, { current, phase });
      if (part.type === 'led') {
        const burned = status.burned ?? false;
        let brightness = status.brightness ?? 0;
        let overCurrent = status.overCurrent ?? false;
        if (averaged && !burned) {
          const target = ledBrightness(current);
          const previous = glow.get(part.id);
          brightness = previous === undefined || dtReal === 0 ? target : previous + (target - previous) * smoothing;
          glow.set(part.id, brightness);
          overCurrent = current > LED_NOMINAL_CURRENT;
        }
        live.set(part.id, { brightness: burned ? 0 : brightness, burned, overCurrent });
      } else if (part.type === 'capacitor') {
        const a = voltageOf(pinKey(part.id, 0));
        const b = voltageOf(pinKey(part.id, 1));
        live.set(part.id, { charge: (averaged && a !== null && b !== null ? a - b : m.voltage) / vmax });
      } else if (part.type === 'resistor') {
        if (status.powerRatio !== undefined) live.set(part.id, { powerRatio: status.powerRatio });
      } else if (part.type === 'relay') {
        live.set(part.id, { energized: status.energized ?? false, field: current });
      } else if (part.type === 'timer555') {
        live.set(part.id, { high: status.timer?.high ?? false });
      } else if (part.type === 'arduino') {
        live.set(part.id, { ledL: status.arduino?.ledL ?? false, ledTx: status.arduino?.ledTx ?? false });
      } else if (part.type === 'speaker') {
        // Dalgaların koyuluğu ses basıncı düzeyinden: 44 dB'de görünür, 84 dB'de (1 W) tam.
        const spl = status.spl ?? 0;
        live.set(part.id, { loudness: Math.min(1, Math.max(0, (spl - 44) / 40)) });
      } else if (part.type === 'buzzer') {
        live.set(part.id, { loudness: status.sounding ? 1 : 0 });
      } else if (part.type === 'fuse') {
        live.set(part.id, { burned: status.burned ?? false });
      } else if (part.type === 'lamp') {
        live.set(part.id, { glow: status.glow ?? 0, burned: status.burned ?? false, ...(status.temperature !== undefined ? { temperature: status.temperature } : {}) });
      } else if (part.type === 'inductor') {
        live.set(part.id, { field: current });
      } else if (part.type === 'transformer') {
        // Çekirdeğin akısı N₁·i₁ + N₂·i₂ ile orantılı: birincile indirgenmiş akım i₁ + i₂ / n.
        const pins = pinFlows.get(part.id) ?? [];
        live.set(part.id, { field: (pins[0] ?? 0) + (pins[2] ?? 0) / Math.max(1e-3, numProp(part.props, 'turnsRatio', 16)) });
      } else if (part.type === 'motor') {
        // Mil gerçek hızının 1/MOTOR_VISUAL_RATIO'u ile döner (8000 dev/dk ekranda ≈ 80 dev/dk);
        // simülasyon zamanıyla ilerler, yavaş çekimde yavaşlar.
        const previous = motorAngles.current.get(part.id) ?? { angle: 0, time: sim.time };
        const angle = (previous.angle + ((status.motor?.speed ?? 0) / MOTOR_VISUAL_RATIO) * (sim.time - previous.time)) % (2 * Math.PI);
        motorAngles.current.set(part.id, { angle, time: sim.time });
        live.set(part.id, { angle });
      } else if (part.type === 'dcsupply') {
        live.set(part.id, { currentLimited: status.currentLimited ?? [] });
      } else if (part.type === 'tank') {
        // Suda akımı iyonlar taşır: katyonlar akım yönünde, anyonlar ters yönde (elektron akışı
        // seçeneğinden bağımsız; ikisi de gerçekten hareket eder).
        let phases = ionPhases.current.get(part.id);
        if (!phases) ionPhases.current.set(part.id, (phases = new IonPhases()));
        const ions = phases.advance(pinFlows.get(part.id) ?? status.probeCurrents ?? [], dtReal, dotSpeed);
        live.set(part.id, { ...(status.level !== undefined ? { level: status.level } : {}), ions });
      } else if (part.type === 'oscilloscope') {
        const device = sim.device(part.id);
        if (device instanceof OscilloscopeDevice) {
          const connected = [0, 1].map((pin) => !conn.unconnectedPins.has(pinKey(part.id, pin))) as [boolean, boolean];
          scopes.set(part.id, buildScopeView(device.recorder, scopeSettings(part.props), connected));
          // Ekran karede bir kez yakalanır: gösterildikten sonra kayıt bir sonraki tetiğe kurulur.
          device.recorder.perFrame = true;
          device.recorder.rearm();
        }
      }
    }

    const summaries = new Map<string, LiveSummary>();
    const windows = liveWindows.current;
    for (const id of [...windows.keys()]) if (!watchedRef.current.includes(id)) windows.delete(id);
    for (const id of watchedRef.current) {
      let w = windows.get(id);
      if (!w) windows.set(id, (w = new LiveWindow()));
      w.add(sim.watchedStats(id), dtReal);
      if (w.summary) summaries.set(id, w.summary);
    }

    return {
      time: sim.time,
      vmax,
      summaries,
      wireVoltages,
      segmentFlows: flows,
      segmentPhases: Float64Array.from(ph.segments),
      partFlows,
      live,
      measurements,
      statuses,
      runtime: sim.runtimeDiagnostics,
      alarms,
      scopes,
      lagging,
    };
  }, []);

  const stop = useCallback(() => {
    simRef.current = null;
    startedStructure.current = null;
    phases.current = { segments: new Float64Array(0), parts: new Map() };
    ledGlow.current = new Map();
    ionPhases.current = new Map();
    motorAngles.current = new Map();
    liveWindows.current = new Map();
    audio.current?.reset();
    setStatus('stopped');
    setFrame(null);
    setNotice(null);
  }, [setStatus]);

  const play = useCallback(() => {
    setNotice(null);
    // Tarayıcı sesi yalnızca bir kullanıcı etkileşiminde açar: Oynat düğmesi.
    if (!audio.current) audio.current = new SimAudio();
    audio.current.unlock();
    let sim = simRef.current;
    if (!sim) {
      // Yeni simülasyon: LED'ler onarılmış, kondansatörler başlangıç geriliminde başlar.
      sim = new CircuitSimulator(latest.current.connectivity.netlist);
      simRef.current = sim;
      // Osiloskoplar ekranı karede bir yakalar (buildFrame'de yeniden kurulur).
      for (const device of sim.devices) if (device instanceof OscilloscopeDevice) device.recorder.perFrame = true;
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
    /** Son karelerde adım sınırına takılma oranı (yumuşatılmış; uyarı titremesin). */
    let lagSamples = 0;
    const tick = (now: number) => {
      const sim = simRef.current;
      if (!sim) return;
      const dtReal = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
      last = now;
      const simDt = dtReal * speedRef.current;
      sim.watch(watchedRef.current);
      // Süre sınırı çağrı anından (rAF zaman damgası karenin başı: önceki karenin çizimi o süreyi yemiş olabilir).
      const maxSteps = Math.min(MAX_STEPS_PER_FRAME, Math.ceil(simDt / sim.maxTimeStep) * 8 + 64);
      const result = sim.advance(simDt, maxSteps, performance.now() + FRAME_COMPUTE_MS);
      // Bütçe bittiyse istenen sürenin bir kısmı atlandı: kullanıcı uyarılır.
      lagSamples = (lagSamples * 0.9) + (result.truncated ? 0.1 : 0);
      if (!result.ok) {
        setStatus('paused');
        if (result.error) setNotice({ kind: 'error', diagnostic: result.error });
        setFrame(buildFrame(sim, 0));
        return;
      }
      setFrame(buildFrame(sim, dtReal, lagSamples > 0.5));
      audio.current?.render(sim.devices, sim.time, soundRef.current && speedRef.current === 1 && lagSamples <= 0.5);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, buildFrame, setStatus]);

  const scopeRecorder = useCallback((partId: string) => {
    const device = simRef.current?.device(partId);
    return device instanceof OscilloscopeDevice ? device.recorder : null;
  }, []);

  return { status, frame, notice, speed, setSpeed, play, pause, stop, repair, scopeRecorder };
}
