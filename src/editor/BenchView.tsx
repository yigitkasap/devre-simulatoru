// Şema | 3B geçişi ve 3B tezgâh görünümünün çerçevesi (sahne tembel yüklenir). Tasarım v3 (E1, E3) ve
// kullanıcı kararı: 3B'nin bütün denetimleri sağ altta, şemadaki görünüm kutusunun tarzında
// ("− + Sığdır | Şema"; solunda Etiketler, Akım, Kamera ve Lehim rehberi); masaüstünde sol altta
// küçük şema (seçili parça vurgulu, tıklayınca Şema'ya döner). Etiketler kameraya dönük HTML
// katmanında (ad · değer, çalışırken ölçüm; seçili mavi); telefonda yalnızca seçili parçanın ve ölçü
// aletlerinin etiketi. Seçili transistörde uçların harfleri. Hareket ipucu Yardım'da; telefonda 3B ilk
// açılışta bir kez tek satır.

import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CameraRequest } from '../bench3d/Bench3D';
import { planBreadboard, type BreadboardPlan } from '../bench3d/breadboard';
import { layoutPosts } from '../bench3d/posts';
import { netIndex } from './analysis/traces';
import { wireKey } from '../model/connectivity';
import type { BenchCallbacks, BenchScene, CameraView, TopInsets } from '../bench3d/scene';
import { tr } from '../i18n/tr';
import type { Connectivity } from '../model/connectivity';
import type { CircuitDoc, Part } from '../model/types';
import type { DeviceType } from '../sim/netlist';
import { CircuitView } from './CircuitView';
import { Icon, type IconName } from './icons';
import { cardReading, useSlowFrame } from './Notebook';
import { partValueText } from './PartView';
import type { Settings } from './settings';
import type { SimFrame } from './useSimulation';
import { partTitle } from '../model/docOps';

const Bench3D = lazy(() => import('../bench3d/Bench3D'));

export type ViewMode = 'schematic' | 'bench';

const VIEW_KEY = 'devre-simulatoru:gorunum';
const LABELS_KEY = 'devre-simulatoru:3b-etiketler';
const HINT_KEY = 'devre-simulatoru:3b-ipucu';

/** Son seçilen görünüm (yalnızca bu tarayıcıda; devre dosyasına girmez). */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'bench' ? 'bench' : 'schematic';
    } catch {
      return 'schematic';
    }
  });
  return [
    mode,
    (next) => {
      setMode(next);
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {
        /* özel pencere: hatırlanmaz */
      }
    },
  ];
}

/** Telefonda şema kutusunun sol üstündeki Şema | 3B düğmesi (masaüstünde 3B ve Şema sağ alttaki kutularda). */
/**
 * Şemanın sol üstünde küçük Şema / 3B seçimi (arayüz v4): görünüşü 32 px (seçili beyaz); dokunmatikte
 * düğmelerin kendisi 44 px (görünen hap ortada), parmakla rahat basılır.
 */
export function ViewToggle({ mode, onChange, touch }: { mode: ViewMode; onChange: (mode: ViewMode) => void; touch: boolean }) {
  return (
    <div
      role="group"
      aria-label={tr.bench.viewGroup}
      // 3B etiketleri (scene.ts → positionOverlay) bu düğmenin altına girmez.
      data-label-obstacle
      className={`pointer-events-auto absolute left-3 z-10 flex items-center px-0.5 before:absolute before:inset-x-0 before:rounded-md before:bg-panel-2 before:shadow-md before:ring-1 before:ring-line before:content-[''] ${
        touch ? 'top-1.5 h-11 before:top-1.5 before:bottom-1.5' : 'top-3 h-8 before:inset-y-0'
      }`}
    >
      {(['schematic', 'bench'] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => onChange(m)} className={`relative flex min-w-12 items-center justify-center ${touch ? 'h-11' : 'h-8'}`}>
          <span className={`flex h-7 items-center rounded-[6px] px-3 text-small font-semibold ${mode === m ? 'bg-panel text-ink ring-1 ring-line' : 'text-ink-2'}`}>
            {m === 'schematic' ? tr.bench.schematic : tr.bench.bench}
          </span>
        </button>
      ))}
    </div>
  );
}

const METERS: ReadonlySet<DeviceType> = new Set(['voltmeter', 'ammeter', 'multimeter']);
/** Seçiliyken uç harfleri gösterilen parçalar (E-B-C, D-G-S). */
const LETTERED: ReadonlySet<DeviceType> = new Set(['npn', 'pnp', 'njfet', 'pjfet', 'nmos', 'pmos']);

function readStored(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}
function store(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* özel pencere: hatırlanmaz */
  }
}

export interface BenchViewProps {
  readonly doc: CircuitDoc;
  /** Tezgâhtaki parçaların görünüşü (arıza bulmada gözle görülen arızalarla); verilmezse doc. Etiketler doc'tan. */
  readonly look?: CircuitDoc;
  readonly connectivity: Connectivity;
  readonly frame: SimFrame | null;
  /** Etiketlerin gördüğü kare (arıza bulmada yalnızca ölçü aletleri; verilmezse frame). */
  readonly labelFrame?: SimFrame | null;
  /** Multimetrelerin Ω okuması (simülasyon durmuşken). */
  readonly ohmTexts?: ReadonlyMap<string, string>;
  /**
   * Arıza bulma (göstergeler kapalı): etiketlerde yalnızca ölçü aletlerinin okuması (defterin kartlarıyla
   * aynı kural); akım noktaları kapalı, düğmesi yok.
   */
  readonly liveHidden?: boolean;
  readonly active: boolean;
  /** Simülasyon ilerliyor (duraklatılınca akım noktaları durur). */
  readonly running: boolean;
  readonly selection: readonly string[];
  readonly overlayOpen: boolean;
  /** Karta aktar penceresini açar (delikli plaket ve baskı devre). */
  readonly onKarta: () => void;
  readonly touch: boolean;
  /** Telefon: etiketler yalnızca seçili parçada ve ölçü aletlerinde; küçük şema yok; denetimler simge. */
  readonly phone: boolean;
  /** Koyu tema: masa ve arka plan koyu (modeller değişmez). */
  readonly dark: boolean;
  readonly settings: Settings;
  readonly onSettings: (patch: Partial<Settings>) => void;
  /** Kapalı kartında ölçüm gösterilen parçalar (defterle aynı kural); null: hepsi. */
  readonly measured: ReadonlySet<string> | null;
  /** Şema'ya dön (küçük şema ve sağ alttaki Şema düğmesi). */
  readonly onSchematic: () => void;
  /** Defterdeki "3B'de yaklaş": uygulanınca onFocusDone çağrılır. */
  readonly focusRequest: string | null;
  readonly onFocusDone: () => void;
  /** Telefon: sağ alttaki denetimlerin yeri (şema kutusunun tam ekran düğmesinin solunda). */
  readonly controlsInset?: { readonly right: number; readonly bottom: number | string };
  /** Değişince kamera seçili görünüme yeniden sığdırılır (telefonda tam ekrana girip çıkınca). */
  readonly fitKey?: string;
  readonly callbacks: BenchCallbacks;
  /** Tahtada kur: öğrencinin kurulumunun yerleşimi (tezgâh onunla kurulur). */
  readonly plan?: BreadboardPlan | null;
  /**
   * Tahtada kur → Tepeden: dik kamera. 3B denetimleri, küçük şema ve masadaki parçaların etiketleri
   * gizlenir (yerlerini Tahtada kur'un araç çubuğu ve cihaz kartları alır).
   */
  readonly top?: TopInsets | null;
  readonly onScene?: (scene: BenchScene | null) => void;
  /** Etiket katmanına eklenecek öğeler ([data-anchor] konumlarını sahne verir). */
  readonly overlayExtra?: ReactNode;
  /** Etiketi gösterilmeyecek parçalar (Tepeden görünümde masadaki cihazlar; kartları var). */
  readonly unlabelled?: ReadonlySet<string>;
  /** Tahtada kur'un 3B görünümü: şema sağ panelde; köşedeki küçük şema ve "Şema" düğmesi yok. */
  readonly inBoard?: boolean;
  /** 3B araç çubuğundaki "Tahtada kur" (T6); `boardBlocked`: açılamıyorsa nedeni (düğme kapalı). */
  readonly onBoard?: () => void;
  readonly boardBlocked?: string | null;
}

type CameraChoice = CameraView | 'part';
const CAMERA_CHOICES: readonly CameraChoice[] = ['free', 'top', 'front', 'bench', 'part'];
/** Masa üstü cihazlar (dik duran): kamera menüsünde "Cihazlar" yalnızca bunlardan biri varken. */
const BENCH_DEVICES: ReadonlySet<DeviceType> = new Set(['dcsupply', 'funcgen', 'oscilloscope', 'voltmeter', 'ammeter', 'multimeter']);

export function BenchView(props: BenchViewProps) {
  const { doc, frame, selection, touch, phone, settings } = props;
  const [camera, setCamera] = useState<CameraRequest>({ n: 0, view: 'free' });
  const [cameraLabel, setCameraLabel] = useState<CameraChoice>('free');
  const [zoom, setZoom] = useState({ n: 0, factor: 1 });
  const [labels, setLabels] = useState(() => readStored(LABELS_KEY, true));
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const slow = useSlowFrame(props.active ? (props.labelFrame === undefined ? frame : props.labelFrame) : null);
  const single = selection.length === 1 ? selection[0]! : null;

  // Bağlantı direklerinin adları (taban plakasının arka kenarı; cihaz kabloları buraya takılır: posts.ts) ve üstüne
  // gelinen ağ (küçük şemada vurgulanır). Direklerin yeri ve adı her zaman şemanın planından (Tahtada kur'da da).
  const referencePlan = useMemo(() => planBreadboard(doc), [doc]);
  const schematicPlan = props.plan ? null : referencePlan;
  const index = useMemo(() => netIndex(doc, props.connectivity), [doc, props.connectivity]);
  const posts = useMemo(() => layoutPosts(doc, referencePlan).posts, [doc, referencePlan]);
  const [hoverNet, setHoverNet] = useState<string | null>(null);
  const highlightWires = useMemo(() => {
    if (!hoverNet || !schematicPlan) return null;
    const nets = new Set<number>();
    for (const [key, net] of schematicPlan.netOf) if (net === hoverNet) nets.add(index.netOf(key) ?? -1);
    return new Set(doc.wires.filter((w) => nets.has(index.netOf(wireKey(w.id)) ?? -2)).map((w) => w.id));
  }, [hoverNet, schematicPlan, index, doc.wires]);

  // Küçük şema yalnızca yer varken (sağ alttaki denetimlerle çakışmasın).
  const host = useRef<HTMLDivElement>(null);
  const [roomy, setRoomy] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setRoomy(el.clientWidth >= 820 && el.clientHeight >= 420));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Telefonda tam ekrana girince ve çıkınca kamera yeniden sığdırılır (kullanıcı kamerayı oynatmış olsa da).
  const fitKey = props.fitKey;
  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    setCamera((c) => ('partId' in c ? { n: c.n + 1, view: 'free' } : { n: c.n + 1, view: c.view }));
    setCameraLabel((l) => (l === 'part' ? 'free' : l));
  }, [fitKey]);

  // Defterdeki "3B'de yaklaş".
  const { focusRequest, onFocusDone } = props;
  useEffect(() => {
    if (!focusRequest) return;
    setCamera((c) => ({ n: c.n + 1, view: 'part', partId: focusRequest }));
    setCameraLabel('part');
    onFocusDone();
  }, [focusRequest, onFocusDone]);

  // Telefon: hareket ipucu yalnızca 3B ilk açıldığında, birkaç saniye (Yardım'da her zaman var).
  const [hint, setHint] = useState(() => phone && !readStored(HINT_KEY, false));
  useEffect(() => {
    if (!hint) return undefined;
    store(HINT_KEY, true);
    const timer = window.setTimeout(() => setHint(false), 7000);
    return () => window.clearTimeout(timer);
  }, [hint]);

  // İpucu sağ alttaki düğmelerin (44 px) hemen üstünde.
  const controlsBottom = props.controlsInset?.bottom ?? 16;
  const hintBottom = typeof controlsBottom === 'number' ? controlsBottom + 52 : `calc(${controlsBottom} + 52px)`;
  // Telefonda ipucu üstte, Şema | 3B düğmesinin altında: altta tahtanın üstüne geliyordu (cihazların önüne biner,
  // etiketler ondan kaçar; birkaç saniye sonra kalkar).

  const pickCamera = (choice: CameraChoice) => {
    setCameraLabel(choice);
    setCamera((c) => (choice === 'part' ? (single ? { n: c.n + 1, view: 'part', partId: single } : c) : { n: c.n + 1, view: choice }));
  };
  const callbacks: BenchCallbacks = { ...props.callbacks, onCamera: () => setCameraLabel('free'), onNet: setHoverNet };

  // Etiketler: telefonda yalnızca seçili parça ve ölçü aletleri; toprak sembolü etiketsiz.
  const top = props.top ?? null;
  const labelled = labels ? doc.parts.filter((p) => p.type !== 'ground' && !props.unlabelled?.has(p.id) && (!phone || selection.includes(p.id) || METERS.has(p.type))) : [];
  const lettered = single ? doc.parts.find((p) => p.id === single && LETTERED.has(p.type)) : undefined;

  const button = (pressed: boolean | undefined, extra = '') =>
    `pointer-events-auto flex items-center justify-center gap-1.5 rounded-md border bg-panel font-semibold shadow-sm ${
      pressed ? 'border-accent-line text-accent-ink' : 'border-line text-ink hover:bg-panel-2'
    } ${touch ? 'h-11' : 'h-9'} ${extra}`;
  const iconOnly = phone ? 'w-11' : 'px-3 text-small';
  const toggle = (icon: IconName, label: string, pressed: boolean, onClick: () => void) => (
    <button type="button" aria-pressed={pressed} aria-label={phone ? label : undefined} title={label} onClick={onClick} className={button(pressed, iconOnly)}>
      <Icon name={icon} className="h-[18px] w-[18px]" />
      {!phone && label}
    </button>
  );
  const viewButton = (icon: IconName, label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`flex items-center justify-center rounded-md text-ink hover:bg-app ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}>
      <Icon name={icon} />
    </button>
  );

  return (
    <div ref={host} className="absolute inset-0 overflow-hidden bg-bench">
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center text-small text-muted" role="status">
            {tr.bench.loading}
          </div>
        }
      >
        <Bench3D
          doc={props.look ?? doc}
          frame={frame}
          {...(props.ohmTexts ? { ohmTexts: props.ohmTexts } : {})}
          active={props.active}
          running={props.running}
          selection={selection}
          overlayOpen={props.overlayOpen}
          camera={camera}
          zoom={zoom}
          dots={settings.currentDots}
          electronFlow={settings.electronFlow}
          overlay={overlay}
          dark={props.dark}
          callbacks={callbacks}
          plan={props.plan ?? null}
          top={top}
          phone={phone}
          {...(props.onScene ? { onScene: props.onScene } : {})}
        />
      </Suspense>

      {/* Etiketler ve uç harfleri: konumlarını sahne verir (scene.ts → positionOverlay). İpucu katmanda
          bir engeldir: sahnenin altında, düğmelerin üstünde; çakışan etiket ipucu kalkana kadar gizlenir. */}
      <div ref={setOverlay} className="pointer-events-none absolute inset-0 overflow-hidden">
        {labelled.map((part) => (
          <BenchLabel key={part.id} part={part} frame={slow && (!props.liveHidden || METERS.has(part.type)) ? slow : null} measured={props.measured} selected={selection.includes(part.id)} />
        ))}
        {labels &&
          posts.map((post) => (
            <span
              key={`post-${post.net}`}
              data-anchor="post"
              data-net={post.net}
              data-priority={3}
              aria-hidden="true"
              className="absolute top-0 left-0 rounded-md bg-ink px-1.5 py-0.5 text-[11px] leading-tight font-semibold whitespace-nowrap text-on-ink opacity-0 shadow-md"
            >
              {post.name}
            </span>
          ))}
        {lettered &&
          (tr.devices.pinTags[lettered.type] ?? []).map((letter, i) => (
            <span
              key={`${lettered.id}-${i}`}
              data-anchor="pin"
              data-id={lettered.id}
              data-pin={i}
              data-priority={4}
              aria-hidden="true"
              className="absolute top-0 left-0 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1 font-mono text-[13px] font-semibold text-white opacity-0 shadow-sm"
            >
              {letter}
            </span>
          ))}
        {props.overlayExtra}
        {hint && (
          <p data-obstacle className="absolute left-3 m-0 max-w-[calc(100%-24px)] rounded-md bg-panel/90 px-2 py-1 text-label text-ink-2 shadow-sm" style={phone ? { top: 56 } : { bottom: hintBottom }}>
            {tr.bench.hintPhone}
          </p>
        )}
      </div>

      {!phone && !top && !props.inBoard && roomy && doc.parts.length > 0 && (
        <button
          type="button"
          onClick={props.onSchematic}
          aria-label={tr.bench.backToSchematic}
          data-fit-reserve
          className="absolute bottom-4 left-4 z-10 flex w-[230px] flex-col overflow-hidden rounded-xl border border-line-2 bg-panel text-left shadow-md hover:border-accent"
        >
          <span className="flex items-center justify-between border-b border-line px-3 py-2 text-label">
            <b className="font-semibold">{tr.bench.schematic}</b>
            <span className="text-accent-ink">{tr.bench.enlarge}</span>
          </span>
          <span className="block h-[116px] bg-paper p-1.5">
            <CircuitView
              doc={doc}
              connectivity={props.connectivity}
              frame={null}
              settings={settings}
              label={tr.bench.miniLabel}
              selected={selection}
              highlightWires={highlightWires}
              className="block h-full w-full"
            />
          </span>
        </button>
      )}

      {/* Sağ alt: 3B seçenekleri ve altında görünüm kutusu (şemadaki "− + Sığdır | 3B" kutusunun karşılığı). */}
      {/* data-fit-reserve: kamera kadrajında (scene.ts → bottomReserve) tahta bu denetimlerin üstünde kalır. */}
      {!top && <div
        data-fit-reserve
        className="pointer-events-none absolute z-10 flex max-w-[calc(100%-32px)] flex-col items-end gap-2"
        style={props.controlsInset ? { right: props.controlsInset.right, bottom: props.controlsInset.bottom } : { right: 16, bottom: 16 }}
      >
        <div className="flex flex-wrap-reverse items-center justify-end gap-2">
        {toggle('tag', tr.bench.labels, labels, () => {
          setLabels((on) => {
            store(LABELS_KEY, !on);
            return !on;
          });
        })}
        {!phone && !props.liveHidden && toggle('dots', tr.bench.current, settings.currentDots, () => props.onSettings({ currentDots: !settings.currentDots }))}
        <CameraMenu
          choice={cameraLabel}
          canFocus={single !== null}
          devices={doc.parts.some((p) => BENCH_DEVICES.has(p.type))}
          phone={phone}
          touch={touch}
          onPick={pickCamera}
        />
        {doc.parts.length > 0 && (
          <button type="button" onClick={props.onKarta} aria-label={phone ? tr.karta.open : undefined} title={tr.karta.open} className={button(false, iconOnly)}>
            <Icon name="board" className="h-[18px] w-[18px]" />
            {!phone && tr.karta.open}
          </button>
        )}
        {props.onBoard && (
          <button
            type="button"
            onClick={props.onBoard}
            disabled={Boolean(props.boardBlocked)}
            title={props.boardBlocked ?? tr.tahta.enter}
            aria-label={phone ? tr.tahta.enter : undefined}
            className={`pointer-events-auto flex items-center justify-center gap-1.5 rounded-md bg-accent font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 ${touch ? 'h-11' : 'h-9'} ${iconOnly}`}
          >
            <Icon name="board" className="h-[18px] w-[18px]" />
            {!phone && tr.tahta.enter}
          </button>
        )}
        </div>
        {!phone && (
          <div role="group" aria-label={tr.toolbar.view} className="pointer-events-auto flex items-center rounded-lg border border-line bg-panel p-[3px] shadow-sm">
            {viewButton('minus', tr.toolbar.zoomOut, () => setZoom((z) => ({ n: z.n + 1, factor: 1.25 })))}
            {viewButton('plus', tr.toolbar.zoomIn, () => setZoom((z) => ({ n: z.n + 1, factor: 0.8 })))}
            {viewButton('fit', tr.bench.fit, () => pickCamera(cameraLabel === 'part' ? 'free' : cameraLabel))}
            {!props.inBoard && (
              <button type="button" onClick={props.onSchematic} className={`ml-0.5 border-l border-line px-2.5 text-small font-medium hover:bg-app ${touch ? 'h-11' : 'h-9'}`}>
                {tr.bench.schematic}
              </button>
            )}
          </div>
        )}
      </div>}

    </div>
  );
}

/** Kameraya dönük etiket: ad · değer; çalışırken ölçüm (ölçü aletinde büyük). Seçili parçanınki mavi. */
function BenchLabel({ part, frame, measured, selected }: { part: Part; frame: SimFrame | null; measured: ReadonlySet<string> | null; selected: boolean }) {
  const reading = frame && (measured === null || measured.has(part.id)) ? cardReading(part, frame) : null;
  const meter = METERS.has(part.type);
  return (
    <div
      data-anchor="part"
      data-id={part.id}
      data-priority={selected ? 3 : meter ? 2 : 1}
      aria-hidden="true"
      className={`absolute top-0 left-0 flex flex-col rounded-lg px-2.5 py-1.5 leading-tight whitespace-nowrap opacity-0 shadow-md ${selected ? 'bg-accent text-white' : 'bg-ink text-on-ink'}`}
    >
      <span className="text-[13px] font-semibold">
        {partTitle(part)} · {partValueText(part) || tr.devices.names[part.type]}
      </span>
      {reading && (
        <span className={`font-mono tabular ${reading.big ? 'text-[17px] font-medium' : 'text-[12px] opacity-85'}`}>
          {reading.main}
          {reading.second ? ` · ${reading.second}` : ''}
        </span>
      )}
    </div>
  );
}

/** Kamera menüsü: Serbest, Üstten, Önden, Cihazlar (masa üstü cihaz varsa), Seçiliye yaklaş (sağ altta; yukarı açılır). */
function CameraMenu({
  choice,
  canFocus,
  devices,
  phone,
  touch,
  onPick,
}: {
  choice: CameraChoice;
  canFocus: boolean;
  devices: boolean;
  phone: boolean;
  touch: boolean;
  onPick: (choice: CameraChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const wrap = (node: ReactNode) => (phone ? createPortal(node, document.body) : node);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: PointerEvent) => {
      // Dışına ya da telefonda alt sayfanın arkasındaki karartıya dokununca kapanır.
      const target = e.target as Node;
      if (!(root.current?.contains(target) || sheet.current?.contains(target))) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    (sheet.current ?? root.current)?.querySelector<HTMLElement>('[aria-checked=true]')?.focus();
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const label = tr.bench.cameraButton(tr.bench.cameras[choice]!);
  return (
    <div ref={root} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`flex items-center justify-center gap-1.5 rounded-md border border-line bg-panel text-ink shadow-sm hover:bg-panel-2 ${touch ? 'h-11' : 'h-9'} ${phone ? 'w-11' : 'px-3 text-small'}`}
      >
        <Icon name="camera" className="h-[18px] w-[18px]" />
        {!phone && (
          <span>
            {tr.bench.camera}: <b className="font-semibold">{tr.bench.cameras[choice]}</b>
          </span>
        )}
      </button>
      {/* Telefonda menü 3B alanına sığmıyordu (kısa kutuda ve yatayda ekranın üstünden taşıyordu): sayfanın altında
          alt sayfa (body'de: 3B alanının kırpmasından ve konumundan bağımsız). */}
      {open && phone && createPortal(<div aria-hidden="true" className="fixed inset-0 z-40 bg-black/25" />, document.body)}
      {open && wrap(
        <div
          ref={sheet}
          role="menu"
          aria-label={tr.bench.camera}
          data-sheet={phone ? '' : undefined}
          className={phone ? 'fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-line bg-panel px-3 pt-2 shadow-lg' : 'absolute right-0 bottom-full mb-2 w-56 rounded-lg border border-line bg-panel p-1.5 shadow-lg'}
          style={phone ? { paddingBottom: 'max(12px, env(safe-area-inset-bottom))', paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' } : undefined}
        >
          {phone && <p className="m-0 px-3 pt-1 pb-1 text-label font-semibold text-ink-2">{tr.bench.camera}</p>}
          {CAMERA_CHOICES.filter((c) => c !== 'bench' || devices).map((c) => (
            <button
              key={c}
              type="button"
              role="menuitemradio"
              aria-checked={choice === c}
              disabled={c === 'part' && !canFocus}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-md px-3 text-left text-body outline-none hover:bg-accent-soft focus-visible:bg-accent-soft disabled:text-stopped disabled:hover:bg-transparent ${touch ? 'min-h-11' : 'min-h-9'} ${phone ? 'text-[16px]' : ''}`}
            >
              <span className="flex-1">{tr.bench.cameras[c]}</span>
              <span className={`text-accent-ink ${choice === c ? '' : 'invisible'}`} aria-hidden="true">
                ✓
              </span>
            </button>
          ))}
        </div>,
      )}
    </div>
  );
}
