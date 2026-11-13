/**
 * Shared sakura petal geometry for the cover petal field and the click burst.
 * One notched petal in a 20×24 box, narrow end (where it joins the flower) at the bottom.
 */

export const PETAL_VIEWBOX = { width: 20, height: 24 } as const;

const PETAL_PATH =
  'M10 24C4.6 20.4.4 14 1.3 7.9 2 3.3 5.4.6 8.7 1.3L10 4.1l1.3-2.8c3.3-.7 6.7 2 7.4 6.6.9 6.1-3.3 12.5-8.7 16.1Z';

/** Tip and base colors per variant; the gradient runs from the notched tip to the base. */
export const PETAL_COLORS: ReadonlyArray<readonly [tip: string, base: string]> = [
  ['#f0fbf8', '#a8e0d4'],
  ['#fbfffd', '#c6ebe2'],
  ['#e8f7f4', '#8fd1c6'],
  ['#fffdf2', '#f3e3a1'],
];

/**
 * Pre-render every color variant once so each frame is only a `drawImage` per petal.
 * `scale` is the device-pixel size of one viewBox unit.
 */
export function createPetalSprites(scale: number): HTMLCanvasElement[] {
  const path = new Path2D(PETAL_PATH);
  return PETAL_COLORS.map(([tip, base]) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(PETAL_VIEWBOX.width * scale);
    canvas.height = Math.ceil(PETAL_VIEWBOX.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.scale(scale, scale);
    const gradient = ctx.createLinearGradient(10, 0, 10, 24);
    gradient.addColorStop(0, tip);
    gradient.addColorStop(1, base);
    ctx.fillStyle = gradient;
    ctx.fill(path);
    return canvas;
  });
}

/** CSS mask for DOM petals (the click burst), matching the canvas shape. */
export const PETAL_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${PETAL_VIEWBOX.width} ${PETAL_VIEWBOX.height}'><path d='${PETAL_PATH}'/></svg>`,
)}")`;
