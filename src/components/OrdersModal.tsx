import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import {
  Loader2, ChevronLeft, Package, Image
} from 'lucide-react';
import { OrderStepper } from './OrderStepper';
import { getFullImageUrl } from '../lib/utils';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';
import { useWorkshopMediaDisplay, workshopDisplayApi } from '../hooks/useWorkshopMediaDisplay';
import { workshopOrderItemThumbRef } from '../lib/workshopMediaDisplay';

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KNOWN_ORDER_STATUSES = new Set([
  'PAID', '결제확인', '결제완료',
  'PRODUCTION', '제작중', '제작/검수 중',
  'SHIPPING', '배송중', '배송 중',
  'COMPLETED', '배송완료', '구매확정',
]);

function orderStatusLabel(status: unknown): string {
  const value = typeof status === 'string' ? status.trim() : '';
  if (value === 'PAID') return '결제확인';
  if (value === 'PRODUCTION') return '제작/검수 중';
  if (value === 'SHIPPING') return '배송 중';
  if (value === 'COMPLETED') return '배송완료';
  return value;
}

function CatalogThumb({ src, theme }: { src: string; theme: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <Image className={`w-full h-full p-4 ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-300'}`} />;
  }
  return (
    <img
      src={src}
      alt=""
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export default function OrdersModal({ isOpen, onClose }: OrdersModalProps) {
  const { user, openProfile } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const fetchGen = useRef(0);
  const mounted = useRef(true);

  const returnToHub = useCallback(() => {
    onClose();
    setTimeout(() => {
      openProfile();
    }, 100);
  }, [onClose, openProfile]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      returnToHub();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, returnToHub]);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    const gen = ++fetchGen.current;
    try {
      setIsLoadingOrders(true);
      setLoadError(false);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!mounted.current || gen !== fetchGen.current) return;
      setOrders(data || []);
    } catch {
      if (!mounted.current || gen !== fetchGen.current) return;
      setLoadError(true);
    } finally {
      if (mounted.current && gen === fetchGen.current) setIsLoadingOrders(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && isOpen) {
      void fetchOrders();

      const channel = supabase
        .channel(`user-orders-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            void fetchOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, isOpen, fetchOrders]);

  const workshopMedia = useWorkshopMediaDisplay(
    isOpen
      ? orders
          .flatMap((order) => (Array.isArray(order.ordered_items) ? order.ordered_items : []))
          .filter((ji: any) => ji?.product_id === 'workshop-single')
          .map((ji: any) => workshopOrderItemThumbRef(ji, workshopDisplayApi))
      : [],
    'customer',
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="orders-title"
          className={cn('fixed inset-0 flex justify-end pointer-events-auto', zClass('sheet'))}
        >
          <button
            type="button"
            aria-label="내 정보로 돌아가기"
            onClick={returnToHub}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto touch-none"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`relative w-full max-w-lg h-full flex flex-col shadow-2xl overflow-hidden pointer-events-auto transition-colors duration-500 will-change-transform transform-gpu ${
              theme === 'dark' ? 'bg-[#101114] text-[#f3f1ec]' : 'bg-[#f6f4ef] text-[#16150f]'
            }`}
          >
            <div className={`flex items-center justify-between px-6 py-5 border-b ${
              theme === 'dark' ? 'border-white/5' : 'border-black/5'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={returnToHub}
                  aria-label="내 정보로 돌아가기"
                  className={`p-2 rounded-full transition-all focus-ring ${
                    theme === 'dark' ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-black'
                  }`}
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 id="orders-title" className="text-[1.75rem] font-medium tracking-[-0.02em]">주문 내역</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overscroll-contain touch-pan-y">
              <div className="space-y-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
                {isLoadingOrders && orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <Loader2 className={`animate-spin ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`} size={32} />
                    <p className={`text-sm font-medium ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>주문 내역을 불러오는 중</p>
                  </div>
                ) : loadError && orders.length === 0 ? (
                  <div className="py-24 text-center">
                    <p className={`font-medium mb-6 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>주문 내역을 불러오지 못했습니다.</p>
                    <button
                      type="button"
                      onClick={() => { void fetchOrders(); }}
                      className={`px-6 py-3 font-medium rounded-[2px] focus-ring bg-[#1a1914] text-[#f4f1eb] dark:bg-[#f2f0ea] dark:text-[#16150f]`}
                    >
                      다시 시도
                    </button>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="py-24 text-center">
                    <Package size={48} strokeWidth={1} className={`mx-auto mb-4 ${theme === 'dark' ? 'text-zinc-800' : 'text-zinc-200'}`} />
                    <p className={`font-medium mb-6 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>주문 내역이 없습니다.</p>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate('/');
                      }}
                      className="px-6 py-3 font-medium rounded-[2px] focus-ring bg-[#1a1914] text-[#f4f1eb] dark:bg-[#f2f0ea] dark:text-[#16150f]"
                    >
                      상품 둘러보기
                    </button>
                  </div>
                ) : (
                  orders.map((order) => {
                    const statusText = orderStatusLabel(order.status);
                    const knownStatus = KNOWN_ORDER_STATUSES.has(typeof order.status === 'string' ? order.status.trim() : '');
                    return (
                    <div
                      key={order.id}
                      className="border-b border-black/10 py-8 dark:border-white/10"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="space-y-1 min-w-0">
                          <p className={`text-sm tracking-tight ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>{order.order_number}</p>
                          <p className="text-lg font-medium tracking-[-0.02em]">{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                        {statusText ? (
                          <span className={`text-sm shrink-0 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
                            {statusText}
                          </span>
                        ) : null}
                      </div>

                      <div className={`pt-5 border-t space-y-6 ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                        <div className="space-y-3">
                          {(order.ordered_items as any[])?.map((ji: any, index: number) => {
                            const isWorkshop = ji.product_id === 'workshop-single';
                            const workshopRef = isWorkshop ? workshopOrderItemThumbRef(ji, workshopDisplayApi) : null;
                            const displayImageUrl = isWorkshop
                              ? workshopMedia.get(workshopRef).src
                              : getFullImageUrl(ji.user_image_url || ji.front_image, isWorkshop);

                            return (
                              <div key={index} className="flex items-center gap-4 py-3">
                                <div className="h-16 w-12 overflow-hidden shrink-0">
                                  {displayImageUrl && isWorkshop ? (
                                    <img
                                      src={displayImageUrl}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                      onError={() => void workshopMedia.onLoadError(workshopRef, displayImageUrl)}
                                    />
                                  ) : displayImageUrl ? (
                                    <CatalogThumb src={displayImageUrl} theme={theme} />
                                  ) : <Image className={`w-full h-full p-4 ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-300'}`} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-medium text-base truncate">{ji.title}</p>
                                  </div>
                                  <p className={`text-sm ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>{ji.option} · {ji.quantity}개</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className={`flex justify-between items-center pt-5 border-t ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                          <span className={`text-sm ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>결제 금액</span>
                          <span className="text-xl font-medium tracking-[-0.03em]">₩{order.total_price?.toLocaleString()}</span>
                        </div>

                        {knownStatus ? (
                          <div className="pt-2">
                            <p className={`text-sm font-medium mb-4 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>주문 진행 상태</p>
                            <OrderStepper status={order.status} />
                          </div>
                        ) : null}

                        {order.courier && order.tracking_number && (
                          <div className={`pt-5 border-t ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                            <p className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>배송 정보</p>
                            <div className="flex justify-between items-baseline gap-4 py-2">
                              <span className={`text-sm ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>{order.courier}</span>
                              <span className="text-base font-medium tracking-[0.04em]">{order.tracking_number}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
