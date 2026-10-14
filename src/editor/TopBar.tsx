// Üst çubuk (tasarım: C-UstCubuk): Dosya, Örnekler, araç seçici (Seç / Kablo), seçili parça eylemleri,
// geri al / yinele, kayıt durumu, görünüm (yakınlık) ve Ayarlar. Tablette (T01, T02) sade ve dokunmatik
// boyutlu hâli: devrenin adı ▾ (Dosya), Örnekler, Geri al / Yinele, kip rozeti, sığdır ve Ayarlar.
// Telefonda üst şerit (PhoneTopStrip) ve alt çubuk (PhoneBar) kullanılır.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { tr } from '../i18n/tr';
import { formatSI } from '../sim/units';
import type { SaveState } from './autosave';
import { voltageGradient } from './colors';
import { Kbd } from './HintStrip';
import { Icon, type IconName } from './icons';
import type { Settings } from './settings';

/** Kare simge düğmesi (36 px; telefonda 40 px). */
export function ToolButton({
  icon,
  label,
  title,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-pressed={active || undefined}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors disabled:text-stopped desk:h-9 desk:w-9 ${
        active ? 'bg-accent-soft text-accent-ink' : 'text-ink enabled:hover:bg-app'
      }`}
    >
      <Icon name={icon} />
    </button>
  );
}

function Separator() {
  return <span className="mx-1.5 h-6 w-px shrink-0 bg-line max-desk:mx-0.5" aria-hidden="true" />;
}

export interface TopBarProps {
  readonly toolKind: 'select' | 'wire' | 'place';
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hasSelection: boolean;
  /** Seçimde ters çevrilebilen (yönlü) bir parça var mı? */
  readonly canFlip: boolean;
  /** Tuvalin yakınlığı (1 = %100). */
  readonly zoom: number;
  readonly saveState: SaveState;
  readonly settings: Settings;
  readonly onSettings: (patch: Partial<Settings>) => void;
  readonly onSelectTool: () => void;
  readonly onWireTool: () => void;
  readonly onRotate: () => void;
  readonly onFlip: () => void;
  readonly onDelete: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  readonly onNew: () => void;
  readonly onExport: () => void;
  readonly onImport: () => void;
  readonly onShare: () => void;
  readonly onExamples: () => void;
  readonly onHelp: () => void;
  readonly onWelcome: () => void;
}

/** Sitenin simgesi: koyu kare üzerinde turuncu dalga. */
function Logo() {
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

export function TopBar(props: TopBarProps) {
  const tools = (
    <>
      <div role="group" aria-label={tr.toolbar.tools} className="flex shrink-0 gap-0.5 rounded-[10px] bg-app p-0.5">
        <ToolSegment
          icon="pointer"
          label={tr.toolbar.select}
          title={tr.toolbar.selectTitle}
          active={props.toolKind === 'select'}
          onClick={props.onSelectTool}
        />
        <ToolSegment
          icon="wire"
          label={tr.toolbar.wire}
          title={tr.toolbar.wireTitle}
          active={props.toolKind === 'wire'}
          onClick={props.onWireTool}
          shortcut="W"
        />
      </div>
      <Separator />
      <ToolButton
        icon="rotate"
        label={tr.toolbar.rotate}
        title={tr.toolbar.rotateTitle}
        onClick={props.onRotate}
        disabled={!props.hasSelection && props.toolKind !== 'place'}
      />
      <ToolButton icon="flip" label={tr.toolbar.flip} title={tr.toolbar.flipTitle} onClick={props.onFlip} disabled={!props.canFlip} />
      <ToolButton icon="trash" label={tr.toolbar.remove} title={tr.toolbar.removeTitle} onClick={props.onDelete} disabled={!props.hasSelection} />
      <Separator />
      <ToolButton icon="undo" label={tr.toolbar.undo} title={tr.toolbar.undoTitle} onClick={props.onUndo} disabled={!props.canUndo} />
      <ToolButton icon="redo" label={tr.toolbar.redo} title={tr.toolbar.redoTitle} onClick={props.onRedo} disabled={!props.canRedo} />
    </>
  );

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-1.5 border-b border-line bg-panel pr-2.5 pl-3">
      <div className="flex shrink-0 items-center gap-2.5 pr-1.5 max-desk:gap-2 max-desk:pr-0.5">
        <Logo />
        <h1 className="text-[15px] font-semibold whitespace-nowrap max-wide:sr-only">{tr.site.name}</h1>
      </div>

      <FileMenu onNew={props.onNew} onExport={props.onExport} onImport={props.onImport} onShare={props.onShare} />
      <button
        type="button"
        onClick={props.onExamples}
        title={tr.examples.dialogTitle}
        aria-label={tr.examples.button}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink hover:bg-app max-desk:w-10 max-desk:justify-center max-desk:px-0 desk:h-9"
      >
        <Icon name="book" />
        <span className="max-desk:sr-only">{tr.examples.button}</span>
      </button>
      <Separator />

      {tools}
      <div className="flex-1" />
      <SaveStatus state={props.saveState} />
      <div role="group" aria-label={tr.toolbar.view} className="flex h-9 shrink-0 items-center rounded-[9px] border border-line">
        <ViewButton icon="minus" label={tr.toolbar.zoomOut} onClick={props.onZoomOut} />
        <span
          className="min-w-12 text-center font-mono text-small font-medium tabular"
          aria-label={`${tr.toolbar.zoom} %${Math.round(props.zoom * 100)}`}
        >
          %{Math.round(props.zoom * 100)}
        </span>
        <ViewButton icon="plus" label={tr.toolbar.zoomIn} onClick={props.onZoomIn} />
        <span className="h-5 w-px bg-line" aria-hidden="true" />
        <ViewButton icon="fit" label={tr.toolbar.fit} onClick={props.onFit} />
      </div>

      <ToolButton icon="help" label={tr.help.open} title={tr.help.openTitle} onClick={props.onHelp} />
      <SettingsMenu settings={props.settings} onChange={props.onSettings} onWelcome={props.onWelcome} onShortcuts={props.onHelp} />
    </header>
  );
}

/** Seç / Kablo araç seçicisindeki düğme (seçili olan beyaz zeminde). */
function ToolSegment({
  icon,
  label,
  title,
  active,
  onClick,
  shortcut,
}: {
  icon: IconName;
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md text-sm font-medium transition-colors ${
        shortcut ? 'pr-2 pl-2.5' : 'px-2.5'
      } ${active ? 'bg-panel text-accent-ink shadow-sm' : 'text-ink hover:bg-panel/60'}`}
    >
      <Icon name={icon} />
      {label}
      {shortcut && (
        <span className="max-wide:hidden">
          <Kbd size="sm">{shortcut}</Kbd>
        </span>
      )}
    </button>
  );
}

function ViewButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-[34px] w-[34px] items-center justify-center rounded-[8px] text-ink hover:bg-app"
    >
      <Icon name={icon} />
    </button>
  );
}

/** Tablet: 44 px kare simge düğmesi. */
function TouchIconButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] disabled:text-stopped ${
        active ? 'bg-accent-soft text-accent-ink' : 'text-ink enabled:active:bg-app'
      }`}
    >
      <Icon name={icon} />
    </button>
  );
}

export interface TabletTopBarProps {
  readonly title: string;
  readonly mode: 'kur' | 'bagla' | 'olc' | 'pause';
  readonly time: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly saveState: SaveState;
  readonly settings: Settings;
  readonly onSettings: (patch: Partial<Settings>) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onFit: () => void;
  readonly onNew: () => void;
  readonly onExport: () => void;
  readonly onImport: () => void;
  readonly onShare: () => void;
  readonly onExamples: () => void;
  readonly onHelp: () => void;
  readonly onWelcome: () => void;
}

const MODE_CHIP: Record<TabletTopBarProps['mode'], string> = {
  kur: 'bg-app text-ink-2',
  bagla: 'bg-accent-soft text-accent-ink',
  olc: 'bg-ok-soft text-ok-ink',
  pause: 'bg-warn-soft text-warn',
};

/** Tabletin üst çubuğu (tasarım: T01, T02). */
export function TabletTopBar(props: TabletTopBarProps) {
  const timed = props.mode === 'olc' || props.mode === 'pause';
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-panel pr-2 pl-3" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <Logo />
      <h1 className="sr-only">{tr.site.name}</h1>
      <FileMenu title={props.title} onNew={props.onNew} onExport={props.onExport} onImport={props.onImport} onShare={props.onShare} />
      <button
        type="button"
        onClick={props.onExamples}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[15px] font-medium text-ink active:bg-app"
      >
        <Icon name="book" />
        {tr.examples.button}
      </button>
      <span className="mx-1.5 h-7 w-px shrink-0 bg-line" aria-hidden="true" />
      <TouchIconButton icon="undo" label={tr.toolbar.undo} onClick={props.onUndo} disabled={!props.canUndo} />
      <TouchIconButton icon="redo" label={tr.toolbar.redo} onClick={props.onRedo} disabled={!props.canRedo} />
      <span className="flex-1" />
      <span
        role="status"
        className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-3 text-small font-semibold whitespace-nowrap ${MODE_CHIP[props.mode]}`}
      >
        {props.mode === 'olc' && <i className="block h-2 w-2 rounded-full bg-ok" aria-hidden="true" />}
        {tr.phone.modes[props.mode]}
        {timed && <span className="font-mono font-medium tabular">· {formatSI(props.time, 's', { digits: 4 })}</span>}
      </span>
      <SaveStatus state={props.saveState} />
      <TouchIconButton icon="fit" label={tr.toolbar.fit} onClick={props.onFit} />
      <TouchIconButton icon="help" label={tr.help.open} onClick={props.onHelp} />
      <SettingsMenu settings={props.settings} onChange={props.onSettings} touch onWelcome={props.onWelcome} onShortcuts={props.onHelp} />
    </header>
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
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')];
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
  title,
}: {
  onNew: () => void;
  onExport: () => void;
  onImport: () => void;
  onShare: () => void;
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
    { icon: 'share', label: tr.file.share, note: tr.file.shareNote, action: onShare },
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
      {touch ? (
        <TouchIconButton icon="settings" label={tr.toolbar.settings} onClick={() => setOpen((o) => !o)} active={open} />
      ) : (
        <ToolButton icon="settings" label={tr.toolbar.settings} title={tr.toolbar.settings} onClick={() => setOpen((o) => !o)} active={open} />
      )}
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
