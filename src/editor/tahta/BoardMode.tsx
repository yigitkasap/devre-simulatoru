// Tahtada kur (T1–T6): şemadaki devre tepeden görünen breadboard'a kurulur. Bu dosya kipin tuval alanını
// (üst çubuk, Tepeden | 3B, tahta, masadaki cihazların kartları, araç çubuğu) ve sağ panelini (şema, parça
// kutusu, alet kabloları, Denetle) kurar. Kararlar docs/tasarim-v3/README.md → "Tahtada kur".
//
// Tepeden görünüm 3B sahnenin dik (ortografik) kamerasıdır (kullanıcı kararı); masadaki cihazlar bu
// görünümde ön panelleri ve uçları görünen düz kartlardır. 3B'de yalnızca bakılır.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { mountOf, netColors, type BreadboardPlan } from '../../bench3d/breadboard';
import { holeLabel } from '../../bench3d/holes';
import type { BenchScene } from '../../bench3d/scene';
import { tr } from '../../i18n/tr';
import type { Build } from '../../model/build';
import type { Connectivity } from '../../model/connectivity';
import type { CircuitDoc, Part } from '../../model/types';
import { BenchView, type BenchViewProps } from '../BenchView';
import { CircuitView } from '../CircuitView';
import { deviceSummary } from '../DeviceCards';
import { Icon, type IconName } from '../icons';
import { partValueText } from '../PartView';
import type { Settings } from '../settings';
import { BoardTop, type BoardCommands, type Placing } from './BoardTop';

export type { Placing } from './BoardTop';

export type BoardView = 'top' | 'bench';

const doc_part = (doc: CircuitDoc, id: string): Part | undefined => doc.parts.find((p) => p.id === id);

/** Tepeden görünümde sahnenin kenarlarında boş kalan alan (üst çubuk; altta araç çubuğu ve takma çubuğu; piksel). */
const TOP_INSETS = { top: 64, right: 16, bottom: 132, left: 16 } as const;

/** Tahtaya takılan parçalar (masadakiler ve toprak sembolü hariç), planın sırasıyla (soldan sağa). */
export function boardParts(doc: CircuitDoc, schematic: BreadboardPlan): Part[] {
  const order = [...schematic.onBoard.keys()];
  return doc.parts.filter((p) => mountOf(p.type) !== undefined).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** Masadaki parçanın ucunun kısa adı (kartta ve çipte): A, B, COM, 1+… */
export function terminalName(part: Part, pin: number): string {
  return tr.devices.pinTags[part.type]?.[pin] ?? String(pin + 1);
}

/** Masadaki parçaların tahtaya gitmesi gereken kabloları (şemada bağlı uçlar; planın sırasıyla). */
export function requiredLeads(schematic: BreadboardPlan): ReadonlyArray<{ readonly part: string; readonly pin: number; readonly net: string }> {
  return schematic.leads.map((l) => ({ part: l.partId, pin: l.pin, net: l.net }));
}

export interface BoardStageProps {
  readonly view: BoardView;
  readonly onView: (view: BoardView) => void;
  readonly showConnected: boolean;
  readonly onShowConnected: (on: boolean) => void;
  readonly onExit: () => void;
  /** Öğrencinin kurulumunun yerleşimi (tezgâh bununla çizilir). */
  readonly plan: BreadboardPlan;
  /** Şemanın planı: masadaki yerler, alet kablolarının listesi ve renkleri. */
  readonly schematicPlan: BreadboardPlan;
  /** 3B görünümün ortak özellikleri (BenchView). */
  readonly bench: Omit<BenchViewProps, 'plan' | 'top' | 'onScene' | 'overlayExtra' | 'unlabelled'>;
  readonly touch: boolean;
  /** Öğrencinin kurulumu ve değişince kaydı (geri al / yinele kapsar). */
  readonly build: Build;
  readonly onBuild: (build: Build) => void;
  readonly placing: Placing | null;
  readonly onPlacing: (placing: Placing | null) => void;
  /** Tahtada seçili (takılı) parça. */
  readonly selected: string | null;
  readonly onSelect: (partId: string | null) => void;
  /** Geri al / yinele (Ctrl+Z, Ctrl+Y; şema tuvali bu kipte yok). */
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

export function BoardStage(props: BoardStageProps) {
  const { view, plan, schematicPlan, bench, touch, build } = props;
  const [scene, setScene] = useState<BenchScene | null>(null);
  const [viewTick, setViewTick] = useState(0);
  const onView = useCallback(() => setViewTick((n) => n + 1), []);
  const [said, setSaid] = useState('');
  const commands = useRef<BoardCommands>(null);
  const selectedPart = props.selected && build.parts[props.selected] ? doc_part(bench.doc, props.selected) : undefined;
  const top = view === 'top';
  const doc = bench.doc;
  const tableIds = new Set(schematicPlan.table.keys());
  const colorOf = netColors(schematicPlan);

  // Masadaki cihazlar Tepeden görünümde düz kart; uçları (şemada bağlı olanlar) kartın üstünde.
  const cards: ReactNode = top
    ? [...schematicPlan.table.keys()].map((id) => {
        const part = doc.parts.find((p) => p.id === id);
        if (!part) return null;
        const summary = deviceSummary(part, null) ?? partValueText(part);
        return (
          <div
            key={`kart-${id}`}
            data-anchor="footprint"
            data-id={id}
            data-minw={170}
            data-h={104}
            aria-hidden="true"
            className="absolute top-0 left-0 flex flex-col items-center gap-1 overflow-hidden rounded-xl border border-line-2 bg-panel px-2 pt-2 text-center opacity-0 shadow-sm"
          >
            <span className="w-full truncate rounded-md bg-panel-2 px-2 py-1 text-[12px] leading-tight font-semibold">
              {part.label} · {tr.devices.names[part.type]}
              {summary && <span className="block truncate font-mono text-[11px] font-normal text-ink-2">{summary}</span>}
            </span>
          </div>
        );
      })
    : null;
  const terminals: ReactNode = top
    ? requiredLeads(schematicPlan).map(({ part, pin, net }) => {
        const p = doc.parts.find((q) => q.id === part);
        if (!p) return null;
        return (
          <span
            key={`uc-${part}-${pin}`}
            data-anchor="pin"
            data-exact=""
            data-id={part}
            data-pin={pin}
            aria-hidden="true"
            className="absolute top-0 left-0 flex h-[18px] w-[18px] items-center justify-center opacity-0"
          >
            <span className="absolute -top-[17px] font-mono text-[11px] font-semibold whitespace-nowrap text-ink-2">{terminalName(p, pin)}</span>
            <span className="h-[18px] w-[18px] rounded-full border-2 border-panel shadow-sm" style={{ background: colorOf(net) }} />
          </span>
        );
      })
    : null;

  // Geri al ve yinele kurulumu da kapsar (belgenin parçası).
  const history = useRef({ undo: props.onUndo, redo: props.onRedo });
  history.current = { undo: props.onUndo, redo: props.onRedo };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLocaleLowerCase('en');
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.current.undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        history.current.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Tepeden görünüm: tekerlekle imlecin olduğu yere yakınlaşır (kaydırma ve takma BoardTop'ta).
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!stage || !scene || !top) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      scene.zoomTop(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [stage, scene, top]);

  const h = touch ? 'h-11' : 'h-9';
  const tool = (icon: IconName, label: string, key: string, enabled: boolean, run?: () => void) => (
    <button
      type="button"
      disabled={!enabled}
      onClick={run}
      aria-keyshortcuts={key}
      className={`flex items-center gap-2 rounded-[10px] border border-line bg-panel px-3 text-small font-semibold text-ink shadow-sm hover:bg-panel-2 disabled:text-stopped disabled:hover:bg-panel ${touch ? 'h-11' : 'h-10'}`}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" />
      {label}
      <kbd className="rounded border border-line px-1 font-mono text-[11px] font-normal text-muted">{key}</kbd>
    </button>
  );

  return (
    <div ref={setStage} className="absolute inset-0 overflow-hidden" aria-label={tr.tahta.boardLabel(plan.cols)} role="region">
      <BenchView
        {...bench}
        callbacks={{ ...bench.callbacks, onView }}
        plan={plan}
        top={top ? TOP_INSETS : null}
        onScene={setScene}
        overlayExtra={
          <>
            {cards}
            {terminals}
          </>
        }
        {...(top ? { unlabelled: tableIds } : {})}
      />
      {top && (
        <BoardTop
          scene={scene}
          viewTick={viewTick}
          doc={bench.doc}
          build={build}
          placing={props.placing}
          onPlacing={props.onPlacing}
          selected={props.selected}
          onSelect={props.onSelect}
          showConnected={props.showConnected}
          onBuild={props.onBuild}
          announce={setSaid}
          touch={touch}
          commands={commands}
        />
      )}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>

      {/* Üst çubuk (T1): Tahtada kur · Tepeden | 3B ... Bağlı delikleri göster · Çık. */}
      <div className="pointer-events-none absolute top-3 right-3 left-3 z-20 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2">
          <span className={`flex items-center gap-2 rounded-[10px] bg-accent px-3 font-semibold text-white shadow-sm ${h} text-small`}>
            <Icon name="board" className="h-[18px] w-[18px]" />
            {tr.tahta.mode}
          </span>
          <div role="group" aria-label={tr.tahta.viewGroup} className="flex rounded-[10px] border border-line bg-panel p-[3px] shadow-sm">
            {(['top', 'bench'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => props.onView(v)}
                className={`flex items-center gap-1.5 rounded-md px-3 text-small font-semibold ${touch ? 'h-10' : 'h-8'} ${view === v ? 'bg-panel-2 text-ink shadow-sm' : 'text-ink-2 hover:bg-app'}`}
              >
                <Icon name={v === 'top' ? 'board' : 'chip'} className="h-4 w-4" />
                {v === 'top' ? tr.tahta.top : tr.tahta.bench}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {top && (
            <label className={`flex cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-panel px-3 text-small font-medium shadow-sm ${h}`}>
              {tr.tahta.showConnected}
              <input type="checkbox" role="switch" checked={props.showConnected} onChange={(e) => props.onShowConnected(e.target.checked)} className="peer sr-only" />
              <span aria-hidden="true" className="relative h-5 w-9 rounded-full bg-line-2 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${props.showConnected ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
            </label>
          )}
          <button type="button" onClick={props.onExit} aria-label={tr.tahta.exitLabel} className={`flex items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3 text-small font-semibold shadow-sm hover:bg-panel-2 ${h}`}>
            <Icon name="close" className="h-4 w-4" />
            {tr.tahta.exit}
          </button>
        </div>
      </div>

      {!top && (
        <p className="pointer-events-none absolute top-16 left-1/2 z-20 m-0 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/85 px-3.5 py-1.5 text-small whitespace-nowrap text-on-ink shadow-sm">
          <Icon name="info" className="h-4 w-4" />
          {tr.tahta.hint3d}
        </p>
      )}

      {top && (
        <>
          <div role="toolbar" aria-label={tr.tahta.toolbar} className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
            {tool('wire', tr.tahta.toolWire, 'K', false)}
            {tool('rotate', tr.tahta.toolRotate, 'R', selectedPart !== undefined, () => commands.current?.rotate())}
            {tool('trash', tr.tahta.toolDelete, 'Del', selectedPart !== undefined, () => commands.current?.remove())}
          </div>
          <div role="group" aria-label={tr.toolbar.view} className="absolute right-4 bottom-4 z-20 flex items-center rounded-[10px] border border-line bg-panel p-[3px] shadow-sm">
            {(
              [
                ['minus', tr.toolbar.zoomOut, () => scene?.zoomTop(0.8)],
                ['plus', tr.toolbar.zoomIn, () => scene?.zoomTop(1.25)],
                ['fit', tr.bench.fit, () => scene?.fitTop()],
              ] as const
            ).map(([icon, label, run]) => (
              <button key={icon} type="button" onClick={run} aria-label={label} title={label} className={`flex items-center justify-center rounded-md text-ink hover:bg-app ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}>
                <Icon name={icon} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export interface BoardPanelProps {
  readonly doc: CircuitDoc;
  /** Şemanın bağlantıları (küçük şema için). */
  readonly connectivity: Connectivity;
  readonly build: Build;
  readonly schematicPlan: BreadboardPlan;
  /** Açık örneğin grubu (ör. "Deney 9"); yoksa boş. */
  readonly group: string;
  readonly settings: Settings;
  readonly touch: boolean;
  /** Şemanın büyük görünümü açık (3B'deki küçük şemadan da açılır). */
  readonly large: boolean;
  readonly onLarge: (open: boolean) => void;
  readonly placing: Placing | null;
  /** Kutudaki parçayı takmaya başla (`dragging`: satırdan sürükleniyor). */
  readonly onPlace: (partId: string, dragging: boolean) => void;
  readonly selected: string | null;
  readonly onSelect: (partId: string | null) => void;
}

/** Sağ panel (T1): başlık, şema (değiştirilemez), parça kutusu, alet kabloları, Denetle. */
export function BoardPanel(props: BoardPanelProps) {
  const { doc, build, schematicPlan, touch, large } = props;
  const setLarge = props.onLarge;
  const parts = boardParts(doc, schematicPlan);
  const leads = requiredLeads(schematicPlan);
  const placed = parts.filter((p) => build.parts[p.id] !== undefined).length;
  const leadsPlaced = leads.filter((l) => build.leads.some((b) => b.part === l.part && b.pin === l.pin)).length;
  const colorOf = netColors(schematicPlan);
  const titleId = useId();

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="region" aria-label={tr.tahta.panelLabel}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-3">
        <header className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-label font-semibold text-accent-ink">
            <Icon name="board" className="h-4 w-4" />
            {tr.tahta.panelTag(props.group)}
          </span>
          <h2 id={titleId} className="m-0 text-[19px] leading-tight font-semibold">
            {tr.tahta.title}
          </h2>
          <p className="m-0 text-small leading-snug text-ink-2">{tr.tahta.intro}</p>
        </header>

        <section aria-label={tr.tahta.schematicLabel} className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-small">
            <span>
              <b className="font-semibold">{tr.tahta.schematic}</b> <span className="text-muted">· {tr.tahta.locked}</span>
            </span>
            <button type="button" onClick={() => setLarge(true)} className={`rounded-md px-2 font-medium text-accent-ink hover:bg-accent-soft ${touch ? 'h-11' : 'h-8'}`}>
              {tr.tahta.enlarge}
            </button>
          </div>
          <div className="h-[230px] bg-paper p-1.5">
            <CircuitView doc={doc} connectivity={props.connectivity} frame={null} settings={props.settings} label={tr.tahta.schematicLabel} className="block h-full w-full" />
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="m-0 flex items-center justify-between text-label font-semibold tracking-wide text-muted uppercase">
            {tr.tahta.parts}
            <span className="font-mono text-[12px] font-normal tracking-normal normal-case">{tr.tahta.placedCount(placed, parts.length)}</span>
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {parts.map((part) => {
              const at = build.parts[part.id];
              const value = partValueText(part);
              const isPlacing = props.placing?.partId === part.id;
              const isSelected = props.selected === part.id;
              return (
                <li key={part.id}>
                  <button
                    type="button"
                    aria-label={at ? undefined : tr.tahta.placePart(part.label)}
                    aria-pressed={isPlacing || isSelected}
                    onPointerDown={(e) => {
                      if (at || e.button !== 0 || e.pointerType !== 'mouse') return;
                      // Satırdan sürükleme: imleç tahtanın üstünde bırakılınca takılır (BoardTop).
                      const start = { x: e.clientX, y: e.clientY };
                      const onMove = (m: PointerEvent) => {
                        if (Math.hypot(m.clientX - start.x, m.clientY - start.y) < 6) return;
                        window.removeEventListener('pointermove', onMove);
                        props.onPlace(part.id, true);
                      };
                      window.addEventListener('pointermove', onMove);
                      window.addEventListener('pointerup', () => window.removeEventListener('pointermove', onMove), { once: true });
                    }}
                    onClick={() => (at ? props.onSelect(part.id) : props.onPlace(part.id, false))}
                    className={`flex w-full items-center gap-3 rounded-[10px] border px-3 text-left ${touch ? 'min-h-12' : 'min-h-11'} ${isPlacing || isSelected ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:bg-panel-2'} ${at ? '' : 'cursor-grab'}`}
                  >
                  <b className="w-12 shrink-0 text-small font-semibold">{part.label}</b>
                  <span className="min-w-0 flex-1 truncate text-small text-ink-2">
                    {tr.devices.names[part.type]}
                    {value ? ` ${value}` : ''}
                  </span>
                  {isPlacing ? (
                    <span className="font-mono text-[12px] font-semibold text-accent-ink">{props.placing?.first ? tr.tahta.placing(holeLabel(props.placing.first, build.cols)) : tr.tahta.placingFixed}</span>
                  ) : at ? (
                    <span className="flex items-center gap-1 font-mono text-[12px] text-ok-ink">
                      <Icon name="check" className="h-3.5 w-3.5" />
                      {at.holes.join(' · ')}
                    </span>
                  ) : (
                    <span className="text-small text-muted">{tr.tahta.inBox}</span>
                  )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="m-0 flex items-center justify-between text-label font-semibold tracking-wide text-muted uppercase">
            {tr.tahta.leads}
            {leads.length > 0 && <span className="font-mono text-[12px] font-normal tracking-normal normal-case">{tr.tahta.placedCount(leadsPlaced, leads.length)}</span>}
          </h3>
          {leads.length === 0 ? (
            <p className="m-0 text-small text-muted">{tr.tahta.leadsNone}</p>
          ) : (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {leads.map((l) => {
                const part = doc.parts.find((p) => p.id === l.part);
                if (!part) return null;
                const done = build.leads.some((b) => b.part === l.part && b.pin === l.pin);
                return (
                  <li key={`${l.part}-${l.pin}`} className={`flex items-center gap-1.5 rounded-full border px-2.5 font-mono text-[12px] ${touch ? 'h-11' : 'h-8'} ${done ? 'border-ok-line bg-ok-soft text-ok-ink' : 'border-line bg-panel text-ink'}`}>
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full ring-1 ring-line-2" style={{ background: colorOf(l.net) }} />
                    {part.label} {terminalName(part, l.pin)}
                    {done && <Icon name="check" className="h-3.5 w-3.5" />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-3">
        <button type="button" disabled className={`flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-accent font-semibold text-white disabled:opacity-60 ${touch ? 'h-12' : 'h-11'}`}>
          <Icon name="check" className="h-[18px] w-[18px]" />
          {tr.tahta.check}
        </button>
        <p className="m-0 w-1/2 text-label leading-snug text-muted">{tr.tahta.wiresNote(build.wires.length)}</p>
      </div>
      {large && <SchematicDialog doc={doc} connectivity={props.connectivity} settings={props.settings} onClose={() => setLarge(false)} />}
    </div>
  );
}

/** Şemanın büyük görünümü (değiştirilemez). */
function SchematicDialog({ doc, connectivity, settings, onClose }: { doc: CircuitDoc; connectivity: Connectivity; settings: Settings; onClose: () => void }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex h-full max-h-[760px] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-xl">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 id={titleId} className="m-0 text-body font-semibold">
            {tr.tahta.schematic} <span className="font-normal text-muted">· {tr.tahta.locked}</span>
          </h2>
          <button type="button" onClick={onClose} aria-label={tr.tahta.closeSchematic} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-app">
            <Icon name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-paper p-3">
          <CircuitView doc={doc} connectivity={connectivity} frame={null} settings={settings} label={tr.tahta.schematicLabel} className="block h-full w-full" />
        </div>
      </div>
    </div>
  );
}
