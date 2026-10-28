// Şema | 3B geçişi ve 3B tezgâh görünümünün çerçevesi (sahne tembel yüklenir). Tasarım v3 (E1, E3) ve
// kullanıcı kararı: 3B'nin bütün denetimleri sağ altta, şemadaki görünüm kutusunun tarzında
// ("− + Sığdır | Şema"; solunda Etiketler, Akım, Kamera ve Lehim rehberi); masaüstünde sol altta
// küçük şema (seçili parça vurgulu, tıklayınca Şema'ya döner). Etiketler kameraya dönük HTML
// katmanında (ad · değer, çalışırken ölçüm; seçili mavi); telefonda yalnızca seçili parçanın ve ölçü
// aletlerinin etiketi. Seçili transistörde uçların harfleri. Hareket ipucu Yardım'da; telefonda 3B ilk
// açılışta bir kez tek satır.

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { CameraRequest } from '../bench3d/Bench3D';
import type { BenchCallbacks, CameraView } from '../bench3d/scene';
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

const Bench3D = lazy(() => import('../bench3d/Bench3D'));
// Lehim rehberi ve KiCad aktarımı: yalnızca açılınca yüklenir.
const SolderGuideDialog = lazy(() => import('./SolderGuide').then((m) => ({ default: m.SolderGuideDialog })));

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
export function ViewToggle({ mode, onChange, touch }: { mode: ViewMode; onChange: (mode: ViewMode) => void; touch: boolean }) {
  const size = touch ? 'h-11 min-w-14 px-3.5 text-sm' : 'h-9 min-w-12 px-3 text-small';
  return (
    <div
      role="group"
      aria-label={tr.bench.viewGroup}
      className="pointer-events-auto absolute top-3 left-3 z-10 flex rounded-lg border border-line-2 bg-panel p-0.5 shadow-sm"
    >
      {(['schematic', 'bench'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className={`${size} rounded-md font-semibold ${mode === m ? 'bg-accent text-white' : 'text-ink-2 hover:bg-panel-2'}`}
        >
          {m === 'schematic' ? tr.bench.schematic : tr.bench.bench}
        </button>
      ))}
    </div>
  );
}

const METERS: ReadonlySet<DeviceType> = new Set(['voltmeter', 'ammeter']);
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
  readonly connectivity: Connectivity;
  readonly frame: SimFrame | null;
  readonly active: boolean;
  /** Simülasyon ilerliyor (duraklatılınca akım noktaları durur). */
  readonly running: boolean;
  readonly selection: readonly string[];
  readonly overlayOpen: boolean;
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
  readonly callbacks: BenchCallbacks;
}

type CameraChoice = CameraView | 'part';
const CAMERA_CHOICES: readonly CameraChoice[] = ['free', 'top', 'front', 'part'];

export function BenchView(props: BenchViewProps) {
  const { doc, frame, selection, touch, phone, settings } = props;
  const [camera, setCamera] = useState<CameraRequest>({ n: 0, view: 'free' });
  const [cameraLabel, setCameraLabel] = useState<CameraChoice>('free');
  const [zoom, setZoom] = useState({ n: 0, factor: 1 });
  const [guideOpen, setGuideOpen] = useState(false);
  const [labels, setLabels] = useState(() => readStored(LABELS_KEY, true));
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const slow = useSlowFrame(props.active ? frame : null);
  const single = selection.length === 1 ? selection[0]! : null;

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

  const pickCamera = (choice: CameraChoice) => {
    setCameraLabel(choice);
    setCamera((c) => (choice === 'part' ? (single ? { n: c.n + 1, view: 'part', partId: single } : c) : { n: c.n + 1, view: choice }));
  };
  const callbacks: BenchCallbacks = { ...props.callbacks, onCamera: () => setCameraLabel('free') };

  // Etiketler: telefonda yalnızca seçili parça ve ölçü aletleri; toprak sembolü etiketsiz.
  const labelled = labels ? doc.parts.filter((p) => p.type !== 'ground' && (!phone || selection.includes(p.id) || METERS.has(p.type))) : [];
  const lettered = single ? doc.parts.find((p) => p.id === single && LETTERED.has(p.type)) : undefined;

  const button = (pressed: boolean | undefined, extra = '') =>
    `pointer-events-auto flex items-center justify-center gap-1.5 rounded-[10px] border bg-panel font-semibold shadow-sm ${
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
          doc={doc}
          frame={frame}
          active={props.active}
          running={props.running}
          selection={selection}
          overlayOpen={props.overlayOpen || guideOpen}
          camera={camera}
          zoom={zoom}
          dots={settings.currentDots}
          electronFlow={settings.electronFlow}
          overlay={overlay}
          dark={props.dark}
          callbacks={callbacks}
        />
      </Suspense>

      {/* Etiketler ve uç harfleri: konumlarını sahne verir (scene.ts → positionOverlay). */}
      <div ref={setOverlay} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {labelled.map((part) => (
          <BenchLabel key={part.id} part={part} frame={slow} measured={props.measured} selected={selection.includes(part.id)} />
        ))}
        {lettered &&
          (tr.devices.pinTags[lettered.type] ?? []).map((letter, i) => (
            <span
              key={`${lettered.id}-${i}`}
              data-anchor="pin"
              data-id={lettered.id}
              data-pin={i}
              data-priority={4}
              className="absolute top-0 left-0 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1 font-mono text-[13px] font-semibold text-white opacity-0 shadow-sm"
            >
              {letter}
            </span>
          ))}
      </div>

      {!phone && roomy && doc.parts.length > 0 && (
        <button
          type="button"
          onClick={props.onSchematic}
          aria-label={tr.bench.backToSchematic}
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
              className="block h-full w-full"
            />
          </span>
        </button>
      )}

      {hint && (
        <p className="pointer-events-none absolute top-[62px] left-3 z-10 rounded-md bg-panel/90 px-2 py-1 text-label text-ink-2 shadow-sm">{tr.bench.hintPhone}</p>
      )}

      {/* Sağ alt: 3B seçenekleri ve altında görünüm kutusu (şemadaki "− + Sığdır | 3B" kutusunun karşılığı). */}
      <div
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
        {!phone && toggle('dots', tr.bench.current, settings.currentDots, () => props.onSettings({ currentDots: !settings.currentDots }))}
        <CameraMenu choice={cameraLabel} canFocus={single !== null} phone={phone} touch={touch} onPick={pickCamera} />
        {doc.parts.length > 0 && (
          <button type="button" onClick={() => setGuideOpen(true)} aria-label={phone ? tr.solderGuide.open : undefined} title={tr.solderGuide.open} className={button(false, iconOnly)}>
            <Icon name="book" className="h-[18px] w-[18px]" />
            {!phone && tr.solderGuide.open}
          </button>
        )}
        </div>
        {!phone && (
          <div role="group" aria-label={tr.toolbar.view} className="pointer-events-auto flex items-center rounded-[10px] border border-line bg-panel p-[3px] shadow-sm">
            {viewButton('minus', tr.toolbar.zoomOut, () => setZoom((z) => ({ n: z.n + 1, factor: 1.25 })))}
            {viewButton('plus', tr.toolbar.zoomIn, () => setZoom((z) => ({ n: z.n + 1, factor: 0.8 })))}
            {viewButton('fit', tr.bench.fit, () => pickCamera(cameraLabel === 'part' ? 'free' : cameraLabel))}
            <button type="button" onClick={props.onSchematic} className={`ml-0.5 border-l border-line px-2.5 text-small font-medium hover:bg-app ${touch ? 'h-11' : 'h-9'}`}>
              {tr.bench.schematic}
            </button>
          </div>
        )}
      </div>

      {guideOpen && (
        <Suspense fallback={null}>
          <SolderGuideDialog doc={doc} touch={touch} onClose={() => setGuideOpen(false)} />
        </Suspense>
      )}
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
      className={`absolute top-0 left-0 flex flex-col rounded-lg px-2.5 py-1.5 leading-tight whitespace-nowrap opacity-0 shadow-md ${selected ? 'bg-accent text-white' : 'bg-ink text-on-ink'}`}
    >
      <span className="text-[13px] font-semibold">
        {part.label} · {partValueText(part) || tr.devices.names[part.type]}
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

/** Kamera menüsü: Serbest, Üstten, Önden, Seçiliye yaklaş (sağ altta; yukarı açılır). */
function CameraMenu({ choice, canFocus, phone, touch, onPick }: { choice: CameraChoice; canFocus: boolean; phone: boolean; touch: boolean; onPick: (choice: CameraChoice) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('[aria-checked=true]')?.focus();
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
        className={`flex items-center justify-center gap-1.5 rounded-[10px] border border-line bg-panel text-ink shadow-sm hover:bg-panel-2 ${touch ? 'h-11' : 'h-9'} ${phone ? 'w-11' : 'px-3 text-small'}`}
      >
        <Icon name="camera" className="h-[18px] w-[18px]" />
        {!phone && (
          <span>
            {tr.bench.camera}: <b className="font-semibold">{tr.bench.cameras[choice]}</b>
          </span>
        )}
      </button>
      {open && (
        <div role="menu" aria-label={tr.bench.camera} className="absolute right-0 bottom-full mb-2 w-56 rounded-lg border border-line bg-panel p-1.5 shadow-lg">
          {CAMERA_CHOICES.map((c) => (
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
              className={`flex w-full items-center gap-3 rounded-md px-3 text-left text-body outline-none hover:bg-accent-soft focus-visible:bg-accent-soft disabled:text-stopped disabled:hover:bg-transparent ${touch ? 'min-h-11' : 'min-h-9'}`}
            >
              <span className="flex-1">{tr.bench.cameras[c]}</span>
              <span className={`text-accent-ink ${choice === c ? '' : 'invisible'}`} aria-hidden="true">
                ✓
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
