/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ClothingItem, Outfit, VTONResult } from './types';
import {
  getSavedClosetItems,
  saveClosetItems,
  getSavedOutfits,
  saveOutfits,
  getSavedVTONHistory,
  saveVTONHistory,
  getDaysAgo,
} from './utils/storage';
import { Navbar } from './components/Navbar';
import { VirtualCloset } from './components/VirtualCloset';
import { MixMatchGenerator } from './components/MixMatchGenerator';
import { VirtualTryOn } from './components/VirtualTryOn';
import { WearAnalytics } from './components/WearAnalytics';
import { UploadModal } from './components/UploadModal';

export default function App() {
  const [closetItems, setClosetItems] = useState<ClothingItem[]>(() => getSavedClosetItems());
  const [savedOutfits, setSavedOutfits] = useState<Outfit[]>(() => getSavedOutfits());
  const [vtonHistory, setVtonHistory] = useState<VTONResult[]>(() => getSavedVTONHistory());

  const [activeTab, setActiveTab] = useState<'closet' | 'mixmatch' | 'tryon' | 'analytics'>('closet');
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Transit items for cross-tab workflows (e.g. from Closet to Try-On or Mix-Match)
  const [tryOnTop, setTryOnTop] = useState<ClothingItem | null>(null);
  const [tryOnBottom, setTryOnBottom] = useState<ClothingItem | null>(null);
  const [mixMatchTop, setMixMatchTop] = useState<ClothingItem | null>(null);
  const [mixMatchBottom, setMixMatchBottom] = useState<ClothingItem | null>(null);

  // Synchronize with LocalStorage
  useEffect(() => {
    saveClosetItems(closetItems);
  }, [closetItems]);

  useEffect(() => {
    saveOutfits(savedOutfits);
  }, [savedOutfits]);

  useEffect(() => {
    saveVTONHistory(vtonHistory);
  }, [vtonHistory]);

  useEffect(() => {
    if (activeTab === 'mixmatch') {
      setMixMatchTop(null);
      setMixMatchBottom(null);
    }
  }, [activeTab]);

  // Wear tracking count for alert badge
  const underutilizedCount = closetItems.filter(
    (i) => getDaysAgo(i.lastWornDate) >= 30 || i.wearCount === 0
  ).length;

  // Add new item
  const handleSaveItem = (item: ClothingItem) => {
    setClosetItems((prev) => [item, ...prev]);
  };

  // Log Wear action (Increment wear count & update date)
  const handleLogWear = (id: string) => {
    setClosetItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            wearCount: item.wearCount + 1,
            lastWornDate: new Date().toISOString(),
          };
        }
        return item;
      })
    );
  };

  // Toggle favorite
  const handleToggleFavorite = (id: string) => {
    setClosetItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, isFavorite: !item.isFavorite };
        }
        return item;
      })
    );
  };

  // Delete item
  const handleDeleteItem = (id: string) => {
    if (confirm('Yakin ingin menghapus pakaian ini dari lemari?')) {
      setClosetItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // Save outfit
  const handleSaveOutfit = (outfit: Outfit) => {
    setSavedOutfits((prev) => [outfit, ...prev]);
  };

  // Delete outfit
  const handleDeleteOutfit = (id: string) => {
    setSavedOutfits((prev) => prev.filter((o) => o.id !== id));
  };

  // Log wear for all items in an outfit
  const handleLogOutfitWear = (outfit: Outfit) => {
    const itemIds = [
      outfit.topId,
      outfit.bottomId,
      outfit.outerwearId,
      outfit.shoesId,
      outfit.accessoryId,
      ...(outfit.accessoryIds || []),
    ].filter(Boolean);

    setClosetItems((prev) =>
      prev.map((item) => {
        if (itemIds.includes(item.id)) {
          return {
            ...item,
            wearCount: item.wearCount + 1,
            lastWornDate: new Date().toISOString(),
          };
        }
        return item;
      })
    );
  };

  // Transit to Try-On Studio from Closet
  const handleSelectForTryOn = (item: ClothingItem) => {
    if (item.category === 'Atasan' || item.category === 'Luaran') {
      setTryOnTop(item);
    } else if (item.category === 'Bawahan') {
      setTryOnBottom(item);
    }
    setActiveTab('tryon');
  };

  // Transit to Try-On Studio from Mix-Match
  const handleTransitFromMixMatchToTryOn = (topItem?: ClothingItem, bottomItem?: ClothingItem) => {
    if (topItem) setTryOnTop(topItem);
    if (bottomItem) setTryOnBottom(bottomItem);
    setActiveTab('tryon');
  };

  // Transit to Mix-Match from Closet
  const handleSelectForMixMatch = (item: ClothingItem) => {
    if (item.category === 'Atasan') {
      setMixMatchTop(item);
    } else if (item.category === 'Bawahan') {
      setMixMatchBottom(item);
    }
    setActiveTab('mixmatch');
  };

  // Save VTON session to history
  const handleSaveVtonResult = (result: VTONResult) => {
    setVtonHistory((prev) => [result, ...prev.slice(0, 19)]); // keep latest 20
  };
  // Sparse vermilion and sage polka dots keep the white canvas lively without crowding content.
  const dotSvg = `url("data:image/svg+xml,%3Csvg width='96' height='96' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='14' cy='20' r='7' fill='%23e34b3f' fill-opacity='0.14'/%3E%3Ccircle cx='58' cy='69' r='4' fill='%23e34b3f' fill-opacity='0.16'/%3E%3Ccircle cx='82' cy='28' r='1.5' fill='%23a8bf8f' fill-opacity='0.42'/%3E%3Ccircle cx='39' cy='49' r='1' fill='%23e34b3f' fill-opacity='0.28'/%3E%3Ccircle cx='74' cy='89' r='1.2' fill='%23a8bf8f' fill-opacity='0.35'/%3E%3C/svg%3E")`;

  return (
    <>
      {/* Polka-dot accents fade toward the center to keep the content area calm. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          backgroundImage: dotSvg,
          backgroundSize: '96px 96px',
          WebkitMaskImage: 'radial-gradient(72% 68% at 50% 50%, transparent 10%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,1) 88%)',
          maskImage: 'radial-gradient(72% 68% at 50% 50%, transparent 10%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,1) 88%)',
        }}
      />

      {/* ─── Main App Content ─── */}
      <div className="min-h-screen text-[#191919] flex flex-col antialiased selection:bg-[#7A2117] selection:text-white" style={{ position: 'relative', zIndex: 1 }}>
        {/* Top Navigation */}
        <Navbar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenUpload={() => setIsUploadOpen(true)}
          totalItems={closetItems.length}
          underutilizedCount={underutilizedCount}
        />

        {/* Main Viewport Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {activeTab === 'closet' && (
            <VirtualCloset
              items={closetItems}
              onOpenUpload={() => setIsUploadOpen(true)}
              onLogWear={handleLogWear}
              onToggleFavorite={handleToggleFavorite}
              onDeleteItem={handleDeleteItem}
              onSelectForTryOn={handleSelectForTryOn}
              onSelectForMixMatch={handleSelectForMixMatch}
            />
          )}

          {activeTab === 'mixmatch' && (
            <MixMatchGenerator
              items={closetItems}
              savedOutfits={savedOutfits}
              onSaveOutfit={handleSaveOutfit}
              onDeleteOutfit={handleDeleteOutfit}
              onLogOutfitWear={handleLogOutfitWear}
              onSendToTryOn={handleTransitFromMixMatchToTryOn}
              initialTop={mixMatchTop || undefined}
              initialBottom={mixMatchBottom || undefined}
            />
          )}

          {activeTab === 'tryon' && (
            <VirtualTryOn
              closetItems={closetItems}
              preSelectedTop={tryOnTop}
              preSelectedBottom={tryOnBottom}
              onSaveToHistory={handleSaveVtonResult}
              history={vtonHistory}
            />
          )}

          {activeTab === 'analytics' && (
            <WearAnalytics
              items={closetItems}
              onLogWear={handleLogWear}
              onSelectForMixMatch={handleSelectForMixMatch}
            />
          )}
        </main>

        {/* Upload Clothing Modal */}
        <UploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onSaveItem={handleSaveItem}
        />

        {/* Footer - Variation 3 Editorial */}
        <footer className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center gap-3 border-t border-[#C8D9A5] mt-12">
          <div className="label">© 2026 OOTD Lab</div>
        </footer>
      </div>
    </>
  );
}
