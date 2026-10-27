/**
 * @file Design tokens: colors, type scale, spacing, radii and elevation.
 *
 * Follows the Monad brand kit (monad.xyz/brand-and-media-kit): primary purple
 * #6E54FF, lavender #DDD7FE, ink #0E091C on an off-white canvas; Inter for
 * text, Roboto Mono for labels, buttons and addresses. Britti Sans (Monad's
 * headline face) is commercial, so headlines use tightly tracked Inter.
 *
 * Light mode only (product decision, see NOTES.md). Every screen and component
 * takes values from here; no hex codes or font names elsewhere.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  /** App canvas behind cards (Monad off-white). */
  canvas: '#FBFAF9',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F4F8',
  border: '#ECEAF1',
  borderStrong: '#DCD8E6',

  /** Monad ink: primary text and the wallet hero card. */
  text: '#0E091C',
  textSecondary: '#5B5770',
  textTertiary: '#8F8BA3',
  textInverse: '#FFFFFF',
  /** Secondary text on ink surfaces. */
  textOnInk: '#B9B3D1',

  ink: '#0E091C',
  inkRaised: '#1E1636',

  /** Monad purple. */
  primary: '#6E54FF',
  primaryPressed: '#5A40F0',
  primarySoft: '#F1EFFF',
  /** Monad lavender. */
  primarySoftBorder: '#DDD7FE',

  success: '#0B9F6B',
  successSoft: '#E6F7F0',
  warning: '#B4650A',
  warningSoft: '#FFF5E6',
  warningBorder: '#FFDCA8',
  danger: '#D6364A',
  dangerSoft: '#FDECEE',
  dangerPressed: '#FAD9DE',


  /** Dimmed backdrop behind the ask sheet. */
  scrim: 'rgba(14, 9, 28, 0.42)',
} as const;

export type ColorToken = keyof typeof colors;

/** Font family names registered in `app/_layout.tsx`. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'RobotoMono_400Regular',
  monoMedium: 'RobotoMono_500Medium',
  monoBold: 'RobotoMono_600SemiBold',
} as const;

/** Type scale. Line heights are explicit so Android and iOS render alike. */
export const type = {
  /** Wallet balance. */
  display: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 46, letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
  title: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.7 },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  callout: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 17 },
  captionStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },
  /** Monad-style mono label: section titles, pills, field labels. */
  overline: { fontFamily: fonts.monoMedium, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' },
  /** Button text (mono, uppercase), per Monad's "labels, buttons, links" rule. */
  button: { fontFamily: fonts.monoMedium, fontSize: 13, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  /** Amounts in rows and cards. */
  amount: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  /** Addresses and hashes. */
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 19 },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** 4-pt spacing scale. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, xxl: 28, pill: 999 } as const;

/** Soft, low-contrast elevation. Cards rely on hairline borders; only floating layers get shadows. */
export const shadow = {
  card: Platform.select<ViewStyle>({
    android: { elevation: 0 },
    default: { shadowColor: '#0E091C', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } },
  }),
  raised: Platform.select<ViewStyle>({
    android: { elevation: 6, shadowColor: '#2A1A80' },
    default: { shadowColor: '#2A1A80', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  }),
  sheet: Platform.select<ViewStyle>({
    android: { elevation: 16 },
    default: { shadowColor: '#0E091C', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -4 } },
  }),
} as const;

/** Minimum touch target (Material guidance). */
export const HIT = 48;
