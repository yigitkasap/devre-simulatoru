// Çözüm motorunun genel API'si. Arayüz motoru yalnızca bu dosya üzerinden kullanır.

export { CircuitSimulator, type AdvanceResult, type SimulatorOptions } from './engine';
export { compileNetlist, type CompiledCircuit } from './compile';
export { hasErrors, type Diagnostic, type DiagnosticCode, type DiagnosticSeverity } from './diagnostics';
export {
  GROUND_NET,
  boolProp,
  numProp,
  strProp,
  type DeviceType,
  type Netlist,
  type NetlistElement,
  type NetlistLink,
  type PropValue,
  type Props,
} from './netlist';
export {
  AMMETER_DEFAULTS,
  BATTERY_DEFAULTS,
  CAPACITOR_DEFAULTS,
  DEVICE_MODELS,
  DIODE_EMISSION,
  DIODE_SATURATION,
  LED_COLORS,
  LED_DEFAULTS,
  LED_MODELS,
  LED_NOMINAL_CURRENT,
  RESISTOR_DEFAULTS,
  SWITCH_DEFAULTS,
  VOLTMETER_DEFAULTS,
  ledBrightness,
  type DeviceStatus,
  type LedColor,
  type Measurement,
} from './devices';
export {
  formatEditable,
  formatNumber,
  formatSI,
  parseValue,
  type FormatOptions,
  type ParseError,
  type ParseResult,
  type UnitSymbol,
} from './units';
export * as constants from './constants';
