import type { MnaSystem } from '../mna';
import { strProp, type Props } from '../netlist';
import { AmmeterDevice, AMMETER_DEFAULTS } from './ammeter';
import type { DeviceInit, DeviceModel } from './device';
import { VoltmeterDevice, VOLTMETER_DEFAULTS } from './voltmeter';

// Multimetre (MM): arıza bulmadaki (B2) aletle aynı ölçüm. İkinci bir model yoktur: V ⎓ ve V ∿
// kiplerinde devredeki voltmetre (iç direnç 10 MΩ), A kipinde devredeki ampermetre (iç direnç 0,1 Ω,
// DC kipinde ortalama) olarak çözülür. Ω kipinde simülasyon sırasında devreden çıkar (açık devre); Ω
// yalnızca simülasyon durmuşken ölçülür (editor/fault/meter.ts → measureResistance, güç kapalı).
// Pinler: [0] = VΩ (kırmızı uç), [1] = COM (siyah uç).

export const MULTIMETER_MODES = ['dc', 'ac', 'a', 'ohm'] as const;
export type MultimeterMode = (typeof MULTIMETER_MODES)[number];
export const MULTIMETER_DEFAULTS = { mode: 'dc' as MultimeterMode };

export function multimeterMode(props: Props): MultimeterMode {
  return strProp(props, 'mode', MULTIMETER_MODES, MULTIMETER_DEFAULTS.mode);
}

/** Kipine göre alet: voltmetre ya da ampermetre özellikleri (B2'deki multimetreyle aynı iç dirençler). */
function meterInit(init: DeviceInit, mode: MultimeterMode): DeviceInit {
  if (mode === 'a') return { ...init, props: { mode: 'dc', resistance: AMMETER_DEFAULTS.resistance, ideal: false } };
  // Ω kipinde devreden çıkar: ideal voltmetre matrise hiçbir şey eklemez.
  return { ...init, props: { mode: mode === 'ac' ? 'ac' : 'dc', resistance: VOLTMETER_DEFAULTS.resistance, ideal: mode === 'ohm' } };
}

/** Voltmetre ya da Ω kipindeki multimetre: ampermetre kipi için ayrılan akım satırı kullanılmaz (x[k] = 0). */
class MultimeterVoltmeter extends VoltmeterDevice {
  override stampStatic(sys: MnaSystem): void {
    super.stampStatic(sys);
    sys.add(this.branches[0]!, this.branches[0]!, 1);
  }
}

export const multimeterModel: DeviceModel = {
  type: 'multimeter',
  pinCount: 2,
  internalNodes: 0,
  // Kip değişince yapı değişmesin diye ampermetrenin akım satırı her zaman ayrılır.
  branchCount: 1,
  couplingPins: (props) => (multimeterMode(props) === 'ohm' ? [] : [[0, 1]]),
  create: (init) => {
    const mode = multimeterMode(init.props);
    return mode === 'a' ? new AmmeterDevice(meterInit(init, mode)) : new MultimeterVoltmeter(meterInit(init, mode));
  },
};
