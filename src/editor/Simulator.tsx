// Simülatörün kök bileşeni: üst çubuk, parça kütüphanesi, tuval ve özellik penceresi.

import { useMemo, useReducer, useRef, useState } from 'react';
import { buildConnectivity } from '../model/connectivity';
import { removeItems, rotateParts, updatePart } from '../model/docOps';
import { nextRotation } from '../model/geometry';
import { emptyDoc } from '../model/types';
import type { DeviceType } from '../sim/netlist';
import { Canvas, type CanvasHandle } from './Canvas';
import { Library } from './Library';
import { PropertiesDialog } from './PropertiesDialog';
import { useSettings } from './settings';
import { EMPTY_SELECTION, editorReducer, initialEditorState } from './state';
import { TopBar } from './TopBar';

export default function Simulator() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialEditorState(emptyDoc()));
  const [settings, updateSettings] = useSettings();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryDragType, setLibraryDragType] = useState<DeviceType | null>(null);
  const [propertiesFor, setPropertiesFor] = useState<string | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);

  const { doc, selection, tool } = state;
  const connectivity = useMemo(() => buildConnectivity(doc), [doc]);
  const hasSelection = selection.parts.length > 0 || selection.wires.length > 0;
  const editingPart = propertiesFor ? doc.parts.find((p) => p.id === propertiesFor) : undefined;

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
          />
        </main>
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
    </div>
  );
}
