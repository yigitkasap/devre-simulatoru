// Baraj su seviyesi uyarısı sayfası (/baraj): büyük baraj sahnesi, devre (salt görüntü), kontroller
// ve anlatım. Simülasyon ana simülatörün motoruyla çalışır; devre Örnekler'deki iki proje
// devresinden biridir (çubuk gösterge / tek ışık). Değişiklikler yalnızca bu sayfada kalır (tarayıcıya
// kaydedilmez); "Devreyi simülatörde aç" devreyi paylaşım bağlantısıyla ana simülatöre taşır.
//
// Düzen: dikey telefonda üstte sahne, altında Oynat satırı ve sekmeler (Anlatım / Kontroller / Devre);
// sayfa kaymaz, yalnızca sekme içeriği kayar. Geniş ekranda solda sahne, sağda (daha geniş) devre ve
// sekmeler. Anlatım kapalı açılır; sekme satırının sağındaki düğmeyle açılıp kapanır. Başlıktaki düğme
// tarayıcıyı tam ekrana alır (destekleyen tarayıcılarda).

import { useEffect, useMemo, useState } from 'react';
import { exampleDoc } from '../examples';
import { tr } from '../i18n/tr';
import { buildConnectivity } from '../model/connectivity';
import { updatePart } from '../model/docOps';
import { buildFlowGraph } from '../model/flow';
import { shareUrl } from '../model/share';
import type { CircuitDoc } from '../model/types';
import { probeWetness, TANK_PROBE_HEIGHTS, tankSettings } from '../sim/devices/tank';
import type { PropValue } from '../sim/netlist';
import { formatNumber } from '../sim/units';
import { CircuitView } from '../editor/CircuitView';
import { useBrowserFullscreen } from '../editor/fullscreen';
import { Icon } from '../editor/icons';
import { Segmented } from '../editor/RackControls';
import { Rich } from '../editor/Rich';
import { useSettings } from '../editor/settings';
import { TankControls } from '../editor/TankControls';
import { Logo } from '../editor/TopBar';
import { useLayout } from '../editor/useLayout';
import { useSimulation } from '../editor/useSimulation';
import { alertOf, BarajSahnesi } from './BarajSahnesi';

type Variant = 'baraj-cubuk' | 'baraj-tek-isik';
type Tab = 'info' | 'controls' | 'circuit';

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export default function BarajSayfasi() {
  const [settings] = useSettings();
  const layout = useLayout();
  const width = useWindowWidth();
  const stacked = layout.kind === 'phone' && !layout.landscape;
  const touch = layout.kind === 'phone' || layout.kind === 'tablet';
  /** Geniş ekranda devre her zaman görünür; sekmelerde yalnızca anlatım ve kontroller. */
  const wide = !stacked && width >= 1100 && layout.kind !== 'phone';

  const [variant, setVariant] = useState<Variant>('baraj-cubuk');
  const [doc, setDoc] = useState<CircuitDoc>(() => exampleDoc('baraj-cubuk')!);
  const [tab, setTab] = useState<Tab>('controls');
  /** Anlatım her açılışta kapalı başlar (kullanıcı isteği); isteyen açar. */
  const [infoOpen, setInfoOpen] = useState(false);
  const fullscreen = useBrowserFullscreen();
  const [revealed, setRevealed] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const connectivity = useMemo(() => buildConnectivity(doc), [doc]);
  const flowGraph = useMemo(() => buildFlowGraph(doc), [doc]);
  const sim = useSimulation(doc, connectivity, flowGraph, settings.electronFlow);
  const running = sim.status === 'running';
  const active = sim.status !== 'stopped';

  const tank = doc.parts.find((p) => p.type === 'tank')!;
  const tankStatus = sim.frame?.statuses.get(tank.id) ?? {};
  const s = tankSettings(tank.props);
  const level = active && tankStatus.level !== undefined ? tankStatus.level : s.level;
  const wet = tankStatus.wetProbes ?? TANK_PROBE_HEIGHTS.map((h) => probeWetness(level, h) > 0.5);
  const lamp = (label: string) => {
    const part = doc.parts.find((p) => p.label === label);
    return part ? (sim.frame?.live.get(part.id)?.brightness ?? 0) : 0;
  };
  const lamps = { green: lamp('LED1'), yellow: lamp('LED2'), red: lamp('LED3') };
  const alert = alertOf(lamps);
  const texts = tr.examples.texts[variant];

  const changeTank = (patch: Record<string, PropValue>) =>
    setDoc((d) => {
      const t = d.parts.find((p) => p.type === 'tank')!;
      return updatePart(d, t.id, { props: { ...t.props, ...patch } });
    });
  const switchVariant = (next: Variant) => {
    if (next === variant) return;
    sim.stop();
    setVariant(next);
    setDoc(exampleDoc(next)!);
    setRevealed(false);
  };
  const play = () => {
    sim.play();
    setRevealed(true);
  };
  const simulatorUrl = shareUrl(doc, BASE);

  const header = (
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-panel pr-2 pl-3">
      <a href={BASE} aria-label={tr.baraj.back} title={tr.baraj.back} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-panel-2">
        <Logo />
      </a>
      <h1 className="min-w-0 flex-1 truncate text-[17px] leading-tight font-semibold">{tr.baraj.title}</h1>
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
        href={simulatorUrl}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-line-2 bg-panel px-3 text-sm font-medium hover:bg-panel-2"
      >
        <span className={stacked ? 'sr-only' : ''}>{tr.baraj.openInSimulator}</span>
        <Icon name="external" className="h-[18px] w-[18px]" />
      </a>
    </header>
  );

  const controlsRow = (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={running ? sim.pause : play}
        className={`flex h-11 items-center gap-1.5 rounded-md border pr-4 pl-3 font-semibold text-white ${
          running ? 'border-ink bg-ink' : 'border-ok bg-ok hover:brightness-110'
        }`}
      >
        <Icon name={running ? 'pause' : 'play'} />
        {running ? tr.baraj.pause : tr.baraj.play}
      </button>
      <button
        type="button"
        onClick={sim.stop}
        disabled={!active}
        title={tr.baraj.resetHint}
        className="flex h-11 items-center gap-1.5 rounded-md border border-line-2 bg-panel px-3 font-medium disabled:opacity-45"
      >
        <Icon name="stop" />
        {tr.baraj.reset}
      </button>
      <span className="font-mono text-sm text-muted tabular" aria-label={tr.baraj.timeLabel}>
        {tr.baraj.time(formatNumber(sim.frame?.time ?? 0, 1))}
      </span>
      <span role="status" className="sr-only">
        {`${tr.baraj.levelTitle} %${Math.round(level)}. ${tr.baraj.alert[alert]}.`}
      </span>
      <Segmented<Variant>
        label={tr.baraj.variant}
        className={stacked ? 'w-full' : 'ml-auto w-[300px]'}
        touch={touch}
        options={[
          { value: 'baraj-cubuk', text: tr.baraj.variants['baraj-cubuk'] },
          { value: 'baraj-tek-isik', text: tr.baraj.variants['baraj-tek-isik'] },
        ]}
        value={variant}
        onChange={switchVariant}
      />
    </div>
  );

  const info = (
    <div className="flex flex-col gap-3 p-3.5">
      <h2 className="text-title leading-tight font-semibold">{texts.title}</h2>
      <p className="text-sm leading-[1.55] text-ink-2">
        <Rich text={texts.description} />
      </p>
      <div className="flex flex-col gap-1.5 rounded-lg border border-warn-line bg-warn-soft px-3.5 py-3">
        <span className="text-label font-semibold text-warn">{tr.examples.predict}</span>
        <span className="text-[15px] leading-normal">
          <Rich text={texts.question} />
        </span>
      </div>
      {revealed ? (
        <div role="status" className="flex flex-col gap-1.5 rounded-lg border border-ok-line bg-ok-soft px-3.5 py-3">
          <span className="text-label font-semibold text-ok">{tr.examples.answer}</span>
          <span className="text-[15px] leading-[1.55]">
            <Rich text={texts.answer} />
          </span>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line-2 bg-panel-2 p-3 text-sm text-muted">{tr.baraj.answerLocked}</p>
      )}
      <section className="flex flex-col gap-2" aria-labelledby="baraj-nasil">
        <h3 id="baraj-nasil" className="text-[15px] font-semibold">
          {tr.baraj.howTitle}
        </h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-[1.55] text-ink-2">
          {tr.baraj.how.map((line) => (
            <li key={line}>
              <Rich text={line} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  const controls = (
    <div className="p-3.5">
      <TankControls
        part={tank}
        status={tankStatus}
        running={active}
        onChange={changeTank}
        onJack={() => {}}
        touch={touch}
        jacks={false}
        note={tr.baraj.controlsNote}
      />
    </div>
  );

  const circuit = (minWidth?: number) => (
    <CircuitView doc={doc} connectivity={connectivity} frame={sim.frame} settings={settings} label={tr.baraj.circuitLabel(texts.title)} {...(minWidth ? { minWidth } : {})} />
  );

  // Geniş ekranda devre ayrı gösterilir; anlatım kapatılabilir. Seçili sekme artık yoksa ilk sekme.
  const tabs: Tab[] = [...(infoOpen ? (['info'] as const) : []), 'controls', ...(wide ? [] : (['circuit'] as const))];
  const current = tabs.includes(tab) ? tab : tabs[0]!;
  const toggleInfo = () => {
    setInfoOpen(!infoOpen);
    if (!infoOpen) setTab('info');
  };
  const tabbed = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-end gap-1 border-b border-line px-2">
        <div role="tablist" aria-label={tr.baraj.tabsLabel} className="flex min-w-0 gap-0.5">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`baraj-tab-${t}`}
              aria-selected={current === t}
              aria-controls={`baraj-panel-${t}`}
              onClick={() => setTab(t)}
              className={`-mb-px h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${current === t ? 'border-accent text-ink' : 'border-transparent text-muted'}`}
            >
              {tr.baraj.tabs[t]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleInfo}
          className={`ml-auto flex h-11 shrink-0 items-center gap-1.5 self-center rounded-md px-2.5 font-medium text-muted hover:bg-panel-2 hover:text-ink ${
            stacked ? 'text-[13px]' : 'text-sm'
          }`}
        >
          <Icon name={infoOpen ? 'close' : 'book'} className="h-4 w-4" />
          {infoOpen ? tr.baraj.hideInfo : tr.baraj.showInfo}
        </button>
      </div>
      <div
        role="tabpanel"
        id={`baraj-panel-${current}`}
        aria-labelledby={`baraj-tab-${current}`}
        className={`min-h-0 flex-1 ${current === 'circuit' ? 'bg-paper' : 'overflow-y-auto overscroll-contain'}`}
      >
        {current === 'info' ? info : current === 'controls' ? controls : circuit(stacked ? 620 : undefined)}
      </div>
    </div>
  );

  // Sahne kutusu dar (telefon, tablet, küçük masaüstü): sol yamaç kırpılır, yazılar büyür.
  const compactScene = layout.kind === 'phone' || width < 1280;
  const scene = (
    <div className="relative h-full w-full overflow-hidden">
      <BarajSahnesi
        level={preview ?? level}
        wet={wet}
        lamps={lamps}
        mode={s.mode}
        running={running}
        layout={layout.kind === 'phone' ? 'phone' : compactScene ? 'tablet' : 'wide'}
        textPx={layout.kind === 'phone' ? 13 : 14.5}
        lampLabels={layout.kind !== 'phone'}
        onPreview={setPreview}
        onCommit={(v) => changeTank({ level: v })}
        className="h-full w-full"
      />
    </div>
  );

  if (stacked) {
    return (
      <div className="app-root flex flex-col overflow-hidden bg-panel">
        {header}
        <div className="shrink-0 border-b border-line bg-[#e9eef3]" style={{ height: 'min(38dvh, 300px)' }}>
          {scene}
        </div>
        {controlsRow}
        {tabbed}
      </div>
    );
  }

  return (
    <div className="app-root flex flex-col overflow-hidden bg-app">
      {header}
      <main className="grid min-h-0 flex-1 gap-3 p-3" style={{ gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(420px, 1.2fr)' : 'minmax(0, 1fr) minmax(320px, 1fr)' }}>
        <section aria-label={tr.baraj.sceneTitle} className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-panel">
          <div className="min-h-0 flex-1 bg-[#e9eef3]">{scene}</div>
          <div className="border-t border-line">{controlsRow}</div>
        </section>
        <section aria-label={tr.baraj.sideTitle} className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-panel">
          {wide && <div className="min-h-0 flex-[1.25] border-b border-line bg-paper">{circuit()}</div>}
          {/* Anlatım kapalıyken geniş ekranda kontroller içerikleri kadar yer alır (kaydırmadan görünür); kalan yer devrenin. */}
          <div className={`flex min-h-0 flex-col ${wide && !infoOpen ? 'max-h-[60%] shrink-0' : 'flex-1'}`}>{tabbed}</div>
        </section>
      </main>
    </div>
  );
}
