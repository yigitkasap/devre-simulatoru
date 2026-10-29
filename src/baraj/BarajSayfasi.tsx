// Baraj su seviyesi uyarısı sayfası (/baraj). Derste projeksiyonda kullanılır: az metin, tek bakışta
// anlaşılır (tasarım v3: docs/tasarim-v3 → B1–B6; önceki ders düzeni docs/tasarim/baraj).
//
// Tek kumanda: ayrı Oynat yok. Açılışta örnek yüklenir, tank Durdur'da (%20) ve simülasyon kendiliğinden
// başlar; Su akışı tankın mode özelliğini değiştirir (useBarajKumanda). Devre değişince seviye, akış ve
// ayarlar taşınır, simülasyon yeniden başlar. Simülasyon ana simülatörün motoruyla çalışır; değişiklikler
// yalnızca bu sayfada kalır, "Simülatörde aç" o anki hâli paylaşım bağlantısıyla ana simülatöre taşır.
//
// Düzen (v3): tek satır üst çubuk (solda "← Simülatör" ve başlık; ortada Çubuk gösterge | Tek ışık, ▼ ■ ▲
// ve ince seviye çubuğu; sağda Devre, Soru, tema, ⋯). Varsayılan görünüm yalnızca sahnedir (B1); Devre
// düğmesi sağda devre panelini açar (B2). Sahnenin sol üstünde doluluk kartı, sol altında "Göster"
// çipleri (İyonlar, Yüzde ölçeği). Ayarlar, Başa al, Tam ekran ve Simülatörde aç ⋯ menüsünde. Alt
// kumanda satırı ve Durum tablosu yok. Telefon (B3): üst çubuk, altında Çubuk gösterge | Tek ışık ve tek
// satır kumanda; sahne ekranın altına kadar; sol altta "Devreyi gör ›" (devre tam ekran). Sayfanın
// kendisi hiçbir düzende kaymaz; paneller kendi içinde kayar.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { exampleDoc } from '../examples';
import { tr } from '../i18n/tr';
import { buildConnectivity } from '../model/connectivity';
import { updatePart } from '../model/docOps';
import { buildFlowGraph } from '../model/flow';
import { shareUrl } from '../model/share';
import type { CircuitDoc } from '../model/types';
import { probeWetness, TANK_PROBE_HEIGHTS, tankSettings } from '../sim/devices/tank';
import type { PropValue } from '../sim/netlist';
import { useBrowserFullscreen } from '../editor/fullscreen';
import { Icon } from '../editor/icons';
import { useSettings, type ThemeChoice } from '../editor/settings';
import { useTheme } from '../editor/theme';
import { ThemeMenu } from '../editor/TopBar';
import { useLayout } from '../editor/useLayout';
import { useSimulation } from '../editor/useSimulation';
import { AyarlarKarti } from './AyarlarKarti';
import { alertOf, BarajSahnesi, type Lamps, type SceneLayout } from './BarajSahnesi';
import { DevrePaneli, type CircuitTab } from './DevrePaneli';
import { bandOf, katDevreleri, START_LEVEL, stopAbove, stopBelow, type LevelNo, type Stop } from './seviye';
import { Soru } from './Soru';
import { AkisDugmeleri, DolulukKarti, GosterCipleri, SeviyeCubugu } from './UstKumanda';
import { useBarajKumanda } from './useBarajKumanda';

// three.js sahnesi tembel yüklenir; WebGL yoksa SVG çizimi (BarajSahnesi) kullanılır.
const BarajSahnesi3B = lazy(() => import('./BarajSahnesi3B'));

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

type Variant = 'baraj-cubuk' | 'baraj-tek-isik';
const VARIANTS: readonly Variant[] = ['baraj-cubuk', 'baraj-tek-isik'];

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const KEYS_KEY = 'devre-simulatoru:baraj-kisayollar-kapali';

/** Tarayıcıda tutulan küçük tercih (yalnızca kolaylık; depolama yoksa varsayılan). */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Depolama kapalı: tercih yalnızca bu açılışta geçerli.
  }
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/** Örnek devre, tank Durdur'da (örnek dosyasında Doldur). */
function lessonDoc(variant: Variant, tank?: Record<string, PropValue>): CircuitDoc {
  const doc = exampleDoc(variant)!;
  const h1 = doc.parts.find((p) => p.type === 'tank')!;
  return updatePart(doc, h1.id, { props: { ...h1.props, level: START_LEVEL, mode: 'stop', ...tank } });
}

/** Canlı duyuru: yalnızca seviye bandı ya da uyarı değişince (kısa bir sakinleşmeden sonra). */
function useAnnouncement(band: Stop, lamps: Lamps): string {
  const lit = (['green', 'yellow', 'red'] as const).filter((c) => lamps[c] > 0.3);
  const key = `${band}|${lit.join(',')}`;
  const [message, setMessage] = useState('');
  const previous = useRef<{ band: Stop; key: string } | null>(null);
  useEffect(() => {
    const prev = previous.current;
    if (!prev) {
      previous.current = { band, key };
      return undefined;
    }
    if (prev.key === key) return undefined;
    const timer = window.setTimeout(() => {
      const parts: string[] = [];
      if (band !== prev.band) parts.push(band > prev.band ? tr.baraj.announce.reached(band) : band === 0 ? tr.baraj.announce.dry : tr.baraj.announce.dropped(band));
      parts.push(tr.baraj.announce.lamps(lit.map((c) => tr.baraj.lampNames[c])));
      previous.current = { band, key };
      setMessage(parts.join(' '));
    }, 700);
    return () => window.clearTimeout(timer);
    // lit, key'den türetilir.
  }, [key, band]);
  return message;
}

/** Devre seçimi (Çubuk gösterge | Tek ışık): radyo grubu, oklarla da seçilir. */
function VariantSeg({ value, onChange, className, labelledBy, big }: { value: Variant; onChange: (v: Variant) => void; className: string; labelledBy?: string; big?: boolean }) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = value === 'baraj-cubuk' ? 'baraj-tek-isik' : 'baraj-cubuk';
    onChange(next);
    e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[VARIANTS.indexOf(next)]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : tr.baraj.variant}
      onKeyDown={onKeyDown}
      className={`flex shrink-0 gap-[3px] rounded-[10px] bg-face p-[3px] ${className}`}
    >
      {VARIANTS.map((v) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(v)}
            className={`min-w-0 flex-1 rounded-[7px] px-3 font-semibold whitespace-nowrap ${big ? 'text-[16px]' : 'text-body'} ${
              on ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(29,39,51,.18),0_0_0_1px_rgba(29,39,51,.06)]' : 'text-ink-2 hover:bg-panel/50'
            }`}
          >
            {tr.baraj.variants[v]}
          </button>
        );
      })}
    </div>
  );
}

export default function BarajSayfasi() {
  const [appSettings, updateAppSettings] = useSettings();
  // Renk teması simülatörle aynı ayardan (Sistem / Açık / Koyu).
  const theme = useTheme(appSettings.theme);
  const setTheme = (choice: ThemeChoice) => updateAppSettings({ theme: choice });
  const layout = useLayout();
  /** three.js sahnesi (WebGL varsa); yoksa SVG çizimi. */
  const [webgl] = useState(supportsWebGL);
  const width = useWindowWidth();
  const phone = layout.kind === 'phone';
  const landscape = phone && layout.landscape;
  const desktop = !phone && width >= 1100;
  const fullscreen = useBrowserFullscreen();
  /** Projeksiyon: tam ekranda yazılar büyür (telefon hariç). */
  const big = fullscreen.on && !phone;

  const [variant, setVariant] = useState<Variant>('baraj-cubuk');
  const [doc, setDoc] = useState<CircuitDoc>(() => lessonDoc('baraj-cubuk'));
  const connectivity = useMemo(() => buildConnectivity(doc), [doc]);
  const flowGraph = useMemo(() => buildFlowGraph(doc), [doc]);
  const sim = useSimulation(doc, connectivity, flowGraph, appSettings.electronFlow);
  const running = sim.status === 'running';

  // Simülasyon hep çalışır: açılışta, Başa al'da ve devre değişince (yapı değişti) yeniden başlar.
  // Yapı değişince motorun "düzenleme yüzünden durdu" bildirimi bu sayfada gösterilmez.
  const { play, stop } = sim;
  useEffect(() => {
    if (sim.status === 'stopped') play();
  }, [sim.status, play]);

  const tank = doc.parts.find((p) => p.type === 'tank')!;
  const s = tankSettings(tank.props);
  const tankStatus = sim.frame?.statuses.get(tank.id);
  const level = running && tankStatus?.level !== undefined ? tankStatus.level : s.level;
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? level;
  const wet = tankStatus?.wetProbes ?? TANK_PROBE_HEIGHTS.map((h) => probeWetness(level, h) > 0.5);
  const sceneWet = preview !== null ? TANK_PROBE_HEIGHTS.map((h) => probeWetness(preview, h) > 0.5) : wet;

  const changeTank = useCallback(
    (patch: Record<string, PropValue>) =>
      setDoc((d) => {
        const t = d.parts.find((p) => p.type === 'tank')!;
        return updatePart(d, t.id, { props: { ...t.props, ...patch } });
      }),
    [],
  );
  const kumanda = useBarajKumanda({ level, propsLevel: s.level, mode: s.mode, running, changeTank, restart: stop });

  const lamp = (label: string) => {
    const part = doc.parts.find((p) => p.label === label);
    return part ? (sim.frame?.live.get(part.id)?.brightness ?? 0) : 0;
  };
  const lamps: Lamps = { green: lamp('LED1'), yellow: lamp('LED2'), red: lamp('LED3') };
  const alert = alertOf(lamps);
  const band = bandOf(level);
  const katlar = katDevreleri(doc, sim.frame, wet);
  const battery = doc.parts.find((p) => p.type === 'battery');
  const supply = typeof battery?.props.voltage === 'number' ? battery.props.voltage : 9;
  const announcement = useAnnouncement(band, lamps);

  // --- Soru, Ayarlar, Devre paneli, katmanlar ------------------------------------------------
  const [soruOpen, setSoruOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [keysOff, setKeysOff] = useState(() => readFlag(KEYS_KEY));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** Devre paneli (B2; telefonda tam ekran). Varsayılan görünüm yalnızca sahne (B1). */
  const [circuitOpen, setCircuitOpen] = useState(false);
  /** Gösterilen kat ya da tüm devre (B5). */
  const [circuitTab, setCircuitTab] = useState<CircuitTab>(1);
  /** Tüm devre sayfa genişliğinde (sahne gizli; masaüstü). */
  const [circuitWideOn, setCircuitWide] = useState(false);
  const circuitWide = circuitWideOn && circuitTab === 'all';
  /** Sahnede lambaya tıklamak o katın devresini açar. */
  const selectFloor = useCallback((n: LevelNo) => {
    setCircuitTab(n);
    setCircuitOpen(true);
  }, []);
  /** Sahnenin isteğe bağlı katmanları ("Göster" çipleri): varsayılan kapalı. */
  const [showIons, setShowIons] = useState(false);
  const [showScale, setShowScale] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    moreButton.current?.focus();
  }, []);
  const toggleKeys = () => {
    setKeysOff((off) => {
      writeFlag(KEYS_KEY, !off);
      return !off;
    });
  };

  const switchVariant = (next: Variant) => {
    if (next === variant) return;
    setDoc(lessonDoc(next, { level, mode: s.mode, waterResistance: s.waterResistance, fillTime: s.fillTime }));
    setVariant(next);
    setRevealed(false);
  };
  const texts = tr.baraj.questions[variant]!;

  // "Simülatörde aç": o anki hâl (anlık seviye, akış, su direnci, dolma süresi).
  const baseHref = useMemo(() => shareUrl(doc, BASE), [doc]);
  const liveHref = () => shareUrl(updatePart(doc, tank.id, { props: { ...tank.props, level: Math.round(level * 10) / 10, mode: s.mode } }), BASE);
  const refreshHref = (e: { currentTarget: HTMLAnchorElement }) => {
    e.currentTarget.href = liveHref();
  };

  // --- Klavye ve sunum kumandası ---------------------------------------------------------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (keysOff || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof HTMLElement || e.target instanceof SVGElement ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role=slider], [role=dialog], [role=menu]')) return;
    // Odak bir düğmedeyken Boşluk ve Enter o düğmeye basar; radyo gruplarında oklar seçimi değiştirir.
    if (target?.closest('button, a, [role=button], [role=radio], [role=tab], [role=switch]') && (e.key === ' ' || e.key === 'Enter')) return;
    if (target?.closest('[role=radio], [role=tab]') && e.key.startsWith('Arrow')) return;
    const key = e.key.length === 1 ? e.key.toLocaleLowerCase('tr') : e.key;
    let handled = true;
    if (key === 'ArrowUp') kumanda.setFlow('fill');
    else if (key === 'ArrowDown') kumanda.setFlow('drain');
    else if (key === ' ') kumanda.toggleStop();
    else if (key === '0' || key === '1' || key === '2' || key === '3') kumanda.goTo(Number(key) as Stop);
    else if (key === 'PageDown') kumanda.goTo(stopAbove(level));
    else if (key === 'PageUp') kumanda.goTo(stopBelow(level));
    else if (key === 'r') kumanda.reset();
    else if (key === 't') switchVariant(variant === 'baraj-cubuk' ? 'baraj-tek-isik' : 'baraj-cubuk');
    else if (key === 's') setSoruOpen((o) => !o);
    else if (key === 'f' && fullscreen.supported) fullscreen.toggle();
    else handled = false;
    if (handled) e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Parçalar ---------------------------------------------------------------------------
  // Tüm devre açıkken sahne dar ve uzun (B5): telefonun dikey kadrajı.
  const sceneLayout: SceneLayout = landscape ? 'landscape' : phone || (circuitOpen && circuitTab === 'all') ? 'phone' : desktop || big ? 'wide' : 'tablet';
  const textPx = big ? 16.7 : desktop ? 14.7 : 13;
  const onPreview = (v: number | null) => {
    setPreview(v);
    if (v !== null && s.mode !== 'stop') kumanda.setFlow('stop');
  };
  const ionView = showIons && preview === null ? sim.frame?.live.get(tank.id)?.ions : undefined;
  const scene = (
    <>
      {webgl ? (
        <Suspense fallback={<div className="h-full w-full" style={{ background: 'linear-gradient(#b9d3ea, #dfeaf3 60%, #eef3f6)' }} />}>
          <BarajSahnesi3B
            level={shown}
            wet={sceneWet}
            lamps={lamps}
            mode={s.mode}
            running={running}
            textPx={textPx}
            scale={showScale}
            handle={!phone}
            {...(ionView ? { ions: ionView } : {})}
            currents={sim.frame?.live.get(tank.id)?.ions?.probeCurrents ?? null}
            onPreview={onPreview}
            onCommit={kumanda.commitLevel}
            {...(phone ? {} : { onLamp: selectFloor })}
            className="h-full w-full"
          />
        </Suspense>
      ) : (
      <BarajSahnesi
        level={shown}
        wet={sceneWet}
        lamps={lamps}
        mode={s.mode}
        running={running}
        layout={sceneLayout}
        textPx={textPx}
        scale={showScale}
        handle={!phone}
        ions={ionView}
        onPreview={onPreview}
        onCommit={kumanda.commitLevel}
        {...(phone ? {} : { onLamp: selectFloor })}
        className="h-full w-full"
      />
      )}
      <DolulukKarti level={shown} alert={alert} size={phone ? 'phone' : big ? 'big' : 'desk'} />
    </>
  );
  const panel = (layoutKind: 'side' | 'sheet') => (
    <DevrePaneli
      variant={variant}
      katlar={katlar}
      tab={circuitTab}
      onTab={setCircuitTab}
      level={shown}
      supply={supply}
      battery={battery?.label ?? 'B1'}
      openHref={baseHref}
      onOpenActivate={refreshHref}
      onClose={() => {
        setCircuitOpen(false);
        setCircuitWide(false);
      }}
      {...(layoutKind === 'side' ? { wide: { on: circuitWide, onToggle: () => setCircuitWide((on) => !on) } } : {})}
      layout={layoutKind}
      touch={phone || layout.kind === 'tablet'}
      big={big}
    />
  );
  const flow = <AkisDugmeleri mode={s.mode} onFlow={kumanda.setFlow} touch={phone || layout.kind === 'tablet'} />;
  const levelBar = (className: string) => (
    <SeviyeCubugu level={shown} onPreview={onPreview} onCommit={kumanda.commitLevel} onGoTo={kumanda.goTo} touch={phone || layout.kind === 'tablet'} className={className} />
  );
  const settingsCard = settingsOpen && (
    <AyarlarKarti
      waterResistance={s.waterResistance}
      fillTime={s.fillTime}
      onChange={changeTank}
      onClose={closeSettings}
      variant={phone ? 'sheet' : 'popover'}
      anchor={moreButton.current}
      {...(desktop ? { shortcuts: { on: !keysOff, onToggle: toggleKeys } } : {})}
    />
  );
  const skipLink = (
    <a
      href="#kumanda"
      onClick={(e) => {
        e.preventDefault();
        document.querySelector<HTMLElement>('#kumanda [aria-checked=true]')?.focus();
      }}
      className="sr-only z-[100] rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:min-h-11"
    >
      {tr.baraj.skipToControls}
    </a>
  );
  const live = (
    <div aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );
  const soruButton = (iconOnly: boolean) => (
    <button
      type="button"
      aria-pressed={soruOpen}
      aria-label={iconOnly ? tr.baraj.soru.button : undefined}
      title={tr.baraj.soru.button}
      onClick={() => setSoruOpen((o) => !o)}
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border ${iconOnly ? 'w-11' : 'px-3'} ${big ? 'text-[16px]' : 'text-body'} ${
        soruOpen ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line bg-panel font-medium hover:bg-panel-2'
      }`}
    >
      <Icon name="help" className="h-[18px] w-[18px]" />
      {!iconOnly && tr.baraj.soru.button}
    </button>
  );
  const soru = (sheet: boolean) =>
    soruOpen && (
      <Soru
        question={texts.question}
        answer={texts.answer}
        revealed={revealed}
        onReveal={setRevealed}
        onClose={() => setSoruOpen(false)}
        variant={sheet ? 'sheet' : 'strip'}
        big={big}
      />
    );
  const moreButtonEl = (label: string) => (
    <button
      ref={moreButton}
      type="button"
      aria-label={label}
      title={tr.baraj.more}
      aria-haspopup="menu"
      aria-expanded={moreOpen}
      onClick={() => setMoreOpen((o) => !o)}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] hover:bg-panel-2"
    >
      <Icon name="more" />
    </button>
  );
  const fullscreenItem = fullscreen.supported
    ? [{ kind: 'button' as const, label: fullscreen.on ? tr.toolbar.fullscreenExit : tr.toolbar.fullscreen, onClick: fullscreen.toggle }]
    : [];

  // --- Telefon (B3) -------------------------------------------------------------------------
  if (phone) {
    const moreMenu = moreOpen && (
      <MoreMenu
        onClose={() => setMoreOpen(false)}
        anchor={moreButton.current}
        items={[
          { kind: 'link', label: tr.baraj.openShort, href: baseHref, onActivate: refreshHref },
          { kind: 'button', label: tr.baraj.ayarlar.title, onClick: () => setSettingsOpen(true) },
          { kind: 'button', label: tr.baraj.kumanda.reset, onClick: kumanda.reset },
          { kind: 'button', label: tr.baraj.showIonsMenu(showIons), onClick: () => setShowIons((on) => !on) },
          { kind: 'button', label: tr.baraj.showScaleMenu(showScale), onClick: () => setShowScale((on) => !on) },
          // Tema: dokundukça Sistem → Açık → Koyu.
          {
            kind: 'button',
            label: tr.theme.button(appSettings.theme, theme),
            onClick: () => setTheme(appSettings.theme === 'system' ? 'light' : appSettings.theme === 'light' ? 'dark' : 'system'),
          },
          ...fullscreenItem,
        ]}
      />
    );
    const header = (
      <header
        className="relative flex h-14 shrink-0 items-center gap-1 bg-panel"
        style={{ paddingLeft: 'max(4px, env(safe-area-inset-left))', paddingRight: 'max(6px, env(safe-area-inset-right))' }}
      >
        <a href={BASE} aria-label={tr.baraj.back} title={tr.baraj.back} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink hover:bg-panel-2">
          <Icon name="chevron" className="h-5 w-5 rotate-180" />
        </a>
        <h1 className="m-0 min-w-0 flex-1 truncate text-[17px] font-semibold">{tr.baraj.shortTitle}</h1>
        {landscape && (
          <>
            <VariantSeg value={variant} onChange={switchVariant} className="h-[50px] w-[250px]" />
            {flow}
            {levelBar('w-[220px]')}
          </>
        )}
        {soruButton(true)}
        {moreButtonEl(tr.baraj.moreLabel(fullscreen.supported))}
        {moreMenu}
      </header>
    );
    return (
      <div className="app-root flex flex-col overflow-hidden bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {skipLink}
        {live}
        {header}
        {!landscape && (
          <div className="flex shrink-0 flex-col gap-2 px-3 pb-2">
            <VariantSeg value={variant} onChange={switchVariant} className="h-[50px] w-full" big />
            <div className="flex items-center gap-3.5">
              {flow}
              {levelBar('min-w-0 flex-1')}
            </div>
          </div>
        )}
        <section aria-label={tr.baraj.sceneTitle} className="relative min-h-0 flex-1 overflow-hidden bg-[#e9eef3]" style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
          {scene}
          <button
            type="button"
            onClick={() => setCircuitOpen(true)}
            aria-haspopup="dialog"
            className="absolute left-3 z-10 h-11 rounded-full bg-panel/90 px-3.5 text-sm font-medium text-accent-ink shadow-sm"
            style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}
          >
            {tr.baraj.seeCircuit}
          </button>
          {soru(true)}
          {settingsCard}
        </section>
        {circuitOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={tr.baraj.devre.title}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCircuitOpen(false);
            }}
            className="fixed inset-0 z-40 flex flex-col bg-panel"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {panel('sheet')}
          </div>
        )}
      </div>
    );
  }

  // --- Masaüstü ve tablet (B1, B2) --------------------------------------------------------------
  // Dar ekranda başlık görünmez (yalnızca ekran okuyucuya), Devre ve Soru yalnızca simge.
  const roomy = width >= 1280;
  const narrow = width < 1100;
  const moreMenu = moreOpen && (
    <MoreMenu
      onClose={() => setMoreOpen(false)}
      anchor={moreButton.current}
      items={[
        { kind: 'button', label: tr.baraj.ayarlar.title, onClick: () => setSettingsOpen(true) },
        { kind: 'button', label: tr.baraj.kumanda.reset, onClick: kumanda.reset },
        ...fullscreenItem,
        { kind: 'link', label: tr.baraj.openShort, href: baseHref, onActivate: refreshHref },
      ]}
    />
  );
  return (
    <div className="app-root flex flex-col overflow-hidden bg-app">
      {skipLink}
      {live}
      <header className="relative grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line bg-panel px-3">
        <div className="flex min-w-0 items-center gap-1">
          <a
            href={BASE}
            aria-label={narrow ? tr.baraj.back : undefined}
            title={tr.baraj.back}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg text-sm text-ink no-underline hover:bg-panel-2 ${narrow ? 'w-11 justify-center' : 'px-2.5'}`}
          >
            <Icon name="chevron" className="h-[18px] w-[18px] rotate-180" />
            {!narrow && tr.baraj.backShort}
          </a>
          <span className={`mx-1.5 h-6 w-px shrink-0 bg-line ${roomy ? '' : 'hidden'}`} aria-hidden="true" />
          <h1 className={`m-0 min-w-0 truncate font-semibold ${big ? 'text-[19px]' : 'text-heading'} ${roomy ? '' : 'sr-only'}`}>{tr.baraj.title}</h1>
        </div>
        <div className="flex min-w-0 items-center justify-center gap-4">
          <VariantSeg value={variant} onChange={switchVariant} className={`${layout.kind === 'tablet' ? 'h-11' : 'h-[42px]'} ${narrow ? 'w-[236px]' : 'w-[264px]'}`} big={big} />
          <span className="h-6 w-px shrink-0 bg-line" aria-hidden="true" />
          {flow}
          {levelBar(roomy ? 'w-[280px]' : narrow ? 'w-[160px]' : 'w-[220px]')}
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            aria-pressed={circuitOpen}
            aria-label={narrow ? tr.baraj.circuitButton : undefined}
            title={tr.baraj.circuitButton}
            onClick={() => setCircuitOpen((o) => !o)}
            className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border ${narrow ? 'w-11' : 'px-3'} ${big ? 'text-[16px]' : 'text-body'} ${
              circuitOpen ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line bg-panel font-medium hover:bg-panel-2'
            }`}
          >
            <Icon name="measure" className="h-[18px] w-[18px]" />
            {!narrow && tr.baraj.circuitButton}
          </button>
          {soruButton(narrow)}
          <ThemeMenu choice={appSettings.theme} theme={theme} onChange={setTheme} touch />
          {moreButtonEl(tr.baraj.moreDesk)}
          {moreMenu}
        </div>
      </header>
      {soru(false)}
      <div className="relative flex min-h-0 flex-1">
        <section aria-label={tr.baraj.sceneTitle} hidden={circuitOpen && circuitWide} className="relative min-w-0 flex-1 overflow-hidden bg-[#e9eef3]">
          {scene}
          <GosterCipleri
            ions={showIons}
            scale={showScale}
            onIons={() => setShowIons((on) => !on)}
            onScale={() => setShowScale((on) => !on)}
            touch={layout.kind === 'tablet'}
          />
        </section>
        {circuitOpen && (
          <aside
            aria-label={tr.baraj.devre.title}
            className={`flex min-h-0 min-w-0 flex-col border-l border-line bg-panel ${circuitWide ? 'flex-1' : 'shrink-0'}`}
            style={circuitWide ? undefined : { width: circuitTab === 'all' ? (roomy ? 840 : '58%') : roomy ? 600 : '45%' }}
          >
            {panel('side')}
          </aside>
        )}
        {settingsCard}
      </div>
    </div>
  );
}

type MenuItem =
  | { readonly kind: 'link'; readonly label: string; readonly href: string; readonly onActivate: (e: { currentTarget: HTMLAnchorElement }) => void }
  | { readonly kind: 'button'; readonly label: string; readonly onClick: () => void };

/** ⋯ menüsü: masaüstünde Ayarlar, Başa al, Tam ekran, Simülatörde aç; telefonda ayrıca katmanlar ve tema. */
function MoreMenu({ items, onClose, anchor }: { items: readonly MenuItem[]; onClose: () => void; anchor: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        anchor?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchor]);
  const cls = 'flex min-h-12 w-full items-center px-4 text-left text-[16px] font-medium text-ink no-underline hover:bg-panel-2';
  return (
    <div ref={ref} role="menu" aria-label={tr.baraj.more} className="absolute top-[50px] right-1.5 z-40 flex w-60 flex-col overflow-hidden rounded-xl border border-line-2 bg-panel py-1 shadow-[0_14px_36px_rgba(29,39,51,.24)]">
      {items.map((item) =>
        item.kind === 'link' ? (
          <a key={item.label} role="menuitem" href={item.href} onPointerDown={item.onActivate} onClick={item.onActivate} className={cls}>
            {item.label}
          </a>
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onClick();
            }}
            className={cls}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
