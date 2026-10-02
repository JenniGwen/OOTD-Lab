import { ClothingItem, Outfit, VTONResult } from '../types';
import { INITIAL_CLOTHING_ITEMS } from '../data/mockCloset';

const CLOSET_KEY = 'vestiai_closet_items_v2';
const OUTFITS_KEY = 'vestiai_outfits_v2';
const VTON_HISTORY_KEY = 'vestiai_vton_history_v1';

export function getSavedClosetItems(): ClothingItem[] {
  try {
    // Check v2 first
    let raw = localStorage.getItem(CLOSET_KEY);
    if (!raw) {
      // Check if v1 existed and migrate items
      const oldRaw = localStorage.getItem('vestiai_closet_items_v1');
      if (oldRaw) {
        try {
          const oldItems: ClothingItem[] = JSON.parse(oldRaw);
          // If old items are still using unsplash URLs for standard IDs, update with new PNG assets
          const migrated = oldItems.map((item) => {
            const fresh = INITIAL_CLOTHING_ITEMS.find((init) => init.id === item.id);
            if (fresh) {
              return { ...item, imageUrl: fresh.imageUrl };
            }
            return item;
          });
          localStorage.setItem(CLOSET_KEY, JSON.stringify(migrated));
          return migrated;
        } catch {
          // fallback
        }
      }

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
