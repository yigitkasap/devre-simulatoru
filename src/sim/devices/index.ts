// Bileşen modelleri kaydı. Yeni bir bileşen (ör. transistör) eklemek için:
//   1. netlist.ts → DeviceType birleşimine türü ekle,
//   2. bu klasörde Device sınıfını ve DeviceModel'i yaz,
//   3. aşağıdaki tabloya ekle.

import type { DeviceType } from '../netlist';
import { acSourceModel } from './acsource';
import { ammeterModel } from './ammeter';
import { batteryModel } from './battery';
import { npnModel, pnpModel } from './bjt';
import { capacitorModel } from './capacitor';
import { dcsupplyModel } from './dcsupply';
import type { DeviceModel } from './device';
import { diodeModel } from './diode';
import { njfetModel, nmosModel, pjfetModel, pmosModel } from './fet';
import { funcgenModel } from './funcgen';
import { groundModel } from './ground';
import { ledModel } from './led';
import { oscilloscopeModel } from './oscilloscope';
import { resistorModel } from './resistor';
import { switchModel } from './switch';
import { tankModel } from './tank';
import { voltmeterModel } from './voltmeter';
import { zenerModel } from './zener';

export const DEVICE_MODELS: Readonly<Record<DeviceType, DeviceModel>> = {
  battery: batteryModel,
  acsource: acSourceModel,
  funcgen: funcgenModel,
  dcsupply: dcsupplyModel,
  ground: groundModel,
  resistor: resistorModel,
  capacitor: capacitorModel,
  diode: diodeModel,
  zener: zenerModel,
  led: ledModel,
  npn: npnModel,
  pnp: pnpModel,
  njfet: njfetModel,
  pjfet: pjfetModel,
  nmos: nmosModel,
  pmos: pmosModel,
  switch: switchModel,
  tank: tankModel,
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
  waveAtPhase,
  waveValue,
  type Waveform,
} from './acsource';
export { DCSUPPLY_DEFAULTS, DCSUPPLY_MAX_VOLTAGE, DcSupplyDevice, dcsupplySettings } from './dcsupply';
export {
  FUNCGEN_DEFAULTS,
  FUNCGEN_LIMITS,
  FUNCGEN_OUTPUT_RESISTANCE,
  FUNCGEN_TTL_HIGH,
  FuncgenDevice,
  funcgenSettings,
  warpPhase,
} from './funcgen';
export { AmmeterDevice, AMMETER_DEFAULTS } from './ammeter';
export { BatteryDevice, BATTERY_DEFAULTS } from './battery';
export { BjtDevice, BJT_DEFAULTS, BJT_PARAMS, NPN_DEFAULTS, NPN_LEGACY_MODEL, NPN_MODELS, evaluateBjt, type NpnModelName } from './bjt';
export {
  FET_LAMBDA,
  JFET_DEFAULTS,
  JfetDevice,
  MOSFET_DEFAULTS,
  MosfetDevice,
  NJFET_DEFAULTS,
  NJFET_LEGACY_MODEL,
  NJFET_MODELS,
  NJFET_PRESETS,
  NMOS_DEFAULTS,
  NMOS_LEGACY_MODEL,
  NMOS_MODELS,
  NMOS_PRESETS,
  PJFET_DEFAULTS,
  PMOSFET_DEFAULTS,
  channelCurrent,
  type NjfetModelName,
  type NmosModelName,
} from './fet';
export { ZENER_DEFAULTS, ZENER_TEST_CURRENT, ZenerDevice } from './zener';
export { CapacitorDevice, CAPACITOR_DEFAULTS, CAPACITOR_KINDS, CAPACITOR_LEGACY_KIND, type CapacitorKind } from './capacitor';
export {
  DiodeDevice,
  DIODE_DEFAULTS,
  DIODE_EMISSION,
  DIODE_LEGACY_MODEL,
  DIODE_MODELS,
  DIODE_MODEL_PARAMS,
  DIODE_SATURATION,
  type DiodeModelName,
} from './diode';
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
  SCOPE_AC_CUTOFF,
  SCOPE_COUPLINGS,
  SCOPE_INPUTS,
  SCOPE_INPUT_CAPACITANCE,
  SCOPE_INPUT_RESISTANCE,
  SCOPE_MODES,
  SCOPE_TRIGGERS,
  TIME_PER_DIV_STEPS,
  VOLTS_PER_DIV_STEPS,
  scopeSettings,
  type ScopeCoupling,
  type ScopeInput,
  type ScopeMode,
  type ScopeSettings,
  type ScopeTrigger,
} from './oscilloscope';
export { ResistorDevice, RESISTOR_DEFAULTS } from './resistor';
export { SwitchDevice, SWITCH_DEFAULTS } from './switch';
export {
  TANK_DEFAULTS,
  TANK_LIMITS,
  TANK_MODES,
  TANK_PROBE_HEIGHTS,
  TankDevice,
  probeWetness,
  tankSettings,
  type TankMode,
  type TankSettings,
} from './tank';
export { VoltmeterDevice, VOLTMETER_DEFAULTS } from './voltmeter';
