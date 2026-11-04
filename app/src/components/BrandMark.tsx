/**
 * @file Brand marks: the Orb mark (the app's own logo) and the official Monad
 * logomark (for "Built on Monad" lines and network pills). Flat colours only,
 * no gradients or glows.
 *
 * The Orb glyph is a thick ring with a small solid dot orbiting on its path at
 * the upper right, drawn on a 24-unit grid. The same path lives in
 * `assets/brand/orb-glyph.svg`, `assets/brand/orb-mark.svg`, the Android
 * overlay drawables (`bubble_icon.xml`, `ic_stat_bubble.xml`) and the app icon
 * renders. Keep them in sync.
 */
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Orb glyph on a 24 x 24 grid: a ring (outer r 9.5, stroke 3.2, ~17% of its
 * diameter) concentric with the grid, cut around a solid dot (r 2.6) that rides
 * the ring's path at 45 degrees upper right, with a 1.4-unit gap.
 */
const ORB_PATH =
  'M20.894 8.662A9.5 9.5 0 1 1 15.338 3.106A4 4 0 0 0 13.618 5.911A6.3 6.3 0 1 0 18.089 10.382A4 4 0 0 0 20.894 8.662ZM20.186 6.414A2.6 2.6 0 1 1 14.986 6.414A2.6 2.6 0 1 1 20.186 6.414Z';
const ORB_GRID = 24;

/** Tile geometry on a 100-unit grid: corner radius (~30%) and glyph box (ring ~52% of the tile, as on the app icon). */
const TILE = 100;
const TILE_RADIUS = 30;
const GLYPH_SIZE = 66;

/** Official Monad logomark, drawn in a 23.5642 x 24 box. The second subpath is the counter. */
const MONAD_PATH =
  'M11.782 0C8.37963 0 0 8.53443 0 11.9999C0 15.4654 8.37963 24 11.782 24C15.1844 24 23.5642 15.4653 23.5642 11.9999C23.5642 8.53458 15.1845 0 11.782 0ZM9.94598 18.8619C8.51124 18.4637 4.65378 11.5912 5.04481 10.1299C5.43584 8.66856 12.1834 4.73984 13.6181 5.1381C15.0529 5.5363 18.9104 12.4087 18.5194 13.87C18.1283 15.3314 11.3807 19.2602 9.94598 18.8619Z';
const MONAD_W = 23.5642;
const MONAD_H = 24;

/** Marks are decorative; label the parent instead. */
const A11Y_HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

/**
 * Orb logo mark.
 * @param props.size Edge length in dp; the mark is square.
 * @param props.variant `color` (default): white Orb glyph on a flat primary
 *   rounded tile (radius ~30% of size), for light surfaces. `white`: the white
 *   glyph alone, filling the box, for primary or ink surfaces.
 * @returns An SVG element, hidden from screen readers.
 */
export function BrandMark({ size, variant = 'color' }: { size: number; variant?: 'color' | 'white' }) {
  if (variant === 'white') {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${ORB_GRID} ${ORB_GRID}`} {...A11Y_HIDDEN}>
        <Path d={ORB_PATH} fill={colors.textInverse} fillRule="evenodd" />
      </Svg>
    );
  }
  const offset = (TILE - GLYPH_SIZE) / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${TILE} ${TILE}`} {...A11Y_HIDDEN}>
      <Rect width={TILE} height={TILE} rx={TILE_RADIUS} fill={colors.primary} />
      <Path d={ORB_PATH} x={offset} y={offset} scale={GLYPH_SIZE / ORB_GRID} fill={colors.textInverse} fillRule="evenodd" />
    </Svg>
  );
}

/**
 * Official Monad logomark, for "Built on Monad" lines and network pills.
 * @param props.size Height in dp; width follows the logomark's 23.5642:24 ratio.
 * @param props.color Fill colour (default `colors.text`).
 * @returns An SVG element, hidden from screen readers.
 */
export function MonadMark({ size, color = colors.text }: { size: number; color?: string }) {
  return (
    <Svg width={(size * MONAD_W) / MONAD_H} height={size} viewBox={`0 0 ${MONAD_W} ${MONAD_H}`} {...A11Y_HIDDEN}>
      <Path d={MONAD_PATH} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

/**
 * Orb glyph alone, for icon slots (tab bar).
 * @param props.size Edge length in dp.
 * @param props.color Fill colour.
 * @returns An SVG element, hidden from screen readers.
 */
export function OrbGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${ORB_GRID} ${ORB_GRID}`} {...A11Y_HIDDEN}>
      <Path d={ORB_PATH} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
