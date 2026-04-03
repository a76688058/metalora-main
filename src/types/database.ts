export interface Product {
  id: string;
  title: string;
  front_image: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_title: string; // order_items 테이블의 실제 컬럼
  quantity: number;
  price: number;
  option: string;
  user_image_url?: string; // 공방 제품 이미지
  products?: Product; // 기성 제품 정보 (Join 결과)
}

export interface Order {
  id: string; // 기본키
  order_number: string; // 주문번호 (표시용)
  created_at: string;
  status: 'PAID' | 'PRODUCTION' | 'SHIPPING' | 'COMPLETED' | string;
  total_amount: number;
  shipping_name: string;
  shipping_phone: string;
  address: string;
  address_detail?: string;
  zip_code?: string;
  courier?: string;
  tracking_number?: string;
  order_items?: OrderItem[];
}
