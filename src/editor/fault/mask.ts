// Arıza bulmada (B2) otomatik göstergeler kapalıyken defterin ve panellerin gördüğü kare: yalnızca ölçü
// aletlerinin ve laboratuvar cihazlarının (osiloskop, üreteç, güç kaynağı) değerleri kalır; kablo
// gerilimleri, parçaların canlı ölçümleri ve simülasyon uyarıları çıkarılır. Öğrenci yalnızca ölçü
// aletleriyle ölçer.

import type { CircuitDoc } from '../../model/types';
import type { DeviceType } from '../../sim/netlist';
import type { LiveVisual } from '../symbols';
import type { SimFrame } from '../useSimulation';

export const INSTRUMENTS: ReadonlySet<DeviceType> = new Set(['voltmeter', 'ammeter', 'multimeter', 'oscilloscope', 'funcgen', 'dcsupply']);

export function maskFrame(frame: SimFrame, doc: CircuitDoc): SimFrame {
  const keep = new Set(doc.parts.filter((p) => INSTRUMENTS.has(p.type)).map((p) => p.id));
  const only = <T,>(map: ReadonlyMap<string, T>): ReadonlyMap<string, T> => new Map([...map].filter(([id]) => keep.has(id)));
  return {
    ...frame,
    wireVoltages: new Map(),
    wireSummaries: new Map(),
    partFlows: only(frame.partFlows),
    pinFlows: only(frame.pinFlows),
    live: only(frame.live),
    measurements: only(frame.measurements),
    statuses: only(frame.statuses),
    summaries: only(frame.summaries),
    meterTexts: only(frame.meterTexts),
    runtime: [],
    alarms: new Set(),
  };
}

/**
 * Şemadaki parça görsellerinden gerçekte de görülen ya da duyulanlar: LED'in ve lambanın ışığı, yanmış
 * LED, motorun dönüşü, rölenin çekmesi, ses, hazne seviyesi, Arduino'nun LED'leri, güç kaynağının CC
 * ışığı. Kondansatörün dolma çubuğu, direncin ısınması, iyonlar ve manyetik alan çizilmez.
 */
export function visibleLive(live: LiveVisual): LiveVisual {
  const { brightness, burned, level, energized, ledL, ledTx, loudness, glow, temperature, angle, currentLimited } = live;
  const kept: Record<string, unknown> = { brightness, burned, level, energized, ledL, ledTx, loudness, glow, temperature, angle, currentLimited };
  return Object.fromEntries(Object.entries(kept).filter(([, v]) => v !== undefined)) as LiveVisual;
}
