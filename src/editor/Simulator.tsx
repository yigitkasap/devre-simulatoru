// Simülatörün kök bileşeni: üst çubuk, parça kütüphanesi, tuval, mesaj paneli, simülasyon çubuğu,
// özellik ve paylaşım pencereleri. Belge durumu burada tutulur; yükleme (örnek, dosya, paylaşım
// bağlantısı) ve döndürme gibi birden çok bileşenin kullandığı işlemler de buradadır.

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { exampleDoc, type ExampleId } from '../examples';
import { tr, type DiagnosticContext } from '../i18n/tr';
import { buildConnectivity, wireKey } from '../model/connectivity';
import { flipParts, removeItems, rotateParts, updatePart } from '../model/docOps';
import { buildFlowGraph } from '../model/flow';
import { nextRotation } from '../model/geometry';
import { docFromHash, shareUrl } from '../model/share';
import { emptyDoc, type CircuitDoc } from '../model/types';
import { compileNetlist, type CompiledCircuit, type Diagnostic } from '../sim';
import type { DeviceType } from '../sim/netlist';
import { loadSavedDoc, useAutosave } from './autosave';
import { Canvas, type CanvasHandle, type Highlight } from './Canvas';
import { ExampleCard } from './ExampleCard';
import { clearHash, downloadDoc, readDocFile } from './fileActions';
import { Library } from './Library';
import { MessagesPanel, messageKey, type MessageItem } from './MessagesPanel';
import { PartInfo } from './PartInfo';
import { PropertiesDialog } from './PropertiesDialog';
import { useSettings } from './settings';
import { ShareDialog } from './ShareDialog';
import { SimBar } from './SimBar';
import { EMPTY_SELECTION, editorReducer, initialEditorState } from './state';
import { Toast, useToast } from './Toast';
import { TopBar } from './TopBar';
import { useCoarsePointer } from './useCoarsePointer';
import { useSimulation } from './useSimulation';

/** Açılışta: adreste paylaşım bağlantısı varsa o devre, yoksa otomatik kayıt, o da yoksa boş devre. */
function initialDoc(): { doc: CircuitDoc; shared: 'loaded' | 'error' | null } {
  const shared = docFromHash(window.location.hash);
  if (shared !== undefined) clearHash();
  if (shared) return { doc: shared, shared: 'loaded' };
  return { doc: loadSavedDoc() ?? emptyDoc(), shared: shared === null ? 'error' : null };
}

export default function Simulator() {
  const [initial] = useState(initialDoc);
  const [state, dispatch] = useReducer(editorReducer, initial.doc, initialEditorState);
  const [settings, updateSettings] = useSettings();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryDragType, setLibraryDragType] = useState<DeviceType | null>(null);
  const [hoveredType, setHoveredType] = useState<DeviceType | null>(null);
  const [propertiesFor, setPropertiesFor] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [activeExample, setActiveExample] = useState<ExampleId | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [toast, showToast] = useToast();
  const touch = useCoarsePointer();
  const touchHintShown = useRef(false);
  const canvasRef = useRef<CanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { doc, selection, tool } = state;
  useAutosave(doc);
  const connectivity = useMemo(() => buildConnectivity(doc), [doc]);
  const flowGraph = useMemo(() => buildFlowGraph(doc), [doc]);
  const sim = useSimulation(doc, connectivity, flowGraph, settings.electronFlow);
  const hasSelection = selection.parts.length > 0 || selection.wires.length > 0;

  // --- Yükleme (örnek, dosya, paylaşım bağlantısı, yeni devre) ---------------------------
  /** Yeni bir belge yükler; önceki belge geri alma geçmişinde kalır. */
  const loadDoc = (next: CircuitDoc, message: string, example: ExampleId | null = null) => {
    dispatch({ type: 'commit', doc: next, selection: EMPTY_SELECTION });
    dispatch({ type: 'set-tool', tool: { kind: 'select' } });
    setActiveExample(example);
    setAnswerRevealed(false);
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
    if (runtimeKeys && runtimeKeys.split(';').some((k) => !before.has(k))) setPanelOpen(true);
  }, [runtimeKeys]);
  useEffect(() => {
    if (sim.notice?.kind === 'error') {
      setPanelOpen(true);
      setSelectedMessage(messageKey(sim.notice.diagnostic));
    }
  }, [sim.notice]);

  const editingPart = propertiesFor ? doc.parts.find((p) => p.id === propertiesFor) : undefined;

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
        toolKind={tool.kind}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        hasSelection={hasSelection}
        settings={settings}
        onSettings={updateSettings}
        onToggleLibrary={() => setLibraryOpen((o) => !o)}
        onSelectTool={() => dispatch({ type: 'set-tool', tool: { kind: 'select' } })}
        onWireTool={() => dispatch({ type: 'set-tool', tool: tool.kind === 'wire' ? { kind: 'select' } : { kind: 'wire' } })}
        onRotate={rotate}
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
        <Library
          tool={tool}
          settings={settings}
          dispatch={dispatch}
          onDragTypeChange={setLibraryDragType}
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          activeExample={activeExample}
          onLoadExample={loadExample}
          touch={touch}
          onPreview={setHoveredType}
          onAddPart={(type) => {
            canvasRef.current?.addPartAtCenter(type);
            if (!touchHintShown.current) {
              touchHintShown.current = true;
              showToast(tr.hints.touchAdded);
            }
          }}
        />
        {libraryOpen && (
          <div className="absolute inset-0 z-20 bg-ink/20 md:hidden" onClick={() => setLibraryOpen(false)} aria-hidden="true" />
        )}
        <main className="relative min-w-0 flex-1">
          <Canvas
            ref={canvasRef}
            doc={doc}
            selection={selection}
            tool={tool}
            settings={settings}
            connectivity={connectivity}
            dispatch={dispatch}
            libraryDragType={libraryDragType}
            onOpenProperties={setPropertiesFor}
            keyboardEnabled={!editingPart && !shareLink}
            flowGraph={flowGraph}
            simActive={sim.status !== 'stopped'}
            frame={sim.frame}
            highlight={highlight}
            onRepair={sim.repair}
            onRotate={rotateSelection}
            onFlip={flipSelection}
            fitRequest={fitRequest}
            reserveCard={activeExample !== null}
            touch={touch}
            overlayOpen={libraryOpen || Boolean(editingPart) || Boolean(shareLink)}
          />
          {(() => {
            const infoType = tool.kind === 'place' ? tool.type : (libraryDragType ?? hoveredType);
            return infoType && !touch ? <PartInfo type={infoType} resistorStyle={settings.resistorStyle} /> : null;
          })()}
          {activeExample && (
            <ExampleCard
              key={activeExample}
              id={activeExample}
              revealed={answerRevealed}
              onClose={() => setActiveExample(null)}
            />
          )}
        </main>
      </div>

      <MessagesPanel
        items={messages}
        open={panelOpen}
        onToggle={() => setPanelOpen((o) => !o)}
        selectedKey={selectedItem ? selectedItem.key : null}
        onSelect={selectMessage}
        context={diagnosticContext}
      />

      <SimBar
        status={sim.status}
        time={sim.frame?.time ?? 0}
        speed={sim.speed}
        notice={sim.notice}
        electronFlow={settings.electronFlow}
        diagnosticContext={diagnosticContext}
        onPlay={sim.play}
        onPause={sim.pause}
        onStop={sim.stop}
        onSpeed={sim.setSpeed}
        onElectronFlow={(on) => updateSettings({ electronFlow: on })}
      />

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
      <Toast toast={toast} />
    </div>
  );
}
