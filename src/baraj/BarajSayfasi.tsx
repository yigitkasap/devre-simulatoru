// Baraj su seviyesi uyarısı sayfası (/baraj), ders düzeni (tasarım: docs/tasarim/baraj, bağlayıcı belge
// BN). Öğretmen yansıtırken tek elle yönetir; sınıf aynı anda barajı, devreyi ve durumu görür. Anlatım
// metni yok: ekrandaki her şey ya bir ölçüm ya bir düğme.
//
// Tek kumanda: ayrı Oynat yok. Açılışta örnek yüklenir, tank Durdur'da (%20) ve simülasyon kendiliğinden
// başlar; Su akışı tankın mode özelliğini değiştirir (useBarajKumanda). Devre değişince seviye, akış ve
// ayarlar taşınır, simülasyon yeniden başlar. Simülasyon ana simülatörün motoruyla çalışır; değişiklikler
// yalnızca bu sayfada kalır, "Simülatörde aç" o anki hâli paylaşım bağlantısıyla ana simülatöre taşır.
//
// Düzenler: masaüstü (≥ 1100 px) başlık + soru şeridi + iki kart (sahne ve Durum tablosu | devre şeması)
// + kumanda şeridi; tablet aynı, kaydırıcısız; telefon dikey: sahne, Durum | Devre sekmeleri, altta
// kumanda, Soru alt sayfada; telefon yatay: sahne solda, sekmeler sağda, kumanda tek satır. Tam ekranda
// (projeksiyon) yazılar büyür. Sayfanın kendisi hiçbir düzende kaymaz; paneller kendi içinde kayar.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { exampleDoc } from '../examples';
import { tr } from '../i18n/tr';
import { buildConnectivity } from '../model/connectivity';
import { updatePart } from '../model/docOps';
import { buildFlowGraph } from '../model/flow';
import { shareUrl } from '../model/share';
import type { CircuitDoc } from '../model/types';
import { probeWetness, TANK_PROBE_HEIGHTS, tankSettings } from '../sim/devices/tank';
import type { PropValue } from '../sim/netlist';
import { CircuitView } from '../editor/CircuitView';
import { useBrowserFullscreen } from '../editor/fullscreen';
import { Icon } from '../editor/icons';
import { useSettings } from '../editor/settings';
import { Logo } from '../editor/TopBar';
import { useLayout } from '../editor/useLayout';
import { useSimulation, type SimFrame } from '../editor/useSimulation';
import { AyarlarKarti } from './AyarlarKarti';
import { alertOf, BarajSahnesi, type Lamps, type SceneLayout } from './BarajSahnesi';
import { DurumTablosu } from './DurumTablosu';
import { Kumanda, type KumandaVariant } from './Kumanda';
import { bandOf, durumRows, levelBands, START_LEVEL, stopAbove, stopBelow, type LevelNo, type Stop } from './seviye';
import { BantLejanti, SeviyeBantlari } from './SeviyeBantlari';
import { AlertIcon } from './simgeler';
import { Soru } from './Soru';
import { useBarajKumanda } from './useBarajKumanda';

type Variant = 'baraj-cubuk' | 'baraj-tek-isik';
const VARIANTS: readonly Variant[] = ['baraj-cubuk', 'baraj-tek-isik'];

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const TABLE_KEY = 'devre-simulatoru:baraj-durum-gizli';
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

/** LED parlaklığı azalıyor mu (sönüyor): son ≈ 0,05 s'lik eğim (sönme ≈ 0,3 s sürer; kısa pencere kaçırmasın). */
function useLedTrend(frame: SimFrame | null, doc: CircuitDoc): (id: string) => boolean {
  const memory = useRef(new Map<string, { b: number; t: number; falling: boolean }>());
  return useMemo(() => {
    const m = memory.current;
    if (!frame) {
      m.clear();
      return () => false;
    }
    for (const part of doc.parts) {
      if (part.type !== 'led') continue;
      const b = frame.live.get(part.id)?.brightness ?? 0;
      const prev = m.get(part.id);
      if (!prev || frame.time < prev.t) m.set(part.id, { b, t: frame.time, falling: false });
      else if (frame.time - prev.t >= 0.05) m.set(part.id, { b, t: frame.time, falling: (b - prev.b) / (frame.time - prev.t) < -0.05 });
    }
    const snapshot = new Map(Array.from(m, ([id, v]) => [id, v.falling] as const));
    return (id: string) => snapshot.get(id) ?? false;
  }, [frame, doc]);
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

/** Sahnenin sol üstündeki uyarı rozeti: simge (biçim) ve metin. */
function UyariRozeti({ kind, size }: { kind: ReturnType<typeof alertOf>; size: 'big' | 'desk' | 'phone' | 'landscape' }) {
  const cls = {
    big: 'h-11 gap-2 pr-[17px] pl-3 text-[17px]',
    desk: 'h-10 gap-2 pr-[15px] pl-[11px] text-[15px]',
    phone: 'h-9 gap-2 pr-3.5 pl-2.5 text-body',
    landscape: 'h-[34px] gap-2 pr-[13px] pl-2.5 text-small',
  }[size];
  return (
    <div className={`pointer-events-none absolute ${size === 'phone' || size === 'landscape' ? 'top-2 left-2' : 'top-3.5 left-3.5'}`}>
      <div className={`inline-flex items-center rounded-full border border-line-2 bg-panel font-semibold whitespace-nowrap text-ink shadow-[0_2px_8px_rgba(29,39,51,.12)] ${cls}`}>
        <AlertIcon kind={kind} size={size === 'big' ? 22 : 20} />
        {tr.baraj.alert[kind]}
      </div>
    </div>
  );
}

const paperStyle = {
  backgroundColor: 'var(--color-paper)',
  backgroundImage: 'radial-gradient(circle, #b3bac3 1.3px, transparent 1.6px), radial-gradient(circle, #d3d7dc 1px, transparent 1.3px)',
  backgroundSize: '75px 75px, 15px 15px',
  backgroundPosition: '7px 7px, 7px 7px',
} as const;

export default function BarajSayfasi() {
  const [appSettings] = useSettings();
  const layout = useLayout();
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
  const direction = running && s.mode === 'fill' && level < 100 ? 'rising' : running && s.mode === 'drain' && level > 0 ? 'falling' : 'steady';
  const falling = useLedTrend(sim.frame, doc);
  const rows = durumRows(doc, sim.frame, wet, falling);
  const bands = useMemo(() => levelBands(doc), [doc]);
  const working = (n: LevelNo) => rows.find((r) => r.level === n)?.working ?? false;
  const announcement = useAnnouncement(band, lamps);

  // --- Soru, Durum, Ayarlar, sekmeler ----------------------------------------------------
  const [soruOpen, setSoruOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [tableHidden, setTableHidden] = useState(() => readFlag(TABLE_KEY));
  const [keysOff, setKeysOff] = useState(() => readFlag(KEYS_KEY));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tab, setTab] = useState<'durum' | 'devre'>('durum');
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLButtonElement | null>(null);
  const kumandaRef = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    (phone ? moreButton.current : settingsButton.current)?.focus();
  }, [phone]);
  const toggleTable = () => {
    setTableHidden((h) => {
      writeFlag(TABLE_KEY, !h);
      return !h;
    });
  };
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
    if (target?.closest('button, a, [role=radio], [role=tab], [role=switch]') && (e.key === ' ' || e.key === 'Enter')) return;
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
  const sceneLayout: SceneLayout = landscape ? 'landscape' : phone ? 'phone' : desktop || big ? 'wide' : 'tablet';
  const textPx = big ? 16.7 : desktop ? 14.7 : 13;
  const onPreview = (v: number | null) => {
    setPreview(v);
    if (v !== null && s.mode !== 'stop') kumanda.setFlow('stop');
  };
  const scene = (
    <>
      <BarajSahnesi
        level={shown}
        wet={sceneWet}
        lamps={lamps}
        mode={s.mode}
        running={running}
        layout={sceneLayout}
        textPx={textPx}
        lampLabels={!phone}
        ions={preview === null ? sim.frame?.live.get(tank.id)?.ions : undefined}
        onPreview={onPreview}
        onCommit={kumanda.commitLevel}
        className="h-full w-full"
      />
      <UyariRozeti kind={alert} size={big ? 'big' : landscape ? 'landscape' : phone ? 'phone' : 'desk'} />
    </>
  );
  const circuit = (minWidth?: number) => (
    <CircuitView
      doc={doc}
      connectivity={connectivity}
      frame={sim.frame}
      settings={appSettings}
      label={tr.baraj.circuitLabel(tr.baraj.variants[variant] ?? '')}
      underlay={<SeviyeBantlari bands={bands} working={working} />}
      {...(minWidth ? { minWidth } : {})}
    />
  );
  const kumandaVariant: KumandaVariant = landscape ? 'landscape' : phone ? 'phone' : desktop ? 'desktop' : 'tablet';
  const kumandaBar = (
    <Kumanda
      ref={kumandaRef}
      variant={kumandaVariant}
      big={big}
      keys={!keysOff}
      mode={s.mode}
      level={shown}
      direction={direction}
      band={band}
      onFlow={kumanda.setFlow}
      onGoTo={kumanda.goTo}
      onPreview={onPreview}
      onCommit={kumanda.commitLevel}
      onReset={kumanda.reset}
      {...(phone
        ? {}
        : {
            settings: {
              open: settingsOpen,
              onToggle: () => setSettingsOpen((o) => !o),
              buttonRef: (el: HTMLButtonElement | null) => {
                settingsButton.current = el;
                setSettingsAnchor(el);
              },
            },
          })}
    />
  );
  const settingsCard = settingsOpen && (
    <AyarlarKarti
      waterResistance={s.waterResistance}
      fillTime={s.fillTime}
      onChange={changeTank}
      onClose={closeSettings}
      variant={phone ? 'sheet' : 'popover'}
      anchor={phone ? moreButton.current : settingsAnchor}
      {...(desktop ? { shortcuts: { on: !keysOff, onToggle: toggleKeys } } : {})}
    />
  );
  const skipLink = (
    <a
      href="#kumanda"
      onClick={(e) => {
        e.preventDefault();
        kumandaRef.current?.focus();
      }}
      className="sr-only z-[100] rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {tr.baraj.skipToControls}
    </a>
  );
  const live = (
    <div aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );
  const logoLink = (
    <a href={BASE} aria-label={tr.baraj.back} title={tr.baraj.back} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-panel-2">
      <Logo />
    </a>
  );
  const soruButton = (
    <button
      type="button"
      aria-pressed={soruOpen}
      onClick={() => setSoruOpen((o) => !o)}
      className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-md border px-3.5 ${big ? 'text-[16px]' : phone ? 'text-[15px]' : 'text-body'} ${
        soruOpen ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line-2 bg-panel font-medium hover:bg-panel-2'
      }`}
    >
      <Icon name="help" className="h-[18px] w-[18px]" />
      {tr.baraj.soru.button}
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

  // --- Telefon -----------------------------------------------------------------------------
  if (phone) {
    const moreMenu = moreOpen && (
      <MoreMenu
        onClose={() => setMoreOpen(false)}
        anchor={moreButton.current}
        items={[
          { kind: 'link', label: tr.baraj.openShort, href: baseHref, onActivate: refreshHref },
          { kind: 'button', label: tr.baraj.ayarlar.title, onClick: () => setSettingsOpen(true) },
          ...(fullscreen.supported
            ? [{ kind: 'button' as const, label: fullscreen.on ? tr.toolbar.fullscreenExit : tr.toolbar.fullscreen, onClick: fullscreen.toggle }]
            : []),
        ]}
      />
    );
    const header = (
      <header
        className={`relative flex h-[52px] shrink-0 items-center gap-1.5 bg-panel ${landscape ? 'gap-2 border-b border-line' : ''}`}
        style={landscape ? { paddingLeft: 'max(4px, env(safe-area-inset-left))', paddingRight: 'max(6px, env(safe-area-inset-right))' } : { paddingLeft: 4, paddingRight: 6 }}
      >
        {logoLink}
        <h1 className={`m-0 min-w-0 truncate font-semibold ${landscape ? 'text-[16px]' : 'flex-1 text-[17px]'}`}>{tr.baraj.shortTitle}</h1>
        {landscape && (
          <>
            <span className="flex-1" />
            <VariantSeg value={variant} onChange={switchVariant} className="h-[50px] w-[270px]" />
            <span className="flex-1" />
          </>
        )}
        {soruButton}
        <button
          ref={moreButton}
          type="button"
          aria-label={tr.baraj.moreLabel(fullscreen.supported)}
          title={tr.baraj.more}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-panel-2"
        >
          <Icon name="more" />
        </button>
        {moreMenu}
      </header>
    );
    const tabs = (
      <div role="tablist" aria-label={tr.baraj.tabsLabel} className="flex shrink-0 gap-0.5 border-b border-line px-2">
        {(['durum', 'devre'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`baraj-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="baraj-panel"
            onClick={() => setTab(t)}
            className={`-mb-px h-11 border-b-2 px-4 text-[16px] font-semibold ${tab === t ? 'border-accent text-ink' : 'border-transparent text-muted'}`}
          >
            {tr.baraj.sekmeler[t]}
          </button>
        ))}
      </div>
    );
    const panel = (
      <div
        role="tabpanel"
        id="baraj-panel"
        aria-labelledby={`baraj-tab-${tab}`}
        className={`min-h-0 flex-1 ${tab === 'devre' ? '' : 'overflow-y-auto overscroll-contain'}`}
        style={tab === 'devre' ? paperStyle : undefined}
      >
        {tab === 'durum' ? <DurumTablosu rows={rows} variant={landscape ? 'landscape' : 'phone'} /> : circuit(520)}
      </div>
    );
    if (landscape) {
      return (
        <div className="app-root flex flex-col overflow-hidden bg-panel">
          {skipLink}
          {live}
          {header}
          <div className="flex min-h-0 flex-1 gap-2 bg-app" style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
            <section aria-label={tr.baraj.sceneTitle} className="relative min-w-0 flex-[1.05] overflow-hidden bg-[#e9eef3]">
              {scene}
            </section>
            <section aria-label={tr.baraj.sideTitle} className="relative flex min-w-0 flex-1 flex-col border-l border-line bg-panel">
              {tabs}
              {panel}
              {soru(true)}
              {settingsCard}
            </section>
          </div>
          {kumandaBar}
        </div>
      );
    }
    return (
      <div className="app-root flex flex-col overflow-hidden bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {skipLink}
        {live}
        {header}
        <div className="shrink-0 border-b border-line bg-panel px-3 pt-1 pb-2">
          <VariantSeg value={variant} onChange={switchVariant} className="h-[50px] w-full" big />
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <section aria-label={tr.baraj.sceneTitle} className="relative shrink-0 overflow-hidden bg-[#e9eef3]" style={{ height: 'clamp(190px, 37dvh, 313px)' }}>
            {scene}
          </section>
          <section aria-label={tr.baraj.sideTitle} className="relative flex min-h-0 flex-1 flex-col">
            {tabs}
            {panel}
            {soru(true)}
          </section>
          {settingsCard}
        </div>
        {kumandaBar}
      </div>
    );
  }

  // --- Masaüstü ve tablet ---------------------------------------------------------------------
  return (
    <div className="app-root flex flex-col overflow-hidden bg-app">
      {skipLink}
      {live}
      <header className={`flex shrink-0 items-center gap-3 border-b border-line bg-panel pr-3 pl-2 ${big ? 'h-[52px]' : 'h-14'}`}>
        {logoLink}
        <h1 className={`m-0 font-semibold whitespace-nowrap ${big ? 'text-[19px]' : 'text-[18px]'}`}>{tr.baraj.title}</h1>
        <span className="flex-1" />
        <span id="baraj-devre-lbl" className={`font-semibold text-muted ${big ? 'text-[15px]' : 'text-small'}`}>
          {tr.baraj.variant}
        </span>
        <VariantSeg
          value={variant}
          onChange={switchVariant}
          className={`${layout.kind === 'tablet' ? 'h-[50px]' : 'h-10'} ${desktop ? 'w-[300px]' : 'w-[276px]'}`}
          labelledBy="baraj-devre-lbl"
          big={big}
        />
        <span className="flex-1" />
        {soruButton}
        {fullscreen.supported && (
          <button
            type="button"
            onClick={fullscreen.toggle}
            aria-label={fullscreen.on ? tr.toolbar.fullscreenExit : tr.toolbar.fullscreen}
            title={fullscreen.on ? tr.toolbar.fullscreenExit : tr.toolbar.fullscreen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line-2 bg-panel hover:bg-panel-2"
          >
            <Icon name={fullscreen.on ? 'fullscreenExit' : 'fullscreen'} />
          </button>
        )}
        <a
          href={baseHref}
          onPointerDown={refreshHref}
          onFocus={refreshHref}
          onClick={refreshHref}
          className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-line-2 bg-panel px-3.5 font-medium text-ink no-underline hover:bg-panel-2 ${big ? 'text-[16px]' : 'text-body'}`}
        >
          {tr.baraj.openShort}
          <Icon name="external" className="h-[18px] w-[18px]" />
        </a>
      </header>
      {soru(false)}
      <main className={`grid min-h-0 flex-1 ${big ? 'gap-2.5 p-2.5' : 'gap-3 p-3'}`} style={{ gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)' }}>
        <section aria-label={tr.baraj.sceneTitle} className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-panel">
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#e9eef3]">{scene}</div>
          <div className="shrink-0 border-t border-line">
            <div className={`flex h-10 items-center gap-2.5 pr-2.5 ${desktop ? 'pl-4' : 'pl-3.5'}`}>
              <span className={`font-semibold ${big ? 'text-[17px]' : 'text-[15px]'}`}>{tr.baraj.durum.title}</span>
              <span className={`text-muted ${big ? 'text-[16px]' : 'text-[12.5px]'}`}>{tr.baraj.durum.chain}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={toggleTable}
                aria-label={tableHidden ? tr.baraj.durum.showLabel : tr.baraj.durum.hideLabel}
                aria-expanded={!tableHidden}
                className={`inline-flex h-8 items-center rounded-md px-2.5 text-muted hover:bg-panel-2 ${big ? 'text-[16px]' : 'text-small'}`}
              >
                {tableHidden ? tr.baraj.durum.show : tr.baraj.durum.hide}
              </button>
            </div>
            {!tableHidden && <DurumTablosu rows={rows} variant={desktop ? 'desktop' : 'tablet'} big={big} />}
          </div>
        </section>
        <section aria-label={tr.baraj.devre.title} className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-panel">
          <div className="flex h-11 shrink-0 items-center gap-3.5 border-b border-line px-4">
            <span className={`font-semibold ${big ? 'text-[17px]' : 'text-[15px]'}`}>{tr.baraj.devre.title}</span>
            <span className={`text-muted ${big ? 'text-[16px]' : 'text-small'}`}>{tr.baraj.variants[variant]}</span>
            <span className="flex-1" />
            <BantLejanti />
          </div>
          <div
            tabIndex={0}
            role="group"
            aria-label={tr.baraj.circuitLabel(tr.baraj.variants[variant] ?? '')}
            className="min-h-0 flex-1 p-2 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            style={paperStyle}
          >
            {circuit()}
          </div>
        </section>
      </main>
      <div className="relative shrink-0">
        {kumandaBar}
        {settingsCard}
      </div>
    </div>
  );
}

type MenuItem =
  | { readonly kind: 'link'; readonly label: string; readonly href: string; readonly onActivate: (e: { currentTarget: HTMLAnchorElement }) => void }
  | { readonly kind: 'button'; readonly label: string; readonly onClick: () => void };

/** Telefonda ⋯ menüsü: Simülatörde aç, Ayarlar, Tam ekran (destekleniyorsa). */
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
