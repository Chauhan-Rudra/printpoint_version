import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  isVibrateSupported,
  vibrate,
  Haptics,
} from './haptics.js';

describe('haptics helper utility', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('detects when navigator.vibrate is supported', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: () => true },
      writable: true,
      configurable: true,
    });
    assert.strictEqual(isVibrateSupported(), true);
  });

  it('returns false gracefully when navigator.vibrate is missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    assert.strictEqual(isVibrateSupported(), false);
    assert.strictEqual(vibrate(10), false);
    assert.strictEqual(Haptics.selection(), false);
  });

  it('triggers file selection haptic feedback with expected vibration pattern', () => {
    let receivedPattern: number | number[] | null = null;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: (pattern: number | number[]) => {
          receivedPattern = pattern;
          return true;
        },
      },
      writable: true,
      configurable: true,
    });

    const result = Haptics.fileSelection();
    assert.strictEqual(result, true);
    assert.strictEqual(receivedPattern, 18);
  });

  it('triggers progress update haptic feedback with expected subtle tick', () => {
    let receivedPattern: number | number[] | null = null;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: (pattern: number | number[]) => {
          receivedPattern = pattern;
          return true;
        },
      },
      writable: true,
      configurable: true,
    });

    const result = Haptics.progressUpdate();
    assert.strictEqual(result, true);
    assert.strictEqual(receivedPattern, 8);
  });

  it('triggers final success state completion haptic feedback with double-pulse pattern', () => {
    let receivedPattern: number | number[] | null = null;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: (pattern: number | number[]) => {
          receivedPattern = pattern;
          return true;
        },
      },
      writable: true,
      configurable: true,
    });

    const result = Haptics.successCompletion();
    assert.strictEqual(result, true);
    assert.deepStrictEqual(receivedPattern, [24, 45, 32]);
  });

  it('handles exceptions thrown by navigator.vibrate without crashing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: () => {
          throw new Error('SecurityError: Not allowed');
        },
      },
      writable: true,
      configurable: true,
    });

    assert.doesNotThrow(() => {
      const ok = vibrate(15);
      assert.strictEqual(ok, false);
    });
  });
});
