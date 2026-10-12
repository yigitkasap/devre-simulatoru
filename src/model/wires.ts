// Köşeli kablo işlemleri: sadeleştirme, L biçimli yönlendirme, uç esnetme, parça sürükleme.

import type { Box } from './catalog';
import { samePoint } from './geometry';
import type { Point } from './types';

/** Art arda aynı noktaları ve aynı doğru üzerindeki ara köşeleri kaldırır. */
export function normalizePoints(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && samePoint(last, p)) continue;
    out.push(p);
  }
  // Aynı doğru üzerinde ve arada kalan köşeleri kaldır (geri dönen kıvrımlara dokunma).
  for (let i = 1; i + 1 < out.length; ) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const horizontal = a.y === b.y && b.y === c.y && (b.x - a.x) * (c.x - b.x) > 0;
    const vertical = a.x === b.x && b.x === c.x && (b.y - a.y) * (c.y - b.y) > 0;
    if (horizontal || vertical) out.splice(i, 1);
    else i++;
  }
  return out;
}

/**
 * `from` noktasından `to` noktasına yatay/dikey bir yol (from hariç).
 * Hizalı değilse bir köşe eklenir; `horizontalFirst` köşenin hangi yanda olacağını seçer.
 */
export function routeL(from: Point, to: Point, horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)): Point[] {
  if (from.x === to.x || from.y === to.y) return [to];
  const corner = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  return [corner, to];
}

/**
 * Kablonun bir ucunu yeni konuma taşır; komşu köşeyi de kaydırarak parçaları yatay/dikey tutar.
 * Tek parçalı kablo eğik kalacaksa araya bir köşe eklenir.
 */
export function moveEndpoint(points: readonly Point[], which: 'start' | 'end', to: Point): Point[] {
  const pts = which === 'start' ? [...points].reverse() : [...points];
  const n = pts.length;
  const last = pts[n - 1]!;
  const prev = pts[n - 2];
  if (!prev) return [to];
  const wasHorizontal = prev.y === last.y && prev.x !== last.x;
  const wasVertical = prev.x === last.x && prev.y !== last.y;
  if (n === 2) {
    pts[n - 1] = to;
    if (prev.x !== to.x && prev.y !== to.y) {
      const elbow = wasVertical ? { x: prev.x, y: to.y } : { x: to.x, y: prev.y };
      pts.splice(n - 1, 0, elbow);
    }
  } else {
    if (wasHorizontal) pts[n - 2] = { x: prev.x, y: to.y };
    else if (wasVertical) pts[n - 2] = { x: to.x, y: prev.y };
    pts[n - 1] = to;
  }
  const result = normalizePoints(pts);
  return which === 'start' ? result.reverse() : result;
}

/**
 * i. parçayı (points[i] → points[i+1]) kendine dik yönde kaydırır. Uç parçalarda uç noktası
 * yerinde kalır ve araya kısa bir dik parça eklenir.
 */
export function moveSegment(points: readonly Point[], index: number, delta: Point): Point[] {
  const a = points[index];
  const b = points[index + 1];
  if (!a || !b) return [...points];
  const horizontal = a.y === b.y;
  const vertical = a.x === b.x;
  if (!horizontal && !vertical) return [...points];
  const pts = [...points];
  let i = index;
  if (i === 0) {
    pts.unshift(pts[0]!);
    i += 1;
  }
  if (i + 1 === pts.length - 1) pts.push(pts[pts.length - 1]!);
  const shift = (p: Point): Point => (horizontal ? { x: p.x, y: p.y + delta.y } : { x: p.x + delta.x, y: p.y });
  pts[i] = shift(pts[i]!);
  pts[i + 1] = shift(pts[i + 1]!);
  return normalizePoints(pts);
}

export function translatePoints(points: readonly Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Kablo parçalarının uzunlukları toplamı. */
export function wireLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y);
  }
  return length;
}

/** Yatay/dikey [a, b] parçası kutunun İÇİNDEN geçiyor mu? (Kenara değmek sayılmaz.) */
export function crossesBoxInterior(a: Point, b: Point, box: Box): boolean {
  const x0 = box.x;
  const x1 = box.x + box.w;
  const y0 = box.y;
  const y1 = box.y + box.h;
  if (a.y === b.y) {
    if (!(a.y > y0 && a.y < y1)) return false;
    return Math.min(a.x, b.x) < x1 && Math.max(a.x, b.x) > x0;
  }
  if (a.x === b.x) {
    if (!(a.x > x0 && a.x < x1)) return false;
    return Math.min(a.y, b.y) < y1 && Math.max(a.y, b.y) > y0;
  }
  return false;
}

function routeAvoiding(from: Point, to: Point, avoid: Box): Point[] {
  const crosses = (route: Point[]) => {
    let prev = from;
    for (const p of route) {
      if (crossesBoxInterior(prev, p, avoid)) return true;
      prev = p;
    }
    return false;
  };
  if (from.x === to.x || from.y === to.y) {
    const straight = [to];
    if (!crosses(straight)) return straight;
    // Hizalı ama parçanın içinden geçiyor: kutunun üstünden/altından (ya da yanından) dolaş.
    const detours: Point[][] =
      from.y === to.y
        ? [avoid.y - 1, avoid.y + avoid.h + 1].map((y) => [{ x: from.x, y: Math.round(y) }, { x: to.x, y: Math.round(y) }, to])
        : [avoid.x - 1, avoid.x + avoid.w + 1].map((x) => [{ x: Math.round(x), y: from.y }, { x: Math.round(x), y: to.y }, to]);
    return detours.find((d) => !crosses(d)) ?? straight;
  }
  const cx = avoid.x + avoid.w / 2;
  const cy = avoid.y + avoid.h / 2;
  const routes = [
    [{ x: to.x, y: from.y }, to],
    [{ x: from.x, y: to.y }, to],
  ].sort((r1, r2) => {
    const bad = Number(crosses(r1)) - Number(crosses(r2));
    if (bad !== 0) return bad;
    // İkisi de uygunsa köşesi parçadan uzak olanı seç.
    return Math.hypot(r2[0]!.x - cx, r2[0]!.y - cy) - Math.hypot(r1[0]!.x - cx, r1[0]!.y - cy);
  });
  return routes[0]!;
}

/**
 * Döndürülen parçanın pinine bağlı kablo ucunu yeni pin konumuna yeniden yönlendirir.
 *
 * Kablonun parçanın yakınındaki (`vicinity`) kuyruğu atılır ve ondan önceki ilk köşeden yeni pine,
 * parçanın gövdesinden (`avoid`) geçmeyen yatay/dikey bir yol çizilir. Yalnızca ucu kaydırmak
 * 180°'lik dönüşte kabloyu parçanın üstünden geçirip diğer uca bağlayabilir (kısa devre); her
 * dönüşte son köşeden devam etmek ise kabloyu sarmal gibi uzatır. Kuyruk atıldığı için dört
 * dönüşten sonra kablolar başlangıçtaki haline döner.
 */
export function rerouteEndpoint(
  points: readonly Point[],
  which: 'start' | 'end',
  to: Point,
  avoid: Box,
  vicinity: Box,
): Point[] {
  const pts = which === 'start' ? [...points].reverse() : [...points];
  const base = pts.slice(0, -1);
  const near = (p: Point) =>
    p.x >= vicinity.x && p.x <= vicinity.x + vicinity.w && p.y >= vicinity.y && p.y <= vicinity.y + vicinity.h;
  while (base.length > 1 && near(base[base.length - 1]!)) base.pop();
  const prev = base[base.length - 1]!;
  const route = samePoint(prev, to) ? [] : routeAvoiding(prev, to, avoid);
  // Eklenen yolun başında geri dönen kıvrım (A → B → A doğrultusunda) oluştuysa onu kaldır.
  while (base.length >= 2 && route.length > 0) {
    const a = base[base.length - 2]!;
    const b = base[base.length - 1]!;
    const c = route[0]!;
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    const backtrack = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0;
    if (!(collinear && backtrack)) break;
    base.pop();
  }
  const result = normalizePoints([...base, ...route]);
  return which === 'start' ? result.reverse() : result;
}
