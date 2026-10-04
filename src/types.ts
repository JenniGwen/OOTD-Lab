export type ClothingCategory = 'Atasan' | 'Bawahan' | 'Terusan' | 'Luaran' | 'Sepatu' | 'Aksesoris';

export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
  subCategory: string;
  color: string;
  hexColor: string;
  imageUrl: string;
  material: string;
  style: string;
  purchasePrice: number; // in IDR
  wearCount: number;
  lastWornDate: string; // ISO date string
  createdAt: string;
  isFavorite?: boolean;
  brand?: string;
  size?: string;
}

export interface Outfit {
  id: string;
  name: string;
  topId?: string;
  bottomId?: string;
  outerwearId?: string;
  shoesId?: string;
  accessoryId?: string;
  accessoryIds?: string[];
  occasion: string;
  wearCount: number;
  lastWornDate?: string;
  createdAt: string;
  score?: number;
  colorHarmony?: ColorHarmony | string;
  reasoning?: string;
  stylingTips?: string[];
}

export interface ColorHarmony {
  score: number | null;
  harmonyType: string;
  verdict: string;
  tips: string;
  breakdown?: {
    completeness: number;
    color: number;
    style: number;
    context: number;
  };
  applied_caps?: string[];
  missing_fields?: string[];
  confidence?: 'high' | 'medium' | 'low';
  reasons?: string[];
  suggestion?: string;
  palette: {
    itemId: string;
    name: string;
    category: ClothingCategory;
    hexColor: string;
  }[];
}

export interface BodyModel {
  id: string;
  name: string;
  gender: string;
  bodyType: string;
  imageUrl: string;
  description: string;
  torsoBounds: {
    top: number; // percentage (0 - 100)
    left: number;
    width: number;
    height: number;
  };
  bottomBounds: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

export interface Keypoint {
  x: number;
  y: number;
  confidence?: number;
}

export interface TryOnFeedback {
  overallFitScore: number;
  fitVerdict: string;
  drapeAnalysis: string;
  proportionAnalysis: string;
  styleNotes: string[];
  recommendations: string;
}

export interface VTONResult {
  id: string;
  userPhoto: string;
  garment: ClothingItem;
  secondaryGarment?: ClothingItem;
  renderedTryOnUrl: string;
  feedback: TryOnFeedback;
  timestamp: string;
  fittingMetrics: {
    shoulderSpanRatio: number;
    torsoProportion: number;
    fitClassification: string;
    drapeRealisticTension: string;
  };
}
