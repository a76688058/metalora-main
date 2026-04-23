export interface ProductOption {
  id: string;
  name: string;
  price: number;
  stock: number;
  isActive: boolean;
  dimension: string;
}

export interface Product {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  created_at: string;
  options: ProductOption[];
  front_image: string;
  back_image?: string;
  landscape_image?: string;
  landscape_back_image?: string;
  supported_orientations?: ('portrait' | 'landscape')[];
  is_new: boolean;
  is_limited: boolean;
  is_sale: boolean;
  is_visible: boolean;
  display_order: number;
  category?: string;
  viewers?: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_title: string; // order_items 테이블의 실제 컬럼
  quantity: number;
  price: number;
  option: string;
  orientation?: 'portrait' | 'landscape';
  user_image_url?: string; // 공방 제품 이미지
  products?: Product; // 기성 제품 정보 (Join 결과)
}

export interface Order {
  id: string; // 기본키
  order_number: string; // 주문번호 (표시용)
  created_at: string;
  status: 'PAID' | 'PRODUCTION' | 'SHIPPING' | 'COMPLETED' | string;
  total_price: number;
  shipping_name: string;
  shipping_phone: string;
  address: string;
  address_detail?: string;
  zip_code?: string;
  courier?: string;
  tracking_number?: string;
  ordered_items?: any[]; // JSONB 컬럼
  order_items?: OrderItem[];
}
