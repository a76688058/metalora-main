import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'ko' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  ko: {
    nav_collection: '컬렉션',
    nav_about: '브랜드',
    nav_cart: '내 컬렉션',
    hero_title: '빛과 금속으로\n재정의되는 당신의 공간.',
    hero_subtitle: '1.15mm 알루미늄 마그네틱 포스터. 하나의 예술 오브제.',
    discover: '둘러보기',
    section_material_title: '1.15mm의 미학',
    section_material_desc: '너무 얇지도, 너무 두껍지도 않은 완벽한 두께. 1.15mm는 알루미늄이 가질 수 있는 가장 우아한 강성을 상징합니다.',
    section_precision_title: '제로-톨러런스 가공',
    section_precision_desc: '항공우주 등급의 알루미늄을 정밀 밀링하여 오차 없는 직선과 곡선을 구현했습니다.',
    section_magnet_title: '보이지 않는 결속',
    section_magnet_desc: '벽을 뚫지 마세요. 네오디뮴 자석 시스템으로 단 1초 만에 설치하고 교체할 수 있습니다.',
    section_light_title: '빛의 연금술',
    section_light_desc: '특수 코팅된 표면은 주변의 빛을 흡수하고 반사하며 시간에 따라 다른 표정을 보여줍니다.',
    the_object: '오브제',
    object_desc: '정밀 가공된 1.15mm 알루미늄. 승화 전사 광택 마감. 단순한 프린트가 아닌, 벽을 위한 구조적 요소입니다.',
    feat_8k_title: '8K 해상도 증명',
    feat_8k_desc: '금속 코팅에 직접 주입된 매크로 수준의 디테일. 종이 질감 없이 순수한 색상만을 담았습니다.',
    feat_mag_title: '마그네틱 마운팅',
    feat_mag_desc: '네오디뮴 자석 키트가 뒷면에 스냅됩니다. 벽 손상 제로. 언제나 완벽한 수평.',
    logistic_adv: '글로벌 제조 파트너로부터 직접 소싱하여 합리적인 가격에 프리미엄 품질을 제공합니다.',
    buy_button: '에디션 01 구매하기',
    menu_home: '홈',
    menu_collection: '컬렉션',
    menu_technology: '기술력',
    menu_about: '브랜드 스토리',
    menu_support: '고객 지원',
    login: '로그인',
    logout: '로그아웃',
    signup: '회원가입',
    email: '이메일',
    password: '비밀번호',
    login_success: '로그인되었습니다.',
    logout_success: '로그아웃되었습니다.',
    auth_error: '인증 중 오류가 발생했습니다.',
    no_account: '계정이 없으신가요?',
    has_account: '이미 계정이 있으신가요?',
    checkout_title: '결제하기',
    checkout_subtitle: '안전하게 주문을 완료하세요.',
    shipping: '배송비',
    free: '무료',
    total: '총 결제 금액',
    payment_method: '결제 수단',
    pay_now: '결제하기',
    card: '카드 결제',
    transfer: '계좌 이체',
    mock_alert: '결제 연동 준비 중입니다. (데모)',
  },
  en: {
    nav_collection: 'Collection',
    nav_about: 'About',
    nav_cart: 'My Collection',
    hero_title: 'Your Space,\nRedefined by Light and Metal.',
    hero_subtitle: 'The 1.15mm aluminum magnetic poster. An object of art.',
    discover: 'Discover',
    section_material_title: 'The 1.15mm Aesthetic',
    section_material_desc: 'Neither too thin nor too thick. 1.15mm represents the most elegant rigidity aluminum can achieve.',
    section_precision_title: 'Zero-Tolerance Milling',
    section_precision_desc: 'Aerospace-grade aluminum precision-milled for flawless lines and curves.',
    section_magnet_title: 'The Invisible Bond',
    section_magnet_desc: 'Don\'t drill your walls. Install and swap in just one second with our Neodymium magnet system.',
    section_light_title: 'Alchemy of Light',
    section_light_desc: 'The specially coated surface absorbs and reflects ambient light, showing different expressions over time.',
    the_object: 'The Object',
    object_desc: 'Precision-milled 1.15mm aluminum. Sublimated gloss finish. It\'s not just a print; it\'s a structural element for your wall.',
    feat_8k_title: '8K Resolution Proof',
    feat_8k_desc: 'Macro-level detail infused directly into the metal coating. No paper grain, just pure color.',
    feat_mag_title: 'Magnetic Mounting',
    feat_mag_desc: 'Neodymium magnet kit snaps onto the back. Zero wall damage. Perfect alignment every time.',
    logistic_adv: 'Directly sourced from global manufacturing partners to provide premium quality at reasonable prices.',
    buy_button: 'Purchase Edition 01',
    menu_home: 'Home',
    menu_collection: 'Collection',
    menu_technology: 'Technology',
    menu_about: 'Brand Story',
    menu_support: 'Support',
    login: 'Log In',
    logout: 'Log Out',
    signup: 'Sign Up',
    email: 'Email',
    password: 'Password',
    login_success: 'Logged in successfully.',
    logout_success: 'Logged out successfully.',
    auth_error: 'Authentication error occurred.',
    no_account: "Don't have an account?",
    has_account: 'Already have an account?',
    checkout_title: 'Checkout',
    checkout_subtitle: 'Complete your purchase securely.',
    shipping: 'Shipping',
    free: 'Free',
    total: 'Total',
    payment_method: 'Payment Method',
    pay_now: 'Pay Now',
    card: 'Card',
    transfer: 'Transfer',
    mock_alert: 'Payment integration pending. (Demo)',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('ko');

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
