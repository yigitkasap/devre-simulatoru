// Defter (tasarım v3, docs/tasarim-v3): sağdaki panelde devredeki her parça bir kart.
//
// - Kapalı kart (60 px): sembol, ad · tür ve değer; çalışırken en önemli ölçüm (ölçü aletinde büyük).
//   Kur kipinde boşta ucu olan parçada "1 uç boşta" rozeti.
// - Açık kart (aynı anda tek; seçimle aynı şey): başlıkta döndür ve sil; değer ayarı (−/+ ve sık
//   kullanılan değerler); çalışırken Gerilim, Akım, Güç; parçaya özel bölüm. Seyrek kullanılan
//   ayarlar (ad, öbür özellikler, ters çevir) "Diğer ayarlar" altında katlı.
// - Aynı türden 3 ya da daha fazla parça tek satırda; satır açılınca parçalar altında.
// - Çalışırken değiştirilen ayarlar (potansiyometre konumu, LDR ışığı, NTC sıcaklığı) kapalı kartta
//   da görünen bir kaydırıcıdır.
// Klavye (9. adım): kartların başları ([data-nav]) arasında ↑ ↓, Home / End; kart açılınca odak açık
// karta, Esc ile kapanınca kartın düğmesine döner (şemadan seçilince odak tuvalde kalır).
// Şemada parçaya tıklamak kartını açar ve listeyi oraya kaydırır. Telefonda (DP1–DP4) ekleme satırı
// yoktur (sol alttaki Parça ekle düğmesi), sorun kartları tek satırdır ("Oku" ile açılır) ve listenin
// altında yüzen düğmelere yer kalır.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { resistorBands, resistorColorCode } from '../bench3d/bands';
import { EXAMPLE_IDS, type ExampleId } from '../examples';
import { ek } from '../i18n/ek';
import { tr, type DiagnosticContext } from '../i18n/tr';
import { CATALOG, withProp, type NumberPropDef, type PropDef } from '../model/catalog';
import { operable } from '../model/task';
import type { Part } from '../model/types';
import type { DeviceType, PropValue } from '../sim/netlist';
import { formatEditable, formatSI } from '../sim/units';
import { useThrottledText } from './a11y';
import { ArduinoCardBody } from './ArduinoPanel';
import { MultimeterCardBody } from './MultimeterCard';
import { LogicDetails } from './LogicCard';
import { isLogicChip } from '../model/logicChips';
import { spdtThrow } from '../sim/devices/spdt';
import { DeviceControls, deviceSummary, ScopeStatus, type DeviceHooks } from './DeviceCards';
import { ExampleDetails, ExtraTag, groupOf, labBadge } from './ExampleTab';
import { Icon, type IconName } from './icons';
import { FieldError, fieldTone, LabelField, MultiSelection, PropField, RACK_DEVICES, selectionActions, useCommitField, WireDetails, type InspectTabProps, type PartPatch, type TaskParts } from './InspectTab';
import { lm317Note } from './lm317Divider';
import { stableReadout } from './liveReadout';
import type { MessageItem } from './messages';
import { SeverityMark, type MessageAction } from './MessagesTab';
import { AddPartSearch, BrowseAllParts, type AddPartRowProps } from './NotebookAdd';
import { notebookEntries, type NotebookEntry } from './notebookOrder';
import { partValueText } from './PartView';
import { currentProp, partNote, presetLabel, stepValue, validateNumber, valuePresets } from './propertyForm';
import { PropSlider } from './PropSlider';
import { ControlsLocked } from './RackControls';
import type { ReadoutRow } from './readouts';
import { plainText, Rich } from './Rich';
import { SymbolIcon } from './symbols';
import { useTouchUi } from './touchUi';
import type { SimFrame } from './useSimulation';

const t = tr.notebook;

export interface NotebookProps extends InspectTabProps {
  /** Boşta ucu olan parçalar ve boşta uç sayısı (devre denetiminin "boşta uç" uyarıları). */
  readonly floating: ReadonlyMap<string, number>;
  /** Açık kartı kapatır (seçimi bırakır). */
  readonly onClearSelection: () => void;
  /** Kapalı kartında ölçüm gösterilen parçalar; null: hepsi (DC devre, değerler salınmaz). */
  readonly measured: ReadonlySet<string> | null;
  /** Hata, uyarı ve bilgi mesajları (önce hatalar); kartları defterin en üstünde. */
  readonly messages: readonly MessageItem[];
  /** Şemada vurgulanan mesaj. */
  readonly selectedMessage: string | null;
  readonly onSelectMessage: (item: MessageItem | null) => void;
  /** Mesajın düzeltme düğmeleri (Onar, "R1'i 360 Ω yap"). */
  readonly messageActions: (item: MessageItem) => readonly MessageAction[];
  readonly diagnosticContext: DiagnosticContext;
  /** Kartında hata ya da uyarı rozeti olan parçalar (şemadaki işaretlerle aynı kural). */
  readonly issues: ReadonlyMap<string, 'error' | 'warning'>;
  /** Açık örnek: katlı örnek kartı. */
  readonly example: { readonly id: ExampleId | null; readonly onOpen: (id: ExampleId) => void; readonly onClose: () => void };
  /** Listenin sonundaki parça ekleme satırı (telefonda yok: Parça ekle düğmesi). */
  readonly add?: Omit<AddPartRowProps, 'settings'>;
  /** Telefon düzeni: tek satırlık sorun kartları, yüzen düğmeler için alt boşluk. */
  readonly phone?: boolean;
  /** Sorun kartındaki "D4'ü göster" (verilmezse onSelectPart): telefonda şema açık kalır. */
  readonly onShowPart?: (partId: string) => void;
  /** 3B görünümdeyken açık kartın başlığındaki "3B'de yaklaş". */
  readonly onFocus3d?: (partId: string) => void;
  /** Cihaz kartlarının (osiloskop, üreteç, güç kaynağı, hazne) simülasyon bağlantıları. */
  readonly devices: DeviceHooks;
  /** Görev (öğrenci): defterin en üstündeki kart ve kilitli / değiştirilebilir parçalar. */
  readonly taskCard?: ReactNode;
  /**
   * Görev: kilitli ve değiştirilebilir parçalar; takılı ampermetreler (arıza bulma: kaldırılır, yeri
   * değişmez); lockMarks false ise kilit simgesi yok (arıza bulmada her şey kilitli); wiresLocked:
   * kablolar değiştirilemez.
   */
  readonly taskParts?: TaskParts | null;
  /** Arıza bulma (B2): canlı değerler gizli (kare ölçü aletleri dışında boş gelir). */
  readonly liveHidden?: boolean;
  /** Multimetrelerin Ω okuması (simülasyon durmuşken). */
  readonly ohmTexts?: ReadonlyMap<string, string>;
  /** Ucun bağlı olduğu düğümün adı (multimetre kartı). */
  readonly pinNode?: (partId: string, pin: number) => string;
  /** LM317'nin ayar dirençleri (R1: OUT–ADJ, R2: ADJ–toprak); bulunamazsa null. */
  readonly divider?: (partId: string) => { readonly r1: number; readonly r2: number } | null;
  /** Basılı tutulan düğmeler ve basma / bırakma (basmalı düğme kartı). */
  readonly pressed?: ReadonlySet<string>;
  readonly onPress?: (partId: string, down: boolean) => void;
}

const SOURCES: ReadonlySet<DeviceType> = new Set(['battery', 'acsource', 'dcsupply', 'funcgen']);
const METERS: ReadonlySet<DeviceType> = new Set(['voltmeter', 'ammeter', 'multimeter']);

function partValues(part: Part): Record<string, PropValue> {
  const values: Record<string, PropValue> = {};
  for (const prop of CATALOG[part.type].propDefs) {
    const value = currentProp(part, prop.key);
    if (value !== undefined) values[prop.key] = value;
  }
  return values;
}

/** Kartın ana ayarı: ilk sayı özelliği (kaydırıcılı olanlar hariç), yoksa ilk seçenek. */
function primaryProp(part: Part): PropDef | undefined {
  if (RACK_DEVICES.has(part.type)) return undefined;
  const defs = CATALOG[part.type].propDefs;
  return defs.find((p) => p.kind === 'number' && !p.slider) ?? defs.find((p) => p.kind === 'select');
}

/** Çalışırken değiştirilen, kapalı kartta da görünen kaydırıcılar. */
const sliderProps = (part: Part) => CATALOG[part.type].propDefs.filter((p): p is NumberPropDef => p.kind === 'number' && p.slider !== undefined);

function liveRows(part: Part, frame: SimFrame | null) {
  const m = frame?.measurements.get(part.id);
  if (!m || !frame) return null;
  const readout = stableReadout(part, m, frame.statuses.get(part.id) ?? {}, frame.summaries.get(part.id) ?? null);
  // Ölçü aletinin göstergesi her yerde aynı okuma (useSimulation → meterTexts).
  const reading = METERS.has(part.type) ? frame.meterTexts.get(part.id) : undefined;
  if (!readout || reading === undefined) return readout;
  return { ...readout, rows: readout.rows.map((row) => (row.label === tr.readout.reading ? { ...row, value: reading } : row)) };
}

/** Kapalı kartın (ve 3B etiketinin) ölçümü: ölçü aletinde göstergesi, LED'de gerilim ve akım, kaynakta akım, öbürlerinde ilk satır. */
export function cardReading(part: Part, frame: SimFrame | null): { main: string; second?: string; big?: boolean } | null {
  const m = frame?.measurements.get(part.id);
  if (!m || !frame) return null;
  if (METERS.has(part.type)) {
    const text = frame.meterTexts.get(part.id);
    return text ? { main: text, big: true } : null;
  }
  const rows = liveRows(part, frame)?.rows;
  if (!rows || rows.length === 0) return null;
  if (part.type === 'led' && rows[1]) return { main: rows[0]!.value, second: rows[1].value };
  // Basmalı düğme: kapalı satırda basılı / bırakılmış (Y3), kontak durumu açık kartta.
  if (part.type === 'pushbutton') return null;
  // Regülatör: çıkış gerilimi (satırlar giriş, çıkış, akım…).
  if ((part.type === 'reg7805' || part.type === 'lm317') && rows[1]) return { main: rows[1].value };
  // Flip-flop, sayıcı, kod çözücü: iç durum (Q, sayaç, rakam); kapılarda besleme.
  if ((part.type === 'ic7474' || part.type === 'cd4017') && rows[2]) return { main: rows[2].value };
  if (part.type === 'dcsupply') {
    // Güç kaynağı: akım veren çıkışlar (ikisi de boştaysa 1. çıkış); satırlar çıkış sırasında.
    const outputs = frame.statuses.get(part.id)?.outputs ?? [];
    const used = outputs.flatMap((o, k) => (Math.abs(o.current) > 1e-9 && rows[k] ? [k] : []));
    const [first = 0, second] = used;
    return { main: rows[first]!.value, ...(second !== undefined ? { second: rows[second]!.value } : {}) };
  }
  if (SOURCES.has(part.type) && rows[1]) return { main: rows[1].value };
  return { main: rows[0]!.value };
}

export function Notebook(props: NotebookProps) {
  const { doc, selection, frame } = props;
  const touch = useTouchUi();
  const openId = selection.parts.length === 1 && selection.wires.length === 0 ? selection.parts[0]! : null;
  const entries = useMemo(() => notebookEntries(doc.parts), [doc.parts]);
  const [openGroups, setOpenGroups] = useState<ReadonlySet<DeviceType>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const openType = openId ? doc.parts.find((p) => p.id === openId)?.type : undefined;
  // Seçilen parça bir gruptaysa grup açılır.
  useEffect(() => {
    if (openType && entries.some((e) => e.kind === 'group' && e.type === openType)) setOpenGroups((s) => (s.has(openType) ? s : new Set([...s, openType])));
  }, [openType, entries]);
  // Seçilen kart görünür alana kaydırılır.
  useEffect(() => {
    if (!openId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(openId)}"]`);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [openId]);

  /** Defterden açılan ya da kapatılan kart: çizimden sonra odak ona (şemadan seçimde boş kalır). */
  const focusAfter = useRef<{ id: string; open: boolean } | null>(null);
  useEffect(() => {
    const want = focusAfter.current;
    if (!want) return;
    // Başka bir kart açıldıysa (ör. şemadan) istek geçersizdir.
    if (want.open && want.id !== openId) {
      focusAfter.current = null;
      return;
    }
    const card = listRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(want.id)}"]`);
    const target = want.open ? card : card?.querySelector<HTMLElement>('[data-nav]');
    if (!target) return;
    focusAfter.current = null;
    target.focus({ preventScroll: true });
  }, [openId]);
  const closeOpen = () => {
    if (openId) focusAfter.current = { id: openId, open: false };
    props.onClearSelection();
  };
  const onNavKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.hasAttribute('data-nav') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'Escape' && target.dataset.card === openId && openId) {
      e.preventDefault();
      closeOpen();
      return;
    }
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-nav]')];
    const i = items.indexOf(target);
    const next =
      e.key === 'ArrowDown' ? items[i + 1] : e.key === 'ArrowUp' ? items[i - 1] : e.key === 'Home' ? items[0] : e.key === 'End' ? items[items.length - 1] : undefined;
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.scrollIntoView?.({ block: 'nearest' });
  };

  const others = selection.parts.length + selection.wires.length;
  const selectedParts = doc.parts.filter((p) => selection.parts.includes(p.id));
  const actions = selectionActions(props.taskParts, selection.parts, selection.wires.length);
  // Kapalı kartlar seyrek karelerle ve sabit geri çağırmalarla bir kez kurulur: simülasyon her karede
  // defteri yeniden çizer, ama kapalı kartların alt ağaçları yalnızca seyrek karede güncellenir.
  const slow = useSlowFrame(frame);
  const latest = useRef(props);
  latest.current = props;
  const callbacks = useMemo(
    () => ({
      onSelectPart: (id: string) => {
        focusAfter.current = { id, open: true };
        latest.current.onSelectPart(id);
      },
      onUpdatePart: (id: string, patch: PartPatch) => latest.current.onUpdatePart(id, patch),
      onSlidePart: (id: string, patch: PartPatch, done: boolean) => {
        const { onSlidePart, onUpdatePart } = latest.current;
        if (onSlidePart) onSlidePart(id, patch, done);
        else if (done) onUpdatePart(id, patch);
      },
    }),
    [],
  );
  const { status, settings, floating, measured, issues } = props;
  const closed = useMemo(() => {
    const map = new Map<string, ReactNode>();
    for (const part of doc.parts) {
      if (part.id !== openId) {
        map.set(
          part.id,
          <PartCard key={part.id} {...latest.current} {...callbacks} part={part} open={false} frame={slow} status={status} settings={settings} floating={floating} measured={measured} issues={issues} />,
        );
      }
    }
    return map;
  }, [doc.parts, openId, slow, status, settings, floating, measured, issues, callbacks, touch]);
  const [adding, setAdding] = useState(false);
  const card = (part: Part) => (part.id === openId ? <PartCard key={part.id} {...props} onClearSelection={closeOpen} part={part} open /> : closed.get(part.id));

  const renderEntry = (entry: NotebookEntry): ReactNode => {
    if (entry.kind === 'part') return card(entry.part);
    const open = openGroups.has(entry.type);
    return (
      <GroupRow
        key={`g-${entry.type}`}
        entry={entry}
        open={open}
        frame={slow}
        status={status}
        floating={floating}
        issues={issues}
        settings={settings}
        onToggle={() =>
          setOpenGroups((s) => {
            const next = new Set(s);
            if (open) next.delete(entry.type);
            else next.add(entry.type);
            return next;
          })
        }
      >
        {entry.parts.map(card)}
      </GroupRow>
    );
  };

  // Başlıktaki sorun durumu: hata ve uyarılar (Kur kipinde boşta uçlar sayılmaz; kartlarında rozet var).
  const calm = status === 'stopped' && props.issues.size === 0;
  const problems = props.messages.filter((m) => m.severity !== 'info' && !(calm && m.code === 'floating-pin'));
  const errors = problems.filter((m) => m.severity === 'error').length;
  return (
    <div
      id="defter"
      ref={listRef}
      onKeyDown={onNavKeys}
      className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-panel ${touch ? 'p-3' : 'p-4'}`}
      style={props.phone ? { paddingBottom: 16 } : undefined}
    >
      {props.taskCard}
      {props.example.id && <ExampleCard id={props.example.id} onOpen={props.example.onOpen} onClose={props.example.onClose} />}
      <Problems {...props} listRef={listRef} />
      <div className={`flex items-center gap-2 px-0.5 ${touch ? 'min-h-11' : 'min-h-8'}`}>
        <h2 className="text-[15px] font-semibold">{t.partsTitle}</h2>
        <span className="rounded-full bg-panel-2 px-2 font-mono text-label leading-5 text-ink-2 tabular" aria-label={t.count(doc.parts.length)}>
          {doc.parts.length}
        </span>
        <span className={`flex min-w-0 items-center gap-1 truncate text-small ${props.liveHidden ? 'text-muted' : problems.length === 0 ? 'text-ok-ink' : errors > 0 ? 'text-danger-ink' : 'text-warn'}`}>
          {props.liveHidden ? (
            t.liveHidden
          ) : problems.length === 0 ? (
            <>
              <Icon name="check" className="h-4 w-4 shrink-0" />
              {t.noProblems}
            </>
          ) : (
            t.problemCount(errors > 0 ? errors : problems.length, errors > 0 ? 'error' : 'warning')
          )}
        </span>
        <span className="flex-1" />
        {props.add && (
          <button
            type="button"
            data-tour="parts"
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border border-line-2 px-2.5 text-sm font-medium ${touch ? 'h-11' : 'h-8'} ${adding ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-panel-2'}`}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t.addButton}
          </button>
        )}
      </div>
      {adding && props.add && <AddPartSearch {...props.add} settings={settings} onClose={() => setAdding(false)} />}
      {openId === null && others > 0 && (
        <div className="flex flex-col gap-4 rounded-lg border-2 border-accent bg-panel px-3.5 py-3">
          {selection.parts.length === 0 && selection.wires.length === 1 ? (
            <WireDetails wireId={selection.wires[0]!} removable={actions.remove} {...props} />
          ) : (
            <MultiSelection count={others} parts={selectedParts} actions={actions} {...props} />
          )}
        </div>
      )}
      {doc.parts.length === 0 ? (
        <p className="px-0.5 text-small text-muted">{t.empty}</p>
      ) : (
        <div className="flex shrink-0 flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">{entries.map(renderEntry)}</div>
      )}
      {props.add && <BrowseAllParts {...props.add} settings={settings} />}
    </div>
  );
}

// --- Sorunlar ve örnek -------------------------------------------------------------------------

/** En üstte en çok bu kadar sorun kartı; fazlası "N sorun daha" ile açılır. */
const PROBLEMS_SHOWN = 3;

/**
 * Hata ve uyarı kartları (defterin en üstünde), altlarında katlı bilgi kartları. Kur kipinde boşta uç
 * uyarıları kart olmaz (parçanın kartında "1 uç boşta" rozeti var); çalışırken ya da Oynat'a basılıp
 * başlayamadığında kart olur. Yeni bir hata ya da uyarı gelince liste en üste kaydırılır.
 */
function Problems(props: NotebookProps & { listRef: RefObject<HTMLDivElement | null> }) {
  const { messages, status, listRef } = props;
  const [all, setAll] = useState(false);
  const calm = status === 'stopped' && props.issues.size === 0;
  const problems = messages.filter((m) => m.severity !== 'info' && !(calm && m.code === 'floating-pin'));
  const infos = messages.filter((m) => m.severity === 'info');
  const keys = problems.map((m) => m.key).join(';');
  const previous = useRef('');
  useEffect(() => {
    const before = new Set(previous.current.split(';'));
    previous.current = keys;
    if (keys && keys.split(';').some((k) => !before.has(k))) listRef.current?.scrollTo?.({ top: 0 });
  }, [keys, listRef]);
  if (problems.length === 0 && infos.length === 0) return null;
  const shown = all ? problems : problems.slice(0, PROBLEMS_SHOWN);
  return (
    <>
      {shown.map((item) => (
        <ProblemCard key={item.key} {...props} item={item} />
      ))}
      {problems.length > PROBLEMS_SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all} className="h-9 self-start px-1 text-small font-medium text-accent-ink hover:underline">
          {all ? t.fewerProblems : t.moreProblems(problems.length - PROBLEMS_SHOWN)}
        </button>
      )}
      {infos.map((item) => (
        <InfoCard key={item.key} {...props} item={item} />
      ))}
    </>
  );
}

/** Mesajın ilgili parçası ("D4'ü göster") ve düzeltme düğmeleri. */
function MessageButtons({ item, diagnosticContext, messageActions, onSelectMessage, onSelectPart, onShowPart }: NotebookProps & { item: MessageItem }) {
  const touch = useTouchUi();
  const target = (item.badgeIds ?? item.elementIds)[0];
  const actions = messageActions(item);
  if (!target && actions.length === 0) return null;
  const size = touch ? 'h-11 text-sm' : 'h-8 text-small';
  return (
    <div className="flex flex-wrap gap-2">
      {target && (
        <button
          type="button"
          onClick={() => {
            onSelectMessage(item);
            (onShowPart ?? onSelectPart)(target);
          }}
          className={`rounded-md border border-line-2 bg-panel px-3 font-medium hover:bg-panel-2 ${size}`}
        >
          {t.showPart(ek(diagnosticContext.label(target), 'i'))}
        </button>
      )}
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.run}
          className={`rounded-md px-3 ${size} ${action.primary ? 'bg-ink font-semibold text-on-ink hover:brightness-125' : 'border border-line-2 bg-panel font-medium hover:bg-panel-2'}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

/** Metnin ilk cümlesi (telefondaki tek satırlık sorun kartı). */
function firstSentence(text: string): string {
  const plain = plainText(text);
  return /^.*?[.!?](?=\s|$)/.exec(plain)?.[0] ?? plain;
}

/**
 * Hata (kesintisiz kırmızı çerçeve, dolu daire) ya da uyarı (kesikli amber çerçeve, üçgen) kartı.
 * Telefonda tek satır ("Toprak tuzağı: D4 kısa devre oldu. Oku"); seçili mesajda açık.
 */
function ProblemCard(props: NotebookProps & { item: MessageItem }) {
  const { item, selectedMessage } = props;
  const error = item.severity === 'error';
  const [read, setRead] = useState(false);
  const bodyId = useId();
  const compact = props.phone === true && !read && selectedMessage !== item.key;
  if (compact) {
    return (
      <section
        data-notebook="problem"
        aria-label={`${tr.messages.severity[item.severity]} · ${item.title}`}
        className={`flex shrink-0 rounded-lg border-[1.5px] ${error ? 'border-danger bg-danger-soft' : 'border-dashed border-warn bg-warn-soft'}`}
      >
        <button type="button" data-nav onClick={() => setRead(true)} aria-expanded={false} aria-controls={bodyId} className="flex min-h-12 w-full items-center gap-2.5 px-3 py-2.5 text-left">
          <SeverityMark severity={item.severity} size={18} />
          <span className="line-clamp-2 min-w-0 flex-1 text-small leading-[1.4] text-ink-2">
            <b className={`font-semibold ${error ? 'text-danger-ink' : 'text-warn'}`}>{item.title}:</b> {firstSentence(item.detail)}
          </span>
          <span className={`shrink-0 text-small font-semibold ${error ? 'text-danger-ink' : 'text-warn'}`}>{tr.phone.readMore}</span>
        </button>
      </section>
    );
  }
  return (
    <section
      data-notebook="problem"
      data-nav
      tabIndex={-1}
      aria-label={`${tr.messages.severity[item.severity]} · ${item.title}`}
      className={`flex shrink-0 gap-3 rounded-lg border-[1.5px] px-3.5 py-3 ${error ? 'border-danger bg-danger-soft' : 'border-dashed border-warn bg-warn-soft'} ${
        selectedMessage === item.key ? 'ring-2 ring-accent' : ''
      }`}
    >
      <SeverityMark severity={item.severity} />
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className={`text-sm font-semibold ${error ? 'text-danger-ink' : 'text-warn'}`}>
          {tr.messages.severity[item.severity]} · {item.title}
        </h3>
        <p id={bodyId} className="text-small leading-[1.45] text-ink-2">
          <Rich text={item.detail} />
        </p>
        <MessageButtons {...props} />
        {props.phone && read && selectedMessage !== item.key && (
          <button type="button" onClick={() => setRead(false)} aria-expanded aria-controls={bodyId} className="h-11 self-start text-small font-medium text-accent-ink">
            {tr.phone.readLess}
          </button>
        )}
      </div>
    </section>
  );
}

/** Bilgi: sade ve katlı (bir sorun değil, açıklama). */
function InfoCard(props: NotebookProps & { item: MessageItem }) {
  const { item } = props;
  const touch = useTouchUi();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section aria-label={`${tr.messages.severity.info} · ${item.title}`} className="flex shrink-0 flex-col rounded-lg border border-info-line bg-info-soft">
      <button
        type="button"
        data-nav
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className={`flex items-center gap-2.5 px-3.5 text-left ${touch ? 'min-h-12' : 'min-h-11'}`}
      >
        <SeverityMark severity="info" size={18} />
        <span className="min-w-0 flex-1 truncate text-small">
          <b className="font-semibold text-info-ink">{tr.messages.severity.info}</b> · {item.title}
        </span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-2 px-3.5 pb-3">
          <p className="text-small leading-[1.45] text-ink-2">
            <Rich text={item.detail} />
          </p>
          <MessageButtons {...props} />
        </div>
      )}
    </section>
  );
}

/**
 * Açık örnek: üstte tek şerit (accent-soft): mono üst yazı ("DENEY 6 · ŞEKİL-17" ya da grubun adı), örneğin
 * cümlesi, "Föy kartını aç" ve "Sonraki örnek". Föy kartı açılınca şerit kartın kendisi olur.
 */
function ExampleCard({ id, onOpen, onClose }: { id: ExampleId; onOpen: (id: ExampleId) => void; onClose: () => void }) {
  const touch = useTouchUi();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  // Başka örnek açılınca şerit katlı başlar.
  useEffect(() => setOpen(false), [id]);
  const lab = labBadge(id);
  const badge = tr.examples.tabBadge(lab ?? groupOf(id));
  const next = EXAMPLE_IDS[EXAMPLE_IDS.indexOf(id) + 1];
  const link = `inline-flex items-center gap-1 rounded-xs text-small font-semibold text-accent-ink underline-offset-2 hover:underline ${touch ? 'min-h-11' : 'min-h-7'}`;
  return (
    <section data-notebook="example" aria-label={badge} className="flex shrink-0 flex-col gap-1 rounded-lg bg-accent-soft px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 font-mono text-[11px] font-medium tracking-[0.06em] text-accent-ink">
          {(lab ?? groupOf(id)).toLocaleUpperCase('tr-TR')}
          <ExtraTag id={id} className="ml-1.5" />
        </span>
        {open && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t.exampleCollapse}
            title={t.exampleCollapse}
            className={`flex shrink-0 items-center justify-center rounded-md text-accent-ink hover:bg-panel/60 ${touch ? 'h-11 w-11' : 'h-7 w-7'}`}
          >
            <Icon name="chevronUp" className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="text-sm leading-snug font-semibold text-ink">{tr.examples.cues[id]}</p>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-3 pt-2">
          <ExampleDetails id={id} onOpen={onOpen} onClose={onClose} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4">
          <button type="button" data-nav onClick={() => setOpen(true)} aria-expanded={false} aria-controls={bodyId} className={link}>
            {lab ? t.exampleOpenLab : t.exampleOpen}
          </button>
          {next && (
            <button type="button" onClick={() => onOpen(next)} className={link}>
              {t.exampleNext}
              <Icon name="chevron" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Kapalı kartlar (ve 3B etiketleri) için seyrek kare: ölçü aletlerinin okumasıyla birlikte
 * (METER_REFRESH'te bir ve duraklatınca) yenilenir; ölçümler okunabilir hızda değişir ve kart,
 * şemadaki gösterge ile 3B aynı okumayı gösterir. Aynı çizimde güncellenir (efekt beklenmez).
 */
export function useSlowFrame(frame: SimFrame | null): SimFrame | null {
  const [slow, setSlow] = useState(frame);
  const stale = frame !== null && (slow === null || slow.readoutTick !== frame.readoutTick);
  if (stale) setSlow(frame);
  return frame === null ? null : stale ? frame : slow;
}

// --- Grup satırı ------------------------------------------------------------------------------

function GroupRow({
  entry,
  open,
  frame,
  status,
  floating,
  issues,
  settings,
  onToggle,
  children,
}: {
  entry: Extract<NotebookEntry, { kind: 'group' }>;
  open: boolean;
  frame: SimFrame | null;
  status: NotebookProps['status'];
  floating: ReadonlyMap<string, number>;
  issues: ReadonlyMap<string, 'error' | 'warning'>;
  settings: NotebookProps['settings'];
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const name = t.plural[entry.type];
  const labels = entry.parts.map((p) => p.label).join(', ');
  // Rozet: sorunlu üyelerin adları (yanmış ya da boşta ucu olan).
  const flagged = entry.parts.filter((p) => issues.has(p.id) || frame?.statuses.get(p.id)?.burned === true || (status === 'stopped' && (floating.get(p.id) ?? 0) > 0));
  return (
    <div className="flex flex-col">
      <button
        type="button"
        data-nav
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        aria-label={t.groupToggle(name, entry.parts.length)}
        className="flex h-[52px] shrink-0 items-center gap-3 px-3 text-left hover:bg-panel-2"
      >
        <IconBox type={entry.type} resistorStyle={settings.resistorStyle} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {name} <span className="font-normal text-muted">· {labels}</span>
        </span>
        {flagged.length > 0 && <Badge tone={flagged.some((p) => issues.get(p.id) === 'error') ? 'danger' : 'warn'}>{flagged.map((p) => p.label).join(', ')}</Badge>}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div id={id} className="flex flex-col divide-y divide-line border-t border-line bg-panel-2/50 pl-4">
          {children}
        </div>
      )}
    </div>
  );
}

/** Satırın solundaki 28 px simge kutusu. */
function IconBox({ type, resistorStyle }: { type: Part['type']; resistorStyle: NotebookProps['settings']['resistorStyle'] }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-panel-2" aria-hidden="true">
      <SymbolIcon type={type} resistorStyle={resistorStyle} className="max-h-[14px] w-[20px]" />
    </span>
  );
}

function Badge({ tone, children }: { tone: 'warn' | 'danger'; children: ReactNode }) {
  return (
    <span
      className={`flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-label font-semibold ${
        tone === 'warn' ? 'border border-dashed border-warn bg-warn-soft text-warn' : 'border border-danger-line bg-danger-soft text-danger-ink'
      }`}
    >
      {children}
    </span>
  );
}

// --- Parça kartı ------------------------------------------------------------------------------

function PartCard(props: NotebookProps & { part: Part; open: boolean }) {
  const { part, open, frame, status, settings, floating: floatingMap, onSelectPart, onClearSelection, onSlidePart, onUpdatePart } = props;
  const touch = useTouchUi();
  const bodyId = useId();
  const typeName = tr.devices.names[part.type];
  const value =
    part.type === 'pushbutton'
      ? props.pressed?.has(part.id)
        ? tr.readout.pressed
        : tr.readout.released
      : part.type === 'spdt'
        ? spdtThrow(part.props).toUpperCase()
        : partValueText(part);
  const device = RACK_DEVICES.has(part.type);
  const reading = device
    ? null
    : part.type === 'multimeter' && props.ohmTexts?.has(part.id)
      ? { main: props.ohmTexts.get(part.id)!, big: true }
      : props.measured === null || props.measured.has(part.id)
        ? cardReading(part, frame)
        : null;
  const summary = device ? deviceSummary(part, frame ? props.devices.scopeView(part.id) : null) : null;
  const burned = frame?.statuses.get(part.id)?.burned === true;
  const lit = part.type === 'led' && !burned && (frame?.live.get(part.id)?.brightness ?? 0) > 0.05;
  const floating = status === 'stopped' ? (floatingMap.get(part.id) ?? 0) : 0;
  const issue = props.issues.get(part.id);
  const sliders = sliderProps(part);
  const values = partValues(part);
  const slide = (prop: NumberPropDef) => (v: number, done: boolean) => {
    const patch = { props: withProp(part.type, part.props, prop.key, v) };
    if (onSlidePart) onSlidePart(part.id, patch, done);
    else if (done) onUpdatePart(part.id, patch);
  };
  const sliderRows = sliders.map((prop) => {
    const label = tr.properties.fieldLabel(part.type, prop.key);
    const v = typeof values[prop.key] === 'number' ? (values[prop.key] as number) : 0;
    return (
      <div key={prop.key} className="flex items-center gap-3">
        <span className="shrink-0 text-small whitespace-nowrap">{label}</span>
        <PropSlider def={prop} value={v} label={label} touch={touch} onSlide={slide(prop)} />
        <span className="w-16 shrink-0 text-right font-mono text-sm tabular">{formatSI(v, prop.unit, { trim: true, digits: 3 })}</span>
      </div>
    );
  });
  const badges = (
    <>
      {floating > 0 && <Badge tone="warn">{t.floating(floating)}</Badge>}
      {issue && !burned && <Badge tone={issue === 'error' ? 'danger' : 'warn'}>{tr.messages.severity[issue]}</Badge>}
      {burned && <Badge tone="danger">{t.burned}</Badge>}
      {lit && <Badge tone="danger">{t.lit}</Badge>}
    </>
  );

  // Görev: kilitli parçada kilit, değiştirilebilir parçada kalem simgesi ve mavi kenar.
  const locked = props.taskParts?.locked.has(part.id) ?? false;
  const editable = props.taskParts?.editable.has(part.id) ?? false;
  const taskMark = locked && props.taskParts?.lockMarks !== false ? (
    <span title={tr.task.lockBadge} className="shrink-0 text-muted">
      <Icon name="lock" className="h-4 w-4" />
      <span className="sr-only">{` (${tr.task.lockBadge})`}</span>
    </span>
  ) : editable ? (
    <span title={tr.task.editableBadge} className="shrink-0 text-accent-ink">
      <Icon name="pencil" className="h-4 w-4" />
      <span className="sr-only">{` (${tr.task.editableBadge})`}</span>
    </span>
  ) : null;

  if (!open) {
    return (
      <div data-card={part.id} data-notebook="card" className={`flex shrink-0 flex-col ${editable ? 'border-l-[3px] border-accent' : ''}`}>
        <button
          type="button"
          data-nav
          onClick={() => onSelectPart(part.id)}
          aria-expanded={false}
          aria-label={`${t.openCard(part.label, typeName)}${reading ? `, ${reading.main}` : value ? `, ${value}` : ''}`}
          className={`flex shrink-0 items-center gap-3 px-3 text-left hover:bg-panel-2 ${touch ? 'min-h-14' : 'min-h-[52px]'}`}
        >
          <IconBox type={part.type} resistorStyle={settings.resistorStyle} />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-mono text-sm font-semibold">{part.label}</span>{' '}
            <span className="text-small text-muted">
              {typeName}
              {reading && value ? ` ${value}` : ''}
            </span>
          </span>
          {badges}
          {reading ? (
            <span className={`shrink-0 text-right font-mono tabular ${reading.big ? 'text-[20px] font-medium' : 'text-sm'}`}>
              {reading.main}
              {reading.second && (
                <>
                  <br />
                  <span className="text-muted">{reading.second}</span>
                </>
              )}
            </span>
          ) : summary ? (
            <span className="shrink-0 font-mono text-[13px] text-ink-2 tabular">{summary}</span>
          ) : (
            value && <span className="shrink-0 font-mono text-sm text-ink-2 tabular">{value}</span>
          )}
          {taskMark}
        </button>
        {sliderRows.length > 0 && <div className="flex flex-col gap-2 px-3 pb-3">{sliderRows}</div>}
      </div>
    );
  }

  return (
    <section data-card={part.id} data-notebook="card" data-nav tabIndex={-1} aria-label={`${part.label} · ${typeName}`} className="flex shrink-0 flex-col gap-3 border-l-[3px] border-accent bg-panel pt-3 pr-3.5 pb-3.5 pl-[11px]">
      <OpenCardHeader
        {...props}
        fixed={locked ? 'locked' : props.taskParts?.plugged?.has(part.id) ? 'plugged' : null}
        badges={
          <>
            {part.type === 'oscilloscope' && <ScopeStatus part={part} view={props.devices.scopeView(part.id)} />}
            {badges}
          </>
        }
        onClose={onClearSelection}
        bodyId={bodyId}
      />
      <div id={bodyId} className="flex flex-col gap-3">
        {device ? (
          <ControlsLocked.Provider value={locked && CATALOG[part.type].propDefs.every((p) => !operable(part.type, p.key))}>
            <DeviceControls part={part} devices={props.devices} />
          </ControlsLocked.Provider>
        ) : part.type === 'multimeter' ? (
          <MultimeterCardBody
            part={part}
            frame={frame}
            status={status}
            ohm={props.ohmTexts?.get(part.id)}
            pinNode={props.pinNode}
            onMode={(next) => onUpdatePart(part.id, { props: next })}
          />
        ) : part.type === 'arduino' ? (
          <ArduinoCardBody
            part={part}
            frame={frame}
            status={status}
            pinConnected={(pin) => props.devices.pinConnected(part.id, pin)}
            onProgram={(program) => onUpdatePart(part.id, { props: withProp(part.type, part.props, 'program', program) })}
          />
        ) : (
          <>
            {part.type === 'pushbutton' && (
              <HoldButton pressed={props.pressed?.has(part.id) ?? false} onPress={(down) => props.onPress?.(part.id, down)} touch={touch} />
            )}
            <PrimaryControl {...props} values={values} locked={locked} />
            {sliderRows.length > 0 && <div className="flex flex-col gap-2">{sliderRows}</div>}
            {isLogicChip(part.type) && <LogicDetails part={part} frame={frame} />}
            <LiveTiles
              part={part}
              frame={frame}
              note={part.type === 'lm317' ? lm317Note(props.divider?.(part.id) ?? null, frame?.statuses.get(part.id)?.regulator?.current ?? 0) : undefined}
            />
            {props.liveHidden && status !== 'stopped' && <p className="m-0 text-label leading-snug text-muted">{t.liveHiddenNote}</p>}
          </>
        )}
        <MoreSettings {...props} values={values} locked={locked} />
      </div>
    </section>
  );
}

function OpenCardHeader({
  part,
  settings,
  status,
  badges,
  onRotate,
  onDelete,
  onRepair,
  frame,
  onClose,
  onFocus3d,
  fixed,
}: NotebookProps & { part: Part; badges: ReactNode; onClose: () => void; bodyId: string; fixed: 'locked' | 'plugged' | null }) {
  const touch = useTouchUi();
  const burned = frame?.statuses.get(part.id)?.burned === true;
  const size = touch ? 'h-11 w-11' : 'h-9 w-9';
  const action = (icon: IconName, label: string, onClick: () => void, danger = false) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded-md hover:bg-panel-2 ${size} ${danger ? 'text-danger' : 'text-ink'}`}
    >
      <Icon name={icon} />
    </button>
  );
  return (
    <div className="flex items-center gap-2">
      <SymbolIcon type={part.type} resistorStyle={settings.resistorStyle} className="max-h-[18px] w-[34px] shrink-0 text-accent-ink" />
      <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
        {part.label} <span className="font-normal text-muted">· {tr.devices.names[part.type]}</span>
      </h3>
      {badges}
      {onFocus3d &&
        (touch ? (
          action('search', tr.bench.focus, () => onFocus3d(part.id))
        ) : (
          <button
            type="button"
            onClick={() => onFocus3d(part.id)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-label font-medium text-ink hover:bg-panel-2"
          >
            <Icon name="search" className="h-3.5 w-3.5" />
            {tr.bench.focus}
          </button>
        ))}
      {burned && status !== 'stopped' && action('saved', tr.inspector.repair, () => onRepair(part.id))}
      {/* Dokunmatikte çalışırken devrenin yapısı kilitli (Ölç kipi; DP3): döndür ve sil yok. Görevde
          kilitli parçada ikisi de yok; takılı ampermetre döndürülmez, kaldırılır (Sil). */}
      {!(touch && status !== 'stopped') && (
        <>
          {fixed === null && action('rotate', tr.toolbar.rotate, () => onRotate([part.id]))}
          {fixed !== 'locked' && action('trash', tr.toolbar.remove, onDelete, true)}
        </>
      )}
      {action('chevronUp', t.collapse, onClose)}
    </div>
  );
}

/** Basmalı düğmenin "Basılı tut"u: fare, parmak ya da Boşluk / Enter kalkana kadar basılı. */
function HoldButton({ pressed, onPress, touch }: { pressed: boolean; onPress: (down: boolean) => void; touch: boolean }) {
  const isKey = (key: string) => key === ' ' || key === 'Enter';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress(true);
      }}
      onPointerUp={() => onPress(false)}
      onPointerCancel={() => onPress(false)}
      onLostPointerCapture={() => onPress(false)}
      onKeyDown={(e) => {
        if (!isKey(e.key)) return;
        e.preventDefault();
        if (!e.repeat) onPress(true);
      }}
      onKeyUp={(e) => isKey(e.key) && onPress(false)}
      onBlur={() => onPress(false)}
      className={`flex select-none items-center justify-center rounded-md text-[15px] font-semibold text-on-ink ${touch ? 'h-14' : 'h-12'} ${pressed ? 'bg-accent' : 'bg-ink'}`}
    >
      {pressed ? t.holding : t.hold}
    </button>
  );
}

/** Ana ayar: sayıda −/+ adımlayıcı ve sık kullanılan değerler, seçenekte çipler. */
function PrimaryControl({ part, values, focusRequest, status, onUpdatePart, locked }: NotebookProps & { part: Part; values: Record<string, PropValue>; locked: boolean }) {
  const prop = primaryProp(part);
  if (!prop) return null;
  const commit = (value: PropValue) => onUpdatePart(part.id, { props: withProp(part.type, part.props, prop.key, value) });
  if (prop.kind === 'number') {
    const value = typeof values[prop.key] === 'number' ? (values[prop.key] as number) : 0;
    // Görevde kilitli parçanın değeri değişmez (kullanma denetimleri ve ölçü aletleri değişir).
    const disabled = Boolean(prop.disabledWhen && values[prop.disabledWhen] === true) || (locked && !operable(part.type, prop.key));
    return (
      <ValueStepper
        label={tr.properties.fieldLabel(part.type, prop.key)}
        def={prop}
        value={value}
        disabled={disabled}
        live={status !== 'stopped'}
        presets={valuePresets(part.type, prop.key)}
        focusRequest={focusRequest}
        extra={part.type === 'resistor' ? <ColorCode ohms={value} /> : null}
        onCommit={commit}
      />
    );
  }
  return (
    <PropField
      part={part}
      prop={prop}
      values={values}
      live={false}
      inputRef={undefined}
      onCommit={commit}
      onSlide={() => {}}
    />
  );
}

function ValueStepper({
  label,
  def,
  value,
  disabled,
  live,
  presets,
  focusRequest,
  extra,
  onCommit,
}: {
  label: string;
  def: NumberPropDef;
  value: number;
  disabled: boolean;
  live: boolean;
  presets: readonly number[];
  focusRequest: number;
  extra: ReactNode;
  onCommit: (value: number) => void;
}) {
  const touch = useTouchUi();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusRequest === 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);
  const field = useCommitField(
    formatEditable(value),
    (text) => validateNumber(def, text),
    (next) => {
      if (next !== value) onCommit(next);
      return formatEditable(next);
    },
  );
  const error = disabled ? null : field.error;
  const down = disabled ? null : stepValue(def, value, -1);
  const up = disabled ? null : stepValue(def, value, 1);
  const button = touch ? 'h-11 w-11' : 'h-10 w-10';
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div className={`flex items-center overflow-hidden rounded-md border bg-panel ${touch ? 'h-12' : 'h-11'} ${fieldTone(Boolean(error))} ${disabled ? 'bg-panel-2' : ''}`}>
          <button
            type="button"
            disabled={down === null}
            onClick={() => down !== null && onCommit(down)}
            aria-label={t.decrease(label)}
            className={`flex shrink-0 items-center justify-center hover:bg-panel-2 disabled:text-stopped ${button}`}
          >
            <Icon name="minus" />
          </button>
          <input
            id={id}
            ref={inputRef}
            value={field.text}
            disabled={disabled}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-e` : undefined}
            onChange={(e) => field.setText(e.target.value)}
            onBlur={field.commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') field.commit();
              if (e.key === 'Escape') field.revert();
            }}
            className={`h-full w-20 min-w-0 bg-transparent text-center font-mono font-medium tabular outline-none disabled:text-muted ${touch ? 'text-base' : 'text-[15px]'}`}
          />
          {def.unit && <span className="pr-1 font-mono text-sm text-muted">{def.unit}</span>}
          <button
            type="button"
            disabled={up === null}
            onClick={() => up !== null && onCommit(up)}
            aria-label={t.increase(label)}
            className={`flex shrink-0 items-center justify-center hover:bg-panel-2 disabled:text-stopped ${button}`}
          >
            <Icon name="plus" />
          </button>
        </div>
        {extra}
      </div>
      {error && <FieldError id={`${id}-e`} error={error} kept={tr.inspector.invalidKept(formatSI(value, def.unit, { trim: true, digits: 4 }))} />}
      {live && !error && (
        <span className="flex items-center gap-1.5 text-label text-ok">
          <i className="block h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
          {tr.inspector.liveApplied}
        </span>
      )}
      {presets.length > 0 && !disabled && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr.inspector.presets}>
          {presets.map((preset) => {
            const selected = Math.abs(preset - value) <= Math.abs(value) * 1e-9;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => !selected && onCommit(preset)}
                className={`rounded-sm border px-2.5 font-mono text-small font-medium ${touch ? 'h-11' : 'h-8'} ${
                  selected ? 'border-ink bg-ink text-on-ink' : 'border-line-2 bg-panel text-ink hover:bg-panel-2'
                }`}
              >
                {presetLabel(preset)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColorCode({ ohms }: { ohms: number }) {
  const bands = resistorBands(ohms);
  return (
    <span className="flex items-center gap-1.5 text-label text-ink-2" role="img" aria-label={t.colorCodeLabel(resistorColorCode(ohms))} title={resistorColorCode(ohms)}>
      {t.colorCode}
      <span className="flex gap-0.5 rounded-sm border border-line bg-panel-2 px-1.5 py-1" aria-hidden="true">
        {bands.map((color, i) => (
          <span key={i} className={`h-3.5 w-[5px] ${i === 3 ? 'ml-1' : ''}`} style={{ background: color }} />
        ))}
      </span>
    </span>
  );
}

/** Çalışırken Gerilim, Akım, Güç (ve türe özel öbür satırlar) karelerde; durmuşken yok. */
function LiveTiles({ part, frame, note }: { part: Part; frame: SimFrame | null; note?: string | undefined }) {
  const rows = liveRows(part, frame);
  // Giriş yetmiyorsa uyarı notu kalır; öbür durumda formül notu.
  const live = rows && note && !frame?.statuses.get(part.id)?.regulator?.dropout ? { ...rows, note } : rows;
  const spoken = useThrottledText(live ? live.rows.map((r) => `${plainText(r.label)} ${r.value}`).join(', ') : '');
  if (!live || live.rows.length === 0) return null;
  const formula = live.note?.includes('→') ?? false;
  return (
    <div className="flex flex-col gap-2">
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {live.rows.map((row: ReadoutRow) => (
          <span key={row.label} className="flex min-w-0 flex-col gap-0.5 rounded-md bg-panel-2 px-2.5 py-2">
            <span className="truncate text-[11px] text-muted">
              <Rich text={row.label} />
            </span>
            <span className="truncate font-mono text-base tabular">{row.value}</span>
          </span>
        ))}
      </div>
      {live.varying && <p className="text-label leading-normal text-ink-2">{tr.inspector.varyingNote}</p>}
      {live.note && (
        <div className="flex flex-col gap-1 rounded-md border border-info-line bg-info-soft px-3 py-2">
          <span className="text-label font-semibold text-info-ink">{tr.inspector.why}</span>
          <span className={formula ? 'font-mono text-[13px] text-ink' : 'text-label leading-normal text-ink-2'}>
            <Rich text={live.note} />
          </span>
        </div>
      )}
    </div>
  );
}

/** Katlı: ad, öbür özellikler, ters çevir, parçanın ne yaptığı. */
function MoreSettings({ part, doc, values, status, onUpdatePart, onFlip, locked }: NotebookProps & { part: Part; values: Record<string, PropValue>; locked: boolean }) {
  const touch = useTouchUi();
  const [open, setOpen] = useState(false);
  const id = useId();
  const def = CATALOG[part.type];
  const primary = primaryProp(part);
  const rest = RACK_DEVICES.has(part.type) ? [] : def.propDefs.filter((p) => p !== primary && !(p.kind === 'number' && p.slider));
  const otherLabels = new Set(doc.parts.filter((p) => p.id !== part.id).map((p) => p.label));
  const note = RACK_DEVICES.has(part.type) ? undefined : partNote(part.type, values);
  const commit = (key: string) => (value: PropValue) => onUpdatePart(part.id, { props: withProp(part.type, part.props, key, value) });
  /** Görevde kilitli parçanın adı ve değerleri değişmez: alan devre dışı görünür. */
  const field = (key: string | null, node: ReactNode) =>
    locked && (key === null || !operable(part.type, key)) ? (
      <fieldset key={key ?? 'label'} disabled className="m-0 min-w-0 border-0 p-0 opacity-60">
        {node}
      </fieldset>
    ) : (
      node
    );
  return (
    <div className="flex flex-col border-t border-line pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className={`flex items-center gap-1.5 self-start text-small font-medium text-accent-ink ${touch ? 'h-11' : 'h-8'}`}
      >
        <Icon name={open ? 'chevronDown' : 'chevron'} className="h-4 w-4" />
        {t.more}
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-3 pt-1">
          {field(null, <LabelField label={part.label} otherLabels={otherLabels} inputRef={undefined} onCommit={(label) => onUpdatePart(part.id, { label })} />)}
          {rest.map((prop) =>
            field(
              prop.key,
              <PropField
                key={prop.key}
                part={part}
                prop={prop}
                values={values}
                live={false}
                inputRef={undefined}
                onCommit={commit(prop.key)}
                onSlide={(v, done) => done && commit(prop.key)(v)}
              />,
            ),
          )}
          {def.polarized && !locked && (
            <button
              type="button"
              onClick={() => onFlip([part.id])}
              className={`flex items-center gap-1.5 self-start rounded-md border border-line-2 bg-panel px-3 text-small font-medium hover:bg-panel-2 ${touch ? 'h-11' : 'h-9'}`}
            >
              <Icon name="flip" />
              {tr.toolbar.flip}
            </button>
          )}
          {note && (
            <p className="rounded-md bg-panel-2 px-3 py-2 text-label leading-relaxed text-ink-2">
              <Rich text={note} />
            </p>
          )}
          {status === 'stopped' && (
            <div className="flex flex-col gap-1">
              <span className="text-label font-semibold text-muted">{tr.inspector.whatItDoes}</span>
              <p className="text-small leading-normal text-ink-2">
                <Rich text={tr.devices.descriptions[part.type]} />
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
