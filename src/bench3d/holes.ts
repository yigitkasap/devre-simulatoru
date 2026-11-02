// Breadboard delikleri: adları (lehim rehberindekiyle aynı), addan deliğe çözüm ve deliğin bağlı olduğu
// iletken (şerit ya da ray). Üç'süz, saf hesap.
//
// Adlar: şeritte sütun ve satır ("12c"); rayda "üst + rayı (12. sütun hizası)". Birden çok kartta önüne
// kart numarası ("2. kart, 12c").

import { railHoles, railX, type Hole } from './breadboard';

const ROWS = 'abcdefghij';

/** Ray deliğinin hizasındaki sütun (rehberdeki adın sayısı). */
export function railColumn(k: number, cols: number): number {
  return Math.round(railX(k, cols) + (cols + 1) / 2);
}

export function holeLabel(h: Hole, cols: number, boards = 1): string {
  const board = boards > 1 ? `${h.board + 1}. kart, ` : '';
  if (h.kind === 'strip') return `${board}${h.col}${ROWS[h.row]}`;
  const side = h.rail <= 1 ? 'üst' : 'alt';
  const sign = h.rail === 0 || h.rail === 3 ? '+' : '−';
  return `${board}${side} ${sign} rayı (${railColumn(h.k, cols)}. sütun hizası)`;
}

const STRIP = /^(?:(\d+)\. kart, )?(\d+)([a-j])$/;
const RAIL = /^(?:(\d+)\. kart, )?(üst|alt) ([+−-]) rayı \((\d+)\. sütun hizası\)$/;

/** Addan delik; ad geçersizse ya da kartta öyle bir delik yoksa null. */
export function parseHole(name: string, cols: number, boards = 1): Hole | null {
  const text = name.trim();
  const strip = STRIP.exec(text);
  if (strip) {
    const board = strip[1] ? Number(strip[1]) - 1 : 0;
    const col = Number(strip[2]);
    if (board < 0 || board >= boards || col < 1 || col > cols) return null;
    return { kind: 'strip', board, col, row: ROWS.indexOf(strip[3]!) };
  }
  const rail = RAIL.exec(text);
  if (rail) {
    const board = rail[1] ? Number(rail[1]) - 1 : 0;
    if (board < 0 || board >= boards) return null;
    const top = rail[2] === 'üst';
    const plus = rail[3] === '+';
    const index = top ? (plus ? 0 : 1) : plus ? 3 : 2;
    const col = Number(rail[4]);
    for (let k = 0; k < railHoles(cols); k++) if (railColumn(k, cols) === col) return { kind: 'rail', board, rail: index, k };
  }
  return null;
}

/** Deliğin bağlı olduğu iletken: şerit (5 delik) ya da ray (bütün delikleri). */
export function conductorOf(h: Hole): string {
  return h.kind === 'strip' ? `s${h.board}:${h.col}:${h.row < 5 ? 0 : 1}` : `r${h.board}:${h.rail}`;
}

/** Bir kartın bütün delikleri (şeritler, sonra raylar). */
export function allHoles(cols: number, board = 0): Hole[] {
  const out: Hole[] = [];
  for (let col = 1; col <= cols; col++) for (let row = 0; row < 10; row++) out.push({ kind: 'strip', board, col, row });
  for (let rail = 0; rail < 4; rail++) for (let k = 0; k < railHoles(cols); k++) out.push({ kind: 'rail', board, rail, k });
  return out;
}

/** Aynı iletkendeki bütün delikler (bağlı delikler: şeritte 5, rayda 25 ya da 50). */
export function connectedHoles(h: Hole, cols: number): Hole[] {
  if (h.kind === 'strip') {
    const first = h.row < 5 ? 0 : 5;
    return Array.from({ length: 5 }, (_, i) => ({ kind: 'strip' as const, board: h.board, col: h.col, row: first + i }));
  }
  return Array.from({ length: railHoles(cols) }, (_, k) => ({ kind: 'rail' as const, board: h.board, rail: h.rail, k }));
}

export function sameHole(a: Hole, b: Hole): boolean {
  return a.kind === 'strip' && b.kind === 'strip'
    ? a.board === b.board && a.col === b.col && a.row === b.row
    : a.kind === 'rail' && b.kind === 'rail' && a.board === b.board && a.rail === b.rail && a.k === b.k;
}
