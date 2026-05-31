// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

// How often the HUD recomputes its displayed numbers. Frame timing is sampled
// every frame; the readout only refreshes on this cadence so the values stay
// readable instead of flickering at the full frame rate.
const HUD_UPDATE_INTERVAL_MS = 250;

// Overlay text style.
const HUD_FONT = '14px monospace';
const HUD_COLOR = '#00ff00';

// Text layout, in canvas pixels.
const HUD_TEXT_X = 8;
const HUD_TOP_PADDING = 8;
const HUD_LINE_HEIGHT = 18;

export function createHud(canvasElement: HTMLCanvasElement) {
  const ctx = canvasElement.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context for HUD canvas');
  }

  ctx.font = HUD_FONT;
  ctx.fillStyle = HUD_COLOR;
  ctx.textBaseline = 'top';

  // Seed with the current clock so the first window measures a real frame
  // interval rather than the entire time since page load. rAF timestamps and
  // performance.now() share a time origin, so the two are comparable.
  let lastHudUpdate = performance.now();
  let frameCount = 0;
  let visible = true;
  let fpsText = '';
  let frameTimeText = '';
  let drawText = '';

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Backquote') {
      visible = !visible;
      canvasElement.style.display = visible ? 'block' : 'none';
    }
  });

  const frame = (now: number, drawCallCount: number): void => {
    frameCount++;
    const timeDelta = now - lastHudUpdate;
    if (timeDelta >= HUD_UPDATE_INTERVAL_MS) {
      const fps = (frameCount / timeDelta) * 1000;
      const frameTime = timeDelta / frameCount;

      fpsText = `FPS: ${Math.round(fps)}`;
      frameTimeText = `Frame Time: ${Math.round(frameTime)} ms`;
      drawText = `Draw Calls: ${drawCallCount}`;

      lastHudUpdate = now;
      frameCount = 0;
    }
    if (visible) {
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      ctx.fillText(fpsText, HUD_TEXT_X, HUD_TOP_PADDING);
      ctx.fillText(frameTimeText, HUD_TEXT_X, HUD_TOP_PADDING + HUD_LINE_HEIGHT);
      ctx.fillText(drawText, HUD_TEXT_X, HUD_TOP_PADDING + HUD_LINE_HEIGHT * 2);
    }
  };

  return { frame };
}
