import { IntelHUD } from '../hud.js';
import { setTextIfChanged } from './domText.js';

/** Keep the full data-aware HUD while mirroring live camera values into Iris instruments. */
export class EyeinskyHud extends IntelHUD {
  constructor(viewer, options) {
    super(viewer, options);
    this.update = () => {
      if (document.hidden) return;
      const camera = viewer.camera.positionCartographic;
      if (!camera) return;
      const degrees = (value) => (value * 180) / Math.PI;
      const set = (id, value) =>
        setTextIfChanged(document.getElementById(id), value);
      set(
        'eye-camera-position',
        `${degrees(camera.latitude).toFixed(2)}° / ${degrees(camera.longitude).toFixed(2)}°`,
      );
      set(
        'eye-camera-altitude',
        `${(camera.height / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} km`,
      );
      set(
        'eye-camera-heading',
        `${degrees(viewer.camera.heading).toFixed(1)}° / ${degrees(viewer.camera.pitch).toFixed(1)}°`,
      );
      document.body.style.setProperty(
        '--eye-heading-turn',
        `${-degrees(viewer.camera.heading).toFixed(2)}deg`,
      );
      const altitudeLevel = Math.max(
        0,
        Math.min(1, Math.log10(Math.max(1_000, camera.height) / 1_000) / 5),
      );
      document.body.style.setProperty(
        '--eye-altitude-level',
        `${(altitudeLevel * 100).toFixed(1)}%`,
      );
    };
    this._removeEyeinskyCamera = viewer.camera.moveEnd.addEventListener(
      this.update,
    );
    this.update();
  }

  /** Iris has no pretend recording state and presents summaries immediately. */
  _startTimers() {
    super._startTimers();
    clearInterval(this._timestampInterval);
    clearInterval(this._recBlinkInterval);
    this._timestampInterval = null;
    this._recBlinkInterval = null;
  }

  _typeSummary(text) {
    clearInterval(this._summaryTypingInterval);
    this._summaryTypingInterval = null;
    setTextIfChanged(document.getElementById('hud-summary'), text);
  }

  show() {
    super.show();
    document.querySelector('.eye-telemetry')?.classList.remove('eye-hud-off');
    this.update();
  }

  hide() {
    super.hide();
    document.querySelector('.eye-telemetry')?.classList.add('eye-hud-off');
  }

  setVariant(variant) {
    super.setVariant(variant);
    document.body.dataset.eyeHud = this.getVariant();
  }

  destroy() {
    this._removeEyeinskyCamera?.();
    document.body.style.removeProperty('--eye-heading-turn');
    document.body.style.removeProperty('--eye-altitude-level');
    super.destroy();
  }
}
