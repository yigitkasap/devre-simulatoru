// Tahtada kur → Tepeden: tahtanın üstündeki etkileşim katmanı (T1, T2). İmlecin altındaki delik ve ona
// bağlı delikler, parçayı takma (iki bacaklıda önce bir, sonra öbür bacak; sabit düzenlide tek tıklama),
// ikinci bacak için uygun delikler (yeşil halka), uzanmayan ya da dolu delik (kırmızı), seçili parçayı
// gövdeden ya da bacağının ucundan taşıma, delik adı yazarak takma ve klavye (R, Del, Esc). Kablolar:
// K aracıyla iki delik arasına ara kablo (renk kendiliğinden ya da seçilen), cihaz kartındaki uca (ya da
// paneldeki çipe) tıklayıp deliğe takılan alet kablosu; kabloya tıklanınca seçilir (Del çıkarır, renk değişir).
// Çizimler ekran koordinatında (sahnenin dik kamerasının dönüşümüyle, topTransform).

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type Ref } from 'react';
import { BB, boardWidth, holeXZ, type Hole } from '../../bench3d/breadboard';
import { allHoles, connectedHoles, holeLabel, sameHole } from '../../bench3d/holes';
import type { BenchScene, TopTransform } from '../../bench3d/scene';
import { tr } from '../../i18n/tr';
import { autoWireColor, occupiedHoles, type Build, type WireColor } from '../../model/build';
import type { CircuitDoc, Part } from '../../model/types';
import { WIRE_HEX } from '../../tahta/plan';
import { fixedHoles, isFixed, legRange, movePlaced, moveLeg, partHoles, placePart, reaches, removePart, rotatePlaced, secondLegHoles, typedHole, type PlaceResult } from '../../tahta/rules';
import { addWire, plugLead, removeWire, unplugLead, type WireResult } from '../../tahta/wiring';
import { parseHole } from '../../bench3d/holes';
import type { PinRef } from '../../tahta/check';
import { Icon } from '../icons';
import { partValueText } from '../PartView';

/** Takılmakta olan parça: iki bacaklıda ilk bacağın deliği; `turned`: R (bacak sırası / kılıf 180°). */
export interface Placing {
  readonly partId: string;
  readonly first: Hole | null;
  readonly turned: boolean;
  /** Kutudan sürükleniyor (bırakıldığı delik ilk bacak ya da kılıfın yeri olur). */
  readonly dragging: boolean;
}

/** Kablo aracı (K): ilk ucun deliği, seçilen renk (null: kendiliğinden); ya da takılmakta olan alet kablosu. */
export type Cabling = { readonly kind: 'wire'; readonly from: Hole | null; readonly color: WireColor | null } | { readonly kind: 'lead'; readonly part: string; readonly pin: number };

/** Masadaki parçanın ucunun kısa adı (kartta ve çipte): A, B, COM, 1+… */
export function terminalName(part: Part, pin: number): string {
  return tr.devices.pinTags[part.type]?.[pin] ?? String(pin + 1);
}

/** Kablo rengi örneği; null: kendiliğinden (yarı kırmızı yarı siyah). */
export function Swatch({ color, large = false }: { color: WireColor | null; large?: boolean }) {
  const size = large ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <span
      aria-hidden="true"
      className={`${size} shrink-0 rounded-full ring-1 ring-line-2`}
      style={{ background: color ? WIRE_HEX[color] : `linear-gradient(135deg, ${WIRE_HEX.red} 50%, ${WIRE_HEX.black} 50%)` }}
    />
  );
}

/** Tahtada seçili kablo: ara kablo (sırası) ya da alet kablosu. */
export type Pick = { readonly kind: 'wire'; readonly index: number } | { readonly kind: 'lead'; readonly part: string; readonly pin: number };

/** Denetle işareti (yeri açılmış sorun): çevresi kırmızı çerçeveli delikler ya da takılmamış alet uçları. */
export interface BoardMark {
  readonly n: number;
  readonly holes: readonly string[];
  readonly terminals: readonly PinRef[];
  /** Fazladan ara kablo: iki ucu ve arası işaretlenir. */
  readonly wire: boolean;
}

/** Örnek yerleşim (4. kademe): planBreadboard'un o parça için yerleşimi, saydam. */
export interface BoardGhost {
  readonly label: string;
  readonly holes: ReadonlyArray<{ readonly hole: string; readonly tag: string }>;
  readonly extra: readonly string[];
  /** Alet kabloları (gövde çizilmez). */
  readonly lead: boolean;
}

/** Seçim kurulumda hâlâ varsa kendisi, yoksa null. */
export function pickedIn(build: Build, pick: Pick | null): Pick | null {
  if (!pick) return null;
  return (pick.kind === 'wire' ? build.wires[pick.index] !== undefined : build.leads.some((l) => l.part === pick.part && l.pin === pick.pin)) ? pick : null;
}

export interface BoardTopProps {
  readonly scene: BenchScene | null;
  /** Görünüm her değiştiğinde artar (kaydırma, yakınlaşma, boyut): katman yeniden çizilir. */
  readonly viewTick: number;
  readonly doc: CircuitDoc;
  readonly build: Build;
  readonly placing: Placing | null;
  readonly onPlacing: (placing: Placing | null) => void;
  readonly cabling: Cabling | null;
  readonly onCabling: (cabling: Cabling | null) => void;
  /** Seçili kablo (araç çubuğundaki renk ve Sil bununla çalışır). */
  readonly pick: Pick | null;
  readonly onPick: (pick: Pick | null) => void;
  readonly selected: string | null;
  readonly onSelect: (partId: string | null) => void;
  readonly marks?: readonly BoardMark[];
  readonly ghosts?: readonly BoardGhost[];
  readonly showConnected: boolean;
  readonly onBuild: (build: Build) => void;
  /** Ekran okuyucuya duyuru ("R2, 7h ve 11h deliklerine takıldı."). */
  readonly announce: (text: string) => void;
  readonly touch: boolean;
  /** Telefon (T5): takma ve kablo çipleri alttaki sayfada; dokunmatikte büyüteç. */
  readonly phone?: boolean;
  /** Araç çubuğunun komutları (Döndür, Sil). */
  readonly commands?: Ref<BoardCommands>;
}

/** Tahtanın araç çubuğundan çağrılan komutlar. */
export interface BoardCommands {
  rotate(): void;
  remove(): void;
  /** Kablo aracını aç / kapat (K). */
  toggleWire(): void;
  /** Delik adı yazarak takma (telefonda alttaki sayfadan); ad geçersizse false (uyarı gösterilir). */
  typeHole(text: string): boolean;
}

type Press =
  | { readonly kind: 'pan'; readonly id: number; x: number; y: number; readonly sx: number; readonly sy: number }
  | { readonly kind: 'place'; readonly id: number; readonly sx: number; readonly sy: number }
  | { readonly kind: 'cable'; readonly id: number; readonly sx: number; readonly sy: number }
  /** Dokunmatikte takma: parmak deliğe dokunur, kaydırarak ayarlar, bırakınca takılır (büyüteç). */
  | { readonly kind: 'aim'; readonly id: number; readonly sx: number; readonly sy: number }
  | { readonly kind: 'body'; readonly id: number; readonly partId: string; readonly grab: Hole; readonly sx: number; readonly sy: number }
  | { readonly kind: 'leg'; readonly id: number; readonly partId: string; readonly leg: number; readonly sx: number; readonly sy: number };

const MOVE_PX = 5;
/** Büyüteç: yarıçap (px), büyütme ve parmaktan uzaklığı (T5). */
const LOUPE_R = 58;
const LOUPE_ZOOM = 1.9;
const LOUPE_LIFT = 104;

export function BoardTop(props: BoardTopProps) {
  const { scene, doc, build, placing, selected, cabling } = props;
  const pick = props.pick;
  const setPick = props.onPick;
  // Kurulum değişince (geri al) artık olmayan kablo seçimi yok sayılır.
  const picked = pickedIn(build, pick);
  const cols = build.cols;
  const layer = useRef<HTMLDivElement>(null);
  const holes = useMemo(() => allHoles(cols), [cols]);
  const occupied = useMemo(() => occupiedHoles(build), [build]);
  const [hover, setHover] = useState<Hole | null>(null);
  const [press, setPress] = useState<Press | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef(0);
  const [typed, setTyped] = useState('');
  // Dokunmatik: parmağın yeri (büyüteç) ve iki parmakla yakınlaştırma.
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; x: number; y: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const t: TopTransform | null = scene?.topTransform() ?? null;
  void props.viewTick;
  const name = (h: Hole) => holeLabel(h, cols);
  const part = (id: string | null | undefined): Part | undefined => (id ? doc.parts.find((p) => p.id === id) : undefined);
  const placingPart = part(placing?.partId);
  const selectedPart = part(selected);

  const toScreen = (h: Hole) => {
    const p = holeXZ(h, cols);
    return { x: p.x * (t?.scale ?? 1) + (t?.ox ?? 0), y: p.z * (t?.scale ?? 1) + (t?.oy ?? 0) };
  };
  /** Ekran noktasına en yakın delik (yarım delik aralığından yakınsa). */
  const holeAt = (sx: number, sy: number): Hole | null => {
    if (!t) return null;
    const wx = (sx - t.ox) / t.scale;
    const wz = (sy - t.oy) / t.scale;
    let best: Hole | null = null;
    let bestD = 0.55;
    for (const h of holes) {
      const p = holeXZ(h, cols);
      const d = Math.hypot(p.x - wx, p.z - wz);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  };
  const local = (clientX: number, clientY: number) => {
    const r = layer.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top, inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom };
  };
  /** Takılı bir parçanın gövdesi bu noktada mı (iki bacaklıda bacaklar arasındaki çizgi, öbürlerinde delikleri kapsayan kutu)? */
  const partAt = (sx: number, sy: number): string | null => {
    if (!t) return null;
    let hit: string | null = null;
    for (const [id] of Object.entries(build.parts)) {
      const p = part(id);
      const at = partHoles(build, id);
      if (!p || !at) continue;
      const pts = [...at.holes, ...at.extra].map(toScreen);
      if (!isFixed(p.type) && pts.length >= 2) {
        const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
        const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
        const u = Math.max(0, Math.min(1, ((sx - a.x) * (b.x - a.x) + (sy - a.y) * (b.y - a.y)) / len2));
        if (Math.hypot(sx - (a.x + u * (b.x - a.x)), sy - (a.y + u * (b.y - a.y))) <= 0.45 * t.scale) hit = id;
      } else {
        const pad = 0.5 * t.scale;
        const xs = pts.map((q) => q.x);
        const ys = pts.map((q) => q.y);
        if (sx >= Math.min(...xs) - pad && sx <= Math.max(...xs) + pad && sy >= Math.min(...ys) - pad && sy <= Math.max(...ys) + pad) hit = id;
      }
    }
    return hit;
  };

  /** Cihaz kartındaki uç (ekran noktası 14 px yakınında): BenchView katmanındaki [data-exact] öğeleri. */
  const terminals = () => {
    const root = layer.current?.parentElement;
    const r = layer.current?.getBoundingClientRect();
    if (!root || !r) return [];
    return [...root.querySelectorAll<HTMLElement>('[data-anchor="pin"][data-exact]')].map((el) => {
      const b = el.getBoundingClientRect();
      return { part: el.dataset.id ?? '', pin: Number(el.dataset.pin), x: b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top };
    });
  };
  const terminalAt = (sx: number, sy: number) => terminals().find((q) => Math.hypot(q.x - sx, q.y - sy) <= 14) ?? null;
  const terminalPos = (partId: string, pin: number) => terminals().find((q) => q.part === partId && q.pin === pin) ?? null;
  /** Ara kablo (iki ucu arasındaki çizgiye yakın). */
  const wireAt = (sx: number, sy: number): number | null => {
    if (!t) return null;
    let hit: number | null = null;
    build.wires.forEach((w, i) => {
      const a = parseHole(w.a, cols);
      const b = parseHole(w.b, cols);
      if (!a || !b) return;
      const p = toScreen(a);
      const q = toScreen(b);
      const len2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 || 1;
      const u = Math.max(0, Math.min(1, ((sx - p.x) * (q.x - p.x) + (sy - p.y) * (q.y - p.y)) / len2));
      if (Math.hypot(sx - (p.x + u * (q.x - p.x)), sy - (p.y + u * (q.y - p.y))) <= Math.max(6, 0.3 * t.scale)) hit = i;
    });
    return hit;
  };
  /** Takılı alet kablosunun deliği. */
  const leadAt = (h: Hole | null) => (h ? (build.leads.find((l) => l.hole === name(h)) ?? null) : null);
  const leadName = (partId: string, pin: number) => {
    const p = part(partId);
    return p ? `${p.label} ${terminalName(p, pin)}` : '';
  };

  const warn = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
    props.announce(text);
  };
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const holesText = (b: Build, id: string) => tr.tahta.and(b.parts[id]?.holes ?? []);
  const reasonText = (p: Part, result: PlaceResult) => {
    if (result.ok) return '';
    if (result.reason === 'occupied') return tr.tahta.occupied;
    if (result.reason === 'reach') {
      const { min, max } = legRange(p.type);
      return tr.tahta.noReach(tr.devices.names[p.type].toLocaleLowerCase('tr'), min, max);
    }
    return tr.tahta.offBoard;
  };
  const commit = (p: Part, result: PlaceResult, message: (b: Build) => string) => {
    if (!result.ok) {
      warn(reasonText(p, result));
      return false;
    }
    props.onBuild(result.build);
    props.announce(message(result.build));
    return true;
  };

  /** Takılmakta olan parçayı bu deliğe takar (iki bacaklıda ilk ya da ikinci bacak). */
  const placeAt = (h: Hole) => {
    if (!placing || !placingPart) return;
    const p = placingPart;
    if (isFixed(p.type)) {
      const at = fixedHoles(p.type, h, placing.turned ? 1 : 0, cols);
      if (commit(p, placePart(build, p.type, p.id, at), (b) => tr.tahta.placed(p.label, holesText(b, p.id)))) {
        props.onPlacing(null);
        props.onSelect(p.id);
      }
      return;
    }
    if (!placing.first) {
      if (occupied.has(name(h)) && !(build.parts[p.id]?.holes.includes(name(h)) ?? false)) {
        warn(tr.tahta.occupied);
        return;
      }
      props.onPlacing({ ...placing, first: h, dragging: false });
      return;
    }
    const firstPin = placing.turned ? 1 : 0;
    const at = firstPin === 0 ? [placing.first, h] : [h, placing.first];
    if (commit(p, placePart(build, p.type, p.id, { holes: at, extra: [] }), (b) => tr.tahta.placed(p.label, holesText(b, p.id)))) {
      props.onPlacing(null);
      props.onSelect(p.id);
    }
  };

  /** Kablo aracında ya da alet kablosu takılırken deliğe tıklama. */
  const cableAt = (h: Hole) => {
    if (!cabling) return;
    const fail = (result: WireResult) => {
      if (!result.ok) warn(result.reason === 'same' ? tr.tahta.sameHole : tr.tahta.occupied);
    };
    if (cabling.kind === 'lead') {
      const result = plugLead(build, cabling.part, cabling.pin, h);
      if (!result.ok) return fail(result);
      props.onBuild(result.build);
      props.announce(tr.tahta.leadPlugged(leadName(cabling.part, cabling.pin), name(h)));
      props.onCabling(null);
      return;
    }
    if (!cabling.from) {
      if (occupied.has(name(h))) return warn(tr.tahta.occupied);
      props.onCabling({ ...cabling, from: h });
      return;
    }
    const result = addWire(build, cabling.from, h, cabling.color ?? undefined);
    if (!result.ok) return fail(result);
    const wire = result.build.wires[result.build.wires.length - 1]!;
    props.onBuild(result.build);
    props.announce(tr.tahta.wireAdded(tr.tahta.colors[wire.color] ?? wire.color, wire.a, wire.b));
    props.onCabling({ ...cabling, from: null });
  };

  // Kutudan sürükleme: imleç tahtanın üstündeyken delik izlenir, bırakıldığı yere takılır.
  const dragging = placing?.dragging ?? false;
  const placeRef = useRef(placeAt);
  placeRef.current = placeAt;
  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (e: PointerEvent) => {
      const q = local(e.clientX, e.clientY);
      setHover(q.inside ? holeAt(q.x, q.y) : null);
    };
    const onUp = (e: PointerEvent) => {
      const q = local(e.clientX, e.clientY);
      const h = q.inside ? holeAt(q.x, q.y) : null;
      if (h) placeRef.current(h);
      else if (placing) props.onPlacing({ ...placing, dragging: false });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // holeAt/local yalnızca dönüşüme bağlı; dönüşüm değişince (viewTick) yeniden bağlanır.
  }, [dragging, props.viewTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Takma başlayınca delik alanı odaklanır (delik adı yazarak takma).
  useEffect(() => {
    setTyped('');
    if ((placing && !placing.dragging) || cabling) input.current?.focus({ preventScroll: true });
  }, [placing?.partId, placing?.first, placing?.dragging, cabling?.kind, cabling?.kind === 'wire' ? cabling.from : null, cabling?.kind === 'lead' ? `${cabling.part}#${cabling.pin}` : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const rotateSelected = () => {
    const p = selectedPart;
    if (!p || !build.parts[p.id]) return;
    commit(p, rotatePlaced(build, p.type, p.id), (b) => tr.tahta.rotated(p.label, holesText(b, p.id)));
  };
  const deleteSelected = () => {
    if (picked) {
      if (picked.kind === 'wire') {
        const w = build.wires[picked.index]!;
        props.onBuild(removeWire(build, picked.index));
        props.announce(tr.tahta.wireRemoved(w.a, w.b));
      } else {
        props.onBuild(unplugLead(build, picked.part, picked.pin));
        props.announce(tr.tahta.leadUnplugged(leadName(picked.part, picked.pin)));
      }
      setPick(null);
      return;
    }
    const p = selectedPart;
    if (!p || !build.parts[p.id]) return;
    props.onBuild(removePart(build, p.id));
    props.onSelect(null);
    props.announce(tr.tahta.removed(p.label));
  };

  // Klavye: R döndür, Del sil, Esc vazgeç (yazı alanındayken R ve Del yazıya gider).
  const toggleWire = () => {
    if (cabling?.kind === 'wire') props.onCabling(null);
    else {
      props.onPlacing(null);
      props.onSelect(null);
      setPick(null);
      props.onCabling({ kind: 'wire', from: null, color: null });
    }
  };
  const typeHole = (text: string): boolean => {
    const at = typedHole(text, cols);
    if (!at) {
      warn(tr.tahta.unknownHole(text.trim()));
      return false;
    }
    if (cabling) cableAt(at);
    else if (placing) placeAt(at);
    return true;
  };
  const keys = useRef({ rotateSelected, deleteSelected, toggleWire, typeHole });
  keys.current = { rotateSelected, deleteSelected, toggleWire, typeHole };
  useImperativeHandle(
    props.commands,
    () => ({ rotate: () => keys.current.rotateSelected(), remove: () => keys.current.deleteSelected(), toggleWire: () => keys.current.toggleWire(), typeHole: (text: string) => keys.current.typeHole(text) }),
    [],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape') {
        if (cabling?.kind === 'wire' && cabling.from) props.onCabling({ ...cabling, from: null });
        else if (cabling) props.onCabling(null);
        else if (placing) props.onPlacing(null);
        else if (picked) setPick(null);
        else if (selected) props.onSelect(null);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        keys.current.toggleWire();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (placing) props.onPlacing({ ...placing, turned: !placing.turned });
        else keys.current.rotateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!placing && (selected || picked)) {
          e.preventDefault();
          keys.current.deleteSelected();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, selected, cabling, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  // İşaretçi (fare, kalem; dokunmatik 8. aşamada).
  const onDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const q = local(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    const h = holeAt(q.x, q.y);
    const touch = e.pointerType === 'touch';
    if (touch) {
      pointers.current.set(e.pointerId, q);
      // İkinci parmak: iki parmakla yakınlaştırma ve kaydırma (takma ve kaydırma bırakılır).
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        setPress(null);
        setFinger(null);
        setHover(null);
        return;
      }
      if (placing || cabling) {
        const other = cabling ? terminalAt(q.x, q.y) : null;
        if (!other) {
          setPress({ kind: 'aim', id: e.pointerId, sx: q.x, sy: q.y });
          setFinger(q);
          setHover(h);
          return;
        }
      }
    }
    if (cabling) {
      // Karttaki bir uca tıklanırsa o ucun kablosu takılmaya başlar (aynı uç: bırakılır).
      const other = terminalAt(q.x, q.y);
      if (other) {
        const same = cabling.kind === 'lead' && other.part === cabling.part && other.pin === cabling.pin;
        props.onCabling(same ? null : { kind: 'lead', part: other.part, pin: other.pin });
        return;
      }
      setPress({ kind: 'cable', id: e.pointerId, sx: q.x, sy: q.y });
      return;
    }
    if (placing) {
      setPress({ kind: 'place', id: e.pointerId, sx: q.x, sy: q.y });
      return;
    }
    // Cihaz kartındaki uca tıklama: o kablo takılır (takılıysa yeni deliğe taşınır).
    const term = terminalAt(q.x, q.y);
    if (term) {
      props.onSelect(null);
      setPick(null);
      props.onCabling({ kind: 'lead', part: term.part, pin: term.pin });
      return;
    }
    const lead = leadAt(h);
    if (lead) {
      props.onSelect(null);
      setPick({ kind: 'lead', part: lead.part, pin: lead.pin });
      setPress({ kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, sx: q.x, sy: q.y });
      return;
    }
    if (selectedPart && h && !isFixed(selectedPart.type) && !touch) {
      const leg = build.parts[selectedPart.id]?.holes.indexOf(name(h)) ?? -1;
      if (leg >= 0) {
        setPress({ kind: 'leg', id: e.pointerId, partId: selectedPart.id, leg, sx: q.x, sy: q.y });
        return;
      }
    }
    const hit = partAt(q.x, q.y);
    if (hit && h) {
      setPick(null);
      if (hit !== selected) props.onSelect(hit);
      // Dokunmatikte taşıma yok (T5): seçilir, kaydırma sürer; yeri değiştirmek için Sil ve yeniden tak.
      setPress(touch ? { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, sx: q.x, sy: q.y } : { kind: 'body', id: e.pointerId, partId: hit, grab: h, sx: q.x, sy: q.y });
      return;
    }
    const wire = wireAt(q.x, q.y);
    if (wire !== null) {
      props.onSelect(null);
      setPick({ kind: 'wire', index: wire });
      setPress({ kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, sx: q.x, sy: q.y });
      return;
    }
    setPress({ kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, sx: q.x, sy: q.y });
  };
  const onMove = (e: ReactPointerEvent) => {
    const q = local(e.clientX, e.clientY);
    if (e.pointerType === 'touch' && pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, q);
      const p = pinch.current;
      if (p && pointers.current.size === 2 && scene) {
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if (p.dist > 0) scene.zoomTop(dist / p.dist, mx, my);
        scene.panTop(mx - p.x, my - p.y);
        pinch.current = { dist, x: mx, y: my };
        return;
      }
      if (press?.kind === 'aim' && press.id === e.pointerId) {
        setFinger(q);
        setHover(holeAt(q.x, q.y));
        return;
      }
      if (press === null) return;
    }
    setHover(holeAt(q.x, q.y));
    if ((press?.kind === 'pan' || press?.kind === 'cable' || press?.kind === 'place') && press.id === e.pointerId && scene && 'x' in press) {
      scene.panTop(e.clientX - press.x, e.clientY - press.y);
      press.x = e.clientX;
      press.y = e.clientY;
    }
  };
  const onUp = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') {
      pointers.current.delete(e.pointerId);
      if (pinch.current) {
        if (pointers.current.size < 2) pinch.current = null;
        setPress(null);
        return;
      }
    }
    const p = press;
    setPress(null);
    if (!p || p.id !== e.pointerId) return;
    const q = local(e.clientX, e.clientY);
    const moved = Math.hypot(q.x - p.sx, q.y - p.sy) > MOVE_PX;
    const h = holeAt(q.x, q.y);
    if (p.kind === 'aim') {
      // Parmak kalkınca büyütecin gösterdiği deliğe takılır.
      const target = hover ?? h;
      setFinger(null);
      setHover(null);
      if (target) {
        if (cabling) cableAt(target);
        else if (placing) placeAt(target);
      }
      return;
    }
    if (p.kind === 'place') {
      if (!moved && h) placeAt(h);
      return;
    }
    if (p.kind === 'cable') {
      if (!moved && h) cableAt(h);
      return;
    }
    if (p.kind === 'pan') {
      if (!moved && !picked) props.onSelect(null);
      else if (!moved && pick && wireAt(q.x, q.y) === null && !leadAt(h)) setPick(null);
      return;
    }
    const target = part(p.partId);
    if (!target || !moved || !h) return;
    if (p.kind === 'body') {
      if (h.kind !== 'strip' || p.grab.kind !== 'strip') return;
      commit(target, movePlaced(build, target.type, target.id, h.col - p.grab.col, h.row - p.grab.row), (b) => tr.tahta.moved(target.label, holesText(b, target.id)));
    } else {
      commit(target, moveLeg(build, target.type, target.id, p.leg, h), (b) => tr.tahta.moved(target.label, holesText(b, target.id)));
    }
  };

  // --- Çizim --------------------------------------------------------------------------------------
  const r = t ? Math.max(5, 0.42 * t.scale) : 6;
  const ring = (h: Hole, color: string, key: string, dash = false, width = 2.2) => {
    const c = toScreen(h);
    return <circle key={key} cx={c.x} cy={c.y} r={r} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash ? '3 3' : undefined} />;
  };
  const frame = (list: readonly Hole[], key: string, color: string, dash = false) => {
    const pts = list.map(toScreen);
    const pad = r + 3;
    const x0 = Math.min(...pts.map((q) => q.x)) - pad;
    const y0 = Math.min(...pts.map((q) => q.y)) - pad;
    return (
      <rect key={key} x={x0} y={y0} width={Math.max(...pts.map((q) => q.x)) + pad - x0} height={Math.max(...pts.map((q) => q.y)) + pad - y0} rx={pad} fill={dash ? 'none' : 'var(--color-accent-soft)'} fillOpacity={0.55} stroke={color} strokeWidth={2} strokeDasharray={dash ? '5 4' : undefined} />
    );
  };

  const overlays: ReactElement[] = [];
  let tip: { at: Hole; title: string; line: string; bad: boolean } | null = null;
  if (t) {
    if (hover && props.showConnected) overlays.push(frame(connectedHoles(hover, cols), 'bagli', 'var(--color-accent)'));
    if (selectedPart && build.parts[selectedPart.id] && !placing) {
      const at = partHoles(build, selectedPart.id);
      if (at) overlays.push(frame([...at.holes, ...at.extra], 'secili', 'var(--color-accent)', true));
    }
    if (placing && placingPart) {
      const p = placingPart;
      if (isFixed(p.type)) {
        const at = hover ? fixedHoles(p.type, hover, placing.turned ? 1 : 0, cols) : null;
        if (at) {
          const own = new Set(build.parts[p.id] ? [...build.parts[p.id]!.holes, ...(build.parts[p.id]!.extra ?? [])] : []);
          const free = (x: Hole) => !occupied.has(name(x)) || own.has(name(x));
          const ok = [...at.holes, ...at.extra].every(free);
          at.holes.forEach((x, i) => {
            overlays.push(ring(x, ok ? 'var(--color-ok)' : 'var(--color-danger)', `g${i}`));
            const c = toScreen(x);
            overlays.push(
              <text key={`gt${i}`} x={c.x} y={c.y - r - 6} textAnchor="middle" className="fill-current font-mono text-[12px] font-semibold" style={{ fill: ok ? 'var(--color-ok-ink)' : 'var(--color-danger-ink)' }}>
                {tr.devices.pinTags[p.type][i]}
              </text>,
            );
          });
          at.extra.forEach((x, i) => overlays.push(ring(x, ok ? 'var(--color-ok)' : 'var(--color-danger)', `ge${i}`, true, 1.5)));
          if (!ok && hover) tip = { at: hover, title: name(hover), line: tr.tahta.occupied, bad: true };
        } else if (hover) tip = { at: hover, title: name(hover), line: tr.tahta.offBoard, bad: true };
      } else if (placing.first) {
        const first = placing.first;
        for (const h of secondLegHoles(p.type, first, cols, occupied)) overlays.push(ring(h, 'var(--color-ok)', `c${name(h)}`, false, 1.8));
        overlays.push(ring(first, 'var(--color-accent)', 'ilk', false, 3));
        if (hover && !sameHole(hover, first)) {
          const a = toScreen(first);
          const b = toScreen(hover);
          const ok = reaches(p.type, first, hover, cols) && !occupied.has(name(hover));
          overlays.push(<line key="bacak" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ok ? 'var(--color-accent)' : 'var(--color-danger)'} strokeWidth={3} strokeDasharray="6 4" strokeLinecap="round" />);
          if (!ok) {
            overlays.push(ring(hover, 'var(--color-danger)', 'kotu', false, 3));
            const { min, max } = legRange(p.type);
            tip = { at: hover, title: name(hover), line: occupied.has(name(hover)) ? tr.tahta.occupied : tr.tahta.noReach(tr.devices.names[p.type].toLocaleLowerCase('tr'), min, max), bad: true };
          }
        }
      }
    }
    if (press?.kind === 'body' && hover && hover.kind === 'strip' && press.grab.kind === 'strip') {
      const target = part(press.partId);
      const at = partHoles(build, press.partId);
      if (target && at) {
        const dc = hover.col - press.grab.col;
        const dr = hover.row - press.grab.row;
        const result = movePlaced(build, target.type, target.id, dc, dr);
        const shifted = [...at.holes, ...at.extra].map((h) => (h.kind === 'strip' ? { ...h, col: h.col + dc, row: h.row + dr } : h)).filter((h) => h.kind !== 'strip' || (h.col >= 1 && h.col <= cols && h.row >= 0 && h.row <= 9));
        shifted.forEach((h, i) => overlays.push(ring(h, result.ok ? 'var(--color-ok)' : 'var(--color-danger)', `m${i}`)));
      }
    }
    if (press?.kind === 'leg' && hover) {
      const target = part(press.partId);
      if (target) {
        const ok = moveLeg(build, target.type, target.id, press.leg, hover).ok;
        overlays.push(ring(hover, ok ? 'var(--color-ok)' : 'var(--color-danger)', 'legto', false, 3));
      }
    }
    if (cabling?.kind === 'wire') {
      const from = cabling.from;
      if (from) overlays.push(ring(from, 'var(--color-accent)', 'kablo1', false, 3));
      if (hover) {
        const bad = occupied.has(name(hover)) || (from !== null && sameHole(from, hover));
        const color = cabling.color ?? autoWireColor(build, from ? name(from) : name(hover), name(hover));
        if (from && !sameHole(from, hover)) {
          const a = toScreen(from);
          const b = toScreen(hover);
          overlays.push(<line key="kablo-golge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-ink)" strokeOpacity={0.35} strokeWidth={7} strokeLinecap="round" />);
          overlays.push(<line key="kablo" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={bad ? 'var(--color-danger)' : WIRE_HEX[color]} strokeWidth={4} strokeDasharray={bad ? '6 4' : undefined} strokeLinecap="round" />);
        }
        overlays.push(ring(hover, bad ? 'var(--color-danger)' : 'var(--color-accent)', 'kablo2', false, 2.5));
        const list = connectedHoles(hover, cols);
        const free = list.filter((x) => !occupied.has(name(x))).length;
        const where = props.showConnected ? (hover.kind === 'strip' ? tr.tahta.hoverStrip(name(list[0]!), name(list[list.length - 1]!), free) : tr.tahta.hoverRail(list.length, free)) : '';
        const line = bad ? (occupied.has(name(hover)) ? tr.tahta.occupied : tr.tahta.sameHole) : [where, tr.tahta.tipWireColor(tr.tahta.colors[color] ?? color)].filter(Boolean).join(' · ');
        tip = { at: hover, title: name(hover), line, bad };
      }
    }
    if (cabling?.kind === 'lead') {
      const at = terminalPos(cabling.part, cabling.pin);
      if (at && hover) {
        const b = toScreen(hover);
        const own = leadAt(hover);
        const bad = occupied.has(name(hover)) && !(own && own.part === cabling.part && own.pin === cabling.pin);
        overlays.push(<line key="uc" x1={at.x} y1={at.y} x2={b.x} y2={b.y} stroke={bad ? 'var(--color-danger)' : 'var(--color-accent)'} strokeWidth={3} strokeDasharray="6 4" strokeLinecap="round" />);
        overlays.push(ring(hover, bad ? 'var(--color-danger)' : 'var(--color-accent)', 'uc2', false, 2.5));
        if (bad) tip = { at: hover, title: name(hover), line: tr.tahta.occupied, bad: true };
      }
      if (at) overlays.push(<circle key="uc1" cx={at.x} cy={at.y} r={13} fill="none" stroke="var(--color-accent)" strokeWidth={3} />);
    }
    if (picked?.kind === 'wire') {
      const w = build.wires[picked.index]!;
      const a = parseHole(w.a, cols);
      const b = parseHole(w.b, cols);
      if (a && b) {
        const p = toScreen(a);
        const q = toScreen(b);
        overlays.push(<line key="secili-kablo" x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--color-accent)" strokeWidth={Math.max(10, 0.5 * (t?.scale ?? 20))} strokeOpacity={0.35} strokeLinecap="round" />);
        overlays.push(ring(a, 'var(--color-accent)', 'sk1', false, 2.5), ring(b, 'var(--color-accent)', 'sk2', false, 2.5));
      }
    }
    if (picked?.kind === 'lead') {
      const lead = build.leads.find((l) => l.part === picked.part && l.pin === picked.pin);
      const h = lead ? parseHole(lead.hole, cols) : null;
      if (h) overlays.push(ring(h, 'var(--color-accent)', 'su', false, 3.5));
      const at = terminalPos(picked.part, picked.pin);
      if (at) overlays.push(<circle key="su1" cx={at.x} cy={at.y} r={13} fill="none" stroke="var(--color-accent)" strokeWidth={3} />);
    }
    // Örnek yerleşim (saydam) ve Denetle işaretleri. Örnek yerleşimin yazısı tahtada değil (delik ve
    // işaret örtüyordu), alttaki bildirim çubuğunda ve sorun kartında.
    (props.ghosts ?? []).forEach((g, gi) => {
      const at = g.holes.flatMap(({ hole }) => {
        const h = parseHole(hole, cols);
        return h ? [{ h, c: toScreen(h) }] : [];
      });
      if (at.length === 0) return;
      if (!g.lead && at.length >= 2) {
        const xs = at.map((q) => q.c.x);
        const ys = at.map((q) => q.c.y);
        const pad = r * 0.9;
        overlays.push(
          <rect key={`ghost-body-${gi}`} x={Math.min(...xs) - pad} y={Math.min(...ys) - pad} width={Math.max(...xs) - Math.min(...xs) + 2 * pad} height={Math.max(...ys) - Math.min(...ys) + 2 * pad} rx={pad} fill="var(--color-accent)" fillOpacity={0.18} stroke="var(--color-accent)" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="5 4" />,
        );
      }
      at.forEach(({ h }, i) => {
        overlays.push(<g key={`ghost-${gi}-${i}`} opacity={0.85}>{ring(h, 'var(--color-accent)', `gr-${gi}-${i}`, true, 2.2)}</g>);
      });
      for (const [i, e] of g.extra.entries()) {
        const h = parseHole(e, cols);
        if (h) overlays.push(<g key={`ghost-e-${gi}-${i}`} opacity={0.6}>{ring(h, 'var(--color-accent)', `ge-${gi}-${i}`, true, 1.5)}</g>);
      }
    });
    const badge = (x: number, y: number, n: number, key: string) => (
      <g key={key}>
        <circle cx={x} cy={y} r={11} fill="var(--color-danger)" stroke="var(--color-panel)" strokeWidth={1.5} />
        <text x={x} y={y + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} fill="white">
          {n}
        </text>
      </g>
    );
    for (const m of props.marks ?? []) {
      const hs = m.holes.map((n) => parseHole(n, cols)).filter((h): h is Hole => h !== null);
      if (m.wire && hs.length === 2) {
        const a = toScreen(hs[0]!);
        const b = toScreen(hs[1]!);
        overlays.push(<line key={`mk-w-${m.n}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-danger)" strokeOpacity={0.45} strokeWidth={Math.max(8, 0.45 * (t?.scale ?? 20))} strokeLinecap="round" />);
        overlays.push(ring(hs[0]!, 'var(--color-danger)', `mk-a-${m.n}`, false, 2.5), ring(hs[1]!, 'var(--color-danger)', `mk-b-${m.n}`, false, 2.5));
        overlays.push(badge(a.x + r + 8, a.y - r - 8, m.n, `mk-n-${m.n}`));
      } else if (hs.length > 0) {
        const pts = hs.map(toScreen);
        const pad = r + 5;
        const x0 = Math.min(...pts.map((q) => q.x)) - pad;
        const y0 = Math.min(...pts.map((q) => q.y)) - pad;
        const x1 = Math.max(...pts.map((q) => q.x)) + pad;
        const y1 = Math.max(...pts.map((q) => q.y)) + pad;
        overlays.push(<rect key={`mk-${m.n}`} x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={pad} fill="var(--color-danger-soft)" fillOpacity={0.3} stroke="var(--color-danger)" strokeWidth={2.5} />);
        overlays.push(badge(x1, y0, m.n, `mk-n-${m.n}`));
      }
      m.terminals.forEach((q, i) => {
        const at = terminalPos(q.part, q.pin);
        if (!at) return;
        overlays.push(<circle key={`mk-t-${m.n}-${i}`} cx={at.x} cy={at.y} r={14} fill="none" stroke="var(--color-danger)" strokeWidth={3} />);
        if (i === 0 && hs.length === 0) overlays.push(badge(at.x + 14, at.y - 14, m.n, `mk-tn-${m.n}`));
      });
    }
    if (hover && !tip) {
      const list = connectedHoles(hover, cols);
      const free = list.filter((h) => !occupied.has(name(h))).length;
      const line = hover.kind === 'strip' ? tr.tahta.hoverStrip(name(list[0]!), name(list[list.length - 1]!), free) : tr.tahta.hoverRail(list.length, free);
      tip = { at: hover, title: name(hover), line: props.showConnected ? line : occupied.has(name(hover)) ? tr.tahta.hoverFull : '', bad: false };
    }
  }

  // Büyüteç (T5): parmağın altındaki delikler büyütülmüş, hedef delik halkalı, bağlı delikler çerçeveli;
  // altında delik adı ve bağlı olduğu delikler. Parmak ekranın üstüne yakınsa büyüteç parmağın altında.
  // Tahtanın kenarı: açık temada tahta tuval zemininden zor ayrılıyordu (dik kamerada gölge yok).
  const edge = t
    ? { left: t.ox - (boardWidth(cols) / 2) * t.scale, top: t.oy - (BB.depth / 2) * t.scale, width: boardWidth(cols) * t.scale, height: BB.depth * t.scale }
    : null;
  const loupe = (() => {
    if (!finger || !hover || !t) return null;
    const at = toScreen(hover);
    const cy = finger.y - LOUPE_LIFT < LOUPE_R + 8 ? finger.y + LOUPE_LIFT : finger.y - LOUPE_LIFT;
    const cx = Math.min(Math.max(finger.x, LOUPE_R + 8), (layer.current?.clientWidth ?? 9999) - LOUPE_R - 8);
    const span = (LOUPE_R / LOUPE_ZOOM) + t.scale;
    const near = holes.filter((h) => {
      const c = toScreen(h);
      return Math.abs(c.x - at.x) <= span && Math.abs(c.y - at.y) <= span;
    });
    const map = (c: { x: number; y: number }) => ({ x: cx + (c.x - at.x) * LOUPE_ZOOM, y: cy + (c.y - at.y) * LOUPE_ZOOM });
    const side = 0.46 * t.scale * LOUPE_ZOOM;
    const group = connectedHoles(hover, cols);
    const shown = group.map(toScreen).map(map);
    const pad = side * 0.85;
    const bad = occupied.has(name(hover)) && !(cabling?.kind === 'lead' && leadAt(hover)?.part === cabling.part && leadAt(hover)?.pin === cabling.pin);
    // Bağlı delikler kapalıysa (görevde) etiket yalnızca deliğin adını söyler.
    const label = !props.showConnected
      ? name(hover)
      : hover.kind === 'strip'
        ? tr.tahta.loupeStrip(name(hover), name(group[0]!), name(group[group.length - 1]!))
        : tr.tahta.loupeRail(name(hover), group.length);
    const clip = `buyutec-${Math.round(cx)}-${Math.round(cy)}`;
    return (
      <>
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" aria-hidden="true">
          <defs>
            <clipPath id={clip}>
              <circle cx={cx} cy={cy} r={LOUPE_R} />
            </clipPath>
          </defs>
          <circle cx={finger.x} cy={finger.y} r={20} fill="var(--color-ink)" fillOpacity={0.18} />
          <circle cx={cx} cy={cy} r={LOUPE_R} fill="var(--color-panel)" stroke="var(--color-line-2)" strokeWidth={2} />
          <g clipPath={`url(#${clip})`}>
            {props.showConnected && (
              <rect
                x={Math.min(...shown.map((q) => q.x)) - pad}
                y={Math.min(...shown.map((q) => q.y)) - pad}
                width={Math.max(...shown.map((q) => q.x)) - Math.min(...shown.map((q) => q.x)) + 2 * pad}
                height={Math.max(...shown.map((q) => q.y)) - Math.min(...shown.map((q) => q.y)) + 2 * pad}
                rx={pad}
                fill="var(--color-accent-soft)"
                stroke="var(--color-accent)"
                strokeWidth={2}
              />
            )}
            {near.map((h) => {
              const c = map(toScreen(h));
              const used = occupied.has(name(h));
              return <rect key={name(h)} x={c.x - side / 2} y={c.y - side / 2} width={side} height={side} rx={2} fill={used ? 'var(--color-muted)' : 'var(--color-ink)'} fillOpacity={used ? 0.9 : 0.85} />;
            })}
            <circle cx={cx} cy={cy} r={side * 0.95} fill="none" stroke={bad ? 'var(--color-danger)' : 'var(--color-accent)'} strokeWidth={3} />
          </g>
        </svg>
        <div
          className={`pointer-events-none absolute z-20 -translate-x-1/2 rounded-lg px-2.5 py-1 font-mono text-[13px] font-semibold whitespace-nowrap shadow-md ${bad ? 'bg-danger text-white' : 'bg-ink text-on-ink'}`}
          style={{ left: cx, top: cy + LOUPE_R + 6 }}
        >
          {bad ? `${name(hover)} · ${tr.tahta.occupiedShort}` : label}
        </div>
      </>
    );
  })();
  const tipPos = tip ? toScreen(tip.at) : null;
  const selectedBox = (() => {
    if (!t || !selectedPart || placing || press) return null;
    const at = partHoles(build, selectedPart.id);
    if (!at) return null;
    const pts = [...at.holes, ...at.extra].map(toScreen);
    return { x: (Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.x))) / 2, y: Math.min(...pts.map((q) => q.y)) - r - 10 };
  })();
  const pickBox = (() => {
    if (!t || !picked || press || cabling) return null;
    const ends = picked.kind === 'wire' ? [build.wires[picked.index]!.a, build.wires[picked.index]!.b] : [build.leads.find((l) => l.part === picked.part && l.pin === picked.pin)!.hole];
    const pts = ends.map((e) => parseHole(e, cols)).filter((x): x is Hole => x !== null).map(toScreen);
    if (pts.length === 0) return null;
    return { x: (Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.x))) / 2, y: Math.min(...pts.map((q) => q.y)) - r - 10 };
  })();
  const pickLabel = picked ? (picked.kind === 'wire' ? tr.tahta.wireSelected(build.wires[picked.index]!.a, build.wires[picked.index]!.b) : tr.tahta.leadSelected(leadName(picked.part, picked.pin), build.leads.find((l) => l.part === picked.part && l.pin === picked.pin)!.hole)) : '';
  const firstPinName = placingPart ? (tr.devices.pinTags[placingPart.type][placing?.turned ? 1 : 0] ?? '1') : '';
  const secondPinName = placingPart ? (tr.devices.pinTags[placingPart.type][placing?.turned ? 0 : 1] ?? '2') : '';
  const h = props.touch ? 'h-11' : 'h-9';

  return (
    <>
      <div
        ref={layer}
        className={`absolute inset-0 z-10 touch-none ${placing || cabling ? 'cursor-crosshair' : press?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-default'}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          setPress(null);
          setFinger(null);
          pointers.current.clear();
          pinch.current = null;
        }}
        onPointerLeave={() => !press && setHover(null)}
      >
        {edge && <div aria-hidden="true" className="pointer-events-none absolute rounded-[3px] shadow-[0_2px_12px_color-mix(in_srgb,var(--color-scrim)_28%,transparent)] ring-1 ring-line-2" style={edge} />}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {overlays}
        </svg>
        {loupe}
        {tip && tipPos && (tip.line || tip.bad) && !finger && !props.phone && (
          <div
            className={`pointer-events-none absolute z-10 flex max-w-[280px] flex-col rounded-lg border px-2.5 py-1.5 shadow-md ${tip.bad ? 'border-danger-line bg-panel' : 'border-line bg-panel'}`}
            style={{ left: tipPos.x + r + 14, top: tipPos.y - 18 }}
          >
            <b className="font-mono text-[13px] font-semibold">{tip.title}</b>
            {tip.line && <span className={`text-label leading-snug ${tip.bad ? 'text-danger-ink' : 'text-ink-2'}`}>{tip.line}</span>}
          </div>
        )}
        {selectedBox && selectedPart && (
          <div className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-[10px] border border-line bg-panel p-1 shadow-md" style={{ left: selectedBox.x, top: selectedBox.y }} onPointerDown={(e) => e.stopPropagation()}>
            <span className="px-2 text-small font-semibold">
              {selectedPart.label}
              {partValueText(selectedPart) ? ` · ${partValueText(selectedPart)}` : ''}
            </span>
            <button type="button" onClick={rotateSelected} className={`flex items-center gap-1 rounded-md px-2 text-small hover:bg-app ${h}`}>
              <Icon name="rotate" className="h-4 w-4" />
              {tr.tahta.toolRotate}
            </button>
            <button type="button" onClick={deleteSelected} className={`flex items-center gap-1 rounded-md px-2 text-small text-danger-ink hover:bg-danger-soft ${h}`}>
              <Icon name="trash" className="h-4 w-4" />
              {tr.tahta.toolDelete}
            </button>
          </div>
        )}
        {pickBox && picked && (
          <div className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-[10px] border border-line bg-panel p-1 shadow-md" style={{ left: pickBox.x, top: pickBox.y }} onPointerDown={(e) => e.stopPropagation()}>
            {picked.kind === 'wire' && <span aria-hidden="true" className="ml-1.5 h-3 w-3 rounded-full ring-1 ring-line-2" style={{ background: WIRE_HEX[build.wires[picked.index]!.color] }} />}
            <span className="px-2 font-mono text-small font-semibold">{pickLabel}</span>
            <button type="button" onClick={deleteSelected} className={`flex items-center gap-1 rounded-md px-2 text-small text-danger-ink hover:bg-danger-soft ${h}`}>
              <Icon name="trash" className="h-4 w-4" />
              {picked.kind === 'wire' ? tr.tahta.toolDelete : tr.tahta.unplug}
            </button>
          </div>
        )}
      </div>

      {cabling && !props.phone && (
        <div
          className="absolute bottom-[72px] left-1/2 z-20 flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-ink py-1.5 pr-2 pl-4 text-small whitespace-nowrap text-on-ink shadow-lg"
          role="group"
          aria-label={cabling.kind === 'wire' ? tr.tahta.wireTool : tr.tahta.leadPrompt(leadName(cabling.part, cabling.pin))}
        >
          {cabling.kind === 'wire' ? (
            <>
              <b className="flex items-center gap-1.5 font-semibold">
                <Swatch color={cabling.color} />
                {tr.tahta.wireTool}
                <span className="font-normal opacity-70">· {cabling.color ? tr.tahta.colors[cabling.color] : tr.tahta.colorAuto.toLocaleLowerCase('tr')}</span>
              </b>
              <span className="opacity-40">|</span>
              {cabling.from ? (
                <>
                  <span className="flex items-center gap-1 text-ok">
                    <Icon name="check" className="h-4 w-4" />
                    {tr.tahta.wireFirstDone(name(cabling.from))}
                  </span>
                  <span>{tr.tahta.wireSecond}</span>
                </>
              ) : (
                <span>{tr.tahta.wireFirst}</span>
              )}
            </>
          ) : (
            <span className="font-semibold">{tr.tahta.leadPrompt(leadName(cabling.part, cabling.pin))}</span>
          )}
          <label className="flex items-center gap-2">
            <span className="opacity-70">{tr.tahta.holeField}</span>
            <input
              ref={input}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const at = typedHole(typed, cols);
                if (!at) warn(tr.tahta.unknownHole(typed.trim()));
                else {
                  setTyped('');
                  cableAt(at);
                }
              }}
              aria-label={tr.tahta.holeFieldLabel}
              spellCheck={false}
              autoComplete="off"
              className="h-8 w-[72px] rounded-md bg-panel px-2 font-mono text-base text-ink outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <button type="button" onClick={() => props.onCabling(null)} className="rounded-md px-1.5 py-1 opacity-80 hover:opacity-100">
            {tr.tahta.escCancel}
          </button>
        </div>
      )}
      {placing && placingPart && !props.phone && (
        <div className="absolute bottom-[72px] left-1/2 z-20 flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-ink py-1.5 pr-2 pl-4 text-small whitespace-nowrap text-on-ink shadow-lg" role="group" aria-label={tr.tahta.placePart(placingPart.label)}>
          <b className="font-semibold">
            {placingPart.label} {partValueText(placingPart)}
          </b>
          <span className="opacity-40">|</span>
          {isFixed(placingPart.type) ? (
            <span>{tr.tahta.fixedPrompt(tr.devices.pinTags[placingPart.type].join(' '))}</span>
          ) : placing.first ? (
            <>
              <span className="flex items-center gap-1 text-ok">
                <Icon name="check" className="h-4 w-4" />
                {tr.tahta.firstDone(name(placing.first))}
              </span>
              <span>{tr.tahta.secondLeg(secondPinName)}</span>
            </>
          ) : (
            <span>
              {tr.tahta.firstLeg(firstPinName)}
              {placingPart.type === 'led' ? ` · ${tr.tahta.ledHint}` : ''}
            </span>
          )}
          <label className="flex items-center gap-2">
            <span className="opacity-70">{tr.tahta.holeField}</span>
            <input
              ref={input}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const at = typedHole(typed, cols);
                if (!at) warn(tr.tahta.unknownHole(typed.trim()));
                else {
                  setTyped('');
                  placeAt(at);
                }
              }}
              aria-label={tr.tahta.holeFieldLabel}
              spellCheck={false}
              autoComplete="off"
              className="h-8 w-[72px] rounded-md bg-panel px-2 font-mono text-base text-ink outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <button type="button" onClick={() => props.onPlacing(null)} className="rounded-md px-1.5 py-1 opacity-80 hover:opacity-100">
            {tr.tahta.escCancel}
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="pointer-events-none absolute top-16 left-1/2 z-30 m-0 -translate-x-1/2 rounded-full border border-danger-line bg-panel px-3.5 py-1.5 text-small text-danger-ink shadow-md">
          {notice}
        </p>
      )}
    </>
  );
}
