import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flame, TrendingUp, Package, DollarSign, 
  Calendar, Loader2, Search, Download,
  Award, BarChart3, RefreshCcw
} from 'lucide-react';
import { getFullImageUrl } from '../lib/utils';

// --- Types & Constants ---
type Period = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

interface BestSellerItem {
  name: string;
  count: number;
  revenue: number;
  isWorkshop: boolean;
  image?: string;
}

const VALID_STATUSES = [
  'PAID', 'PRODUCTION', 'SHIPPING', 'COMPLETED', 
  '결제확인', '제작중', '배송중', '배송완료', '구매확정',
  'paid', 'production', 'shipping', 'completed'
];

const STORAGE_BASE_URL = 'https://qifloweuwyhvukabgnoa.supabase.co/storage/v1/object/public';

const downloadImage = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || 'product-image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    window.open(url, '_blank');
  }
};

// --- Custom Hook ---
const useBestSellers = (period: Period, appliedRange: { start: Date; end: Date } | null) => {
  const [data, setData] = useState<BestSellerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    try {
      setLoading(true);
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const year = kstNow.getUTCFullYear();
      const month = kstNow.getUTCMonth();
      const day = kstNow.getUTCDate();
      
      let startUTC: Date | null = null;
      let endUTC: Date | null = null;

      if (period === 'today') {
        const startKST = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        const endKST = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        startUTC = new Date(startKST.getTime() - 9 * 60 * 60 * 1000);
        endUTC = new Date(endKST.getTime() - 9 * 60 * 60 * 1000);
      } else if (period === 'week') {
        // Get the first day of the week (Sunday)
        const dayOfWeek = kstNow.getUTCDay();
        const startKST = new Date(Date.UTC(year, month, day - dayOfWeek, 0, 0, 0, 0));
        const endKST = new Date(Date.UTC(year, month, day + (6 - dayOfWeek), 23, 59, 59, 999));
        startUTC = new Date(startKST.getTime() - 9 * 60 * 60 * 1000);
        endUTC = new Date(endKST.getTime() - 9 * 60 * 60 * 1000);
      } else if (period === 'month') {
        const startKST = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const endKST = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        startUTC = new Date(startKST.getTime() - 9 * 60 * 60 * 1000);
        endUTC = new Date(endKST.getTime() - 9 * 60 * 60 * 1000);
      } else if (period === 'year') {
        const startKST = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
        const endKST = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
        startUTC = new Date(startKST.getTime() - 9 * 60 * 60 * 1000);
        endUTC = new Date(endKST.getTime() - 9 * 60 * 60 * 1000);
      } else if (period === 'custom' && appliedRange) {
        // Ensure custom range is also handled in KST
        const startKST = new Date(Date.UTC(appliedRange.start.getFullYear(), appliedRange.start.getMonth(), appliedRange.start.getDate(), 0, 0, 0, 0));
        const endKST = new Date(Date.UTC(appliedRange.end.getFullYear(), appliedRange.end.getMonth(), appliedRange.end.getDate(), 23, 59, 59, 999));
        startUTC = new Date(startKST.getTime() - 9 * 60 * 60 * 1000);
        endUTC = new Date(endKST.getTime() - 9 * 60 * 60 * 1000);
      } else if (period === 'all') {
        startUTC = null;
        endUTC = null;
      }

      let query = supabase
        .from('orders')
        .select('*')
        .in('status', VALID_STATUSES);

      if (startUTC) query = query.gte('created_at', startUTC.toISOString());
      if (endUTC) query = query.lte('created_at', endUTC.toISOString());

      const { data: orders, error } = await query;
      console.log('[BestSellers] Raw Orders Data:', orders);
      
      if (orders && orders.length > 0) {
        console.log('[BestSellers] Sample Order Items:', orders[0].ordered_items);
      }

      if (error) throw error;

      const aggregation: Record<string, BestSellerItem> = {};
      orders?.forEach(order => {
        (order.ordered_items as any[] || []).forEach((ji: any) => {
          const name = ji.title || '상품 정보 없음';
          const quantity = Number(ji.quantity) || 1;
          const price = Number(ji.price) || 0;
          const revenue = quantity * price;
          
          const userImageUrl = ji.user_image_url;
          
          const isWorkshop = ji.product_id === 'workshop-single' || 
                            name.includes('커스텀') || 
                            name.includes('Workshop') || 
                            name.includes('Atelier') ||
                            name === '커스텀 작품(Workshop)' ||
                            !!userImageUrl;

          const productImage = userImageUrl || ji.front_image || '';

          if (!aggregation[name]) {
            aggregation[name] = { name, count: 0, revenue: 0, isWorkshop, image: productImage };
          }
          aggregation[name].count += quantity;
          aggregation[name].revenue += revenue;
          if (!aggregation[name].image && productImage) aggregation[name].image = productImage;
        });
      });

      setData(Object.values(aggregation).sort((a, b) => b.count - a.count || b.revenue - a.revenue));
    } catch (err: any) {
      console.error('[BestSellers] Fetch Error:', err);
      showToast(`데이터를 불러오는데 실패했습니다: ${err.message || '알 수 없는 오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [period, appliedRange, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, refetch: fetchData };
};

// --- Sub-components ---
const StatCard = ({ title, value, unit, icon: Icon, colorClass, delay = 0 }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 0.5 }}
    className="bg-[#0A0A0A] p-6 sm:p-8 rounded-[32px] border border-white/5 shadow-xl relative overflow-hidden group hover:border-white/10 transition-all"
  >
    <div className={`absolute -top-12 -right-12 w-32 h-32 ${colorClass} blur-3xl rounded-full opacity-[0.03] group-hover:opacity-10 transition-all duration-700`} />
    <div className="flex items-center gap-4 mb-4 sm:mb-6 relative z-10">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${colorClass.replace('bg-', 'bg-opacity-10 text-')} flex items-center justify-center border border-white/5`}>
        <Icon size={20} className="sm:w-6 sm:h-6" />
      </div>
      <span className="text-zinc-500 font-bold text-sm sm:text-base tracking-tight">{title}</span>
    </div>
    <div className="text-2xl sm:text-4xl font-black text-white tracking-tighter relative z-10 flex items-baseline gap-1">
      {typeof value === 'number' ? value.toLocaleString() : value}
      <span className="text-sm sm:text-lg text-zinc-600 font-bold">{unit}</span>
    </div>
  </motion.div>
);

export default function AdminBestSellers() {
  const [period, setPeriod] = useState<Period>('month');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [appliedRange, setAppliedRange] = useState<{ start: Date; end: Date } | null>(null);
  
  const { data, loading, refetch } = useBestSellers(period, appliedRange);

  const handleCustomSearch = () => {
    if (!dateRange.start || !dateRange.end) return alert('날짜를 모두 선택해주세요.');
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    if (end < start) return alert('종료일이 시작일보다 빠릅니다.');
    setAppliedRange({ start, end });
    setPeriod('custom');
  };

  const stats = useMemo(() => ({
    totalCount: data.reduce((sum, item) => sum + item.count, 0),
    totalRevenue: data.reduce((sum, item) => sum + item.revenue, 0),
    productCount: data.length,
    maxCount: Math.max(...data.map(item => item.count), 1)
  }), [data]);

  const reportTitle = useMemo(() => {
    const titles = { today: '오늘', week: '이번 주', month: '이번 달', year: '올해', all: '전체' };
    if (period === 'custom' && appliedRange) {
      return `${appliedRange.start.toLocaleDateString()} ~ ${appliedRange.end.toLocaleDateString()}`;
    }
    return titles[period as keyof typeof titles] || '';
  }, [period, appliedRange]);

  return (
    <AdminLayout>
      <div className="max-w-[1400px] mx-auto space-y-8 pb-20 px-4 sm:px-6">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-[#0A0A0A] p-6 sm:p-8 rounded-[32px] border border-white/5 shadow-2xl">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white shadow-xl shadow-purple-500/20 ring-1 ring-white/20 flex-shrink-0">
              <Award className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">인기 판매 제품</h2>
              <p className="text-zinc-500 font-medium mt-1 text-sm sm:text-base">데이터 기반 실시간 판매 분석</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex p-1 bg-zinc-900/60 rounded-xl border border-white/5 overflow-x-auto no-scrollbar">
              {(['today', 'week', 'month', 'year', 'all'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setAppliedRange(null); }}
                  className={`px-4 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all duration-200 ${
                    period === p ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  {p === 'today' ? '오늘' : p === 'week' ? '이번 주' : p === 'month' ? '이번 달' : p === 'year' ? '올해' : '전체'}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/60 rounded-xl border border-white/5">
                <input 
                  type="date" 
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent text-white text-[10px] font-bold outline-none [color-scheme:dark] w-24"
                />
                <span className="text-zinc-700 text-[10px]">~</span>
                <input 
                  type="date" 
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent text-white text-[10px] font-bold outline-none [color-scheme:dark] w-24"
                />
                <button
                  onClick={handleCustomSearch}
                  className="p-1.5 bg-purple-600 rounded-lg text-white hover:bg-purple-500 transition-colors"
                >
                  <Search size={14} />
                </button>
              </div>
              
              <button 
                onClick={() => refetch()}
                className="p-2.5 bg-zinc-900/60 rounded-xl border border-white/5 text-zinc-500 hover:text-white transition-colors"
              >
                <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <StatCard title="총 판매 수량" value={stats.totalCount} unit="건" icon={TrendingUp} colorClass="bg-purple-500" delay={0.1} />
          <StatCard title="총 판매 금액" value={stats.totalRevenue} unit="원" icon={DollarSign} colorClass="bg-emerald-500" delay={0.2} />
          <StatCard title="분석된 제품 수" value={stats.productCount} unit="종" icon={Package} colorClass="bg-blue-500" delay={0.3} />
        </div>

        {/* Ranking List */}
        <div className="bg-[#0A0A0A] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
          <div className="p-6 sm:p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                <BarChart3 size={20} />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  <span className="text-purple-500 mr-2">{reportTitle}</span>
                  판매 랭킹
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/40 rounded-full border border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              <Calendar size={14} className="text-purple-500" />
              <span>{new Date().toLocaleDateString('ko-KR')} 기준</span>
            </div>
          </div>

          <div className="p-4 sm:p-8">
            <div className="space-y-4">
              <AnimatePresence mode="wait">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-24 bg-zinc-900/40 rounded-2xl animate-pulse border border-white/5" />
                  ))
                ) : data.length > 0 ? (
                  data.map((item, index) => {
                    const rank = index + 1;
                    const percentage = (item.count / stats.maxCount) * 100;
                    
                    return (
                      <motion.div 
                        key={item.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group relative bg-zinc-900/20 hover:bg-white/[0.03] p-4 sm:p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center gap-6"
                      >
                        {/* Rank Badge */}
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-black text-lg sm:text-xl flex-shrink-0 ${
                          rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-orange-600 text-white shadow-lg shadow-orange-500/20' :
                          rank === 2 ? 'bg-zinc-800 text-zinc-300' :
                          rank === 3 ? 'bg-zinc-900 text-zinc-500' :
                          'bg-transparent text-zinc-700'
                        }`}>
                          {rank}
                        </div>

                        {/* Product Info */}
                        <div className="flex-1 flex items-center gap-4 sm:gap-6 w-full min-w-0">
                          <div 
                            onClick={() => {
                              const url = getFullImageUrl(item.image, item.isWorkshop);
                              if (url) downloadImage(url, `${item.name}.png`);
                            }}
                            className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 cursor-pointer group-hover:border-purple-500/30 transition-all"
                          >
                            {item.image && getFullImageUrl(item.image, item.isWorkshop) ? (
                              <>
                                <img 
                                  src={getFullImageUrl(item.image, item.isWorkshop) || undefined} 
                                  alt={item.name}
                                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Download size={18} className="text-white" />
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800">
                                <Package size={24} />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
                              <h4 className="text-lg sm:text-xl font-bold text-white truncate tracking-tight group-hover:text-purple-400 transition-colors">
                                {item.name}
                              </h4>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
                                  item.isWorkshop ? 'bg-purple-500/10 text-purple-500' : 'bg-zinc-800 text-zinc-500'
                                }`}>
                                  {item.isWorkshop ? 'Workshop' : 'Standard'}
                                </span>
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                <span>판매 비중</span>
                                <span>{Math.round(percentage)}%</span>
                              </div>
                              <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percentage}%` }}
                                  transition={{ duration: 1.5, ease: "easeOut" }}
                                  className={`h-full rounded-full ${
                                    rank === 1 ? 'bg-gradient-to-r from-purple-600 to-blue-500' : 'bg-zinc-700'
                                  }`}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Performance Stats */}
                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center w-full sm:w-auto pt-4 sm:pt-0 border-t sm:border-t-0 border-white/5 gap-2">
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl sm:text-3xl font-black text-white tracking-tighter">{item.count.toLocaleString()}</span>
                            <span className="text-xs text-zinc-500 font-bold">건</span>
                          </div>
                          <div className="text-xs sm:text-sm font-medium text-zinc-500 font-mono">
                            ₩{item.revenue.toLocaleString()}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-[32px]">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-800">
                        <Flame size={32} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl font-bold text-white">판매 데이터가 없습니다</p>
                        <p className="text-zinc-500 text-sm">선택하신 기간 동안의 판매 내역이 아직 집계되지 않았습니다.</p>
                      </div>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </AdminLayout>
  );
}
