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
  description: string;
  limited: boolean;
  is_visible?: boolean; // DB 컬럼명 (상품 노출 여부)
  options?: ProductOption[];
  created_at?: string;
}
