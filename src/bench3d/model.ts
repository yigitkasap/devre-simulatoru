// Bir parçanın 3B modeli: yerel koordinatlarda (pinler şema pinleri × SPREAD) bir grup, kabloların
// bağlandığı uç noktaları ve canlı değerlerle güncelleme.

import { AdditiveBlending, CanvasTexture, Color, Group, Sprite, SpriteMaterial, SRGBColorSpace, type Vector3 } from 'three';
import type { ScopeView } from '../editor/scopeView';
import type { LiveVisual } from '../editor/symbols';
import type { DeviceStatus } from '../sim/devices/device';
import type { Measurement } from '../sim/devices/device';
import type { Props } from '../sim/netlist';

export interface LiveContext {
  readonly live: LiveVisual | undefined;
  readonly status: DeviceStatus | undefined;
  readonly measurement: Measurement | undefined;
  readonly scope: ScopeView | undefined;
  readonly props: Props;
  /** Simülasyon çalışıyor mu (durmuşken değerler sıfırlanır). */
  readonly active: boolean;
  /** Gerçek zaman (s) ve son güncellemeden bu yana geçen süre (titreşim, dönme için). */
  readonly now: number;
  readonly dt: number;
}

export interface PartModel {
  readonly root: Group;
  /** Kabloların bağlandığı uçlar (yerel koordinat), pin sırasıyla. */
  readonly anchors: readonly Vector3[];
  /**
   * Canlı değerleri uygular. Sürekli canlandırma gerekiyorsa (dönen motor, titreşen hoparlör) true
   * döner: sahne bir sonraki karede yeniden çizilir.
   */
  update?(ctx: LiveContext): boolean;
  /** Tıklanınca anahtar gibi davranır ya da sürüklenince döner (potansiyometre). */
  readonly interaction?: 'toggle' | 'knob';
  dispose?(): void;
}

// --- Işıma (LED, lamba) ---------------------------------------------------------------------------

let glowTexture: CanvasTexture | null = null;

function glowMap(): CanvasTexture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new CanvasTexture(canvas);
  glowTexture.colorSpace = SRGBColorSpace;
  return glowTexture;
}

/** Toplamsal karışımlı ışıma lekesi; `set(şiddet)` ile boyu ve koyuluğu değişir. */
export function glowSprite(color: string, size: number): Sprite & { set: (amount: number) => void } {
  const material = new SpriteMaterial({ map: glowMap(), color: new Color(color), blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
  const sprite = new Sprite(material) as Sprite & { set: (amount: number) => void };
  sprite.userData.live = true;
  sprite.userData.ownsMaterial = true;
  sprite.visible = false;
  sprite.set = (amount: number) => {
    const a = Math.max(0, Math.min(1, amount));
    sprite.visible = a > 0.01;
    material.opacity = 0.25 + 0.75 * a;
    sprite.scale.setScalar(size * (0.55 + 0.9 * a));
  };
  return sprite;
}
