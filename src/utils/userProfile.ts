/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  initials: string;
  avatarUrl?: string;
  language: 'English' | 'ગુજરાતી' | 'हिन्दी';
  notificationsEnabled: boolean;
  joinedDate: string;
}

const STORAGE_KEY = 'printpoint_user_profile';

const DEFAULT_PROFILE: UserProfile = {
  name: 'Rudra Chauhan',
  email: 'upskilling589@gmail.com',
  phone: '+91 98765 43210',
  initials: 'RC',
  language: 'English',
  notificationsEnabled: true,
  joinedDate: 'November 2026',
};

function computeInitials(name: string): string {
  if (!name.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getUserProfile(): UserProfile {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_PROFILE;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      initials: computeInitials(parsed.name || DEFAULT_PROFILE.name),
    };
  } catch {
    return DEFAULT_PROFILE;
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

export function resetUserProfile(): UserProfile {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('printpoint:profile_updated', { detail: DEFAULT_PROFILE }));
    } catch {
      // Ignore localStorage errors
    }
  }
  return DEFAULT_PROFILE;
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

    return () => {
      window.removeEventListener('printpoint:profile_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return {
    profile,
    updateProfile: (updates: Partial<UserProfile>) => {
      const next = saveUserProfile(updates);
      setProfile(next);
    },
    resetProfile: () => {
      const reset = resetUserProfile();
      setProfile(reset);
    },
  };
}
