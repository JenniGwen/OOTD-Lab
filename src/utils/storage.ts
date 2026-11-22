import { ClothingItem, Outfit, VTONResult } from '../types';
import { INITIAL_CLOTHING_ITEMS } from '../data/mockCloset';

const CLOSET_KEY = 'vestiai_closet_items_v3';
const OUTFITS_KEY = 'vestiai_outfits_v2';
const VTON_HISTORY_KEY = 'vestiai_vton_history_v1';
const USERS_KEY = 'ootd_lab_users_v1';
const LOGGED_IN_USER_KEY = 'ootd_lab_logged_in_user_v1';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: string;
}

export function getSavedClosetItems(): ClothingItem[] {
  try {
    const legacyKeys = ['vestiai_closet_items_v2', 'vestiai_closet_items_v1'];
    const hasLegacyCloset = legacyKeys.some((key) => localStorage.getItem(key));

    if (hasLegacyCloset) {
      legacyKeys.forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(CLOSET_KEY, JSON.stringify(INITIAL_CLOTHING_ITEMS));
      return INITIAL_CLOTHING_ITEMS;
    }

    let raw = localStorage.getItem(CLOSET_KEY);
    if (!raw) {
      localStorage.setItem(CLOSET_KEY, JSON.stringify(INITIAL_CLOTHING_ITEMS));
      return INITIAL_CLOTHING_ITEMS;
    }

    const items: ClothingItem[] = JSON.parse(raw);
    // Keep one copy of each item, then add defaults introduced after the first visit.
    const uniqueItems = items.filter(
      (item, index, allItems) => allItems.findIndex((candidate) => candidate.id === item.id) === index
    );

    // IDs that are currently defined as defaults
    const currentDefaultIds = new Set(INITIAL_CLOTHING_ITEMS.map((i) => i.id));

    // Ensure any default item has an updated clean PNG URL.
    // Also filter out default items that have been removed from INITIAL_CLOTHING_ITEMS.
    const updated = uniqueItems
      .filter((item) => {
        // Always keep user-uploaded items (IDs that were never part of any default set)
        // Remove stale default items that no longer exist in INITIAL_CLOTHING_ITEMS
        const isDefaultStyleId = item.id.startsWith('item-');
        if (isDefaultStyleId && !currentDefaultIds.has(item.id)) return false;
        return true;
      })
      .map((item) => {
        const fresh = INITIAL_CLOTHING_ITEMS.find((init) => init.id === item.id);
        if (fresh && item.imageUrl.includes('unsplash.com')) {
          return { ...item, imageUrl: fresh.imageUrl };
        }
        return item;
      });

    const existingIds = new Set(updated.map((item) => item.id));
    const merged = [
      ...updated,
      ...INITIAL_CLOTHING_ITEMS.filter((item) => !existingIds.has(item.id)),
    ];

    if (merged.length !== items.length || merged.some((item, index) => item !== items[index])) {
      localStorage.setItem(CLOSET_KEY, JSON.stringify(merged));
    }

    return merged;
  } catch {
    return INITIAL_CLOTHING_ITEMS;
  }
}

export function saveClosetItems(items: ClothingItem[]): void {
  try {
    localStorage.setItem(CLOSET_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

export function getSavedOutfits(): Outfit[] {
  try {
    const raw = localStorage.getItem(OUTFITS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveOutfits(outfits: Outfit[]): void {
  try {
    localStorage.setItem(OUTFITS_KEY, JSON.stringify(outfits));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

export function getSavedVTONHistory(): VTONResult[] {
  try {
    const raw = localStorage.getItem(VTON_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveVTONHistory(history: VTONResult[]): void {
  try {
    localStorage.setItem(VTON_HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

export function getSavedUsers(): AuthUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuthUser[];
  } catch {
    return [];
  }
}

export function saveUsers(users: AuthUser[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

export function saveLoggedInUser(user: AuthUser | null): void {
  try {
    if (!user) {
      localStorage.removeItem(LOGGED_IN_USER_KEY);
      return;
    }
    localStorage.setItem(LOGGED_IN_USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

export function getLoggedInUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LOGGED_IN_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function findUserByEmail(email: string): AuthUser | undefined {
  return getSavedUsers().find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function registerUser(payload: { name: string; email: string; password: string }): AuthUser {
  const email = payload.email.trim();
  const name = payload.name.trim();

  const existingUser = findUserByEmail(email);
  if (existingUser) {
    throw new Error('Email sudah terdaftar');
  }

  const newUser: AuthUser = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    email: email.toLowerCase(),
    password: payload.password,
    createdAt: new Date().toISOString(),
  };

  saveUsers([...getSavedUsers(), newUser]);
  return newUser;
}

export function loginUser(email: string, password: string): AuthUser | null {
  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
    return null;
  }
  saveLoggedInUser(user);
  return user;
}

// Format Rupiah currency
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Calculate days since a given ISO date
export function getDaysAgo(isoDateString: string): number {
  const date = new Date(isoDateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Format relative date (e.g. "Hari ini", "Kemarin", "3 hari lalu", "45 hari lalu")
export function formatRelativeDate(isoDateString: string): string {
  const days = getDaysAgo(isoDateString);
  if (days === 0) return 'Hari ini';
  if (days === 1) return 'Kemarin';
  if (days < 30) return `${days} hari lalu`;
  const months = Math.floor(days / 30);
  return `${months} bulan lalu (${days} hari)`;
}
