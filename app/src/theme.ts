/**
 * @file Design tokens: colors, type scale, spacing, radii and elevation.
 *
 * Light mode only (product decision, see NOTES.md). Every screen and component
 * takes values from here; no hex codes or font names elsewhere.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  /** App canvas behind cards. */
  canvas: '#F6F6F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F0F6',
  border: '#E7E6EE',
  borderStrong: '#D5D3E0',

  text: '#0F0E17',
  textSecondary: '#5C5A6E',
  textTertiary: '#8D8B9E',
  textInverse: '#FFFFFF',

  /** Monad purple, deepened slightly for text contrast on white. */
  primary: '#6E54FF',
  primaryPressed: '#5B41F0',
  primarySoft: '#EFECFF',
  primarySoftBorder: '#DCD5FF',

  success: '#0E9F5E',
  successSoft: '#E7F7EF',
  warning: '#B25E09',
  warningSoft: '#FEF4E6',
  warningBorder: '#F8DDB4',
  danger: '#D1362B',
  dangerSoft: '#FDEDEC',

  /** Dimmed backdrop behind the ask sheet. */
  scrim: 'rgba(15, 14, 23, 0.35)',
} as const;

export type ColorToken = keyof typeof colors;

/** Font family names registered in `app/_layout.tsx`. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

/** Type scale. Line heights are explicit so Android and iOS render alike. */
export const type = {
  display: { fontFamily: fonts.semibold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  callout: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 17 },
  captionStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase' },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 19 },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** 4-pt spacing scale. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Soft, low-contrast elevation for cards and the sheet. */
export const shadow = {
  card: Platform.select<ViewStyle>({
    android: { elevation: 1 },
    default: { shadowColor: '#0F0E17', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  }),
  sheet: Platform.select<ViewStyle>({
    android: { elevation: 16 },
    default: { shadowColor: '#0F0E17', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -4 } },
  }),
} as const;

/** Minimum touch target (Material guidance). */
export const HIT = 48;
