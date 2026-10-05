import type { LucideIcon } from 'lucide-react';
import { Flame, Globe, LayoutDashboard, MessageSquare, Package, ShoppingCart, Users } from 'lucide-react';

export const ADMIN_SIDEBAR_WIDTH_CLASS = 'w-72';

export type AdminNavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
};

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { label: '대시보드', path: '/admin', icon: LayoutDashboard },
  { label: '회원 관리', path: '/admin/users', icon: Users },
  { label: '상품 관리', path: '/admin/products', icon: Package },
  { label: '인기 판매 제품', path: '/admin/best-sellers', icon: Flame },
  { label: '배너 관리', path: '/admin/banners', icon: Globe },
  { label: '주문 관리', path: '/admin/orders', icon: ShoppingCart },
  { label: 'CS 관리', path: '/admin/cs', icon: MessageSquare },
];

export function isAdminNavActive(pathname: string, path: string): boolean {
  return pathname === path;
}

export function adminNavTitle(pathname: string): string {
  return ADMIN_NAV_ITEMS.find((item) => item.path === pathname)?.label ?? '관리자';
}
