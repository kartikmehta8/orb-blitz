/**
 * @file Brand mark: the official Monad logomark (rounded diamond with a
 * counter), flat colours only, per Monad's media-kit rule that the symbol
 * appears in white or black, or on a primary brand colour.
 *
 * The same path lives in `assets/brand/monad-logomark.svg`, the Android overlay
 * drawables and the app icon renders. Keep them in sync.
 */
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

/** Official logomark, drawn in a 23.5642 x 24 box. The second subpath is the counter. */
const LOGOMARK_PATH =
  'M11.782 0C8.37963 0 0 8.53443 0 11.9999C0 15.4654 8.37963 24 11.782 24C15.1844 24 23.5642 15.4653 23.5642 11.9999C23.5642 8.53458 15.1845 0 11.782 0ZM9.94598 18.8619C8.51124 18.4637 4.65378 11.5912 5.04481 10.1299C5.43584 8.66856 12.1834 4.73984 13.6181 5.1381C15.0529 5.5363 18.9104 12.4087 18.5194 13.87C18.1283 15.3314 11.3807 19.2602 9.94598 18.8619Z';
const LOGOMARK_W = 23.5642;
const LOGOMARK_H = 24;

/** Tile geometry on a 100-unit grid: corner radius and logomark height. */
const TILE = 100;
const TILE_RADIUS = 28;
const MARK_HEIGHT = 58;

/**
 * Bubble Agent logo mark (the Monad logomark).
 * @param props.size Edge length in dp; the mark is square.
 * @param props.variant `color` (default): white logomark on a flat Monad-purple
 *   rounded tile, for light surfaces. `white`: the white logomark alone, filling
 *   the box, for purple or ink surfaces.
 * @returns An SVG element, hidden from screen readers (decorative; label the parent).
 */
export function BrandMark({ size, variant = 'color' }: { size: number; variant?: 'color' | 'white' }) {
  const a11y = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;
  if (variant === 'white') {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${LOGOMARK_H} ${LOGOMARK_H}`} {...a11y}>
        <Path d={LOGOMARK_PATH} x={(LOGOMARK_H - LOGOMARK_W) / 2} fill={colors.textInverse} fillRule="evenodd" />
      </Svg>
    );
  }
  const scale = MARK_HEIGHT / LOGOMARK_H;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${TILE} ${TILE}`} {...a11y}>
      <Rect width={TILE} height={TILE} rx={TILE_RADIUS} fill={colors.primary} />
      <Path
        d={LOGOMARK_PATH}
        x={(TILE - LOGOMARK_W * scale) / 2}
        y={(TILE - MARK_HEIGHT) / 2}
        scale={scale}
        fill={colors.textInverse}
        fillRule="evenodd"
      />
    </Svg>
  );
}
