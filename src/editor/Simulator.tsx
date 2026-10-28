// Simülatörün kök bileşeni (tasarım v3, "Defter"). Masaüstünde: üst çubuk, solda şema tuvali (ya da 3B),
// sağda defter. Tablette aynı düzen dokunmatik boyutta; tuvalde Kur / Bağla / Ölç kipleri. Telefonda
// (DP1–DP4): üst çubuk, şema kutusu, altında defter, iki yüzen düğme ve tam ekran kablo bağlama. Belge
// durumu burada tutulur; yükleme (örnek, dosya, paylaşım bağlantısı) ve döndürme gibi birden çok
// bileşenin kullandığı işlemler de buradadır.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { exampleDoc, type ExampleId } from '../examples';
import { tr, type DiagnosticContext } from '../i18n/tr';
import { buildConnectivity, pinKey, wireKey } from '../model/connectivity';
import { addPart, addWire, flipParts, removeItems, rotateParts, updatePart } from '../model/docOps';
import { buildFlowGraph } from '../model/flow';
import { partBounds, pinPositions } from '../model/geometry';
import { docFromHash, shareUrl } from '../model/share';
import { emptyDoc, type CircuitDoc } from '../model/types';
import { compileNetlist, scopeSettings, type CompiledCircuit, type Diagnostic } from '../sim';
import { loadArduinoRuntime } from '../sim/arduino/runtime';
import { numProp, type DeviceType, type PropValue } from '../sim/netlist';
import { formatSI } from '../sim/units';
import { loadSavedDoc, useAutosave } from './autosave';
import { BottomSheet, SheetHeader, type SheetSize } from './BottomSheet';
import { BenchView, ViewToggle, useViewMode } from './BenchView';
import { Canvas, type CanvasHandle, type ConnectStart, type Highlight, type PhoneCanvas } from './Canvas';
import { CanvasControls, WiringControls } from './CanvasControls';
import type { DeviceHooks } from './DeviceCards';
import { ExamplesDialog } from './ExamplesDialog';
import { HelpDialog } from './HelpDialog';
import { markWelcomeSeen, Tour, welcomeSeen, WelcomeDialog, type TourStep } from './Welcome';
import type { PartPatch } from './InspectTab';
import { clearHash, downloadDoc, readDocFile } from './fileActions';
import { useFocusMode } from './fullscreen';
import {
  earthTrapItem,
  findEarthTrap,
  itemFromDiagnostic,
  messageKey,
  seriesResistor,
  suggestedResistor,
  type MessageItem,
} from './messages';
import type { MessageAction } from './MessagesTab';
import { Notebook } from './Notebook';
import { FileSheet, MoreSheet, StatusSheet, StopToEditDialog } from './PhoneModals';
import { PartsSheetBody } from './PhoneSheets';
import { PhoneFabs, PhoneHeader, SchematicButtons, SchematicStrip, statusLine, WiringFooter, WiringHeader } from './PhoneShell';
import { chainPlacement, firstFreePin } from './phoneTools';
import { useRecentParts } from './recentParts';
import { autoSettings } from './scopeView';
import { useSettings } from './settings';
import { ShareDialog } from './ShareDialog';
import { speedLabel } from './SimBar';
import { EMPTY_SELECTION, editorReducer, initialEditorState } from './state';
import { Toast, useToast } from './Toast';
import { DeskTopBar } from './TopBar';
import { useTheme } from './theme';
import { TouchUi } from './touchUi';
import { useLayout } from './useLayout';
import { useSimulation } from './useSimulation';

/** Açılışta: adreste paylaşım bağlantısı varsa o devre, yoksa otomatik kayıt, o da yoksa boş devre. */
function initialDoc(): { doc: CircuitDoc; shared: 'loaded' | 'error' | null } {
  const shared = docFromHash(window.location.hash);
  if (shared !== undefined) clearHash();
  if (shared) return { doc: shared, shared: 'loaded' };
  return { doc: loadSavedDoc() ?? emptyDoc(), shared: shared === null ? 'error' : null };
}

/** Osiloskop ekranının bir taraması ≈ 0,2 s sürecek simülasyon hızı (en fazla ×1). */
function sweepSpeed(timePerDiv: number): number {
  return Math.min(1, Math.max(1e-6, 50 * timePerDiv));
}

export default function Simulator() {
  const [initial] = useState(initialDoc);
  const [state, dispatch] = useReducer(editorReducer, initial.doc, initialEditorState);
  const [settings, updateSettings] = useSettings();
  const theme = useTheme(settings.theme);
  const layout = useLayout();
  const phone = layout.kind === 'phone';
  const tablet = layout.kind === 'tablet';
  /** Dokunmatik düzen (telefon ya da tablet): tuvalde Kur / Bağla / Ölç kipleri. */
  const touchUi = phone || tablet;
  const [recentParts, rememberPart] = useRecentParts();
  // Parça kütüphanesi v3'te kalktı (parçalar defterden eklenir); tuvale HTML sürükle-bırakla parça gelmez.
  const libraryDragType: DeviceType | null = null;
  /** Artınca defterin açık kartındaki ilk değer alanına odaklanılır. */
  const [focusRequest, setFocusRequest] = useState(0);
  /** Cihaz kartında bir jaka dokunulunca o ucun kısa süre yanıp sönmesi. */
  const [flash, setFlash] = useState<Highlight | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  // Tam ekran (masaüstü, tablet): önce devre sığdırılır, böylece defter gizlenince yeni alana yeniden sığar.
  const focus = useFocusMode(() => canvasRef.current?.fit());
  const fullscreenControls = { on: focus.on, panels: focus.panels, onToggle: focus.toggle, onPanel: focus.showPanel };
  const [activeExample, setActiveExample] = useState<ExampleId | null>(null);
  const [chosenScope, setChosenScope] = useState<string | null>(null);
  // Telefon (DP1–DP4): Parça ekle alt sayfası, kablo bağlama, karartmalı sayfalar ve şemanın boyu.
  const [addSheet, setAddSheet] = useState<SheetSize | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [phoneAreaHeight, setPhoneAreaHeight] = useState(0);
  const phoneAreaRef = useRef<HTMLDivElement>(null);
  /** Telefon: şema tam ekran (defter gizli). */
  const [schematicFull, setSchematicFull] = useState(false);
  /** Telefon: defterde bir kart açılınca şema 64 px'lik şeride küçülür (DP3). */
  const [schematicStrip, setSchematicStrip] = useState(false);
  /** Defterdeki "3B'de yaklaş": 3B görünüm uygulayınca boşalır. */
  const [benchFocus, setBenchFocus] = useState<string | null>(null);
  const clearBenchFocus = useCallback(() => setBenchFocus(null), []);
  const [connect, setConnect] = useState<{ start: ConnectStart | null } | null>(null);
  const [modal, setModal] = useState<'file' | 'share' | 'more' | 'status' | null>(null);
  const [stopAsk, setStopAsk] = useState(false);
  const [chainOff, setChainOff] = useState(false);
  const [partDragging, setPartDragging] = useState(false);
  const [toast, showToast, hideToast] = useToast();
  // İlk açılış (M01): hoş geldin yalnızca ilk ziyarette (kayıtlı devre ya da paylaşım bağlantısı yoksa).
  const [welcomeOpen, setWelcomeOpen] = useState(() => !welcomeSeen() && initialIsFresh());
  const [helpOpen, setHelpOpen] = useState(false);
  const [tour, setTour] = useState<{ step: TourStep; parts: number; wires: number } | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const [viewMode, setViewMode] = useViewMode();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { doc, selection, tool } = state;
  // Arduino'nun işlemcisi (avr8js) ve programları ayrı bir parçadır: devrede Arduino varsa önceden yüklenir.
  const hasArduino = doc.parts.some((p) => p.type === 'arduino');
  useEffect(() => {
    if (hasArduino) void loadArduinoRuntime();
  }, [hasArduino]);
  const saveState = useAutosave(doc);
  const connectivity = useMemo(() => buildConnectivity(doc), [doc]);
  const flowGraph = useMemo(() => buildFlowGraph(doc), [doc]);
  // Canlı ölçümleri gösterilen parçalar (seçim ve ölçü aletleri): motor bunların istatistiğini tutar
  // (salınan değerlerin kararlı gösterimi). İzleme pahalıdır (bütün parçalar izlenince büyük devrede
  // kare hızı dörtte birine iner), bu yüzden defterin kapalı kartları için: zamanla değişen kaynağı
  // olan devrede kaynaklar ve LED'ler de izlenir, öbür kartlar ölçüm yerine değerini gösterir; DC
  // devrede değerler salınmaz, kapalı kartlar anlık değeri izlemeden gösterir.
  const timeVarying = doc.parts.some((p) => TIME_VARYING.has(p.type));
  const watchedKey = [
    ...selection.parts.slice(0, 8),
    ...doc.parts.filter((p) => p.type === 'voltmeter' || p.type === 'ammeter').map((p) => p.id),
    ...(timeVarying && !phone ? doc.parts.filter((p) => CARD_WATCHED.has(p.type)).slice(0, 8).map((p) => p.id) : []),
  ].join(',');
  const watched = useMemo(() => (watchedKey ? [...new Set(watchedKey.split(','))] : []), [watchedKey]);
  /** Defterde kapalı kartı ölçüm gösterebilen parçalar (DC devrede hepsi). */
  const measuredParts = useMemo<ReadonlySet<string> | null>(() => (timeVarying ? new Set(watched) : null), [timeVarying, watched]);
  const sim = useSimulation(doc, connectivity, flowGraph, settings.electronFlow, settings.sound, watched);
  const hasSelection = selection.parts.length > 0 || selection.wires.length > 0;
  const selectedParts = doc.parts.filter((p) => selection.parts.includes(p.id));
  const singlePart = selectedParts.length === 1 && selection.wires.length === 0 ? selectedParts[0]! : null;

  // --- Yükleme (örnek, dosya, paylaşım bağlantısı, yeni devre) ---------------------------
  /** Yeni bir belge yükler; önceki belge geri alma geçmişinde kalır. */
  const loadDoc = (next: CircuitDoc, message: string, example: ExampleId | null = null) => {
    dispatch({ type: 'commit', doc: next, selection: EMPTY_SELECTION });
    dispatch({ type: 'set-tool', tool: { kind: 'select' } });
    setActiveExample(example);
    setConnect(null);
    // Telefonda örneğin kartı defterin üstünde: şema kutusu ve defter görünür.
    setAddSheet(null);
    setSchematicFull(false);
    setSchematicStrip(false);
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

  // --- Döndürme ve ters çevirme ------------------------------------------------------------
  // Döndür (R): 90°, bağlı kablolar pinleri izler. Ters çevir (F): yönlü parçanın uçları yer
  // değiştirir, kablolar yerinde kalır.
  const rotateSelection = (ids: readonly string[]) => {
    if (ids.length > 0) dispatch({ type: 'commit', doc: rotateParts(doc, new Set(ids)) });
  };
  const flipSelection = (ids: readonly string[]) => {
    if (ids.length > 0) dispatch({ type: 'commit', doc: flipParts(doc, new Set(ids)) });
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
  const earthTrap = useMemo(() => (compiled ? findEarthTrap(compiled) : null), [compiled]);

  const messages = useMemo<MessageItem[]>(() => {
    const list: Diagnostic[] = [...(compiled?.diagnostics ?? []), ...(sim.frame?.runtime ?? [])];
    if (sim.notice?.kind === 'error') list.push(sim.notice.diagnostic);
    const seen = new Set<string>();
    const items: MessageItem[] = [];
    for (const d of list) {
      const key = messageKey(d);
      if (seen.has(key)) continue;
      // Toprak tuzağı mesajı aynı durumu (toprak hattından dönen akım) daha açık anlatır ve çözümü söyler.
      if (d.code === 'ground-return' && earthTrap) continue;
      seen.add(key);
      items.push(itemFromDiagnostic(d, diagnosticContext));
    }
    if (earthTrap) items.push(earthTrapItem(earthTrap, doc));
    // Önce hatalar, sonra uyarılar, en son bilgiler (kendi içlerinde sıra korunur).
    const rank = { error: 0, warning: 1, info: 2 } as const;
    return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [compiled, sim.frame?.runtime, sim.notice, diagnosticContext, earthTrap, doc]);

  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

  /** Defterdeki "1 uç boşta" rozetleri: devre denetiminin boşta uç uyarıları (cihazların isteğe bağlı uçları sayılmaz). */
  const floatingParts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of compiled?.diagnostics ?? []) if (d.code === 'floating-pin' && d.elementIds[0]) counts.set(d.elementIds[0], (counts.get(d.elementIds[0]) ?? 0) + 1);
    return counts;
  }, [compiled]);

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
    const earth = d.code === 'ground-return' || d.code === 'earth-trap';
    return { parts: new Set(d.elementIds), wires, severity: d.severity, ...(earth ? { earth } : {}) };
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
    if (d?.code === 'lamp-burned' || d?.code === 'fuse-blown') return [{ label: tr.messages.repair, primary: true, run: () => sim.repair(d.elementIds[0]!) }];
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
  /** LED balonundaki "Neden?": defterin en üstündeki sorun kartı seçili (telefonda açık) görünür. */
  const explain = (partId: string) => {
    const item = messages.find((m) => m.code === 'led-burned' && m.elementIds.includes(partId));
    if (item) setSelectedMessage(item.key);
    setSchematicFull(false);
    document.getElementById('defter')?.scrollTo?.({ top: 0 });
  };

  // --- Sıfır noktaları: toprak yokken (ya da toprağa bağlı olmayan parçada) "0 V" işareti -------
  // Yalnızca enerji kaynağı içeren adalarda gösterilir (tek başına duran parçalarda işaret kalabalık yapar).
  const zeroPoints = useMemo(() => {
    if (!compiled) return [];
    const points: Array<{ at: { x: number; y: number }; grounded: boolean }> = [];
    for (const ref of compiled.autoReferences) {
      // Boşta duran tek parça (ör. güç kaynağının kullanılmayan ikinci çıkışı) işaret almaz.
      if (!ref.hasSource || ref.elementIds.length < 2) continue;
      const part = doc.parts.find((p) => p.id === ref.elementId);
      const at = part ? pinPositions(part)[ref.pin] : undefined;
      if (at) points.push({ at, grounded: compiled.hasGround });
    }
    return points;
  }, [compiled, doc]);

  // --- Sorun sayıları (telefonda şema şeridinde) ---------------------------------------------
  const errorCount = messages.filter((m) => m.severity === 'error').length;
  const warningCount = messages.filter((m) => m.severity === 'warning').length;

  // Telefonda yeni bir çalışma uyarısı (kısa devre, yanan LED) seçili gelir: sorun kartı açık, düzeltme
  // düğmeleri (Onar, "R1'i … yap") hemen görünür (P10). Simülasyon başlatılamadıysa hata seçilir. Bilgiler
  // ve toprak tuzağının yanında gizlenen toprak hattı mesajı seçilmez.
  const runtimeKeys = (sim.frame?.runtime ?? [])
    .filter((d) => d.severity !== 'info' && !(d.code === 'ground-return' && earthTrap))
    .map(messageKey)
    .join(';');
  const previousRuntime = useRef('');
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
  useEffect(() => {
    const before = new Set(previousRuntime.current.split(';'));
    previousRuntime.current = runtimeKeys;
    const fresh = runtimeKeys ? runtimeKeys.split(';').filter((k) => !before.has(k)) : [];
    if (fresh.length > 0 && phoneRef.current) setSelectedMessage(fresh[0]!);
  }, [runtimeKeys]);
  useEffect(() => {
    if (sim.notice?.kind === 'error') setSelectedMessage(messageKey(sim.notice.diagnostic));
  }, [sim.notice]);

  // Telefon: kart kapanınca (seçim bırakılınca) şema kutusu geri gelir.
  useEffect(() => {
    if (!hasSelection) setSchematicStrip(false);
  }, [hasSelection]);

  /** Çift tık: parçayı seçip açık kartın ilk değer alanına odaklanır; telefonda kartın yeri açılır. */
  const openProperties = (partId: string) => {
    dispatch({ type: 'select', selection: { parts: [partId], wires: [] } });
    if (phone) {
      setSchematicFull(false);
      setSchematicStrip(true);
    } else {
      setFocusRequest((n) => n + 1);
    }
  };
  const updatePartFromPanel = (partId: string, patch: PartPatch) => {
    dispatch({ type: 'commit', doc: updatePart(doc, partId, patch) });
  };
  /** Kaydırıcı: sürüklerken önizleme (geçmişe yazılmaz), bırakınca sürüklemeden önceki belge geçmişe. */
  const slideBefore = useRef<CircuitDoc | null>(null);
  const slidePartFromPanel = (partId: string, patch: PartPatch, done: boolean) => {
    if (!slideBefore.current) slideBefore.current = doc;
    dispatch({ type: 'preview', doc: updatePart(doc, partId, patch) });
    if (done) {
      dispatch({ type: 'end-preview', before: slideBefore.current });
      slideBefore.current = null;
    }
  };

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

  // --- Kur ve Ölç geçişi ---------------------------------------------------------------------
  const previousRunStatus = useRef(sim.status);
  useEffect(() => {
    const before = previousRunStatus.current;
    previousRunStatus.current = sim.status;
    // Oynat'ta kablo bağlama ve parça ekleme kapanır (çalışırken devrenin yapısı kilitli).
    if (sim.status !== 'stopped' && before === 'stopped') {
      setConnect(null);
      setAddSheet(null);
    }
  }, [sim.status]);
  /** Cihaz kartındaki jak: o ucun ve kablolarının kısa süre yanıp sönmesi. */
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

  // --- Telefon ve tablet -----------------------------------------------------------------------
  // Tuvalin kipi: Bağla (kablo bağlarken), Ölç (çalışıyor ya da duraklatılmış; yapı kilitli) ya da Kur.
  const canvasMode: PhoneCanvas['mode'] = connect ? 'bagla' : sim.status !== 'stopped' ? 'olc' : 'kur';
  // Telefonda şema kutusunun boyu üst çubuğun altında kalan alandan hesaplanır.
  useEffect(() => {
    const el = phoneAreaRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => setPhoneAreaHeight(entries[0]?.contentRect.height ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [phone]);
  useEffect(() => {
    if (!addSheet) setSheetHeight(0);
  }, [addSheet]);
  // Telefondan tablete ya da masaüstüne geçince telefonun durumları kapanır (tablette Bağla sürer).
  useEffect(() => {
    if (phone) return;
    setModal(null);
    setAddSheet(null);
    setSchematicFull(false);
    setSchematicStrip(false);
    if (!tablet) {
      setConnect(null);
      setStopAsk(false);
    }
  }, [phone, tablet]);
  // Parça ekle sayfası her açılışta "Zincirle ekle" açık başlar.
  const addOpen = addSheet !== null;
  useEffect(() => {
    if (addOpen) setChainOff(false);
  }, [addOpen]);

  const circuitTitle = activeExample
    ? tr.examples.texts[activeExample].title
    : doc.parts.length === 0 && doc.wires.length === 0
      ? tr.phone.emptyName
      : tr.phone.defaultName;
  /** Zincirle ekle (telefon): Parça ekle sayfası açıkken seçili parçanın boştaki ilk ucu. */
  const chainPart = addOpen && !chainOff ? singlePart : null;
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
  /**
   * Defter (v3, masaüstü ve tablet): listenin sonundaki ekleme satırı. Açık kartın boştaki ilk ucu varsa parça
   * o uca bağlı eklenir (zincirle ekle); yoksa şemanın görünen alanında boş bir yere, 3B görünümde
   * (şema tuvali yokken) devrenin sağına.
   */
  const deskChainPin = singlePart ? firstFreePin(singlePart.id, connectivity.unconnectedPins, doc) : null;
  const deskChainTo = singlePart && deskChainPin !== null ? tr.phone.pinOf(singlePart.label, tr.devices.pins[singlePart.type][deskChainPin] ?? '') : null;
  const addFromNotebook = (type: DeviceType) => {
    if (singlePart && deskChainPin !== null) {
      const place = chainPlacement(doc, type, { partId: singlePart.id, pin: deskChainPin });
      if (place) {
        const added = addPart(doc, type, place.at, place.rotation);
        const wired = addWire(added.doc, place.wire);
        dispatch({ type: 'commit', doc: wired.doc, selection: { parts: [added.id], wires: [] } });
        rememberPart(type);
        return;
      }
    }
    if (canvasRef.current) {
      canvasRef.current.addPartAtCenter(type);
      return;
    }
    const boxes = doc.parts.map((p) => partBounds(p));
    const at = boxes.length > 0 ? { x: Math.round(Math.max(...boxes.map((b) => b.x + b.w)) + 6), y: Math.round(Math.min(...boxes.map((b) => b.y))) } : { x: 0, y: 0 };
    const added = addPart(doc, type, at, 0);
    dispatch({ type: 'commit', doc: added.doc, selection: { parts: [added.id], wires: [] } });
    rememberPart(type);
  };
  const connectStartPart = connect?.start?.partId ? doc.parts.find((p) => p.id === connect.start!.partId) : undefined;
  const exampleProps = {
    id: activeExample,
    onOpen: loadExample,
    onClose: () => setActiveExample(null),
  };
  const inspectProps = {
    doc,
    selection,
    frame: sim.frame,
    status: sim.status,
    settings,
    focusRequest,
    onUpdatePart: updatePartFromPanel,
    onSlidePart: slidePartFromPanel,
    onRotate: rotateSelection,
    onFlip: flipSelection,
    onDelete: deleteSelection,
    onRepair: sim.repair,
    onSelectPart: (partId: string) => {
      dispatch({ type: 'select', selection: { parts: [partId], wires: [] } });
      // Telefonda defterden açılan kartın yeri açılır: şema şeride küçülür (DP3).
      if (phone) setSchematicStrip(true);
    },
  };
  const deviceHooks: DeviceHooks = {
    scopeView: (id) => sim.frame?.scopes.get(id) ?? null,
    status: (id) => sim.frame?.statuses.get(id) ?? {},
    outputVoltage: (id) => sim.frame?.measurements.get(id)?.voltage ?? null,
    running: sim.status !== 'stopped',
    pinConnected: (id, pin) => !connectivity.unconnectedPins.has(pinKey(id, pin)),
    onChange: changeInstrument,
    onAuto: (id) => {
      const target = doc.parts.find((p) => p.id === id);
      if (target) autoScopeFor(target);
    },
    onJack: (id, pin) => {
      // Telefonda uç görünsün diye şema kutusu açılır.
      if (phone) {
        setSchematicFull(false);
        setSchematicStrip(false);
      }
      flashPin(id, pin);
    },
  };
  const notebook = (
    <Notebook
      {...inspectProps}
      floating={floatingParts}
      measured={measuredParts}
      onClearSelection={() => dispatch({ type: 'select', selection: EMPTY_SELECTION })}
      messages={messages}
      selectedMessage={selectedMessage}
      onSelectMessage={selectMessage}
      messageActions={messageActions}
      diagnosticContext={diagnosticContext}
      issues={issues}
      example={exampleProps}
      devices={deviceHooks}
      {...(viewMode === 'bench'
        ? {
            onFocus3d: (partId: string) => {
              setBenchFocus(partId);
              // Telefonda 3B kutusu görünsün (karta odaklanınca şeride küçülmüştü).
              setSchematicFull(false);
              setSchematicStrip(false);
            },
          }
        : {})}
      {...(phone
        ? {
            phone: true,
            // "D4'ü göster": parça seçilir, şema kutusu açık kalır (vurgu görünsün).
            onShowPart: (partId: string) => {
              dispatch({ type: 'select', selection: { parts: [partId], wires: [] } });
              setSchematicFull(false);
              setSchematicStrip(false);
            },
          }
        : { add: { chainTo: deskChainTo, onAdd: addFromNotebook, onOpenExample: loadExample } })}
    />
  );
  /** Kablo bağlamayı başlatır (telefonda tam ekran görünüm; 3B'den şemaya geçilir). */
  const startConnect = () => {
    if (viewMode !== 'schematic') setViewMode('schematic');
    dispatch({ type: 'select', selection: EMPTY_SELECTION });
    setAddSheet(null);
    setConnect({ start: null });
  };

  const overlayOpen = Boolean(shareLink) || examplesOpen || modal !== null || stopAsk;
  const schematic = (
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
                setAddSheet(null);
                setConnect({ start });
              },
              onExitConnect: () => setConnect(null),
              // Ölç kipinde dokunulan parça seçilir; kartı defterde açılır (ayrı bir şey gerekmez).
              onInspect: () => {},
              onEditAttempt: () => setStopAsk(true),
              lockChip: false,
              onLockChipClose: () => {},
              ...(phone && connect ? { connectHeader: true } : {}),
              ...(phone && addSheet === 'full' ? { strip: true } : {}),
              ...(tablet ? { emptyHint: tr.canvas.empty } : {}),
            }
          : null
      }
      overlayOpen={overlayOpen}
      desk={!phone && !tablet}
      onPartPlaced={rememberPart}
      onExamples={() => setExamplesOpen(true)}
      issues={issues}
      issuePins={issuePins}
      nodeLabels={nodeLabels}
      zeroPoints={zeroPoints}
      onExplain={explain}
    />
  );
  // Şema | 3B: devre şemada kurulur; 3B tezgâhta aynı devre masada (izlenir, anahtar ve
  // potansiyometreyle oynanır).
  const canvas = (
    <>
      {viewMode === 'bench' ? (
        <BenchView
          doc={doc}
          connectivity={connectivity}
          frame={sim.frame}
          active={sim.status !== 'stopped'}
          running={sim.status === 'running'}
          selection={selection.parts}
          overlayOpen={overlayOpen}
          touch={touchUi}
          phone={phone}
          dark={theme === 'dark'}
          settings={settings}
          onSettings={updateSettings}
          measured={measuredParts}
          onSchematic={() => setViewMode('schematic')}
          focusRequest={benchFocus}
          onFocusDone={clearBenchFocus}
          {...(phone ? { controlsInset: { right: 60, bottom: schematicFull ? 'calc(100px + env(safe-area-inset-bottom))' : 10 } } : {})}
          callbacks={{
            onSelect: (id) => dispatch({ type: 'select', selection: id ? { parts: [id], wires: [] } : EMPTY_SELECTION }),
            onToggle: (id) => {
              const part = doc.parts.find((p) => p.id === id);
              if (part) updatePartFromPanel(id, { props: { ...part.props, closed: !part.props.closed } });
            },
            onKnob: (id, position, done) => {
              const part = doc.parts.find((p) => p.id === id);
              if (part) slidePartFromPanel(id, { props: { ...part.props, position } }, done);
            },
          }}
        />
      ) : (
        schematic
      )}
      {/* Telefonda Şema | 3B şema kutusunun sol üstünde; masaüstünde ve tablette 3B ve Şema sağ alttaki kutularda. */}
      {phone && !connect && <ViewToggle mode={viewMode} onChange={setViewMode} touch={touchUi} />}
    </>
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
    if (e.altKey) {
      const n = /^Digit([1-3])$/.exec(e.code)?.[1];
      if (n && !phone) {
        e.preventDefault();
        if (focus.on) focus.showPanel('right', true);
        // Defter (v3): sekme yok; Alt+1 parça kartları, Alt+2 örnek kartı, Alt+3 sorun kartları.
        const part = n === '1' ? 'card' : n === '2' ? 'example' : 'problem';
        window.setTimeout(() => {
          const target = document.querySelector<HTMLElement>(`#defter [data-notebook="${part}"] button`) ?? document.querySelector<HTMLElement>('#defter [data-notebook="card"] button');
          target?.focus();
        }, 0);
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
      className="sr-only z-[100] rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:min-h-11"
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

  if (phone) {
    const wiring = connect !== null;
    const big = wiring || schematicFull;
    const strip = schematicStrip && !big;
    // Şema kutusu: dikeyde yaklaşık 270 px; kısa ekranda (yatay telefon) kalan alanın % 42'si.
    const boxHeight = Math.round(Math.max(132, Math.min(270, phoneAreaHeight * 0.42)));
    // Parça ekle sayfası şema kutusunun üstüne binmez (WebKit, touch-action: none bölgesini üstüne binen
    // katmana da uygulayabiliyor): sayfa büyüdükçe kutu kısalır; tam boyda devre şeridi kalır.
    const mainHeight = addSheet && sheetHeight > 0 ? Math.max(0, Math.min(boxHeight, Math.round(phoneAreaHeight - sheetHeight))) : boxHeight;
    const line = statusLine(sim.status, sim.frame?.time ?? 0, saveState);
    const wiringText = connect?.start
      ? connectStartPart && connect.start.pin !== null
        ? tr.phone.wiringStart(tr.phone.pinOf(connectStartPart.label, tr.devices.pins[connectStartPart.type][connect.start.pin] ?? ''))
        : tr.phone.wiringWire
      : tr.phone.wiringIdle;
    const modals = (
      <>
        {modal === 'status' && (
          <StatusSheet
            status={sim.status}
            line={line}
            speed={sim.speed}
            scopeSpeed={scopeSpeed}
            onSpeed={sim.setSpeed}
            onStop={() => {
              setModal(null);
              sim.stop();
            }}
            onClose={() => setModal(null)}
          />
        )}
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
            onExamples={() => {
              setModal(null);
              setExamplesOpen(true);
            }}
            onFile={() => setModal('file')}
            onFit={() => {
              setModal(null);
              setSchematicStrip(false);
              canvasRef.current?.fit();
            }}
            onShare={() => setModal('share')}
            onTour={startTour}
            onWelcome={() => {
              setModal(null);
              setWelcomeOpen(true);
            }}
            onTheme={(choice) => updateSettings({ theme: choice })}
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

    // Dikey ve yatay telefon (DP1–DP4): üst çubuk; şema kutusu (karta odaklanınca şerit, tam ekranda ya
    // da kablo bağlarken bütün alan); altında defter; yüzen düğmeler. Tuval kipler arasında aynı yerde
    // kalır (yeniden kurulmaz).
    return (
      <div className="app-root flex flex-col overflow-hidden bg-panel-2" style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
        {skipLink}
        {fileInput}
        {wiring ? (
          <WiringHeader step={connect.start ? 2 : 1} text={wiringText} onDone={() => setConnect(null)} />
        ) : (
          <PhoneHeader
            title={circuitTitle}
            status={sim.status}
            time={sim.frame?.time ?? 0}
            saveState={saveState}
            canUndo={state.past.length > 0}
            statusOpen={modal === 'status'}
            moreOpen={modal === 'more'}
            onStatus={() => setModal('status')}
            onUndo={() => dispatch({ type: 'undo' })}
            onMore={() => setModal('more')}
          />
        )}
        <div ref={phoneAreaRef} className="relative flex min-h-0 flex-1 flex-col">
          {strip ? (
            <SchematicStrip doc={doc} errors={errorCount} warnings={warningCount} onOpen={() => setSchematicStrip(false)} />
          ) : (
            <main className={`relative shrink-0 bg-paper ${big ? 'min-h-0 flex-1' : 'border-b border-line'}`} style={big ? undefined : { height: mainHeight }}>
              {canvas}
              {!wiring && (
                <SchematicButtons
                  connect={sim.status === 'stopped' && doc.parts.length > 0 && viewMode === 'schematic'}
                  full={schematicFull}
                  raised={schematicFull}
                  onConnect={startConnect}
                  onFull={() => setSchematicFull((f) => !f)}
                />
              )}
            </main>
          )}
          {!big && (
            <section data-tour="inspect" aria-label={tr.notebook.label} className="flex min-h-0 flex-1 flex-col">
              <TouchUi.Provider value>{notebook}</TouchUi.Provider>
            </section>
          )}
          {wiring && (
            <WiringFooter canUndo={state.past.length > 0} hasStart={connect.start !== null} onUndo={() => dispatch({ type: 'undo' })} onClear={() => setConnect({ start: null })} />
          )}
          {!wiring && !addSheet && (
            <PhoneFabs status={sim.status} canAdd={sim.status === 'stopped'} addOpen={addOpen} onAdd={() => setAddSheet('half')} onPlay={sim.play} onPause={sim.pause} />
          )}
          {addSheet && !wiring && (
            <BottomSheet
              size={addSheet}
              sizes={['half', 'full']}
              halfRatio={0.6}
              role="dialog"
              label={tr.phone.addTitle}
              dimmed={partDragging}
              areaHeight={phoneAreaHeight}
              onHeight={setSheetHeight}
              onSize={setAddSheet}
              onClose={() => setAddSheet(null)}
            >
              <SheetHeader title={tr.phone.addTitle} onClose={() => setAddSheet(null)} />
              <PartsSheetBody
                settings={settings}
                recent={recentParts}
                chainTo={chainTo}
                onChainOff={() => setChainOff(true)}
                onAdd={addFromSheet}
                onDrop={(type, x, y) => canvasRef.current?.placeAtClient(type, x, y)}
                onDragging={setPartDragging}
              />
            </BottomSheet>
          )}
        </div>
        {modals}
        {overlays}
        <Toast toast={toast} offset={addSheet ? sheetHeight + 12 : wiring ? 92 : 96} onDone={hideToast} />
      </div>
    );
  }

  // Masaüstü ve tablet (v3: D1–D3): üst çubuk; solda tuval (ya da 3B), sağda defter. Tablette aynı düzen
  // dokunmatik boyutta; tuvalde Kur / Bağla / Ölç kipleri, sağ altta Kablo bağla.
  return (
    <TouchUi.Provider value={tablet}>
      <div className="app-root flex flex-col overflow-hidden">
        {skipLink}
        <DeskTopBar
          title={circuitTitle}
          status={sim.status}
          time={sim.frame?.time ?? 0}
          speed={sim.speed}
          lagging={sim.frame?.lagging ?? false}
          scopeSpeed={scopeSpeed}
          canUndo={state.past.length > 0}
          canRedo={state.future.length > 0}
          saveState={saveState}
          settings={settings}
          onSettings={updateSettings}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          onPlay={sim.play}
          onPause={sim.pause}
          onStop={sim.stop}
          onSpeed={sim.setSpeed}
          fullscreen={fullscreenControls}
          onNew={() => loadDoc(emptyDoc(), tr.file.newDone)}
          onExport={() => downloadDoc(doc)}
          onImport={() => fileInputRef.current?.click()}
          onShare={() => setShareLink(shareUrl(doc, window.location.href))}
          onExamples={() => setExamplesOpen(true)}
          onHelp={() => setHelpOpen(true)}
          onWelcome={() => setWelcomeOpen(true)}
          touch={tablet}
          theme={settings.theme}
          appliedTheme={theme}
          onTheme={(choice) => updateSettings({ theme: choice })}
        />
        {fileInput}

        <div className="relative flex min-h-0 flex-1">
          <main className="relative min-h-0 min-w-0 flex-1">
            {canvas}
            {viewMode === 'schematic' &&
              (connect ? (
                <WiringControls
                  canUndo={state.past.length > 0}
                  hasStart={connect.start !== null}
                  onUndo={() => dispatch({ type: 'undo' })}
                  onClear={() => setConnect({ start: null })}
                  onDone={() => setConnect(null)}
                />
              ) : (
                <CanvasControls
                  onZoomOut={() => canvasRef.current?.zoomOut()}
                  onZoomIn={() => canvasRef.current?.zoomIn()}
                  onFit={() => canvasRef.current?.fit()}
                  on3d={() => setViewMode('bench')}
                  touch={tablet}
                  {...(tablet && sim.status === 'stopped' && doc.parts.length > 0 ? { onConnect: startConnect } : {})}
                />
              ))}
          </main>
          {focus.panels.right && (
            // Defter (v3): İncele, Örnek ve Mesajlar sekmeleri yerine tek liste.
            <aside
              data-tour="inspect"
              aria-label={tr.notebook.label}
              onKeyDown={backToCanvas}
              className="flex min-h-0 shrink-0 flex-col border-l border-line"
              style={{ width: layout.inspectorWidth }}
            >
              {notebook}
            </aside>
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
        <Toast toast={toast} onDone={hideToast} />
      </div>
    </TouchUi.Provider>
  );
}

/** Değerleri zamanla salınan kaynaklar (AC, kare dalga, PWM): defterin kapalı kartları için izleme gerekir. */
const TIME_VARYING: ReadonlySet<string> = new Set(['acsource', 'funcgen', 'timer555', 'arduino', 'buzzer']);
/** Zamanla değişen devrede kapalı kartı ölçüm gösteren (izlenen) parçalar. */
const CARD_WATCHED: ReadonlySet<string> = new Set(['battery', 'dcsupply', 'acsource', 'funcgen', 'led']);

/** Açılışta paylaşım bağlantısı ya da kayıtlı devre yoksa (gerçekten ilk ziyaret). */
function initialIsFresh(): boolean {
  if (window.location.hash.includes('d=')) return false;
  return loadSavedDoc() === null;
}
