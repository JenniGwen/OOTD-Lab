import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Shirt,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Wand2,
  Heart,
  Trash2,
  ArrowUpDown,
  X,
  Tag,
  Palette,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { ClothingItem } from '../types';
import { formatIDR, formatRelativeDate, getDaysAgo } from '../utils/storage';

interface VirtualClosetProps {
  items: ClothingItem[];
  onOpenUpload: () => void;
  onLogWear: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onSelectForTryOn: (item: ClothingItem) => void;
  onSelectForMixMatch: (item: ClothingItem) => void;
}

type SortCriteria = 'title_asc' | 'title_desc' | 'color' | 'material' | 'style' | 'newest';

export const VirtualCloset: React.FC<VirtualClosetProps> = ({
  items,
  onOpenUpload,
  onLogWear,
  onToggleFavorite,
  onDeleteItem,
  onSelectForTryOn,
  onSelectForMixMatch,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortCriteria>('title_asc');
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<ClothingItem | null>(null);
  const [recentlyLoggedId, setRecentlyLoggedId] = useState<string | null>(null);

  // Category list with counts
  const categories: { label: string; value: string; count: number }[] = [
    { label: 'Semua Koleksi', value: 'Semua', count: items.length },
    { label: 'Atasan', value: 'Atasan', count: items.filter((i) => i.category === 'Atasan').length },
    { label: 'Bawahan', value: 'Bawahan', count: items.filter((i) => i.category === 'Bawahan').length },
    { label: 'Luaran', value: 'Luaran', count: items.filter((i) => i.category === 'Luaran').length },
    { label: 'Sepatu', value: 'Sepatu', count: items.filter((i) => i.category === 'Sepatu').length },
    { label: 'Aksesoris', value: 'Aksesoris', count: items.filter((i) => i.category === 'Aksesoris').length },
  ];

  // Filtered & Sorted items (Sort by title, color, material, style, or newest/image)
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        // Category filter
        if (selectedCategory !== 'Semua' && item.category !== selectedCategory) return false;

        // Search filter (searches title, color, material, style)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesTitle = item.name.toLowerCase().includes(q);
          const matchesColor = item.color.toLowerCase().includes(q);
          const matchesMaterial = item.material.toLowerCase().includes(q);
          const matchesStyle = item.style.toLowerCase().includes(q);
          const matchesBrand = item.brand?.toLowerCase().includes(q) || false;
          if (!matchesTitle && !matchesColor && !matchesMaterial && !matchesStyle && !matchesBrand) return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'title_asc':
            return a.name.localeCompare(b.name, 'id');
          case 'title_desc':
            return b.name.localeCompare(a.name, 'id');
          case 'color':
            return a.color.localeCompare(b.color, 'id');
          case 'material':
            return a.material.localeCompare(b.material, 'id');
          case 'style':
            return a.style.localeCompare(b.style, 'id');
          case 'newest':
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
  }, [items, selectedCategory, searchQuery, sortBy]);

  const handleLogWearClick = (id: string) => {
    onLogWear(id);
    setRecentlyLoggedId(id);
    setTimeout(() => {
      setRecentlyLoggedId(null);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Hero Section - Variation 3 Editorial */}
      <div className="py-6 sm:py-10 flex flex-col items-center text-center gap-4 border-b border-[#C8D9A5] pb-8">
        <div>
          <h1 className="font-editorial text-5xl sm:text-6xl lg:text-7xl font-normal leading-[0.9] tracking-[-0.03em] text-[#191919] mt-3 text-center">
            The Closet<br />Collection
          </h1>
        </div>
        <div className="w-full flex flex-col items-center space-y-4">
          <div className="flex items-center justify-center gap-4 text-xs">
            <span className="label">Total Archive: {items.length} Items</span>
            <button
              onClick={onOpenUpload}
              className="label text-[#191919] font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>+ Add to Wardrobe</span>
            </button>
          </div>
        </div>
      </div>

      {/* Utility Bar - Categories & Sorting */}
      <div className="py-4 border-b border-[#C8D9A5] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Categories */}
        <div className="flex items-center gap-5 sm:gap-7 overflow-x-auto w-full md:w-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`text-xs uppercase tracking-[0.08em] whitespace-nowrap transition-opacity cursor-pointer ${
                selectedCategory === cat.value
                  ? 'text-[#191919] font-semibold underline underline-offset-4 opacity-100'
                  : 'text-[#191919] opacity-50 hover:opacity-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search & Sort */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#96948B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, color, style..."
              className="pl-8 pr-3 py-1.5 text-xs bg-transparent border-b border-[#C8D9A5] focus:border-[#C8D9A5] focus:outline-none placeholder:text-[#96948B] w-full sm:w-56 font-light"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="label">Sorting:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortCriteria)}
              className="label bg-transparent border-none text-[#191919] font-editorial-mono cursor-pointer focus:outline-none uppercase"
            >
              <option value="title_asc">A-Z</option>
              <option value="title_desc">Z-A</option>
              <option value="color">COLOR</option>
              <option value="material">MATERIAL</option>
              <option value="style">STYLE</option>
              <option value="newest">NEWEST</option>
            </select>
          </div>
        </div>
      </div>

      {/* Item Count */}
      <div className="flex items-baseline gap-2 pt-2">
        <span className="label">Count:</span>
        <span className="font-editorial-mono text-sm text-[#191919]">{filteredItems.length} Items</span>
      </div>

      {/* Content Grid - Variation 3 Editorial Cards */}
      {filteredItems.length === 0 ? (
        <div className="py-20 text-center space-y-4">
          <div className="label">Tidak ada pakaian yang cocok</div>
          <h3 className="font-editorial text-3xl font-normal text-[#191919]">Tidak ada pakaian yang cocok</h3>
          <p className="text-xs text-[#96948B] max-w-sm mx-auto font-light">
            Coba sesuaikan kata kunci pencarian atau ubah kriteria sortir.
          </p>
          <button
            onClick={onOpenUpload}
            className="btn-upload mt-2"
          >
            UPLOAD ITEM
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10 pt-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedItemForDetail(item)}
              className="group flex flex-col gap-4 cursor-pointer"
            >
              {/* Image Wrap (Aspect 4/5) */}
              <div className="relative aspect-[4/5] overflow-hidden bg-[#F2F7E8] border border-[#C8D9A5] flex items-center justify-center p-6">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain object-center transition-transform duration-700 ease-out group-hover:scale-105 filter drop-shadow-[0_6px_14px_rgba(26,26,26,0.10)]"
                  loading="lazy"
                />

                {/* Subtle Favorite Marker */}
                {item.isFavorite && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#F8F6EC]/90 backdrop-blur-sm flex items-center justify-center text-[#191919]">
                    <Heart className="w-3 h-3 fill-[#191919] text-[#191919]" />
                  </div>
                )}
              </div>

              {/* Item Info */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="label truncate">
                    {item.category} / {item.style}
                  </span>
                  <span className="label shrink-0 flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{ backgroundColor: item.hexColor }}
                    />
                    {item.material}
                  </span>
                </div>
                <div className="font-editorial text-xl sm:text-2xl font-normal leading-snug text-[#191919] group-hover:text-[#7A2117] transition-colors">
                  {item.name}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Item Detail Modal - Editorial Aesthetic */}
      {selectedItemForDetail && (
        <div
          className="fixed inset-0 z-50 bg-[#191919]/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedItemForDetail(null)}
        >
          <div
            className="bg-[#F8F6EC] max-w-xl w-full border border-[#C8D9A5] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#C8D9A5] flex items-center justify-between">
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="label text-[#191919]">
                  {selectedItemForDetail.category}
                </span>
                {selectedItemForDetail.brand && (
                  <span className="label text-[#7A2117] truncate text-right">
                    {selectedItemForDetail.brand}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedItemForDetail(null)}
                type="button"
                aria-label="Tutup detail pakaian"
                title="Tutup"
                className="ml-3 p-1 text-[#96948B] hover:text-[#191919] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Image & Main Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                <div className="aspect-[4/5] bg-[#F2F7E8] overflow-hidden border border-[#C8D9A5] flex items-center justify-center p-6">
                  <img
                    src={selectedItemForDetail.imageUrl}
                    alt={selectedItemForDetail.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain filter drop-shadow-[0_8px_16px_rgba(26,26,26,0.12)]"
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-editorial text-2xl sm:text-3xl font-normal text-[#191919] leading-tight">
                      {selectedItemForDetail.name}
                    </h3>
                    <p className="label mt-1 text-[#96948B]">
                      {selectedItemForDetail.subCategory || 'Garment'} {selectedItemForDetail.size ? `// Size ${selectedItemForDetail.size}` : ''}
                    </p>
                  </div>

                  {/* Core Attributes */}
                  <div className="space-y-2.5 text-xs border-t border-b border-[#C8D9A5] py-3">
                    <div className="flex items-center justify-between">
                      <span className="label">Color Palette:</span>
                      <div className="flex items-center gap-1.5 font-medium text-[#191919]">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-[#C8D9A5]"
                          style={{ backgroundColor: selectedItemForDetail.hexColor }}
                        />
                        <span>{selectedItemForDetail.color}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="label">Material Fabric:</span>
                      <span className="font-medium text-[#191919]">{selectedItemForDetail.material}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="label">Style Aesthetic:</span>
                      <span className="font-medium text-[#191919]">{selectedItemForDetail.style}</span>
                    </div>
                  </div>

                  {/* Economics & Usage Analytics */}
                  <div className="space-y-2 text-xs py-2">
                    <div className="flex items-center justify-between">
                      <span className="label">Acquisition Price:</span>
                      <span className="font-editorial-mono text-[#191919]">{formatIDR(selectedItemForDetail.purchasePrice)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="label">Wear Frequency:</span>
                      <span className="font-editorial-mono text-[#191919]">{selectedItemForDetail.wearCount} times</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="label">Cost-Per-Wear (CPW):</span>
                      <span className="font-editorial-mono font-bold text-[#7A2117]">
                        {formatIDR(
                          selectedItemForDetail.wearCount > 0
                            ? Math.round(selectedItemForDetail.purchasePrice / selectedItemForDetail.wearCount)
                            : selectedItemForDetail.purchasePrice
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="label">Last Logged:</span>
                      <span className="label text-[#191919]">{formatRelativeDate(selectedItemForDetail.lastWornDate)}</span>
                    </div>
                  </div>

                  {getDaysAgo(selectedItemForDetail.lastWornDate) >= 30 && (
                    <div className="p-2.5 bg-[#7A2117] text-[#F8F6EC] text-[10px] font-editorial-mono tracking-wide flex items-center gap-2">
                      <span>Tidak dipakai 30+ hari — perlu dirotasi</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-3 border-t border-[#C8D9A5]">
                {/* Log Wear */}
                <button
                  onClick={() => handleLogWearClick(selectedItemForDetail.id)}
                  className={`w-full py-3 px-4 text-xs font-editorial-mono uppercase tracking-[0.1em] transition-all cursor-pointer ${
                    recentlyLoggedId === selectedItemForDetail.id
                      ? 'bg-[#7A2117] text-white'
                      : 'bg-[#7A2117] hover:bg-[#7A2117] text-[#F8F6EC]'
                  }`}
                >
                  {recentlyLoggedId === selectedItemForDetail.id
                    ? '✓ Logged'
                    : '+ Log Wear Today'}
                </button>

                {/* Studio Transitions */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      onSelectForTryOn(selectedItemForDetail);
                      setSelectedItemForDetail(null);
                    }}
                    className="py-2.5 px-3 border border-[#C8D9A5] hover:bg-[#7A2117] hover:text-[#F8F6EC] text-[#191919] text-xs font-editorial-mono uppercase tracking-wider transition-colors"
                  >
                    AI Virtual Try-On →
                  </button>

                  <button
                    onClick={() => {
                      onSelectForMixMatch(selectedItemForDetail);
                      setSelectedItemForDetail(null);
                    }}
                    className="py-2.5 px-3 border border-[#C8D9A5] hover:bg-[#7A2117] hover:text-[#F8F6EC] text-[#191919] text-xs font-editorial-mono uppercase tracking-wider transition-colors"
                  >
                    Mix-Match Studio →
                  </button>
                </div>

                {/* Favorite & Delete Footer */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => {
                      onToggleFavorite(selectedItemForDetail.id);
                      setSelectedItemForDetail((prev) => prev ? { ...prev, isFavorite: !prev.isFavorite } : null);
                    }}
                    className="label text-[#191919] hover:opacity-100 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>{selectedItemForDetail.isFavorite ? '★ Favorited' : '☆ Add to Favorites'}</span>
                  </button>

                  <button
                    onClick={() => {
                      onDeleteItem(selectedItemForDetail.id);
                      setSelectedItemForDetail(null);
                    }}
                    className="label text-[#7A2117] hover:underline cursor-pointer"
                  >
                    Delete Item
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
