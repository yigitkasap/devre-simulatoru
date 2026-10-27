// Parça türü → 3B model. Breadboard'a takılan parçalarda bacaklar verilen deliklere (yerel) gider.

import type { Vector3 } from 'three';
import type { Part } from '../model/types';
import { dipChipModel } from './breadboardModel';
import { withAnchors } from './kit';
import { arduinoModel } from './arduinoModel';
import { dcsupplyModel, funcgenModel, meterModel, oscilloscopeModel, tankModel } from './instruments';
import type { PartModel } from './model';
import {
  batteryModel,
  buzzerModel,
  capacitorModel,
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
  potentiometerModel,
  relayModel,
  resistorModel,
  sourceBoxModel,
  speakerModel,
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
    case 'ground':
      return groundModel();
    case 'voltmeter':
    case 'ammeter':
      return meterModel(part.type);
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
