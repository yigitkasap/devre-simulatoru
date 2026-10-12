// Editör durumu: belge, geri alma/yineleme geçmişi, seçim ve etkin araç.

import type { CircuitDoc, Rotation } from '../model/types';
import type { DeviceType } from '../sim/netlist';

export type Tool =
  | { readonly kind: 'select' }
  | { readonly kind: 'wire' }
  | { readonly kind: 'place'; readonly type: DeviceType; readonly rotation: Rotation };

export interface Selection {
  readonly parts: readonly string[];
  readonly wires: readonly string[];
}

export const EMPTY_SELECTION: Selection = { parts: [], wires: [] };

export interface EditorState {
  readonly doc: CircuitDoc;
  readonly past: readonly CircuitDoc[];
  readonly future: readonly CircuitDoc[];
  readonly selection: Selection;
  readonly tool: Tool;
}

export type EditorAction =
  /** Yeni belge; önceki belge geçmişe eklenir. */
  | { readonly type: 'commit'; readonly doc: CircuitDoc; readonly selection?: Selection }
  /** Sürükleme sırasında ara durum: geçmişe eklenmez. */
  | { readonly type: 'preview'; readonly doc: CircuitDoc }
  /** Sürükleme bitti: sürüklemeden önceki belge geçmişe eklenir. */
  | { readonly type: 'end-preview'; readonly before: CircuitDoc }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'select'; readonly selection: Selection }
  | { readonly type: 'set-tool'; readonly tool: Tool };

const HISTORY_LIMIT = 200;

function pushPast(past: readonly CircuitDoc[], doc: CircuitDoc): CircuitDoc[] {
  const next = [...past, doc];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/** Seçimde artık belgede olmayan öğeleri ayıklar. */
function pruneSelection(selection: Selection, doc: CircuitDoc): Selection {
  const parts = selection.parts.filter((id) => doc.parts.some((p) => p.id === id));
  const wires = selection.wires.filter((id) => doc.wires.some((w) => w.id === id));
  return parts.length === selection.parts.length && wires.length === selection.wires.length ? selection : { parts, wires };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'commit':
      if (action.doc === state.doc) {
        return action.selection ? { ...state, selection: action.selection } : state;
      }
      return {
        ...state,
        doc: action.doc,
        past: pushPast(state.past, state.doc),
        future: [],
        selection: pruneSelection(action.selection ?? state.selection, action.doc),
      };
    case 'preview':
      return { ...state, doc: action.doc };
    case 'end-preview':
      if (action.before === state.doc) return state;
      return { ...state, past: pushPast(state.past, action.before), future: [] };
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        selection: pruneSelection(state.selection, previous),
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        doc: next,
        past: pushPast(state.past, state.doc),
        future: state.future.slice(1),
        selection: pruneSelection(state.selection, next),
      };
    }
    case 'select':
      return { ...state, selection: action.selection };
    case 'set-tool':
      return { ...state, tool: action.tool };
  }
}

export function initialEditorState(doc: CircuitDoc): EditorState {
  return { doc, past: [], future: [], selection: EMPTY_SELECTION, tool: { kind: 'select' } };
}
