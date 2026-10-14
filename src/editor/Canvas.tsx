// Izgaralı SVG tuval: parça yerleştirme, kablo çekme, seçme, taşıma, döndürme, silme,
// yakınlaştırma ve kaydırma. Tüm fare/dokunma olayları SVG'nin kendisinde işlenir;
// hangi öğeye tıklandığı geometriyle (isabet testi) bulunur.

import {
  useEffect,
  useId,
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
import {
  CURRENT_DOT_COLOR,
  CURRENT_DOT_EDGE,
  UNKNOWN_WIRE_COLOR,
  UNKNOWN_WIRE_DASH,
  voltageColor,
  voltageGradient,
  type WireScale,
} from './colors';
import { BurnBalloon, ContextMenu, NoGroundBanner, type MenuItem } from './CanvasOverlays';
import { Icon } from './icons';
import type { MessageSeverity } from './messages';
import { meterDisplayRect, PartView, type PartTone } from './PartView';
import { routeAround } from './phoneTools';
import { meterText } from './readouts';
import { HintText } from './HintStrip';
import { SymbolIcon } from './symbols';
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
  /** Parçayı ekranın verilen noktasına (tuvalin içindeyse) ekler; tuvalin dışındaysa false. */
  placeAtClient(type: DeviceType, clientX: number, clientY: number): boolean;
}

/** Telefonda Bağla kipinde kablonun başlangıcı: bir uç ya da bir kablonun üzerindeki nokta (T). */
export interface ConnectStart {
  readonly point: Point;
  readonly partId: string | null;
  readonly pin: number | null;
}

/**
 * Telefon kipleri (tasarım: P00, P03, P05, N01): Kur'da dokunmak seçer, parçayı 150 ms basılı tutup
 * sürüklemek taşır, uca dokunmak Bağla kipini başlatır; Bağla'da uçlar büyük etiketli hedeflerdir ve iki
 * dokunuş kablo çizer; Ölç'te yapı kilitlidir (dokun: incele, sürükle: kaydır, anahtara dokun: aç/kapat).
 */
export interface PhoneCanvas {
  readonly mode: 'kur' | 'bagla' | 'olc';
  readonly connectStart: ConnectStart | null;
  readonly onConnectStart: (start: ConnectStart | null) => void;
  /** Kur kipinde bir uca dokunuldu: Bağla kipi o uçtan başlar. */
  readonly onStartConnect: (start: ConnectStart) => void;
  /** Bağla kipinden çık (boşluğa çift dokunuş). */
  readonly onExitConnect: () => void;
  /** Ölç kipinde bir parçaya dokunuldu (ölçümleri göster). */
  readonly onInspect: (partId: string) => void;
  /** Ölç kipinde parçayı basılı tutmak: "Düzenlemek için durdurulsun mu?" */
  readonly onEditAttempt: () => void;
  /** "Devre kilitli · dokun: incele" bilgisi gösterilsin mi. */
  readonly lockChip: boolean;
  readonly onLockChipClose: () => void;
  /** Tuval, tam boy alt sayfanın üstünde ince bir şerit: bilgi katmanları gizlenir. */
  readonly strip?: boolean;
}

/** Tuvalin altındaki ipucu şeridinin gösterdiği durum. */
export type CanvasHint =
  | { readonly kind: 'empty' }
  | { readonly kind: 'select' }
  | { readonly kind: 'selected'; readonly count: number }
  | { readonly kind: 'place'; readonly type: DeviceType }
  | { readonly kind: 'wireTool' }
  | { readonly kind: 'wiring' }
  | { readonly kind: 'simulating' };

/** Tuvalin dışarıya bildirdiği durum: ipucu ve yakınlık (üst çubuktaki yüzde). */
export interface CanvasStatus {
  readonly hint: CanvasHint;
  readonly scale: number;
}

/**
 * Tuvaldeki vurgu: mesaj panelinde seçilen hata/uyarı (parçalar ve kablolar) ya da cihaz rafındaki bir
 * jaka tıklanınca o ucun ve kablolarının kısa süre yanıp sönmesi ('info').
 */
export interface Highlight {
  readonly parts: ReadonlySet<string>;
  readonly wires: ReadonlySet<string>;
  readonly severity: 'error' | 'warning' | 'info';
  /** Yanıp sönen uçlar (ızgara koordinatı). */
  readonly pins?: readonly Point[];
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
  /** Tuval küçülünce (alt sayfa açılınca) görünür tutulacak parçalar (seçili parça). */
  readonly keepVisible?: readonly string[];
  /** Telefon düzeni; masaüstünde ve tablette null. */
  readonly phone?: PhoneCanvas | null;
  /** Tuvalin üstünde kaydırılabilir bir katman açık (çekmece, pencere): tuval dokunmayı tutmasın. */
  readonly overlayOpen: boolean;
  /** İpucu ya da yakınlık değişince çağrılır. */
  readonly onStatusChange?: (status: CanvasStatus) => void;
  /** Bir parça yerleştirildi (kütüphanenin "Son" listesi için). */
  readonly onPartPlaced?: (type: DeviceType) => void;
  /** Boş tuvaldeki "Örneklerden başla" düğmesi. */
  readonly onExamples?: () => void;
  /** Hata ya da uyarısı olan parçalar: çerçeve ve köşede rozet (M07a, M07b). */
  readonly issues?: ReadonlyMap<string, MessageSeverity>;
  /** Uyarısı olan uçlar (boşta uç): büyütülmüş halka. */
  readonly issuePins?: readonly Point[];
  /** Toprak tuzağında topraklı cihazların COM uçları: aralarında şebeke toprağı çizgisi (M06b). */
  readonly earthLine?: readonly Point[] | null;
  /** "Devrede toprak yok": afiş ve önerilen toprak yeri (M07b). Telefonda afiş yerine alt sayfa. */
  readonly noGround?: {
    readonly banner: boolean;
    readonly point: Point | null;
    readonly text: string;
    readonly fixLabel: string | null;
    readonly onFix: () => void;
    readonly onDismiss: () => void;
  } | null;
  /** Yanan LED balonundaki "Neden?": Mesajlar sekmesinde açıklama. */
  readonly onExplain?: (partId: string) => void;
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
      /** Telefon: parmak indi, henüz dokunuş mu sürükleme mi belli değil. */
      readonly kind: 'press';
      readonly pointerId: number;
      readonly sx: number;
      readonly sy: number;
      readonly view: View;
      readonly hit: Hit | null;
      readonly g: Point;
    }
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

/** Telefonda seçicideki seçenekler (tasarım: P15). */
type PickOption =
  | { readonly kind: 'part'; readonly partId: string }
  | { readonly kind: 'pin'; readonly partId: string; readonly index: number; readonly pos: Point }
  | { readonly kind: 'wire'; readonly wireId: string };

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
/** Telefon: parça bu kadar basılı tutulunca sürüklenir; daha önce kayarsa tuval kaydırılır (N01). */
const PHONE_HOLD_MS = 150;
/** Telefon, Bağla kipi: uç hedeflerinin yarıçapı (44 pt hedef) ve bağlı uçlarınki. */
const CONNECT_TARGET_PX = 22;
const CONNECT_TARGET_SMALL_PX = 15;
/** Telefon: büyüteç çapı ve büyütmesi. */
const MAGNIFIER_PX = 140;
const MAGNIFY = 2.6;

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
  keepVisible,
  phone = null,
  overlayOpen,
  onStatusChange,
  onPartPlaced,
  onExamples,
  issues,
  issuePins,
  earthLine,
  noGround,
  onExplain,
  ref,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const sceneId = `scene-${useId().replace(/:/g, '')}`;
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
  /** Telefon: kalabalık bir noktaya dokununca "Burada N öğe var" seçicisi; büyüteç (basılı tutunca da). */
  const [picker, setPicker] = useState<{ x: number; y: number; options: readonly PickOption[] } | null>(null);
  const [magnifier, setMagnifier] = useState<{ x: number; y: number; g: Point } | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const phoneTimers = useRef({ hold: 0, long: 0 });
  const phoneLongFired = useRef(false);
  const lastEmptyTap = useRef(0);
  const clearPhoneTimers = () => {
    window.clearTimeout(phoneTimers.current.hold);
    window.clearTimeout(phoneTimers.current.long);
  };
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

  // Görünüm devreye sığdırıldıktan sonra kullanıcı yakınlaştırmadı ya da kaydırmadı mı? Tuvalin boyutu
  // değişince (raf, panel, pencere) böyleyse devre kalan alana yeniden sığdırılır; değilse yalnızca
  // görünümün merkezi korunur (N02 → yeniden sığdırma kuralları).
  const fittedRef = useRef(true);
  const previousSize = useRef(size);
  useEffect(() => {
    const previous = previousSize.current;
    previousSize.current = size;
    if (!viewInitialized.current || previous.width === 0 || size.width === 0) return;
    if (previous.width === size.width && previous.height === size.height) return;
    if (fittedRef.current && docBounds(doc)) {
      fit();
      return;
    }
    // Merkez korunur; seçili parça (alt sayfanın arkasında kalmasın diye) görünür alana alınır.
    let keep: Box | null = null;
    for (const part of doc.parts) if (keepVisible?.includes(part.id)) keep = unionBox(keep, partBounds(part));
    setView((v) => keepInside({ ...v, x: v.x + (size.width - previous.width) / 2, y: v.y + (size.height - previous.height) / 2 }, keep, size));
  }, [size]);

  useEffect(() => {
    if (viewInitialized.current || size.width === 0) return;
    viewInitialized.current = true;
    if (docBounds(doc)) fit();
    else setView({ x: size.width / 2, y: size.height / 2, scale: size.width < 640 ? 1.1 : 1.5 });
  }, [size, doc]);

  const fit = () => {
    fittedRef.current = true;
    const bounds = docBounds(doc);
    if (!bounds) {
      setView((v) => ({ ...v, x: size.width / 2, y: size.height / 2 }));
      return;
    }
    // Telefonda üstteki bilgi kartı (Bağla) ya da kilit bilgisi (Ölç) devrenin üstüne binmesin; kısa
    // tuvalde kenar payı da küçük.
    const top =
      phone && (phone.mode === 'bagla' || (phone.mode === 'olc' && phone.lockChip))
        ? Math.min(phone.mode === 'bagla' ? 84 : 48, size.height / 4)
        : 0;
    const fitted = fitView(bounds, Math.max(1, size.width), Math.max(1, size.height - top), phone ? 20 : 48);
    setView({ ...fitted, y: fitted.y + top });
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
    fittedRef.current = false;
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

  // Yeni seçilen parça (eklenen, listeden seçilen) ekranın dışındaysa görünüm ona kayar.
  const keepKey = keepVisible?.join(',') ?? '';
  useEffect(() => {
    if (keepVisible && keepVisible.length > 0 && size.width > 0) reveal(keepVisible, []);
  }, [keepKey]);

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

  const placeAtClient = (type: DeviceType, clientX: number, clientY: number): boolean => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
    placePart(type, snap(screenToGrid(view, clientX - rect.left, clientY - rect.top)), 0);
    return true;
  };

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      fittedRef.current = false;
      setView((v) => zoomAt(v, size.width / 2, size.height / 2, ZOOM_STEP));
    },
    zoomOut: () => {
      fittedRef.current = false;
      setView((v) => zoomAt(v, size.width / 2, size.height / 2, 1 / ZOOM_STEP));
    },
    fit,
    reveal,
    addPartAtCenter,
    placeAtClient,
  }));

  // --- Fare tekerleği ile yakınlaştırma (pasif olmayan dinleyici gerekir) ---------------
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      fittedRef.current = false;
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
    onPartPlaced?.(type);
  };

  // --- Telefon: dokunuşlar ------------------------------------------------------------
  /** Bağla kipinde dokunulan hedef: en yakın uç (44 pt), yoksa kablonun üzerindeki nokta (T). */
  const connectTarget = (local: { x: number; y: number }, g: Point): ConnectStart | null => {
    let best: ConnectStart | null = null;
    let bestDist = CONNECT_TARGET_PX;
    for (const part of doc.parts) {
      pinPositions(part).forEach((pos, index) => {
        const d = Math.hypot(pos.x * GRID * view.scale + view.x - local.x, pos.y * GRID * view.scale + view.y - local.y);
        if (d <= bestDist) {
          bestDist = d;
          best = { point: pos, partId: part.id, pin: index };
        }
      });
    }
    if (best) return best;
    const hit = hitTest(g, { pins: false, parts: false });
    if (hit?.kind !== 'wire') return null;
    const wire = doc.wires.find((w) => w.id === hit.wireId)!;
    return { point: snapToSegment(g, wire.points[hit.segment]!, wire.points[hit.segment + 1]!), partId: null, pin: null };
  };

  /**
   * Kalabalık nokta: parmağın altında birden çok "sahip" (parça ya da bir parçaya bağlı olmayan kablo)
   * varsa seçici açılır. Bir uca bağlanan kablo o parçayla aynı sahip sayılır.
   */
  const crowdOptions = (g: Point): PickOption[] => {
    if (!phone || phone.mode === 'bagla') return [];
    const pad = pxToGrid(6);
    const parts = doc.parts.filter((p) => {
      const b = partBounds(p);
      return boxContains({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad }, g);
    });
    // Her parçanın yalnızca parmağa en yakın ucu seçenek olur.
    const pins: PickOption[] = [];
    if (phone.mode === 'kur') {
      for (const part of doc.parts) {
        let best: { index: number; pos: Point; d: number } | null = null;
        pinPositions(part).forEach((pos, index) => {
          const d = Math.hypot(pos.x - g.x, pos.y - g.y);
          if (d <= pxToGrid(14) && (!best || d < best.d)) best = { index, pos, d };
        });
        const found = best as { index: number; pos: Point; d: number } | null;
        if (found) pins.push({ kind: 'pin', partId: part.id, index: found.index, pos: found.pos });
      }
    }
    const owners = new Set<string>([...parts.map((p) => p.id), ...pins.map((p) => (p.kind === 'pin' ? p.partId : ''))]);
    const ownerPins = doc.parts.filter((p) => owners.has(p.id)).flatMap((p) => pinPositions(p));
    const wires: PickOption[] = [];
    for (const wire of doc.wires) {
      const near = wire.points.some((pt, i) => i > 0 && distanceToSegment(g, wire.points[i - 1]!, pt) <= pxToGrid(10));
      if (!near) continue;
      wires.push({ kind: 'wire', wireId: wire.id });
      const ends = [wire.points[0]!, wire.points[wire.points.length - 1]!];
      if (!ends.some((end) => ownerPins.some((pin) => samePoint(pin, end)))) owners.add(`w:${wire.id}`);
    }
    if (owners.size < 2) return [];
    return [...parts.map((p): PickOption => ({ kind: 'part', partId: p.id })), ...pins, ...wires].slice(0, 5);
  };

  const choose = (option: PickOption) => {
    setPicker(null);
    if (!phone) return;
    if (option.kind === 'pin') {
      phone.onStartConnect({ point: option.pos, partId: option.partId, pin: option.index });
    } else if (option.kind === 'part') {
      dispatch({ type: 'select', selection: { parts: [option.partId], wires: [] } });
      if (phone.mode === 'olc') phone.onInspect(option.partId);
    } else {
      dispatch({ type: 'select', selection: { parts: [], wires: [option.wireId] } });
    }
  };

  const phoneTap = (hit: Hit | null, g: Point, local: { x: number; y: number }) => {
    if (!phone) return;
    if (phone.mode === 'bagla') {
      const target = connectTarget(local, g);
      if (!target) {
        // Boşluğa çift dokunuş: Bağla kipinden çık.
        const now = performance.now();
        if (now - lastEmptyTap.current < DOUBLE_TAP_MS) {
          lastEmptyTap.current = 0;
          phone.onExitConnect();
        } else {
          lastEmptyTap.current = now;
        }
        return;
      }
      const start = phone.connectStart;
      if (!start) {
        phone.onConnectStart(target);
        return;
      }
      if (samePoint(start.point, target.point)) {
        phone.onConnectStart(null);
        return;
      }
      const result = addWire(doc, [start.point, ...routeAround(doc, start.point, target.point)]);
      if (result.id) commit(result.doc, EMPTY_SELECTION);
      phone.onConnectStart(null);
      return;
    }
    const crowd = crowdOptions(g);
    if (crowd.length > 1) {
      setPicker({ x: local.x, y: local.y, options: crowd });
      setMagnifier({ x: local.x, y: local.y, g });
      return;
    }
    if (hit?.kind === 'part') {
      const part = doc.parts.find((p) => p.id === hit.partId);
      if (phone.mode === 'olc' && part?.type === 'switch') {
        commit(updatePart(doc, part.id, { props: { ...part.props, closed: !boolProp(part.props, 'closed', false) } }));
        return;
      }
      if (!selection.parts.includes(hit.partId) || selection.parts.length > 1 || selection.wires.length > 0) {
        dispatch({ type: 'select', selection: { parts: [hit.partId], wires: [] } });
      }
      if (phone.mode === 'olc') {
        phone.onInspect(hit.partId);
        return;
      }
      // Kur: çift dokunuş değer sayfasını yarım açar.
      const now = performance.now();
      const previous = lastTap.current;
      if (previous && previous.partId === hit.partId && now - previous.time < DOUBLE_TAP_MS) {
        lastTap.current = null;
        onOpenProperties(hit.partId);
      } else {
        lastTap.current = { partId: hit.partId, time: now };
      }
      return;
    }
    if (hit?.kind === 'pin' && phone.mode === 'kur') {
      phone.onStartConnect({ point: hit.pos, partId: hit.partId, pin: hit.index });
      return;
    }
    if (hit?.kind === 'wire') {
      dispatch({ type: 'select', selection: { parts: [], wires: [hit.wireId] } });
      return;
    }
    setMenu(null);
    if (selection.parts.length > 0 || selection.wires.length > 0) dispatch({ type: 'select', selection: EMPTY_SELECTION });
  };

  const phonePointerDown = (e: ReactPointerEvent<SVGSVGElement>, mode: PhoneCanvas['mode']) => {
    const g = toGrid(e.clientX, e.clientY);
    const local = localPoint(e.clientX, e.clientY);
    setPicker(null);
    setMagnifier(null);
    if (menu) setMenu(null);
    phoneLongFired.current = false;
    clearPhoneTimers();
    const hit = mode === 'bagla' ? null : hitTest(g, mode === 'olc' ? { pins: false } : undefined);
    capture(e.pointerId);
    const pointerId = e.pointerId;
    setInteraction({ kind: 'press', pointerId, sx: local.x, sy: local.y, view, hit, g });
    if (mode === 'kur' && (hit?.kind === 'part' || hit?.kind === 'wire')) {
      // 150 ms kıpırdamadan basılı tutulursa sürükleme başlar (öncesinde kayarsa tuval kayar).
      phoneTimers.current.hold = window.setTimeout(() => {
        const state = interactionRef.current;
        if (state.kind !== 'press' || state.pointerId !== pointerId) return;
        navigator.vibrate?.(10);
        if (hit.kind === 'part') {
          const sel = selection.parts.includes(hit.partId) ? selection : { parts: [hit.partId], wires: [] };
          if (sel !== selection) dispatch({ type: 'select', selection: sel });
          setInteraction({
            kind: 'drag-parts',
            pointerId,
            tapPartId: hit.partId,
            start: g,
            before: doc,
            parts: new Set(sel.parts),
            wires: new Set(sel.wires),
            delta: { x: 0, y: 0 },
          });
        } else {
          dispatch({ type: 'select', selection: { parts: [], wires: [hit.wireId] } });
          setInteraction({ kind: 'drag-segment', pointerId, start: g, before: doc, wireId: hit.wireId, segment: hit.segment, delta: { x: 0, y: 0 } });
        }
      }, PHONE_HOLD_MS);
    }
    if (hit?.kind === 'part' && mode !== 'bagla') {
      phoneTimers.current.long = window.setTimeout(() => {
        const state = interactionRef.current;
        const still =
          (state.kind === 'press' && state.pointerId === pointerId) ||
          (state.kind === 'drag-parts' && state.pointerId === pointerId && state.delta.x === 0 && state.delta.y === 0);
        if (!still) return;
        phoneLongFired.current = true;
        if (mode === 'olc') {
          setInteraction({ kind: 'idle' });
          phone?.onEditAttempt();
          return;
        }
        // Kur: bağlam menüsü ve büyüteç (parmak kıpırdarsa menü kapanır, sürükleme sürer).
        if (!selection.parts.includes(hit.partId)) dispatch({ type: 'select', selection: { parts: [hit.partId], wires: [] } });
        menuFromLongPress.current = true;
        setMenu({ partId: hit.partId, x: local.x, y: local.y });
        setMagnifier({ x: local.x, y: local.y, g });
      }, LONG_PRESS_MS);
    }
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
      } else if (stale.kind === 'pinch' || stale.kind === 'pan' || stale.kind === 'rubber' || stale.kind === 'press') {
        pinchRef.current = null;
        setInteraction({ kind: 'idle' });
      }
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const current = interactionRef.current;

    // İki parmak: kıstırarak yakınlaştırma
    if (pointers.current.size === 2) {
      cancelLongPress();
      clearPhoneTimers();
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      if (current.kind === 'drag-parts' || current.kind === 'drag-segment') dispatch({ type: 'end-preview', before: current.before });
      const center = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), view, cx: center.x, cy: center.y };
      setInteraction({ kind: 'pinch' });
      return;
    }
    if (pointers.current.size > 2) return;

    if (phone && e.button === 0) {
      phonePointerDown(e, phone.mode);
      return;
    }

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
      fittedRef.current = false;
      setView({
        scale,
        x: center.x - (start.cx - start.view.x) * k,
        y: center.y - (start.cy - start.view.y) * k,
      });
      return;
    }

    const g = toGrid(e.clientX, e.clientY);
    setCursor(g);

    if (current.kind === 'press' && current.pointerId === e.pointerId) {
      // Telefon: parmak kaydı (dokunuş değil): tuval kaydırılır.
      const local = localPoint(e.clientX, e.clientY);
      if (Math.hypot(local.x - current.sx, local.y - current.sy) <= DRAG_THRESHOLD_PX * 1.6) return;
      clearPhoneTimers();
      fittedRef.current = false;
      setInteraction({ kind: 'pan', pointerId: e.pointerId, sx: current.sx, sy: current.sy, view: current.view });
      setView({ ...current.view, x: current.view.x + local.x - current.sx, y: current.view.y + local.y - current.sy });
      return;
    }

    switch (current.kind) {
      case 'pan': {
        const local = localPoint(e.clientX, e.clientY);
        fittedRef.current = false;
        setView({ ...current.view, x: current.view.x + local.x - current.sx, y: current.view.y + local.y - current.sy });
        return;
      }
      case 'drag-parts': {
        const delta = { x: Math.round(g.x - current.start.x), y: Math.round(g.y - current.start.y) };
        if (samePoint(delta, current.delta)) return;
        if (menuFromLongPress.current) {
          menuFromLongPress.current = false;
          setMenu(null);
          setMagnifier(null);
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
    if (!phone && (current.kind === 'wiring' || tool.kind !== 'place')) {
      const hit = hitTest(g, current.kind === 'wiring' ? { parts: false } : undefined);
      setHover(hit);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const current = interactionRef.current;
    const longPressFired = longPress.current?.fired ?? false;
    cancelLongPress();
    if (phone && e.type === 'pointerup') {
      // Telefon: kıpırdamadan kalkan parmak bir dokunuştur (150 ms'den sonra da, taşınmadıysa).
      const tap =
        (current.kind === 'press' && current.pointerId === e.pointerId) ||
        ((current.kind === 'drag-parts' || current.kind === 'drag-segment') && current.pointerId === e.pointerId && current.delta.x === 0 && current.delta.y === 0);
      if (tap) {
        clearPhoneTimers();
        setInteraction({ kind: 'idle' });
        menuFromLongPress.current = false;
        if (phoneLongFired.current) return;
        const local = localPoint(e.clientX, e.clientY);
        const g = toGrid(e.clientX, e.clientY);
        phoneTap(current.kind === 'press' ? current.hit : hitTest(g), g, local);
        return;
      }
      clearPhoneTimers();
      if (current.kind === 'drag-parts') menuFromLongPress.current = false;
    } else if (phone && current.kind === 'press') {
      clearPhoneTimers();
      setInteraction({ kind: 'idle' });
      return;
    }
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
    if (phone) return;
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

  const selectedCount = selection.parts.length + selection.wires.length;
  // Telefonda uzaklaşınca (%100'ün altında) değerler ve uç halkaları gizlenir; seçili parçada görünür.
  const lod = phone !== null && view.scale < 1;
  const bagla = phone?.mode === 'bagla';
  const hint: CanvasHint =
    simActive && tool.kind === 'select' && interaction.kind === 'idle'
      ? { kind: 'simulating' }
      : interaction.kind === 'wiring'
        ? { kind: 'wiring' }
        : tool.kind === 'place'
          ? { kind: 'place', type: tool.type }
          : tool.kind === 'wire'
            ? { kind: 'wireTool' }
            : selectedCount > 0
              ? { kind: 'selected', count: selectedCount }
              : doc.parts.length === 0 && doc.wires.length === 0
                ? { kind: 'empty' }
                : { kind: 'select' };
  const hintKey = JSON.stringify(hint);
  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;
  useEffect(() => {
    statusRef.current?.({ hint: JSON.parse(hintKey) as CanvasHint, scale: view.scale });
  }, [hintKey, view.scale]);

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
    highlight && highlight.severity !== 'info' && highlight.parts.has(id)
      ? highlight.severity
      : selectedParts.has(id)
        ? 'selected'
        : hover?.kind === 'part' && hover.partId === id
          ? 'hover'
          : (issues?.get(id) ?? 'normal');

  // Şebeke toprağı çizgisi: COM uçlarından devrenin altına inip birleşen kesikli yeşil çizgi.
  const earthPath = (() => {
    if (!earthLine || earthLine.length < 2) return null;
    let bottom = -Infinity;
    for (const part of doc.parts) {
      const b = partBounds(part);
      bottom = Math.max(bottom, b.y + b.h);
    }
    for (const p of earthLine) bottom = Math.max(bottom, p.y);
    const yb = (bottom + 3) * GRID;
    const xs = earthLine.map((p) => p.x * GRID);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const d = [...earthLine.map((p) => `M${p.x * GRID} ${p.y * GRID}V${yb}`), `M${left} ${yb}H${right}`].join('');
    return { d, yb, mid: (left + right) / 2 };
  })();

  return (
    <div className="absolute inset-0 overflow-hidden bg-paper">
      <svg
        ref={svgRef}
        className={`schematic block h-full w-full ${cursorClass}`}
        // iOS/WebKit, touch-action: none bölgesini üstüne binen katmanlara da uygulayabiliyor; o zaman
        // tuvalin üstündeki çekmece ya da pencere parmakla kaydırılamıyor. Katman açıkken kapatılır.
        style={overlayOpen ? { touchAction: 'auto' } : undefined}
        role="img"
        aria-label={phone?.mode === 'bagla' ? tr.phone.connectCanvas : phone?.mode === 'olc' ? tr.phone.olcCanvas : tr.canvas.label}
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
          <g id={sceneId}>
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
                  stroke={
                    highlight.severity === 'error'
                      ? 'var(--color-danger)'
                      : highlight.severity === 'info'
                        ? 'var(--color-accent)'
                        : '#e8a317'
                  }
                  className={highlight.severity === 'info' ? 'alarm-blink' : undefined}
                  strokeOpacity={0.35}
                  strokeWidth={10}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
          {highlight?.pins?.map((p) => (
            <circle
              key={`hp${p.x},${p.y}`}
              cx={p.x * GRID}
              cy={p.y * GRID}
              r={9}
              fill="var(--color-accent)"
              fillOpacity={0.35}
              stroke="var(--color-accent)"
              strokeWidth={2}
              className="alarm-blink"
            />
          ))}
          {doc.wires.map((wire) => {
            const selected = selectedWires.has(wire.id);
            const hovered = hover?.kind === 'wire' && hover.wireId === wire.id;
            let stroke = selected ? 'var(--color-select)' : hovered ? '#3d63b8' : 'var(--color-symbol)';
            let dash: string | undefined;
            if (frame && !selected) {
              const v = frame.wireVoltages.get(wire.id);
              stroke = v === undefined ? UNKNOWN_WIRE_COLOR : voltageColor(v / frame.vmax, settings.wireScale);
              if (v === undefined) dash = UNKNOWN_WIRE_DASH;
            }
            return (
              <polyline
                key={wire.id}
                points={wire.points.map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ')}
                fill="none"
                stroke={stroke}
                strokeWidth={selected || frame ? 3 : 2}
                strokeDasharray={dash}
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

          {earthPath && (
            <g pointerEvents="none" aria-hidden="true">
              <path d={earthPath.d} fill="none" stroke="var(--color-earth)" strokeWidth={1.5} strokeDasharray="4 3" />
              <path
                d={`M${earthPath.mid} ${earthPath.yb}v4M${earthPath.mid - 6} ${earthPath.yb + 4}h12M${earthPath.mid - 3.5} ${earthPath.yb + 7.5}h7M${earthPath.mid - 1.5} ${earthPath.yb + 11}h3`}
                fill="none"
                stroke="var(--color-earth)"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
              <rect x={earthPath.mid + 14} y={earthPath.yb - 7} width={118} height={14} rx={7} fill="var(--color-ok-soft)" />
              <text x={earthPath.mid + 73} y={earthPath.yb + 3.5} textAnchor="middle" fontSize={8.5} fontWeight={500} fill="var(--color-ok-ink)">
                {tr.earthLine}
              </text>
            </g>
          )}
          {noGround?.point && (
            <g pointerEvents="none" aria-hidden="true" opacity={0.85}>
              <path
                d={`M${noGround.point.x * GRID} ${noGround.point.y * GRID}v18m-12 0h24m-20 6h16m-11 6h6`}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={2}
                strokeDasharray="3 3"
                strokeLinecap="round"
              />
              <rect x={noGround.point.x * GRID + 14} y={noGround.point.y * GRID + 12} width={58} height={14} rx={7} fill="var(--color-accent-soft)" />
              <text x={noGround.point.x * GRID + 43} y={noGround.point.y * GRID + 22} textAnchor="middle" fontSize={8.5} fontWeight={500} fill="var(--color-accent-ink)">
                {tr.noGround.suggested}
              </text>
            </g>
          )}
          {/* Bağla kipinde parçalar soluklaşır, uçlar öne çıkar (P03). */}
          <g opacity={bagla ? 0.38 : 1}>
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
                hideValue={lod && !selectedParts.has(part.id)}
                {...(live ? { live } : {})}
              />
            );
          })}
          </g>

          {frame && <CurrentDots doc={doc} graph={flowGraph} frame={frame} />}

          {doc.parts.map((part) =>
            pinPositions(part).map((pos, i) =>
              connectivity.unconnectedPins.has(pinKey(part.id, i)) && !bagla && (!lod || selectedParts.has(part.id)) ? (
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

          {issuePins?.map((p) => (
            <circle
              key={`ip${p.x},${p.y}`}
              cx={p.x * GRID}
              cy={p.y * GRID}
              r={7}
              fill="var(--color-panel)"
              stroke="var(--color-pin)"
              strokeWidth={2.5}
              pointerEvents="none"
            />
          ))}
          {/* Hata ve uyarı rozetleri: renk + biçim (dolu daire / üçgen). */}
          {issues &&
            doc.parts.map((part) => {
              const severity = issues.get(part.id);
              if (!severity) return null;
              const b = partBounds(part);
              const x = (b.x + b.w) * GRID + 4;
              const y = b.y * GRID - 4;
              return severity === 'error' ? (
                <g key={`ib${part.id}`} pointerEvents="none" aria-hidden="true">
                  <circle cx={x} cy={y} r={7} fill="var(--color-danger)" />
                  <path d={`M${x} ${y - 3.5}v4`} stroke="white" strokeWidth={1.8} strokeLinecap="round" />
                  <circle cx={x} cy={y + 3.6} r={0.9} fill="white" />
                </g>
              ) : (
                <g key={`ib${part.id}`} pointerEvents="none" aria-hidden="true">
                  <path d={`M${x} ${y - 8}l9 15H${x - 9}z`} fill="var(--color-paused)" stroke="var(--color-warn)" strokeWidth={1} strokeLinejoin="round" />
                  <path d={`M${x} ${y - 3}v4.5`} stroke="var(--color-ink)" strokeWidth={1.6} strokeLinecap="round" />
                  <circle cx={x} cy={y + 4} r={1} fill="var(--color-ink)" />
                </g>
              );
            })}
          {/* Mesajdan vurgu: 3 s parlayan çerçeve, sonra PartView'un çerçevesi kalır. */}
          {highlight && highlight.severity !== 'info' && (
            <g key={`glow-${[...highlight.parts].join(',')}`} className="hl-glow" pointerEvents="none" aria-hidden="true">
              {doc.parts
                .filter((p) => highlight.parts.has(p.id))
                .map((p) => {
                  const b = partBounds(p);
                  return (
                    <rect
                      key={p.id}
                      x={b.x * GRID - 9}
                      y={b.y * GRID - 9}
                      width={b.w * GRID + 18}
                      height={b.h * GRID + 18}
                      rx={6}
                      fill={highlight.severity === 'error' ? 'var(--color-danger)' : 'var(--color-warn)'}
                      fillOpacity={0.08}
                      stroke={highlight.severity === 'error' ? 'var(--color-danger)' : 'var(--color-warn)'}
                      strokeWidth={3}
                      strokeOpacity={0.35}
                    />
                  );
                })}
            </g>
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
        </g>
      </svg>

      {bagla && phone && <ConnectTargets doc={doc} connectivity={connectivity} view={view} size={size} start={phone.connectStart} />}

      {doc.parts.length === 0 && doc.wires.length === 0 && tool.kind === 'select' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-muted">
          <svg width="64" height="40" viewBox="0 0 64 40" aria-hidden="true">
            <path
              d="M4 20H20L23 13L29 27L35 13L41 27L44 20H60"
              fill="none"
              stroke="var(--color-line-2)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="max-w-xs text-[15px]">
            {phone ? <HintText text={tr.canvas.emptyMobile} /> : tr.canvas.empty}
          </p>
          {onExamples && (
            <button
              type="button"
              onClick={onExamples}
              className={`pointer-events-auto rounded-md border border-line-2 bg-panel px-3.5 text-sm font-medium text-ink hover:bg-panel-2 ${phone ? 'h-11' : 'h-9'}`}
            >
              {tr.canvas.emptyAction}
            </button>
          )}
        </div>
      )}

      {frame &&
        !phone?.strip &&
        (phone && !legendOpen ? (
          <button
            type="button"
            onClick={() => setLegendOpen(true)}
            aria-label={tr.phone.legendButton}
            aria-expanded={false}
            className="absolute bottom-3 left-3 flex h-11 items-center gap-2 rounded-full border border-line bg-panel/95 px-3 text-[13px] font-medium shadow-sm"
          >
            <i className="block h-2 w-14 rounded-full" style={{ background: voltageGradient(settings.wireScale) }} aria-hidden="true" />
            <span className="font-mono text-label">±{formatSI(frame.vmax, 'V', { trim: true })}</span>
          </button>
        ) : (
          <VoltageLegend
            vmax={frame.vmax}
            scale={settings.wireScale}
            electronFlow={settings.electronFlow}
            rms={doc.parts.some((p) => p.type === 'acsource' || p.type === 'funcgen')}
            onClose={phone ? () => setLegendOpen(false) : undefined}
          />
        ))}

      {phone?.mode === 'olc' && phone.lockChip && !phone.strip && (
        <div role="status" className="absolute top-3.5 left-3 flex items-center gap-2 rounded-full border border-ok-line bg-panel py-1 pr-1 pl-2.5 text-[13px] text-ok-ink shadow-sm">
          <Icon name="lock" className="h-4 w-4" />
          <span>{tr.phone.lock}</span>
          <button
            type="button"
            onClick={phone.onLockChipClose}
            aria-label={tr.phone.lockClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ok-soft text-ok-ink"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {bagla && phone && (
        <>
          <div role="status" className="absolute inset-x-3 top-3 flex items-start gap-2.5 rounded-xl border border-accent-line bg-panel px-3 py-2.5 text-[13.5px] leading-[1.45] shadow-sm">
            <Icon name="wire" className="mt-px h-5 w-5 shrink-0 text-accent-ink" />
            <span>
              <HintText text={connectCardText(phone.connectStart, doc)} />
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-[10px] border border-line bg-panel/90 px-2.5 py-1.5 text-label text-ink-2" aria-hidden="true">
            <span className="flex items-center gap-1.5">
              <i className="block h-3 w-3 rounded-full bg-accent" />
              {tr.phone.legendStart}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="block h-3 w-3 rounded-full border-2 border-accent" />
              {tr.phone.legendFree}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="block h-3 w-3 rounded-full border-2 border-[#9fb8e6]" />
              {tr.phone.legendConnected}
            </span>
          </div>
        </>
      )}

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

      {frame &&
        !phone?.strip &&
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
            const title = tr.balloon.burnTitle(part.label);
            const detail = tr.balloon.burnDetail(
              formatSI(d.params?.current ?? 0, 'A', { digits: 3 }),
              formatSI(d.params?.maxCurrent ?? 0, 'A', { trim: true }),
            );
            return (
              <BurnBalloon
                key={dismissKey}
                id={id}
                title={title}
                detail={detail}
                onWhy={onExplain ? () => onExplain(id) : undefined}
                x={flip ? left - 10 : right + labelSpace + 10}
                y={box.y * g + view.y - 6}
                flip={flip}
                onRepair={() => onRepair(id)}
                onClose={() => setDismissedBalloons((s) => new Set([...s, dismissKey]))}
              />
            );
          })}

      {menu && (() => {
        const part = doc.parts.find((p) => p.id === menu.partId);
        if (!part) return null;
        const burned = part.type === 'led' && frame?.statuses.get(part.id)?.burned === true;
        const items: MenuItem[] = [
          { label: phone ? tr.phone.value : tr.contextMenu.properties, onSelect: () => onOpenProperties(part.id) },
          { label: tr.contextMenu.rotate, shortcut: 'R', onSelect: () => onRotate([part.id]) },
          ...(CATALOG[part.type].polarized ? [{ label: tr.contextMenu.flip, shortcut: 'F', onSelect: () => onFlip([part.id]) }] : []),
          ...(burned ? [{ label: tr.contextMenu.repair, onSelect: () => onRepair(part.id), tone: 'accent' as const, separatorBefore: true }] : []),
          {
            label: tr.contextMenu.remove,
            shortcut: 'Delete',
            onSelect: () => commit(removeItems(doc, [part.id], []), EMPTY_SELECTION),
            tone: 'danger',
            separatorBefore: !burned,
          },
        ];
        return (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={items}
            area={size}
            label={tr.contextMenu.menu(part.label)}
            onClose={() => {
              setMenu(null);
              setMagnifier(null);
            }}
          />
        );
      })()}

      {noGround?.banner && (
        <NoGroundBanner text={noGround.text} fixLabel={noGround.fixLabel} onFix={noGround.onFix} onDismiss={noGround.onDismiss} />
      )}

      {/* Telefon: uzaklaşınca değerler gizlenir; masaüstünde yakınlık üst çubukta. */}
      {lod && !bagla && !phone?.strip && (
        <p
          className={`pointer-events-none absolute right-2.5 rounded-md bg-panel/90 px-1.5 py-0.5 font-mono text-label font-medium text-muted tabular ${
            phone?.mode === 'olc' && phone.lockChip ? 'top-[64px]' : 'top-2.5'
          }`}
        >
          {tr.phone.lod(Math.round(view.scale * 100))}
        </p>
      )}

      {magnifier && (
        <Magnifier sceneId={sceneId} at={magnifier} view={view} size={size} below={picker !== null && pickerAbove(picker, size)} />
      )}
      {picker && (
        <Picker
          picker={picker}
          doc={doc}
          size={size}
          resistorStyle={settings.resistorStyle}
          onChoose={choose}
          onClose={() => {
            setPicker(null);
            setMagnifier(null);
          }}
        />
      )}
    </div>
  );
}

/** Görünümü, verilen kutu (seçili parça) görünür alanın içinde kalacak kadar kaydırır. */
function keepInside(view: View, box: Box | null, size: { width: number; height: number }): View {
  if (!box) return view;
  const g = GRID * view.scale;
  const margin = 16;
  const left = box.x * g + view.x;
  const right = (box.x + box.w) * g + view.x;
  const top = box.y * g + view.y;
  const bottom = (box.y + box.h) * g + view.y;
  let dx = 0;
  let dy = 0;
  if (right - left < size.width - 2 * margin) {
    if (left < margin) dx = margin - left;
    else if (right > size.width - margin) dx = size.width - margin - right;
  }
  if (bottom - top < size.height - 2 * margin) {
    if (top < margin) dy = margin - top;
    else if (bottom > size.height - margin) dy = size.height - margin - bottom;
  }
  return dx === 0 && dy === 0 ? view : { ...view, x: view.x + dx, y: view.y + dy };
}

/** Bağla kipindeki bilgi kartının metni. */
function connectCardText(start: ConnectStart | null, doc: CircuitDoc): string {
  if (!start) return tr.phone.connectCardIdle;
  const part = start.partId ? doc.parts.find((p) => p.id === start.partId) : undefined;
  if (!part || start.pin === null) return tr.phone.connectCardWire;
  return tr.phone.connectCardStart(tr.phone.pinOf(part.label, tr.devices.pins[part.type][start.pin] ?? ''));
}

/**
 * Bağla kipinde uç hedefleri (ekran pikselinde, yakınlıktan bağımsız): boş uç beyaz daire ve mavi
 * halka (44 pt), bağlı uç küçük ve soluk, başlangıç dolu mavi ve haleli. Hepsinde uç etiketi.
 */
function ConnectTargets({
  doc,
  connectivity,
  view,
  size,
  start,
}: {
  doc: CircuitDoc;
  connectivity: Connectivity;
  view: View;
  size: { width: number; height: number };
  start: ConnectStart | null;
}) {
  const targets: Array<{ key: string; x: number; y: number; tag: string; connected: boolean; isStart: boolean }> = [];
  for (const part of doc.parts) {
    pinPositions(part).forEach((pos, i) => {
      const x = pos.x * GRID * view.scale + view.x;
      const y = pos.y * GRID * view.scale + view.y;
      if (x < -30 || y < -30 || x > size.width + 30 || y > size.height + 30) return;
      targets.push({
        key: `${part.id}-${i}`,
        x,
        y,
        tag: tr.devices.pinTags[part.type][i] ?? '',
        connected: !connectivity.unconnectedPins.has(pinKey(part.id, i)),
        isStart: start?.partId === part.id && start.pin === i,
      });
    });
  }
  // Önce bağlı uçlar, sonra boşlar, en üstte başlangıç.
  targets.sort((a, b) => Number(a.isStart) - Number(b.isStart) || Number(b.connected) - Number(a.connected));
  const font = (tag: string, big: number) => (tag.length > 2 ? big - 4 : tag.length > 1 ? big - 2 : big);
  const tStart = start && start.partId === null ? { x: start.point.x * GRID * view.scale + view.x, y: start.point.y * GRID * view.scale + view.y } : null;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {targets.map((t) =>
        t.isStart ? (
          <g key={t.key}>
            <circle cx={t.x} cy={t.y} r={30} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeOpacity={0.35} />
            <circle cx={t.x} cy={t.y} r={24} fill="var(--color-accent)" />
            <text x={t.x} y={t.y + 5} textAnchor="middle" fontSize={font(t.tag, 15)} fontWeight={700} fill="#fff">
              {t.tag}
            </text>
          </g>
        ) : t.connected ? (
          <g key={t.key}>
            <circle cx={t.x} cy={t.y} r={CONNECT_TARGET_SMALL_PX} fill="#fff" stroke="#9fb8e6" strokeWidth={2} />
            <text x={t.x} y={t.y + 4.5} textAnchor="middle" fontSize={font(t.tag, 13)} fontWeight={600} fill="#5f7fb8">
              {t.tag}
            </text>
          </g>
        ) : (
          <g key={t.key}>
            <circle cx={t.x} cy={t.y} r={CONNECT_TARGET_PX} fill="#fff" stroke="var(--color-accent)" strokeWidth={2.5} />
            <text x={t.x} y={t.y + 5} textAnchor="middle" fontSize={font(t.tag, 14)} fontWeight={600} fill="var(--color-accent-ink)">
              {t.tag}
            </text>
          </g>
        ),
      )}
      {tStart && (
        <g>
          <circle cx={tStart.x} cy={tStart.y} r={18} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeOpacity={0.35} />
          <circle cx={tStart.x} cy={tStart.y} r={11} fill="var(--color-accent)" />
        </g>
      )}
    </svg>
  );
}

/** Seçici kartının yüksekliği (başlık + 52 px'lik seçenekler). */
const pickerHeight = (n: number) => 40 + n * 52;
/** Kart parmağın altına sığmıyorsa üstte durur (büyüteç o zaman parmağın altına iner). */
function pickerAbove(picker: { y: number; options: readonly PickOption[] }, size: { height: number }): boolean {
  return picker.y + 36 + pickerHeight(picker.options.length) > size.height - 8;
}

/**
 * Büyüteç: sahnenin 2,6 kat büyütülmüş kopyası (tasarım: P15). Parmağın üstünde; seçici kartı üstte
 * duruyorsa parmağın altında.
 */
function Magnifier({
  sceneId,
  at,
  view,
  size,
  below = false,
}: {
  sceneId: string;
  at: { x: number; y: number; g: Point };
  view: View;
  size: { width: number; height: number };
  below?: boolean;
}) {
  const r = MAGNIFIER_PX / 2;
  const left = Math.max(8, Math.min(size.width - MAGNIFIER_PX - 8, at.x - r));
  const top = below ? Math.min(size.height - MAGNIFIER_PX - 8, at.y + 40) : Math.max(8, at.y - MAGNIFIER_PX - 40);
  const scale = view.scale * MAGNIFY;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute overflow-hidden rounded-full border-[3px] border-white bg-paper shadow-[0_6px_20px_rgba(29,39,51,0.3)]"
      style={{ left, top, width: MAGNIFIER_PX, height: MAGNIFIER_PX }}
    >
      <svg width={MAGNIFIER_PX} height={MAGNIFIER_PX}>
        <g transform={`translate(${r} ${r}) scale(${scale}) translate(${-at.g.x * GRID} ${-at.g.y * GRID})`}>
          <use href={`#${sceneId}`} />
        </g>
        <circle cx={r} cy={r} r={5} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

/** "Burada N öğe var" seçicisi (listbox): parça, uç ya da kablo (tasarım: P15). */
function Picker({
  picker,
  doc,
  size,
  resistorStyle,
  onChoose,
  onClose,
}: {
  picker: { x: number; y: number; options: readonly PickOption[] };
  doc: CircuitDoc;
  size: { width: number; height: number };
  resistorStyle: Settings['resistorStyle'];
  onChoose: (option: PickOption) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[role=option]')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const n = picker.options.length;
  const top = pickerAbove(picker, size) ? 8 : picker.y + 36;
  const label = (option: PickOption): { title: string; note: string; part?: CircuitDoc['parts'][number] } => {
    if (option.kind === 'wire') {
      const wire = doc.wires.find((w) => w.id === option.wireId);
      const ends = wire ? [wire.points[0]!, wire.points[wire.points.length - 1]!] : [];
      const names = ends
        .map((end) => {
          for (const part of doc.parts) {
            const i = pinPositions(part).findIndex((p) => samePoint(p, end));
            if (i >= 0) return `${part.label} ${tr.devices.pinTags[part.type][i] ?? ''}`.trim();
          }
          return null;
        })
        .filter((s): s is string => s !== null);
      return { title: tr.phone.wire, note: tr.phone.pickWire(names.join(' → ')) };
    }
    const part = doc.parts.find((p) => p.id === option.partId);
    if (!part) return { title: '', note: '' };
    if (option.kind === 'pin') return { title: `${part.label} · ${tr.devices.pins[part.type][option.index] ?? ''}`, note: tr.phone.pickPin, part };
    return { title: part.label, note: tr.phone.pickPart(tr.devices.names[part.type]), part };
  };
  return (
    <>
      <div className="absolute inset-0" onPointerDown={onClose} aria-hidden="true" />
      <div
        ref={listRef}
        role="listbox"
        aria-label={tr.phone.pickerLabel(n)}
        className="absolute inset-x-6 overflow-hidden rounded-[14px] border border-line bg-panel shadow-[0_10px_30px_rgba(29,39,51,0.22)]"
        style={{ top }}
      >
        <div className="px-3.5 pt-2.5 pb-1.5 text-[13px] font-semibold text-muted">{tr.phone.pickerTitle(n)}</div>
        {picker.options.map((option, i) => {
          const text = label(option);
          return (
            <button
              key={`${option.kind}-${'partId' in option ? option.partId : option.wireId}-${option.kind === 'pin' ? option.index : ''}`}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onChoose(option)}
              className={`flex min-h-[52px] w-full items-center gap-3 px-3.5 text-left active:bg-accent-soft ${i < n - 1 ? 'border-b border-app' : ''}`}
            >
              <span className="flex h-7 w-9 shrink-0 items-center justify-center text-ink">
                {option.kind === 'wire' ? (
                  <Icon name="wire" />
                ) : option.kind === 'pin' ? (
                  <i className="block h-4 w-4 rounded-full border-[2.5px] border-accent bg-panel" />
                ) : text.part ? (
                  <SymbolIcon type={text.part.type} resistorStyle={resistorStyle} className="max-h-6 w-9" />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-semibold">{text.title}</span>
                <small className="truncate text-[12.5px] text-muted">{text.note}</small>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Akım noktaları aralığı (dünya pikseli). */
const DOT_SPACING = 16;

/**
 * Bir doğru parçası boyunca noktalar: uzunluğu 0 olan, yuvarlak uçlu çizgi desenleri. Koyu kenar
 * için aynı desen bir alt katmanda 2 px daha kalın çizilir.
 */
function dotLine(key: string, a: Point, b: Point, phase: number, width: number, edge = false) {
  return (
    <line
      key={key}
      x1={a.x * GRID}
      y1={a.y * GRID}
      x2={b.x * GRID}
      y2={b.y * GRID}
      stroke={edge ? CURRENT_DOT_EDGE : CURRENT_DOT_COLOR}
      strokeWidth={edge ? width + 2 : width}
      strokeLinecap="round"
      strokeDasharray={`0 ${DOT_SPACING}`}
      // Desen, kaydırma arttıkça başa doğru gider; ileri hareket için kaydırma negatif.
      strokeDashoffset={-(phase % DOT_SPACING)}
    />
  );
}

/** Kablolarda ve iki uçlu bileşenlerde akımın yönünü ve büyüklüğünü gösteren hareketli noktalar. */
function CurrentDots({ doc, graph, frame }: { doc: CircuitDoc; graph: FlowGraph; frame: SimFrame }) {
  const edges = [];
  const lines = [];
  for (let i = 0; i < graph.segments.length; i++) {
    const current = frame.segmentFlows[i] ?? 0;
    if (Math.abs(current) < MIN_ANIMATED_CURRENT) continue;
    const segment = graph.segments[i]!;
    const phase = frame.segmentPhases[i] ?? 0;
    edges.push(dotLine(`e-${segment.key}`, segment.a, segment.b, phase, 4, true));
    lines.push(dotLine(segment.key, segment.a, segment.b, phase, 4));
  }
  for (const part of doc.parts) {
    const flow = frame.partFlows.get(part.id);
    if (!flow || Math.abs(flow.current) < MIN_ANIMATED_CURRENT) continue;
    const axis = partAxis(part);
    if (!axis) continue;
    edges.push(dotLine(`e-part-${part.id}`, axis[0], axis[1], flow.phase, 3.4, true));
    lines.push(dotLine(`part-${part.id}`, axis[0], axis[1], flow.phase, 3.4));
  }
  return (
    <g pointerEvents="none">
      {edges}
      {lines}
    </g>
  );
}

/**
 * Gösterim: kablo renklerinin ve akım noktalarının açıklaması (tuvalin sol alt köşesi; tasarım: M04).
 * Renk tek ipucu olmasın diye ölçeğin uçlarında gerilim değerleri yazılıdır.
 */
function VoltageLegend({
  vmax,
  scale,
  electronFlow,
  rms,
  onClose,
}: {
  vmax: number;
  scale: WireScale;
  electronFlow: boolean;
  /** AC devrede renkler etkin değerden (kare ortalamasından) çizilir. */
  rms: boolean;
  /** Telefon: dokununca küçük düğmeye döner. */
  onClose?: () => void;
}) {
  const label = formatSI(vmax, 'V', { trim: true });
  return (
    <div
      role="note"
      aria-label={tr.sim.legendTitle}
      onClick={onClose}
      className={`absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-[10px] border border-line bg-panel/95 px-3 py-2.5 shadow-sm ${onClose ? '' : 'pointer-events-none'}`}
    >
      <span className="text-label font-semibold text-muted">{rms ? tr.sim.legendRms : tr.sim.legend}</span>
      <div className="h-2.5 w-44 rounded-[5px]" style={{ background: voltageGradient(scale) }} />
      <div className="flex w-44 justify-between font-mono text-[11.5px] text-ink-2 tabular">
        <span>−{label}</span>
        <span>0 V</span>
        <span>+{label}</span>
      </div>
      <div className="flex items-center gap-2 pt-0.5 text-label text-ink-2">
        <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
          {[5, 17, 29].map((cx) => (
            <circle key={cx} cx={cx} cy={5} r={3.4} fill={CURRENT_DOT_COLOR} stroke={CURRENT_DOT_EDGE} />
          ))}
        </svg>
        {electronFlow ? tr.sim.legendElectron : tr.sim.legendConventional}
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
