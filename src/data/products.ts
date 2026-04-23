export interface ProductOption {
  id: string;
  name: string;
  dimension: string;
  price: number;
  stock: number;
  isActive: boolean;
}

export interface Product {
  id: string;
  title: string;
  artist: string;
  subtitle?: string; // DB 컬럼명 (작가명)
  price?: number;
  image: string;
  front_image?: string; // DB 컬럼명 (앞면 이미지)
  backImage?: string; // 뒷면 이미지 (양면 인쇄)
  back_image?: string; // DB 컬럼명 (뒷면 이미지)
  landscape_image?: string; // 가로형 썸네일 (앞면)
  landscape_back_image?: string; // 가로형 뒷면 썸네일
  supported_orientations?: ('portrait' | 'landscape')[]; // 지원 방향
  description: string;
  limited: boolean;
  is_visible?: boolean; // DB 컬럼명 (상품 노출 여부)
  options?: ProductOption[];
  created_at?: string;
}
