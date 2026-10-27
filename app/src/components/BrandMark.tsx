/**
 * @file Bubble Agent brand mark: a rounded chat bubble (sharp bottom-left
 * corner as the tail) holding a four-point spark, the agent.
 *
 * Drawn on a 48-unit grid; the same paths live in `assets/brand/*.svg`, the
 * Android overlay drawables and the app icon renders. Keep them in sync.
 */
import { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../theme';

/** Bubble body: 44-unit squircle, 16-unit corners, 4-unit bottom-left "tail" corner. */
const BUBBLE_PATH =
  'M18 2H30A16 16 0 0 1 46 18V30A16 16 0 0 1 30 46H6A4 4 0 0 1 2 42V18A16 16 0 0 1 18 2Z';

/** Four-point spark centred on (24, 24), 24 units tip to tip. */
const SPARK_PATH =
  'M24 12C25.6 18.4 29.6 22.4 36 24C29.6 25.6 25.6 29.6 24 36C22.4 29.6 18.4 25.6 12 24C18.4 22.4 22.4 18.4 24 12Z';

/** Gradient stops for the purple bubble (top-left light to bottom-right deep). */
const GRADIENT = [colors.primaryLight, colors.primary, colors.primaryPressed] as const;

/**
 * Bubble Agent logo mark.
 * @param props.size Edge length in dp; the mark is square.
 * @param props.variant `color` (default): purple gradient bubble with a white
 *   spark, for light surfaces. `white`: white bubble with a purple spark, for
 *   purple or ink surfaces.
 * @returns An SVG element, hidden from screen readers (decorative; label the parent).
 */
export function BrandMark({ size, variant = 'color' }: { size: number; variant?: 'color' | 'white' }) {
  // Gradient ids are document-global on web; keep each instance unique.
  // React ids contain ':' / '«»', which are not safe inside url(#…).
  const gradientId = `bubble-grad-${useId().replace(/[^\w-]/g, '')}`;
  const isColor = variant === 'color';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {isColor && (
        <Defs>
          <LinearGradient id={gradientId} x1="2" y1="2" x2="46" y2="46" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={GRADIENT[0]} />
            <Stop offset="0.5" stopColor={GRADIENT[1]} />
            <Stop offset="1" stopColor={GRADIENT[2]} />
          </LinearGradient>
        </Defs>
      )}
      <Path d={BUBBLE_PATH} fill={isColor ? `url(#${gradientId})` : colors.surface} />
      <Path d={SPARK_PATH} fill={isColor ? colors.surface : colors.primary} />
    </Svg>
  );
}
