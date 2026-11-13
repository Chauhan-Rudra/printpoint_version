/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOTTOM_NAV_ITEMS,
  isValidNavOrder,
} from './navigationConfig';

test('Mobile Bottom Navigation Configuration', async (t) => {
  await t.test('has exactly 5 navigation items in required order: Home, Files, Scan, Tools, Account', () => {
    assert.equal(BOTTOM_NAV_ITEMS.length, 5);
    assert.equal(BOTTOM_NAV_ITEMS[0].id, 'home');
    assert.equal(BOTTOM_NAV_ITEMS[1].id, 'files');
    assert.equal(BOTTOM_NAV_ITEMS[2].id, 'scan');
    assert.equal(BOTTOM_NAV_ITEMS[3].id, 'tools');
    assert.equal(BOTTOM_NAV_ITEMS[4].id, 'account');
  });

  await t.test('places Scan directly in the middle (3rd item)', () => {
    const scanItem = BOTTOM_NAV_ITEMS[2];
    assert.equal(scanItem.id, 'scan');
    assert.equal(scanItem.label, 'Scan');
    assert.equal(scanItem.iconName, 'QrCode');
    assert.equal(scanItem.position, 3);
  });

  await t.test('completely excludes Orders from the navigation items', () => {
    const hasOrders = BOTTOM_NAV_ITEMS.some((item) => (item.id as string) === 'orders' || item.label === 'Orders');
    assert.equal(hasOrders, false, 'Orders should not be present in bottom navigation');
  });

  await t.test('verifies correct Phosphor icon assignments for all 5 tabs', () => {
    assert.equal(BOTTOM_NAV_ITEMS[0].iconName, 'House');
    assert.equal(BOTTOM_NAV_ITEMS[1].iconName, 'FolderSimple');
    assert.equal(BOTTOM_NAV_ITEMS[2].iconName, 'QrCode');
    assert.equal(BOTTOM_NAV_ITEMS[3].iconName, 'Wrench');
    assert.equal(BOTTOM_NAV_ITEMS[4].iconName, 'UserCircle');
  });

  await t.test('validates validNavOrder helper function', () => {
    assert.equal(isValidNavOrder(BOTTOM_NAV_ITEMS), true);
    assert.equal(isValidNavOrder([{ id: 'home' }, { id: 'scan' }]), false);
    assert.equal(
      isValidNavOrder([
        { id: 'home' },
        { id: 'orders' },
        { id: 'scan' },
        { id: 'files' },
        { id: 'tools' },
      ]),
      false
    );
  });
});
