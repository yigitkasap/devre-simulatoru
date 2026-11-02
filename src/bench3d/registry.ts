// Parça türü → 3B model. Breadboard'a takılan parçalarda bacaklar verilen deliklere (yerel) gider.

import type { Vector3 } from 'three';
import type { Part } from '../model/types';
import { dipChipModel } from './breadboardModel';
import { withAnchors } from './kit';
import { arduinoModel } from './arduinoModel';
import { dcsupplyModel, funcgenModel, meterModel, multimeterModel, oscilloscopeModel, tankModel } from './instruments';
import type { PartModel } from './model';
import {
  batteryModel,
  bridgeModel,
  buzzerModel,
  capacitorModel,
  currentSourceModel,
  diodeModel,
  fuseModel,
  groundModel,
  icModuleModel,
  inductorModel,
  lampModel,
  ldrModel,
  ledModel,
  motorModel,
  ntcModel,
  optoModel,
  potentiometerModel,
  pushButtonModel,
  relayModel,
  resistorModel,
  schottkyModel,
  sourceBoxModel,
  speakerModel,
  to220Model,
  spdtModel,
  switchModel,
  transformerModel,
  transistorModel,
  zenerModel,
} from './parts';

/**
 * `holes`: breadboard'a takılıyorsa bacakların bittiği yerel konumlar (pin sırasıyla); `extra`: DIP'in
 * boş bacakları. Verilmezse parça masada, bacakları şema pinleri × SPREAD'de.
 */
export function buildPartModel(part: Part, holes: readonly Vector3[] | null = null, extra: readonly Vector3[] = []): PartModel {
  if (holes && (part.type === 'opamp' || part.type === 'timer555')) return dipChipModel(part.type, holes, extra);
  if (holes && part.type === 'pushbutton') return withAnchors(holes, () => pushButtonModel(extra));
  return withAnchors(holes, () => build(part));
}

function build(part: Part): PartModel {
  const p = part.props;
  switch (part.type) {
    case 'resistor':
      return resistorModel(p);
    case 'capacitor':
      return capacitorModel(p);
    case 'inductor':
      return inductorModel();
    case 'potentiometer':
      return potentiometerModel(p);
    case 'ldr':
      return ldrModel();
    case 'ntc':
      return ntcModel();
    case 'fuse':
      return fuseModel();
    case 'diode':
      return diodeModel();
    case 'zener':
      return zenerModel();
    case 'led':
      return ledModel(p);
    case 'npn':
    case 'pnp':
    case 'njfet':
    case 'pjfet':
    case 'nmos':
    case 'pmos':
      return transistorModel(part.type, p);
    case 'opamp':
      return icModuleModel('opamp', ['−', '+', 'OUT', 'V+', 'V−']);
    case 'timer555':
      return icModuleModel('timer555', ['GND', 'TRG', 'OUT', 'RST', 'CV', 'THR', 'DIS', 'VCC']);
    case 'arduino':
      return arduinoModel();
    case 'switch':
      return switchModel(p);
    case 'pushbutton':
      return pushButtonModel();
    case 'spdt':
      return spdtModel(p);
    case 'bridge':
      return bridgeModel(p);
    case 'schottky':
      return schottkyModel(p);
    case 'reg7805':
      // Bacak sırası IN, GND, OUT (ST L78 Şekil 2).
      return to220Model('reg7805', 'L7805CV', '5 V · 1,5 A', [0, 1, 2]);
    case 'opto':
      return optoModel(p);
    case 'lm317':
      // Bacak sırası ADJ, OUT, IN (ST LM317 Şekil 1, TI Şekil 5-2).
      return to220Model('lm317', 'LM317T', 'ADJ · 1,5 A', [1, 2, 0]);
    case 'lamp':
      return lampModel();
    case 'speaker':
      return speakerModel();
    case 'buzzer':
      return buzzerModel();
    case 'motor':
      return motorModel();
    case 'relay':
      return relayModel();
    case 'transformer':
      return transformerModel();
    case 'battery':
      return batteryModel(p);
    case 'acsource':
      return sourceBoxModel('acsource', 'AC');
    case 'currentsource':
      return currentSourceModel(p);
    case 'ground':
      return groundModel();
    case 'voltmeter':
    case 'ammeter':
      return meterModel(part.type);
    case 'multimeter':
      return multimeterModel();
    case 'dcsupply':
      return dcsupplyModel();
    case 'funcgen':
      return funcgenModel();
    case 'oscilloscope':
      return oscilloscopeModel();
    case 'tank':
      return tankModel();
  }
}
