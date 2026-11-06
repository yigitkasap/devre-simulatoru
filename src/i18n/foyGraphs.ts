// Föydeki grafikler (analiz v2): her föy şeklinin adımlarına bağlı hazır grafikler. Başlangıç ekranında
// açık örnek föydeyse "Föydeki grafikler · Deney N · Şekil-M" bölümünde kart olarak görünür; tıklanınca
// grafik kurulur ve çizilir. Sonuçları testte simülasyonla ölçülür (tests/analiz-foy.test.ts).

import type { FoyGraphRef } from '../model/analysis';

export interface FoyGraphDef {
  readonly key: string;
  /** Föydeki adım numaraları ("2–3"). */
  readonly steps: string;
  /** Üst yazının ikinci kısmı ("ÇIKIŞ KARAKTERİSTİĞİ"). */
  readonly topic: string;
  readonly title: string;
}

/** Örnek kimliği → o şeklin föy grafikleri. */
export const FOY_GRAPHS: Readonly<Record<string, readonly FoyGraphDef[]>> = {};

export function foyGraph(ref: FoyGraphRef): FoyGraphDef | null {
  return FOY_GRAPHS[ref.example]?.find((g) => g.key === ref.key) ?? null;
}
