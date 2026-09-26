import { IntelHUD } from '../hud.js';
import { setTextIfChanged } from './domText.js';
import { mountCameraTelemetry } from './eyeinskyCameraTelemetry.js';

/** Keep the full data-aware HUD while mirroring live camera values into Iris instruments. */
export class EyeinskyHud extends IntelHUD {
  constructor(viewer, options) {
    super(viewer, options);
    // Pie de telemetría: moveEnd + postRender a 4 Hz, para que la lectura
    // siga a la cámara también con un objetivo fijado (EntityView).
    this._cameraTelemetry = mountCameraTelemetry({ viewer, doc: document });
    this.update = this._cameraTelemetry.update;
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
    this._cameraTelemetry?.destroy();
    super.destroy();
  }
}
