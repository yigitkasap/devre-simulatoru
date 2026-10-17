// Simülatörün kök bileşeni. Masaüstünde: üst çubuk, parça kütüphanesi, tuval, ipucu şeridi, cihaz rafı,
// simülasyon çubuğu ve İnceleme paneli. Telefonda: üst şerit, tuval, tek alt sayfa ve alt çubuk (Kur,
// Bağla ve Ölç kipleri). Tablette: sade üst çubuk, araç şeridi, dokunmatik kipli tuval, alt çubuk ve
// dokunmatik İnceleme paneli (cihazlar panelin bir sekmesinde). Belge durumu burada tutulur; yükleme (örnek, dosya, paylaşım bağlantısı) ve
// döndürme gibi birden çok bileşenin kullandığı işlemler de buradadır.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { exampleDoc, type ExampleId } from '../examples';
import { tr, type DiagnosticContext } from '../i18n/tr';
import { buildConnectivity, pinKey, wireKey } from '../model/connectivity';
import { addPart, addWire, flipParts, removeItems, rotateParts, updatePart } from '../model/docOps';
import { buildFlowGraph } from '../model/flow';
import { nextRotation, pinPositions } from '../model/geometry';
import { docFromHash, shareUrl } from '../model/share';
import { CATALOG } from '../model/catalog';
import { emptyDoc, type CircuitDoc } from '../model/types';
import { compileNetlist, scopeSettings, type CompiledCircuit, type Diagnostic } from '../sim';
import { numProp, type DeviceType, type PropValue } from '../sim/netlist';
import { formatSI } from '../sim/units';
import { loadSavedDoc, useAutosave } from './autosave';
import { BottomSheet, SheetBody, SheetHeader, type SheetSize } from './BottomSheet';
import { Canvas, type CanvasHandle, type CanvasStatus, type ConnectStart, type Highlight, type PhoneCanvas } from './Canvas';
import { DeviceRack, type RackLayout } from './DeviceRack';
import { ExamplesDialog } from './ExamplesDialog';
import { ExampleTab } from './ExampleTab';
import { HelpDialog } from './HelpDialog';
import { markWelcomeSeen, Tour, welcomeSeen, WelcomeDialog, type TourStep } from './Welcome';
import { Inspector, type InspectorTab } from './Inspector';
import { InspectTab, type PartPatch } from './InspectTab';
import { clearHash, downloadDoc, readDocFile } from './fileActions';
import { useFocusMode } from './fullscreen';
import { HintStrip, type StripHint } from './HintStrip';
import { Library, LibraryFlyout, type LibraryMode } from './Library';
import {
  earthTrapItem,
  findEarthTrap,
  itemFromDiagnostic,
  messageKey,
  seriesResistor,
  suggestedResistor,
  type MessageItem,
} from './messages';
import { Icon } from './icons';
import { MessagesTab, type MessageAction } from './MessagesTab';
import { partValueText } from './PartView';
import { PhoneBar, type PhoneBarActive, type PhoneBarState } from './PhoneBar';
import { PhoneDevicesBody } from './PhoneDevices';
import { FileSheet, MoreSheet, StopToEditDialog } from './PhoneModals';
import { BlockedNotice, MeasureSheetBody, PartSheetBody, PartsSheetBody, SheetTabs, type SheetTab } from './PhoneSheets';
import { PhoneSideHeader, PhoneTopStrip, type PhoneMode } from './PhoneTopStrip';
import { chainPlacement, firstFreePin } from './phoneTools';
import { useRecentParts } from './recentParts';
import { autoSettings } from './scopeView';
import { useSettings } from './settings';
import { ShareDialog } from './ShareDialog';
import { SimBar, SpeedOptions, speedLabel } from './SimBar';
import { EMPTY_SELECTION, editorReducer, initialEditorState } from './state';
import { Toast, useToast } from './Toast';
import { TabletBar, TabletPartsCard, TabletRail } from './TabletChrome';
import { TabletTopBar, TopBar } from './TopBar';
import { TouchUi } from './touchUi';
import { useCoarsePointer } from './useCoarsePointer';
import { useLayout } from './useLayout';
import { useSimulation } from './useSimulation';

/** Açılışta: adreste paylaşım bağlantısı varsa o devre, yoksa otomatik kayıt, o da yoksa boş devre. */
function initialDoc(): { doc: CircuitDoc; shared: 'loaded' | 'error' | null } {
  const shared = docFromHash(window.location.hash);
  if (shared !== undefined) clearHash();
  if (shared) return { doc: shared, shared: 'loaded' };
  return { doc: loadSavedDoc() ?? emptyDoc(), shared: shared === null ? 'error' : null };
}

/** Masaüstünde kütüphanenin açık ya da şerit olduğu tarayıcıda hatırlanır. */
const LIBRARY_KEY = 'devre-simulatoru:kutuphane';
function loadLibraryPref(): 'open' | 'rail' {
  try {
    return window.localStorage.getItem(LIBRARY_KEY) === 'rail' ? 'rail' : 'open';
  } catch {
    return 'open';
  }
}
function saveLibraryPref(pref: 'open' | 'rail'): void {
  try {
    window.localStorage.setItem(LIBRARY_KEY, pref);
  } catch {
    // Depolama kapalı: tercih yalnızca bu oturumda geçerli.
  }
}

/** Ayarları cihaz rafındaki ön panelinde olan parçalar. */
const RACK_TYPES: ReadonlySet<DeviceType> = new Set<DeviceType>(['oscilloscope', 'funcgen', 'dcsupply', 'tank']);

/** Rafın düzeni (yan yana / tek tek) tarayıcıda hatırlanır. */
const RACK_KEY = 'devre-simulatoru:raf';
function loadRackLayout(): RackLayout {
  try {
    return window.localStorage.getItem(RACK_KEY) === 'side' ? 'side' : 'single';
  } catch {
    return 'single';
  }
}

/** Kur düzeninde rafın yüksekliği (px; M05a). Ölç düzeninde kolonun %60'ı (M06a). */
const RACK_KUR_HEIGHT = 300;
const RACK_MIN_HEIGHT = 140;
/** Raf büyürken tuvale (ve ipucu şeridine) en az bu kadar yer kalır. */
const CANVAS_MIN_HEIGHT = 200;

/** Osiloskop ekranının bir taraması ≈ 0,2 s sürecek simülasyon hızı (en fazla ×1). */
function sweepSpeed(timePerDiv: number): number {
  return Math.min(1, Math.max(1e-6, 50 * timePerDiv));
}

/** Telefonda tek alt sayfanın içeriği (tasarım: P00 → "Tek alt sayfa"). */
type PhoneSheetKind = 'parts' | 'part' | 'panel' | 'devices' | 'speed';
type PanelTab = 'example' | 'circuit' | 'messages';
/** Alt çubuğun yüksekliği (güvenli alan hariç). */
const PHONE_BAR_HEIGHT = 70;

export default function Simulator() {
  const [initial] = useState(initialDoc);
  const [state, dispatch] = useReducer(editorReducer, initial.doc, initialEditorState);
  const [settings, updateSettings] = useSettings();
  const layout = useLayout();
  const phone = layout.kind === 'phone';
  const tablet = layout.kind === 'tablet';
  /** Dokunmatik düzen (telefon ya da tablet): tuvalde Kur / Bağla / Ölç kipleri. */
  const touchUi = phone || tablet;
  const [speedOpen, setSpeedOpen] = useState(false);
  const [libraryPref, setLibraryPref] = useState(loadLibraryPref);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(0);
  const [recentParts, rememberPart] = useRecentParts();
  const [libraryDragType, setLibraryDragType] = useState<DeviceType | null>(null);
  const [hoveredType, setHoveredType] = useState<DeviceType | null>(null);
  const [lastInfoType, setLastInfoType] = useState<DeviceType>('battery');
  const [canvasStatus, setCanvasStatus] = useState<CanvasStatus>({ hint: { kind: 'select' }, scale: 1 });
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('inspect');
  /** Artınca İncele sekmesindeki (telefonda parça sayfasındaki) ilk değer alanına odaklanılır. */
  const [focusRequest, setFocusRequest] = useState(0);
  /** Öğrencinin örneklere yazdığı tahminler (yalnızca bu oturumda). */
  const [predictions, setPredictions] = useState<Partial<Record<ExampleId, string>>>({});
  // Cihaz rafı ve Ölç düzeni (N01).
  const [rackLayout, setRackLayout] = useState<RackLayout>(loadRackLayout);
  const [rackActive, setRackActive] = useState<string | null>(null);
  const [rackCollapsed, setRackCollapsed] = useState(false);
  const [rackHeights, setRackHeights] = useState<{ kur: number; olc: number | null }>({ kur: RACK_KUR_HEIGHT, olc: null });
  /** Ölç düzeni: Oynat'tan sonra rafta cihaz varsa kütüphane ve İnceleme paneli şeride iner, raf büyür. */
  const [measureLayout, setMeasureLayout] = useState(false);
  const [columnHeight, setColumnHeight] = useState(0);
  const columnRef = useRef<HTMLDivElement>(null);
  /** Rafta bir jaka tıklanınca o ucun kısa süre yanıp sönmesi. */
  const [flash, setFlash] = useState<Highlight | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  // Tam ekran (masaüstü, tablet): önce devre sığdırılır, böylece yanlar gizlenince yeni alana yeniden sığar.
  const focus = useFocusMode(() => canvasRef.current?.fit());
  const fullscreenControls = { on: focus.on, panels: focus.panels, onToggle: focus.toggle, onPanel: focus.showPanel };
  const [activeExample, setActiveExample] = useState<ExampleId | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [chosenScope, setChosenScope] = useState<string | null>(null);
  // Telefon: tek alt sayfa, Bağla kipi ve karartmalı sayfalar.
  const [sheet, setSheet] = useState<{ kind: PhoneSheetKind; size: SheetSize } | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [phoneAreaHeight, setPhoneAreaHeight] = useState(0);
  const phoneAreaRef = useRef<HTMLDivElement>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('circuit');
  const [partExpanded, setPartExpanded] = useState(false);
  const [connect, setConnect] = useState<{ start: ConnectStart | null } | null>(null);
  const [modal, setModal] = useState<'file' | 'share' | 'more' | null>(null);
  const [stopAsk, setStopAsk] = useState(false);
  const [lockChipClosed, setLockChipClosed] = useState(false);
  const [chainOff, setChainOff] = useState(false);
  const [partDragging, setPartDragging] = useState(false);
  const [toast, showToast, hideToast] = useToast();
  // İlk açılış (M01): hoş geldin yalnızca ilk ziyarette (kayıtlı devre ya da paylaşım bağlantısı yoksa).
  const [welcomeOpen, setWelcomeOpen] = useState(() => !welcomeSeen() && initialIsFresh());
  const [helpOpen, setHelpOpen] = useState(false);
  const [tour, setTour] = useState<{ step: TourStep; parts: number; wires: number } | null>(null);
  const touch = useCoarsePointer();
  const canvasRef = useRef<CanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { doc, selection, tool } = state;
  const saveState = useAutosave(doc);
  const connectivity = useMemo(() => buildConnectivity(doc), [doc]);
  const flowGraph = useMemo(() => buildFlowGraph(doc), [doc]);
  const sim = useSimulation(doc, connectivity, flowGraph, settings.electronFlow);
  const hasSelection = selection.parts.length > 0 || selection.wires.length > 0;
  const selectedParts = doc.parts.filter((p) => selection.parts.includes(p.id));
  const canFlip = selectedParts.some((p) => CATALOG[p.type].polarized);
  const singlePart = selectedParts.length === 1 && selection.wires.length === 0 ? selectedParts[0]! : null;

  // --- Kütüphane (masaüstü) -----------------------------------------------------------------
  // Ölç düzeninde (açık bir örnek yoksa) kütüphane şeride, İnceleme paneli 48 px'e iner. Örnek açıkken
  // cevap Örnek sekmesinde göründüğü için paneller açık kalır, yalnızca raf büyür.
  const measureCollapse = measureLayout && !phone && activeExample === null;
  const libraryMode: LibraryMode = layout.kind === 'compact' || libraryPref === 'rail' || measureCollapse ? 'rail' : 'full';
  const showFlyout = layout.kind === 'compact' && flyoutOpen && !measureCollapse;
  const setLibraryPrefSaved = (pref: 'open' | 'rail') => {
    setLibraryPref(pref);
    saveLibraryPref(pref);
  };
  // Bilgi alanındaki parça: üzerine gelinen, yerleştirilen, sürüklenen ya da seçili tek parça; hiçbiri
  // yoksa en son anlatılan.
  const currentInfo = hoveredType ?? (tool.kind === 'place' ? tool.type : null) ?? libraryDragType ?? singlePart?.type ?? null;
  useEffect(() => {
    if (currentInfo) setLastInfoType(currentInfo);
  }, [currentInfo]);
  const infoType = currentInfo ?? lastInfoType;

  // --- Yükleme (örnek, dosya, paylaşım bağlantısı, yeni devre) ---------------------------
  /** Yeni bir belge yükler; önceki belge geri alma geçmişinde kalır. */
  const loadDoc = (next: CircuitDoc, message: string, example: ExampleId | null = null) => {
    dispatch({ type: 'commit', doc: next, selection: EMPTY_SELECTION });
    dispatch({ type: 'set-tool', tool: { kind: 'select' } });
    setActiveExample(example);
    setAnswerRevealed(false);
    setConnect(null);
    if (example) {
      setInspectorTab('example');
      // Telefonda örneğin açıklaması ve tahmin sorusu alttaki sayfada (P06).
      setPanelTab('example');
      setSheet({ kind: 'panel', size: 'half' });
    } else {
      setSheet(null);
    }
    setFitRequest((n) => n + 1);
    // Bildirimde Geri al: önceki devre ve (varsa) önceki örnek geri gelir (N03).
    const previousExample = activeExample;
    showToast(message, 'info', {
      label: tr.toast.undo,
      run: () => {
        dispatch({ type: 'undo' });
        setActiveExample(previousExample);
      },
    });
  };

  const loadExample = (id: ExampleId) => {
    const next = exampleDoc(id);
    if (next) loadDoc(next, tr.examples.loaded, id);
  };

  useEffect(() => {
    if (initial.shared === 'loaded') showToast(tr.file.sharedLoaded);
    if (initial.shared === 'error') showToast(tr.file.sharedError, 'error');
  }, [initial, showToast]);

  // iOS Safari dokunuşları sayfaya yalnızca o olay türünü dinleyen bir öğenin alanında iletir. React ise
  // dinleyicilerini Astro'nun kutusuz (display: contents) ada öğesine bağlar; bu alan boş kalınca tuvale
  // hiçbir işaretçi olayı gelmez (düğmeler, tıklama ayrı yoldan geldiği için yine çalışır). Belgeye
  // bağlanan boş ve pasif dinleyiciler bütün sayfayı dokunma alanı yapar; kaydırmayı da yavaşlatmaz.
  useEffect(() => {
    const noop = () => {};
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
    for (const type of types) document.addEventListener(type, noop, { passive: true });
    return () => {
      for (const type of types) document.removeEventListener(type, noop);
    };
  }, []);

  // Aynı sekmede başka bir paylaşım bağlantısı açılırsa.
  const loadDocRef = useRef(loadDoc);
  loadDocRef.current = loadDoc;
  useEffect(() => {
    const onHash = () => {
      const shared = docFromHash(window.location.hash);
      if (shared === undefined) return;
      clearHash();
      if (shared) loadDocRef.current(shared, tr.file.sharedLoaded);
      else showToast(tr.file.sharedError, 'error');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [showToast]);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const next = await readDocFile(file);
    if (next) loadDoc(next, tr.file.imported);
    else showToast(tr.file.importError, 'error');
  };

  // Örneğin cevabı, örnek yüklendikten sonra Oynat'a basılınca açılır. (Simülasyon çalışırken başka
  // bir örnek yüklenirse simülasyon bir sonraki çizimde durur; bu arada cevap açılmamalı.)
  const previousStatus = useRef(sim.status);
  useEffect(() => {
    if (activeExample && sim.status === 'running' && previousStatus.current !== 'running') setAnswerRevealed(true);
    previousStatus.current = sim.status;
  }, [activeExample, sim.status]);

  // --- Döndürme ve ters çevirme ------------------------------------------------------------
  // Döndür (R): 90°, bağlı kablolar pinleri izler. Ters çevir (F): yönlü parçanın uçları yer
  // değiştirir, kablolar yerinde kalır.
  const rotateSelection = (ids: readonly string[]) => {
    if (ids.length > 0) dispatch({ type: 'commit', doc: rotateParts(doc, new Set(ids)) });
  };
  const flipSelection = (ids: readonly string[]) => {
    if (ids.length > 0) dispatch({ type: 'commit', doc: flipParts(doc, new Set(ids)) });
  };
  const rotate = () => {
    if (tool.kind === 'place') dispatch({ type: 'set-tool', tool: { ...tool, rotation: nextRotation(tool.rotation) } });
    else rotateSelection(selection.parts);
  };
  /** Seçili öğeleri siler; bildirimde Geri al (P00: "Geri al her silme bildiriminde"). */
  const deleteSelection = () => {
    const count = selection.parts.length + selection.wires.length;
    if (count === 0) return;
    const what = count === 1 && singlePart ? singlePart.label : tr.phone.items(count);
    dispatch({ type: 'commit', doc: removeItems(doc, selection.parts, selection.wires), selection: EMPTY_SELECTION });
    showToast(tr.toast.deleted(what), 'info', { label: tr.toast.undo, run: () => dispatch({ type: 'undo' }) });
  };

  // --- Tanılama ve mesajlar ---------------------------------------------------------------
  // Topoloji kontrolleri devre her değiştiğinde çalışır (simülasyon durdurulmuş olsa da).
  const compiled = useMemo<CompiledCircuit | null>(() => {
    try {
      return compileNetlist(connectivity.netlist);
    } catch {
      return null;
    }
  }, [connectivity]);

  const diagnosticContext = useMemo<DiagnosticContext>(() => {
    const byId = new Map(doc.parts.map((p) => [p.id, p]));
    return {
      label: (id) => byId.get(id)?.label ?? id,
      type: (id) => byId.get(id)?.type,
    };
  }, [doc]);

  /** Toprak tuzağı: topraklı cihazların COM'ları şebeke toprağıyla birleşip bir parçayı kısa devre ediyor. */
  const earthTrap = useMemo(() => (compiled ? findEarthTrap(doc, compiled) : null), [doc, compiled]);

  const messages = useMemo<MessageItem[]>(() => {
    const list: Diagnostic[] = [...(compiled?.diagnostics ?? []), ...(sim.frame?.runtime ?? [])];
    if (sim.notice?.kind === 'error') list.push(sim.notice.diagnostic);
    const seen = new Set<string>();
    const items: MessageItem[] = [];
    for (const d of list) {
      const key = messageKey(d);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(itemFromDiagnostic(d, diagnosticContext));
    }
    if (earthTrap) items.push(earthTrapItem(earthTrap, doc));
    // Önce hatalar, sonra uyarılar, en son bilgiler (kendi içlerinde sıra korunur).
    const rank = { error: 0, warning: 1, info: 2 } as const;
    return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [compiled, sim.frame?.runtime, sim.notice, diagnosticContext, earthTrap, doc]);

  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

  /** Ayarlar → "Düğüm gerilimlerini yaz": her düğümün en uzun kablo parçasının ortasında gerilim. */
  const nodeLabels = useMemo(() => {
    if (!settings.nodeVoltages || !sim.frame || !compiled) return undefined;
    const best = new Map<string, { at: { x: number; y: number }; length: number; voltage: number }>();
    for (const wire of doc.wires) {
      const key = wireKey(wire.id);
      const voltage = sim.frame.wireVoltages.get(wire.id);
      if (voltage === undefined || !compiled.nets.has(key)) continue;
      const net = compiled.nets.findKey(key);
      for (let i = 1; i < wire.points.length; i++) {
        const a = wire.points[i - 1]!;
        const b = wire.points[i]!;
        const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (length < (best.get(net)?.length ?? 0)) continue;
        const at = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
        best.set(net, { at, length, voltage });
      }
    }
    return [...best.values()].map((n) => ({ at: n.at, text: formatSI(n.voltage, 'V', { digits: 3 }) }));
  }, [settings.nodeVoltages, sim.frame, compiled, doc.wires]);

  /** Bir mesajın vurgulayacağı parçalar ve kablolar. */
  const highlightOf = (d: MessageItem): Highlight => {
    const nets = new Set(d.netKeys);
    const wires = new Set<string>();
    if (compiled && nets.size > 0) {
      for (const wire of doc.wires) {
        const key = wireKey(wire.id);
        if (!compiled.nets.has(key)) continue;
        if (nets.has(compiled.nets.findKey(key)) || nets.has(compiled.wiring.findKey(key))) wires.add(wire.id);
      }
    }
    return { parts: new Set(d.elementIds), wires, severity: d.severity };
  };
  const selectedItem = messages.find((m) => m.key === selectedMessage);
  const highlight = selectedItem ? highlightOf(selectedItem) : null;

  const selectMessage = (item: MessageItem | null) => {
    setSelectedMessage(item?.key ?? null);
    if (item) {
      const h = highlightOf(item);
      canvasRef.current?.reveal([...h.parts], [...h.wires]);
    }
  };

  // --- Tuvalde hata ve uyarı işaretleri ----------------------------------------------------
  // Kurulum sırasında (boşta uçlar vb.) tuval sakin kalır; rozetler simülasyon çalışırken ya da
  // Oynat'a basılıp başlayamadığında çıkar (M07a, M07b).
  const showIssues = sim.status !== 'stopped' || sim.notice?.kind === 'error';
  const issues = useMemo(() => {
    const map = new Map<string, 'error' | 'warning'>();
    if (!showIssues) return map;
    for (const item of messages) {
      // Bilgi bir sorun değildir: tuvalde rozet almaz.
      if (item.severity === 'info') continue;
      for (const id of item.badgeIds ?? item.elementIds) {
        if (map.get(id) !== 'error') map.set(id, item.severity);
      }
    }
    return map;
  }, [messages, showIssues]);
  const issuePins = useMemo(() => {
    if (!showIssues) return [];
    const points = [];
    for (const item of messages) {
      const d = item.diagnostic;
      if (d?.code !== 'floating-pin' || d.pin === undefined) continue;
      const part = doc.parts.find((p) => p.id === d.elementIds[0]);
      const at = part ? pinPositions(part)[d.pin] : undefined;
      if (at) points.push(at);
    }
    return points;
  }, [messages, showIssues, doc]);

  /** Mesajın düzeltme düğmeleri: yanan LED için Onar ve (tek seri direnç varsa) önerilen ön direnç. */
  const messageActions = (item: MessageItem): MessageAction[] => {
    const d = item.diagnostic;
    if (d?.code !== 'led-burned') return [];
    const ledId = d.elementIds[0]!;
    const actions: MessageAction[] = [{ label: tr.messages.repair, primary: true, run: () => sim.repair(ledId) }];
    const resistorId = compiled ? seriesResistor(ledId, compiled) : null;
    const resistor = resistorId ? doc.parts.find((p) => p.id === resistorId) : undefined;
    const value = suggestedResistor(sim.frame?.vmax ?? 0, d.params?.forwardVoltage ?? 2);
    if (resistor && value !== null) {
      actions.push({
        label: tr.messages.setResistor(resistor.label, formatSI(value, 'Ω', { trim: true })),
        run: () => {
          dispatch({ type: 'commit', doc: updatePart(doc, resistor.id, { props: { ...resistor.props, resistance: value } }) });
          sim.repair(ledId);
        },
      });
    }
    return actions;
  };
  /** LED balonundaki "Neden?": Mesajlar sekmesinde o mesaj seçili açılır. */
  const explain = (partId: string) => {
    const item = messages.find((m) => m.code === 'led-burned' && m.elementIds.includes(partId));
    setInspectorTab('messages');
    setMeasureLayout(false);
    if (phone) openPanel('messages', 'half');
    if (item) setSelectedMessage(item.key);
  };

  // --- Sıfır noktaları: toprak yokken (ya da toprağa bağlı olmayan parçada) "0 V" işareti -------
  // Yalnızca enerji kaynağı içeren adalarda gösterilir (tek başına duran parçalarda işaret kalabalık yapar).
  const zeroPoints = useMemo(() => {
    if (!compiled) return [];
    const points: Array<{ at: { x: number; y: number }; grounded: boolean }> = [];
    for (const ref of compiled.autoReferences) {
      if (!ref.hasSource) continue;
      const part = doc.parts.find((p) => p.id === ref.elementId);
      const at = part ? pinPositions(part)[ref.pin] : undefined;
      if (at) points.push({ at, grounded: compiled.hasGround });
    }
    return points;
  }, [compiled, doc]);

  // --- İpucu şeridinde hata/uyarı özeti ---------------------------------------------------
  const errorCount = messages.filter((m) => m.severity === 'error').length;
  const warningCount = messages.filter((m) => m.severity === 'warning').length;
  const runtimeIssues = messages.some((m) => (m.diagnostic && (sim.frame?.runtime ?? []).includes(m.diagnostic)) || m.code === 'earth-trap');

  /** Telefon: alt sayfayı panel olarak verilen sekmede açar. */
  const openPanel = (tab: PanelTab, size: SheetSize) => {
    setPanelTab(tab);
    setSheet({ kind: 'panel', size });
  };

  // Simülasyon hatası ya da yeni bir çalışma uyarısı (kısa devre, yanan LED) gelince Mesajlar sekmesi öne
  // gelir (odak alınmaz); telefonda alt sayfa küçük açılır (P10). Simülasyon başlatılamadıysa hata seçilir.
  const runtimeKeys = (sim.frame?.runtime ?? []).map(messageKey).join(';');
  const previousRuntime = useRef('');
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
  useEffect(() => {
    const before = new Set(previousRuntime.current.split(';'));
    previousRuntime.current = runtimeKeys;
    const fresh = runtimeKeys ? runtimeKeys.split(';').filter((k) => !before.has(k)) : [];
    if (fresh.length > 0) {
      setInspectorTab('messages');
      if (phoneRef.current) {
        // Telefonda mesaj seçili gelir: düzeltme düğmeleri (Onar, "R1'i … yap") hemen görünür (P10).
        setSelectedMessage(fresh[0]!);
        setSheet((s) => (s?.kind === 'devices' ? s : (setPanelTab('messages'), { kind: 'panel', size: 'half' })));
      }
    }
  }, [runtimeKeys]);
  useEffect(() => {
    if (sim.notice?.kind === 'error') {
      setInspectorTab('messages');
      setSelectedMessage(messageKey(sim.notice.diagnostic));
      if (phoneRef.current) {
        setPanelTab('messages');
        setSheet({ kind: 'panel', size: 'half' });
      }
    }
  }, [sim.notice]);

  // Tuvalde bir şey seçilince İncele sekmesi açılır; telefonda Kur kipinde parçanın sayfası (P04).
  const selectionKey = [...selection.parts, '|', ...selection.wires].join(',');
  useEffect(() => {
    if (selection.parts.length + selection.wires.length > 0) setInspectorTab('inspect');
    if (!phoneRef.current) return;
    setPartExpanded(false);
    setSheet((s) => {
      // Parça eklerken (Parça sayfası açık) ya da Ölç kipinde sayfa değişmez.
      if (s?.kind === 'parts' || s?.kind === 'devices' || s?.kind === 'speed') return s;
      if (sim.status !== 'stopped') return s;
      if (singlePart) return { kind: 'part', size: 'half' };
      return s?.kind === 'part' ? null : s;
    });
  }, [selectionKey]);

  /** Çift tık: masaüstünde parçayı seçip İncele'deki ilk değer alanına odaklanır; telefonda değer sayfası. */
  const openProperties = (partId: string) => {
    dispatch({ type: 'select', selection: { parts: [partId], wires: [] } });
    setInspectorTab('inspect');
    if (phone) {
      if (sim.status === 'stopped') setSheet({ kind: 'part', size: 'half' });
      else {
        openPanel('circuit', 'half');
        setPartExpanded(true);
      }
    }
    setFocusRequest((n) => n + 1);
  };
  const updatePartFromPanel = (partId: string, patch: PartPatch) => {
    dispatch({ type: 'commit', doc: updatePart(doc, partId, patch) });
  };
  const idleHint = canvasStatus.hint.kind === 'select' || canvasStatus.hint.kind === 'empty' || canvasStatus.hint.kind === 'simulating';
  const summary = tr.messages.summary(errorCount, warningCount);
  const stripHint: StripHint =
    sim.notice?.kind === 'error' && idleHint
      ? { kind: 'issues', text: tr.messages.stripBlocked(summary), tone: 'error' }
      : sim.status !== 'stopped' && runtimeIssues && idleHint
        ? { kind: 'issues', text: tr.messages.stripRuntime(summary), tone: errorCount > 0 ? 'error' : 'warn' }
        : measureLayout && idleHint
          ? { kind: 'measure', example: activeExample !== null }
          : activeExample && !answerRevealed && idleHint && canvasStatus.hint.kind !== 'simulating'
            ? { kind: 'example' }
            : canvasStatus.hint;

  // --- Osiloskop -------------------------------------------------------------------------
  // "Osiloskoba göre" hızının osiloskobu: seçili osiloskop, yoksa son seçilen, o da yoksa ilki.
  const scopes = doc.parts.filter((p) => p.type === 'oscilloscope');
  const selectedScope = scopes.find((p) => selection.parts.includes(p.id));
  const scope = selectedScope ?? scopes.find((p) => p.id === chosenScope) ?? scopes[0];
  useEffect(() => {
    if (selectedScope) setChosenScope(selectedScope.id);
  }, [selectedScope]);
  const scopeSpeed = scope ? sweepSpeed(scopeSettings(scope.props).timePerDiv) : null;
  /** Cihazın ayarlarını değiştirir (geri alınabilir; simülasyonu durdurmaz). */
  const changeInstrument = (partId: string, patch: Record<string, PropValue>) => {
    const part = doc.parts.find((p) => p.id === partId);
    if (part) dispatch({ type: 'commit', doc: updatePart(doc, partId, { props: { ...part.props, ...patch } }) });
  };
  /**
   * Oto ayar: kayıt varsa sinyalden, yoksa devredeki AC kaynakların frekansından ve kaynak
   * gerilimlerinden; hız da bir tarama ≈ 0,2 s sürecek biçimde. Bir bildirim neyin değiştiğini söyler.
   */
  const autoScopeFor = (target: (typeof doc.parts)[number]) => {
    const connected = [0, 1].map((pin) => !connectivity.unconnectedPins.has(pinKey(target.id, pin))) as [boolean, boolean];
    let frequency: number | null = null;
    let peak: number | null = null;
    for (const part of doc.parts) {
      if (part.type === 'acsource' || part.type === 'funcgen') {
        const f = numProp(part.props, 'frequency', 0);
        if (f > 0) frequency = frequency === null ? f : Math.min(frequency, f);
        // Fonksiyon üretecinin genliği tepe-tepedir.
        const amplitude = Math.abs(numProp(part.props, 'amplitude', 0)) / (part.type === 'funcgen' ? 2 : 1);
        peak = Math.max(peak ?? 0, Math.abs(numProp(part.props, 'offset', 0)) + amplitude);
      } else if (part.type === 'battery') {
        peak = Math.max(peak ?? 0, Math.abs(numProp(part.props, 'voltage', 0)));
      }
    }
    const settings = scopeSettings(target.props);
    const patch = autoSettings(sim.scopeRecorder(target.id), settings, connected, { frequency, peak });
    changeInstrument(target.id, patch);
    // Hız: bir ekran taraması ≈ 0,2 s sürsün (yüksek frekansta simülasyon yavaşlatılır, en fazla ×1).
    const timePerDiv = patch.timePerDiv ?? settings.timePerDiv;
    const speed = sweepSpeed(timePerDiv);
    sim.setSpeed(speed);
    const perDiv = tr.scope.perDiv;
    const parts = [
      `${formatSI(timePerDiv, 's', { trim: true })}${perDiv}`,
      `A ${formatSI(patch.voltsPerDivA ?? settings.voltsPerDiv[0], 'V', { trim: true })}${perDiv}`,
      `B ${formatSI(patch.voltsPerDivB ?? settings.voltsPerDiv[1], 'V', { trim: true })}${perDiv}`,
      tr.rack.autoSpeed(speedLabel(speed)),
    ];
    showToast(tr.rack.autoDone(parts.join(' · ')));
  };

  // --- Cihaz rafı ---------------------------------------------------------------------------
  const instruments = doc.parts.filter((p) => RACK_TYPES.has(p.type));
  // Tablette cihazlar İnceleme panelinin Cihazlar sekmesinde (raf yok).
  const showRack = !touchUi && instruments.length > 0;
  // Tuvalde bir cihaz seçilince raf (telefonda Cihazlar sayfası) onu gösterir.
  const selectedInstrument = singlePart && RACK_TYPES.has(singlePart.type) ? singlePart.id : null;
  useEffect(() => {
    if (selectedInstrument) setRackActive(selectedInstrument);
  }, [selectedInstrument]);
  // Kolonun yüksekliği (rafın en büyük yüksekliği bundan hesaplanır).
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => setColumnHeight(entries[0]?.contentRect.height ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [phone]);
  const rackMax = Math.max(RACK_MIN_HEIGHT, Math.min(columnHeight * 0.6, columnHeight - CANVAS_MIN_HEIGHT - 28 - 52));
  const clampRack = (h: number) => Math.round(Math.max(RACK_MIN_HEIGHT, Math.min(rackMax, h)));
  const rackHeight = clampRack(measureLayout ? (rackHeights.olc ?? rackMax) : rackHeights.kur);
  // Ölç düzenine giriş (Oynat) ve çıkış (Durdur, parça sürükleme, şeritteki düğmeler).
  const previousRunStatus = useRef(sim.status);
  useEffect(() => {
    const before = previousRunStatus.current;
    previousRunStatus.current = sim.status;
    if (sim.status === 'stopped') setMeasureLayout(false);
    else if (sim.status === 'running' && before === 'stopped' && showRack) setMeasureLayout(true);
    // Kilit bilgisi yalnızca ilk Ölç'te; sonra kip rozeti yeter (N02).
    if (sim.status === 'stopped' && before !== 'stopped') setLockChipClosed(true);
    // Oynat'ta Bağla kipi ve parça ekleme kapanır (Ölç'te yapı kilitli).
    if (sim.status !== 'stopped' && before === 'stopped') {
      setConnect(null);
      setSheet((s) => (s?.kind === 'parts' ? null : s));
    }
    if (!phoneRef.current) return;
    // Telefon: Oynat'ta Kur'un sayfaları Ölç'ünkilere döner (parça sayfası → ölçümler); Durdur'da tersi.
    if (sim.status !== 'stopped' && before === 'stopped') {
      setSheet((s) => (s?.kind === 'part' ? (setPanelTab('circuit'), { kind: 'panel', size: 'peek' }) : s));
    } else if (sim.status === 'stopped' && before !== 'stopped') {
      setSheet((s) => (s?.kind === 'devices' || s?.kind === 'speed' ? null : s));
    }
  }, [sim.status, showRack]);
  useEffect(() => {
    if (tool.kind === 'place' || libraryDragType) setMeasureLayout(false);
  }, [tool.kind, libraryDragType]);
  /** Raftaki jak: o ucun ve kablolarının kısa süre yanıp sönmesi. */
  const flashTimer = useRef(0);
  const flashPin = (partId: string, pin: number) => {
    const part = doc.parts.find((p) => p.id === partId);
    const at = part ? pinPositions(part)[pin] : undefined;
    if (!part || !at) return;
    const wires = new Set<string>();
    const key = pinKey(partId, pin);
    if (compiled?.wiring.has(key)) {
      const root = compiled.wiring.findKey(key);
      for (const wire of doc.wires) {
        const wk = wireKey(wire.id);
        if (compiled.wiring.has(wk) && compiled.wiring.findKey(wk) === root) wires.add(wire.id);
      }
    }
    window.clearTimeout(flashTimer.current);
    setFlash({ parts: new Set(), wires, severity: 'info', pins: [at] });
    canvasRef.current?.reveal([partId], [...wires]);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
  };
  const showInRack = (partId: string) => {
    setRackActive(partId);
    setRackCollapsed(false);
  };

  const closeFlyout = useCallback(() => setFlyoutOpen(false), []);
  const libraryProps = {
    width: layout.libraryWidth,
    tool,
    settings,
    dispatch,
    onDragTypeChange: setLibraryDragType,
    onClose: closeFlyout,
    onCollapse: () => setLibraryPrefSaved('rail'),
    onExpand: (search: boolean) => {
      // Ölç düzeninde şeritteki düğme Kur düzenine döndürür.
      if (measureCollapse) setMeasureLayout(false);
      if (layout.kind === 'compact') setFlyoutOpen(true);
      else if (!measureCollapse) setLibraryPrefSaved('open');
      if (search) setFocusSearch((n) => n + 1);
    },
    focusSearch,
    touch,
    onPreview: setHoveredType,
    infoType,
    recent: recentParts,
    flyoutOpen: showFlyout,
    onAddPart: (type: DeviceType) => canvasRef.current?.addPartAtCenter(type),
  };

  // --- Telefon ------------------------------------------------------------------------------
  // Kip: Bağla (kablo çekerken), Ölç (çalışıyor ya da duraklatılmış; yapı kilitli) ya da Kur.
  const phoneMode: PhoneMode = connect ? 'bagla' : sim.status === 'running' ? 'olc' : sim.status === 'paused' ? 'pause' : 'kur';
  const canvasMode: PhoneCanvas['mode'] = connect ? 'bagla' : sim.status !== 'stopped' ? 'olc' : 'kur';
  const barState: PhoneBarState = connect
    ? 'bagla'
    : sim.status === 'running'
      ? 'olc'
      : sim.status === 'paused'
        ? 'pause'
        : sheet?.kind !== 'parts' && hasSelection
          ? 'sec'
          : 'kur';
  const barActive: PhoneBarActive =
    sheet?.kind === 'parts'
      ? 'parts'
      : sheet?.kind === 'devices'
        ? 'devices'
        : sheet?.kind === 'panel'
          ? sim.status === 'stopped'
            ? 'panel'
            : 'measure'
          : null;
  // Tuvalin yüksekliği alt sayfanın üstünde kalan alan: sayfa açılıp kapanınca devre yeniden sığar.
  useEffect(() => {
    const el = phoneAreaRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => setPhoneAreaHeight(entries[0]?.contentRect.height ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [phone]);
  useEffect(() => {
    if (!sheet) setSheetHeight(0);
  }, [sheet]);
  // Telefondan tablete ya da masaüstüne geçince telefonun durumları kapanır (tablette Bağla ve parça kartı sürer).
  useEffect(() => {
    if (phone) return;
    setModal(null);
    setSheet((s) => (tablet && s?.kind === 'parts' ? s : null));
    if (!tablet) {
      setConnect(null);
      setStopAsk(false);
    }
  }, [phone, tablet]);
  // Parça sayfası her açılışta "Zincirle ekle" açık başlar.
  useEffect(() => {
    if (sheet?.kind === 'parts') setChainOff(false);
  }, [sheet?.kind]);

  const circuitTitle = activeExample
    ? tr.examples.texts[activeExample].title
    : doc.parts.length === 0 && doc.wires.length === 0
      ? tr.phone.emptyName
      : tr.phone.defaultName;
  /** Zincirle ekle: Parça sayfası açıkken seçili parçanın boştaki ilk ucu. */
  const chainPart = sheet?.kind === 'parts' && !chainOff ? singlePart : null;
  const chainPin = chainPart ? firstFreePin(chainPart.id, connectivity.unconnectedPins, doc) : null;
  const chainTo = chainPart && chainPin !== null ? tr.phone.pinOf(chainPart.label, tr.devices.pins[chainPart.type][chainPin] ?? '') : null;
  const addFromSheet = (type: DeviceType) => {
    if (chainPart && chainPin !== null) {
      const place = chainPlacement(doc, type, { partId: chainPart.id, pin: chainPin });
      if (place) {
        const added = addPart(doc, type, place.at, place.rotation);
        const wired = addWire(added.doc, place.wire);
        dispatch({ type: 'commit', doc: wired.doc, selection: { parts: [added.id], wires: [] } });
        rememberPart(type);
        return;
      }
    }
    canvasRef.current?.addPartAtCenter(type);
  };
  const connectStartPart = connect?.start?.partId ? doc.parts.find((p) => p.id === connect.start!.partId) : undefined;
  const panelTabs: SheetTab<PanelTab>[] = [
    ...(activeExample ? [{ id: 'example' as const, label: tr.phone.tabs.example }] : []),
    { id: 'circuit', label: sim.status === 'stopped' ? tr.phone.tabs.circuit : tr.phone.tabs.measure },
    ...(messages.length > 0
      ? [{ id: 'messages' as const, label: tr.phone.tabs.messages, count: errorCount + warningCount, tone: errorCount > 0 ? ('error' as const) : ('warn' as const) }]
      : []),
  ];
  const shownTab: PanelTab = panelTabs.some((t) => t.id === panelTab) ? panelTab : 'circuit';
  const togglePanel = (tab: PanelTab, size: SheetSize) => {
    if (sheet?.kind === 'panel') setSheet(null);
    else openPanel(tab, size);
  };

  const exampleProps = {
    id: activeExample,
    revealed: answerRevealed,
    prediction: activeExample ? (predictions[activeExample] ?? '') : '',
    onPrediction: (text: string) => {
      if (activeExample) setPredictions((p) => ({ ...p, [activeExample]: text }));
    },
    onPlay: sim.play,
    onOpen: loadExample,
    onClose: () => setActiveExample(null),
    onBrowse: () => setExamplesOpen(true),
  };
  const inspectProps = {
    doc,
    selection,
    frame: sim.frame,
    status: sim.status,
    settings,
    focusRequest,
    onUpdatePart: updatePartFromPanel,
    onRotate: rotateSelection,
    onFlip: flipSelection,
    onDelete: deleteSelection,
    onRepair: sim.repair,
    onSelectPart: (partId: string) => {
      dispatch({ type: 'select', selection: { parts: [partId], wires: [] } });
      if (phone && sim.status !== 'stopped') openPanel('circuit', sheet?.size ?? 'peek');
    },
    onShowInRack: showInRack,
  };
  const messagesProps = {
    items: messages,
    selectedKey: selectedItem ? selectedItem.key : null,
    onSelect: selectMessage,
    context: diagnosticContext,
    actions: messageActions,
  };
  const openDevices = (partId?: string) => {
    if (partId) setRackActive(partId);
    setSheet({ kind: 'devices', size: 'full' });
  };

  const canvas = (
    <Canvas
      ref={canvasRef}
      doc={doc}
      selection={selection}
      tool={tool}
      settings={settings}
      connectivity={connectivity}
      dispatch={dispatch}
      libraryDragType={libraryDragType}
      onOpenProperties={openProperties}
      keyboardEnabled={!shareLink && !examplesOpen && modal === null && !helpOpen && !welcomeOpen}
      flowGraph={flowGraph}
      simActive={sim.status !== 'stopped'}
      frame={sim.frame}
      highlight={flash ?? highlight}
      onRepair={sim.repair}
      onRotate={rotateSelection}
      onFlip={flipSelection}
      fitRequest={fitRequest}
      keepVisible={selection.parts}
      phone={
        touchUi
          ? {
              mode: canvasMode,
              connectStart: connect?.start ?? null,
              onConnectStart: (start) => setConnect({ start }),
              onStartConnect: (start) => {
                dispatch({ type: 'select', selection: EMPTY_SELECTION });
                setSheet(null);
                setConnect({ start });
              },
              onExitConnect: () => setConnect(null),
              onInspect: () => (tablet ? setInspectorTab('inspect') : openPanel('circuit', sheet?.kind === 'panel' ? sheet.size : 'peek')),
              onEditAttempt: () => setStopAsk(true),
              lockChip: !lockChipClosed,
              onLockChipClose: () => setLockChipClosed(true),
              strip: phone && sheet?.size === 'full',
              ...(phone && !layout.landscape && phoneAreaHeight > 0 ? { emptyAreaHeight: phoneAreaHeight } : {}),
              ...(tablet ? { emptyHint: tr.tablet.empty } : {}),
            }
          : null
      }
      overlayOpen={
        showFlyout || Boolean(shareLink) || examplesOpen || modal !== null || stopAsk || (tablet && (sheet?.kind === 'parts' || speedOpen))
      }
      onStatusChange={setCanvasStatus}
      onPartPlaced={rememberPart}
      onExamples={() => setExamplesOpen(true)}
      issues={issues}
      issuePins={issuePins}
      earthLine={earthTrap?.comPoints ?? null}
      nodeLabels={nodeLabels}
      zeroPoints={zeroPoints}
      onExplain={explain}
    />
  );

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json,application/json"
      // display:none yerine görünmez: iOS Safari gizli dosya alanında seçiciyi açmayabiliyor.
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        void importFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  // Klavye kısayolları (onaylı liste, M12): + / − yakınlaştır, Shift+1 sığdır, P oynat/duraklat,
  // Alt+1…3 panel sekmeleri, ? yardım. Yazı alanlarında ve açık pencerelerde çalışmaz. Tuşlar e.key ve
  // e.code ile okunur; Türkçe Q klavyede de aynı.
  const dialogOpen = Boolean(shareLink) || examplesOpen || modal !== null || stopAsk || helpOpen || welcomeOpen;
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (e: KeyboardEvent) => {
    if (dialogOpen || e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    if (e.ctrlKey || e.metaKey) return;
    const inspectorTabs: InspectorTab[] = tablet && instruments.length > 0 ? ['inspect', 'example', 'devices', 'messages'] : ['inspect', 'example', 'messages'];
    if (e.altKey) {
      const n = /^Digit([1-4])$/.exec(e.code)?.[1];
      const next = n ? inspectorTabs[Number(n) - 1] : undefined;
      if (next && !phone) {
        e.preventDefault();
        setMeasureLayout(false);
        if (focus.on) focus.showPanel('right', true);
        setInspectorTab(next);
        window.setTimeout(() => document.getElementById(`inspector-tab-${next}`)?.focus(), 0);
      }
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      if (phone) setModal('more');
      else setHelpOpen(true);
    } else if (e.shiftKey && e.code === 'Digit1') {
      e.preventDefault();
      canvasRef.current?.fit();
    } else if (e.key === '+' || e.code === 'NumpadAdd') {
      e.preventDefault();
      canvasRef.current?.zoomIn();
    } else if (e.key === '-' || e.key === '−' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      canvasRef.current?.zoomOut();
    } else if ((e.key === 'p' || e.key === 'P') && !e.altKey) {
      e.preventDefault();
      if (sim.status === 'running') sim.pause();
      else sim.play();
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcutRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  /** Panelden Esc: odak tuvale döner (N02). */
  const backToCanvas = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const role = (e.target as HTMLElement).getAttribute('role');
    if (role === 'menu' || role === 'menuitem' || role === 'dialog') return;
    document.getElementById('tuval')?.focus();
  };
  const skipLink = (
    <a
      href="#tuval"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById('tuval')?.focus();
      }}
      className="sr-only z-[100] rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {tr.a11y.skip}
    </a>
  );

  // Kısa tur: her adım gerçek eylemle ilerler (parça eklendi, kablo çekildi, Oynat, parça incelendi).
  useEffect(() => {
    if (!tour) return;
    const advance = () => setTour((t) => (t ? { ...t, step: (t.step + 1) as TourStep, parts: doc.parts.length, wires: doc.wires.length } : t));
    if (tour.step === 0 && doc.parts.length > tour.parts) advance();
    else if (tour.step === 1 && doc.wires.length > tour.wires) advance();
    else if (tour.step === 2 && sim.status === 'running') advance();
    else if (tour.step === 3 && sim.status !== 'stopped' && singlePart) finishTour();
  }, [tour, doc.parts.length, doc.wires.length, sim.status, singlePart?.id]);

  const variant = phone ? 'phone' : tablet ? 'tablet' : 'desktop';
  const closeWelcome = () => {
    markWelcomeSeen();
    setWelcomeOpen(false);
  };
  const startTour = () => {
    closeWelcome();
    setHelpOpen(false);
    setModal(null);
    setTour({ step: 0, parts: doc.parts.length, wires: doc.wires.length });
  };
  const finishTour = () => {
    setTour(null);
    showToast(tr.tour.done);
  };
  const overlays = (
    <>
      {welcomeOpen && (
        <WelcomeDialog
          variant={variant}
          onExamples={() => {
            closeWelcome();
            setExamplesOpen(true);
          }}
          onBlank={closeWelcome}
          onTour={startTour}
          onExample={(id) => {
            closeWelcome();
            loadExample(id);
          }}
          onClose={closeWelcome}
        />
      )}
      {helpOpen && <HelpDialog scale={settings.wireScale} onTour={startTour} onClose={() => setHelpOpen(false)} />}
      {tour && !welcomeOpen && (
        <Tour
          step={tour.step}
          variant={variant}
          onNext={() => setTour((t) => (t && t.step < 3 ? { ...t, step: (t.step + 1) as TourStep, parts: doc.parts.length, wires: doc.wires.length } : t))}
          onClose={finishTour}
        />
      )}
    </>
  );

  const examplesDialog = examplesOpen && (
    <ExamplesDialog
      phone={phone}
      activeExample={activeExample}
      onClose={() => setExamplesOpen(false)}
      onLoad={(id) => {
        setExamplesOpen(false);
        loadExample(id);
      }}
    />
  );

  if (tablet) {
    const tabletState = connect ? 'bagla' : sim.status === 'running' ? 'olc' : sim.status === 'paused' ? 'pause' : hasSelection ? 'sec' : 'kur';
    const tabletHint: { text: string; tone?: 'error' | 'warn' } =
      sim.notice?.kind === 'error'
        ? { text: tr.messages.stripBlocked(summary), tone: 'error' }
        : sim.status !== 'stopped'
          ? runtimeIssues
            ? { text: tr.messages.stripRuntime(summary), tone: errorCount > 0 ? 'error' : 'warn' }
            : { text: settings.electronFlow ? tr.sim.electronNote : tr.sim.conventionalNote }
          : activeExample && !answerRevealed
            ? { text: tr.hints.example }
            : doc.parts.length === 0 && doc.wires.length === 0
              ? { text: tr.tablet.empty }
              : { text: hasSelection ? tr.tablet.hintSelected : tr.tablet.hintSelect };
    const showDevices = (partId: string) => {
      setRackActive(partId);
      setInspectorTab('devices');
    };
    const inspectBody = singlePart ? (
      <div className="flex min-h-0 flex-1 flex-col pt-3">
        {sim.status === 'stopped' ? (
          <PartSheetBody
            key={singlePart.id}
            part={singlePart}
            doc={doc}
            settings={settings}
            expanded
            alwaysExpanded
            onExpand={() => {}}
            focusRequest={focusRequest}
            onUpdatePart={updatePartFromPanel}
            onOpenDevices={showDevices}
          />
        ) : (
          <MeasureSheetBody
            key={singlePart.id}
            part={singlePart}
            doc={doc}
            frame={sim.frame}
            status={sim.status}
            settings={settings}
            expanded
            alwaysExpanded
            onExpand={() => {}}
            onUpdatePart={updatePartFromPanel}
            onOpenDevices={showDevices}
          />
        )}
      </div>
    ) : undefined;
    const devicesBody =
      instruments.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col bg-panel-2 pt-2">
          <PhoneDevicesBody
            devices={instruments}
            activeId={rackActive ?? instruments[0]!.id}
            onActive={setRackActive}
            scopeView={(id) => sim.frame?.scopes.get(id) ?? null}
            status={(id) => sim.frame?.statuses.get(id) ?? {}}
            outputVoltage={(id) => sim.frame?.measurements.get(id)?.voltage ?? null}
            running={sim.status !== 'stopped'}
            pinConnected={(id, pin) => !connectivity.unconnectedPins.has(pinKey(id, pin))}
            onChange={changeInstrument}
            onAuto={(id) => {
              const target = doc.parts.find((p) => p.id === id);
              if (target) autoScopeFor(target);
            }}
            onJack={flashPin}
          />
        </div>
      ) : undefined;
    const rackDevice = instruments.find((p) => p.id === rackActive) ?? instruments[0];
    return (
      <div className="app-root flex flex-col overflow-hidden">

        {skipLink}
        <TabletTopBar
          title={circuitTitle}
          mode={phoneMode}
          time={sim.frame?.time ?? 0}
          canUndo={state.past.length > 0}
          canRedo={state.future.length > 0}
          saveState={saveState}
          settings={settings}
          onSettings={updateSettings}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          onFit={() => canvasRef.current?.fit()}
          fullscreen={fullscreenControls}
          onNew={() => loadDoc(emptyDoc(), tr.file.newDone)}
          onExport={() => downloadDoc(doc)}
          onImport={() => fileInputRef.current?.click()}
          onShare={() => setShareLink(shareUrl(doc, window.location.href))}
          onExamples={() => setExamplesOpen(true)}
          onHelp={() => setHelpOpen(true)}
          onWelcome={() => setWelcomeOpen(true)}
        />
        {fileInput}
        <div className="relative flex min-h-0 flex-1">
          {focus.panels.left && (
            <TabletRail
              partsOpen={sheet?.kind === 'parts'}
              connecting={connect !== null}
              locked={sim.status !== 'stopped'}
              onParts={() => {
                setConnect(null);
                setSheet((s) => (s?.kind === 'parts' ? null : { kind: 'parts', size: 'half' }));
              }}
              onConnect={() => {
                dispatch({ type: 'select', selection: EMPTY_SELECTION });
                setSheet(null);
                setConnect((c) => (c ? null : { start: null }));
              }}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="relative min-h-0 flex-1" style={{ boxShadow: canvasMode === 'olc' ? 'inset 0 3px 0 var(--color-ok)' : undefined }}>
              {canvas}
              {sheet?.kind === 'parts' && (
                <TabletPartsCard
                  settings={settings}
                  recent={recentParts}
                  chainTo={chainTo}
                  onChainOff={() => setChainOff(true)}
                  onAdd={addFromSheet}
                  onDrop={(type, x, y) => canvasRef.current?.placeAtClient(type, x, y)}
                  onDragging={setPartDragging}
                  dragging={partDragging}
                  onClose={() => setSheet(null)}
                />
              )}
              {rackDevice && inspectorTab !== 'devices' && (
                <button
                  type="button"
                  onClick={() => {
                    setInspectorTab('devices');
                    if (focus.on) focus.showPanel('right', true);
                  }}
                  aria-label={tr.tablet.rackLabel(rackDevice.label)}
                  className="absolute right-3 bottom-3 z-10 flex h-11 items-center gap-2 rounded-full border border-stopped bg-face px-3.5 text-[13.5px] font-semibold text-ink shadow-sm active:brightness-95"
                >
                  <Icon name="devices" />
                  {tr.tablet.rack(rackDevice.label)} ▴
                </button>
              )}
            </main>
            <TabletBar
              state={tabletState}
              hint={tabletHint.text}
              hintTone={tabletHint.tone}
              statusText={tr.sim.status[sim.status]}
              canRotate={selection.parts.length > 0}
              canFlip={canFlip}
              onRotate={() => rotateSelection(selection.parts)}
              onFlip={() => flipSelection(selectedParts.filter((p) => CATALOG[p.type].polarized).map((p) => p.id))}
              onDelete={deleteSelection}
              connectMessage={connect?.start ? tr.phone.connectSecond : tr.phone.connectFirst}
              connectDetail={
                connect?.start
                  ? connectStartPart && connect.start.pin !== null
                    ? tr.phone.connectFrom(connectStartPart.label, tr.devices.pinShort[connectStartPart.type][connect.start.pin] ?? '')
                    : tr.phone.connectFromWire
                  : tr.phone.connectEnlarged
              }
              canUndo={state.past.length > 0}
              onUndo={() => dispatch({ type: 'undo' })}
              onDone={() => setConnect(null)}
              speed={sim.speed}
              scopeSpeed={scopeSpeed}
              onSpeed={sim.setSpeed}
              onSpeedOpen={setSpeedOpen}
              onStop={sim.stop}
              onPlay={sim.play}
              onPause={sim.pause}
            />
          </div>
          {focus.panels.right && (
            <Inspector
              width={layout.inspectorWidth}
              collapsed={false}
              onExpand={setInspectorTab}
              tab={inspectorTab}
              onTab={setInspectorTab}
              inspect={inspectProps}
              example={exampleProps}
              messages={messagesProps}
              touch
              devices={devicesBody}
              inspectBody={inspectBody}
              onKeyDown={backToCanvas}
            />
          )}
        </div>
        {shareLink && <ShareDialog link={shareLink} onClose={() => setShareLink(null)} />}
        {stopAsk && (
          <StopToEditDialog
            onStop={() => {
              setStopAsk(false);
              sim.stop();
            }}
            onCancel={() => setStopAsk(false)}
          />
        )}
        {examplesDialog}
        {overlays}
        <Toast toast={toast} offset={84} onDone={hideToast} />
      </div>
    );
  }

  if (phone) {
    const landscape = layout.landscape;
    const blocked = sim.notice?.kind === 'error';
    // Yatay telefonda yan panel hep açık: sayfa yoksa panel (Örnek / Devre ya da Ölçümler / Mesajlar).
    const shown = sheet ?? (landscape ? { kind: 'panel' as const, size: 'half' as const } : null);
    /** Alt sayfanın (yatayda yan panelin) içeriği ve özellikleri. */
    let spec: {
      sizes: readonly SheetSize[];
      /** Yarım konumda pencerenin en çok bu kadarı (yoksa yarısı). */
      halfRatio?: number;
      label: string;
      role?: 'region' | 'dialog' | 'alertdialog';
      tone?: 'panel' | 'rack';
      content: ReactNode;
    } | null = null;
    if (shown?.kind === 'parts') {
      spec = {
        // Biraz daha açık başlar; tutamaçtan ya da başlıktan yukarı çekilince tam boy olur.
        sizes: ['half', 'full'],
        halfRatio: 0.6,
        label: tr.phone.addTitle,
        role: 'dialog',
        content: (
          <>
            <SheetHeader title={tr.phone.addTitle} onClose={() => setSheet(null)} />
            <PartsSheetBody
              settings={settings}
              recent={recentParts}
              chainTo={chainTo}
              onChainOff={() => setChainOff(true)}
              onAdd={addFromSheet}
              onDrop={(type, x, y) => canvasRef.current?.placeAtClient(type, x, y)}
              onDragging={setPartDragging}
            />
          </>
        ),
      };
    } else if (shown?.kind === 'part' && singlePart) {
      spec = {
        sizes: ['peek', 'half'],
        label: tr.properties.title(singlePart.label, tr.devices.names[singlePart.type]),
        content: (
          <PartSheetBody
            key={singlePart.id}
            part={singlePart}
            doc={doc}
            settings={settings}
            expanded={partExpanded}
            onExpand={(expanded) => {
              setPartExpanded(expanded);
              if (expanded) setSheet({ kind: 'part', size: 'half' });
            }}
            focusRequest={focusRequest}
            onUpdatePart={updatePartFromPanel}
            onOpenDevices={openDevices}
          />
        ),
      };
    } else if (shown?.kind === 'panel') {
      const measuring = sim.status !== 'stopped';
      // Küçük sayfada yalnızca içerik (P05, P10); sekmeler yarım boyda ve yan panelde.
      const tabsShown = panelTabs.length > 1 && (landscape || shown.size !== 'peek');
      spec = {
        sizes: ['peek', 'half'],
        role: blocked && shownTab === 'messages' ? 'alertdialog' : 'region',
        label: blocked && shownTab === 'messages' ? tr.phone.blockedTitle : (panelTabs.find((t) => t.id === shownTab)?.label ?? tr.phone.panel),
        content: (
          <TouchUi.Provider value>
            {tabsShown && <SheetTabs tabs={panelTabs} value={shownTab} onChange={setPanelTab} />}
            {shownTab === 'example' && <ExampleTab {...exampleProps} />}
            {shownTab === 'circuit' &&
              (measuring && singlePart ? (
                <MeasureSheetBody
                  key={singlePart.id}
                  part={singlePart}
                  doc={doc}
                  frame={sim.frame}
                  status={sim.status}
                  settings={settings}
                  expanded={partExpanded}
                  onExpand={(expanded) => {
                    setPartExpanded(expanded);
                    setSheet({ kind: 'panel', size: expanded ? 'half' : 'peek' });
                  }}
                  onUpdatePart={updatePartFromPanel}
                  onOpenDevices={openDevices}
                />
              ) : (
                <InspectTab {...inspectProps} />
              ))}
            {shownTab === 'messages' && (
              <MessagesTab
                {...messagesProps}
                header={
                  blocked && sim.notice?.kind === 'error' ? (
                    <BlockedNotice lead={tr.diagnostics.describe(sim.notice.diagnostic, diagnosticContext).title} text="" fixLabel={null} onFix={() => {}} />
                  ) : undefined
                }
              />
            )}
          </TouchUi.Provider>
        ),
      };
    } else if (shown?.kind === 'speed') {
      spec = {
        sizes: ['half'],
        label: tr.sim.speedDialog,
        content: (
          <>
            <SheetHeader title={tr.sim.speedDialog} onClose={() => setSheet(null)} />
            <SheetBody>
              <SpeedOptions speed={sim.speed} scopeSpeed={scopeSpeed} onSpeed={sim.setSpeed} touch />
            </SheetBody>
          </>
        ),
      };
    }
    const devicesOpen = shown?.kind === 'devices' && instruments.length > 0;
    const devicesBody = devicesOpen && (
      <PhoneDevicesBody
        devices={instruments}
        activeId={rackActive ?? instruments[0]!.id}
        onActive={setRackActive}
        onClose={() => setSheet(null)}
        scopeView={(id) => sim.frame?.scopes.get(id) ?? null}
        status={(id) => sim.frame?.statuses.get(id) ?? {}}
        outputVoltage={(id) => sim.frame?.measurements.get(id)?.voltage ?? null}
        running={sim.status !== 'stopped'}
        pinConnected={(id, pin) => !connectivity.unconnectedPins.has(pinKey(id, pin))}
        onChange={changeInstrument}
        onAuto={(id) => {
          const target = doc.parts.find((p) => p.id === id);
          if (target) autoScopeFor(target);
        }}
        onJack={(id, pin) => {
          // Uç tuvalde görünsün: dikeyde sayfa yarıya iner, yatayda devreye dönülür.
          setSheet(landscape ? null : { kind: 'devices', size: 'half' });
          flashPin(id, pin);
        }}
        landscape={landscape}
      />
    );
    if (devicesOpen && !landscape && shown) {
      spec = { sizes: ['half', 'full'], label: tr.phone.devicesTitle, tone: 'rack', content: devicesBody };
    }

    const stripProps = {
      title: circuitTitle,
      saveState,
      mode: phoneMode,
      time: sim.frame?.time ?? 0,
      errors: errorCount,
      warnings: warningCount,
      showIssues,
      moreOpen: modal === 'more',
      onFile: () => setModal('file'),
      onIssues: () => openPanel('messages', 'half'),
      onMore: () => setModal('more'),
    };
    const bar = (
      <PhoneBar
        vertical={landscape}
        state={barState}
        active={landscape && !sheet && sim.status !== 'stopped' ? 'measure' : barActive}
        canUndo={state.past.length > 0}
        onParts={() => setSheet((s) => (s?.kind === 'parts' ? null : { kind: 'parts', size: 'half' }))}
        onConnect={() => {
          dispatch({ type: 'select', selection: EMPTY_SELECTION });
          setSheet(null);
          setConnect({ start: null });
        }}
        onUndo={() => dispatch({ type: 'undo' })}
        onPanel={() => (landscape ? openPanel(activeExample ? 'example' : 'circuit', 'half') : togglePanel(activeExample ? 'example' : panelTab, 'half'))}
        valueText={
          singlePart
            ? (partViewValue(singlePart) ?? tr.devices.names[singlePart.type])
            : selection.parts.length === 0 && selection.wires.length === 1
              ? tr.phone.wire
              : tr.phone.items(selection.parts.length + selection.wires.length)
        }
        canEditValue={singlePart !== null}
        canRotate={selection.parts.length > 0}
        canFlip={canFlip}
        onValue={() => singlePart && openProperties(singlePart.id)}
        onRotate={() => rotateSelection(selection.parts)}
        onFlip={() => flipSelection(selectedParts.filter((p) => CATALOG[p.type].polarized).map((p) => p.id))}
        onDelete={deleteSelection}
        connectMessage={connect?.start ? tr.phone.connectSecond : tr.phone.connectFirst}
        connectDetail={
          connect?.start
            ? connectStartPart && connect.start.pin !== null
              ? tr.phone.connectFrom(connectStartPart.label, tr.devices.pinShort[connectStartPart.type][connect.start.pin] ?? '')
              : tr.phone.connectFromWire
            : tr.phone.connectEnlarged
        }
        onDone={() => setConnect(null)}
        speed={speedLabel(sim.speed)}
        hasDevices={instruments.length > 0}
        onMeasure={() => (landscape ? openPanel('circuit', 'half') : togglePanel('circuit', 'peek'))}
        onDevices={() => (sheet?.kind === 'devices' ? setSheet(null) : openDevices())}
        onSpeed={() => setSheet((s) => (s?.kind === 'speed' ? null : { kind: 'speed', size: 'half' }))}
        onStop={sim.stop}
        onPlay={sim.play}
        onPause={sim.pause}
      />
    );
    const modals = (
      <>
        {(modal === 'file' || modal === 'share') && (
          <FileSheet
            title={circuitTitle}
            saveState={saveState}
            shareOpen={modal === 'share'}
            shareLink={() => shareUrl(doc, window.location.href)}
            onClose={() => setModal(null)}
            onExamples={() => {
              setModal(null);
              setExamplesOpen(true);
            }}
            onNew={() => {
              setModal(null);
              loadDoc(emptyDoc(), tr.file.newDone);
            }}
            onExport={() => {
              setModal(null);
              downloadDoc(doc);
            }}
            onImport={() => {
              setModal(null);
              fileInputRef.current?.click();
            }}
          />
        )}
        {modal === 'more' && (
          <MoreSheet
            settings={settings}
            onSettings={updateSettings}
            onClose={() => setModal(null)}
            onFit={() => {
              setModal(null);
              canvasRef.current?.fit();
            }}
            onShare={() => setModal('share')}
            onTour={startTour}
            onWelcome={() => {
              setModal(null);
              setWelcomeOpen(true);
            }}
          />
        )}
        {stopAsk && (
          <StopToEditDialog
            onStop={() => {
              setStopAsk(false);
              sim.stop();
            }}
            onCancel={() => setStopAsk(false)}
          />
        )}
        {examplesDialog}
      </>
    );
    const canvasShadow = canvasMode === 'olc' ? 'inset 0 3px 0 var(--color-ok)' : undefined;

    if (landscape) {
      // Yatay telefon (L01, L02): solda tuval, sağda 280 px yan panel ve 76 px dikey çubuk. Cihazlar
      // tuvalin ve yan panelin yerini alır; "Devre" ile geri dönülür.
      return (
        <div
          className="app-root flex overflow-hidden bg-panel"
          style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
        >

          {skipLink}
          {fileInput}
          <main className={`relative min-w-0 flex-1 bg-paper ${devicesOpen ? 'hidden' : ''}`} style={{ boxShadow: canvasShadow }}>
            {canvas}
          </main>
          {devicesOpen ? (
            <section role="region" aria-label={tr.phone.devicesTitle} className="flex min-w-0 flex-1 flex-col bg-rack">
              {devicesBody}
            </section>
          ) : (
            <aside className="flex w-[280px] shrink-0 flex-col border-l border-line bg-panel">
              <PhoneSideHeader {...stripProps} />
              {spec && (
                <section
                  role={spec.role ?? 'region'}
                  aria-label={spec.label}
                  className={`flex min-h-0 flex-1 flex-col pt-2 ${partDragging ? 'opacity-25' : ''}`}
                  style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                >
                  {spec.content}
                </section>
              )}
            </aside>
          )}
          {bar}
          {modals}
          {overlays}
          <Toast toast={toast} offset={24} onDone={hideToast} />
        </div>
      );
    }

    const sheetOpen = spec !== null;
    // Tam boy (Cihazlar): üstte kalan devre şeridine dokunmak sayfayı yarıya indirir.
    const fullStrip = sheet?.size === 'full' && sheetOpen;

    return (
      <div className="app-root flex flex-col overflow-hidden bg-panel">

        {skipLink}
        <PhoneTopStrip {...stripProps} />
        {fileInput}
        <div ref={phoneAreaRef} className="relative min-h-0 flex-1 bg-paper">
          <main className="absolute inset-x-0 top-0" style={{ bottom: sheetOpen ? sheetHeight : 0, boxShadow: canvasShadow }}>
            {canvas}
            {fullStrip && (
              <button
                type="button"
                onClick={() => setSheet((s) => (s ? { ...s, size: 'half' } : s))}
                className="absolute inset-0 z-10 flex items-end justify-end p-2"
              >
                <span className="rounded-md bg-panel/90 px-1.5 py-0.5 text-label text-muted">{tr.phone.backToCircuit}</span>
              </button>
            )}
          </main>
          {spec && shown && (
            <BottomSheet
              key={shown.kind}
              size={shown.size}
              sizes={spec.sizes}
              role={spec.role}
              label={spec.label}
              tone={spec.tone}
              {...(spec.halfRatio !== undefined ? { halfRatio: spec.halfRatio } : {})}
              dimmed={partDragging}
              areaHeight={phoneAreaHeight}
              onHeight={setSheetHeight}
              onSize={(size) => setSheet((s) => (s ? { ...s, size } : s))}
              onClose={() => setSheet(null)}
            >
              {spec.content}
            </BottomSheet>
          )}
        </div>
        {bar}
        {modals}
        {overlays}
        <Toast toast={toast} offset={PHONE_BAR_HEIGHT + (sheetOpen ? sheetHeight : 0) + 12} onDone={hideToast} />
      </div>
    );
  }

  return (
    <div className="app-root flex flex-col overflow-hidden">

      {skipLink}
      <TopBar
        toolKind={tool.kind}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        hasSelection={hasSelection}
        canFlip={canFlip}
        zoom={canvasStatus.scale}
        saveState={saveState}
        settings={settings}
        onSettings={updateSettings}
        onSelectTool={() => dispatch({ type: 'set-tool', tool: { kind: 'select' } })}
        onWireTool={() => dispatch({ type: 'set-tool', tool: tool.kind === 'wire' ? { kind: 'select' } : { kind: 'wire' } })}
        onRotate={rotate}
        onFlip={() => flipSelection(selection.parts)}
        onDelete={deleteSelection}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFit={() => canvasRef.current?.fit()}
        fullscreen={fullscreenControls}
        onNew={() => loadDoc(emptyDoc(), tr.file.newDone)}
        onExport={() => downloadDoc(doc)}
        onImport={() => fileInputRef.current?.click()}
        onShare={() => setShareLink(shareUrl(doc, window.location.href))}
        onExamples={() => setExamplesOpen(true)}
        onHelp={() => setHelpOpen(true)}
        onWelcome={() => setWelcomeOpen(true)}
      />
      {fileInput}

      <div className="relative flex min-h-0 flex-1">
        {focus.panels.left && <Library mode={libraryMode} {...libraryProps} />}
        <div ref={columnRef} className="flex min-w-0 flex-1 flex-col">
          <main className="relative min-h-0 flex-1">
            {showFlyout && <LibraryFlyout {...libraryProps} />}
            {canvas}
          </main>
          <HintStrip hint={stripHint} />
          {showRack && (
            <DeviceRack
              devices={instruments}
              layout={rackLayout}
              onLayout={(next) => {
                setRackLayout(next);
                try {
                  window.localStorage.setItem(RACK_KEY, next);
                } catch {
                  // Depolama kapalı: tercih yalnızca bu oturumda geçerli.
                }
              }}
              activeId={rackActive ?? instruments[0]!.id}
              onActive={setRackActive}
              collapsed={rackCollapsed}
              onCollapsed={setRackCollapsed}
              height={rackHeight}
              onResize={(h) => setRackHeights((hs) => (measureLayout ? { ...hs, olc: clampRack(h) } : { ...hs, kur: clampRack(h) }))}
              onResizeEnd={() => {}}
              scopeView={(id) => sim.frame?.scopes.get(id) ?? null}
              status={(id) => sim.frame?.statuses.get(id) ?? {}}
              running={sim.status !== 'stopped'}
              pinConnected={(id, pin) => !connectivity.unconnectedPins.has(pinKey(id, pin))}
              onChange={changeInstrument}
              onAuto={(id) => {
                const target = doc.parts.find((p) => p.id === id);
                if (target) autoScopeFor(target);
              }}
              onJack={flashPin}
            />
          )}

          <SimBar
            status={sim.status}
            time={sim.frame?.time ?? 0}
            speed={sim.speed}
            notice={sim.notice}
            lagging={sim.frame?.lagging ?? false}
            electronFlow={settings.electronFlow}
            diagnosticContext={diagnosticContext}
            scopeSpeed={scopeSpeed}
            onPlay={sim.play}
            onPause={sim.pause}
            onStop={sim.stop}
            onSpeed={sim.setSpeed}
            onElectronFlow={(on) => updateSettings({ electronFlow: on })}
          />
        </div>
        {focus.panels.right && (
          <Inspector
            width={layout.inspectorWidth}
            collapsed={measureCollapse}
            onExpand={(tab) => {
              setMeasureLayout(false);
              setInspectorTab(tab);
            }}
            tab={inspectorTab}
            onTab={setInspectorTab}
            inspect={inspectProps}
            example={exampleProps}
            messages={messagesProps}
            onKeyDown={backToCanvas}
          />
        )}
      </div>

      {shareLink && <ShareDialog link={shareLink} onClose={() => setShareLink(null)} />}
      {examplesDialog}
      {overlays}
      <Toast toast={toast} onDone={hideToast} />
    </div>
  );
}

/** Açılışta paylaşım bağlantısı ya da kayıtlı devre yoksa (gerçekten ilk ziyaret). */
function initialIsFresh(): boolean {
  if (window.location.hash.includes('d=')) return false;
  return loadSavedDoc() === null;
}

/** Alt çubuktaki Değer düğmesinin metni (220 Ω); değeri olmayan parçalarda null. */
function partViewValue(part: CircuitDoc['parts'][number]): string | null {
  return partValueText(part) || null;
}
