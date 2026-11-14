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
  await t.test('starts unauthenticated with no hardcoded demo profile', () => {
    resetUserProfile();
    const profile = getUserProfile();
    assert.equal(profile.name, '');
    assert.equal(profile.email, '');
    assert.equal(profile.initials, 'U');
    assert.equal(profile.authenticated, false);
    assert.equal(profile.language, 'English');
    assert.equal(profile.notificationsEnabled, true);
  });

  await t.test('updates user name and recomputes initials correctly', () => {
    const updated = saveUserProfile({
      name: 'Aarav Sharma',
      email: 'aarav@example.com',
      authenticated: true,
    });
    assert.equal(updated.name, 'Aarav Sharma');
    assert.equal(updated.initials, 'AS');
    assert.equal(updated.authenticated, true);

    const reset = resetUserProfile();
    assert.equal(reset.name, '');
    assert.equal(reset.authenticated, false);
  });

  await t.test('handles single name initials correctly', () => {
    const updated = saveUserProfile({ name: 'Ananya' });
    assert.equal(updated.initials, 'AN');

    resetUserProfile();
  });

  await t.test('updates language preferences to Gujarati or Hindi', () => {
    const updated = saveUserProfile({ language: 'ગુજરાતી' });
    assert.equal(updated.language, 'ગુજરાતી');

    resetUserProfile();
  });

  await t.test('updates mobile phone and toggles notification preference', () => {
    const updated = saveUserProfile({
      phone: '+91 98111 22334',
      notificationsEnabled: false,
    });
    assert.equal(updated.phone, '+91 98111 22334');
    assert.equal(updated.notificationsEnabled, false);

    resetUserProfile();
  });
});
