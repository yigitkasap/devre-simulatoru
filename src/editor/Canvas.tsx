// Izgaralı SVG tuval: parça yerleştirme, kablo çekme, seçme, taşıma, döndürme, silme,
// yakınlaştırma ve kaydırma. Tüm fare/dokunma olayları SVG'nin kendisinde işlenir;
// hangi öğeye tıklandığı geometriyle (isabet testi) bulunur.

import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { tr } from '../i18n/tr';
import { CATALOG, isDeviceType, type Box } from '../model/catalog';
import type { Connectivity } from '../model/connectivity';
import { pinKey } from '../model/connectivity';
import { addPart, addWire, moveSelection, removeItems, replaceWirePoints, updatePart } from '../model/docOps';
import { partAxis, type FlowGraph } from '../model/flow';
import {
  boxesIntersect,
  boxFromPoints,
  boxContains,
  distanceToSegment,
  nextRotation,
  partBounds,
  pinPositions,
  samePoint,
  snapToSegment,
  unionBox,
} from '../model/geometry';
import { GRID, type CircuitDoc, type Point, type Rotation } from '../model/types';
import { moveSegment, routeL } from '../model/wires';
import { boolProp, type DeviceType } from '../sim/netlist';
import { formatSI } from '../sim/units';
import { CURRENT_DOT_COLOR, UNKNOWN_WIRE_COLOR, VOLTAGE_GRADIENT, voltageColor } from './colors';
import { BurnBalloon, ContextMenu, ReadoutBox, type MenuItem } from './CanvasOverlays';
import { meterDisplayRect, PartView, type PartTone } from './PartView';
import { meterText, partReadout } from './readouts';
import type { Settings } from './settings';
import { EMPTY_SELECTION, type EditorAction, type Selection, type Tool } from './state';
import { MIN_ANIMATED_CURRENT, type SimFrame } from './useSimulation';
import { clampScale, fitView, screenToGrid, snap, zoomAt, type View } from './view';

export interface CanvasHandle {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  /** Verilen parçalar ve kablolar ekranda görünmüyorsa görünümü onlara kaydırır. */
  reveal(partIds: readonly string[], wireIds: readonly string[]): void;
  /** Parçayı görünen alanın ortasındaki boş bir yere ekler ve seçer (dokunmatik ekran). */
  addPartAtCenter(type: DeviceType): void;
}

/** Mesaj panelinde seçilen hata/uyarının tuvaldeki vurgusu. */
export interface Highlight {
  readonly parts: ReadonlySet<string>;
  readonly wires: ReadonlySet<string>;
  readonly severity: 'error' | 'warning';
}

export interface CanvasProps {
  readonly doc: CircuitDoc;
  readonly selection: Selection;
  readonly tool: Tool;
  readonly settings: Settings;
  readonly connectivity: Connectivity;
  readonly dispatch: Dispatch<EditorAction>;
  /** Kütüphaneden sürüklenmekte olan parça türü (HTML sürükle-bırak). */
  readonly libraryDragType: DeviceType | null;
  readonly onOpenProperties: (partId: string) => void;
  /** Bir pencere açıkken klavye kısayolları devre dışı. */
  readonly keyboardEnabled: boolean;
  /** Akım çizgesi (kablo parçalarının akımları SimFrame'de bu sırayla gelir). */
  readonly flowGraph: FlowGraph;
  /** Simülasyon çalışıyor ya da duraklatılmış mı? (anahtarlar tıklanarak değiştirilir) */
  readonly simActive: boolean;
  /** Son simülasyon karesi; simülasyon durdurulmuşsa null. */
  readonly frame: SimFrame | null;
  readonly highlight: Highlight | null;
  /** Yanmış LED'i onar. */
  readonly onRepair: (partId: string) => void;
  /** Parçaları 90° döndür (kablolar pinleri izler). */
  readonly onRotate: (partIds: readonly string[]) => void;
  /** Yönlü parçaları ters çevir (uçlar yer değiştirir, kablolar yerinde kalır). */
  readonly onFlip: (partIds: readonly string[]) => void;
  /** Bu sayı değişince görünüm devreye sığdırılır (örnek ya da dosya yüklenince). */
  readonly fitRequest: number;
  /** Sol üstteki örnek kartı: sığdırırken kartın kapladığı alan boş bırakılır. */
  readonly reserveCard: 'none' | 'collapsed' | 'open';
  /** Osiloskop paneli: sığdırırken panelin kapladığı alan (sağda ya da altta) boş bırakılır. */
  readonly reserveScope: 'none' | 'collapsed' | 'open';
  /** Dokunmatik ekran (birincil işaretçi parmak): seçili parçanın V/I/P bilgisi kalıcı gösterilir. */
  readonly touch: boolean;
  /** Tuvalin üstünde kaydırılabilir bir katman açık (çekmece, pencere): tuval dokunmayı tutmasın. */
  readonly overlayOpen: boolean;
  readonly ref?: Ref<CanvasHandle>;
}

type Hit =
  | { readonly kind: 'pin'; readonly partId: string; readonly index: number; readonly pos: Point }
  | { readonly kind: 'part'; readonly partId: string }
  | { readonly kind: 'wire'; readonly wireId: string; readonly segment: number };

type Interaction =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pan'; readonly pointerId: number; readonly sx: number; readonly sy: number; readonly view: View }
  | { readonly kind: 'pinch' }
  | {
      readonly kind: 'drag-parts';
      readonly pointerId: number;
      /** Dokunulan parça (çift dokunuş ve uzun basış için). */
      readonly tapPartId: string;
      readonly start: Point;
      readonly before: CircuitDoc;
      readonly parts: ReadonlySet<string>;
      readonly wires: ReadonlySet<string>;
      readonly delta: Point;
    }
  | {
      readonly kind: 'drag-segment';
      readonly pointerId: number;
      readonly start: Point;
      readonly before: CircuitDoc;
      readonly wireId: string;
      readonly segment: number;
      readonly delta: Point;
    }
  | {
      readonly kind: 'rubber';
      readonly pointerId: number;
      readonly start: Point;
      readonly current: Point;
      readonly additive: boolean;
    }
  | {
      readonly kind: 'wiring';
      readonly points: readonly Point[];
      /** Fareyle pinden sürüklenerek başlatıldıysa o işaretçi. */
      readonly dragPointerId: number | null;
      readonly downClient: { readonly x: number; readonly y: number };
    };

/** Örnek kartının (ExampleCard) kapladığı alan; sığdırırken boş bırakılır. */
const CARD_RESERVE_WIDTH = 368;
const CARD_RESERVE_HEIGHT = 300;
/** Küçültülmüş kart yalnızca başlık satırıdır. */
const CARD_RESERVE_COLLAPSED = 52;
/**
 * Osiloskop panelinin (ScopePanel) kapladığı alan: geniş ekranda sağ altta (genişlik ya da
 * yükseklik ayrılır), telefonda tuvalin altında.
 */
const SCOPE_RESERVE_WIDTH = 396;
const SCOPE_RESERVE_TALL = 450;
const SCOPE_RESERVE_HEIGHT = 300;
/** Küçültülmüş panel yalnızca başlık satırıdır. */
const SCOPE_RESERVE_COLLAPSED = 56;

/** Ekran pikseli cinsinden isabet toleransları (parmakla dokunurken daha geniş). */
const PIN_TOLERANCE_PX = 8;
const WIRE_TOLERANCE_PX = 6;
const TOUCH_PIN_TOLERANCE_PX = 18;
const TOUCH_WIRE_TOLERANCE_PX = 12;
/** Dokunmatik: parçanın gövdesi her yöne bu kadar geniş sayılır (parmak hedefi ≥ 44 px olsun). */
const TOUCH_PART_PADDING_PX = 12;
/** Dokunmatik: gövdenin içindeyken pin ancak bu kadar yakınsa seçilir (yoksa parça tutulur). */
const TOUCH_PIN_INSIDE_PX = 12;
const DRAG_THRESHOLD_PX = 5;
/** Dokunmatik: bu süre kıpırdamadan basılı tutmak sağ tık menüsünü açar (iOS'ta contextmenu olayı yok). */
const LONG_PRESS_MS = 550;
/** Dokunmatik: iki dokunuş arasındaki bu süre çift dokunuş sayılır (iOS'ta dblclick güvenilir değil). */
const DOUBLE_TAP_MS = 350;

const ZOOM_STEP = 1.25;

export function Canvas({
  doc,
  selection,
  tool,
  settings,
  connectivity,
  dispatch,
  libraryDragType,
  onOpenProperties,
  keyboardEnabled,
  flowGraph,
  simActive,
  frame,
  highlight,
  onRepair,
  onRotate,
  onFlip,
  fitRequest,
  reserveCard,
  reserveScope,
  touch,
  overlayOpen,
  ref,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1.5 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hover, setHover] = useState<Hit | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dropGhost, setDropGhost] = useState<Point | null>(null);
  const [interaction, setInteractionState] = useState<Interaction>({ kind: 'idle' });
  // Olay işleyicileri art arda gelebildiği için etkileşimin güncel hali bir ref'te de tutulur.
  const interactionRef = useRef<Interaction>(interaction);
  const setInteraction = (next: Interaction) => {
    interactionRef.current = next;
    setInteractionState(next);
  };
  const [menu, setMenu] = useState<{ partId: string; x: number; y: number } | null>(null);
  /** Kullanıcının kapattığı LED balonları (parça + yanma akımı). */
  const [dismissedBalloons, setDismissedBalloons] = useState<ReadonlySet<string>>(new Set());
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pointerType = useRef<string>('mouse');
  const longPress = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  /** Uzun basışla açılan menü: parmak kıpırdarsa kapanır ve sürükleme sürer. */
  const menuFromLongPress = useRef(false);
  const lastTap = useRef<{ partId: string; time: number } | null>(null);
  const cancelLongPress = () => {
    if (longPress.current) window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  };
  const pinchRef = useRef<{ distance: number; view: View; cx: number; cy: number } | null>(null);
  const capture = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      // Dokunmatikte işaretçi zaten örtük olarak yakalanır; yakalanamazsa olaylar yine SVG'ye gelir.
    }
  };
  const viewInitialized = useRef(false);
  const overlayOpenRef = useRef(overlayOpen);
  overlayOpenRef.current = overlayOpen;

  // iOS Safari: SVG'ye doğrudan bağlanan, varsayılanı engelleyen dokunma dinleyicileri tuvali kesin bir
  // dokunma alanı yapar ve Safari'nin kendi kaydırma/yakınlaştırma hareketini baştan durdurur
  // (touch-action'ı SVG'de yok sayarsa işaretçi akışı pointercancel ile kesilirdi). İşaretçi olayları
  // dokunma olaylarından önce geldiği için etkilenmez; yalnızca öykünülen fare olayları ve tıklama düşer.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const block = (e: TouchEvent) => {
      if (!overlayOpenRef.current && e.cancelable) e.preventDefault();
    };
    svg.addEventListener('touchstart', block, { passive: false });
    svg.addEventListener('touchmove', block, { passive: false });
    return () => {
      svg.removeEventListener('touchstart', block);
      svg.removeEventListener('touchmove', block);
    };
  }, []);

  // --- Boyut ve ilk görünüm ---------------------------------------------------------
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (viewInitialized.current || size.width === 0) return;
    viewInitialized.current = true;
    // Açılışta da (kayıtlı ya da paylaşılan devre) örnek kartının ve osiloskop panelinin yeri ayrılır.
    if (docBounds(doc)) fit();
    else setView({ x: size.width / 2, y: size.height / 2, scale: size.width < 640 ? 1.1 : 1.5 });
  }, [size, doc]);

  const fit = () => {
    const bounds = docBounds(doc);
    if (!bounds) {
      setView((v) => ({ ...v, x: size.width / 2, y: size.height / 2 }));
      return;
    }
    // Örnek kartı açıksa devre kartın yanındaki (geniş ekran) ya da altındaki (telefon) alana sığdırılır.
    // Osiloskop paneli açıksa onun yeri de ayrılır: telefonda altta; geniş ekranda panel sağ altta
    // durduğu için sağdaki şerit ya da alttaki şerit, hangisi devreyi daha büyük gösteriyorsa.
    const wide = size.width >= 760;
    const left = reserveCard === 'open' && wide ? CARD_RESERVE_WIDTH : 0;
    const top =
      reserveCard === 'none' || (wide && reserveCard === 'open')
        ? 0
        : Math.min(reserveCard === 'open' ? CARD_RESERVE_HEIGHT : CARD_RESERVE_COLLAPSED, size.height / 2);
    const scopeHeight =
      reserveScope === 'collapsed' ? SCOPE_RESERVE_COLLAPSED : wide ? SCOPE_RESERVE_TALL : SCOPE_RESERVE_HEIGHT;
    // Panelin altında en az 120 piksellik bir şerit devreye kalsın.
    const bottomOption = { right: 0, bottom: Math.max(0, Math.min(scopeHeight, size.height - top - 120)) };
    const options: Array<{ right: number; bottom: number }> =
      reserveScope === 'none'
        ? [{ right: 0, bottom: 0 }]
        : wide
          ? [{ right: SCOPE_RESERVE_WIDTH, bottom: 0 }, bottomOption]
          : [bottomOption];
    let best: View | null = null;
    for (const { right, bottom } of options) {
      const fitted = fitView(bounds, Math.max(1, size.width - left - right), Math.max(1, size.height - top - bottom));
      if (!best || fitted.scale > best.scale) best = { ...fitted, x: fitted.x + left, y: fitted.y + top };
    }
    if (best) setView(best);
  };

  const reveal = (partIds: readonly string[], wireIds: readonly string[]) => {
    let box: Box | null = null;
    for (const part of doc.parts) if (partIds.includes(part.id)) box = unionBox(box, partBounds(part));
    for (const wire of doc.wires) {
      if (!wireIds.includes(wire.id)) continue;
      for (const p of wire.points) box = unionBox(box, { x: p.x, y: p.y, w: 0, h: 0 });
    }
    if (!box) return;
    const g = GRID * view.scale;
    const inside =
      box.x * g + view.x >= 0 &&
      box.y * g + view.y >= 0 &&
      (box.x + box.w) * g + view.x <= size.width &&
      (box.y + box.h) * g + view.y <= size.height;
    if (inside) return;
    const fits = box.w * g < size.width - 80 && box.h * g < size.height - 80;
    if (fits) {
      const cx = (box.x + box.w / 2) * GRID;
      const cy = (box.y + box.h / 2) * GRID;
      setView({ ...view, x: size.width / 2 - cx * view.scale, y: size.height / 2 - cy * view.scale });
    } else {
      setView(fitView(box, size.width, size.height));
    }
  };

  useEffect(() => {
    if (fitRequest > 0 && size.width > 0) fit();
    // Yalnızca yeni bir sığdırma isteğinde çalışır.
  }, [fitRequest]);

  const addPartAtCenter = (type: DeviceType) => {
    const center = snap(screenToGrid(view, size.width / 2, size.height / 2));
    const occupied = doc.parts.map((p) => partBounds(p));
    // Merkezden başlayıp yakındaki boş bir yer aranır; bulunamazsa merkeze eklenir.
    const offsets = [
      [0, 0], [0, 6], [0, -6], [10, 0], [-10, 0], [10, 6], [-10, 6], [10, -6], [-10, -6], [0, 12], [0, -12], [20, 0], [-20, 0],
    ] as const;
    let at = center;
    for (const [dx, dy] of offsets) {
      const candidate = { x: center.x + dx, y: center.y + dy };
      const b = partBounds({ type, x: candidate.x, y: candidate.y, rotation: 0 });
      const padded = { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 };
      if (!occupied.some((o) => boxesIntersect(o, padded))) {
        at = candidate;
        break;
      }
    }
    placePart(type, at, 0);
  };

  useImperativeHandle(ref, () => ({
    zoomIn: () => setView((v) => zoomAt(v, size.width / 2, size.height / 2, ZOOM_STEP)),
    zoomOut: () => setView((v) => zoomAt(v, size.width / 2, size.height / 2, 1 / ZOOM_STEP)),
    fit,
    reveal,
    addPartAtCenter,
  }));

  // --- Fare tekerleği ile yakınlaştırma (pasif olmayan dinleyici gerekir) ---------------
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      setView((v) => zoomAt(v, e.clientX - rect.left, e.clientY - rect.top, factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // --- Yardımcılar -------------------------------------------------------------------
  const localPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const toGrid = (clientX: number, clientY: number): Point => {
    const p = localPoint(clientX, clientY);
    return screenToGrid(view, p.x, p.y);
  };
  const pxToGrid = (px: number) => px / (view.scale * GRID);

  const hitTest = (g: Point, only?: { pins?: boolean; parts?: boolean; wires?: boolean }): Hit | null => {
    const want = { pins: true, parts: true, wires: true, ...only };
    const touch = pointerType.current !== 'mouse';
    if (touch && want.parts) {
      // Parmakla dokunurken: parçanın genişletilmiş gövdesinin içindeyse ve bir pinine çok yakın
      // değilse parça tutulur. Böylece küçük parçalar da sürüklenebilir.
      const pad = pxToGrid(TOUCH_PART_PADDING_PX);
      for (let i = doc.parts.length - 1; i >= 0; i--) {
        const part = doc.parts[i]!;
        const b = partBounds(part);
        if (!boxContains({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad }, g)) continue;
        if (want.pins) {
          const pins = pinPositions(part);
          let nearest = -1;
          let nearestDist = pxToGrid(TOUCH_PIN_INSIDE_PX);
          pins.forEach((pos, index) => {
            const d = Math.hypot(pos.x - g.x, pos.y - g.y);
            if (d <= nearestDist) {
              nearestDist = d;
              nearest = index;
            }
          });
          if (nearest >= 0) return { kind: 'pin', partId: part.id, index: nearest, pos: pins[nearest]! };
        }
        return { kind: 'part', partId: part.id };
      }
    }
    if (want.pins) {
      const tol = pxToGrid(touch ? TOUCH_PIN_TOLERANCE_PX : PIN_TOLERANCE_PX);
      let best: Hit | null = null;
      let bestDist = tol;
      for (const part of doc.parts) {
        pinPositions(part).forEach((pos, index) => {
          const d = Math.hypot(pos.x - g.x, pos.y - g.y);
          if (d <= bestDist) {
            bestDist = d;
            best = { kind: 'pin', partId: part.id, index, pos };
          }
        });
      }
      if (best) return best;
    }
    if (want.parts) {
      for (let i = doc.parts.length - 1; i >= 0; i--) {
        const part = doc.parts[i]!;
        if (boxContains(partBounds(part), g)) return { kind: 'part', partId: part.id };
      }
    }
    if (want.wires) {
      const tol = pxToGrid(touch ? TOUCH_WIRE_TOLERANCE_PX : WIRE_TOLERANCE_PX);
      for (let i = doc.wires.length - 1; i >= 0; i--) {
        const wire = doc.wires[i]!;
        for (let s = 0; s + 1 < wire.points.length; s++) {
          if (distanceToSegment(g, wire.points[s]!, wire.points[s + 1]!) <= tol) {
            return { kind: 'wire', wireId: wire.id, segment: s };
          }
        }
      }
    }
    return null;
  };

  /** Kablo çizerken imlecin yapışacağı nokta: pin, kablo üzerindeki nokta ya da ızgara. */
  const wireTarget = (g: Point): { point: Point; finishes: boolean } => {
    const hit = hitTest(g, { parts: false });
    if (hit?.kind === 'pin') return { point: hit.pos, finishes: true };
    if (hit?.kind === 'wire') {
      const wire = doc.wires.find((w) => w.id === hit.wireId)!;
      return { point: snapToSegment(g, wire.points[hit.segment]!, wire.points[hit.segment + 1]!), finishes: true };
    }
    return { point: snap(g), finishes: false };
  };

  const horizontalFirst = (points: readonly Point[], to: Point): boolean => {
    const last = points[points.length - 1]!;
    const prev = points[points.length - 2];
    if (prev) return prev.x === last.x; // önceki parça dikeyse şimdi yatay başla
    return Math.abs(to.x - last.x) >= Math.abs(to.y - last.y);
  };

  const commit = (next: CircuitDoc, nextSelection?: Selection) =>
    dispatch({ type: 'commit', doc: next, ...(nextSelection ? { selection: nextSelection } : {}) });

  const finishWire = (points: readonly Point[]) => {
    setInteraction({ kind: 'idle' });
    const result = addWire(doc, points);
    if (result.id) commit(result.doc, EMPTY_SELECTION);
  };

  const wiringClick = (state: Extract<Interaction, { kind: 'wiring' }>, g: Point) => {
    const target = wireTarget(g);
    const last = state.points[state.points.length - 1]!;
    if (samePoint(target.point, last)) {
      if (target.finishes && state.points.length >= 2) finishWire(state.points);
      return;
    }
    const points = [...state.points, ...routeL(last, target.point, horizontalFirst(state.points, target.point))];
    if (target.finishes) finishWire(points);
    else setInteraction({ ...state, points, dragPointerId: null });
  };

  const startWiring = (start: Point, e: ReactPointerEvent) => {
    setInteraction({ kind: 'wiring', points: [start], dragPointerId: e.pointerId, downClient: { x: e.clientX, y: e.clientY } });
  };

  const placePart = (type: DeviceType, at: Point, rotation: Rotation) => {
    const result = addPart(doc, type, at, rotation);
    commit(result.doc, { parts: [result.id], wires: [] });
  };

  // --- İşaretçi olayları ---------------------------------------------------------------
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointerType.current = e.pointerType;
    if (e.isPrimary) {
      // Yeni bir dokunuş ya da tıklama: kaçırılmış bir pointerup'tan (iOS'ta olabiliyor) kalan kayıtlar
      // silinir; yoksa tek parmak iki parmak sanılır ve tuval kıstırma kipinde takılı kalır.
      pointers.current.clear();
      const stale = interactionRef.current;
      if (stale.kind === 'drag-parts' || stale.kind === 'drag-segment') {
        dispatch({ type: 'end-preview', before: stale.before });
        setInteraction({ kind: 'idle' });
      } else if (stale.kind === 'pinch' || stale.kind === 'pan' || stale.kind === 'rubber') {
        pinchRef.current = null;
        setInteraction({ kind: 'idle' });
      }
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const current = interactionRef.current;

    // İki parmak: kıstırarak yakınlaştırma
    if (pointers.current.size === 2) {
      cancelLongPress();
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      if (current.kind === 'drag-parts' || current.kind === 'drag-segment') dispatch({ type: 'end-preview', before: current.before });
      const center = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), view, cx: center.x, cy: center.y };
      setInteraction({ kind: 'pinch' });
      return;
    }
    if (pointers.current.size > 2) return;

    const g = toGrid(e.clientX, e.clientY);
    const local = localPoint(e.clientX, e.clientY);

    if (e.button === 2) {
      if (current.kind === 'wiring') setInteraction({ kind: 'idle' });
      return;
    }
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      capture(e.pointerId);
      setInteraction({ kind: 'pan', pointerId: e.pointerId, sx: local.x, sy: local.y, view });
      return;
    }
    if (e.button !== 0) return;

    if (tool.kind === 'place') {
      placePart(tool.type, snap(g), tool.rotation);
      if (!e.shiftKey) dispatch({ type: 'set-tool', tool: { kind: 'select' } });
      return;
    }

    if (current.kind === 'wiring') {
      capture(e.pointerId);
      wiringClick(current, g);
      return;
    }

    const hit = hitTest(g);
    if (hit?.kind === 'pin') {
      capture(e.pointerId);
      startWiring(hit.pos, e);
      return;
    }
    if (tool.kind === 'wire') {
      capture(e.pointerId);
      if (hit?.kind === 'wire') {
        const wire = doc.wires.find((w) => w.id === hit.wireId)!;
        startWiring(snapToSegment(g, wire.points[hit.segment]!, wire.points[hit.segment + 1]!), e);
      } else {
        startWiring(snap(g), e);
      }
      return;
    }

    // Seçme aracı
    if (hit?.kind === 'part') {
      const part = doc.parts.find((p) => p.id === hit.partId);
      if (simActive && part?.type === 'switch' && !e.shiftKey) {
        // Simülasyon sırasında anahtara tıklamak onu açar/kapatır.
        const closed = boolProp(part.props, 'closed', false);
        commit(updatePart(doc, part.id, { props: { ...part.props, closed: !closed } }));
        return;
      }
      if (e.shiftKey) {
        const parts = selection.parts.includes(hit.partId)
          ? selection.parts.filter((id) => id !== hit.partId)
          : [...selection.parts, hit.partId];
        dispatch({ type: 'select', selection: { ...selection, parts } });
        return;
      }
      const sel = selection.parts.includes(hit.partId) ? selection : { parts: [hit.partId], wires: [] };
      if (sel !== selection) dispatch({ type: 'select', selection: sel });
      capture(e.pointerId);
      if (e.pointerType !== 'mouse') {
        // Uzun basış: sağ tık menüsü (parmak kıpırdamazsa).
        cancelLongPress();
        const partId = hit.partId;
        longPress.current = {
          x: e.clientX,
          y: e.clientY,
          fired: false,
          timer: window.setTimeout(() => {
            const state = interactionRef.current;
            if (state.kind !== 'drag-parts' || state.delta.x !== 0 || state.delta.y !== 0) return;
            if (longPress.current) longPress.current.fired = true;
            // Sürükleme iptal edilmez: parmak kıpırdarsa menü kapanır ve parça taşınır.
            menuFromLongPress.current = true;
            setMenu({ partId, x: local.x, y: local.y });
          }, LONG_PRESS_MS),
        };
      }
      setInteraction({
        kind: 'drag-parts',
        pointerId: e.pointerId,
        tapPartId: hit.partId,
        start: g,
        before: doc,
        parts: new Set(sel.parts),
        wires: new Set(sel.wires),
        delta: { x: 0, y: 0 },
      });
      return;
    }
    if (hit?.kind === 'wire') {
      if (e.shiftKey) {
        const wires = selection.wires.includes(hit.wireId)
          ? selection.wires.filter((id) => id !== hit.wireId)
          : [...selection.wires, hit.wireId];
        dispatch({ type: 'select', selection: { ...selection, wires } });
        return;
      }
      if (!selection.wires.includes(hit.wireId) || selection.parts.length > 0 || selection.wires.length > 1) {
        dispatch({ type: 'select', selection: { parts: [], wires: [hit.wireId] } });
      }
      capture(e.pointerId);
      setInteraction({
        kind: 'drag-segment',
        pointerId: e.pointerId,
        start: g,
        before: doc,
        wireId: hit.wireId,
        segment: hit.segment,
        delta: { x: 0, y: 0 },
      });
      return;
    }

    // Boş alan: dokunmatikte kaydır, farede seçim kutusu
    capture(e.pointerId);
    if (e.pointerType !== 'mouse') {
      setInteraction({ kind: 'pan', pointerId: e.pointerId, sx: local.x, sy: local.y, view });
      return;
    }
    if (!e.shiftKey && (selection.parts.length > 0 || selection.wires.length > 0)) {
      dispatch({ type: 'select', selection: EMPTY_SELECTION });
    }
    setInteraction({ kind: 'rubber', pointerId: e.pointerId, start: g, current: g, additive: e.shiftKey });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 0) pointerType.current = e.pointerType;
    const current = interactionRef.current;
    const press = longPress.current;
    if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD_PX * 2) cancelLongPress();

    if (current.kind === 'pinch' && pinchRef.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const start = pinchRef.current;
      const center = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const scale = clampScale(start.view.scale * (Math.hypot(a.x - b.x, a.y - b.y) / start.distance));
      const k = scale / start.view.scale;
      setView({
        scale,
        x: center.x - (start.cx - start.view.x) * k,
        y: center.y - (start.cy - start.view.y) * k,
      });
      return;
    }

    const g = toGrid(e.clientX, e.clientY);
    setCursor(g);

    switch (current.kind) {
      case 'pan': {
        const local = localPoint(e.clientX, e.clientY);
        setView({ ...current.view, x: current.view.x + local.x - current.sx, y: current.view.y + local.y - current.sy });
        return;
      }
      case 'drag-parts': {
        const delta = { x: Math.round(g.x - current.start.x), y: Math.round(g.y - current.start.y) };
        if (samePoint(delta, current.delta)) return;
        if (menuFromLongPress.current) {
          menuFromLongPress.current = false;
          setMenu(null);
        }
        setInteraction({ ...current, delta });
        dispatch({ type: 'preview', doc: moveSelection(current.before, current.parts, current.wires, delta.x, delta.y) });
        return;
      }
      case 'drag-segment': {
        const delta = { x: Math.round(g.x - current.start.x), y: Math.round(g.y - current.start.y) };
        if (samePoint(delta, current.delta)) return;
        setInteraction({ ...current, delta });
        const wire = current.before.wires.find((w) => w.id === current.wireId);
        if (!wire) return;
        dispatch({
          type: 'preview',
          doc: replaceWirePoints(current.before, current.wireId, moveSegment(wire.points, current.segment, delta)),
        });
        return;
      }
      case 'rubber':
        setInteraction({ ...current, current: g });
        return;
      default:
        break;
    }
    if (current.kind === 'wiring' || tool.kind !== 'place') {
      const hit = hitTest(g, current.kind === 'wiring' ? { parts: false } : undefined);
      setHover(hit);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const current = interactionRef.current;
    const longPressFired = longPress.current?.fired ?? false;
    cancelLongPress();
    if (current.kind === 'pinch') {
      if (pointers.current.size < 2) {
        pinchRef.current = null;
        setInteraction({ kind: 'idle' });
      }
      return;
    }
    switch (current.kind) {
      case 'pan': {
        setInteraction({ kind: 'idle' });
        const local = localPoint(e.clientX, e.clientY);
        const still = Math.hypot(local.x - current.sx, local.y - current.sy) <= DRAG_THRESHOLD_PX * 2;
        if (e.pointerType !== 'mouse' && still) {
          // Boşluğa dokunmak: seçimi ve menüyü kaldır.
          setMenu(null);
          if (selection.parts.length > 0 || selection.wires.length > 0) dispatch({ type: 'select', selection: EMPTY_SELECTION });
        }
        return;
      }
      case 'drag-parts':
      case 'drag-segment': {
        setInteraction({ kind: 'idle' });
        const moved = current.delta.x !== 0 || current.delta.y !== 0;
        if (moved) dispatch({ type: 'end-preview', before: current.before });
        // Dokunmatik çift dokunuş: özellik penceresi.
        menuFromLongPress.current = false;
        if (current.kind === 'drag-parts' && e.pointerType !== 'mouse' && !moved && !longPressFired) {
          const now = performance.now();
          const previous = lastTap.current;
          if (previous && previous.partId === current.tapPartId && now - previous.time < DOUBLE_TAP_MS) {
            lastTap.current = null;
            onOpenProperties(current.tapPartId);
          } else {
            lastTap.current = { partId: current.tapPartId, time: now };
          }
        }
        return;
      }
      case 'rubber': {
        setInteraction({ kind: 'idle' });
        const box = boxFromPoints(current.start, current.current);
        if (box.w < pxToGrid(3) && box.h < pxToGrid(3)) return;
        const parts = doc.parts.filter((p) => boxesIntersect(partBounds(p), box)).map((p) => p.id);
        const wires = doc.wires
          .filter((w) => w.points.some((pt, i) => i > 0 && boxesIntersect(boxFromPoints(w.points[i - 1]!, pt), box)))
          .map((w) => w.id);
        const merged = current.additive
          ? {
              parts: [...new Set([...selection.parts, ...parts])],
              wires: [...new Set([...selection.wires, ...wires])],
            }
          : { parts, wires };
        dispatch({ type: 'select', selection: merged });
        return;
      }
      case 'wiring': {
        if (current.dragPointerId !== e.pointerId) return;
        const moved = Math.hypot(e.clientX - current.downClient.x, e.clientY - current.downClient.y) > DRAG_THRESHOLD_PX;
        const state = { ...current, dragPointerId: null };
        setInteraction(state);
        // Pinden sürükleyip bırakmak, bırakılan yere tıklamak gibidir.
        if (moved) wiringClick(state, toGrid(e.clientX, e.clientY));
        return;
      }
      default:
        return;
    }
  };

  const onContextMenu = (e: ReactMouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (interactionRef.current.kind !== 'idle' || tool.kind !== 'select') return;
    const hit = hitTest(toGrid(e.clientX, e.clientY), { pins: false, wires: false });
    if (hit?.kind !== 'part') {
      setMenu(null);
      return;
    }
    if (!selection.parts.includes(hit.partId)) dispatch({ type: 'select', selection: { parts: [hit.partId], wires: [] } });
    const local = localPoint(e.clientX, e.clientY);
    setMenu({ partId: hit.partId, x: local.x, y: local.y });
  };

  const onDoubleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const current = interactionRef.current;
    if (current.kind === 'wiring') {
      finishWire(current.points);
      return;
    }
    const hit = hitTest(toGrid(e.clientX, e.clientY), { pins: false, wires: false });
    if (hit?.kind === 'part') onOpenProperties(hit.partId);
  };

  // --- Kütüphaneden sürükle-bırak ------------------------------------------------------
  const onDragOver = (e: ReactDragEvent<SVGSVGElement>) => {
    if (!libraryDragType) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const g = snap(toGrid(e.clientX, e.clientY));
    if (!dropGhost || !samePoint(dropGhost, g)) setDropGhost(g);
  };
  const onDrop = (e: ReactDragEvent<SVGSVGElement>) => {
    e.preventDefault();
    setDropGhost(null);
    const type = libraryDragType ?? e.dataTransfer.getData('text/plain');
    if (!isDeviceType(type)) return;
    placePart(type, snap(toGrid(e.clientX, e.clientY)), 0);
    dispatch({ type: 'set-tool', tool: { kind: 'select' } });
  };

  // --- Klavye --------------------------------------------------------------------------
  const keyHandlerRef = useRef<(e: KeyboardEvent, down: boolean) => void>(() => {});
  keyHandlerRef.current = (e, down) => {
    if (!keyboardEnabled) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setSpaceDown(down);
      return;
    }
    if (!down) return;
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const current = interactionRef.current;

    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (current.kind === 'idle') dispatch({ type: 'undo' });
    } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      if (current.kind === 'idle') dispatch({ type: 'redo' });
    } else if (ctrl && key === 'a') {
      e.preventDefault();
      dispatch({ type: 'select', selection: { parts: doc.parts.map((p) => p.id), wires: doc.wires.map((w) => w.id) } });
    } else if (key === 'escape') {
      if (current.kind === 'wiring') setInteraction({ kind: 'idle' });
      else if (tool.kind !== 'select') dispatch({ type: 'set-tool', tool: { kind: 'select' } });
      else dispatch({ type: 'select', selection: EMPTY_SELECTION });
    } else if (key === 'delete' || key === 'backspace') {
      if (selection.parts.length === 0 && selection.wires.length === 0) return;
      e.preventDefault();
      commit(removeItems(doc, selection.parts, selection.wires), EMPTY_SELECTION);
    } else if (key === 'r' && !ctrl) {
      if (tool.kind === 'place') dispatch({ type: 'set-tool', tool: { ...tool, rotation: nextRotation(tool.rotation) } });
      else if (selection.parts.length > 0 && current.kind === 'idle') onRotate(selection.parts);
    } else if (key === 'f' && !ctrl) {
      // Ters çevir: yerleştirirken hayalet parça 180° döner; seçili yönlü parçaların uçları yer değiştirir.
      if (tool.kind === 'place') {
        dispatch({ type: 'set-tool', tool: { ...tool, rotation: nextRotation(nextRotation(tool.rotation)) } });
      } else if (current.kind === 'idle') {
        const polarized = doc.parts.filter((p) => selection.parts.includes(p.id) && CATALOG[p.type].polarized);
        if (polarized.length > 0) onFlip(polarized.map((p) => p.id));
      }
    } else if (key === 'w' && !ctrl) {
      setInteraction({ kind: 'idle' });
      dispatch({ type: 'set-tool', tool: tool.kind === 'wire' ? { kind: 'select' } : { kind: 'wire' } });
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => keyHandlerRef.current(e, true);
    const up = (e: KeyboardEvent) => keyHandlerRef.current(e, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Araç değişince yarım kalan kabloyu bırak.
  useEffect(() => {
    if (tool.kind === 'place' && interactionRef.current.kind === 'wiring') setInteraction({ kind: 'idle' });
  }, [tool]);

  // --- Çizim ---------------------------------------------------------------------------
  const selectedParts = new Set(selection.parts);
  const selectedWires = new Set(selection.wires);
  const visible = {
    x: -view.x / view.scale,
    y: -view.y / view.scale,
    w: size.width / view.scale,
    h: size.height / view.scale,
  };

  let wiringPreview: Point[] | null = null;
  if (interaction.kind === 'wiring') {
    const last = interaction.points[interaction.points.length - 1]!;
    const target = cursor ? wireTarget(cursor).point : last;
    wiringPreview = [...interaction.points, ...routeL(last, target, horizontalFirst(interaction.points, target))];
  }

  const ghostType: DeviceType | null = tool.kind === 'place' ? tool.type : dropGhost ? libraryDragType : null;
  const ghostAt = tool.kind === 'place' ? (cursor ? snap(cursor) : null) : dropGhost;
  const ghostRotation = tool.kind === 'place' ? tool.rotation : 0;

  const hoverPin = hover?.kind === 'pin' ? hover.pos : null;
  const cursorClass =
    interaction.kind === 'pan'
      ? 'cursor-grabbing'
      : spaceDown
        ? 'cursor-grab'
        : tool.kind === 'place' || tool.kind === 'wire' || interaction.kind === 'wiring' || hoverPin
          ? 'cursor-crosshair'
          : hover?.kind === 'part'
            ? simActive && doc.parts.find((p) => p.id === hover.partId)?.type === 'switch'
              ? 'cursor-pointer'
              : 'cursor-move'
            : hover?.kind === 'wire'
              ? 'cursor-pointer'
              : 'cursor-default';

  const hint =
    simActive && tool.kind === 'select' && interaction.kind === 'idle'
      ? tr.hints.simulating
      : interaction.kind === 'wiring'
      ? tr.hints.wiring
      : tool.kind === 'place'
        ? tr.hints.place(tr.devices.names[tool.type])
        : tool.kind === 'wire'
          ? tr.hints.wireIdle
          : selection.parts.length + selection.wires.length > 0
            ? tr.hints.selected(selection.parts.length + selection.wires.length)
            : tr.hints.select;

  // Ölçü aleti ekranı başka bir parçanın üstüne biniyorsa ve öbür taraf boşsa, ekran öbür tarafa açılır.
  const displayFlips = new Set<string>();
  for (const part of doc.parts) {
    if (part.type !== 'voltmeter' && part.type !== 'ammeter') continue;
    const others = doc.parts.filter((p) => p.id !== part.id).map((p) => partBounds(p));
    const blocked = (flip: boolean) => {
      const r = meterDisplayRect(part, flip);
      return others.some((b) => boxesIntersect(b, r));
    };
    if (blocked(false) && !blocked(true)) displayFlips.add(part.id);
  }

  const toneOf = (id: string): PartTone =>
    highlight?.parts.has(id)
      ? highlight.severity
      : selectedParts.has(id)
        ? 'selected'
        : hover?.kind === 'part' && hover.partId === id
          ? 'hover'
          : 'normal';

  return (
    <div className="absolute inset-0 overflow-hidden bg-paper">
      <svg
        ref={svgRef}
        className={`schematic block h-full w-full ${cursorClass}`}
        // iOS/WebKit, touch-action: none bölgesini üstüne binen katmanlara da uygulayabiliyor; o zaman
        // tuvalin üstündeki çekmece ya da pencere parmakla kaydırılamıyor. Katman açıkken kapatılır.
        style={overlayOpen ? { touchAction: 'auto' } : undefined}
        role="img"
        aria-label={tr.canvas.label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          setHover(null);
          if (interactionRef.current.kind !== 'wiring') setCursor(null);
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onDragOver={onDragOver}
        onDragLeave={() => setDropGhost(null)}
        onDrop={onDrop}
      >
        <defs>
          <pattern id="grid-minor" x={-5} y={-5} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx={5} cy={5} r={0.75} fill="var(--color-grid)" />
          </pattern>
          <pattern id="grid-major" x={-5} y={-5} width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
            <circle cx={5} cy={5} r={1.35} fill="var(--color-grid)" />
          </pattern>
        </defs>
        {/* Çizimin hiçbir parçası olay almaz; hedef her zaman SVG'nin kendisidir. Dokunmatikte işaretçi
            dokunulan öğeye örtük olarak yakalandığı için, yeniden çizilen bir alt öğe sürüklemeyi koparabilirdi. */}
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`} pointerEvents="none">
          {view.scale >= 0.6 && <rect x={visible.x} y={visible.y} width={visible.w} height={visible.h} fill="url(#grid-minor)" />}
          <rect x={visible.x} y={visible.y} width={visible.w} height={visible.h} fill="url(#grid-major)" />

          {highlight &&
            doc.wires
              .filter((wire) => highlight.wires.has(wire.id))
              .map((wire) => (
                <polyline
                  key={`hl-${wire.id}`}
                  points={wire.points.map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ')}
                  fill="none"
                  stroke={highlight.severity === 'error' ? 'var(--color-danger)' : '#e8a317'}
                  strokeOpacity={0.35}
                  strokeWidth={10}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
          {doc.wires.map((wire) => {
            const selected = selectedWires.has(wire.id);
            const hovered = hover?.kind === 'wire' && hover.wireId === wire.id;
            let stroke = selected ? 'var(--color-select)' : hovered ? '#3d63b8' : 'var(--color-symbol)';
            if (frame && !selected) {
              const v = frame.wireVoltages.get(wire.id);
              stroke = v === undefined ? UNKNOWN_WIRE_COLOR : voltageColor(v / frame.vmax);
            }
            return (
              <polyline
                key={wire.id}
                points={wire.points.map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ')}
                fill="none"
                stroke={stroke}
                strokeWidth={selected || frame ? 3 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
          {connectivity.junctions.map((p) => (
            <circle key={`j${p.x},${p.y}`} cx={p.x * GRID} cy={p.y * GRID} r={3.2} fill="var(--color-symbol)" />
          ))}
          {connectivity.danglingEnds.map((p) => (
            <circle
              key={`d${p.x},${p.y}`}
              cx={p.x * GRID}
              cy={p.y * GRID}
              r={2.6}
              fill="var(--color-paper)"
              stroke="var(--color-symbol)"
              strokeWidth={1.4}
            />
          ))}

          {doc.parts.map((part) => {
            const live = frame?.live.get(part.id);
            const measurement = frame?.measurements.get(part.id);
            return (
              <PartView
                key={part.id}
                part={part}
                tone={toneOf(part.id)}
                resistorStyle={settings.resistorStyle}
                meterText={measurement ? meterText(part, measurement, frame?.statuses.get(part.id)) : null}
                alarm={frame?.alarms.has(part.id) ?? false}
                displayFlip={displayFlips.has(part.id)}
                {...(live ? { live } : {})}
              />
            );
          })}

          {frame && <CurrentDots doc={doc} graph={flowGraph} frame={frame} />}

          {doc.parts.map((part) =>
            pinPositions(part).map((pos, i) =>
              connectivity.unconnectedPins.has(pinKey(part.id, i)) ? (
                <circle
                  key={`u${part.id}-${i}`}
                  cx={pos.x * GRID}
                  cy={pos.y * GRID}
                  r={2.4}
                  fill="var(--color-paper)"
                  stroke="var(--color-pin)"
                  strokeWidth={1.3}
                />
              ) : null,
            ),
          )}

          {hoverPin && (
            <circle cx={hoverPin.x * GRID} cy={hoverPin.y * GRID} r={5.5} fill="none" stroke="var(--color-pin)" strokeWidth={2} />
          )}

          {interaction.kind === 'wiring' && (
            <circle
              cx={interaction.points[0]!.x * GRID}
              cy={interaction.points[0]!.y * GRID}
              r={4.5}
              fill="var(--color-select)"
            />
          )}
          {wiringPreview && (
            <polyline
              points={wiringPreview.map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ')}
              fill="none"
              stroke="var(--color-select)"
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeLinejoin="round"
            />
          )}

          {ghostType && ghostAt && (
            <g opacity={0.5} pointerEvents="none">
              <PartView
                part={{ id: 'ghost', type: ghostType, label: '', x: ghostAt.x, y: ghostAt.y, rotation: ghostRotation, props: {} }}
                tone="selected"
                resistorStyle={settings.resistorStyle}
              />
            </g>
          )}

          {interaction.kind === 'rubber' && (
            <RubberBand box={boxFromPoints(interaction.start, interaction.current)} scale={view.scale} />
          )}
        </g>
      </svg>

      {doc.parts.length === 0 && doc.wires.length === 0 && tool.kind === 'select' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-muted">
          <p className="max-w-xs text-sm">
            <span className="hidden md:inline">{tr.canvas.empty}</span>
            <span className="md:hidden">{tr.canvas.emptyMobile}</span>
          </p>
        </div>
      )}

      {frame && <VoltageLegend vmax={frame.vmax} />}

      {interaction.kind === 'wiring' && (
        <div className="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-panel/95 py-1 pr-1 pl-3 text-xs shadow-md">
          <span className="text-muted">{tr.canvas.wiringActive}</span>
          <button
            type="button"
            onClick={() => setInteraction({ kind: 'idle' })}
            className="rounded-full bg-app px-3 py-1.5 font-medium hover:bg-line"
          >
            {tr.canvas.cancelWire}
          </button>
        </div>
      )}

      {touch && frame && !menu && interaction.kind === 'idle' && selection.parts.length === 1 && selection.wires.length === 0 && (() => {
        // Dokunmatikte üzerine gelme yok: seçili parçanın V/I/P bilgisi parçanın yanında gösterilir.
        const part = doc.parts.find((p) => p.id === selection.parts[0]);
        const m = part && frame.measurements.get(part.id);
        const readout = part && m ? partReadout(part, m, frame.statuses.get(part.id)) : null;
        if (!part || !readout) return null;
        const box = partBounds(part);
        const g = GRID * view.scale;
        return (
          <ReadoutBox
            readout={readout}
            x={(box.x + box.w) * g + view.x}
            y={(box.y + box.h) * g + view.y}
            area={size}
          />
        );
      })()}

      {frame &&
        frame.runtime
          .filter((d) => d.code === 'led-burned')
          .map((d) => {
            const id = d.elementIds[0]!;
            const part = doc.parts.find((p) => p.id === id);
            const dismissKey = `${id}:${d.params?.current ?? 0}`;
            if (!part || dismissedBalloons.has(dismissKey)) return null;
            const box = partBounds(part);
            const g = GRID * view.scale;
            const right = (box.x + box.w) * g + view.x;
            const left = box.x * g + view.x;
            // Dikey LED'in adı ve rengi sağında yazar; balon tercihen bu yazıların ötesinde açılır.
            // Sığmazsa LED'in hemen sağında, o da sığmazsa solunda açılır.
            const BALLOON = 282;
            const besideLabel = part.rotation % 180 === 0 ? 0 : 62 * view.scale;
            const labelSpace = right + besideLabel + BALLOON <= size.width ? besideLabel : 0;
            const flip = right + labelSpace + BALLOON > size.width;
            const { title, detail } = tr.diagnostics.describe(d, {
              label: (pid) => doc.parts.find((p) => p.id === pid)?.label ?? pid,
              type: (pid) => doc.parts.find((p) => p.id === pid)?.type,
            });
            return (
              <BurnBalloon
                key={dismissKey}
                title={title}
                detail={detail}
                x={flip ? left - 10 : right + labelSpace + 10}
                y={box.y * g + view.y - 6}
                flip={flip}
                onRepair={() => onRepair(id)}
                onClose={() => setDismissedBalloons((s) => new Set([...s, dismissKey]))}
              />
            );
          })}

      {frame && hover?.kind === 'part' && cursor && !menu && interaction.kind === 'idle' && (() => {
        const part = doc.parts.find((p) => p.id === hover.partId);
        const m = part && frame.measurements.get(part.id);
        const readout = part && m ? partReadout(part, m, frame.statuses.get(part.id)) : null;
        if (!readout) return null;
        return (
          <ReadoutBox
            readout={readout}
            x={cursor.x * GRID * view.scale + view.x}
            y={cursor.y * GRID * view.scale + view.y}
            area={size}
          />
        );
      })()}

      {menu && (() => {
        const part = doc.parts.find((p) => p.id === menu.partId);
        if (!part) return null;
        const items: MenuItem[] = [];
        if (part.type === 'led' && frame?.statuses.get(part.id)?.burned) {
          items.push({ label: tr.contextMenu.repair, onSelect: () => onRepair(part.id), tone: 'accent' });
        }
        items.push(
          { label: tr.contextMenu.properties, onSelect: () => onOpenProperties(part.id) },
          { label: tr.contextMenu.rotate, onSelect: () => onRotate([part.id]) },
          ...(CATALOG[part.type].polarized ? [{ label: tr.contextMenu.flip, onSelect: () => onFlip([part.id]) }] : []),
          {
            label: tr.contextMenu.remove,
            onSelect: () => commit(removeItems(doc, [part.id], []), EMPTY_SELECTION),
            tone: 'danger',
          },
        );
        return <ContextMenu x={menu.x} y={menu.y} items={items} area={size} onClose={() => setMenu(null)} />;
      })()}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-2 text-xs text-muted">
        <p className="hidden rounded bg-panel/85 px-2 py-1 shadow-sm md:block">{hint}</p>
        <p className="ml-auto rounded bg-panel/85 px-2 py-1 shadow-sm tabular">
          {cursor ? `x ${Math.round(cursor.x)} · y ${Math.round(cursor.y)} · ` : ''}
          {tr.status.zoom} %{Math.round(view.scale * 100)}
        </p>
      </div>
    </div>
  );
}

/** Akım noktaları aralığı (dünya pikseli). */
const DOT_SPACING = 16;

function dotLine(key: string, a: Point, b: Point, phase: number, width: number) {
  return (
    <line
      key={key}
      x1={a.x * GRID}
      y1={a.y * GRID}
      x2={b.x * GRID}
      y2={b.y * GRID}
      stroke={CURRENT_DOT_COLOR}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={`0 ${DOT_SPACING}`}
      // Desen, kaydırma arttıkça başa doğru gider; ileri hareket için kaydırma negatif.
      strokeDashoffset={-(phase % DOT_SPACING)}
    />
  );
}

/** Kablolarda ve iki uçlu bileşenlerde akımın yönünü ve büyüklüğünü gösteren hareketli noktalar. */
function CurrentDots({ doc, graph, frame }: { doc: CircuitDoc; graph: FlowGraph; frame: SimFrame }) {
  const lines = [];
  for (let i = 0; i < graph.segments.length; i++) {
    const current = frame.segmentFlows[i] ?? 0;
    if (Math.abs(current) < MIN_ANIMATED_CURRENT) continue;
    const segment = graph.segments[i]!;
    lines.push(dotLine(segment.key, segment.a, segment.b, frame.segmentPhases[i] ?? 0, 4));
  }
  for (const part of doc.parts) {
    const flow = frame.partFlows.get(part.id);
    if (!flow || Math.abs(flow.current) < MIN_ANIMATED_CURRENT) continue;
    const axis = partAxis(part);
    if (axis) lines.push(dotLine(`part-${part.id}`, axis[0], axis[1], flow.phase, 3.4));
  }
  return (
    <g pointerEvents="none" opacity={0.95}>
      {lines}
    </g>
  );
}

/** Kablo renklerinin açıklaması (köşede). */
function VoltageLegend({ vmax }: { vmax: number }) {
  const label = formatSI(vmax, 'V', { trim: true });
  return (
    // Telefonda örnek kartı üst kenarı kapladığı için açıklama sol altta durur.
    <div className="pointer-events-none absolute bottom-10 left-2 rounded-md border border-line bg-panel/90 px-2.5 py-1.5 text-[11px] shadow-sm md:top-2 md:right-2 md:bottom-auto md:left-auto">
      <p className="mb-1 font-medium text-muted">{tr.sim.legend}</p>
      <div className="h-2 w-36 rounded-full" style={{ background: VOLTAGE_GRADIENT }} />
      <div className="mt-0.5 flex w-36 justify-between tabular text-muted">
        <span>−{label}</span>
        <span>0 V</span>
        <span>+{label}</span>
      </div>
    </div>
  );
}

function RubberBand({ box, scale }: { box: Box; scale: number }) {
  return (
    <rect
      x={box.x * GRID}
      y={box.y * GRID}
      width={box.w * GRID}
      height={box.h * GRID}
      fill="var(--color-select)"
      fillOpacity={0.07}
      stroke="var(--color-select)"
      strokeWidth={1 / scale}
      strokeDasharray={`${4 / scale} ${3 / scale}`}
    />
  );
}

/** Belgedeki her şeyi kapsayan kutu (ızgara birimi). */
function docBounds(doc: CircuitDoc): Box | null {
  let box: Box | null = null;
  for (const part of doc.parts) {
    box = unionBox(box, partBounds(part));
    // Ölçü aleti ekranı da görünsün.
    if (part.type === 'voltmeter' || part.type === 'ammeter') box = unionBox(box, meterDisplayRect(part, false));
  }
  for (const wire of doc.wires) {
    for (const p of wire.points) box = unionBox(box, { x: p.x, y: p.y, w: 0, h: 0 });
  }
  if (!box) return null;
  // Etiketler ve ölçü aleti ekranları için pay
  return { x: box.x - 2, y: box.y - 4, w: box.w + 4, h: box.h + 6 };
}
