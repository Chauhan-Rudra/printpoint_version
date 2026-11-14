/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { getFirebaseIdToken, subscribeFirebaseAuthState } from '../firebase';

export interface UserProfile {
  uid?: string;
  name: string;
  email: string;
  phone: string;
  initials: string;
  avatarUrl?: string;
  language: 'English' | 'ગુજરાતી' | 'हिन्दी';
  notificationsEnabled: boolean;
  joinedDate: string;
  authenticated?: boolean;
}

const STORAGE_KEY = 'printpoint_user_profile_v2';

const DEFAULT_PROFILE: UserProfile = {
  uid: undefined,
  name: '',
  email: '',
  phone: '',
  initials: 'U',
  language: 'English',
  notificationsEnabled: true,
  joinedDate: '',
  authenticated: false,
};

function computeInitials(name: string): string {
  if (!name.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

let memoryProfile: UserProfile = { ...DEFAULT_PROFILE };

export function getUserProfile(): UserProfile {
  if (typeof localStorage === 'undefined') {
    return memoryProfile;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryProfile;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      initials: computeInitials(parsed.name || ''),
    };
  } catch {
    return memoryProfile;
  }
}

export function saveUserProfile(updates: Partial<UserProfile>): UserProfile {
  const current = getUserProfile();
  const nextName = updates.name !== undefined ? updates.name : current.name;
  const updated: UserProfile = {
    ...current,
    ...updates,
    initials: computeInitials(nextName),
  };

  memoryProfile = updated;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('printpoint:profile_updated', { detail: updated }));
    } catch {
      // Ignore localStorage errors
    }
  }

  return updated;
}

export function clearUserProfile(): UserProfile {
  memoryProfile = { ...DEFAULT_PROFILE };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('printpoint:profile_updated', { detail: DEFAULT_PROFILE }));
    } catch {
      // Ignore localStorage errors
    }
  }
  return memoryProfile;
}

export function resetUserProfile(): UserProfile {
  return clearUserProfile();
}

export function syncProfileFromFirebaseUser(firebaseUser: User | null): UserProfile {
  if (!firebaseUser) {
    return clearUserProfile();
  }
  const current = getUserProfile();
  const sameUid = current.uid === firebaseUser.uid;
  const displayName =
    (sameUid && current.name ? current.name : '') ||
    firebaseUser.displayName ||
    firebaseUser.email?.split('@')[0] ||
    'Print Point User';
  return saveUserProfile({
    uid: firebaseUser.uid,
    name: displayName,
    email: firebaseUser.email || current.email || '',
    avatarUrl: firebaseUser.photoURL || (sameUid ? current.avatarUrl : undefined),
    phone: sameUid ? current.phone : '',
    joinedDate:
      (sameUid && current.joinedDate) ||
      new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    authenticated: true,
  });
}

export async function fetchAndSyncBackendProfile(): Promise<UserProfile | null> {
  const token = await getFirebaseIdToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { profile?: Partial<UserProfile> & { photoURL?: string } };
    if (!data.profile) return null;
    return saveUserProfile({
      uid: data.profile.uid,
      name: data.profile.name,
      email: data.profile.email,
      phone: data.profile.phone || '',
      avatarUrl: data.profile.photoURL || data.profile.avatarUrl,
      language: data.profile.language || 'English',
      notificationsEnabled: data.profile.notificationsEnabled ?? true,
      joinedDate: data.profile.joinedDate || '',
      authenticated: true,
    });
  } catch {
    return null;
  }
}

export async function persistProfileToBackend(updates: Partial<UserProfile>): Promise<UserProfile> {
  const savedLocal = saveUserProfile(updates);
  const token = await getFirebaseIdToken();
  if (!token) return savedLocal;
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: savedLocal.name,
        phone: savedLocal.phone,
        photoURL: savedLocal.avatarUrl,
        language: savedLocal.language,
        notificationsEnabled: savedLocal.notificationsEnabled,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { profile?: Partial<UserProfile> & { photoURL?: string } };
      if (data.profile) {
        return saveUserProfile({
          ...data.profile,
          avatarUrl: data.profile.photoURL || savedLocal.avatarUrl,
          authenticated: true,
        });
      }
    }
  } catch {
    // Keep local saved state on offline network error
  }
  return savedLocal;
}

export function useUserProfile(): {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  resetProfile: () => void;
} {
  const [profile, setProfile] = useState<UserProfile>(() => getUserProfile());

  useEffect(() => {
    const handleUpdate = () => {
      setProfile(getUserProfile());
    };

    window.addEventListener('printpoint:profile_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    const unsubscribeAuth = subscribeFirebaseAuthState((user) => {
      if (user) {
        syncProfileFromFirebaseUser(user);
        void fetchAndSyncBackendProfile();
      } else {
        clearUserProfile();
      }
    });

    return () => {
      window.removeEventListener('printpoint:profile_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      unsubscribeAuth();
    };
  }, []);

  return {
    profile,
    updateProfile: (updates: Partial<UserProfile>) => {
      const next = saveUserProfile(updates);
      setProfile(next);
      void persistProfileToBackend(updates);
    },
    resetProfile: () => {
      const reset = resetUserProfile();
      setProfile(reset);
    },
  };
}
