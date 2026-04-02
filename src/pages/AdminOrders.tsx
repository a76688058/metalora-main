import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Package, Truck, CheckCircle, Clock, XCircle, X, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import LoadingScreen from '../components/LoadingScreen';

interface OrderItem {
  id: string;
  order_number: string;
  product_id: string;
  product_title: string;
  option: string;
  quantity: number;
  price: number;
}

interface Order {
  order_number: string;
  created_at: string;
  user_id: string;
  user_custom_id?: string;
  total_price: number;
  status: string;
  shipping_name: string;
  shipping_phone: string;
  zip_code: string;
  address: string;
  address_detail: string;
  courier?: string;
  tracking_number?: string;
  order_items?: OrderItem[];
  ordered_items?: any[]; // JSON column fallback
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case '결제완료':
      return <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20 flex items-center gap-1 w-fit"><CheckCircle size={12} /> 결제완료</span>;
    case '제작중':
      return <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-medium border border-purple-500/20 flex items-center gap-1 w-fit"><Package size={12} /> 제작중</span>;
    case '배송중':
      return <span className="px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-medium border border-yellow-500/20 flex items-center gap-1 w-fit"><Truck size={12} /> 배송중</span>;
    case '구매확정':
      return <span className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-medium border border-green-500/20 flex items-center gap-1 w-fit"><CheckCircle size={12} /> 구매확정</span>;
    case '환불':
      return <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 flex items-center gap-1 w-fit"><XCircle size={12} /> 환불</span>;
    default:
      return <span className="px-2.5 py-1 rounded-full bg-zinc-500/10 text-zinc-400 text-xs font-medium border border-zinc-500/20 flex items-center gap-1 w-fit"><Clock size={12} /> {status}</span>;
  }
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { showToast } = useToast();

  // Bottom Sheet State
  const [isShippingModalOpen, setIsShippingModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [shippingData, setShippingData] = useState({ courier: 'CJ대한통운', tracking_number: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchOrders = async (retryCount = 0) => {
    if (!supabase) return;
    try {
      setLoading(true);
      setFetchError(null);
      
      // 지시: orders 테이블을 메인으로 조회하고, order_items를 부모-자식 관계로 불러옴
      // 이 방식은 order_items에 order_number 컬럼이 없어도 관계가 설정되어 있다면 정상 작동함
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });
      
      if (ordersError) {
        // Schema cache error 감지 시 1초 뒤 자동 재시도
        if (ordersError.message.includes('Schema cache error') && retryCount < 3) {
          console.warn(`Schema cache error detected. Retrying in 1s... (Attempt ${retryCount + 1})`);
          setTimeout(() => fetchOrders(retryCount + 1), 1000);
          return;
        }

        // 지시: 특정 컬럼이 없어서 발생하는 'PostgREST 에러' 감지 시 Safe-Load 모드 활성화
        // 관계 매핑 오류(order_items(*) 부분)가 원인일 경우, 기본 정보만이라도 우선 로딩
        if (ordersError.code === 'PGRST204' || ordersError.message.includes('order_items')) {
          console.warn('Safe-Load Mode Activated: Fetching basic order info only due to mapping error.');
          const { data: basicData, error: basicError } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
          
          if (basicError) throw basicError;
          setOrders(basicData || []);
          return;
        }

        throw ordersError;
      }
      
      if (ordersData) {
        setOrders(ordersData);
      }
    } catch (error: any) {
      console.error('Fetch orders error:', error);
      setFetchError(error.message || '알 수 없는 오류가 발생했습니다.');
      showToast("주문 목록을 불러오지 못했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const updateOrderStatus = async (order_number: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('order_number', order_number);
      
      if (error) throw error;
      
      setOrders(prev => prev.map(order => order.order_number === order_number ? { ...order, status: newStatus } : order));
      showToast("상태가 변경되었습니다.", "success");
    } catch (error) {
      console.error('Update status error:', error);
      showToast("잠시 후 다시 시도해주세요.", "error");
    }
  };

  const handleShippingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId) return;
    if (!shippingData.tracking_number) {
      showToast("운송장 번호를 입력해주세요.", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: '배송중',
          courier: shippingData.courier,
          tracking_number: shippingData.tracking_number
        })
        .eq('order_number', selectedOrderId);
      
      if (error) throw error;
      
      setOrders(prev => prev.map(order => 
        order.order_number === selectedOrderId 
          ? { ...order, status: '배송중', courier: shippingData.courier, tracking_number: shippingData.tracking_number } 
          : order
      ));
      
      showToast("상태가 변경되었습니다.", "success");
      setIsShippingModalOpen(false);
      setShippingData({ courier: 'CJ대한통운', tracking_number: '' });
    } catch (error) {
      showToast("잠시 후 다시 시도해주세요.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase();
    const itemsTitleMatch = order.order_items?.some(item => item.product_title?.toLowerCase().includes(searchLower));
    
    return (
      order.order_number?.toLowerCase().includes(searchLower) ||
      order.shipping_name?.toLowerCase().includes(searchLower) ||
      itemsTitleMatch
    );
  });

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl mx-auto pb-20 p-4 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-white">주문 관리</h2>
        </div>

        {/* 에러 디버깅 UI */}
        {fetchError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 text-red-400 mb-1">
              <AlertCircle size={18} />
              <span className="font-bold text-sm">데이터 로딩 에러 (사장님 확인용)</span>
            </div>
            <p className="text-xs text-red-300/80 font-mono break-all leading-relaxed">
              {fetchError}
            </p>
            <button 
              onClick={() => fetchOrders()}
              className="mt-3 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
          <input
            type="text"
            placeholder="주문번호, 고객명, 상품명 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-indigo-500 transition-colors shadow-sm"
          />
        </div>

        {/* 주문 리스트 (카드 형태) */}
        <div className="space-y-4">
          {loading ? (
            <LoadingScreen />
          ) : fetchError ? (
            <div className="bg-zinc-900 rounded-3xl p-12 border border-zinc-800 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="text-red-500" size={32} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">데이터를 불러올 수 없습니다</h3>
              <p className="text-zinc-400 mb-6 max-w-xs mx-auto">
                서버 응답 오류가 발생했습니다. 상단의 상세 에러 메시지를 확인해주세요.
              </p>
            </div>
          ) : filteredOrders.length > 0 ? (
            filteredOrders.map((order) => (
              <div key={order.order_number} className="bg-zinc-900 rounded-2xl p-5 md:p-6 border border-zinc-800 shadow-sm hover:border-zinc-700 transition-colors">
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-mono text-zinc-500">{order.order_number}</span>
                      {getStatusBadge(order.status)}
                    </div>
                    {/* 상품 상세 정보 (order_items 테이블 또는 ordered_items JSON 컬럼 참조) */}
                    {(order.order_items && order.order_items.length > 0) ? (
                      <div className="space-y-2 mb-3">
                        {order.order_items.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-3 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/30">
                            <div className="flex-1">
                              <p className="text-white font-bold text-sm leading-tight">{item.product_title}</p>
                              <p className="text-zinc-500 text-xs mt-0.5">옵션: {item.option}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-zinc-400 text-xs font-mono">{item.quantity}개</p>
                              <p className="text-zinc-500 text-[10px]">₩{item.price?.toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (order.ordered_items && order.ordered_items.length > 0) ? (
                      <div className="space-y-2 mb-3">
                        {order.ordered_items.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-3 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/30">
                            <div className="flex-1">
                              <p className="text-white font-bold text-sm leading-tight">{item.product_title}</p>
                              <p className="text-zinc-500 text-xs mt-0.5">옵션: {item.option_name || item.option}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-zinc-400 text-xs font-mono">{item.quantity}개</p>
                              <p className="text-zinc-500 text-[10px]">₩{item.price?.toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/30 mb-3">
                        <p className="text-zinc-500 text-xs italic">상품 상세 정보가 없습니다.</p>
                      </div>
                    )}
                    <p className="text-indigo-400 font-bold">₩{order.total_price?.toLocaleString()}</p>
                  </div>
                  
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50 md:min-w-[240px]">
                    <div className="flex items-center gap-2 mb-2">
                      {order.user_custom_id ? (
                        <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded font-black uppercase tracking-wider">
                          {order.user_custom_id}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          GUEST
                        </span>
                      )}
                      <p className="text-sm text-white font-bold">{order.shipping_name}</p>
                    </div>
                    <p className="text-xs text-zinc-400 mb-1">{order.shipping_phone}</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      [{order.zip_code}] {order.address} {order.address_detail}
                    </p>
                    {order.courier && order.tracking_number && (
                      <div className="mt-3 pt-3 border-t border-zinc-800">
                        <p className="text-xs text-zinc-300">
                          <span className="text-zinc-500 mr-2">운송장</span>
                          {order.courier} {order.tracking_number}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 상태 변경 버튼 그룹 */}
                <div className="pt-4 border-t border-zinc-800 flex flex-wrap gap-2">
                  {order.status === '결제대기' && (
                    <button
                      onClick={() => updateOrderStatus(order.order_number, '결제완료')}
                      className="px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm font-medium rounded-xl transition-colors active:scale-95 border border-blue-500/20"
                    >
                      결제 확인
                    </button>
                  )}
                  {order.status === '결제완료' && (
                    <button
                      onClick={() => updateOrderStatus(order.order_number, '제작중')}
                      className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-colors active:scale-95"
                    >
                      제작 시작하기
                    </button>
                  )}
                  {order.status === '제작중' && (
                    <button
                      onClick={() => {
                        setSelectedOrderId(order.order_number);
                        setIsShippingModalOpen(true);
                      }}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors active:scale-95"
                    >
                      배송 처리하기
                    </button>
                  )}
                  {order.status === '배송중' && (
                    <button
                      onClick={() => updateOrderStatus(order.order_number, '구매확정')}
                      className="px-4 py-2.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-sm font-medium rounded-xl transition-colors active:scale-95 border border-green-500/20"
                    >
                      구매 확정
                    </button>
                  )}
                  {(order.status === '결제대기' || order.status === '결제완료' || order.status === '제작중') && (
                    <button
                      onClick={() => updateOrderStatus(order.order_number, '환불')}
                      className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-xl transition-colors active:scale-95 border border-red-500/20 ml-auto"
                    >
                      환불 처리
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-zinc-900 rounded-3xl p-12 border border-zinc-800 text-center">
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="text-zinc-500" size={32} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">주문 내역이 없습니다</h3>
              <p className="text-zinc-400">
                {searchTerm ? '검색 결과와 일치하는 주문이 없습니다.' : '아직 접수된 주문이 없습니다.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 운송장 번호 입력 바텀 시트 */}
      <AnimatePresence>
        {isShippingModalOpen && (
          <div className="fixed inset-0 z-[100] flex justify-center items-end bg-black/80 w-screen h-screen overflow-hidden">
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              onDragEnd={(e, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  setIsShippingModalOpen(false);
                }
              }}
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              className="relative w-full max-w-lg bg-[#1A1A1A] rounded-t-[24px] rounded-b-none max-h-[85vh] overflow-y-auto p-6 shadow-2xl pb-safe mt-auto"
            >
              <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto my-3" />
              
              <button 
                onClick={() => setIsShippingModalOpen(false)}
                className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors z-50 p-2"
              >
                <X size={24} />
              </button>

              <div className="mb-8 mt-4">
                <h2 className="text-2xl font-bold text-white tracking-tight mb-2">운송장 정보 입력</h2>
                <p className="text-zinc-400 font-medium text-sm">고객에게 안내될 배송 정보를 입력해주세요.</p>
              </div>

              <form onSubmit={handleShippingSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-2 ml-1">택배사</label>
                  <select
                    value={shippingData.courier}
                    onChange={(e) => setShippingData(prev => ({ ...prev, courier: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-indigo-500 transition-colors text-lg appearance-none"
                  >
                    <option value="CJ대한통운">CJ대한통운</option>
                    <option value="우체국택배">우체국택배</option>
                    <option value="한진택배">한진택배</option>
                    <option value="롯데택배">롯데택배</option>
                    <option value="로젠택배">로젠택배</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-2 ml-1">운송장 번호</label>
                  <input
                    type="text"
                    required
                    value={shippingData.tracking_number}
                    onChange={(e) => setShippingData(prev => ({ ...prev, tracking_number: e.target.value }))}
                    placeholder="운송장 번호를 입력하세요"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors text-lg"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2 mt-8 text-lg active:scale-95"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : null}
                  배송 처리하기
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
