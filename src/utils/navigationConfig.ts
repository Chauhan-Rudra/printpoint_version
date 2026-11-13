/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type BottomNavTab = 'home' | 'files' | 'scan' | 'tools' | 'account';

export interface BottomNavItemConfig {
  id: BottomNavTab;
  label: string;
  ariaLabel?: string;
  iconName: 'House' | 'FolderSimple' | 'QrCode' | 'Wrench' | 'UserCircle';
  position: number;
}

/**
 * Mobile Bottom Navigation Items:
 * Order: HOME (1) | FILES (2) | SCAN (3) | TOOLS (4) | ACCOUNT (5)
 * Orders is completely removed from the bottom navigation.
 * Scan is positioned directly in the middle (position 3).
 */
export const BOTTOM_NAV_ITEMS: readonly BottomNavItemConfig[] = [
  { id: 'home', label: 'Home', iconName: 'House', position: 1 },
  { id: 'files', label: 'Files', iconName: 'FolderSimple', position: 2 },
  { id: 'scan', label: 'Scan', ariaLabel: 'Scan QR Code', iconName: 'QrCode', position: 3 },
  { id: 'tools', label: 'Tools', iconName: 'Wrench', position: 4 },
  { id: 'account', label: 'Account', ariaLabel: 'Account and Session', iconName: 'UserCircle', position: 5 },
] as const;

export function isValidNavOrder(items: readonly { id: string }[]): boolean {
  if (items.length !== 5) return false;
  const expectedOrder: BottomNavTab[] = ['home', 'files', 'scan', 'tools', 'account'];
  return items.every((item, idx) => item.id === expectedOrder[idx]);
}
