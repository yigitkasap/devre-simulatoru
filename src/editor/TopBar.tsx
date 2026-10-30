// Üst çubuk (tasarım v3: D1–D3): logo, devrenin adı ▾ (Dosya), Örnekler; sağda Geri al, Yardım,
// Ayarlar, tam ekran; durum, Hız ve ana düğme. Tablette aynı çubuk dokunmatik boyutta. Telefonda
// PhoneShell'deki üst çubuk kullanılır. Tam ekran düğmesi tarayıcıyı tam ekrana alır ve defteri
// gizler (fullscreen.ts); tam ekranda çubuğun sağ ucunda defteri açıp kapatan düğme çıkar.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { tr } from '../i18n/tr';
import { formatSI } from '../sim/units';
import type { SaveState } from './autosave';
import { voltageGradient } from './colors';
import type { FocusPanels } from './fullscreen';
import { Icon, type IconName } from './icons';
import type { Settings, ThemeChoice } from './settings';
import { SpeedOptions, speedLabel, StatusMark } from './SimBar';
import type { Theme } from './theme';
import type { SimStatus } from './useSimulation';

/** Tam ekran düğmesi ve tam ekranda yan panellerin düğmeleri. */
export interface FullscreenControls {
  readonly on: boolean;
  readonly panels: FocusPanels;
  readonly onToggle: () => void;
  readonly onPanel: (side: keyof FocusPanels, open: boolean) => void;
}

/** Tam ekranda yan paneli açıp kapatan düğme (basılı = panel açık). */
function PanelToggle({ side, label, open, onPanel, touch = false }: { side: keyof FocusPanels; label: string; open: boolean; onPanel: FullscreenControls['onPanel']; touch?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onPanel(side, !open)}
      aria-label={label}
      title={label}
      aria-pressed={open}
      className={`flex shrink-0 items-center justify-center rounded-md transition-colors ${touch ? 'h-11 w-11 rounded-[10px]' : 'h-10 w-10 desk:h-9 desk:w-9'} ${
        open ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-app'
      }`}
    >
      <Icon name={side === 'left' ? 'sideLeft' : 'sideRight'} />
    </button>
  );
}

/** Sitenin simgesi: koyu kare üzerinde turuncu dalga. */
export function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0 max-desk:h-6 max-desk:w-6">
      <rect width="44" height="44" rx="9" fill="#1d2733" />
      <path
        d="M8 22c3.5-10 7-10 10.5 0s7 10 10.5 0 5-8 7-6"
        fill="none"
        stroke="#f05a28"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "Tarayıcıda kaydedildi": otomatik kaydın durumu (Kaydet düğmesi yok). */
function SaveStatus({ state }: { state: SaveState }) {
  const failed = state === 'failed';
  return (
    <span
      role="status"
      title={failed ? tr.toolbar.saveFailedTitle : tr.file.autosaveNote}
      className={`flex shrink-0 items-center gap-1.5 pr-1.5 text-small whitespace-nowrap ${failed ? 'text-warn' : 'text-muted'}`}
    >
      <Icon name={failed ? 'info' : 'saved'} className={`h-[18px] w-[18px] ${failed ? '' : 'text-ok'}`} />
      {/* Dar masaüstünde yalnızca simge (metin ekran okuyucuya kalır). */}
      <span className="max-wide:sr-only">{failed ? tr.toolbar.saveFailed : tr.toolbar.saved}</span>
    </span>
  );
}

/** Açılır menülerin ortak davranışı: dışarı tıklayınca ya da Esc ile kapanır. */
function useDismiss(open: boolean, setOpen: (open: boolean) => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return rootRef;
}

/** Menüde ok tuşlarıyla gezinme (yukarı/aşağı, Home/End). */
function menuKeys(e: ReactKeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem], [role=menuitemradio]')];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const go = (i: number) => {
    e.preventDefault();
    items[(i + items.length) % items.length]?.focus();
  };
  if (e.key === 'ArrowDown') go(index + 1);
  else if (e.key === 'ArrowUp') go(index - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(items.length - 1);
}

function FileMenu({
  onNew,
  onExport,
  onImport,
  onShare,
  onKarta,
  onTask,
  title,
}: {
  onNew: () => void;
  onExport: () => void;
  onImport: () => void;
  onShare: () => void;
  onKarta: () => void;
  onTask: () => void;
  /** Tablet: düğmede "Dosya" yerine devrenin adı (44 px). */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, setOpen);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  }, [open]);

  const items: Array<{ icon: IconName; label: string; note: string; action: () => void; divider?: boolean }> = [
    { icon: 'fileNew', label: tr.file.newCircuit, note: tr.file.newCircuitNote, action: onNew, divider: true },
    { icon: 'download', label: tr.file.exportJson, note: tr.file.exportNote, action: onExport },
    { icon: 'upload', label: tr.file.importJson, note: tr.file.importNote, action: onImport },
    { icon: 'share', label: tr.file.share, note: tr.file.shareNote, action: onShare, divider: true },
    { icon: 'board', label: tr.karta.open, note: tr.karta.fileNote, action: onKarta },
    { icon: 'target', label: tr.task.menu, note: tr.task.menuNote, action: onTask },
  ];
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={title ? tr.phone.fileButton(title) : undefined}
        className={`flex items-center gap-1 rounded-md pr-2 pl-2.5 font-medium ${title ? 'h-11 min-w-0 rounded-[10px] text-[15px] font-semibold' : 'h-9 text-sm'} ${
          open ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-app'
        }`}
      >
        <span className="truncate">{title ?? tr.file.menu}</span>
        <Icon name="chevronDown" className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={tr.file.menu}
          onKeyDown={menuKeys}
          className="absolute top-11 left-0 z-40 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-panel p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <div key={item.label}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.action();
                }}
                className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left text-body text-ink outline-none hover:bg-accent-soft focus-visible:bg-accent-soft"
              >
                <Icon name={item.icon} className="mt-px h-5 w-5 shrink-0" />
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="mt-px block text-[12.5px] leading-[1.35] text-muted">{item.note}</span>
                </span>
              </button>
              {item.divider && <div className="mx-2 my-1 h-px bg-line" aria-hidden="true" />}
            </div>
          ))}
          <div className="mx-1 mt-1.5 mb-0.5 flex items-start gap-2.5 rounded-md bg-panel-2 px-3 py-2.5 text-[12.5px] leading-[1.45] text-ink-2">
            <Icon name="saved" className="h-[18px] w-[18px] shrink-0 text-ok" />
            <span>{tr.file.autosaveNote}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsMenu({
  settings,
  onChange,
  touch = false,
  onWelcome,
  onShortcuts,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  touch?: boolean;
  onWelcome: () => void;
  onShortcuts: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, setOpen);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={tr.toolbar.settings}
        title={tr.toolbar.settings}
        aria-pressed={open || undefined}
        className={`flex shrink-0 items-center justify-center transition-colors ${touch ? 'h-11 w-11 rounded-[10px]' : 'h-10 w-10 rounded-md'} ${
          open ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-app'
        }`}
      >
        <Icon name="settings" />
      </button>
      {open && (
        <div
          className={`absolute right-0 z-40 flex flex-col gap-4 rounded-[14px] border border-line bg-panel px-[18px] py-4 shadow-[0_16px_40px_rgba(29,39,51,0.18)] ${touch ? 'top-12 w-[380px]' : 'top-11 w-[380px]'}`}
          role="dialog"
          aria-label={tr.settings.title}
        >
          <div className="flex items-center justify-between">
            <b className="text-base font-semibold">{tr.settings.title}</b>
            <span className="text-label text-muted">{tr.settings.stored}</span>
          </div>
          <SettingsFields
            settings={settings}
            onChange={onChange}
            touch={touch}
            onWelcome={() => {
              setOpen(false);
              onWelcome();
            }}
            onShortcuts={() => {
              setOpen(false);
              onShortcuts();
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Açma/kapama satırı (anahtar görünümünde; role="switch"). */
export function SwitchRow({
  label,
  note,
  checked,
  onChange,
  touch = false,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  touch?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 rounded-md text-left ${touch ? 'min-h-11 text-[15px]' : 'min-h-9 text-sm hover:bg-panel-2'}`}
    >
      <span>
        {label}
        {note && <span className={`block text-muted ${touch ? 'text-[12.5px]' : 'text-label'}`}>{note}</span>}
      </span>
      <span className={`relative shrink-0 rounded-full transition-colors ${checked ? 'bg-ok' : 'bg-line-2'} ${touch ? 'h-[30px] w-[50px]' : 'h-6 w-10'}`} aria-hidden="true">
        <i
          className={`absolute block rounded-full bg-white shadow transition-[left] ${touch ? 'top-[3px] h-6 w-6' : 'top-[3px] h-[18px] w-[18px]'} ${
            checked ? (touch ? 'left-[23px]' : 'left-[19px]') : 'left-[3px]'
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Ayar alanları (tasarım: M11): direnç sembolü, kablo gerilimi renkleri, düğüm gerilimleri, akım
 * noktaları ve elektron akışı; altta ilk açılış turu ve kısayollar. Masaüstünde Ayarlar menüsü,
 * tablette aynı menü dokunmatik boyutta, telefonda ⋯ sayfası.
 */
export function SettingsFields({
  settings,
  onChange,
  touch = false,
  onWelcome,
  onShortcuts,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  touch?: boolean;
  /** "İlk açılış turunu göster". */
  onWelcome?: () => void;
  /** "Kısayollar (?)": Yardım penceresi. */
  onShortcuts?: () => void;
}) {
  const section = `font-semibold text-muted ${touch ? 'text-label' : 'text-xs'}`;
  const segment = (selected: boolean) =>
    `flex flex-1 items-center justify-center gap-2 rounded-[7px] px-2 font-semibold ${touch ? 'h-11 text-sm' : 'h-9 text-small'} ${
      selected ? 'bg-panel text-ink shadow-sm' : 'text-seg-ink hover:bg-panel/40'
    }`;
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <span className={section}>{tr.settings.resistorStyle}</span>
        <div role="radiogroup" aria-label={tr.settings.resistorStyle} className="flex gap-0.5 rounded-[9px] bg-seg p-0.5">
          {(['zigzag', 'iec'] as const).map((style) => (
            <button key={style} type="button" role="radio" aria-checked={settings.resistorStyle === style} onClick={() => onChange({ resistorStyle: style })} className={segment(settings.resistorStyle === style)}>
              <svg viewBox="-44 -12 88 24" className="h-4 w-11" aria-hidden="true">
                {style === 'zigzag' ? (
                  <polyline points="-40,0 -24,0 -21,-7 -15,7 -9,-7 -3,7 3,-7 9,7 15,-7 21,7 24,0 40,0" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" />
                ) : (
                  <g stroke="currentColor" strokeWidth={2.4} fill="none">
                    <path d="M-40,0 H-22 M22,0 H40" />
                    <rect x={-22} y={-7} width={44} height={14} />
                  </g>
                )}
              </svg>
              {style === 'zigzag' ? tr.settings.zigzag : tr.settings.iec}
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <span className={section}>{tr.settings.wireScale}</span>
        <div role="radiogroup" aria-label={tr.settings.wireScale} className="flex flex-col gap-0.5 rounded-[9px] bg-seg p-0.5">
          {(['classic', 'colorblind'] as const).map((scale) => (
            <button
              key={scale}
              type="button"
              role="radio"
              aria-checked={settings.wireScale === scale}
              onClick={() => onChange({ wireScale: scale })}
              className={`${segment(settings.wireScale === scale)} justify-between! px-2.5`}
            >
              <span>{scale === 'classic' ? tr.settings.classic : tr.settings.colorblind}</span>
              <i className="block h-2 w-[110px] shrink-0 rounded-full" style={{ background: voltageGradient(scale) }} aria-hidden="true" />
            </button>
          ))}
        </div>
        <SwitchRow
          touch={touch}
          label={tr.settings.nodeVoltages}
          note={tr.settings.nodeVoltagesNote}
          checked={settings.nodeVoltages}
          onChange={(on) => onChange({ nodeVoltages: on })}
        />
      </section>
      <section className="flex flex-col gap-0.5">
        <span className={`${section} mb-1`}>{tr.settings.currentSection}</span>
        <SwitchRow touch={touch} label={tr.settings.currentDots} checked={settings.currentDots} onChange={(on) => onChange({ currentDots: on })} />
        <SwitchRow
          touch={touch}
          label={tr.sim.electronFlow}
          note={settings.electronFlow ? tr.sim.electronNote : undefined}
          checked={settings.electronFlow}
          onChange={(on) => onChange({ electronFlow: on })}
        />
        <SwitchRow touch={touch} label={tr.settings.sound} note={tr.settings.soundNote} checked={settings.sound} onChange={(on) => onChange({ sound: on })} />
        <SwitchRow
          touch={touch}
          label={tr.settings.magneticField}
          note={settings.magneticField ? tr.settings.magneticFieldNote : undefined}
          checked={settings.magneticField}
          onChange={(on) => onChange({ magneticField: on })}
        />
      </section>
      {(onWelcome || onShortcuts) && (
        <div className="flex flex-wrap gap-2 border-t border-app pt-3">
          {onWelcome && (
            <button
              type="button"
              onClick={onWelcome}
              className={`rounded-lg border border-line-2 bg-panel px-3 font-medium hover:bg-panel-2 ${touch ? 'h-11 text-sm' : 'h-9 text-small'}`}
            >
              {tr.settings.welcome}
            </button>
          )}
          {onShortcuts && (
            <button type="button" onClick={onShortcuts} className={`rounded-lg px-3 font-medium text-accent-ink hover:bg-accent-soft ${touch ? 'h-11 text-sm' : 'h-9 text-small'}`}>
              {tr.settings.shortcuts}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Masaüstü üst çubuğu (v3, "Defter") -------------------------------------------------------

export interface DeskTopBarProps {
  /** Devrenin adı (açık örneğin adı, yoksa "Devrem"); yanındaki ok Dosya menüsünü açar. */
  readonly title: string;
  readonly status: SimStatus;
  readonly time: number;
  readonly speed: number;
  /** Simülasyon istenen hıza yetişemiyor. */
  readonly lagging: boolean;
  readonly scopeSpeed: number | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly saveState: SaveState;
  readonly settings: Settings;
  readonly onSettings: (patch: Partial<Settings>) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStop: () => void;
  readonly onSpeed: (speed: number) => void;
  readonly fullscreen: FullscreenControls;
  readonly onNew: () => void;
  readonly onExport: () => void;
  readonly onImport: () => void;
  readonly onShare: () => void;
  readonly onKarta: () => void;
  /** Görev oluştur (C1, N6). */
  readonly onTask: () => void;
  readonly onExamples: () => void;
  /** Analiz çekmecesi (grafik, tablo, eğri izleyici, Bode): açık mı, aç / kapat. */
  readonly analysisOpen: boolean;
  readonly onAnalysis: () => void;
  readonly onHelp: () => void;
  readonly onWelcome: () => void;
  /** Tablet: aynı çubuk dokunmatik boyutta (44 px düğmeler). */
  readonly touch?: boolean;
  /** Renk teması: seçim (Sistem / Açık / Koyu) ve şu an uygulanan. */
  readonly theme: ThemeChoice;
  readonly appliedTheme: Theme;
  readonly onTheme: (choice: ThemeChoice) => void;
}

/**
 * Masaüstü üst çubuğu (tasarım v3: D1–D3, 60 px): logo, devrenin adı ▾ (Dosya), Örnekler; sağda Geri al
 * (Kur kipinde İleri al ve kayıt durumu da), Yardım, Ayarlar, tam ekran (kullanıcı kararı; çizimlerde
 * yok); çalışırken durum ve süre, Hız; ana düğme:
 * Kur kipinde yeşil Oynat, çalışırken koyu Duraklat ve yanında Durdur.
 */
export function DeskTopBar(props: DeskTopBarProps) {
  const { status, touch = false } = props;
  const active = status !== 'stopped';
  const running = status === 'running';
  const main = touch ? 'h-11' : 'h-[42px]';
  const icon = (name: IconName, label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded-md text-ink enabled:hover:bg-app disabled:text-stopped ${touch ? 'h-11 w-11' : 'h-10 w-10'}`}
    >
      <Icon name={name} />
    </button>
  );
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-line bg-panel pr-3 pl-4">
      <Logo />
      <h1 className="sr-only">{tr.site.name}</h1>
      <FileMenu title={props.title} onNew={props.onNew} onExport={props.onExport} onImport={props.onImport} onShare={props.onShare} onKarta={props.onKarta} onTask={props.onTask} />
      <button type="button" onClick={props.onExamples} className={`flex shrink-0 items-center rounded-md px-3 text-sm font-medium text-ink hover:bg-app ${touch ? 'h-11' : 'h-10'}`}>
        {tr.examples.button}
      </button>
      <button
        type="button"
        aria-pressed={props.analysisOpen}
        onClick={props.onAnalysis}
        className={`flex shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium ${touch ? 'h-11' : 'h-10'} ${props.analysisOpen ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink hover:bg-app'}`}
      >
        <Icon name="chart" className="h-[18px] w-[18px]" />
        {tr.analysis.button}
      </button>
      <span className="flex-1" />
      {!active && props.saveState !== 'off' && <SaveStatus state={props.saveState} />}
      {icon('undo', tr.toolbar.undo, props.onUndo, !props.canUndo)}
      {!active && icon('redo', tr.toolbar.redo, props.onRedo, !props.canRedo)}
      {icon('help', tr.help.open, props.onHelp)}
      <ThemeMenu choice={props.theme} theme={props.appliedTheme} onChange={props.onTheme} touch={touch} />
      <SettingsMenu settings={props.settings} onChange={props.onSettings} touch={touch} onWelcome={props.onWelcome} onShortcuts={props.onHelp} />
      {icon(props.fullscreen.on ? 'fullscreenExit' : 'fullscreen', props.fullscreen.on ? tr.toolbar.fullscreenExit : tr.toolbar.fullscreen, props.fullscreen.onToggle)}
      <span className="mx-1.5 h-7 w-px shrink-0 bg-line" aria-hidden="true" />
      <div role="region" aria-label={tr.sim.region} className="flex shrink-0 items-center gap-2">
        {active && (
          <>
            <span role="status" className="flex shrink-0 items-center gap-2 pr-1 text-small" title={props.lagging ? tr.sim.lagging : tr.sim.status[status]}>
              <StatusMark status={status} />
              <span className="sr-only">{tr.sim.status[status]}</span>
              <span className="inline-block min-w-[8ch] font-mono tabular">{formatSI(props.time, 's', { digits: 4 })}</span>
              {props.lagging && <Icon name="info" className="h-4 w-4 text-warn" />}
            </span>
            <SpeedButton speed={props.speed} scopeSpeed={props.scopeSpeed} onSpeed={props.onSpeed} touch={touch} />
          </>
        )}
        {running ? (
          <button
            type="button"
            data-tour="play"
            onClick={props.onPause}
            className={`flex shrink-0 items-center gap-2 rounded-[10px] bg-ink pr-4 pl-3 text-sm font-semibold text-on-ink hover:brightness-125 ${main}`}
          >
            <Icon name="pause" />
            {tr.sim.pause}
          </button>
        ) : (
          <button
            type="button"
            data-tour="play"
            onClick={props.onPlay}
            className={`flex shrink-0 items-center gap-2 rounded-[10px] bg-ok pr-[18px] pl-3.5 text-[15px] font-semibold text-white hover:brightness-110 ${main}`}
          >
            <Icon name="play" />
            {tr.sim.play}
          </button>
        )}
        {active && (
          <button
            type="button"
            onClick={props.onStop}
            aria-label={tr.sim.stop}
            title={tr.sim.stopTitle}
            className={`flex shrink-0 items-center justify-center rounded-[10px] border border-line-2 text-ink hover:bg-app ${touch ? 'h-11 w-11' : 'h-[42px] w-[42px]'}`}
          >
            <Icon name="stop" />
          </button>
        )}
      </div>
      {props.fullscreen.on && (
        <PanelToggle side="right" label={tr.toolbar.notebookPanel} open={props.fullscreen.panels.right} onPanel={props.fullscreen.onPanel} touch={touch} />
      )}
    </header>
  );
}

const THEME_ICONS: Record<ThemeChoice, IconName> = { system: 'themeSystem', light: 'sun', dark: 'moon' };

/** Tema düğmesi (güneş / ay / yarım daire) ve aşağı açılan seçim: Sistem, Açık, Koyu. */
export function ThemeMenu({ choice, theme, onChange, touch = false }: { choice: ThemeChoice; theme: Theme; onChange: (choice: ThemeChoice) => void; touch?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, setOpen);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) (menuRef.current?.querySelector<HTMLElement>('[aria-checked=true]') ?? menuRef.current?.querySelector<HTMLElement>('[role=menuitemradio]'))?.focus();
  }, [open]);
  const label = tr.theme.button(choice, theme);
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`flex shrink-0 items-center justify-center transition-colors ${touch ? 'h-11 w-11 rounded-[10px]' : 'h-10 w-10 rounded-md'} ${
          open ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-app'
        }`}
      >
        <Icon name={THEME_ICONS[choice]} />
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label={tr.theme.label} onKeyDown={menuKeys} className="absolute top-12 right-0 z-40 w-64 rounded-lg border border-line bg-panel p-1.5 shadow-lg">
          {(['system', 'light', 'dark'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="menuitemradio"
              aria-checked={choice === c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left outline-none hover:bg-accent-soft focus-visible:bg-accent-soft ${touch ? 'min-h-11' : 'min-h-10'}`}
            >
              <Icon name={THEME_ICONS[c]} className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium">{tr.theme.options[c]}</span>
                <span className="block text-[12.5px] leading-[1.35] text-muted">{c === 'system' ? tr.theme.systemNote(theme) : tr.theme.notes[c]}</span>
              </span>
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

/** Üst çubuktaki Hız düğmesi ve aşağı açılan hız penceresi. */
function SpeedButton({ speed, scopeSpeed, onSpeed, touch }: { speed: number; scopeSpeed: number | null; onSpeed: (speed: number) => void; touch: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, setOpen);
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const radios = groupRef.current?.querySelectorAll<HTMLElement>('[role=radio]');
    (groupRef.current?.querySelector<HTMLElement>('[aria-checked=true]') ?? radios?.[0])?.focus();
  }, [open]);
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={tr.sim.speedTitle}
        className={`flex items-center gap-1.5 rounded-[10px] border border-line px-2.5 text-small ${touch ? 'h-11' : 'h-10'} ${open ? 'bg-accent-soft' : 'hover:bg-app'}`}
      >
        {tr.sim.speed}
        <span className="font-mono font-semibold">{speedLabel(speed)}</span>
      </button>
      {open && (
        <div role="dialog" aria-label={tr.sim.speedDialog} className="absolute top-12 right-0 z-[60] w-[300px] rounded-lg border border-line bg-panel p-1.5 shadow-md">
          <SpeedOptions speed={speed} scopeSpeed={scopeSpeed} onSpeed={onSpeed} groupRef={groupRef} touch={touch} />
        </div>
      )}
    </div>
  );
}
