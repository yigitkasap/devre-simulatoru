// Bileşen modelleri kaydı. Yeni bir bileşen (ör. transistör) eklemek için:
//   1. netlist.ts → DeviceType birleşimine türü ekle,
//   2. bu klasörde Device sınıfını ve DeviceModel'i yaz,
//   3. aşağıdaki tabloya ekle.

import type { DeviceType } from '../netlist';
import { acSourceModel } from './acsource';
import { ammeterModel } from './ammeter';
import { batteryModel } from './battery';
import { capacitorModel } from './capacitor';
import type { DeviceModel } from './device';
import { diodeModel } from './diode';
import { groundModel } from './ground';
import { ledModel } from './led';
import { oscilloscopeModel } from './oscilloscope';
import { resistorModel } from './resistor';
import { switchModel } from './switch';
import { voltmeterModel } from './voltmeter';

export const DEVICE_MODELS: Readonly<Record<DeviceType, DeviceModel>> = {
  battery: batteryModel,
  acsource: acSourceModel,
  ground: groundModel,
  resistor: resistorModel,
  capacitor: capacitorModel,
  diode: diodeModel,
  led: ledModel,
  switch: switchModel,
  voltmeter: voltmeterModel,
  ammeter: ammeterModel,
  oscilloscope: oscilloscopeModel,
};

export * from './device';
export {
  AcSourceDevice,
  AC_MAX_FREQUENCY,
  AC_SOURCE_DEFAULTS,
  WAVEFORMS,
  acRms,
  rmsFactor,
  waveValue,
  type Waveform,
} from './acsource';
export { AmmeterDevice, AMMETER_DEFAULTS } from './ammeter';
export { BatteryDevice, BATTERY_DEFAULTS } from './battery';
export { CapacitorDevice, CAPACITOR_DEFAULTS } from './capacitor';
export { DiodeDevice, DIODE_EMISSION, DIODE_SATURATION } from './diode';
export { GroundDevice } from './ground';
export {
  LedDevice,
  LED_COLORS,
  LED_DEFAULTS,
  LED_MODELS,
  LED_NOMINAL_CURRENT,
  ledBrightness,
  ledSaturationCurrent,
  type LedColor,
  type LedModelParams,
} from './led';
export {
  OscilloscopeDevice,
  OSCILLOSCOPE_DEFAULTS,
  SCOPE_TRIGGERS,
  TIME_PER_DIV_STEPS,
  VOLTS_PER_DIV_STEPS,
  scopeSettings,
  type ScopeSettings,
  type ScopeTrigger,
} from './oscilloscope';
export { ResistorDevice, RESISTOR_DEFAULTS } from './resistor';
export { SwitchDevice, SWITCH_DEFAULTS } from './switch';
export { VoltmeterDevice, VOLTMETER_DEFAULTS } from './voltmeter';
