// Defterdeki laboratuvar cihazı kartlarının içeriği (tasarım v3: D2): osiloskop, fonksiyon üreteci,
// DC güç kaynağı ve su haznesi. Alttaki cihaz rafının yerini alır; ayarlar yine parçanın özelliklerinde
// (kaydedilir, paylaşılır, geri alınabilir; simülasyonu durdurmaz).
//
// Osiloskop: kart genişliğinde ekran, altında ölçüm satırları; Kanal A, Kanal B (V/b, AC / GND / DC)
// ve Zaman (s/b, kip); konum, B ters, tetik ve Oto, giriş ve şebeke toprağı, jaklar "Gelişmiş" altında.
// Üreteç ve güç kaynağı telefondaki denetimleri sıkı boyutta kullanır.

import { useId, useState } from 'react';
import { tr } from '../i18n/tr';
import type { Part } from '../model/types';
import type { DeviceStatus } from '../sim/devices';
import { dcsupplySettings } from '../sim/devices/dcsupply';
import { funcgenSettings } from '../sim/devices/funcgen';
import {
  SCOPE_COUPLINGS,
  SCOPE_INPUTS,
  SCOPE_MODES,
  SCOPE_TRIGGERS,
  TIME_PER_DIV_STEPS,
  VOLTS_PER_DIV_STEPS,
  scopeSettings,
  type ScopeCoupling,
  type ScopeInput,
  type ScopeMode,
  type ScopeTrigger,
} from '../sim/devices/oscilloscope';
import type { PropValue } from '../sim/netlist';
import { formatNumber, formatSI } from '../sim/units';
import { Icon } from './icons';
import { DcSupplyControls, FuncGenControls } from './PhoneDevices';
import { ChannelBadge, Jack, Segmented, Stepper } from './RackControls';
import { CHANNELS, SCOPE_COLORS, Screen, StatsLines, stepIn, timeLabel, voltsLabel } from './ScopeFace';
import type { ScopeView } from './scopeView';
import { TankControls } from './TankControls';
import { useTouchUi } from './touchUi';

/** Cihaz kartlarının simülasyon ve devre bağlantıları (Simulator verir). */
export interface DeviceHooks {
  readonly scopeView: (id: string) => ScopeView | null;
  readonly status: (id: string) => DeviceStatus;
  /** Fonksiyon üretecinin çıkış gerilimi; simülasyon durmuşsa null. */
  readonly outputVoltage: (id: string) => number | null;
  readonly running: boolean;
  readonly pinConnected: (id: string, pin: number) => boolean;
  readonly onChange: (id: string, patch: Record<string, PropValue>) => void;
  readonly onAuto: (id: string) => void;
  /** Jak: tuvalde ilgili ucu göster. */
  readonly onJack: (id: string, pin: number) => void;
}

/** Kapalı kartın sağındaki ayar özeti ("Sinüs · 1 kHz · 10 Vpp", "A 1 V/b · 500 µs/b"). */
export function deviceSummary(part: Part, view: ScopeView | null): string | null {
  if (part.type === 'funcgen') {
    const s = funcgenSettings(part.props);
    const amplitude = s.amplitude * (s.attenuate ? 0.1 : 1);
    return `${tr.properties.optionLabel('waveform', s.waveform)} · ${formatSI(s.frequency, 'Hz', { trim: true, digits: 4 })} · ${formatSI(amplitude, 'V', { trim: true, digits: 3 })}pp`;
  }
  if (part.type === 'oscilloscope') {
    const s = scopeSettings(part.props);
    if (s.mode === 'xy') return `X-Y · ${voltsLabel(s.voltsPerDiv[0])} · ${voltsLabel(s.voltsPerDiv[1])}`;
    const stats = view?.channels[0]?.stats;
    return stats ? `A ${formatSI(stats.peakToPeak, 'V', { digits: 3 })}pp` : `A ${voltsLabel(s.voltsPerDiv[0])} · ${timeLabel(s.timePerDiv)}`;
  }
  if (part.type === 'dcsupply') {
    const s = dcsupplySettings(part.props);
    return `${formatNumber(s.voltage[0], 1)} V · ${formatNumber(s.voltage[1], 1)} V`;
  }
  return null;
}

/** Osiloskop kartının başlığındaki durum ("Tetikleniyor" ya da "Kayıyor"). */
export function ScopeStatus({ part, view }: { part: Part; view: ScopeView | null }) {
  if (!view || scopeSettings(part.props).mode === 'xy') return null;
  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-label ${view.triggered ? 'text-ok-ink' : 'text-warn'}`}>
      <i className={`block h-[7px] w-[7px] rounded-full ${view.triggered ? 'bg-ok' : 'bg-paused'}`} aria-hidden="true" />
      {view.triggered ? tr.rack.triggered : tr.scope.rolling}
    </span>
  );
}

export function DeviceControls({ part, devices }: { part: Part; devices: DeviceHooks }) {
  const touch = useTouchUi();
  const change = (patch: Record<string, PropValue>) => devices.onChange(part.id, patch);
  const jack = (pin: number) => devices.onJack(part.id, pin);
  switch (part.type) {
    case 'oscilloscope':
      return (
        <ScopeControls
          part={part}
          view={devices.scopeView(part.id)}
          connected={[devices.pinConnected(part.id, 0), devices.pinConnected(part.id, 1)]}
          onChange={change}
          onAuto={() => devices.onAuto(part.id)}
          onJack={jack}
        />
      );
    case 'funcgen':
      return (
        <div className="flex flex-col gap-3">
          <FuncGenControls part={part} output={devices.outputVoltage(part.id)} onChange={change} onJack={jack} touch={touch} />
        </div>
      );
    case 'dcsupply':
      return (
        <div className="flex flex-col gap-3">
          <DcSupplyControls
            part={part}
            status={devices.status(part.id)}
            running={devices.running}
            connected={[
              devices.pinConnected(part.id, 0) || devices.pinConnected(part.id, 1),
              devices.pinConnected(part.id, 2) || devices.pinConnected(part.id, 3),
            ]}
            onChange={change}
            onJack={jack}
            touch={touch}
          />
        </div>
      );
    case 'tank':
      return <TankControls part={part} status={devices.status(part.id)} running={devices.running} onChange={change} onJack={jack} touch={touch} />;
    default:
      return null;
  }
}

/** Dokunmatik osiloskop satırının sağındaki düğme: dokundukça bir sonraki seçeneğe geçer (DP3: DC, "A ve B"). */
function CycleButton<T extends string>({ label, options, value, onChange }: { label: string; options: ReadonlyArray<{ value: T; text: string }>; value: T; onChange: (value: T) => void }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[index]!;
  const next = options[(index + 1) % options.length]!;
  return (
    <button
      type="button"
      onClick={() => onChange(next.value)}
      aria-label={`${label}: ${current.text}`}
      title={`${label}: ${current.text} → ${next.text}`}
      className="h-[46px] w-[72px] shrink-0 rounded-[10px] border border-line-2 bg-panel px-1 text-small font-semibold whitespace-nowrap active:bg-app"
    >
      {current.text}
    </button>
  );
}

function ScopeControls({
  part,
  view,
  connected,
  onChange,
  onAuto,
  onJack,
}: {
  part: Part;
  view: ScopeView | null;
  connected: readonly [boolean, boolean];
  onChange: (patch: Record<string, PropValue>) => void;
  onAuto: () => void;
  onJack: (pin: number) => void;
}) {
  const touch = useTouchUi();
  const s = scopeSettings(part.props);
  const xy = s.mode === 'xy';
  const [advanced, setAdvanced] = useState(false);
  const advancedId = useId();
  const head = 'flex items-center gap-1.5 text-label font-semibold';
  const couplings = (['ac', 'gnd', 'dc'] as const).filter((c) => SCOPE_COUPLINGS.includes(c)).map((c) => ({ value: c, text: tr.scope.couplings[c] ?? c }));
  const modes = SCOPE_MODES.map((m) => ({ value: m, text: tr.rack.modes[m] ?? m }));
  const channelStepper = (name: string, index: 0 | 1) => {
    const volts = s.voltsPerDiv[index];
    return (
      <Stepper
        touch={touch}
        label={`${name} ${tr.scope.voltsPerDiv.toLocaleLowerCase('tr-TR')}`}
        text={voltsLabel(volts)}
        canDown={volts > VOLTS_PER_DIV_STEPS[0]!}
        canUp={volts < VOLTS_PER_DIV_STEPS[VOLTS_PER_DIV_STEPS.length - 1]!}
        onStep={(d) => onChange({ [`voltsPerDiv${name}`]: stepIn(VOLTS_PER_DIV_STEPS, volts, d) })}
      />
    );
  };
  const timeStepper = (
    <Stepper
      touch={touch}
      label={tr.scope.timePerDiv}
      text={timeLabel(s.timePerDiv)}
      disabled={xy}
      canDown={s.timePerDiv > TIME_PER_DIV_STEPS[0]!}
      canUp={s.timePerDiv < TIME_PER_DIV_STEPS[TIME_PER_DIV_STEPS.length - 1]!}
      onStep={(d) => onChange({ timePerDiv: stepIn(TIME_PER_DIV_STEPS, s.timePerDiv, d) })}
    />
  );
  return (
    <div className="flex flex-col gap-2.5">
      <Screen part={part} view={view} settings={s} height={168} width="100%" onChange={onChange} />
      <StatsLines view={view} settings={s} connected={connected} />
      {touch ? (
        // Dokunmatikte (telefon, tablet; DP3) her ayar bir satır: ad, adımlayıcı ve sırayla değişen düğme.
        <div className="flex flex-col gap-2">
          {CHANNELS.map((name, index) => (
            <div key={name} className="flex items-center gap-2">
              <span className={`${head} w-[74px] shrink-0`}>
                <ChannelBadge name={name} color={SCOPE_COLORS[index]!} />
                {xy ? (index === 0 ? 'X' : 'Y') : tr.scope.channel(name)}
              </span>
              <div className="min-w-0 flex-1">{channelStepper(name, index as 0 | 1)}</div>
              <CycleButton
                label={`${name} ${tr.scope.coupling.toLocaleLowerCase('tr-TR')}`}
                options={couplings}
                value={s.coupling[index as 0 | 1]}
                onChange={(c) => onChange({ [`coupling${name}`]: c })}
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className={`${head} w-[74px] shrink-0`}>{tr.sim.time}</span>
            <div className="min-w-0 flex-1">{timeStepper}</div>
            <CycleButton label={tr.scope.mode} options={modes} value={s.mode} onChange={(mode) => onChange({ mode })} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {CHANNELS.map((name, index) => (
            <div key={name} className="flex min-w-0 flex-col gap-1.5">
              <span className={head}>
                <ChannelBadge name={name} color={SCOPE_COLORS[index]!} />
                {xy ? (index === 0 ? tr.rack.xyAxisA : tr.rack.xyAxisB) : tr.scope.channel(name)}
              </span>
              {channelStepper(name, index as 0 | 1)}
              <Segmented<ScopeCoupling>
                label={`${name} ${tr.scope.coupling.toLocaleLowerCase('tr-TR')}`}
                options={couplings}
                value={s.coupling[index as 0 | 1]}
                onChange={(c) => onChange({ [`coupling${name}`]: c })}
              />
            </div>
          ))}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={head}>{tr.scope.timePerDiv}</span>
            {timeStepper}
            <Segmented<ScopeMode> label={tr.scope.mode} options={modes} value={s.mode} onChange={(mode) => onChange({ mode })} />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        aria-expanded={advanced}
        aria-controls={advancedId}
        className={`flex items-center gap-1.5 self-start text-small font-medium text-accent-ink ${touch ? 'h-11' : 'h-8'}`}
      >
        <Icon name={advanced ? 'chevronDown' : 'chevron'} className="h-4 w-4" />
        {touch ? tr.notebook.scopeAdvancedShort : tr.notebook.scopeAdvanced}
      </button>
      {advanced && (
        <div id={advancedId} className="flex flex-col gap-3 rounded-md bg-panel-2 p-3">
          <div className="grid grid-cols-2 gap-2.5">
            {CHANNELS.map((name, index) => {
              const position = s.position[index as 0 | 1];
              const horizontal = xy && index === 0;
              return (
                <div key={name} className="flex min-w-0 flex-col gap-1.5">
                  <span className={head}>
                    {tr.rack.position} {name}
                  </span>
                  <Stepper
                    touch={touch}
                    label={`${name} ${tr.rack.position.toLocaleLowerCase('tr-TR')}`}
                    text={`${position > 0 ? '+' : ''}${formatNumber(position, 1)} ${tr.rack.divShort}`}
                    downGlyph={horizontal ? '◀' : '▼'}
                    upGlyph={horizontal ? '▶' : '▲'}
                    downLabel={horizontal ? tr.rack.moveLeft(name) : tr.rack.moveDown(name)}
                    upLabel={horizontal ? tr.rack.moveRight(name) : tr.rack.moveUp(name)}
                    canDown={position > -4}
                    canUp={position < 4}
                    onStep={(d) => onChange({ [`position${name}`]: Math.max(-4, Math.min(4, position + d * 0.5)) })}
                  />
                </div>
              );
            })}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-small font-medium">
            <input type="checkbox" checked={s.invertB} onChange={(e) => onChange({ invertB: e.target.checked })} className="h-[18px] w-[18px] accent-ink" />
            {tr.rack.invert} <small className="font-mono text-muted">INV</small>
          </label>
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className={head}>{tr.scope.trigger}</span>
              <Segmented<ScopeTrigger>
                touch={touch}
                disabled={xy}
                label={tr.scope.trigger}
                options={SCOPE_TRIGGERS.map((t) => ({ value: t, text: t === 'A' ? tr.rack.triggerA : t }))}
                value={s.trigger}
                onChange={(trigger) => onChange({ trigger })}
              />
            </div>
            <button
              type="button"
              onClick={onAuto}
              title={tr.scope.autoTitle}
              className={`shrink-0 rounded-md bg-ink px-3 text-small font-semibold text-on-ink hover:brightness-125 ${touch ? 'h-11' : 'h-9'}`}
            >
              {tr.scope.auto}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={head}>{tr.rack.input}</span>
            <Segmented<ScopeInput>
              touch={touch}
              label={tr.rack.input}
              options={SCOPE_INPUTS.map((i) => ({ value: i, text: i === 'real' ? tr.rack.inputRealShort : tr.rack.inputIdealShort }))}
              value={s.input}
              onChange={(input) => onChange({ input })}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-small font-medium">
            <input type="checkbox" checked={s.earthed} onChange={(e) => onChange({ earthed: e.target.checked })} className="h-[18px] w-[18px] accent-earth" />
            {tr.rack.earthed}
          </label>
          <div className="flex items-end gap-2">
            <Jack color="var(--color-ch-a)" name="A" label={tr.rack.jack(`${part.label} A`)} onClick={() => onJack(0)} />
            <Jack color="var(--color-ch-b)" name="B" label={tr.rack.jack(`${part.label} B`)} onClick={() => onJack(1)} />
            <Jack color="#2c3846" ring={s.earthed} name="COM" earthed={s.earthed} label={tr.rack.jack(`${part.label} COM`)} onClick={() => onJack(2)} />
          </div>
        </div>
      )}
    </div>
  );
}
