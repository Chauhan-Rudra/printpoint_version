import type { Transition, Variants } from 'motion/react';

/**
 * Standardised Print Point Motion System
 *
 * Uses compositor-only properties (opacity, transform) and fast settling curves
 * compatible with MotionConfig reducedMotion="user".
 */

export const PP_EASE = {
  /** Primary deceleration curve for page entries, panels, and cards */
  standard: [0.22, 1, 0.36, 1] as const,
  /** Fast responsive curve for modals and sheets */
  sheet: [0.16, 1, 0.3, 1] as const,
  /** Clean linear-like ease for exit transitions */
  exit: [0.32, 0, 0.67, 0] as const,
} as const;

export const PP_DURATION = {
  micro: 0.14,
  fast: 0.18,
  normal: 0.24,
  sheet: 0.28,
} as const;

export const PP_TRANSITION = {
  micro: {
    duration: PP_DURATION.micro,
    ease: PP_EASE.standard,
  } satisfies Transition,
  page: {
    duration: PP_DURATION.normal,
    ease: PP_EASE.standard,
  } satisfies Transition,
  modal: {
    duration: PP_DURATION.fast,
    ease: PP_EASE.sheet,
  } satisfies Transition,
  sheet: {
    duration: PP_DURATION.sheet,
    ease: PP_EASE.sheet,
  } satisfies Transition,
} as const;

/** Page view entrance/exit transition */
export const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: PP_TRANSITION.page,
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: PP_DURATION.micro, ease: PP_EASE.exit },
  },
};

/** Modal backdrop fade */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: PP_DURATION.fast } },
  exit: { opacity: 0, transition: { duration: PP_DURATION.micro } },
};

/** Centered modal dialog panel */
export const modalPanelVariants: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: PP_TRANSITION.modal,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    transition: { duration: PP_DURATION.micro, ease: PP_EASE.exit },
  },
};

/** Mobile-first bottom sheet slide-up */
export const bottomSheetVariants: Variants = {
  initial: { opacity: 0, y: 36 },
  animate: {
    opacity: 1,
    y: 0,
    transition: PP_TRANSITION.sheet,
  },
  exit: {
    opacity: 0,
    y: 28,
    transition: { duration: PP_DURATION.fast, ease: PP_EASE.exit },
  },
};

/** Tab content switching */
export const tabSwitchVariants: Variants = {
  initial: { opacity: 0, y: 5 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: PP_DURATION.fast, ease: PP_EASE.standard },
  },
  exit: {
    opacity: 0,
    y: -3,
    transition: { duration: 0.12, ease: PP_EASE.exit },
  },
};

/** Success / alert feedback pop */
export const feedbackVariants: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: PP_TRANSITION.modal,
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.98,
    transition: { duration: PP_DURATION.micro, ease: PP_EASE.exit },
  },
};

/** Subtle button tap scale feedback */
export const pressableTap = {
  whileTap: { scale: 0.98 },
  transition: { duration: 0.1 },
} as const;
