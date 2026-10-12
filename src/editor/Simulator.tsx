// Simülatörün kök bileşeni: üst çubuk, parça kütüphanesi, tuval, simülasyon çubuğu ve özellik penceresi.

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { DiagnosticContext } from '../i18n/tr';
import { buildConnectivity, wireKey } from '../model/connectivity';
import { removeItems, rotateParts, updatePart } from '../model/docOps';
import { buildFlowGraph } from '../model/flow';
import { nextRotation } from '../model/geometry';
import { emptyDoc } from '../model/types';
import { compileNetlist, type CompiledCircuit, type Diagnostic } from '../sim';
import type { DeviceType } from '../sim/netlist';
import { loadSavedDoc, useAutosave } from './autosave';
import { Canvas, type CanvasHandle, type Highlight } from './Canvas';
import { Library } from './Library';
import { MessagesPanel, messageKey, type MessageItem } from './MessagesPanel';
import { PropertiesDialog } from './PropertiesDialog';
import { useSettings } from './settings';
import { SimBar } from './SimBar';
import { EMPTY_SELECTION, editorReducer, initialEditorState } from './state';
import { TopBar } from './TopBar';
import { useSimulation } from './useSimulation';

export default function Simulator() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialEditorState(loadSavedDoc() ?? emptyDoc()));
  const [settings, updateSettings] = useSettings();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryDragType, setLibraryDragType] = useState<DeviceType | null>(null);
  const [propertiesFor, setPropertiesFor] = useState<string | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);

  const { doc, selection, tool } = state;
  useAutosave(doc);
  const connectivity = useMemo(() => buildConnectivity(doc), [doc]);
  const flowGraph = useMemo(() => buildFlowGraph(doc), [doc]);
  const sim = useSimulation(doc, connectivity, flowGraph, settings.electronFlow);
  const hasSelection = selection.parts.length > 0 || selection.wires.length > 0;

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

  const rotate = () => {
    if (tool.kind === 'place') {
      dispatch({ type: 'set-tool', tool: { ...tool, rotation: nextRotation(tool.rotation) } });
    } else if (selection.parts.length > 0) {
      dispatch({ type: 'commit', doc: rotateParts(doc, new Set(selection.parts)) });
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
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
      />

      <div className="relative flex min-h-0 flex-1">
        <Library
          tool={tool}
          settings={settings}
          dispatch={dispatch}
          onDragTypeChange={setLibraryDragType}
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
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
            keyboardEnabled={!editingPart}
            flowGraph={flowGraph}
            simActive={sim.status !== 'stopped'}
            frame={sim.frame}
            highlight={highlight}
            onRepair={sim.repair}
          />
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
    </div>
  );
}
