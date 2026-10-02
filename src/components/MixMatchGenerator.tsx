import React, { useState, useMemo, useRef } from 'react';
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
  const selectedAccessories = accessorySlots.map(idx => accessories[idx]).filter(Boolean);

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
    const palette = [selectedTop, selectedBottom, selectedOuterwear, selectedShoes, ...selectedAccessories]
      .filter((item): item is ClothingItem => Boolean(item))
      .map((item) => ({
        itemId: item.id,
        name: item.name,
        category: item.category,
        hexColor: item.hexColor || '#808080',
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

    const hues = palette.map(({ hexColor }) => {
      const hex = hexColor.replace('#', '');
      const value = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
      const red = parseInt(value.slice(0, 2), 16) / 255;
      const green = parseInt(value.slice(2, 4), 16) / 255;
      const blue = parseInt(value.slice(4, 6), 16) / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const delta = max - min;
      if (delta === 0) return null;
      let hue = 0;
      if (max === red) hue = ((green - blue) / delta) % 6;
      else if (max === green) hue = (blue - red) / delta + 2;
      else hue = (red - green) / delta + 4;
      return (hue * 60 + 360) % 360;
    }).filter((hue): hue is number => hue !== null);

    let harmonyType = 'neutral';
    let score = 94;
    let verdict = 'Palet netral yang mudah dipadukan';
    let tips = 'Gunakan perbedaan tekstur atau satu aksen warna untuk menambah dimensi.';
    if (hues.length === 1) {
      harmonyType = 'neutral-accent';
      score = 93;
      verdict = 'Warna netral dengan satu aksen utama';
      tips = 'Pertahankan aksen ini sebagai fokus dan biarkan warna netral menyeimbangkan outfit.';
    } else if (hues.length > 1) {
      const distances = hues.slice(1).map((hue) => {
        const distance = Math.abs(hues[0] - hue);
        return Math.min(distance, 360 - distance);
      });
      const maxDistance = Math.max(...distances);
      if (maxDistance <= 30) {
        harmonyType = 'analogous';
        score = 96;
        verdict = 'Warna berdekatan membentuk palet harmonis';
        tips = 'Variasikan tingkat terang dan gelap agar kombinasi warna serupa tetap berdimensi.';
      } else if (distances.some((distance) => distance >= 150)) {
        harmonyType = 'complementary';
        score = 92;
        verdict = 'Kontras warna komplementer yang seimbang';
        tips = 'Biarkan satu warna dominan dan gunakan warna kontras sebagai aksen.';
      } else {
        harmonyType = 'mixed';
        score = 82;
        verdict = 'Palet warna eklektik';
        tips = 'Pilih satu item sebagai fokus dan ulangi salah satu warnanya pada aksesori.';
      }
    }

    return { score, harmonyType, verdict, tips, palette };
  }, [selectedTop, selectedBottom, selectedOuterwear, selectedShoes, selectedAccessories]);

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

      {aiError && <p role="alert" className="text-sm text-[#7A2117]">Gemini AI: {aiError}</p>}

      {/* AI Recommendations List if generated - Refined Atelier Dark */}
      {aiRecommendations.length > 0 && (
        <div className="bg-[#7A2117] text-[#F8F6EC] p-6 sm:p-7 border border-[#C8D9A5] shadow-lg space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-3.5 h-3.5 text-[#F8F6EC]/80" />
              <h3 className="font-editorial text-xl font-normal tracking-wide text-white">Kurasi Padu-Padan AI Stylist</h3>
            </div>
            <span className="label text-white/50 border border-white/20 px-2.5 py-0.5">
              Curated Selection
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {aiRecommendations.map((rec, idx) => (
              <div
                key={idx}
                className="bg-white/[0.04] border border-white/10 p-5 flex flex-col justify-between space-y-4 hover:border-white/30 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-editorial-mono text-[10px] text-white/90 border border-white/20 px-2 py-0.5 uppercase tracking-wider">
                      Match {rec.score}%
                    </span>
                    <span className="text-[11px] text-white/50 truncate font-light">{rec.occasion}</span>
                  </div>

                  <h4 className="font-editorial text-lg font-normal text-white mt-3 leading-snug">{rec.title}</h4>
                  <p className="text-xs text-white/70 mt-1 line-clamp-2 font-light leading-relaxed">{rec.reasoning}</p>
                  <div className="mt-2 text-[11px] text-white/70">
                    <span className="text-white">{rec.colorHarmony.harmonyType}</span>
                    {' · '}{rec.colorHarmony.score}% · {rec.colorHarmony.verdict}
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/10">
                    {rec.itemIds?.map((itemId: string) => {
                      const it = items.find((x) => x.id === itemId);
                      if (!it) return null;
                      return (
                        <div key={itemId} className="w-10 h-10 bg-white/10 border border-white/15 p-1 flex items-center justify-center">
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
                  className="w-full py-2.5 bg-white text-[#191919] hover:bg-[#F8F6EC]/90 text-xs font-editorial-mono tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Terapkan ke Manekin</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Workspace: Interactive Mannequin Canvas (Left) & Controls/Saved (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Mannequin Canvas (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-[#F8F6EC] border border-[#C8D9A5] p-5 sm:p-6 shadow-sm relative overflow-hidden flex flex-col items-center">
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
                    className="w-full h-[200px] border-2 border-dashed border-[#C8D9A5] hover:border-[#C8D9A5] flex flex-col items-center justify-center gap-1 text-[#96948B] hover:text-[#191919] transition-all cursor-pointer bg-white/30 hover:bg-white/60"
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
                          className="aspect-square border-2 border-dashed border-[#C8D9A5] hover:border-[#C8D9A5] flex flex-col items-center justify-center gap-1 text-[#96948B] hover:text-[#191919] transition-all cursor-pointer bg-white/30 hover:bg-white/60"
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
                      className="w-full h-full flex flex-col items-center justify-center gap-1 label text-[#96948B] hover:text-[#191919] border border-dashed border-[#C8D9A5] hover:border-[#C8D9A5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
                      className="w-full h-full flex flex-col items-center justify-center gap-1 label text-[#96948B] hover:text-[#191919] border border-dashed border-[#C8D9A5] hover:border-[#C8D9A5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
                    <button onClick={() => { if (shoes.length > 0) setShoesIndex(0); }} className="flex items-center gap-1 label text-[#96948B] hover:text-[#191919] border border-dashed border-[#C8D9A5] hover:border-[#C8D9A5] px-3 py-1 bg-white/40 transition-all cursor-pointer">
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
                className="w-full py-3 px-4 bg-[#7A2117] hover:bg-[#7A2117] disabled:opacity-40 text-[#F8F6EC] text-xs font-editorial-mono uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2 cursor-pointer"
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
          <div className="bg-[#F8F6EC] p-6 border border-[#C8D9A5] shadow-sm space-y-4">
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

            <div className="bg-[#F4F1E5] p-4 border border-[#C8D9A5] space-y-1">
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
                  className="w-full px-3.5 py-2 text-xs bg-[#F8F6EC] border border-[#C8D9A5] focus:outline-none focus:border-[#C8D9A5]"
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
                  className="w-full px-3.5 py-2 text-xs bg-[#F8F6EC] border border-[#C8D9A5] focus:outline-none focus:border-[#C8D9A5]"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={handleSaveCurrentOutfit}
                disabled={!selectedTop && !selectedBottom}
                className="flex-1 py-2.5 px-4 bg-[#7A2117] hover:bg-[#191919] disabled:opacity-40 text-[#F8F6EC] text-xs font-editorial-mono uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
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
                className="py-2.5 px-4 bg-transparent hover:bg-[#7A2117] hover:text-[#F8F6EC] disabled:opacity-40 text-[#191919] border border-[#C8D9A5] text-xs font-editorial-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
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
          <div className="bg-[#F8F6EC] p-6 border border-[#C8D9A5] shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#C8D9A5]">
              <div>
                <h3 className="font-editorial text-2xl font-normal text-[#191919]">
                  Koleksi Outfit Tersimpan ({savedOutfits.length})
                </h3>
              </div>
              <span className="text-[11px] font-editorial-mono text-[#96948B]">Siap Pakai</span>
            </div>

            {savedOutfits.length === 0 ? (
              <div className="py-8 text-center text-[#96948B] text-xs font-editorial-mono border border-dashed border-[#C8D9A5] p-4">
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
                      className="p-3.5 bg-[#F2F7E8] border border-[#C8D9A5] hover:border-[#C8D9A5] transition-all flex flex-col justify-between space-y-2 group"
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
