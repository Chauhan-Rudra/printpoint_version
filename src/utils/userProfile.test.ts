/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUserProfile,
  saveUserProfile,
  resetUserProfile,
} from './userProfile';

test('User Profile Utility', async (t) => {
  await t.test('returns default profile with Rudra Chauhan and correct initials', () => {
    const profile = getUserProfile();
    assert.equal(profile.name, 'Rudra Chauhan');
    assert.equal(profile.initials, 'RC');
    assert.equal(profile.language, 'English');
    assert.equal(profile.notificationsEnabled, true);
  });

  await t.test('updates user name and recomputes initials correctly', () => {
    const updated = saveUserProfile({ name: 'Aarav Sharma' });
    assert.equal(updated.name, 'Aarav Sharma');
    assert.equal(updated.initials, 'AS');

    // Reset back
    const reset = resetUserProfile();
    assert.equal(reset.name, 'Rudra Chauhan');
    assert.equal(reset.initials, 'RC');
  });

  await t.test('handles single name initials correctly', () => {
    const updated = saveUserProfile({ name: 'Rudra' });
    assert.equal(updated.initials, 'RU');

    resetUserProfile();
  });

  await t.test('updates language preferences to Gujarati or Hindi', () => {
    const updated = saveUserProfile({ language: 'ગુજરાતી' });
    assert.equal(updated.language, 'ગુજરાતી');

    resetUserProfile();
  });
});
