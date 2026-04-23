import React, { useState, useEffect } from 'react';
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

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OrdersModal({ isOpen, onClose }: OrdersModalProps) {
  const { user, openProfile } = useAuth();
  const { theme } = useTheme();
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
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`relative w-full md:w-[50%] h-full flex flex-col shadow-2xl overflow-hidden border-l pointer-events-auto transition-colors duration-500 will-change-transform transform-gpu ${
              theme === 'dark' ? 'bg-[#0F0F11] border-white/5' : 'bg-white border-black/5'
            }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-5 border-b sticky top-0 backdrop-blur-xl z-20 transition-colors duration-500 ${
              theme === 'dark' ? 'border-white/5 bg-[#0F0F11]/80' : 'border-black/5 bg-white/80'
            }`}>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleBack}
                  className={`p-2 rounded-full transition-all ${
                    theme === 'dark' ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-black'
                  }`}
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>주문 내역</h2>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overscroll-contain touch-pan-y">
              <div className="space-y-5 pb-24">
                {isLoadingOrders && orders.length === 0 ? (
                  <div className="flex justify-center py-24">
                    <Loader2 className={`animate-spin ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-300'}`} size={32} />
                  </div>
                ) : orders.length === 0 ? (
                  <div className={`text-center py-32 border border-dashed rounded-[2.5rem] flex flex-col items-center justify-center transition-colors duration-500 ${
                    theme === 'dark' ? 'bg-zinc-900/20 border-white/5' : 'bg-zinc-50 border-black/5'
                  }`}>
                    <Package size={48} strokeWidth={1} className={`mx-auto mb-4 ${theme === 'dark' ? 'text-zinc-800' : 'text-zinc-200'}`} />
                    <p className={`font-medium mb-6 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>주문 내역이 없습니다.</p>
                    <button 
                      onClick={() => {
                        onClose();
                        navigate('/collection');
                      }}
                      className={`px-6 py-3 font-medium rounded-2xl transition-colors ${
                        theme === 'dark' ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-black text-white hover:bg-zinc-800'
                      }`}
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
                      className={`border rounded-[2rem] p-7 space-y-5 transition-all group cursor-default ${
                        theme === 'dark' ? 'bg-zinc-900/40 border-white/5 hover:bg-zinc-900/60' : 'bg-zinc-50 border-black/5 hover:bg-zinc-100'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className={`text-[14px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{order.order_number}</p>
                          <p className={`text-xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-4 py-2 rounded-xl text-[13px] font-bold uppercase tracking-widest ${
                          order.status === '배송완료' 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : theme === 'dark' ? 'bg-white/5 text-zinc-400' : 'bg-black/5 text-zinc-500'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                      
                      <div className={`pt-5 border-t space-y-6 ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                        <div className="space-y-3">
                          {(order.ordered_items as any[])?.map((ji: any, index: number) => {
                            const isWorkshop = ji.product_id === 'workshop-single';
                            const displayImageUrl = getFullImageUrl(ji.user_image_url || ji.front_image, isWorkshop);

                            return (
                              <div key={index} className={`flex items-center gap-4 p-4 rounded-2xl border group/item ${
                                theme === 'dark' ? 'bg-zinc-900/30 border-zinc-800/30' : 'bg-white border-black/5'
                              }`}>
                                <div className={`w-16 h-16 rounded-xl overflow-hidden border flex-shrink-0 ${
                                  theme === 'dark' ? 'bg-zinc-800 border-white/5' : 'bg-zinc-100 border-black/5'
                                }`}>
                                  {displayImageUrl ? (
                                    <img 
                                      src={displayImageUrl} 
                                      className="w-full h-full object-cover" 
                                      onError={(e) => (e.currentTarget.src = 'https://picsum.photos/seed/error/200/200')}
                                    />
                                  ) : <Image className={`w-full h-full p-4 ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-300'}`} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className={`font-bold text-base truncate ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{ji.title}</p>
                                    {isWorkshop && (
                                      <span className="bg-[#8B5CF6]/20 text-[#8B5CF6] text-[12px] font-black px-2 py-0.5 rounded">CUSTOM</span>
                                    )}
                                  </div>
                                  <p className={`text-sm font-medium ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{ji.option} • {ji.quantity}개</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className={`flex justify-between items-center pt-5 border-t ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                          <span className={`text-lg ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'} font-bold`}>결제 금액</span>
                          <span className={`text-3xl font-black ${theme === 'dark' ? 'text-white' : 'text-black'}`}>₩{order.total_price?.toLocaleString()}</span>
                        </div>
                        
                        <div className="pt-2">
                          <p className={`text-[14px] font-black uppercase tracking-widest mb-6 ml-1 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-700'}`}>주문 진행 상태</p>
                          <OrderStepper status={order.status} />
                        </div>

                        {order.courier && order.tracking_number && (
                          <div className={`pt-5 border-t ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-1.5 h-4 rounded-full ${theme === 'dark' ? 'bg-zinc-600' : 'bg-zinc-400'}`} />
                              <p className={`text-[14px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-700'}`}>배송 정보</p>
                            </div>
                            <div className={`flex justify-between items-center rounded-xl px-5 py-4 ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'}`}>
                              <span className={`text-base font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{order.courier}</span>
                              <span className={`text-base font-bold tracking-wider ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{order.tracking_number}</span>
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
