export interface ImmersiveMotionOptions {
  root: HTMLElement;
  signal: AbortSignal;
  reducedMotion: () => boolean;
}

export interface ImmersiveMotionController {
  setOpen(element: HTMLElement, open: boolean): Animation | null;
  destroy(): void;
}

type MotionState = {
  animation: Animation | null;
  generation: number;
  open: boolean;
  inline: Record<'opacity' | 'transform', InlineStyle>;
};

type InlineStyle = {
  value: string;
  priority: string;
};

const OPEN_TRANSFORM = 'translate3d(0, 0, 0) scale(1)';
const CLOSED_TRANSFORM = 'translate3d(0, 12px, 0) scale(0.975)';

/** Own only panel transform/opacity work; DOM state and controller ownership stay upstream. */
export function mountImmersiveMotion({
  root,
  signal,
  reducedMotion,
}: ImmersiveMotionOptions): ImmersiveMotionController {
  const states = new Map<HTMLElement, MotionState>();
  let destroyed = false;

  const captureInline = (element: HTMLElement) => ({
    opacity: {
      value: element.style.getPropertyValue('opacity'),
      priority: element.style.getPropertyPriority('opacity'),
    },
    transform: {
      value: element.style.getPropertyValue('transform'),
      priority: element.style.getPropertyPriority('transform'),
    },
  });

  const restoreInline = (element: HTMLElement, state: MotionState) => {
    for (const property of ['opacity', 'transform'] as const) {
      const original = state.inline[property];
      if (original.value)
        element.style.setProperty(property, original.value, original.priority);
      else element.style.removeProperty(property);
    }
  };

  const stop = (state: MotionState) => {
    if (!state.animation) return;
    try {
      state.animation.commitStyles();
    } catch {
      // Some test and older browser adapters do not support commitStyles.
    }
    state.animation.cancel();
    state.animation = null;
  };

  const setOpen = (element: HTMLElement, open: boolean) => {
    if (destroyed) return null;
    const state = states.get(element) || {
      animation: null,
      generation: 0,
      open: !element.hidden,
      inline: captureInline(element),
    };
    states.set(element, state);
    stop(state);
    const generation = ++state.generation;
    state.open = open;

    if (open) {
      element.hidden = false;
      element.inert = false;
      element.removeAttribute('aria-hidden');
    } else {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    }

    const reduce = reducedMotion();
    const keyframes: Keyframe[] = reduce
      ? [{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }]
      : [
          {},
          {
            opacity: open ? 1 : 0,
            transform: open ? OPEN_TRANSFORM : CLOSED_TRANSFORM,
          },
        ];
    const animation = element.animate(keyframes, {
      duration: reduce ? 1 : open ? 210 : 160,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'both',
    });
    state.animation = animation;
    void animation.finished.then(
      () => {
        if (destroyed || generation !== state.generation) return;
        state.animation = null;
        if (!open) element.hidden = true;
        animation.cancel();
        restoreInline(element, state);
      },
      () => {},
    );
    return animation;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    signal.removeEventListener('abort', destroy);
    for (const [element, state] of states) {
      stop(state);
      if (!state.open) element.hidden = true;
      restoreInline(element, state);
    }
    states.clear();
    root.removeAttribute('data-eye-motion');
  };

  root.setAttribute('data-eye-motion', 'mounted');
  signal.addEventListener('abort', destroy, { once: true });
  if (signal.aborted) destroy();

  return { setOpen, destroy };
}
