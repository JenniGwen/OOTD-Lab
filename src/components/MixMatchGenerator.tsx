import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Wand2,
  Sparkles,
  Shirt,
  Layers,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Palette,
  Loader2,
  ArrowRight,
  Shuffle,
  Trash2,
  Calendar,
  MoveHorizontal,
  RotateCcw,
  X,
  Plus,
} from 'lucide-react';
import { ClothingCategory, ClothingItem, ColorHarmony, Outfit } from '../types';

interface MixMatchGeneratorProps {
  items: ClothingItem[];
  savedOutfits: Outfit[];
  onSaveOutfit: (outfit: Outfit) => void;
  onDeleteOutfit: (id: string) => void;
  onLogOutfitWear: (outfit: Outfit) => void;
  onSendToTryOn: (topItem?: ClothingItem, bottomItem?: ClothingItem) => void;
  initialTop?: ClothingItem;
  initialBottom?: ClothingItem;
}

interface AiOutfitRecommendation {
  title: string;
  itemIds: string[];
  score: number;
  occasion: string;
  reasoning: string;
  colorHarmony: ColorHarmony;
  stylingTips: string[];
}

type HSL = { h: number; s: number; l: number };

const COLOR_NAME_HEX: Record<string, string> = {
  putih: '#FFFFFF', white: '#FFFFFF', ivory: '#FFFFF0',
  hitam: '#191919', black: '#191919', charcoal: '#36454F',
  abu: '#96948B', 'abu-abu': '#96948B', gray: '#808080', grey: '#808080', silver: '#C0C0C0',
  krem: '#F5F5DC', cream: '#F5F5DC', beige: '#DCCFB4', khaki: '#C3B091',
  navy: '#1E3A5F', 'biru navy': '#1E3A5F', denim: '#4F6D8A', biru: '#3975A5', blue: '#3975A5',
  merah: '#D94A3A', red: '#D94A3A', vermilion: '#E34234',
  hijau: '#54845B', green: '#54845B', olive: '#708238',
  cokelat: '#795548', brown: '#795548', tan: '#C19A6B',
  kuning: '#D8B96A', yellow: '#D8B96A', gold: '#D4AF37',
  pink: '#D98C9A', merahmuda: '#D98C9A', ungu: '#8064A2', purple: '#8064A2',
  orange: '#D98236', jingga: '#D98236',
};

function hexToHsl(hex: string): HSL | null {
  const normalized = hex.replace('#', '').trim();
  const expanded = normalized.length === 3 ? normalized.split('').map((value) => value + value).join('') : normalized;
  if (!/^[\da-f]{6}$/i.test(expanded)) return null;

  const red = parseInt(expanded.slice(0, 2), 16) / 255;
  const green = parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = parseInt(expanded.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }

  return { h: hue, s: saturation, l: lightness };
}

function resolveColorHex(hexColor?: string, colorName?: string, sampledHex?: string): string | null {
  if (hexColor && hexToHsl(hexColor)) return `#${hexColor.replace('#', '').toUpperCase()}`;

  const normalizedName = colorName?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (normalizedName) {
    const colorMatch = Object.entries(COLOR_NAME_HEX).find(([name]) => normalizedName.includes(name));
    if (colorMatch) return colorMatch[1];
  }

  return sampledHex && hexToHsl(sampledHex) ? sampledHex : null;
}

function sampleDominantHex(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
        for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex += 4) {
          const alpha = pixels[pixelIndex + 3];
          if (alpha < 128) continue;
          const red = pixels[pixelIndex];
          const green = pixels[pixelIndex + 1];
          const blue = pixels[pixelIndex + 2];
          if (red > 247 && green > 247 && blue > 247) continue;

          const key = `${red >> 4}-${green >> 4}-${blue >> 4}`;
          const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
          bucket.count += 1;
          bucket.red += red;
          bucket.green += green;
          bucket.blue += blue;
          buckets.set(key, bucket);
        }

        const dominant = [...buckets.values()].sort((first, second) => second.count - first.count)[0];
        if (!dominant) return resolve(null);
        const toHex = (value: number) => Math.round(value / dominant.count).toString(16).padStart(2, '0');
        resolve(`#${toHex(dominant.red)}${toHex(dominant.green)}${toHex(dominant.blue)}`.toUpperCase());
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = imageUrl;
  });
}

function isNeutral({ s, l }: HSL): boolean {
  return s < 0.15 || l < 0.12 || l > 0.9;
}

function hueDiff(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360;
  return difference > 180 ? 360 - difference : difference;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

// Helper hook for drag/swipe gesture
function useHorizontalSwipe(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const isDragging = useRef(false);

  const minSwipeDistance = 35;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > minSwipeDistance) {
      onSwipeLeft(); // Next
    } else if (distance < -minSwipeDistance) {
      onSwipeRight(); // Prev
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    touchStartX.current = e.clientX;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    touchEndX.current = e.clientX;
  };

  const onMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > minSwipeDistance) {
      onSwipeLeft();
    } else if (distance < -minSwipeDistance) {
      onSwipeRight();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}

export const MixMatchGenerator: React.FC<MixMatchGeneratorProps> = ({
  items,
  savedOutfits,
  onSaveOutfit,
  onDeleteOutfit,
  onLogOutfitWear,
  onSendToTryOn,
  initialTop,
  initialBottom,
}) => {
  // Category item pools
  const tops = useMemo(() => items.filter((i) => i.category === 'Atasan'), [items]);
  const bottoms = useMemo(() => items.filter((i) => i.category === 'Bawahan'), [items]);
  const outerwears = useMemo(() => items.filter((i) => i.category === 'Luaran'), [items]);
  const shoes = useMemo(() => items.filter((i) => i.category === 'Sepatu'), [items]);
  const accessories = useMemo(() => items.filter((i) => i.category === 'Aksesoris'), [items]);

  // Active indices for the mannequin swipe slots (-1 represents "none / empty")
  const [topIndex, setTopIndex] = useState<number>(() => {
    if (initialTop) {
      const idx = tops.findIndex((i) => i.id === initialTop.id);
      return idx >= 0 ? idx : 0;
    }
    return tops.length > 0 ? 0 : -1;
  });

  const [bottomIndex, setBottomIndex] = useState<number>(() => {
    if (initialBottom) {
      const idx = bottoms.findIndex((i) => i.id === initialBottom.id);
      return idx >= 0 ? idx : 0;
    }
    return bottoms.length > 0 ? 0 : -1;
  });

  const [outerwearIndex, setOuterwearIndex] = useState<number>(-1);
  const [shoesIndex, setShoesIndex] = useState<number>(-1);
  const [accessorySlots, setAccessorySlots] = useState<number[]>([]); // up to 5 accessory slots
  const [sampledColors, setSampledColors] = useState<Record<string, string>>({});
  const MAX_ACC = 5;

  // Active outfit metadata
  const [outfitName, setOutfitName] = useState('Monochrome Minimalist');
  const [occasion, setOccasion] = useState('Daily & Coffee Meetup');

  // AI Recommender state
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<AiOutfitRecommendation[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [justLogged, setJustLogged] = useState(false);

  const selectedTop = topIndex >= 0 && topIndex < tops.length ? tops[topIndex] : null;
  const selectedBottom = bottomIndex >= 0 && bottomIndex < bottoms.length ? bottoms[bottomIndex] : null;
  const selectedOuterwear = outerwearIndex >= 0 && outerwearIndex < outerwears.length ? outerwears[outerwearIndex] : null;
  const selectedShoes = shoesIndex >= 0 && shoesIndex < shoes.length ? shoes[shoesIndex] : null;
  const selectedAccessories = useMemo(
    () => accessorySlots.map((idx) => accessories[idx]).filter((item): item is ClothingItem => Boolean(item)),
    [accessorySlots, accessories]
  );
  const selectedColorItems = useMemo(
    () => [selectedTop, selectedBottom, selectedOuterwear, selectedShoes, ...selectedAccessories]
      .filter((item): item is ClothingItem => Boolean(item)),
    [selectedTop, selectedBottom, selectedOuterwear, selectedShoes, selectedAccessories]
  );

  useEffect(() => {
    let isActive = true;
    const itemsWithoutColorMetadata = selectedColorItems.filter((item) => !resolveColorHex(item.hexColor, item.color));
    if (itemsWithoutColorMetadata.length === 0) return () => { isActive = false; };

    Promise.all(itemsWithoutColorMetadata.map(async (item) => [item.id, await sampleDominantHex(item.imageUrl)] as const))
      .then((results) => {
        if (!isActive) return;
        setSampledColors((current) => {
          const next = { ...current };
          for (const [itemId, hexColor] of results) {
            if (hexColor) next[itemId] = hexColor;
          }
          return next;
        });
      });

    return () => { isActive = false; };
  }, [selectedColorItems]);

  // Swipe navigation functions for each section
  const nextTop = () => {
    if (tops.length === 0) return;
    setTopIndex((prev) => (prev + 1) % tops.length);
  };
  const prevTop = () => {
    if (tops.length === 0) return;
    setTopIndex((prev) => (prev - 1 + tops.length) % tops.length);
  };

  const nextBottom = () => {
    if (bottoms.length === 0) return;
    setBottomIndex((prev) => (prev + 1) % bottoms.length);
  };
  const prevBottom = () => {
    if (bottoms.length === 0) return;
    setBottomIndex((prev) => (prev - 1 + bottoms.length) % bottoms.length);
  };

  const nextOuterwear = () => {
    // Cycles through: -1 (Tanpa Luaran) -> 0 -> 1 ... -> -1
    const total = outerwears.length;
    if (total === 0) return;
    setOuterwearIndex((prev) => (prev + 1 >= total ? -1 : prev + 1));
  };
  const prevOuterwear = () => {
    const total = outerwears.length;
    if (total === 0) return;
    setOuterwearIndex((prev) => (prev <= -1 ? total - 1 : prev - 1));
  };

  const nextShoes = () => {
    const total = shoes.length;
    if (total === 0) return;
    setShoesIndex((prev) => (prev + 1 >= total ? -1 : prev + 1));
  };
  const prevShoes = () => {
    const total = shoes.length;
    if (total === 0) return;
    setShoesIndex((prev) => (prev <= -1 ? total - 1 : prev - 1));
  };

  // Accessory slot helpers — each slot must hold a unique accessory index
  const addAccessorySlot = () => {
    if (accessorySlots.length >= MAX_ACC || accessories.length === 0) return;
    const used = new Set(accessorySlots);
    const nextIdx = accessories.findIndex((_, i) => !used.has(i));
    if (nextIdx >= 0) setAccessorySlots(prev => [...prev, nextIdx]);
  };
  const removeAccessorySlot = (slotPos: number) => {
    setAccessorySlots(prev => prev.filter((_, i) => i !== slotPos));
  };
  const cycleAccessorySlot = (slotPos: number, dir: 1 | -1) => {
    if (accessories.length === 0) return;
    setAccessorySlots(prev => {
      const next = [...prev];
      const used = new Set(prev.filter((_, i) => i !== slotPos));
      let candidate = (next[slotPos] + dir + accessories.length) % accessories.length;
      let attempts = 0;
      while (used.has(candidate) && attempts < accessories.length) {
        candidate = (candidate + dir + accessories.length) % accessories.length;
        attempts++;
      }
      if (!used.has(candidate)) next[slotPos] = candidate;
      return next;
    });
  };

  // Swipers hooks
  const topSwipe = useHorizontalSwipe(nextTop, prevTop);
  const bottomSwipe = useHorizontalSwipe(nextBottom, prevBottom);
  const outerSwipe = useHorizontalSwipe(nextOuterwear, prevOuterwear);
  const shoesSwipe = useHorizontalSwipe(nextShoes, prevShoes);

  // Randomize / Shuffle all layers
  const handleShuffleAll = () => {
    if (tops.length > 0) setTopIndex(Math.floor(Math.random() * tops.length));
    if (bottoms.length > 0) setBottomIndex(Math.floor(Math.random() * bottoms.length));
    if (outerwears.length > 0) {
      const pickOuter = Math.random() > 0.4 ? Math.floor(Math.random() * outerwears.length) : -1;
      setOuterwearIndex(pickOuter);
    }
    if (shoes.length > 0) setShoesIndex(Math.floor(Math.random() * shoes.length));
    if (accessories.length > 0) {
      const count = Math.floor(Math.random() * Math.min(3, accessories.length)) + 1;
      const slots = Array.from({ length: count }, () => Math.floor(Math.random() * accessories.length));
      setAccessorySlots(slots);
    }
  };

  // Reset mannequin
  const handleResetMannequin = () => {
    setTopIndex(-1);
    setBottomIndex(-1);
    setOuterwearIndex(-1);
    setShoesIndex(-1);
    setAccessorySlots([]);
  };

  // Keep the analysis as structured JSON so the same values can be saved with the outfit.
  const colorAnalysis = useMemo<ColorHarmony>(() => {
    const palette = selectedColorItems.map((item) => ({
        itemId: item.id,
        name: item.name,
        category: item.category,
        hexColor: resolveColorHex(item.hexColor, item.color, sampledColors[item.id]) || '#808080',
      }));

    if (palette.length === 0) {
      return {
        score: 0,
        harmonyType: 'empty',
        verdict: 'Pilih item untuk melihat harmoni warna',
        tips: 'Kombinasi warna akan dianalisis dari palet item yang dipilih.',
        palette,
      };
    }

    const allColors = palette.map(({ hexColor }) => hexToHsl(hexColor)).filter((color): color is HSL => color !== null);
    const chroma = allColors.filter((color) => !isNeutral(color));
    const neutrals = allColors.length - chroma.length;
    let spread = 0;
    for (let firstIndex = 0; firstIndex < chroma.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < chroma.length; secondIndex += 1) {
        spread = Math.max(spread, hueDiff(chroma[firstIndex].h, chroma[secondIndex].h));
      }
    }

    let hueScore: number;
    let harmonyType: string;
    let verdict: string;
    let tips: string;
    if (chroma.length <= 1) {
      hueScore = 80;
      harmonyType = chroma.length === 0 ? 'Netral / Monochrome' : 'Netral + 1 aksen';
      verdict = chroma.length === 0
        ? 'Semua warna netral, aman dan clean. Tambah satu aksen agar lebih hidup.'
        : 'Satu warna aksen di atas dasar netral selalu terlihat rapi.';
      tips = chroma.length === 0
        ? 'Tambahkan aksesori atau satu item berwarna untuk memberi titik fokus.'
        : 'Gunakan warna netral sebagai penyeimbang aksen utama.';
    } else {
      const analogousDistance = spread;
      const triadicDistance = Math.abs(spread - 120);
      const complementaryDistance = Math.abs(spread - 180);
      const bestDistance = Math.min(analogousDistance, triadicDistance, complementaryDistance);
      hueScore = clamp(88 - bestDistance * 1.2 - (analogousDistance === bestDistance ? 0 : triadicDistance === bestDistance ? 6 : 3));

      if (bestDistance === analogousDistance) {
        harmonyType = 'Analogous';
        verdict = 'Warna berdekatan membentuk palet harmonis.';
        tips = 'Variasikan terang dan gelap agar outfit tetap berdimensi.';
      } else if (bestDistance === complementaryDistance) {
        harmonyType = 'Komplementer';
        verdict = 'Kontras warna memberi karakter yang kuat.';
        tips = 'Jadikan satu warna dominan dan satu lagi sebagai aksen.';
      } else {
        harmonyType = 'Triadic';
        verdict = 'Kombinasi warna berani dan dinamis.';
        tips = 'Turunkan saturasi salah satu warna supaya outfit tidak terlihat ramai.';
      }

      if (bestDistance > 25) {
        harmonyType = 'Kontras tinggi';
        verdict = 'Warna kuat saling bersaing dalam palet ini.';
        tips = 'Ganti salah satu warna kuat dengan warna netral agar lebih seimbang.';
      }
    }

    const colorPenalty = Math.max(0, chroma.length - 2) * 8;
    const averageSaturation = chroma.length > 0
      ? chroma.reduce((total, color) => total + color.s, 0) / chroma.length
      : 0;
    const saturationPenalty = chroma.length >= 2 ? Math.max(0, averageSaturation - 0.6) * 30 : 0;
    const lightnessValues = allColors.map((color) => color.l);
    const lightnessRange = lightnessValues.length > 1 ? Math.max(...lightnessValues) - Math.min(...lightnessValues) : 0;
    const depthBonus = clamp(lightnessRange * 12, 0, 8);
    const neutralBonus = chroma.length >= 2 && neutrals > 0 ? 4 : 0;
    const score = Math.round(clamp(hueScore - colorPenalty - saturationPenalty + depthBonus + neutralBonus, 35, 98));

    return {
      score,
      harmonyType,
      verdict,
      tips,
      palette,
    };
  }, [selectedColorItems, sampledColors]);

  // Trigger AI Outfit Recommender
  const handleGenerateAiRecommendation = async () => {
    setIsAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/mixmatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closetItems: items,
          currentOutfit: {
            top: selectedTop?.name,
            bottom: selectedBottom?.name,
            outerwear: selectedOuterwear?.name,
            shoes: selectedShoes?.name,
            accessories: selectedAccessories.map((item) => item.name),
          },
          occasion,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Gagal memanggil AI Stylist');
      if (!Array.isArray(data.recommendedOutfits)) throw new Error('Respons AI tidak berisi rekomendasi outfit.');
      setAiRecommendations(data.recommendedOutfits);
    } catch (err) {
      console.warn('AI Recommender notice:', err);
      setAiError(err instanceof Error ? err.message : 'Gagal memanggil Gemini AI.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Apply an AI recommendation to the mannequin
  const applyRecommendation = (rec: AiOutfitRecommendation) => {
    const recItems = items.filter((i) => rec.itemIds?.includes(i.id));
    const newTop = recItems.find((i) => i.category === 'Atasan');
    const newBottom = recItems.find((i) => i.category === 'Bawahan');
    const newOuter = recItems.find((i) => i.category === 'Luaran');
    const newShoes = recItems.find((i) => i.category === 'Sepatu');
    const newAccessories = recItems.filter((i) => i.category === 'Aksesoris');

    if (newTop) {
      const idx = tops.findIndex((i) => i.id === newTop.id);
      if (idx >= 0) setTopIndex(idx);
    }
    if (newBottom) {
      const idx = bottoms.findIndex((i) => i.id === newBottom.id);
      if (idx >= 0) setBottomIndex(idx);
    }
    if (newOuter) {
      const idx = outerwears.findIndex((i) => i.id === newOuter.id);
      if (idx >= 0) setOuterwearIndex(idx);
    } else {
      setOuterwearIndex(-1);
    }
    const shoeIdx = newShoes ? shoes.findIndex((i) => i.id === newShoes.id) : -1;
    setShoesIndex(shoeIdx);
    setAccessorySlots(newAccessories
      .map((item) => accessories.findIndex((i) => i.id === item.id))
      .filter((idx) => idx >= 0)
      .slice(0, MAX_ACC));

    if (rec.title) setOutfitName(rec.title);
    if (rec.occasion) setOccasion(rec.occasion);
  };

  // Save current outfit
  const handleSaveCurrentOutfit = () => {
    if (!selectedTop && !selectedBottom) {
      alert('Pilih minimal satu atasan atau bawahan untuk menyimpan outfit.');
      return;
    }

    const newOutfit: Outfit = {
      id: `outfit-${Date.now()}`,
      name: outfitName || 'Outfit Favorit Baru',
      topId: selectedTop?.id,
      bottomId: selectedBottom?.id,
      outerwearId: selectedOuterwear?.id,
      shoesId: selectedShoes?.id,
      accessoryId: selectedAccessories[0]?.id,
      accessoryIds: selectedAccessories.map((item) => item.id),
      occasion,
      wearCount: 0,
      createdAt: new Date().toISOString(),
      score: colorAnalysis.score,
      colorHarmony: colorAnalysis,
      reasoning: colorAnalysis.verdict,
      stylingTips: [colorAnalysis.tips],
    };

    onSaveOutfit(newOutfit);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  // Log wear
  const handleLogOutfitWearClick = () => {
    if (!selectedTop && !selectedBottom) return;
    const currentOutfitObj: Outfit = {
      id: `outfit-temp-${Date.now()}`,
      name: outfitName,
      topId: selectedTop?.id,
      bottomId: selectedBottom?.id,
      outerwearId: selectedOuterwear?.id,
      shoesId: selectedShoes?.id,
      accessoryId: selectedAccessories[0]?.id,
      accessoryIds: selectedAccessories.map((item) => item.id),
      occasion,
      wearCount: 1,
      createdAt: new Date().toISOString(),
    };
    onLogOutfitWear(currentOutfitObj);
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 2500);
  };

  const handleTransitToVton = () => {
    onSendToTryOn(selectedTop || undefined, selectedBottom || undefined);
  };

  return (
    <div className="space-y-6">
      {/* Title Banner - Editorial Aesthetic */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#C8D9A5]">
        <div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-normal text-[#191919] tracking-tight">
            Studio Padu-Padan Manekin
          </h2>
          <p className="text-xs sm:text-sm text-[#96948B] mt-1 font-light max-w-xl">
            Geser pakaian langsung pada tubuh manekin untuk menyusun komposisi busana arsip Anda.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Shuffle button */}
          <button
            onClick={handleShuffleAll}
            className="px-4 py-2.5 border border-[#C8D9A5] hover:bg-[#7A2117] hover:text-[#F8F6EC] text-[#191919] text-xs font-editorial-mono uppercase tracking-wider transition-colors cursor-pointer"
            title="Acak dan geser semua pakaian di manekin"
          >
            Acak Semua
          </button>

          {/* AI Recommender Button */}
          <button
            onClick={handleGenerateAiRecommendation}
            disabled={isAiLoading}
            className="btn-upload cursor-pointer disabled:opacity-50"
          >
            {isAiLoading ? 'CURATING WITH AI...' : 'CURATE WITH GEMINI AI'}
          </button>
        </div>
      </div>

      {aiError && (
        <p role="alert" className="rounded-xl border border-[#E6B8B2] bg-[#FBF1EF] px-4 py-3 text-sm leading-relaxed text-[#64190F]">
          Gemini AI: {aiError}
        </p>
      )}

      {/* AI Recommendations */}
      {aiRecommendations.length > 0 && (
        <section className="border border-[#C8D9A5] bg-white p-5 sm:p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C8D9A5] pb-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-[#7A2117]" />
              <h3 className="font-editorial text-xl font-semibold text-[#191919]">Kurasi Padu-Padan AI Stylist</h3>
            </div>
            <span className="rounded-full bg-[#F2F7E8] px-3 py-1 text-xs font-medium text-[#41483A]">
              Curated Selection
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {aiRecommendations.map((rec, idx) => (
              <div
                key={idx}
                className="min-w-0 border border-[#C8D9A5] bg-[#F9F8F5] p-4 sm:p-5 flex flex-col justify-between gap-4 transition-colors hover:bg-[#F2F7E8]/60"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-[#AFC58C] px-3 py-1 text-xs font-semibold text-[#191919]">
                      Match {rec.score}%
                    </span>
                    <span className="min-w-0 truncate text-xs text-[#66635C]">{rec.occasion}</span>
                  </div>

                  <h4 className="mt-4 break-words text-lg font-semibold leading-snug text-[#191919]">{rec.title}</h4>
                  <p className="mt-2 line-clamp-3 break-words text-sm leading-relaxed text-[#66635C]">{rec.reasoning}</p>
                  <div className="mt-3 space-y-1 text-xs leading-relaxed text-[#66635C]">
                    <p><span className="font-semibold capitalize text-[#41483A]">{rec.colorHarmony.harmonyType}</span> · {rec.colorHarmony.score}%</p>
                    <p className="break-words">{rec.colorHarmony.verdict}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#C8D9A5] pt-3">
                    {rec.itemIds?.map((itemId: string) => {
                      const it = items.find((x) => x.id === itemId);
                      if (!it) return null;
                      return (
                        <div key={itemId} className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#C8D9A5] bg-[#F2F7E8] p-1">
                          <img
                            src={it.imageUrl}
                            alt={it.name}
                            referrerPolicy="no-referrer"
                            title={`${it.name} (${it.category})`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => applyRecommendation(rec)}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#7A2117] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#64190F] cursor-pointer"
                >
                  <span>Terapkan ke Manekin</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Workspace: Interactive Mannequin Canvas (Left) & Controls/Saved (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Mannequin Canvas (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="w-full border border-black/[0.04] bg-white p-5 sm:p-6 shadow-[0_2px_20px_rgba(60,40,30,0.06)] relative overflow-hidden flex flex-col items-center">
            {/* Canvas Header */}
            <div className="w-full flex items-center justify-between pb-3 border-b border-[#C8D9A5] mb-2">
              <div className="flex items-center gap-2">
                <span className="label text-[#191919]">Live Display</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleShuffleAll}
                  className="label text-[#96948B] hover:text-[#191919] hover:opacity-100 flex items-center gap-1 cursor-pointer"
                  title="Randomize outfit"
                >
                  <Shuffle className="w-3 h-3" />
                  <span>Acak</span>
                </button>
                <button
                  onClick={handleResetMannequin}
                  className="label text-[#96948B] hover:text-[#191919] flex items-center gap-1 cursor-pointer"
                  title="Reset mannequin"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Outfit Stage — 3-col: luaran | outfit stack | accessories */}
            <div className="w-full flex gap-3 select-none py-1 my-1 items-start">

              {/* LEFT: Luaran panel */}
              <div className="flex-1 min-w-0 flex flex-col items-center gap-2 pt-2">
                {selectedOuterwear ? (
                  <div
                    {...outerSwipe}
                    className="relative w-full h-[200px] flex items-center justify-center group cursor-grab active:cursor-grabbing"
                  >
                    <img
                      src={selectedOuterwear.imageUrl}
                      alt={selectedOuterwear.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain filter drop-shadow-[0_4px_10px_rgba(26,26,26,0.12)] transition-transform duration-200 group-hover:scale-105 select-none pointer-events-none"
                    />
                    <button onClick={(e) => { e.stopPropagation(); prevOuterwear(); }} className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#191919]/80 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"><ChevronLeft className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); nextOuterwear(); }} className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#191919]/80 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"><ChevronRight className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setOuterwearIndex(-1); }} className="absolute top-0 right-0 w-4 h-4 rounded-full bg-[#191919]/70 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"><X className="w-2.5 h-2.5" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => { if (outerwears.length > 0) setOuterwearIndex(0); }}
                    className="square-control w-full h-[200px] border border-dashed border-[#C8D9A5] hover:border-[#AFC58C] flex flex-col items-center justify-center gap-1 text-[#96948B] hover:text-[#191919] transition-all cursor-pointer bg-[#F9F8F5] hover:bg-[#F2F7E8]"
                    title="Tambah luaran"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="label text-[9px]">Tambah Luaran</span>
                  </button>
                )}

                {accessories.length > 0 && (
                  <div className="w-full mt-3">
                    <div className="grid grid-cols-2 gap-2">
                      {accessorySlots.map((accIdx, slotPos) => {
                        const acc = accessories[accIdx];
                        if (!acc) return null;
                        return (
                          <div
                            key={slotPos}
                            className="relative aspect-square flex items-center justify-center group cursor-pointer"
                          >
                            <img
                              src={acc.imageUrl}
                              alt={acc.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain filter drop-shadow-[0_4px_10px_rgba(26,26,26,0.12)] transition-transform duration-200 group-hover:scale-105 select-none pointer-events-none"
                            />
                            <button onClick={(e) => { e.stopPropagation(); cycleAccessorySlot(slotPos, -1); }} className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#191919]/80 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"><ChevronLeft className="w-3 h-3" /></button>
                            <button onClick={(e) => { e.stopPropagation(); cycleAccessorySlot(slotPos, 1); }} className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#191919]/80 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"><ChevronRight className="w-3 h-3" /></button>
                            <button onClick={(e) => { e.stopPropagation(); removeAccessorySlot(slotPos); }} className="absolute top-0 right-0 w-4 h-4 rounded-full bg-[#191919]/70 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"><X className="w-2.5 h-2.5" /></button>
                          </div>
                        );
                      })}

                      {accessorySlots.length < MAX_ACC && accessorySlots.length < accessories.length && (
                        <button
                          onClick={addAccessorySlot}
                          className="square-control aspect-square border border-dashed border-[#C8D9A5] hover:border-[#AFC58C] flex flex-col items-center justify-center gap-1 text-[#96948B] hover:text-[#191919] transition-all cursor-pointer bg-[#F9F8F5] hover:bg-[#F2F7E8]"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="label text-[9px]">Tambah Aksesoris</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* CENTER: Main outfit stack — uniform fixed containers */}
              <div className="flex-1 flex flex-col items-center gap-1">

                {/* ATASAN — uniform h-[200px] container */}
                <div
                  {...topSwipe}
                  className="relative w-full h-[200px] flex items-center justify-center group cursor-grab active:cursor-grabbing"
                >
                  {selectedTop ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img src={selectedTop.imageUrl} alt={selectedTop.name} referrerPolicy="no-referrer"
                        className="w-full h-full object-contain filter drop-shadow-[0_8px_18px_rgba(26,26,26,0.14)] transition-transform duration-200 group-hover:scale-[1.02] select-none pointer-events-none" />
                      <button onClick={(e) => { e.stopPropagation(); prevTop(); }} className="absolute -left-5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#191919]/85 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer shadow-md"><ChevronLeft className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); nextTop(); }} className="absolute -right-5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#191919]/85 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer shadow-md"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { if (tops.length > 0) setTopIndex(0); }}
                      disabled={tops.length === 0}
                      className="square-control w-full h-full flex flex-col items-center justify-center gap-1 label text-[#96948B] hover:text-[#191919] border border-dashed border-[#C8D9A5] hover:border-[#C8D9A5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      {tops.length > 0 ? 'Tambah Atasan' : 'Belum ada atasan'}
                    </button>
                  )}
                </div>

                {/* BAWAHAN — uniform h-[200px] container */}
                <div
                  {...bottomSwipe}
                  className="relative w-full h-[200px] flex items-center justify-center group cursor-grab active:cursor-grabbing"
                >
                  {selectedBottom ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img src={selectedBottom.imageUrl} alt={selectedBottom.name} referrerPolicy="no-referrer"
                        className="w-full h-full object-contain filter drop-shadow-[0_8px_18px_rgba(26,26,26,0.14)] transition-transform duration-200 group-hover:scale-[1.02] select-none pointer-events-none" />
                      <button onClick={(e) => { e.stopPropagation(); prevBottom(); }} className="absolute -left-5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#191919]/85 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer shadow-md"><ChevronLeft className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); nextBottom(); }} className="absolute -right-5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#191919]/85 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer shadow-md"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { if (bottoms.length > 0) setBottomIndex(0); }}
                      disabled={bottoms.length === 0}
                      className="square-control w-full h-full flex flex-col items-center justify-center gap-1 label text-[#96948B] hover:text-[#191919] border border-dashed border-[#C8D9A5] hover:border-[#C8D9A5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      {bottoms.length > 0 ? 'Tambah Bawahan' : 'Belum ada bawahan'}
                    </button>
                  )}
                </div>

                {/* SEPATU — uniform h-[80px] container */}
                <div
                  {...shoesSwipe}
                  className="relative w-full h-[140px] flex items-center justify-center group cursor-grab active:cursor-grabbing"
                >
                  {selectedShoes ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img src={selectedShoes.imageUrl} alt={selectedShoes.name} referrerPolicy="no-referrer"
                        className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(26,26,26,0.14)] transition-transform duration-200 group-hover:scale-105 select-none pointer-events-none" />
                      <button onClick={(e) => { e.stopPropagation(); prevShoes(); }} className="absolute -left-5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#191919]/80 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer shadow-sm"><ChevronLeft className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); nextShoes(); }} className="absolute -right-5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#191919]/80 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer shadow-sm"><ChevronRight className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setShoesIndex(-1); }} className="absolute -top-2 -right-3 w-4 h-4 rounded-full bg-[#191919]/70 hover:bg-[#7A2117] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"><X className="w-2.5 h-2.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => { if (shoes.length > 0) setShoesIndex(0); }} className="square-control flex items-center gap-1 label text-[#96948B] hover:text-[#191919] border border-dashed border-[#C8D9A5] hover:border-[#AFC58C] px-3 py-1.5 bg-[#F9F8F5] hover:bg-[#F2F7E8] transition-all cursor-pointer">
                      <Plus className="w-3 h-3" /> Sepatu
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* Direct Try-On Transit Action Button */}
            <div className="w-full pt-4 mt-2 border-t border-[#C8D9A5] z-20 space-y-2">
              <button
                onClick={handleTransitToVton}
                disabled={!selectedTop && !selectedBottom}
                className="w-full rounded-full py-3 px-4 bg-[#7A2117] hover:bg-[#64190F] disabled:opacity-40 text-white text-xs font-editorial-mono uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>TES OUTFIT MANEKIN DI VIRTUAL TRY-ON</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Minimalist Summary Index */}
              <div className="flex items-center justify-between text-[11px] font-editorial-mono text-[#96948B] px-1 truncate">
                  <span className="truncate">
                    {selectedTop?.name || 'Top'} / {selectedBottom?.name || 'Bottom'}
                  </span>
                <span className="text-[#7A2117] shrink-0 font-medium">
                  {colorAnalysis.score}% HARMONY
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Harmoni Warna, Detail Outfit & Saved Collection (6 cols) */}
        <div className="lg:col-span-6 space-y-5">
          {/* Color Harmony Card - Editorial */}
          <div className="bg-white p-6 border border-black/[0.04] shadow-[0_2px_20px_rgba(60,40,30,0.06)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#C8D9A5]">
              <div>
                <h3 className="font-editorial text-2xl font-normal text-[#191919]">
                  Harmoni Warna Busana
                </h3>
              </div>
              <div className="text-right">
                <span className="font-editorial text-3xl text-[#191919] leading-none">{colorAnalysis.score}%</span>
                <span className="block text-[10px] font-editorial-mono text-[#7A2117] uppercase">Match Score</span>
              </div>
            </div>

            {/* Score progress bar */}
            <div className="w-full bg-[#191919]/10 h-1.5 overflow-hidden">
              <div
                className="h-full bg-[#7A2117] transition-all duration-500"
                style={{ width: `${colorAnalysis.score}%` }}
              />
            </div>

            <div className="bg-[#F9F8F5] p-4 border border-[#E8E6DD] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="bg-[#F2F7E8] px-3 py-1 text-xs font-semibold text-[#41483A]">
                  {colorAnalysis.harmonyType}
                </span>
                <div className="flex items-center gap-1.5" aria-label="Warna outfit terpilih">
                  {colorAnalysis.palette.map((color) => (
                    <span
                      key={color.itemId}
                      className="h-5 w-5 border border-black/10"
                      style={{ backgroundColor: color.hexColor }}
                      title={`${color.name}: ${color.hexColor}`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs font-bold text-[#191919] font-editorial-mono">{colorAnalysis.verdict}</p>
              <p className="text-xs text-[#96948B] leading-relaxed font-light">{colorAnalysis.tips}</p>
            </div>

            {/* Outfit Name & Occasion */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-editorial-mono text-[#96948B] mb-1 uppercase">
                  Nama Konsep Outfit
                </label>
                <input
                  type="text"
                  value={outfitName}
                  onChange={(e) => setOutfitName(e.target.value)}
                  placeholder="Contoh: Monokromatik Santai"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-[#F9F8F5] border border-[#E8E6DD] focus:outline-none focus:border-[#AFC58C] focus:ring-2 focus:ring-[#AFC58C]/30"
                />
              </div>

              <div>
                <label className="block text-[11px] font-editorial-mono text-[#96948B] mb-1 uppercase">
                  Acara / Occasion
                </label>
                <input
                  type="text"
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  placeholder="Casual, Formal, Gallery"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-[#F9F8F5] border border-[#E8E6DD] focus:outline-none focus:border-[#AFC58C] focus:ring-2 focus:ring-[#AFC58C]/30"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={handleSaveCurrentOutfit}
                disabled={!selectedTop && !selectedBottom}
                className="flex-1 rounded-full py-3 px-4 bg-[#7A2117] hover:bg-[#64190F] disabled:opacity-40 text-white text-xs font-medium uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {justSaved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Tersimpan di Koleksi!</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan Outfit Manekin</span>
                  </>
                )}
              </button>

              <button
                onClick={handleLogOutfitWearClick}
                disabled={!selectedTop && !selectedBottom}
                className="rounded-full py-3 px-4 bg-white hover:bg-[#F2F7E8] disabled:opacity-40 text-[#191919] border border-[#DADFD0] text-xs font-medium uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {justLogged ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Tercatat!</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Catat Dipakai</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Saved Outfits Shelf - Editorial */}
          <div className="bg-white p-6 border border-black/[0.04] shadow-[0_2px_20px_rgba(60,40,30,0.06)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#C8D9A5]">
              <div>
                <h3 className="font-editorial text-2xl font-normal text-[#191919]">
                  Koleksi Outfit Tersimpan ({savedOutfits.length})
                </h3>
              </div>
              <span className="text-[11px] font-editorial-mono text-[#96948B]">Siap Pakai</span>
            </div>

            {savedOutfits.length === 0 ? (
              <div className="bg-[#F9F8F5] py-8 text-center text-[#96948B] text-sm border border-dashed border-[#DADFD0] p-4">
                Belum ada outfit tersimpan. Geser pakaian di manekin lalu klik "Simpan Outfit Manekin".
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {savedOutfits.map((outfit) => {
                  const top = items.find((i) => i.id === outfit.topId);
                  const bottom = items.find((i) => i.id === outfit.bottomId);
                  const outer = items.find((i) => i.id === outfit.outerwearId);
                  const shoe = items.find((i) => i.id === outfit.shoesId);
                  const accessoryIds = outfit.accessoryIds?.length
                    ? outfit.accessoryIds
                    : outfit.accessoryId ? [outfit.accessoryId] : [];
                  const savedAccessories = accessoryIds
                    .map((id) => items.find((item) => item.id === id))
                    .filter((item): item is ClothingItem => Boolean(item));

                  return (
                    <div
                      key={outfit.id}
                      className="p-4 bg-[#F9F8F5] border border-[#E8E6DD] hover:border-[#AFC58C] transition-all flex flex-col justify-between space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium text-xs text-[#191919] group-hover:text-[#7A2117] transition-colors truncate max-w-[150px]">
                            {outfit.name}
                          </h4>
                          <p className="text-[10px] font-editorial-mono text-[#96948B] uppercase">{outfit.occasion}</p>
                        </div>
                        <button
                          onClick={() => onDeleteOutfit(outfit.id)}
                          className="text-[#96948B] hover:text-[#191919] p-1 cursor-pointer"
                          title="Hapus outfit"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Item miniatures */}
                      <div className="flex items-center gap-1.5 py-1">
                        {top && (
                          <img
                            src={top.imageUrl}
                            alt={top.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 object-contain border border-[#C8D9A5] bg-white/60 p-0.5"
                            title={top.name}
                          />
                        )}
                        {bottom && (
                          <img
                            src={bottom.imageUrl}
                            alt={bottom.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 object-contain border border-[#C8D9A5] bg-white/60 p-0.5"
                            title={bottom.name}
                          />
                        )}
                        {outer && (
                          <img
                            src={outer.imageUrl}
                            alt={outer.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 object-contain border border-[#C8D9A5] bg-white/60 p-0.5"
                            title={outer.name}
                          />
                        )}
                        {shoe && (
                          <img src={shoe.imageUrl} alt={shoe.name} referrerPolicy="no-referrer"
                            className="w-10 h-10 object-contain border border-[#C8D9A5] bg-white/60 p-0.5" title={shoe.name} />
                        )}
                        {savedAccessories.map((accessory) => (
                          <img key={accessory.id} src={accessory.imageUrl} alt={accessory.name} referrerPolicy="no-referrer"
                            className="w-10 h-10 object-contain border border-[#C8D9A5] bg-white/60 p-0.5" title={accessory.name} />
                        ))}
                      </div>
                      {outfit.colorHarmony && (
                        <p className="text-[10px] text-[#96948B]">
                          {typeof outfit.colorHarmony === 'string'
                            ? outfit.colorHarmony
                            : `${outfit.colorHarmony.harmonyType} · ${outfit.colorHarmony.score}%`}
                        </p>
                      )}

                      <div className="pt-2 border-t border-[#C8D9A5] flex items-center justify-between text-[11px] font-editorial-mono">
                        <button
                          onClick={() => {
                            if (top) {
                              const tIdx = tops.findIndex((i) => i.id === top.id);
                              if (tIdx >= 0) setTopIndex(tIdx);
                            }
                            if (bottom) {
                              const bIdx = bottoms.findIndex((i) => i.id === bottom.id);
                              if (bIdx >= 0) setBottomIndex(bIdx);
                            }
                            if (outer) {
                              const oIdx = outerwears.findIndex((i) => i.id === outer.id);
                              if (oIdx >= 0) setOuterwearIndex(oIdx);
                            } else {
                              setOuterwearIndex(-1);
                            }
                            const sIdx = shoe ? shoes.findIndex((i) => i.id === shoe.id) : -1;
                            setShoesIndex(sIdx);
                            setAccessorySlots(accessoryIds
                              .map((id) => accessories.findIndex((item) => item.id === id))
                              .filter((idx) => idx >= 0)
                              .slice(0, MAX_ACC));
                          }}
                          className="text-[#191919] hover:underline cursor-pointer"
                        >
                          Pasang
                        </button>
                        <button
                          onClick={() => onSendToTryOn(top, bottom)}
                          className="text-[#7A2117] hover:underline flex items-center gap-0.5 cursor-pointer font-bold"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>TRY-ON</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
