// Şema belgesi: kaydedilen, paylaşılan ve geri alınan veri. Koordinatlar ızgara birimindedir
// (tamsayı); ekranda bir ızgara birimi GRID piksel olarak çizilir.

import type { DeviceType, PropValue } from '../sim/netlist';

export const DOC_VERSION = 1;

/** Bir ızgara biriminin dünya koordinatındaki piksel karşılığı. */
export const GRID = 10;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/** Tuvale yerleştirilmiş bir parça. */
export interface Part {
  /** Kalıcı iç kimlik (p1, p2...). */
  readonly id: string;
  readonly type: DeviceType;
  /** Tuvalde görünen ad (R1, B1...). */
  readonly label: string;
  readonly x: number;
  readonly y: number;
  /** Saat yönünde döndürme (ekranda y aşağı doğru). */
  readonly rotation: Rotation;
  readonly props: Readonly<Record<string, PropValue>>;
}

/** Köşeli kablo: ardışık noktalar arasında düz parçalar. */
export interface Wire {
  readonly id: string;
  readonly points: readonly Point[];
}

export interface CircuitDoc {
  readonly version: typeof DOC_VERSION;
  readonly parts: readonly Part[];
  readonly wires: readonly Wire[];
}

export function emptyDoc(): CircuitDoc {
  return { version: DOC_VERSION, parts: [], wires: [] };
}
