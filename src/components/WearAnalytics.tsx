import React, { useMemo } from 'react';
import { Wallet, Receipt, Repeat, AlertTriangle, Trophy, PieChart, Wand2, Plus, CheckCircle2 } from 'lucide-react';
import { ClothingItem } from '../types';
import { formatIDR, formatRelativeDate, getDaysAgo } from '../utils/storage';

interface WearAnalyticsProps {
  items: ClothingItem[];
  onLogWear: (id: string) => void;
  onSelectForMixMatch: (item: ClothingItem) => void;
}

const WINE = '#7A2117';
const card = 'bg-white rounded-3xl shadow-[0_2px_20px_rgba(60,40,30,0.06)] border border-black/[0.04]';

// Circular progress for the utilization index
const Ring: React.FC<{ value: number }> = ({ value }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#F1E6E3" strokeWidth="9" />
      <circle
        cx="44" cy="44" r={r} fill="none" stroke={WINE} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 44 44)"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="44" y="49" textAnchor="middle" fontSize="18" fontWeight="600" fill="#1F1A17">{value}%</text>
    </svg>
  );
};

export const WearAnalytics: React.FC<WearAnalyticsProps> = ({ items, onLogWear, onSelectForMixMatch }) => {
  const totalValue = useMemo(() => items.reduce((s, i) => s + (i.purchasePrice || 0), 0), [items]);
  const totalWears = useMemo(() => items.reduce((s, i) => s + (i.wearCount || 0), 0), [items]);

  const underutilizedItems = useMemo(
    () =>
      items
        .filter((i) => getDaysAgo(i.lastWornDate) >= 30 || i.wearCount === 0)
        .sort((a, b) => getDaysAgo(b.lastWornDate) - getDaysAgo(a.lastWornDate)),
    [items]
  );
  const activeItems = useMemo(() => items.filter((i) => getDaysAgo(i.lastWornDate) < 30 && i.wearCount > 0), [items]);
  const utilizationRate = items.length > 0 ? Math.round((activeItems.length / items.length) * 100) : 0;
  const averageCostPerWear = totalWears === 0 ? totalValue : Math.round(totalValue / totalWears);

  const mostWornItems = useMemo(() => [...items].sort((a, b) => b.wearCount - a.wearCount).slice(0, 4), [items]);

  const categoryStats = useMemo(() => {
    const cats = ['Atasan', 'Bawahan', 'Terusan', 'Luaran', 'Sepatu', 'Aksesoris'] as const;
    return cats.map((cat) => {
      const list = items.filter((i) => i.category === cat);
      return {
        category: cat,
        count: list.length,
        wears: list.reduce((a, i) => a + i.wearCount, 0),
        totalValue: list.reduce((a, i) => a + (i.purchasePrice || 0), 0),
      };
    });
  }, [items]);

  return (
    <div className="space-y-6 text-[#1F1A17]" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Wardrobe Analytics</h1>
          <p className="text-sm text-[#8A8680] mt-1">Seberapa aktif koleksimu dipakai dalam 30 hari terakhir.</p>
        </div>
        <div className={`${card} flex items-center gap-4 pl-4 pr-6 py-3`}>
          <Ring value={utilizationRate} />
          <div>
            <p className="text-sm font-medium">Utilization index</p>
            <p className="text-xs text-[#8A8680]">{activeItems.length} dari {items.length} item aktif</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl p-6 text-white shadow-[0_8px_24px_rgba(122,33,23,0.25)]" style={{ background: `linear-gradient(135deg, ${WINE}, #9B3A2E)` }}>
          <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center"><Wallet className="w-5 h-5" /></div>
          <p className="text-2xl sm:text-[26px] font-semibold mt-5 tracking-tight">{formatIDR(totalValue)}</p>
          <p className="text-xs text-white/70 mt-1">Dari total {items.length} potong busana</p>
        </div>

        {[
          { Icon: Receipt, value: formatIDR(averageCostPerWear), unit: '', note: 'Rata-rata per siklus pemakaian' },
          { Icon: Repeat, value: String(totalWears), unit: 'kali', note: 'Frekuensi pemakaian tercatat' },
          { Icon: AlertTriangle, value: String(underutilizedItems.length), unit: 'item', note: 'Tidak dipakai lebih dari 30 hari' },
        ].map(({ Icon, value, unit, note }) => (
          <div key={note} className={`${card} p-6`}>
            <div className="w-10 h-10 rounded-2xl bg-[#F6ECE9] flex items-center justify-center" style={{ color: WINE }}><Icon className="w-5 h-5" /></div>
            <p className="text-2xl sm:text-[26px] font-semibold mt-5 tracking-tight">
              {value}
              {unit && <span className="text-sm font-medium text-[#8A8680] ml-1.5">{unit}</span>}
            </p>
            <p className="text-xs text-[#8A8680] mt-1">{note}</p>
          </div>
        ))}
      </div>

      {/* Dormant */}
      <div className={`${card} p-6 sm:p-8`}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tight">Pakaian yang jarang dipakai</h3>
          <span className="text-xs font-medium rounded-full px-3 py-1 bg-[#F6ECE9]" style={{ color: WINE }}>
            {underutilizedItems.length} dormant
          </span>
        </div>
        <p className="text-sm text-[#8A8680] mt-1.5 max-w-xl">
          Belum tersentuh selama 30 hari atau lebih. Coba styling baru, atau pertimbangkan untuk decluttering.
        </p>

        {underutilizedItems.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-[#FAF8F4] py-12 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto" style={{ color: WINE }} />
            <p className="text-lg font-semibold mt-3">Seluruh koleksi aktif berputar</p>
            <p className="text-sm text-[#8A8680] mt-1">Tidak ada pakaian yang mengendap lebih dari 30 hari.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {underutilizedItems.map((item) => {
              const daysAgo = getDaysAgo(item.lastWornDate);
              return (
                <div key={item.id} className="group flex gap-4 p-4 rounded-2xl bg-[#FAF8F4] hover:bg-[#F6F1EA] transition-colors">
                  <div className="w-24 h-28 rounded-xl bg-white flex items-center justify-center p-2 shrink-0 overflow-hidden">
                    <img src={item.imageUrl} alt={item.name} referrerPolicy="no-referrer"
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[#8A8680]">{item.category}</span>
                        <span className="text-[11px] font-medium rounded-full px-2.5 py-0.5 bg-[#F6ECE9] shrink-0" style={{ color: WINE }}>
                          {item.wearCount === 0 ? 'Belum pernah' : `${daysAgo} hari diam`}
                        </span>
                      </div>
                      <h4 className="text-[15px] font-medium truncate mt-1.5">{item.name}</h4>
                      <p className="text-xs text-[#8A8680]">{formatIDR(item.purchasePrice)}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => onLogWear(item.id)}
                        className="flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 bg-white border border-black/10 hover:border-black/30 cursor-pointer transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Log wear
                      </button>
                      <button onClick={() => onSelectForMixMatch(item)}
                        className="flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 text-white cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ background: WINE }}>
                        <Wand2 className="w-3.5 h-3.5" /> Style now
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Most worn + categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`${card} p-6 sm:p-8`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F6ECE9] flex items-center justify-center" style={{ color: WINE }}><Trophy className="w-4.5 h-4.5" /></div>
            <h3 className="text-lg font-semibold">Paling sering dipakai</h3>
          </div>
          <div className="mt-5 space-y-3">
            {mostWornItems.map((item, idx) => {
              const cpw = item.wearCount > 0 ? Math.round(item.purchasePrice / item.wearCount) : item.purchasePrice;
              return (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl bg-[#FAF8F4]">
                  <span className="w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center shrink-0"
                    style={idx === 0 ? { background: WINE, color: '#fff' } : { background: '#fff', color: '#8A8680' }}>
                    {idx + 1}
                  </span>
                  <div className="w-12 h-12 rounded-xl bg-white p-1.5 flex items-center justify-center shrink-0">
                    <img src={item.imageUrl} alt={item.name} referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-[#8A8680] truncate">{item.category} &middot; {formatRelativeDate(item.lastWornDate)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{item.wearCount}x</p>
                    <p className="text-[11px] text-[#8A8680]">{formatIDR(cpw)}/wear</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`${card} p-6 sm:p-8`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F6ECE9] flex items-center justify-center" style={{ color: WINE }}><PieChart className="w-4.5 h-4.5" /></div>
            <h3 className="text-lg font-semibold">Distribusi kategori</h3>
          </div>
          <div className="mt-6 space-y-5">
            {categoryStats.map((s) => {
              const pct = items.length > 0 ? Math.round((s.count / items.length) * 100) : 0;
              return (
                <div key={s.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{s.category}</span>
                    <span className="text-sm font-semibold" style={{ color: WINE }}>{pct}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-[#F3EEE9] overflow-hidden mt-2">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${WINE}, #B5594B)` }} />
                  </div>
                  <p className="text-xs text-[#8A8680] mt-1.5">
                    {s.count} item &middot; {s.wears}x rotasi &middot; {formatIDR(s.totalValue)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
