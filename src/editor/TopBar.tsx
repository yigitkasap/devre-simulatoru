// Üst çubuk (tasarım v3: D1–D3): logo, devrenin adı ▾ (Dosya), Örnekler; sağda Geri al, Yardım,
// Ayarlar, tam ekran; durum, Hız ve ana düğme. Tablette aynı çubuk dokunmatik boyutta. Telefonda
// PhoneShell'deki üst çubuk kullanılır. Tam ekran düğmesi tarayıcıyı tam ekrana alır ve defteri
// gizler (fullscreen.ts); tam ekranda çubuğun sağ ucunda defteri açıp kapatan düğme çıkar.

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { tr } from '../i18n/tr';
import { formatSI } from '../sim/units';
import type { SaveState } from './autosave';
import { voltageGradient } from './colors';
import type { FocusPanels } from './fullscreen';
import { Icon, type IconName } from './icons';
import type { Settings, ThemeChoice } from './settings';
import { SpeedOptions, speedLabel, StatusMark } from './SimBar';
import type { ViewMode } from './BenchView';
import { Logo } from './Logo';
import { MenuHeader, MenuItem, MenuPanel, MenuSeparator, useMenu } from './Menu';
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
      className={`flex shrink-0 items-center justify-center rounded-md transition-colors ${touch ? 'h-11 w-11 rounded-md' : 'h-10 w-10 desk:h-9 desk:w-9'} ${
        open ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-app'
      }`}
    >
      <Icon name={side === 'left' ? 'sideLeft' : 'sideRight'} />
    </button>
  );
}

/**
 * Kayıt durumu: yalnızca 16 px bulut-tik simgesi; ipucu ve ekran okuyucu metni "Tarayıcıda kaydedildi"
 * (otomatik kayıt, Kaydet düğmesi yok). Kaydedilemezse uyarı renginde.
 */
function SaveMark({ state }: { state: SaveState }) {
  const failed = state === 'failed';
  const text = failed ? tr.toolbar.saveFailed : tr.toolbar.saved;
  return (
    <span role="status" title={failed ? tr.toolbar.saveFailedTitle : text} className={`flex h-8 w-7 shrink-0 items-center justify-center ${failed ? 'text-warn' : 'text-muted'}`}>
      <Icon name="cloudCheck" className="h-4 w-4" />
      <span className="sr-only">{text}</span>
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

/**
 * Devre menüsü (devrenin adı ▾): Yeni devre, Bilgisayardan aç (Ctrl+O), Bilgisayara indir (Ctrl+S); Paylaş,
 * Görev oluştur, Karta aktar; altta otomatik kayıt satırı. Dosya türü (.json) indirme penceresinde görünür.
 */
function CircuitMenu(props: {
  title: string;
  touch: boolean;
  onNew: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onShare: () => void;
  onTask: () => void;
  onKarta: () => void;
  onSchematic: () => void;
}) {
  const menu = useMenu();
  const t = tr.topbar.circuit;
  const pick = (action: () => void) => () => {
    menu.setOpen(false);
    action();
  };
  return (
    <div ref={menu.rootRef} className="relative flex min-w-0">
      <button
        ref={menu.triggerRef}
        type="button"
        onClick={() => menu.setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={t.button(props.title)}
        title={props.title}
        className={`flex max-w-[360px] min-w-0 items-center gap-1 rounded-md pr-1.5 pl-2 text-sm font-medium ${props.touch ? 'h-11' : 'h-8'} ${
          menu.open ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-panel-2'
        }`}
      >
        <span className="truncate">{props.title}</span>
        <Icon name="chevronDown" className="h-4 w-4 shrink-0" />
      </button>
      {menu.open && (
        <MenuPanel menuRef={menu.menuRef} label={t.label}>
          <MenuHeader>{t.label}</MenuHeader>
          <MenuItem icon="fileNew" label={t.newCircuit} title={tr.file.newCircuitNote} touch={props.touch} onSelect={pick(props.onNew)} />
          <MenuItem icon="upload" label={t.open} shortcut="Ctrl+O" title={t.openNote} touch={props.touch} onSelect={pick(props.onOpen)} />
          <MenuItem icon="download" label={t.download} shortcut="Ctrl+S" title={t.downloadNote} touch={props.touch} onSelect={pick(props.onDownload)} />
          <MenuItem icon="printer" label={tr.schematicExport.menu} shortcut="Ctrl+P" title={tr.schematicExport.menuNote} touch={props.touch} onSelect={pick(props.onSchematic)} />
          <MenuSeparator />
          <MenuItem icon="share" label={t.share} title={tr.file.shareNote} touch={props.touch} onSelect={pick(props.onShare)} />
          <MenuItem icon="target" label={t.task} title={tr.task.menuNote} touch={props.touch} onSelect={pick(props.onTask)} />
          <MenuItem icon="board" label={t.karta} title={tr.karta.fileNote} touch={props.touch} onSelect={pick(props.onKarta)} />
          <MenuSeparator />
          <p className="flex items-center gap-2 px-2.5 py-1 text-label text-muted" title={tr.file.autosaveNote}>
            <Icon name="check" className="h-4 w-4 shrink-0 text-ok" />
            {t.autosave}
          </p>
        </MenuPanel>
      )}
    </div>
  );
}

/** Ayarlar penceresi (Daha fazla → Ayarlar…): Daha fazla düğmesinin altında açılır. */
function SettingsPanel({
  settings,
  onChange,
  touch,
  onWelcome,
  onShortcuts,
  onClose,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  touch: boolean;
  onWelcome: () => void;
  onShortcuts: () => void;
  onClose: () => void;
}) {
  const rootRef = useDismiss(true, (open) => {
    if (!open) onClose();
  });
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>('button, input, select')?.focus();
  }, [rootRef]);
  return (
    <div
      ref={rootRef}
      className="absolute top-[calc(100%+6px)] right-0 z-50 flex w-[380px] max-w-[calc(100vw-1rem)] flex-col gap-4 rounded-xl border border-line bg-panel px-[18px] py-4 shadow-lg"
      role="dialog"
      aria-label={tr.settings.title}
      // Esc yakalama aşamasında: içindeki alanların tuş işleyicileri olayı durdursa da pencere kapanır.
      onKeyDownCapture={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onClose();
      }}
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
          onClose();
          onWelcome();
        }}
        onShortcuts={() => {
          onClose();
          onShortcuts();
        }}
      />
    </div>
  );
}

/**
 * Daha fazla (⋯): en üstte Tema (Sistem / Açık / Koyu bölmeli düğme); Ayarlar…, Klavye kısayolları (?),
 * Yardım (F1), Kısa turu başlat, Tam ekran (F11).
 */
function MoreMenu(props: {
  touch: boolean;
  theme: ThemeChoice;
  appliedTheme: Theme;
  onTheme: (choice: ThemeChoice) => void;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  onShortcuts: () => void;
  onHelp: () => void;
  onWelcome: () => void;
  fullscreen: FullscreenControls;
}) {
  const menu = useMenu();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const themeId = useId();
  const t = tr.topbar.more;
  const pick = (action: () => void) => () => {
    menu.setOpen(false);
    action();
  };
  return (
    <div className="relative shrink-0">
      <div ref={menu.rootRef}>
        <button
          ref={menu.triggerRef}
          type="button"
          onClick={() => {
            setSettingsOpen(false);
            menu.setOpen((o) => !o);
          }}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          aria-label={t.button}
          title={t.button}
          className={`flex shrink-0 items-center justify-center rounded-md ${props.touch ? 'h-11 w-11' : 'h-8 w-8'} ${
            menu.open || settingsOpen ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-panel-2'
          }`}
        >
          <Icon name="more" />
        </button>
        {menu.open && (
          <MenuPanel menuRef={menu.menuRef} label={t.button} align="right">
            <div className="flex h-10 items-center justify-between gap-3 pr-1 pl-2.5">
              <span id={themeId} className="text-sm text-ink">
                {t.theme}
              </span>
              <div role="group" aria-labelledby={themeId} className="flex h-8 rounded-md bg-panel-2 p-0.5">
                {(['system', 'light', 'dark'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitemradio"
                    aria-checked={props.theme === c}
                    title={c === 'system' ? tr.theme.systemNote(props.appliedTheme) : tr.theme.notes[c]}
                    onClick={() => props.onTheme(c)}
                    className={`rounded-[6px] px-2.5 text-label font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      props.theme === c ? 'bg-panel text-ink ring-1 ring-line' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {tr.theme.options[c]}
                  </button>
                ))}
              </div>
            </div>
            <MenuSeparator />
            <MenuItem icon="settings" label={t.settings} touch={props.touch} onSelect={pick(() => setSettingsOpen(true))} />
            <MenuItem icon="keyboard" label={t.shortcuts} shortcut="?" touch={props.touch} onSelect={pick(props.onShortcuts)} />
            <MenuItem icon="help" label={t.help} shortcut="F1" touch={props.touch} onSelect={pick(props.onHelp)} />
            <MenuItem icon="flag" label={t.tour} touch={props.touch} onSelect={pick(props.onWelcome)} />
            <MenuItem
              icon={props.fullscreen.on ? 'fullscreenExit' : 'fullscreen'}
              label={props.fullscreen.on ? t.fullscreenExit : t.fullscreen}
              shortcut="F11"
              touch={props.touch}
              onSelect={pick(props.fullscreen.onToggle)}
            />
          </MenuPanel>
        )}
      </div>
      {settingsOpen && (
        <SettingsPanel
          settings={props.settings}
          onChange={props.onSettings}
          touch={props.touch}
          onWelcome={props.onWelcome}
          onShortcuts={props.onShortcuts}
          onClose={() => {
            setSettingsOpen(false);
            menu.triggerRef.current?.focus();
          }}
        />
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
        <div role="radiogroup" aria-label={tr.settings.resistorStyle} className="flex gap-0.5 rounded-md bg-seg p-0.5">
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
        <div role="radiogroup" aria-label={tr.settings.wireScale} className="flex flex-col gap-0.5 rounded-md bg-seg p-0.5">
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

// --- Masaüstü üst çubuğu (arayüz v4) ------------------------------------------------------------

export interface DeskTopBarProps {
  /** Devrenin adı (açık örneğin adı, yoksa "Devrem"); yanındaki ok devre menüsünü açar. */
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
  /** Şemayı indir / yazdır (PNG, SVG, yazdırma). */
  readonly onSchematic: () => void;
  /** Görev oluştur (C1, N6). */
  readonly onTask: () => void;
  readonly onExamples: () => void;
  /** Analiz çekmecesi (grafik, tablo, eğri izleyici, Bode): açık mı, aç / kapat. */
  readonly analysisOpen: boolean;
  readonly onAnalysis: () => void;
  /** Klavye kısayolları (?) ve Yardım (F1): yardım penceresi ilgili sekmede. */
  readonly onShortcuts: () => void;
  readonly onHelp: () => void;
  readonly onWelcome: () => void;
  /** Şema / 3B tezgâh seçimi; null: gösterilmez (Tahtada kur). */
  readonly view: { readonly mode: ViewMode; readonly onChange: (mode: ViewMode) => void } | null;
  /** Tablet: aynı çubuk dokunmatik boyutta (44 px düğmeler). */
  readonly touch?: boolean;
  /** Renk teması: seçim (Sistem / Açık / Koyu) ve şu an uygulanan. */
  readonly theme: ThemeChoice;
  readonly appliedTheme: Theme;
  readonly onTheme: (choice: ThemeChoice) => void;
}

/** Şema / 3B tezgâh bölmeli düğmesi (çubuğun ortasında; seçili beyaz). Dar pencerede "3B". */
function ViewSwitch({ mode, onChange, touch }: { mode: ViewMode; onChange: (mode: ViewMode) => void; touch: boolean }) {
  const item = (m: ViewMode, label: ReactNode) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => onChange(m)}
      className={`flex items-center rounded-[6px] px-3 text-sm font-medium whitespace-nowrap ${mode === m ? 'bg-panel text-ink ring-1 ring-line' : 'text-muted hover:text-ink'}`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={tr.toolbar.view} className={`flex shrink-0 rounded-md bg-panel-2 p-0.5 ${touch ? 'h-11' : 'h-8'}`}>
      {item('schematic', tr.bench.schematic)}
      {item(
        'bench',
        <>
          {tr.bench.bench}
          {/* Flex öğesinin baştaki boşluğu silinir: ara boşluk kenar payıyla. */}
          <span className="ml-[0.3em] max-mid:hidden">{tr.topbar.bench.slice(tr.bench.bench.length).trim()}</span>
        </>,
      )}
    </div>
  );
}

/**
 * Oynat ve çalışırken denetimler: aynı yerde, aynı yükseklikte. Kur kipinde yeşil Oynat (ikon + yazı);
 * çalışırken tek kenarlıklı grup: Duraklat (koyu zemin; duraklatınca Devam et), Durdur, ● süre, ×1 (hız
 * menüsü). Yuvanın genişliği sabit: Oynat'a basınca çubuktaki öbür öğeler yer değiştirmez.
 */
function RunControls(props: DeskTopBarProps & { touch: boolean }) {
  const { status, touch } = props;
  const running = status === 'running';
  const h = touch ? 'h-11' : 'h-9';
  return (
    <div role="region" aria-label={tr.sim.region} className={`flex shrink-0 justify-end ${touch ? 'w-[256px]' : 'w-[212px]'}`}>
      {status === 'stopped' ? (
        <button
          type="button"
          data-tour="play"
          onClick={props.onPlay}
          className={`flex shrink-0 items-center gap-2 rounded-md bg-ok pr-4 pl-3 text-sm font-semibold text-white hover:brightness-110 ${h}`}
        >
          <Icon name="play" className="h-4 w-4" />
          {tr.sim.play}
        </button>
      ) : (
        <div className={`flex w-full items-stretch rounded-md border border-line-2 bg-panel ${h}`}>
          <button
            type="button"
            data-tour="play"
            onClick={running ? props.onPause : props.onPlay}
            aria-label={running ? tr.sim.pause : tr.topbar.resume}
            title={running ? tr.sim.pause : tr.topbar.resume}
            className={`flex shrink-0 items-center justify-center rounded-l-[7px] ${touch ? 'w-11' : 'w-9'} ${running ? 'bg-ink text-on-ink hover:brightness-125' : 'bg-ok text-white hover:brightness-110'}`}
          >
            <Icon name={running ? 'pause' : 'play'} className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={props.onStop}
            aria-label={tr.sim.stop}
            title={tr.sim.stopTitle}
            className={`flex shrink-0 items-center justify-center border-l border-line-2 text-ink hover:bg-panel-2 ${touch ? 'w-11' : 'w-9'}`}
          >
            <Icon name="stop" className="h-4 w-4" />
          </button>
          <span
            role="status"
            title={props.lagging ? tr.sim.lagging : tr.sim.status[status]}
            className="flex min-w-0 flex-1 items-center gap-1.5 border-l border-line-2 px-2.5 text-small"
          >
            <StatusMark status={status} />
            <span className="sr-only">{tr.sim.status[status]}</span>
            <span className="truncate font-mono tabular">{formatSI(props.time, 's', { digits: 3 })}</span>
            {props.lagging && <Icon name="info" className="h-4 w-4 shrink-0 text-warn" />}
          </span>
          <SpeedMenu speed={props.speed} scopeSpeed={props.scopeSpeed} onSpeed={props.onSpeed} touch={touch} />
        </div>
      )}
    </div>
  );
}

/**
 * Masaüstü üst çubuğu (arayüz v4, 56 px): solda logo, "Devre Simülatörü", devrenin adı ▾ (devre menüsü) ve
 * kayıt simgesi; ortada Şema / 3B tezgâh; sağda Örnekler, Analiz, Geri al, Yinele, Daha fazla ve Oynat
 * (çalışırken denetim grubu). Yardım, tema, ayarlar ve tam ekran Daha fazla menüsünde. 1100 px'ten dar
 * pencerede site adı ve Örnekler / Analiz'in yazısı gizlenir.
 */
export function DeskTopBar(props: DeskTopBarProps) {
  const { status, touch = false } = props;
  const active = status !== 'stopped';
  const tool = (name: IconName, label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded-md text-ink enabled:hover:bg-panel-2 disabled:text-stopped ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
    >
      <Icon name={name} />
    </button>
  );
  const textTool = `flex shrink-0 items-center gap-1.5 rounded-md text-sm font-medium ${touch ? 'h-11 px-3 max-mid:w-11 max-mid:justify-center max-mid:px-0' : 'h-8 px-2.5 max-mid:w-8 max-mid:justify-center max-mid:px-0'}`;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-2">
        <Logo size={28} />
        <h1 className="shrink-0 text-[15px] font-semibold whitespace-nowrap max-mid:sr-only">{tr.site.name}</h1>
        <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
        <CircuitMenu
          title={props.title}
          touch={touch}
          onNew={props.onNew}
          onOpen={props.onImport}
          onDownload={props.onExport}
          onShare={props.onShare}
          onTask={props.onTask}
          onKarta={props.onKarta}
          onSchematic={props.onSchematic}
        />
        {props.saveState !== 'off' && <SaveMark state={props.saveState} />}
      </div>
      {props.view && <ViewSwitch mode={props.view.mode} onChange={props.view.onChange} touch={touch} />}
      <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-1">
        <button type="button" onClick={props.onExamples} aria-label={tr.examples.button} title={tr.examples.button} className={`${textTool} text-ink hover:bg-panel-2`}>
          <Icon name="book" className="h-4 w-4 shrink-0" />
          <span className="max-mid:hidden">{tr.examples.button}</span>
        </button>
        <button
          type="button"
          aria-pressed={props.analysisOpen}
          onClick={props.onAnalysis}
          aria-label={tr.analysis.button}
          title={tr.analysis.button}
          className={`${textTool} ${props.analysisOpen ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-panel-2'}`}
        >
          <Icon name="chart" className="h-4 w-4 shrink-0" />
          <span className="max-mid:hidden">{tr.analysis.button}</span>
        </button>
        <span className="mx-1.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
        {tool('undo', tr.toolbar.undo, props.onUndo, active || !props.canUndo)}
        {tool('redo', tr.toolbar.redo, props.onRedo, active || !props.canRedo)}
        <MoreMenu
          touch={touch}
          theme={props.theme}
          appliedTheme={props.appliedTheme}
          onTheme={props.onTheme}
          settings={props.settings}
          onSettings={props.onSettings}
          onShortcuts={props.onShortcuts}
          onHelp={props.onHelp}
          onWelcome={props.onWelcome}
          fullscreen={props.fullscreen}
        />
        <span className="w-2 shrink-0" aria-hidden="true" />
        <RunControls {...props} touch={touch} />
        {props.fullscreen.on && (
          <PanelToggle side="right" label={tr.toolbar.notebookPanel} open={props.fullscreen.panels.right} onPanel={props.fullscreen.onPanel} touch={touch} />
        )}
      </div>
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
        className={`flex shrink-0 items-center justify-center transition-colors ${touch ? 'h-11 w-11 rounded-md' : 'h-10 w-10 rounded-md'} ${
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

/** Çalışırken denetim grubundaki hız düğmesi (×1) ve menüsü: hazır hızlar radyo öğeleri, altta ince ayar. */
function SpeedMenu({ speed, scopeSpeed, onSpeed, touch }: { speed: number; scopeSpeed: number | null; onSpeed: (speed: number) => void; touch: boolean }) {
  const menu = useMenu();
  return (
    <div ref={menu.rootRef} className="relative flex shrink-0">
      <button
        ref={menu.triggerRef}
        type="button"
        onClick={() => menu.setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        aria-label={tr.phone.speedButton(speedLabel(speed))}
        title={tr.sim.speedTitle}
        className={`flex items-center rounded-r-[7px] border-l border-line-2 px-2.5 font-mono text-small font-semibold ${menu.open ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-panel-2'}`}
      >
        {speedLabel(speed)}
      </button>
      {menu.open && (
        <div ref={menu.menuRef} role="dialog" aria-label={tr.sim.speedDialog} className="absolute top-[calc(100%+6px)] right-0 z-50 w-[300px] rounded-lg border border-line bg-panel p-1.5 shadow-lg">
          <SpeedOptions speed={speed} scopeSpeed={scopeSpeed} onSpeed={onSpeed} touch={touch} compact />
        </div>
      )}
    </div>
  );
}
