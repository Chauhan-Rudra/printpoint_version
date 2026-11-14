/**
 * Print Point Design System Tokens
 *
 * Single source of truth for preserved brand colours, typography scale,
 * spacing, border radii, icon sizing, and mobile-first viewport breakpoints.
 */

export const PP_COLORS = {
  // Primary & Secondary Brand Greens (Preserved)
  brand: '#194F34',
  brandHover: '#143F2A',
  brandActive: '#0F3120',
  brandDeep: '#00361A',
  brandSecondary: '#2C694E',
  brandTint: '#EAF3ED',
  brandTintHover: '#DDECE2',
  brandSurface: '#F4F8F5',

  // Backgrounds & Surfaces
  background: '#F8FAF6',
  card: '#FFFFFF',
  cardSubtle: '#F3F4F0',
  surfaceContainer: '#EDEEEB',
  surfaceContainerHigh: '#E7E9E5',

  // Typography Colours (WCAG AA compliant on #FFFFFF & #F8FAF6)
  textPrimary: '#191C1A',
  textSecondary: '#545D56',
  textMuted: '#626E65',
  textInverse: '#FFFFFF',

  // Borders & Hairline Dividers
  border: '#D5DDD7',
  borderSubtle: '#E5EBE6',
  divider: '#E4EAE5',
  outlineVariant: '#C1C9BF',

  // Semantic States (Always paired with icon + text)
  success: '#194F34',
  successBg: '#EAF3ED',
  successBorder: '#B8D6C2',

  warning: '#92400E',
  warningIcon: '#D97706',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',

  error: '#BA1A1A',
  errorText: '#93000A',
  errorBg: '#FFF1F2',
  errorBorder: '#FECDD3',

  info: '#1E4E68',
  infoBg: '#EFF6FA',
  infoBorder: '#CDE1EC',

  disabledBg: '#E1E3DF',
  disabledText: '#6E7770',
} as const;

export const PP_TYPOGRAPHY = {
  fontFamily: '"Plus Jakarta Sans", sans-serif',
  scale: {
    pageHeading: {
      size: '22px',
      lineHeight: '28px',
      weight: 700,
      letterSpacing: '-0.02em',
      className: 'pp-text-page-heading',
    },
    sectionHeading: {
      size: '16px',
      lineHeight: '22px',
      weight: 700,
      letterSpacing: '-0.01em',
      className: 'pp-text-section-heading',
    },
    cardHeading: {
      size: '14.5px',
      lineHeight: '20px',
      weight: 700,
      letterSpacing: '-0.005em',
      className: 'pp-text-card-heading',
    },
    body: {
      size: '14px',
      lineHeight: '21px',
      weight: 400,
      letterSpacing: '0em',
      className: 'pp-text-body',
    },
    secondary: {
      size: '13px',
      lineHeight: '19px',
      weight: 400,
      letterSpacing: '0em',
      className: 'pp-text-secondary',
    },
    label: {
      size: '12px',
      lineHeight: '16px',
      weight: 600,
      letterSpacing: '0.01em',
      className: 'pp-text-label',
    },
    button: {
      size: '14px',
      lineHeight: '20px',
      weight: 600,
      letterSpacing: '-0.005em',
      className: 'pp-text-button',
    },
    financial: {
      size: '18px',
      lineHeight: '24px',
      weight: 700,
      letterSpacing: '-0.02em',
      className: 'pp-text-financial',
    },
    docMeta: {
      size: '12px',
      lineHeight: '17px',
      weight: 500,
      letterSpacing: '0em',
      className: 'pp-text-doc-meta',
    },
  },
} as const;

export const PP_SPACING = {
  pageMarginX: '16px', // px-4 on mobile
  cardPadding: '16px', // p-4
  cardPaddingCompact: '12px', // p-3
  sectionGap: '20px', // space-y-5
  elementGap: '12px', // gap-3
  inputHeight: '46px', // min-h-[46px]
  buttonHeightSm: '40px',
  buttonHeightMd: '44px', // mobile touch-target compliant
  buttonHeightLg: '48px',
  iconButtonHitbox: '44px', // minimum 44x44px hitbox
  radius: {
    sm: '8px', // rounded-lg
    md: '12px', // rounded-xl (inputs, buttons, list items)
    lg: '16px', // rounded-2xl (cards, dialogs)
    sheet: '24px', // rounded-t-3xl (bottom sheets)
    full: '9999px',
  },
  mobileViewports: [360, 375, 390, 393, 414, 430] as const,
  containers: {
    mobile: 'max-w-md',
    tablet: 'md:max-w-3xl',
    desktop: 'lg:max-w-4xl',
    wide: 'lg:max-w-6xl',
  },
} as const;

export const PP_ICON_CONFIG = {
  library: '@phosphor-icons/react',
  sizes: {
    xs: 14,
    sm: 16,
    md: 18,
    lg: 20,
    xl: 22,
    hero: 24,
  },
  weights: {
    default: 'regular' as const,
    emphasis: 'bold' as const,
    active: 'fill' as const,
    illustrative: 'duotone' as const,
  },
} as const;
