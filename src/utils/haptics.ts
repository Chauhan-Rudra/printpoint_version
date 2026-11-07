/**
 * Helper utility that wraps `navigator.vibrate()` to provide subtle, tactile
 * haptic feedback across mobile touch interfaces.
 *
 * Designed with Apple & Google Pay-inspired haptic patterns for:
 * 1. File Selection
 * 2. Progress Bar Updates & Milestones
 * 3. Final Success State Completion
 */

export type VibratePattern = number | number[];

/**
 * Checks whether the current runtime environment supports the Vibration API.
 */
export function isVibrateSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  );
}

/**
 * Safely wraps `navigator.vibrate()` with environment guards and error handling
 * to prevent crashes in restricted iframes, unsupported browsers, or desktop devices.
 */
export function vibrate(pattern: VibratePattern): boolean {
  if (!isVibrateSupported()) {
    return false;
  }
  try {
    return navigator.vibrate(pattern);
  } catch {
    // Gracefully handle browser restrictions (e.g. user gesture requirements or policy errors)
    return false;
  }
}

/**
 * Pre-calibrated subtle haptic feedback triggers for document upload workflows.
 */
export const Haptics = {
  /**
   * 1. File Selection Feedback:
   * A crisp, light tactile tap when user selects document(s) from device storage.
   */
  fileSelection: (): boolean => vibrate(18),
  selection: (): boolean => vibrate(18),

  /**
   * 2. Progress Bar Update Feedback:
   * A subtle, micro-tick when progress thresholds (25%, 50%, 75%) or chunk milestones occur.
   */
  progressUpdate: (): boolean => vibrate(8),
  progressTick: (): boolean => vibrate(8),

  /**
   * Intermediate milestone when an individual document is processed and ready.
   */
  documentReady: (): boolean => vibrate(14),

  /**
   * 3. Final Success State Completion Feedback:
   * A satisfying double-pulse tactile sequence (Google Pay / Apple Pay style)
   * celebrating full upload and processing completion.
   */
  successCompletion: (): boolean => vibrate([24, 45, 32]),
  success: (): boolean => vibrate([24, 45, 32]),

  /**
   * Error or validation alert vibration.
   */
  error: (): boolean => vibrate([35, 55, 35]),

  /**
   * Subtle tap feedback for interactive button actions.
   */
  buttonPress: (): boolean => vibrate(10),
};

export function triggerHaptic(
  type: 'selection' | 'progress' | 'success' | 'buttonPress' = 'selection'
): boolean {
  switch (type) {
    case 'selection':
      return Haptics.selection();
    case 'progress':
      return Haptics.progressUpdate();
    case 'success':
      return Haptics.successCompletion();
    case 'buttonPress':
      return Haptics.buttonPress();
    default:
      return Haptics.selection();
  }
}

export default Haptics;
