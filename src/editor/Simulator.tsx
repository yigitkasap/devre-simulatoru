// Simülatörün kök bileşeni: üst çubuk, parça kütüphanesi, tuval, ipucu şeridi, mesaj paneli,
// simülasyon çubuğu, özellik ve paylaşım pencereleri. Belge durumu burada tutulur; yükleme (örnek, dosya, paylaşım
// bağlantısı) ve döndürme gibi birden çok bileşenin kullandığı işlemler de buradadır.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { exampleDoc, type ExampleId } from '../examples';
import type { PartPatch } from './InspectTab';
import { tr, type DiagnosticContext } from '../i18n/tr';
import { buildConnectivity, pinKey, wireKey } from '../model/connectivity';
import { flipParts, removeItems, rotateParts, updatePart } from '../model/docOps';
import { buildFlowGraph } from '../model/flow';
import { nextRotation } from '../model/geometry';
import { docFromHash, shareUrl } from '../model/share';
import { CATALOG } from '../model/catalog';
import { emptyDoc, type CircuitDoc } from '../model/types';
import { compileNetlist, scopeSettings, type CompiledCircuit, type Diagnostic } from '../sim';
import { numProp, type DeviceType, type PropValue } from '../sim/netlist';
import { loadSavedDoc, useAutosave } from './autosave';
import { Canvas, type CanvasHandle, type CanvasStatus, type Highlight } from './Canvas';
import { ExampleCard } from './ExampleCard';
import { ExamplesDialog } from './ExamplesDialog';
import { Inspector, type InspectorTab } from './Inspector';
import { clearHash, downloadDoc, readDocFile } from './fileActions';
import { HintStrip, type StripHint } from './HintStrip';
import { Library, LibraryFlyout, type LibraryMode } from './Library';
import { MessagesPanel, messageKey, type MessageItem } from './MessagesPanel';
import { PropertiesDialog } from './PropertiesDialog';
import { useRecentParts } from './recentParts';
import { ScopePanel } from './ScopePanel';
import { autoSettings } from './scopeView';
import { useSettings } from './settings';
import { ShareDialog } from './ShareDialog';
import { SimBar } from './SimBar';
import { EMPTY_SELECTION, editorReducer, initialEditorState } from './state';
import { Toast, useToast } from './Toast';
import { TopBar } from './TopBar';
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

/** Osiloskop ekranının bir taraması ≈ 0,2 s sürecek simülasyon hızı (en fazla ×1). */
function sweepSpeed(timePerDiv: number): number {
  return Math.min(1, Math.max(1e-6, 50 * timePerDiv));
}

export default function Simulator() {
  const [initial] = useState(initialDoc);
  const [state, dispatch] = useReducer(editorReducer, initial.doc, initialEditorState);
  const [settings, updateSettings] = useSettings();
  const layout = useLayout();
  const phone = layout.kind === 'phone';
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryPref, setLibraryPref] = useState(loadLibraryPref);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(0);
  const [recentParts, rememberPart] = useRecentParts();
  const [libraryDragType, setLibraryDragType] = useState<DeviceType | null>(null);
  const [hoveredType, setHoveredType] = useState<DeviceType | null>(null);
  const [lastInfoType, setLastInfoType] = useState<DeviceType>('battery');
  const [canvasStatus, setCanvasStatus] = useState<CanvasStatus>({ hint: { kind: 'select' }, scale: 1 });
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('inspect');
  /** Artınca İncele sekmesindeki ilk değer alanına odaklanılır (çift tık). */
  const [focusRequest, setFocusRequest] = useState(0);
  /** Öğrencinin örneklere yazdığı tahminler (yalnızca bu oturumda). */
  const [predictions, setPredictions] = useState<Partial<Record<ExampleId, string>>>({});
  const [propertiesFor, setPropertiesFor] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const [activeExample, setActiveExample] = useState<ExampleId | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [exampleCollapsed, setExampleCollapsed] = useState(false);
  const [chosenScope, setChosenScope] = useState<string | null>(null);
  // Telefonda ve kısa ekranda osiloskop paneli küçültülmüş başlar (devreye yer kalsın).
  const [scopeCollapsed, setScopeCollapsed] = useState(() => window.innerWidth < 900 || window.innerHeight < 640);
  const [toast, showToast] = useToast();
  const touch = useCoarsePointer();
  const touchHintShown = useRef(false);
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

  // --- Kütüphane ---------------------------------------------------------------------------
  const libraryMode: LibraryMode = phone ? 'drawer' : layout.kind === 'compact' || libraryPref === 'rail' ? 'rail' : 'full';
  const showFlyout = layout.kind === 'compact' && flyoutOpen;
  const setLibraryPrefSaved = (pref: 'open' | 'rail') => {
    setLibraryPref(pref);
    saveLibraryPref(pref);
  };
  // Bilgi alanındaki parça: üzerine gelinen, yerleştirilen, sürüklenen ya da seçili tek parça; hiçbiri
  // yoksa en son anlatılan.
  const singleSelected = selectedParts.length === 1 && selection.wires.length === 0 ? selectedParts[0]!.type : null;
  const currentInfo = hoveredType ?? (tool.kind === 'place' ? tool.type : null) ?? libraryDragType ?? singleSelected;
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
    setExampleCollapsed(false);
    setAnswerRevealed(false);
    if (example) setInspectorTab('example');
    setFitRequest((n) => n + 1);
    showToast(message);
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

  // --- Tanılama ve mesaj paneli ----------------------------------------------------------
  // Topoloji kontrolleri devre her değiştiğinde çalışır (simülasyon durdurulmuş olsa da).
  const compiled = useMemo<CompiledCircuit | null>(() => {
    try {
      return compileNetlist(connectivity.netlist);
    } catch {
      return null;
    }
  }, [connectivity]);

  const messages = useMemo<MessageItem[]>(() => {
    const list: Diagnostic[] = [...(compiled?.diagnostics ?? []), ...(sim.frame?.runtime ?? [])];
    if (sim.notice?.kind === 'error') list.push(sim.notice.diagnostic);
    const seen = new Set<string>();
    const items: MessageItem[] = [];
    for (const d of list) {
      const key = messageKey(d);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, diagnostic: d });
    }
    // Önce hatalar, sonra uyarılar (kendi içlerinde sıra korunur).
    return items.sort((a, b) => Number(b.diagnostic.severity === 'error') - Number(a.diagnostic.severity === 'error'));
  }, [compiled, sim.frame?.runtime, sim.notice]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

  /** Bir tanılamanın vurgulayacağı parçalar ve kablolar. */
  const highlightOf = (d: Diagnostic): Highlight => {
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
  const highlight = selectedItem ? highlightOf(selectedItem.diagnostic) : null;

  const selectMessage = (item: MessageItem | null) => {
    setSelectedMessage(item?.key ?? null);
    if (item) {
      const h = highlightOf(item.diagnostic);
      canvasRef.current?.reveal([...h.parts], [...h.wires]);
    }
  };

  // Simülasyon hatası ya da yeni bir çalışma uyarısı (kısa devre, yanan LED) gelince panel açılır;
  // simülasyon başlatılamadıysa hata vurgulanır. Kurulum sırasındaki boşta uç uyarıları paneli açmaz.
  const runtimeKeys = (sim.frame?.runtime ?? []).map(messageKey).join(';');
  const previousRuntime = useRef('');
  useEffect(() => {
    const before = new Set(previousRuntime.current.split(';'));
    previousRuntime.current = runtimeKeys;
    if (runtimeKeys && runtimeKeys.split(';').some((k) => !before.has(k))) {
      setPanelOpen(true);
      // Yeni hata/uyarıda Mesajlar sekmesi öne gelir (odak alınmaz).
      setInspectorTab('messages');
    }
  }, [runtimeKeys]);
  useEffect(() => {
    if (sim.notice?.kind === 'error') {
      setPanelOpen(true);
      setInspectorTab('messages');
      setSelectedMessage(messageKey(sim.notice.diagnostic));
    }
  }, [sim.notice]);

  // Tuvalde bir şey seçilince İncele sekmesi açılır.
  const selectionKey = [...selection.parts, '|', ...selection.wires].join(',');
  useEffect(() => {
    if (selection.parts.length + selection.wires.length > 0) setInspectorTab('inspect');
  }, [selectionKey]);

  /** Çift tık: masaüstünde parçayı seçip İncele'deki ilk değer alanına odaklanır; telefonda pencere açar. */
  const openProperties = (partId: string) => {
    if (phone) {
      setPropertiesFor(partId);
      return;
    }
    dispatch({ type: 'select', selection: { parts: [partId], wires: [] } });
    setInspectorTab('inspect');
    setFocusRequest((n) => n + 1);
  };
  const updatePartFromPanel = (partId: string, patch: PartPatch) => {
    dispatch({ type: 'commit', doc: updatePart(doc, partId, patch) });
  };
  const stripHint: StripHint =
    activeExample && !answerRevealed && (canvasStatus.hint.kind === 'select' || canvasStatus.hint.kind === 'empty')
      ? { kind: 'example' }
      : canvasStatus.hint;

  const editingPart = propertiesFor ? doc.parts.find((p) => p.id === propertiesFor) : undefined;

  // --- Osiloskop paneli ------------------------------------------------------------------
  // Gösterilen osiloskop: seçili osiloskop, yoksa paneldeki seçim, o da yoksa ilki.
  const scopes = doc.parts.filter((p) => p.type === 'oscilloscope');
  const selectedScope = scopes.find((p) => selection.parts.includes(p.id));
  const scope = selectedScope ?? scopes.find((p) => p.id === chosenScope) ?? scopes[0];
  useEffect(() => {
    if (selectedScope) setChosenScope(selectedScope.id);
  }, [selectedScope]);
  const scopeConnected = scope
    ? ([0, 1].map((pin) => !connectivity.unconnectedPins.has(pinKey(scope.id, pin))) as [boolean, boolean])
    : ([false, false] as const);
  const scopeSpeed = scope ? sweepSpeed(scopeSettings(scope.props).timePerDiv) : null;
  const changeScope = (patch: Record<string, PropValue>) => {
    if (scope) dispatch({ type: 'commit', doc: updatePart(doc, scope.id, { props: { ...scope.props, ...patch } }) });
  };
  /** Oto ayar: kayıt varsa sinyalden, yoksa devredeki AC kaynakların frekansından ve kaynak gerilimlerinden. */
  const autoScope = () => {
    if (!scope) return;
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
    const settings = scopeSettings(scope.props);
    const patch = autoSettings(sim.scopeRecorder(scope.id), settings, scopeConnected, { frequency, peak });
    changeScope(patch);
    // Hız: bir ekran taraması ≈ 0,2 s sürsün (yüksek frekansta simülasyon yavaşlatılır, en fazla ×1).
    sim.setSpeed(sweepSpeed(patch.timePerDiv ?? settings.timePerDiv));
  };

  const closeLibrary = useCallback(() => {
    setLibraryOpen(false);
    setFlyoutOpen(false);
  }, []);
  const libraryProps = {
    width: layout.libraryWidth,
    tool,
    settings,
    dispatch,
    onDragTypeChange: setLibraryDragType,
    drawerOpen: libraryOpen,
    onClose: closeLibrary,
    onCollapse: () => setLibraryPrefSaved('rail'),
    onExpand: (search: boolean) => {
      if (layout.kind === 'compact') setFlyoutOpen(true);
      else setLibraryPrefSaved('open');
      if (search) setFocusSearch((n) => n + 1);
    },
    focusSearch,
    touch,
    onPreview: setHoveredType,
    infoType,
    recent: recentParts,
    flyoutOpen: showFlyout,
    onAddPart: (type: DeviceType) => {
      canvasRef.current?.addPartAtCenter(type);
      if (phone && !touchHintShown.current) {
        touchHintShown.current = true;
        showToast(tr.hints.touchAdded);
      }
    },
  };

  const diagnosticContext = useMemo<DiagnosticContext>(() => {
    const byId = new Map(doc.parts.map((p) => [p.id, p]));
    return {
      label: (id) => byId.get(id)?.label ?? id,
      type: (id) => byId.get(id)?.type,
    };
  }, [doc]);

  return (
    <div className="app-root flex flex-col overflow-hidden">
      <TopBar
        phone={phone}
        toolKind={tool.kind}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        hasSelection={hasSelection}
        canFlip={canFlip}
        zoom={canvasStatus.scale}
        saveState={saveState}
        settings={settings}
        onSettings={updateSettings}
        onToggleLibrary={() => setLibraryOpen((o) => !o)}
        onSelectTool={() => dispatch({ type: 'set-tool', tool: { kind: 'select' } })}
        onWireTool={() => dispatch({ type: 'set-tool', tool: tool.kind === 'wire' ? { kind: 'select' } : { kind: 'wire' } })}
        onRotate={rotate}
        onFlip={() => flipSelection(selection.parts)}
        onDelete={() =>
          dispatch({ type: 'commit', doc: removeItems(doc, selection.parts, selection.wires), selection: EMPTY_SELECTION })
        }
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFit={() => canvasRef.current?.fit()}
        onNew={() => loadDoc(emptyDoc(), tr.file.newDone)}
        onExport={() => downloadDoc(doc)}
        onImport={() => fileInputRef.current?.click()}
        onShare={() => setShareLink(shareUrl(doc, window.location.href))}
        onExamples={() => setExamplesOpen(true)}
      />
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

      <div className="relative flex min-h-0 flex-1">
        <Library mode={libraryMode} {...libraryProps} />
        {phone && libraryOpen && (
          <div className="absolute inset-0 z-20 bg-ink/20" onClick={() => setLibraryOpen(false)} aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="relative min-h-0 flex-1">
            {showFlyout && <LibraryFlyout {...libraryProps} />}
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
              keyboardEnabled={!editingPart && !shareLink && !examplesOpen}
              flowGraph={flowGraph}
              simActive={sim.status !== 'stopped'}
              frame={sim.frame}
              highlight={highlight}
              onRepair={sim.repair}
              onRotate={rotateSelection}
              onFlip={flipSelection}
              fitRequest={fitRequest}
              reserveCard={!phone || activeExample === null ? 'none' : exampleCollapsed ? 'collapsed' : 'open'}
              reserveScope={!scope ? 'none' : scopeCollapsed ? 'collapsed' : 'open'}
              touch={touch}
              overlayOpen={libraryOpen || showFlyout || Boolean(editingPart) || Boolean(shareLink) || examplesOpen}
              onStatusChange={setCanvasStatus}
              onPartPlaced={rememberPart}
              onExamples={() => setExamplesOpen(true)}
              readoutBoxes={phone}
            />
            {scope && (
              <ScopePanel
                scopes={scopes}
                scope={scope}
                onChoose={setChosenScope}
                view={sim.frame?.scopes.get(scope.id) ?? null}
                connected={scopeConnected}
                collapsed={scopeCollapsed}
                onCollapsed={(next) => {
                  setScopeCollapsed(next);
                  // Panel büyüyüp küçülünce devre kalan alana yeniden sığdırılır.
                  setFitRequest((n) => n + 1);
                }}
                onChange={changeScope}
                onAuto={autoScope}
              />
            )}
            {phone && activeExample && (
              <ExampleCard
                key={activeExample}
                id={activeExample}
                revealed={answerRevealed}
                collapsed={exampleCollapsed}
                onCollapsed={(next) => {
                  setExampleCollapsed(next);
                  setFitRequest((n) => n + 1);
                }}
                onClose={() => setActiveExample(null)}
              />
            )}
          </main>
          {!phone && <HintStrip hint={stripHint} />}

          {phone && (
            <MessagesPanel
              items={messages}
              open={panelOpen}
              onToggle={() => setPanelOpen((o) => !o)}
              selectedKey={selectedItem ? selectedItem.key : null}
              onSelect={selectMessage}
              context={diagnosticContext}
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
        {!phone && (
          <Inspector
            width={layout.inspectorWidth}
            tab={inspectorTab}
            onTab={setInspectorTab}
            inspect={{
              doc,
              selection,
              frame: sim.frame,
              status: sim.status,
              settings,
              focusRequest,
              onUpdatePart: updatePartFromPanel,
              onRotate: rotateSelection,
              onFlip: flipSelection,
              onDelete: () =>
                dispatch({ type: 'commit', doc: removeItems(doc, selection.parts, selection.wires), selection: EMPTY_SELECTION }),
              onRepair: sim.repair,
              onSelectPart: (partId) => dispatch({ type: 'select', selection: { parts: [partId], wires: [] } }),
            }}
            example={{
              id: activeExample,
              revealed: answerRevealed,
              prediction: activeExample ? (predictions[activeExample] ?? '') : '',
              onPrediction: (text) => {
                if (activeExample) setPredictions((p) => ({ ...p, [activeExample]: text }));
              },
              onPlay: sim.play,
              onOpen: loadExample,
              onClose: () => setActiveExample(null),
              onBrowse: () => setExamplesOpen(true),
            }}
            messages={{
              items: messages,
              selectedKey: selectedItem ? selectedItem.key : null,
              onSelect: selectMessage,
              context: diagnosticContext,
            }}
          />
        )}
      </div>

      {editingPart && (
        <PropertiesDialog
          part={editingPart}
          otherLabels={new Set(doc.parts.filter((p) => p.id !== editingPart.id).map((p) => p.label))}
          onCancel={() => setPropertiesFor(null)}
          onSave={(patch) => {
            dispatch({ type: 'commit', doc: updatePart(doc, editingPart.id, patch) });
            setPropertiesFor(null);
          }}
        />
      )}
      {shareLink && <ShareDialog link={shareLink} onClose={() => setShareLink(null)} />}
      {examplesOpen && (
        <ExamplesDialog
          phone={phone}
          activeExample={activeExample}
          onClose={() => setExamplesOpen(false)}
          onLoad={(id) => {
            setExamplesOpen(false);
            loadExample(id);
          }}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}
