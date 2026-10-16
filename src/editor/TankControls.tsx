// Su haznesinin denetimleri: raftaki ön panel ve telefonun Cihazlar sayfası aynı bileşeni kullanır.
// Seviye göstergesi ve ıslak prob lambaları, seviyeyi elle ayarlayan kaydırıcı, su akışı (Boşalt /
// Dur / Doldur), dolma süresi, su direnci ve jaklar. Ayarlar parçanın özelliklerinde saklanır;
// kaydırıcı bırakılınca uygulanır (geri al geçmişi her piksel için dolmasın).

import { useState } from 'react';
import { tr } from '../i18n/tr';
import { CATALOG, type NumberPropDef } from '../model/catalog';
import type { Part } from '../model/types';
import type { DeviceStatus } from '../sim/devices';
import { TANK_LIMITS, TANK_PROBE_HEIGHTS, probeWetness, tankSettings, type TankMode } from '../sim/devices/tank';
import type { PropValue } from '../sim/netlist';
import { formatEditable, formatNumber, formatSI } from '../sim/units';
import { validateNumber } from './propertyForm';
import { Face, Jack, Lcd, PanelLabel, Segmented, StatusLamp, Stepper, step125 } from './RackControls';

/** Su rengi (sembol ve kaydırıcı). */
export const WATER_COLOR = '#2f7fc4';

function typed(part: Part, key: string, onChange: (patch: Record<string, PropValue>) => void) {
  return (text: string): boolean => {
    const def = CATALOG[part.type].propDefs.find((p): p is NumberPropDef => p.key === key && p.kind === 'number');
    if (!def) return false;
    const result = validateNumber(def, text);
    if ('error' in result) return false;
    onChange({ [key]: result.value });
    return true;
  };
}

export interface TankControlsProps {
  readonly part: Part;
  /** Simülasyon çalışmıyorsa boş. */
  readonly status: DeviceStatus;
  readonly running: boolean;
  readonly onChange: (patch: Record<string, PropValue>) => void;
  /** Jak: tuvalde ilgili ucu göster (0 = ortak, 1–3 = seviye probları). */
  readonly onJack: (pin: number) => void;
  /** Telefon: 44 px denetimler. */
  readonly touch?: boolean;
  /** Jaklar gösterilsin mi (tuvali olmayan sayfada gereksiz). */
  readonly jacks?: boolean;
  /** Alttaki not; verilmezse raftaki açıklama. */
  readonly note?: string;
}

export function TankControls({ part, status, running, onChange, onJack, touch = false, jacks = true, note }: TankControlsProps) {
  const s = tankSettings(part.props);
  const level = running && status.level !== undefined ? status.level : s.level;
  const [dragged, setDragged] = useState<number | null>(null);
  const shown = dragged ?? level;
  const wet = TANK_PROBE_HEIGHTS.map((h) => probeWetness(shown, h) > 0.5);
  const commit = () => {
    if (dragged === null) return;
    onChange({ level: Math.round(dragged) });
    setDragged(null);
  };
  const levelText = `%${formatNumber(shown, 0)}`;
  const modes: ReadonlyArray<{ value: TankMode; text: string }> = [
    { value: 'drain', text: tr.properties.optionLabel('mode', 'drain') },
    { value: 'stop', text: tr.properties.optionLabel('mode', 'stop') },
    { value: 'fill', text: tr.properties.optionLabel('mode', 'fill') },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-stretch gap-2.5">
        <div className="flex-1">
          <Lcd value={levelText} unit="" size="lg" label={`${tr.rack.level}: ${levelText}`} />
        </div>
        <div className="flex flex-col justify-center gap-1" aria-label={tr.rack.probes} role="group">
          {[3, 2, 1, 0].map((k) => (
            <StatusLamp key={k} on={wet[k] === true} tone="green">
              {tr.rack.probe(k)}
            </StatusLamp>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <PanelLabel>{tr.rack.levelSet}</PanelLabel>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(shown)}
          aria-valuetext={levelText}
          onChange={(e) => setDragged(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          className={`w-full ${touch ? 'h-11' : 'h-7'}`}
          style={{ accentColor: WATER_COLOR }}
        />
      </label>
      <div className="flex flex-col gap-1">
        <PanelLabel>{tr.rack.flow}</PanelLabel>
        <Segmented<TankMode> label={tr.rack.flow} options={modes} value={s.mode} onChange={(mode) => onChange({ mode })} touch={touch} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <PanelLabel>{tr.rack.fillTime}</PanelLabel>
          <Stepper
            label={tr.rack.fillTime}
            text={formatSI(s.fillTime, 's', { trim: true, digits: 3 })}
            canDown={s.fillTime > TANK_LIMITS.minFillTime}
            canUp={s.fillTime < TANK_LIMITS.maxFillTime}
            onStep={(d) => onChange({ fillTime: step125(s.fillTime, d, TANK_LIMITS.minFillTime, TANK_LIMITS.maxFillTime) })}
            editText={formatEditable(s.fillTime)}
            onType={typed(part, 'fillTime', onChange)}
            touch={touch}
          />
        </div>
        <div className="flex flex-col gap-1">
          <PanelLabel>{tr.rack.waterResistance}</PanelLabel>
          <Stepper
            label={tr.rack.waterResistance}
            text={formatSI(s.waterResistance, 'Ω', { trim: true, digits: 3 })}
            canDown={s.waterResistance > TANK_LIMITS.minWaterResistance}
            canUp={s.waterResistance < TANK_LIMITS.maxWaterResistance}
            onStep={(d) =>
              onChange({ waterResistance: step125(s.waterResistance, d, TANK_LIMITS.minWaterResistance, TANK_LIMITS.maxWaterResistance) })
            }
            editText={formatEditable(s.waterResistance)}
            onType={typed(part, 'waterResistance', onChange)}
            touch={touch}
          />
        </div>
      </div>
      {jacks && (
      <div className={`flex flex-wrap gap-1.5 ${touch ? '[&>button]:min-h-11 [&>button]:min-w-11' : ''}`}>
        {[0, 1, 2, 3].map((k) => (
          <Jack
            key={k}
            color={k === 0 ? '#2c3846' : WATER_COLOR}
            name={tr.devices.pinTags.tank[k] ?? ''}
            label={tr.rack.jack(`${part.label} ${tr.rack.probe(k)}`)}
            onClick={() => onJack(k)}
          />
        ))}
      </div>
      )}
      <p className={`leading-snug text-muted ${touch ? 'text-[13px]' : 'text-[11.5px]'}`}>{note ?? tr.rack.tankNote}</p>
    </div>
  );
}

/** Raftaki ön panel. */
export function TankFace({ className, ...props }: TankControlsProps & { readonly className?: string }) {
  return (
    <Face title={tr.rack.tank} label={props.part.label} ariaLabel={`${tr.rack.tank} ${props.part.label}`} className={className}>
      <div className="flex shrink-0 flex-col px-3 py-2.5">
        <TankControls {...props} />
      </div>
    </Face>
  );
}
