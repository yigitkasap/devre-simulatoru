// Tahtada kur (T1–T6): şemadaki devre tepeden görünen breadboard'a kurulur. Bu dosya kipin tuval alanını
// (üst çubuk, Tepeden | 3B, tahta, masadaki cihazların kartları, araç çubuğu) ve sağ panelini (şema, parça
// kutusu, alet kabloları, Denetle) kurar. Kararlar docs/tasarim-v3/README.md → "Tahtada kur".
//
// Tepeden görünüm 3B sahnenin dik (ortografik) kamerasıdır (kullanıcı kararı); masadaki cihazlar bu
// görünümde ön panelleri ve uçları görünen düz kartlardır. 3B'de yalnızca bakılır.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { mountOf, netColors, type BreadboardPlan } from '../../bench3d/breadboard';
import { holeLabel } from '../../bench3d/holes';
import type { BenchScene } from '../../bench3d/scene';
import { tr } from '../../i18n/tr';
import { WIRE_COLORS, type Build, type WireColor } from '../../model/build';
import { recolorWire } from '../../tahta/wiring';
import type { Connectivity } from '../../model/connectivity';
import { partBounds } from '../../model/geometry';
import { GRID, type CircuitDoc, type Part } from '../../model/types';
import type { Problem } from '../../tahta/check';
import { countWord, formatDuration, problemShort, problemText, problemTitle } from '../../tahta/explain';
import { levelOf, maxLevel, sessionStats, solved, type BoardSession } from '../../tahta/session';
import { BenchView, type BenchViewProps } from '../BenchView';
import { CircuitView } from '../CircuitView';
import { deviceSummary } from '../DeviceCards';
import { Icon, type IconName } from '../icons';
import { partValueText } from '../PartView';
import type { Settings } from '../settings';
import { BoardTop, pickedIn, Swatch, terminalName, type BoardCommands, type BoardGhost, type BoardMark, type Cabling, type Pick, type Placing } from './BoardTop';

export type { Cabling, Placing } from './BoardTop';
export { terminalName } from './BoardTop';

export type BoardView = 'top' | 'bench';

const doc_part = (doc: CircuitDoc, id: string): Part | undefined => doc.parts.find((p) => p.id === id);

/**
 * Tepeden görünümde sahnenin kenarlarında boş kalan alan (piksel): üstte çubuk (12 + 36), altta araç çubuğu
 * (16 + 40) ve üstündeki takma / Denetle çipi (alttan 72 px'te, 44 px).
 */
const TOP_INSETS = { top: 56, right: 16, bottom: 120, left: 16 } as const;
/** Telefonda (T5): tahta, üst çubuk ile küçük alt sayfa arasına yüksekliğiyle sığar; yatay kaydırılır. */
const PHONE_INSETS = { top: 60, right: 8, bottom: 214, left: 8, boardOnly: true } as const;

/** Tahtaya takılan parçalar (masadakiler ve toprak sembolü hariç), planın sırasıyla (soldan sağa). */
export function boardParts(doc: CircuitDoc, schematic: BreadboardPlan): Part[] {
  const order = [...schematic.onBoard.keys()];
  return doc.parts.filter((p) => mountOf(p.type) !== undefined).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** Örnek yerleşim (4. kademe): planBreadboard'un o parça için delikleri, ucun kısa adıyla ("C 2h"). */
export function exampleHoles(doc: CircuitDoc, plan: BreadboardPlan, partId: string): { lead: boolean; holes: { hole: string; tag: string }[]; extra: string[] } | null {
  const part = doc_part(doc, partId);
  if (!part) return null;
  const at = plan.onBoard.get(partId);
  if (at) return { lead: false, holes: at.holes.map((h, i) => ({ hole: holeLabel(h, plan.cols), tag: terminalName(part, i) })), extra: (at.extraHoles ?? []).map((h) => holeLabel(h, plan.cols)) };
  const leads = plan.leads.filter((l) => l.partId === partId);
  return leads.length > 0 ? { lead: true, holes: leads.map((l) => ({ hole: holeLabel(l.hole, plan.cols), tag: terminalName(part, l.pin) })), extra: [] } : null;
}

/** Örnek yerleşimin yazısı: "1: 2c · 2: 6c", "C: 2h · B: 3h · E: 4h". */
export function exampleText(doc: CircuitDoc, plan: BreadboardPlan, partId: string): string {
  return (exampleHoles(doc, plan, partId)?.holes ?? []).map(({ tag, hole }) => `${tag}: ${hole}`).join(' · ');
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
  /** Çık; görevde yok (T6: çıkış düğmesi görevde gizli). */
  readonly onExit?: () => void;
  /** Görevde "Bağlı delikleri göster" kapalı: anahtar gizli. */
  readonly connectedLocked?: boolean;
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
  readonly cabling: Cabling | null;
  readonly onCabling: (cabling: Cabling | null) => void;
  /** Tahtada seçili (takılı) parça. */
  readonly selected: string | null;
  readonly onSelect: (partId: string | null) => void;
  /** Denetle oturumu: sorunlar ve ipucu kademeleri (tahtadaki işaretler). */
  readonly session: BoardSession | null;
  /** Kurulumun karşılaştırma anahtarı (sonuç eskidi mi). */
  readonly buildKey: string;
  readonly onMarks: (on: boolean) => void;
  /** Geri al / yinele (Ctrl+Z, Ctrl+Y; şema tuvali bu kipte yok). */
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  /** Telefon (T5): sıkışık üst çubuk, tahta yüksekliğine sığar; araçlar ve sonuç alttaki sayfada. */
  readonly phone?: boolean;
  /** Tahtanın komutları (telefonda alttaki sayfa da kullanır: Kablo, delik adı yaz). */
  readonly commands?: RefObject<BoardCommands | null>;
}

export function BoardStage(props: BoardStageProps) {
  const { view, plan, schematicPlan, bench, touch, build } = props;
  const [scene, setScene] = useState<BenchScene | null>(null);
  const [viewTick, setViewTick] = useState(0);
  const onView = useCallback(() => setViewTick((n) => n + 1), []);
  const [said, setSaid] = useState('');
  const ownCommands = useRef<BoardCommands>(null);
  const commands = props.commands ?? ownCommands;
  const phone = props.phone ?? false;
  const selectedPart = props.selected && build.parts[props.selected] ? doc_part(bench.doc, props.selected) : undefined;
  // Seçili kablo (tahtada tıklanan); parça seçilince ya da kablo aracı açılınca kalkar.
  const [pick, setPick] = useState<Pick | null>(null);
  const picked = pickedIn(build, pick);
  useEffect(() => {
    if (props.selected || props.cabling || props.placing) setPick(null);
  }, [props.selected, props.cabling, props.placing]);
  const [palette, setPalette] = useState(false);
  const wireMode = props.cabling?.kind === 'wire' ? props.cabling : null;
  const pickedWire = picked?.kind === 'wire' ? build.wires[picked.index] : undefined;
  const showColor = wireMode !== null || pickedWire !== undefined;
  const currentColor: WireColor | null = wireMode ? wireMode.color : (pickedWire?.color ?? null);
  useEffect(() => {
    if (!showColor) setPalette(false);
  }, [showColor]);
  const chooseColor = (color: WireColor | null) => {
    setPalette(false);
    if (wireMode) props.onCabling({ ...wireMode, color });
    else if (picked?.kind === 'wire' && color) {
      props.onBuild(recolorWire(build, picked.index, color));
      setSaid(tr.tahta.wireRecolored(tr.tahta.colors[color] ?? color));
    }
  };
  const top = view === 'top';
  const doc = bench.doc;
  // Tepeden görünümde 3B etiketleri yok: parça etiketi yalnızca imleç üstündeyken ya da seçiliyken, tahtanın
  // orta kanalında (BoardTop); masadaki cihazların kartı var.
  const allIds = new Set(doc.parts.map((p) => p.id));
  const colorOf = netColors(schematicPlan);

  // Denetle (T3): yeri açılmış sorunlar tahtada kırmızı çerçeve ve numarayla; 4. kademede örnek yerleşim.
  // İşaretler görünürken parça etiketleri gizlenir (T3: etiket yok, işaretler okunur).
  const d = tr.tahta.denetle;
  const session = props.session;
  const problems = session?.result?.problems ?? [];
  const located = problems.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => session !== null && levelOf(session, p) >= 2);
  const showMarks = session?.marks ?? true;
  const boardMarks: BoardMark[] = showMarks
    ? located.flatMap(({ p, n }): BoardMark[] => {
        if (p.wire) return [{ n, holes: [p.wire.a, p.wire.b], terminals: [], wire: true }];
        const placed = p.part ? build.parts[p.part] : undefined;
        if (placed) return [{ n, holes: [...placed.holes, ...(placed.extra ?? [])], terminals: [], wire: false }];
        if (p.inBox || !p.part) return [];
        return [{ n, holes: p.pins.flatMap((q) => (q.hole ? [q.hole] : [])), terminals: p.pins.filter((q) => q.hole === null).map((q) => ({ part: p.part!, pin: q.pin })), wire: false }];
      })
    : [];
  const ghosts: BoardGhost[] = showMarks
    ? located.flatMap(({ p }): BoardGhost[] => {
        const part = p.part ? doc_part(doc, p.part) : undefined;
        if (!part || !session || levelOf(session, p) < 4) return [];
        const at = exampleHoles(doc, schematicPlan, part.id);
        return at ? [{ label: part.label, ...at }] : [];
      })
    : [];

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
            <span className="h-[18px] w-[18px] rounded-full border-2 border-panel shadow-sm ring-1 ring-ink-2/60" style={{ background: colorOf(net) }} />
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
  const tool = (icon: IconName, label: string, key: string, enabled: boolean, run?: () => void, pressed?: boolean) => (
    <button
      type="button"
      disabled={!enabled}
      onClick={run}
      aria-keyshortcuts={key}
      {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      className={`flex items-center gap-2 rounded-[10px] border px-3 text-small font-semibold shadow-sm disabled:text-stopped disabled:hover:bg-panel ${pressed ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-panel text-ink hover:bg-panel-2'} ${touch ? 'h-11' : 'h-10'}`}
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
        inBoard
        top={top ? (phone ? PHONE_INSETS : TOP_INSETS) : null}
        onScene={setScene}
        overlayExtra={
          <>
            {cards}
            {terminals}
          </>
        }
        {...(top ? { unlabelled: allIds } : {})}
      />
      {top && (
        <BoardTop
          scene={scene}
          viewTick={viewTick}
          doc={bench.doc}
          build={build}
          placing={props.placing}
          onPlacing={props.onPlacing}
          cabling={props.cabling}
          onCabling={props.onCabling}
          pick={picked}
          onPick={setPick}
          selected={props.selected}
          onSelect={props.onSelect}
          marks={boardMarks}
          ghosts={ghosts}
          showConnected={props.showConnected}
          onBuild={props.onBuild}
          announce={setSaid}
          touch={touch}
          phone={phone}
          commands={commands}
        />
      )}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>

      {/* Telefonda üst çubuk (T5): Tahtada kur · Tepeden | 3B · Şema · ✕. */}
      {phone && (
        <div className="absolute top-2 right-2 left-2 z-20 flex items-center gap-1.5">
          <span className="flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-accent px-2.5 text-[13px] font-semibold text-white shadow-sm">
            <Icon name="board" className="h-4 w-4" />
            {tr.tahta.mode}
          </span>
          <div role="group" aria-label={tr.tahta.viewGroup} className="flex shrink-0 rounded-[10px] border border-line bg-panel p-[2px] shadow-sm">
            {(['top', 'bench'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => props.onView(v)}
                className={`flex h-11 min-w-11 items-center justify-center rounded-md px-2.5 text-[13px] font-semibold ${view === v ? 'bg-panel-2 text-ink shadow-sm' : 'text-ink-2'}`}
              >
                {v === 'top' ? tr.tahta.top : tr.tahta.bench}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button type="button" onClick={() => bench.onSchematic?.()} className="flex h-11 shrink-0 items-center rounded-full border border-line bg-panel px-3 text-[13px] font-semibold shadow-sm">
            {tr.tahta.schematic}
          </button>
          {props.onExit && (
            <button type="button" onClick={props.onExit} aria-label={tr.tahta.exitLabel} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink">
              <Icon name="close" className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* Üst çubuk (T1): Tahtada kur · Tepeden | 3B ... Bağlı delikleri göster · Çık. */}
      {!phone && <div className="pointer-events-none absolute top-3 right-3 left-3 z-20 flex items-start justify-between gap-2">
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
          {top && !props.connectedLocked && (
            <label className={`flex cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-panel px-3 text-small font-medium shadow-sm ${h}`}>
              {tr.tahta.showConnected}
              <input type="checkbox" role="switch" checked={props.showConnected} onChange={(e) => props.onShowConnected(e.target.checked)} className="peer sr-only" />
              <span aria-hidden="true" className="relative h-5 w-9 rounded-full bg-line-2 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${props.showConnected ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
            </label>
          )}
          {solved(props.session, props.buildKey) && (
            <span className={`flex items-center gap-1.5 rounded-[10px] border border-ok-line bg-ok-soft px-3 text-small font-semibold text-ok-ink shadow-sm ${h}`}>
              <Icon name="check" className="h-4 w-4" />
              {tr.tahta.denetle.solvedPill}
            </span>
          )}
          {props.onExit && (
            <button type="button" onClick={props.onExit} aria-label={tr.tahta.exitLabel} className={`flex items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3 text-small font-semibold shadow-sm hover:bg-panel-2 ${h}`}>
              <Icon name="close" className="h-4 w-4" />
              {tr.tahta.exit}
            </button>
          )}
        </div>
      </div>}

      {!top && (
        <p className={`pointer-events-none absolute left-1/2 z-20 m-0 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-full bg-ink/85 px-3.5 py-1.5 text-small text-on-ink shadow-sm ${phone ? 'top-[60px]' : 'top-16 whitespace-nowrap'}`}>
          <Icon name="info" className="h-4 w-4" />
          {tr.tahta.hint3d}
        </p>
      )}

      {top && !phone && (
        <>
          <div role="toolbar" aria-label={tr.tahta.toolbar} className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
            {tool('wire', tr.tahta.toolWire, 'K', true, () => commands.current?.toggleWire(), wireMode !== null)}
            {showColor && (
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={palette}
                  aria-label={`${tr.tahta.colorLabel}: ${currentColor ? tr.tahta.colors[currentColor] : tr.tahta.colorAuto}`}
                  onClick={() => setPalette((v) => !v)}
                  className={`flex items-center gap-2 rounded-[10px] border border-line bg-panel px-3 text-small font-semibold text-ink shadow-sm hover:bg-panel-2 ${touch ? 'h-11' : 'h-10'}`}
                >
                  <Swatch color={currentColor} />
                  {currentColor ? tr.tahta.colors[currentColor] : tr.tahta.colorAutoShort}
                  <Icon name="chevronDown" className="h-4 w-4 text-muted" />
                </button>
                {palette && (
                  <div role="radiogroup" aria-label={tr.tahta.colorLabel} className="absolute bottom-full left-0 mb-2 grid w-max grid-cols-6 gap-1 rounded-xl border border-line bg-panel p-1.5 shadow-lg">
                    {(wireMode ? [null, ...WIRE_COLORS] : [...WIRE_COLORS]).map((c) => (
                      <button
                        key={c ?? 'oto'}
                        type="button"
                        role="radio"
                        aria-checked={currentColor === c}
                        aria-label={c ? tr.tahta.colors[c] : tr.tahta.colorAuto}
                        title={c ? tr.tahta.colors[c] : tr.tahta.colorAuto}
                        onClick={() => chooseColor(c)}
                        className={`flex items-center justify-center rounded-lg ${touch ? 'h-11 w-11' : 'h-9 w-9'} ${currentColor === c ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-app'}`}
                      >
                        <Swatch color={c} large />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tool('rotate', tr.tahta.toolRotate, 'R', selectedPart !== undefined, () => commands.current?.rotate())}
            {tool('trash', tr.tahta.toolDelete, 'Del', selectedPart !== undefined || picked !== null, () => commands.current?.remove())}
          </div>
          {problems.length > 0 && !props.placing && !props.cabling && (
            <div className="absolute bottom-[72px] left-1/2 z-20 flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-col gap-1 rounded-2xl bg-ink py-1.5 pr-1.5 pl-4 text-small whitespace-nowrap text-on-ink shadow-lg">
              <div className="flex items-center gap-3">
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />
              <b className="font-semibold">{d.chip(problems.length)}</b>
              {(showMarks || located.length === 0) && <span className="truncate opacity-80">{located.length === 0 ? d.marksNone : located.every(({ p }) => p.wire) ? d.marksWire : d.marksOn}</span>}
              {located.length > 0 && (
                <button type="button" onClick={() => props.onMarks(!showMarks)} className={`shrink-0 rounded-xl bg-on-ink/15 px-3 font-medium hover:bg-on-ink/25 ${touch ? 'h-11' : 'h-8'}`}>
                  {showMarks ? d.marksHide : d.marksShow}
                </button>
              )}
              </div>
              {ghosts.map((g) => (
                <p key={g.label} className="m-0 flex items-center gap-2 pr-3 pb-1 text-small">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-dashed border-accent" />
                  {d.ghostChip(g.label, g.holes.map(({ tag, hole }) => `${tag}: ${hole}`).join(' · '))}
                </p>
              ))}
            </div>
          )}
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
  readonly cabling: Cabling | null;
  /** Masadaki aletin kablosunu takmaya başla (ya da bırak). */
  readonly onLead: (part: string, pin: number) => void;
  /** Denetle oturumu (sonuç, ipucu kademeleri, sayılar). */
  readonly session: BoardSession | null;
  readonly buildKey: string;
  readonly onCheck: () => void;
  readonly onHint: (problem: Problem) => void;
  /** Görev (T6): kalan Denetle hakkı (null: sınırsız; 0: yok), ipucu sınırı, Teslim et. */
  readonly checksLeft?: number | null;
  readonly submitOnly?: boolean;
  readonly maxHint?: number;
  readonly onSubmit?: () => void;
  /** Sonuç kartında "Şimdi Oynat’a bas" metni (örneğin kısa ipucu); kendi devrede null. */
  readonly cue: string | null;
  readonly onReport: () => void;
  readonly onGuide: () => void;
  readonly onReset: () => void;
}

/** Şemadaki işaret: sorunlu parçanın çevresinde kırmızı çerçeve ve numara (dünya koordinatı). */
export function schematicMarks(doc: CircuitDoc, marks: ReadonlyArray<{ readonly part: string; readonly n: number }>): ReactNode {
  return marks.map(({ part, n }) => {
    const p = doc.parts.find((q) => q.id === part);
    if (!p) return null;
    const b = partBounds(p);
    const pad = 0.6;
    const x = (b.x - pad) * GRID;
    const y = (b.y - pad) * GRID;
    const w = (b.w + 2 * pad) * GRID;
    const h = (b.h + 2 * pad) * GRID;
    return (
      <g key={`isaret-${part}`} aria-hidden="true">
        <rect x={x} y={y} width={w} height={h} rx={6} fill="var(--color-danger-soft)" fillOpacity={0.35} stroke="var(--color-danger)" strokeWidth={2.5} />
        <circle cx={x + w} cy={y} r={11} fill="var(--color-danger)" />
        <text x={x + w} y={y + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} fill="white">
          {n}
        </text>
      </g>
    );
  });
}

/** Oturumdaki yeri açılmış sorunların şemadaki işaretleri (İşaretleri gizle kapalıyken); yoksa undefined. */
export function sessionMarks(doc: CircuitDoc, session: BoardSession | null): ReactNode | undefined {
  if (!session?.result || !session.marks) return undefined;
  const marks = session.result.problems.flatMap((p, i) => (p.part !== null && levelOf(session, p) >= 2 ? [{ part: p.part, n: i + 1 }] : []));
  return marks.length > 0 ? schematicMarks(doc, marks) : undefined;
}

/** Sorun kartı (T3): numara, kademeye göre başlık, açıklama, açılan ipuçları ve sonraki ipucu. */
export function ProblemCard({ doc, problem, index, level, touch, onHint, cap = 4, example = '' }: { doc: CircuitDoc; problem: Problem; index: number; level: number; touch: boolean; onHint: (p: Problem) => void; cap?: number; example?: string }) {
  const d = tr.tahta.denetle;
  // Görevin ipucu sınırı (T6): sınırın üstündeki kademeler görünmez.
  const max = Math.min(maxLevel(problem), cap);
  const names = d.levels.slice(0, max);
  const h = touch ? 'h-11' : 'h-9';
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-danger-line bg-panel p-3.5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger text-[13px] font-semibold text-white">
          {index + 1}
        </span>
        <b className="text-body leading-snug font-semibold">{problemTitle(doc, problem, index, level)}</b>
      </div>
      {level >= 3 && <p className="m-0 text-small leading-snug text-ink-2">{problemText(doc, problem)}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label={d.levelsLabel(names.slice(0, level).join(', '))}>
          {names.map((name, k) => (
            <li key={name} className={`rounded-full border px-2 py-0.5 text-label ${k < level ? 'border-danger-soft bg-danger-soft text-danger-ink' : 'border-line text-muted'}`}>
              {name}
            </li>
          ))}
        </ul>
        {level < max ? (
          <button
            type="button"
            onClick={() => onHint(problem)}
            className={`flex items-center gap-1.5 rounded-[10px] px-3 text-small font-semibold ${h} ${level === 3 ? 'border border-line bg-panel text-ink hover:bg-panel-2' : 'bg-accent-soft text-accent-ink hover:bg-accent-soft/70'}`}
          >
            <Icon name={level === 1 ? 'target' : level === 2 ? 'bulb' : 'eye'} className="h-4 w-4" />
            {d.next[level]}
          </button>
        ) : (
          max === 4 && (
            <span className="flex items-center gap-1.5 text-small text-ink-2">
              <Icon name="eye" className="h-4 w-4 shrink-0" />
              {example ? `${d.exampleOn}: ${example}` : d.exampleOn}
            </span>
          )
        )}
      </div>
    </li>
  );
}

/** Sağ panel (T1, T3): başlık, şema (değiştirilemez), parça kutusu, alet kabloları, Denetle ve sonucu. */
export function BoardPanel(props: BoardPanelProps) {
  const { doc, build, schematicPlan, touch, large, session } = props;
  const setLarge = props.onLarge;
  const d = tr.tahta.denetle;
  const parts = boardParts(doc, schematicPlan);
  const leads = requiredLeads(schematicPlan);
  const placed = parts.filter((p) => build.parts[p.id] !== undefined).length;
  const leadsPlaced = leads.filter((l) => build.leads.some((b) => b.part === l.part && b.pin === l.pin)).length;
  const colorOf = netColors(schematicPlan);
  const titleId = useId();
  // Sorunsuz sonuç kurulum değişince geçersizdir (panel kurulum görünümüne döner); sorunlu sonuç kalır.
  const done = solved(session, props.buildKey);
  const result = session?.result && (session.result.problems.length > 0 || done) ? session.result : null;
  const problems = result?.problems ?? [];
  const checks = session?.checks.length ?? 0;
  const level = (p: Problem) => (session ? levelOf(session, p) : 1);
  // Yeri açılmış (2. kademe) sorunların şemadaki ve kutudaki işaretleri.
  const located = problems.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => level(p) >= 2);
  const marks = session?.marks ?? true;
  const schematicMarked = marks ? located.filter(({ p }) => p.part !== null).map(({ p, n }) => ({ part: p.part!, n })) : [];
  const overlay = schematicMarked.length > 0 ? schematicMarks(doc, schematicMarked) : undefined;
  const boxMark = new Map(located.filter(({ p }) => p.inBox).map(({ p, n }) => [p.part!, n]));
  const [boxOpen, setBoxOpen] = useState(false);
  const showBox = result === null || problems.length === 0 || boxOpen || boxMark.size > 0;

  if (done && session) {
    const stats = sessionStats(session, Date.now());
    const rows: [string, string][] = [
      [d.rows.checks, d.times(stats.checks)],
      [d.rows.hints, d.hintsValue(stats.hints, stats.deepest ? d.levels[stats.deepest - 1]! : null)],
      [d.rows.problems, stats.problems.length > 0 ? stats.problems.map((p) => problemShort(doc, p)).join(' · ') : d.none],
      [d.rows.time, formatDuration(stats.duration)],
    ];
    const action = `flex w-full items-center justify-center gap-2 rounded-[10px] border border-line bg-panel px-3 text-small font-semibold text-ink hover:bg-panel-2 ${touch ? 'h-12' : 'h-11'}`;
    return (
      <div className="flex min-h-0 flex-1 flex-col" role="region" aria-label={tr.tahta.panelLabel}>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-4 *:shrink-0">
          <span className="flex items-center gap-1.5 text-label font-semibold text-accent-ink">
            <Icon name="board" className="h-4 w-4" />
            {tr.tahta.panelTag(props.group)}
          </span>
          <p className="sr-only" aria-live="polite">
            {`${d.tag(checks)}. ${d.announce(0)}`}
          </p>
          <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-2xl border border-ok-line bg-panel p-4">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok-ink">
                <Icon name="check" className="h-6 w-6" />
              </span>
              <div className="flex flex-col">
                <h2 id={titleId} className="m-0 text-[19px] leading-tight font-semibold">
                  {d.okTitle}
                </h2>
                <span className="text-small text-ink-2">{d.solvedAt(checks)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-xl bg-panel-2 px-3.5 py-3">
              <b className="text-small font-semibold">{d.playTitle}</b>
              <p className="m-0 text-small leading-snug text-ink-2">{props.cue ?? d.playGeneric}</p>
            </div>
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className="m-0 text-label font-semibold tracking-wide text-muted uppercase">{d.summary}</h3>
            <dl className="m-0 flex flex-col rounded-xl border border-line bg-panel px-3.5">
              {rows.map(([k, v], i) => (
                <div key={k} className={`flex items-baseline justify-between gap-4 py-2.5 ${i > 0 ? 'border-t border-line' : ''}`}>
                  <dt className="text-small text-ink-2">{k}</dt>
                  <dd className="m-0 text-right font-mono text-[13px] text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={props.onReport} className={action}>
              <Icon name="download" className="h-[18px] w-[18px]" />
              {d.report}
            </button>
            <button type="button" onClick={props.onGuide} className={action}>
              <Icon name="external" className="h-[18px] w-[18px]" />
              {d.guide}
            </button>
            <button type="button" onClick={props.onReset} className={action}>
              <Icon name="restart" className="h-[18px] w-[18px]" />
              {d.reset}
            </button>
          </div>
          <p className="m-0 flex gap-1.5 text-label leading-snug text-muted">
            <Icon name="info" className="mt-px h-3.5 w-3.5 shrink-0" />
            {d.note}
          </p>
        </div>
        {large && <SchematicDialog doc={doc} connectivity={props.connectivity} settings={props.settings} overlay={undefined} touch={touch} onClose={() => setLarge(false)} />}
      </div>
    );
  }

  const header =
    result === null ? (
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
    ) : problems.length === 0 ? (
      <header className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-label font-semibold text-ok-ink">
          <Icon name="check" className="h-4 w-4" />
          {d.tag(checks)}
        </span>
        <h2 id={titleId} className="m-0 text-[19px] leading-tight font-semibold">
          {d.okTitle}
        </h2>
        <p className="m-0 text-small leading-snug text-ink-2">{d.okIntro}</p>
      </header>
    ) : (
      <header className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-label font-semibold text-danger-ink">
          <Icon name="warning" className="h-4 w-4" />
          {d.tag(checks)}
        </span>
        <h2 id={titleId} className="m-0 text-[19px] leading-tight font-semibold">
          {d.title(problems.length)}
        </h2>
        <p className="m-0 text-small leading-snug text-ink-2">{d.intro(countWord(problems.length))}</p>
      </header>
    );

  const box = (
    <>
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
            const mark = boxMark.get(part.id);
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
                  className={`flex w-full items-center gap-3 rounded-[10px] border px-3 text-left ${touch ? 'min-h-12' : 'min-h-11'} ${isPlacing || isSelected ? 'border-accent bg-accent-soft' : mark !== undefined && marks ? 'border-danger-line bg-danger-soft/40 hover:bg-danger-soft/60' : 'border-line bg-panel hover:bg-panel-2'} ${at ? '' : 'cursor-grab'}`}
                >
                  <b className="flex w-12 shrink-0 items-center gap-1.5 text-small font-semibold">
                    {mark !== undefined && marks && (
                      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[11px] text-white">
                        {mark}
                      </span>
                    )}
                    {part.label}
                  </b>
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
              const done = build.leads.find((b) => b.part === l.part && b.pin === l.pin);
              const active = props.cabling?.kind === 'lead' && props.cabling.part === l.part && props.cabling.pin === l.pin;
              const label = `${part.label} ${terminalName(part, l.pin)}`;
              return (
                <li key={`${l.part}-${l.pin}`}>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={done ? tr.tahta.leadSelected(label, done.hole) : tr.tahta.leadChip(label)}
                    onClick={() => props.onLead(l.part, l.pin)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 font-mono text-[12px] ${touch ? 'h-11' : 'h-8'} ${active ? 'border-accent bg-accent-soft text-accent-ink' : done ? 'border-ok-line bg-ok-soft text-ok-ink hover:bg-ok-soft/70' : 'border-line bg-panel text-ink hover:bg-panel-2'}`}
                  >
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full ring-1 ring-line-2" style={{ background: colorOf(l.net) }} />
                    {label}
                    {done && (
                      <>
                        <Icon name="check" className="h-3.5 w-3.5" />
                        <span className="opacity-80">{done.hole}</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="region" aria-label={tr.tahta.panelLabel}>
      {/* Bölümler ezilmez (şema en az 200 px); panel kendi içinde kayar. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-3 *:shrink-0">
        {header}
        <p className="sr-only" aria-live="polite">
          {checks > 0 ? `${d.tag(checks)}. ${d.announce(problems.length)}` : ''}
        </p>

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
            <CircuitView doc={doc} connectivity={props.connectivity} frame={null} settings={props.settings} label={tr.tahta.schematicLabel} className="block h-full w-full" overlay={overlay} />
          </div>
        </section>

        {problems.length > 0 && (
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label={d.title(problems.length)}>
            {problems.map((p, i) => (
              <ProblemCard key={p.id} doc={doc} problem={p} index={i} level={level(p)} touch={touch} onHint={props.onHint} cap={props.maxHint ?? 4} example={p.part ? exampleText(doc, schematicPlan, p.part) : ''} />
            ))}
          </ol>
        )}

        {result !== null && problems.length > 0 && (
          <button
            type="button"
            aria-expanded={showBox}
            onClick={() => setBoxOpen(!showBox)}
            className={`flex w-full items-center justify-between gap-2 rounded-[10px] border border-line bg-panel px-3 text-left text-small font-medium text-ink-2 hover:bg-panel-2 ${touch ? 'min-h-12' : 'min-h-10'}`}
          >
            {d.box(placed, parts.length, leadsPlaced, leads.length)}
            <Icon name={showBox ? 'chevronUp' : 'chevronDown'} className="h-4 w-4 shrink-0 text-muted" />
          </button>
        )}
        {showBox && box}
      </div>
      {/* Görevde (Teslim et varken) düğmeler bir satırda, not altta; öbür durumda düğme ve not yan yana (T1). */}
      <div className={`flex shrink-0 gap-3 border-t border-line px-4 py-3 ${props.onSubmit ? 'flex-col' : 'items-center'}`}>
        <div className={`flex items-center gap-2 ${props.onSubmit ? '' : 'flex-1'}`}>
        {!props.submitOnly && (
          <button
            type="button"
            onClick={props.onCheck}
            disabled={props.checksLeft === 0}
            className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] bg-accent font-semibold whitespace-nowrap text-white hover:bg-accent/90 disabled:opacity-50 ${touch ? 'h-12' : 'h-11'}`}
          >
            <Icon name="check" className="h-[18px] w-[18px]" />
            {checks === 0 ? d.check : d.again}
          </button>
        )}
        {props.onSubmit && (
          <button
            type="button"
            onClick={props.onSubmit}
            className={`flex items-center justify-center gap-2 rounded-[10px] px-4 font-semibold whitespace-nowrap ${props.submitOnly ? 'flex-1 bg-accent text-white hover:bg-accent/90' : 'shrink-0 border border-line bg-panel text-ink hover:bg-panel-2'} ${touch ? 'h-12' : 'h-11'}`}
          >
            <Icon name="upload" className="h-[18px] w-[18px]" />
            {tr.tahta.gorev.submit}
          </button>
        )}
        </div>
        <p className={`m-0 text-label leading-snug text-muted ${props.onSubmit ? '' : 'w-1/2'}`}>
          {props.submitOnly
            ? tr.tahta.gorev.submitOnly
            : props.checksLeft !== undefined && props.checksLeft !== null
              ? tr.tahta.gorev.checksLeft(props.checksLeft)
              : checks === 0
                ? tr.tahta.wiresNote(build.wires.length)
                : d.stats(checks, session?.hints.length ?? 0)}
        </p>
      </div>
      {large && <SchematicDialog doc={doc} connectivity={props.connectivity} settings={props.settings} overlay={overlay} touch={touch} onClose={() => setLarge(false)} />}
    </div>
  );
}

/** Şemanın büyük görünümü (değiştirilemez). */
export function SchematicDialog({ doc, connectivity, settings, overlay, touch = false, onClose }: { doc: CircuitDoc; connectivity: Connectivity; settings: Settings; overlay: ReactNode; touch?: boolean; onClose: () => void }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-scrim ${touch ? 'p-3' : 'p-6'}`} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex h-full max-h-[760px] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-xl">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 id={titleId} className="m-0 text-body font-semibold">
            {tr.tahta.schematic} <span className="font-normal text-muted">· {tr.tahta.locked}</span>
          </h2>
          <button type="button" onClick={onClose} aria-label={tr.tahta.closeSchematic} className={`flex items-center justify-center rounded-md hover:bg-app ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}>
            <Icon name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-paper p-3">
          {/* Dokunmatikte okunur boyda çizilir, kutunun içinde kayar (CircuitView minWidth). */}
          <CircuitView doc={doc} connectivity={connectivity} frame={null} settings={settings} label={tr.tahta.schematicLabel} className="block h-full w-full" overlay={overlay} {...(touch ? { minWidth: 720 } : {})} />
        </div>
      </div>
    </div>
  );
}
