import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Loader2, ChevronLeft, Package, ShoppingBag
} from 'lucide-react';

import LoadingScreen from '../components/LoadingScreen';

const OrderStepper = ({ status }: { status: string }) => {
  const steps = ['결제완료', '제품공정', '배송시작', '배송완료'];
  
  const getActiveStep = (status: string) => {
    switch (status) {
      case '결제완료': return 0;
      case '제작중': return 1;
      case '배송중': return 2;
      case '구매확정': return 3;
      default: return -1;
    }
  };

  const activeIndex = getActiveStep(status);

  return (
    <div className="w-full pt-6 pb-2">
      <div className="relative flex justify-between items-center px-2">
        {/* Background Line */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/5 z-0" />
        
        {steps.map((step, idx) => {
          const isCompleted = idx < activeIndex;
          const isActive = idx === activeIndex;
          
          return (
            <div key={step} className="relative z-10 flex flex-col items-center gap-3">
              <div 
                className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                  isActive 
                    ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] scale-125' 
                    : isCompleted 
                      ? 'bg-zinc-400' 
                      : 'bg-zinc-800'
                }`} 
              />
              <span className={`text-[9px] font-light tracking-tighter uppercase ${
                isActive ? 'text-white font-medium' : 'text-zinc-600'
              }`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function Orders() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

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
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  if (authLoading || !profile || (isLoadingOrders && orders.length === 0)) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center px-6 sticky top-0 bg-black/80 backdrop-blur-xl z-50">
        <button 
          onClick={() => navigate('/mypage')} 
          className="p-2 -ml-2 hover:bg-white/5 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="ml-2 text-xl font-black tracking-tighter text-white uppercase">주문 내역</h1>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar pb-24 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-xl mx-auto px-6 py-8">
          <div className="space-y-5">
            {isLoadingOrders && orders.length === 0 ? (
              <div className="flex justify-center py-24">
                <Loader2 className="animate-spin text-zinc-700" size={32} />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-32 bg-zinc-900/20 border border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center">
                <Package size={48} strokeWidth={1} className="mx-auto text-zinc-800 mb-4" />
                <p className="text-zinc-600 font-medium mb-6">주문 내역이 없습니다.</p>
                <button 
                  onClick={() => navigate('/collection')}
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
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 font-medium">결제 금액</span>
                      <span className="text-white text-xl font-bold">₩{order.total_price?.toLocaleString()}</span>
                    </div>
                    
                    <div className="bg-black/20 rounded-2xl p-4">
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
      </main>
    </div>
  );
}
