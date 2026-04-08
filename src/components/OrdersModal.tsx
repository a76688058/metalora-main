import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Loader2, ChevronLeft, Package, Image
} from 'lucide-react';
import { OrderStepper } from './OrderStepper';
import { getFullImageUrl } from '../lib/utils';

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OrdersModal({ isOpen, onClose }: OrdersModalProps) {
  const { user, openProfile } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const handleBack = () => {
    onClose();
    setTimeout(() => {
      openProfile();
    }, 100);
  };

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflowY = 'scroll';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
    };
  }, [isOpen]);

  const fetchOrders = async () => {
    if (!user) return;
    try {
      setIsLoadingOrders(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (user && isOpen) {
      fetchOrders();

      // Real-time subscription for order status updates
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
            fetchOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[25000] flex justify-end pointer-events-auto"
        >
          {/* Backdrop */}
          <div 
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto touch-none"
          />

          {/* Modal Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full max-w-lg bg-[#0F0F11] h-full flex flex-col shadow-2xl overflow-hidden border-l border-white/5 pointer-events-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 sticky top-0 bg-[#0F0F11]/80 backdrop-blur-xl z-20">
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleBack}
                  className="p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 className="text-xl font-bold text-white tracking-tight">주문 내역</h2>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overscroll-contain touch-pan-y">
              <div className="space-y-5 pb-24">
                {isLoadingOrders && orders.length === 0 ? (
                  <div className="flex justify-center py-24">
                    <Loader2 className="animate-spin text-zinc-700" size={32} />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-32 bg-zinc-900/20 border border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center">
                    <Package size={48} strokeWidth={1} className="mx-auto text-zinc-800 mb-4" />
                    <p className="text-zinc-600 font-medium mb-6">주문 내역이 없습니다.</p>
                    <button 
                      onClick={() => {
                        onClose();
                        navigate('/collection');
                      }}
                      className="px-6 py-3 bg-zinc-800 text-white font-medium rounded-2xl hover:bg-zinc-700 transition-colors"
                    >
                      상품 둘러보기
                    </button>
                  </div>
                ) : (
                  orders.map((order, idx) => (
                    <motion.div 
                      key={order.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-zinc-900/40 border border-white/5 rounded-[2rem] p-7 space-y-5 hover:bg-zinc-900/60 transition-all group cursor-default"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">{order.order_number}</p>
                          <p className="text-white text-lg font-bold tracking-tight">{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest ${
                          order.status === '배송완료' 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : 'bg-white/5 text-zinc-400'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                      
                      <div className="pt-5 border-t border-white/5 space-y-6">
                        <div className="space-y-3">
                          {(order.ordered_items as any[])?.map((ji: any, index: number) => {
                            const isWorkshop = ji.product_id === 'workshop-single';
                            const displayImageUrl = getFullImageUrl(ji.user_image_url || ji.front_image, isWorkshop);

                            return (
                              <div key={index} className="flex items-center gap-4 bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/30 group/item">
                                <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border border-white/5 flex-shrink-0">
                                  {displayImageUrl ? (
                                    <img 
                                      src={displayImageUrl} 
                                      className="w-full h-full object-cover" 
                                      onError={(e) => (e.currentTarget.src = 'https://picsum.photos/seed/error/200/200')}
                                    />
                                  ) : <Image className="w-full h-full p-4 text-zinc-700" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-bold text-white text-sm truncate">{ji.title}</p>
                                    {isWorkshop && (
                                      <span className="bg-[#8B5CF6]/20 text-[#8B5CF6] text-[8px] font-black px-1.5 py-0.5 rounded">CUSTOM</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-zinc-500 font-medium">{ji.option} • {ji.quantity}개</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex justify-between items-center pt-5 border-t border-white/5">
                          <span className="text-zinc-500 font-medium">결제 금액</span>
                          <span className="text-white text-xl font-bold">₩{order.total_price?.toLocaleString()}</span>
                        </div>
                        
                        <div className="pt-2">
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-6 ml-1">주문 진행 상태</p>
                          <OrderStepper status={order.status} />
                        </div>

                        {order.courier && order.tracking_number && (
                          <div className="pt-5 border-t border-white/5">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-1 h-3 bg-zinc-700 rounded-full" />
                              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">배송 정보</p>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 rounded-xl px-4 py-3">
                              <span className="text-sm text-zinc-400 font-medium">{order.courier}</span>
                              <span className="text-sm text-white font-bold tracking-wider">{order.tracking_number}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
