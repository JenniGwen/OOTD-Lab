import React from 'react';

interface NavbarProps {
  activeTab: 'closet' | 'mixmatch' | 'tryon' | 'analytics';
  onSelectTab: (tab: 'closet' | 'mixmatch' | 'tryon' | 'analytics') => void;
  onOpenUpload: () => void;
  totalItems: number;
  underutilizedCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  onOpenUpload,
  totalItems,
  underutilizedCount,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[rgba(249,248,245,0.88)] backdrop-blur-md border-b border-[#C8D9A5] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo - Cormorant Garamond Editorial Italic */}
          <div
            id="brand-logo"
            className="flex items-center cursor-pointer group"
            onClick={() => onSelectTab('closet')}
          >
            <span className="font-brand text-3xl sm:text-4xl font-semibold italic text-[#191919] tracking-tight group-hover:text-[#7A2117] transition-colors">
              OOTD Lab.
            </span>
          </div>

          {/* Navigation Links - Editorial Spaced Uppercase */}
          <nav className="hidden md:flex items-center gap-8 lg:gap-10">
            <button
              id="nav-tab-closet"
              onClick={() => onSelectTab('closet')}
              className={`text-xs uppercase tracking-[0.14em] font-medium transition-colors ${
                activeTab === 'closet'
                  ? 'text-[#AFC58C] font-semibold'
                  : 'text-[#96948B] hover:text-[#191919]'
              }`}
            >
              Lemari
            </button>

            <button
              id="nav-tab-mixmatch"
              onClick={() => onSelectTab('mixmatch')}
              className={`text-xs uppercase tracking-[0.14em] font-medium transition-colors ${
                activeTab === 'mixmatch'
                  ? 'text-[#AFC58C] font-semibold'
                  : 'text-[#96948B] hover:text-[#191919]'
              }`}
            >
              Mix-Match
            </button>

            <button
              id="nav-tab-tryon"
              onClick={() => onSelectTab('tryon')}
              className={`text-xs uppercase tracking-[0.14em] font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'tryon'
                  ? 'text-[#AFC58C] font-semibold'
                  : 'text-[#96948B] hover:text-[#191919]'
              }`}
            >
              <span>Try-On</span>
              <span className="font-editorial-mono text-[9px] px-1.5 py-0.2 bg-[#D8B96A] text-[#191919] rounded-full">
                AI
              </span>
            </button>

            <button
              id="nav-tab-analytics"
              onClick={() => onSelectTab('analytics')}
              className={`text-xs uppercase tracking-[0.14em] font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'analytics'
                  ? 'text-[#AFC58C] font-semibold'
                  : 'text-[#96948B] hover:text-[#191919]'
              }`}
            >
              <span>Analytics</span>
            </button>
          </nav>

          {/* Action Button - Space Mono Editorial Upload Button */}
          <div className="flex items-center gap-3">
            <button
              id="btn-open-upload"
              onClick={onOpenUpload}
              className="btn-upload"
            >
              UPLOAD ITEM
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex items-center justify-around py-3 border-t border-[#C8D9A5] text-[11px] font-editorial-mono uppercase tracking-wider">
          <button
            onClick={() => onSelectTab('closet')}
            className={`transition-colors ${
              activeTab === 'closet' ? 'text-[#AFC58C] font-bold' : 'text-[#96948B]'
            }`}
          >
            Lemari
          </button>
          <button
            onClick={() => onSelectTab('mixmatch')}
            className={`transition-colors ${
              activeTab === 'mixmatch' ? 'text-[#AFC58C] font-bold' : 'text-[#96948B]'
            }`}
          >
            Mix-Match
          </button>
          <button
            onClick={() => onSelectTab('tryon')}
            className={`transition-colors ${
              activeTab === 'tryon' ? 'text-[#AFC58C] font-bold' : 'text-[#96948B]'
            }`}
          >
            Try-On
          </button>
          <button
            onClick={() => onSelectTab('analytics')}
            className={`transition-colors ${
              activeTab === 'analytics' ? 'text-[#AFC58C] font-bold' : 'text-[#96948B]'
            }`}
          >
            Analytics
          </button>
        </div>
      </div>
    </header>
  );
};
