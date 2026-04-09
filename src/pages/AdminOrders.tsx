import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Truck, CheckCircle, Palette, X, Download, Image, Search, ChevronRight, Package, Clock, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Order, OrderItem } from '../types/database';
import { getFullImageUrl } from '../lib/utils';
import { OrderStepper } from '../components/OrderStepper';

const ORDER_STATUS = {
  PAID: '결제확인',
  PRODUCTION: '제작/검수 중',
  SHIPPING: '배송 중',
  COMPLETED: '배송완료'
};

const STATUS_STEPS = [
  { key: 'PAID', label: '결제확인', color: 'bg-zinc-700' },
  { key: 'PRODUCTION', label: '제작/검수 중', color: 'bg-[#8B5CF6]' },
  { key: 'SHIPPING', label: '배송 중', color: 'bg-blue-600' },
  { key: 'COMPLETED', label: '배송완료', color: 'bg-emerald-600' }
];

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [trackingData, setTrackingData] = useState({ courier: '', tracking_number: '' });
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{orderId: string, status: string} | null>(null);
  const { showToast } = useToast();

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      console.error('Fetch orders error:', error);
      showToast("주문 데이터를 불러오는데 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      showToast("다운로드를 시작합니다.", "success");
    } catch {
      showToast("다운로드에 실패했습니다.", "error");
    }
  };

  const updateStatus = async (orderId: string, status: string, trackingInfo?: { courier: string, tracking_number: string }) => {
    try {
      setIsSubmitting(true);
      const updateData: any = { status };
      if (trackingInfo) {
        updateData.courier = trackingInfo.courier;
        updateData.tracking_number = trackingInfo.tracking_number;
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);
      
      if (error) throw error;
      
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updateData } : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, ...updateData } : null);
      }
      showToast(`상태가 ${ORDER_STATUS[status as keyof typeof ORDER_STATUS] || status}로 변경되었습니다.`, "success");
      setIsTrackingModalOpen(false);
      setPendingStatusUpdate(null);
      setTrackingData({ courier: '', tracking_number: '' });
    } catch (error: any) {
      console.error('Update status error:', error);
      showToast("상태 변경에 실패했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredOrders = orders.filter(o => 
    o.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    o.shipping_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-2xl font-black text-white tracking-tighter">주문 관리</h2>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="주문번호, 고객명 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-11 pr-4 py-3 text-white focus:outline-none focus:border-[#8B5CF6] transition-all text-sm"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-12 text-center">
              <Package className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-500 font-bold">주문 내역이 없습니다.</p>
            </div>
          ) : (
            filteredOrders.map(order => (
              <motion.div 
                key={order.id} 
                layout
                onClick={() => setSelectedOrder(order)}
                className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 flex items-center gap-4 cursor-pointer hover:border-[#8B5CF6]/50 transition-all group active:scale-[0.98]"
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 border border-white/5">
                  {(() => {
                    const firstItem = (order.ordered_items as any[])?.[0];
                    if (!firstItem) return <Image className="w-full h-full p-4 text-zinc-700" />;
                    
                    const isWorkshop = firstItem.product_id === 'workshop-single';
                    const displayImageUrl = getFullImageUrl(firstItem.user_image_url || firstItem.front_image, isWorkshop);
                    
                    return displayImageUrl ? (
                      <img 
                        src={displayImageUrl} 
                        className="w-full h-full object-cover" 
                        onError={(e) => (e.currentTarget.src = 'https://picsum.photos/seed/error/200/200')}
                      />
                    ) : <Image className="w-full h-full p-4 text-zinc-700" />;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-black text-white text-sm truncate">{order.order_number}</p>
                    {(() => {
                      const hasCustom = (order.ordered_items as any[])?.some(ji => !!ji.user_image_url);
                      return hasCustom && (
                        <span className="bg-[#8B5CF6]/20 text-[#8B5CF6] text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">Custom</span>
                      );
                    })()}
                  </div>
                  <p className="text-[11px] text-zinc-500 font-bold">{order.shipping_name} • ₩{order.total_price.toLocaleString()}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black text-white ${STATUS_STEPS.find(s => s.key === order.status)?.color || 'bg-zinc-700'}`}>
                    {ORDER_STATUS[order.status as keyof typeof ORDER_STATUS] || order.status}
                  </span>
                  <ChevronRight className="text-zinc-700 group-hover:text-zinc-400 transition-colors" size={16} />
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 w-screen h-screen h-[100dvh] z-50 flex items-end md:items-center justify-center p-0 md:p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setSelectedOrder(null)}
            />
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              className="relative bg-[#141416] w-full max-w-xl rounded-t-[32px] md:rounded-[32px] p-6 max-h-[92vh] overflow-y-auto border border-white/5 shadow-2xl custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              <div className="pb-12">
                <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto mb-6 md:hidden" />
              
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight mb-1">주문 상세 정보</h3>
                  <p className="text-zinc-500 text-xs font-bold">{selectedOrder.order_number}</p>
                </div>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 bg-zinc-900 rounded-full text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">
                {/* 배송 정보 섹션 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800/50">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">수령인 정보</p>
                    <p className="text-white font-bold mb-1">{selectedOrder.shipping_name}</p>
                    <p className="text-zinc-400 text-sm">{selectedOrder.shipping_phone}</p>
                  </div>
                  <div className="bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800/50">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">배송지 주소</p>
                    <p className="text-zinc-300 text-sm leading-relaxed">
                      {selectedOrder.address} {selectedOrder.address_detail}
                      <span className="block mt-1 text-zinc-500 text-xs">({selectedOrder.zip_code})</span>
                    </p>
                  </div>
                </div>

                {/* 주문 상품 목록 */}
                <div className="pt-4">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-6 ml-1">주문 진행 상태</p>
                  <OrderStepper status={selectedOrder.status} />

                  {selectedOrder.courier && selectedOrder.tracking_number && (
                    <div className="mt-8 pt-8 border-t border-white/5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">배송 정보</p>
                      </div>
                      <div className="flex justify-between items-center bg-black/40 rounded-2xl px-5 py-4 border border-white/5">
                        <span className="text-xs text-zinc-400 font-bold">{selectedOrder.courier}</span>
                        <span className="text-sm text-white font-black tracking-wider">{selectedOrder.tracking_number}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 ml-1">주문 상품 목록 ({(selectedOrder.ordered_items as any[])?.length || 0})</p>
                  <div className="space-y-3">
                    {(selectedOrder.ordered_items as any[])?.map((ji: any, index: number) => {
                      const isWorkshop = ji.product_id === 'workshop-single';
                      const displayImageUrl = getFullImageUrl(ji.user_image_url || ji.front_image, isWorkshop);

                      return (
                        <div key={index} className="flex items-center gap-4 bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/30 group/item">
                          <div className="w-20 h-20 rounded-xl overflow-hidden bg-zinc-800 border border-white/5 flex-shrink-0">
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
                            <p className="text-xs text-zinc-500 font-medium mb-3">{ji.option} • {ji.quantity}개</p>
                            
                            <div className="flex gap-2">
                              <button 
                                onClick={() => {
                                  if (displayImageUrl) handleDownload(displayImageUrl, `order_${selectedOrder.order_number}_${ji.title}.png`);
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded-lg text-[10px] font-black hover:bg-zinc-200 transition-all active:scale-95"
                              >
                                <Download size={12} /> 원본 다운로드
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 상태 변경 섹션 */}
                <div className="pt-6 border-t border-zinc-800">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 ml-1">공정 상태 변경</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {STATUS_STEPS.map(step => (
                      <button 
                        key={step.key} 
                        disabled={isSubmitting}
                        onClick={() => {
                          if (step.key === 'SHIPPING') {
                            setPendingStatusUpdate({ orderId: selectedOrder.id, status: step.key });
                            setIsTrackingModalOpen(true);
                          } else {
                            updateStatus(selectedOrder.id, step.key);
                          }
                        }}
                        className={`py-3.5 rounded-xl text-[11px] font-black transition-all active:scale-95 flex flex-col items-center gap-1.5
                          ${selectedOrder.status === step.key 
                            ? 'bg-[#8B5CF6] text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]' 
                            : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800'}`}
                      >
                        {isSubmitting && selectedOrder.status === step.key ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            {step.label}
                            <div className={`w-1 h-1 rounded-full ${selectedOrder.status === step.key ? 'bg-white' : 'bg-transparent'}`} />
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTrackingModalOpen && (
          <div className="fixed inset-0 w-screen h-screen h-[100dvh] z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setIsTrackingModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-zinc-900 w-full max-w-md rounded-[32px] p-8 border border-white/10 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black text-white mb-2">배송 정보 입력</h3>
              <p className="text-zinc-500 text-sm mb-8 font-medium">택배사와 운송장 번호를 입력해주세요.</p>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">택배사</label>
                  <input 
                    type="text"
                    value={trackingData.courier}
                    onChange={e => setTrackingData(prev => ({ ...prev, courier: e.target.value }))}
                    placeholder="예: CJ대한통운"
                    className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-[#8B5CF6] transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">운송장 번호</label>
                  <input 
                    type="text"
                    value={trackingData.tracking_number}
                    onChange={e => setTrackingData(prev => ({ ...prev, tracking_number: e.target.value }))}
                    placeholder="숫자만 입력"
                    className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-[#8B5CF6] transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-10">
                <button 
                  onClick={() => setIsTrackingModalOpen(false)}
                  className="flex-1 py-4 bg-zinc-800 text-zinc-400 font-bold rounded-2xl hover:bg-zinc-700 transition-all"
                >
                  취소
                </button>
                <button 
                  disabled={!trackingData.courier || !trackingData.tracking_number || isSubmitting}
                  onClick={() => {
                    if (pendingStatusUpdate) {
                      updateStatus(pendingStatusUpdate.orderId, pendingStatusUpdate.status, trackingData);
                    }
                  }}
                  className="flex-1 py-4 bg-[#8B5CF6] text-white font-bold rounded-2xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : '상태 변경'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}

