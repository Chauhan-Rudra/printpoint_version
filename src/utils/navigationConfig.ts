/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type BottomNavTab = 'home' | 'files' | 'scan' | 'tools' | 'account';

export interface BottomNavItemConfig {
  id: BottomNavTab;
  label: string;
  path: string;
  ariaLabel?: string;
  iconName: 'House' | 'FolderSimple' | 'QrCode' | 'Wrench' | 'UserCircle';
  position: number;
  isPrimary?: boolean;
}

/**
 * Mobile Bottom Navigation Items:
 * Order: HOME (1) | FILES (2) | SCAN (3) | TOOLS (4) | ACCOUNT (5)
 * Orders is completely removed from the bottom navigation.
 * Scan is positioned directly in the middle (position 3) as the primary item.
 */
export const BOTTOM_NAV_ITEMS: readonly BottomNavItemConfig[] = [
  { id: 'home', label: 'Home', path: '/', iconName: 'House', position: 1 },
  { id: 'files', label: 'Files', path: '/files', iconName: 'FolderSimple', position: 2 },
  {
    id: 'scan',
    label: 'Scan',
    path: '/scan',
    ariaLabel: 'Scan QR Code',
    iconName: 'QrCode',
    position: 3,
    isPrimary: true,
  },
  { id: 'tools', label: 'Tools', path: '/tools', iconName: 'Wrench', position: 4 },
  {
    id: 'account',
    label: 'Account',
    path: '/account',
    ariaLabel: 'Account and Session',
    iconName: 'UserCircle',
    position: 5,
  },
] as const;

export function getPathForTab(tab: BottomNavTab): string {
  const match = BOTTOM_NAV_ITEMS.find((item) => item.id === tab);
  return match ? match.path : '/';
}

export function parseTabFromLocation(
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '/',
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  hash: string = typeof window !== 'undefined' ? window.location.hash : ''
): BottomNavTab {
  const cleanPath = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  if (cleanPath === '/files') return 'files';
  if (cleanPath === '/scan') return 'scan';
  if (cleanPath === '/tools') return 'tools';
  if (cleanPath === '/account') return 'account';

  try {
    const params = new URLSearchParams(search);
    const queryTab = (params.get('tab') || '').toLowerCase();
    if (queryTab === 'files' || queryTab === 'scan' || queryTab === 'tools' || queryTab === 'account') {
      return queryTab;
    }
  } catch {
    // Ignore malformed query string
  }

  const cleanHash = hash.replace(/^#\/?/, '').toLowerCase();
  if (cleanHash === 'files' || cleanHash === 'scan' || cleanHash === 'tools' || cleanHash === 'account') {
    return cleanHash;
  }

  return 'home';
}

export function isValidNavOrder(items: readonly { id: string }[]): boolean {
  if (items.length !== 5) return false;
  const expectedOrder: BottomNavTab[] = ['home', 'files', 'scan', 'tools', 'account'];
  return items.every((item, idx) => item.id === expectedOrder[idx]);
}
