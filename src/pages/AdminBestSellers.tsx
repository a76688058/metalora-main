import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { Flame, TrendingUp, Package, DollarSign, Calendar, Loader2, Search, Download } from 'lucide-react';

type Period = 'today' | 'month' | 'year' | 'all' | 'custom';

interface BestSellerItem {
  name: string;
  count: number;
  revenue: number;
  isWorkshop: boolean;
  image?: string;
}

export default function AdminBestSellers() {
  const [period, setPeriod] = useState<Period>('month');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [appliedRange, setAppliedRange] = useState<{ start: Date; end: Date } | null>(null);
  const [data, setData] = useState<BestSellerItem[]>([]);
  const [loading, setLoading] = useState(true);

  const getFullImageUrl = (path: string | null, isWorkshop: boolean = false) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const bucket = isWorkshop ? 'workshop-images' : 'product-images';
    const STORAGE_URL = `https://gdwd3qb5rs7eqadnzqidhb.supabase.co/storage/v1/object/public/${bucket}/`;
    return `${STORAGE_URL}${path}`;
  };

  const handleDownload = async (url: string, filename: string) => {
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

  const fetchBestSellers = async () => {
    if (!supabase) return;
    try {
      setLoading(true);
      
      const now = new Date();
      // Convert to KST
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      
      let startKST: Date | null = null;
      let endKST: Date | null = null;

      if (period === 'today') {
        startKST = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());
        endKST = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate(), 23, 59, 59, 999);
      } else if (period === 'month') {
        startKST = new Date(kstNow.getFullYear(), kstNow.getMonth(), 1);
        endKST = new Date(kstNow.getFullYear(), kstNow.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (period === 'year') {
        startKST = new Date(kstNow.getFullYear(), 0, 1);
        endKST = new Date(kstNow.getFullYear(), 11, 31, 23, 59, 59, 999);
      } else if (period === 'custom' && appliedRange) {
        // Custom range is already assumed to be selected in local time (KST for Korean users)
        startKST = new Date(appliedRange.start);
        startKST.setHours(0, 0, 0, 0);
        endKST = new Date(appliedRange.end);
        endKST.setHours(23, 59, 59, 999);
      }

      let startDateUTC: Date | null = null;
      let endDateUTC: Date | null = null;

      if (startKST) {
        startDateUTC = new Date(startKST.getTime() - 9 * 60 * 60 * 1000);
      }
      if (endKST) {
        endDateUTC = new Date(endKST.getTime() - 9 * 60 * 60 * 1000);
      }

      let query = supabase
        .from('orders')
        .select('*, order_items(*, products(id, title, front_image))')
        .eq('status', '결제완료');

      if (startDateUTC) {
        query = query.gte('created_at', startDateUTC.toISOString());
      }
      
      if (endDateUTC) {
        query = query.lte('created_at', endDateUTC.toISOString());
      }

      const { data: orders, error } = await query;

      if (error) throw error;

      const aggregation: Record<string, { count: number; revenue: number; isWorkshop: boolean; image: string }> = {};

      orders?.forEach(order => {
        const items = order.order_items || [];

        items.forEach((item: any) => {
          const name = item.products?.title || '상품 정보 없음';
          const quantity = Number(item.quantity) || 1;
          const price = Number(item.price) || 0;
          const revenue = quantity * price;
          
          const isWorkshop = !item.product_id || 
                            name.includes('커스텀') || 
                            name.includes('Workshop') || 
                            name.includes('Atelier') ||
                            name === '커스텀 작품(Workshop)' ||
                            !!item.user_image_url;

          const productImage = item.user_image_url || item.products?.front_image || '';

          if (!aggregation[name]) {
            aggregation[name] = { count: 0, revenue: 0, isWorkshop, image: productImage };
          }
          
          aggregation[name].count += quantity;
          aggregation[name].revenue += revenue;

          if (!aggregation[name].image && productImage) {
            aggregation[name].image = productImage;
          }
        });
      });

      const sorted = Object.entries(aggregation)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.count - a.count || b.revenue - a.revenue);

      setData(sorted);
    } catch (error) {
      console.error('Fetch best sellers error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (period !== 'custom') {
      fetchBestSellers();
    }
  }, [period]);

  const handleCustomSearch = () => {
    if (!startDateInput || !endDateInput) {
      alert('시작일과 종료일을 모두 선택해주세요.');
      return;
    }

    const start = new Date(startDateInput);
    const end = new Date(endDateInput);
    
    if (end < start) {
      alert('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    // Set end of day for end date
    end.setHours(23, 59, 59, 999);

    setAppliedRange({ start, end });
    setPeriod('custom');
    // We need to call fetchBestSellers manually here because period might already be 'custom'
    // or we can use a separate useEffect for appliedRange
  };

  useEffect(() => {
    if (period === 'custom' && appliedRange) {
      fetchBestSellers();
    }
  }, [appliedRange]);

  const handleQuickFilter = (p: Period) => {
    setPeriod(p);
    setStartDateInput('');
    setEndDateInput('');
    setAppliedRange(null);
  };

  const reportTitle = useMemo(() => {
    if (period === 'today') return '오늘의 실적 리포트';
    if (period === 'month') return '이번 달 실적 리포트';
    if (period === 'year') return '올해 실적 리포트';
    if (period === 'all') return '전체 실적 리포트';
    if (period === 'custom' && appliedRange) {
      const startStr = appliedRange.start.toLocaleDateString('ko-KR').replace(/\. /g, '.').replace(/\.$/, '');
      const endStr = appliedRange.end.toLocaleDateString('ko-KR').replace(/\. /g, '.').replace(/\.$/, '');
      return `${startStr} ~ ${endStr} 실적 리포트`;
    }
    return '실적 리포트';
  }, [period, appliedRange]);

  const totalSalesCount = useMemo(() => data.reduce((sum, item) => sum + item.count, 0), [data]);
  const maxSalesCount = useMemo(() => Math.max(...data.map(item => item.count), 1), [data]);

  return (
    <AdminLayout>
      <div className="space-y-10 pb-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                <Flame size={24} />
              </div>
              <h2 className="text-3xl font-black text-white tracking-tighter">인기 판매 제품</h2>
            </div>
            <p className="text-zinc-500 font-bold tracking-tight">기간별 판매 성과 및 선호도 분석</p>
          </div>

          {/* Period Filter */}
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex p-1.5 bg-zinc-900/80 rounded-2xl border border-white/10 backdrop-blur-xl">
              {(['today', 'month', 'year', 'all'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handleQuickFilter(p)}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
                    period === p 
                      ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]' 
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  {p === 'today' ? '오늘' : p === 'month' ? '이번 달' : p === 'year' ? '올해' : '전체'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 p-1.5 bg-zinc-900/80 rounded-2xl border border-white/10 backdrop-blur-xl">
              <div className="flex items-center gap-2 px-3">
                <input 
                  type="date" 
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="bg-transparent text-white text-xs font-bold outline-none border-b border-white/10 focus:border-purple-500 transition-colors py-1 [color-scheme:dark]"
                />
                <span className="text-zinc-600 text-xs font-black">~</span>
                <input 
                  type="date" 
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  className="bg-transparent text-white text-xs font-bold outline-none border-b border-white/10 focus:border-purple-500 transition-colors py-1 [color-scheme:dark]"
                />
              </div>
              <button
                onClick={handleCustomSearch}
                disabled={loading}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#0A0A0A] p-8 rounded-[32px] border border-white/5 shadow-xl relative overflow-hidden group">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/5 blur-3xl rounded-full group-hover:bg-purple-500/10 transition-all duration-700" />
            <div className="flex items-center gap-4 mb-6 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                <TrendingUp size={24} />
              </div>
              <span className="text-zinc-400 font-black text-lg tracking-tight">총 판매 수량</span>
            </div>
            <div className="text-4xl font-black text-white tracking-tighter relative z-10">
              {totalSalesCount.toLocaleString()}<span className="text-xl text-zinc-500 ml-1">건</span>
            </div>
          </div>

          <div className="bg-[#0A0A0A] p-8 rounded-[32px] border border-white/5 shadow-xl relative overflow-hidden group">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full group-hover:bg-emerald-500/10 transition-all duration-700" />
            <div className="flex items-center gap-4 mb-6 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                <DollarSign size={24} />
              </div>
              <span className="text-zinc-400 font-black text-lg tracking-tight">총 판매 금액</span>
            </div>
            <div className="text-4xl font-black text-white tracking-tighter relative z-10">
              <span className="text-2xl text-zinc-500 mr-1">₩</span>
              {data.reduce((sum, item) => sum + item.revenue, 0).toLocaleString()}
            </div>
          </div>

          <div className="bg-[#0A0A0A] p-8 rounded-[32px] border border-white/5 shadow-xl relative overflow-hidden group">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full group-hover:bg-blue-500/10 transition-all duration-700" />
            <div className="flex items-center gap-4 mb-6 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                <Package size={24} />
              </div>
              <span className="text-zinc-400 font-black text-lg tracking-tight">분석된 제품 수</span>
            </div>
            <div className="text-4xl font-black text-white tracking-tighter relative z-10">
              {data.length}<span className="text-xl text-zinc-500 ml-1">종</span>
            </div>
          </div>
        </div>

        {/* Best Sellers List */}
        <div className="bg-[#0A0A0A] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
          <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
              <Flame size={20} className="text-purple-500" />
              {reportTitle}
            </h3>
            <div className="flex items-center gap-2 text-[10px] font-black text-zinc-600 uppercase tracking-widest">
              <Calendar size={14} />
              <span>{new Date().toLocaleDateString()} 기준</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-900/30">
                  <th className="px-8 py-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Rank</th>
                  <th className="px-8 py-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Product Info & Popularity</th>
                  <th className="px-8 py-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-8 py-8"><div className="h-6 bg-zinc-900 rounded-lg w-8" /></td>
                      <td className="px-8 py-8"><div className="h-10 bg-zinc-900 rounded-lg w-full" /></td>
                      <td className="px-8 py-8"><div className="h-6 bg-zinc-900 rounded-lg w-32 ml-auto" /></td>
                    </tr>
                  ))
                ) : data.length > 0 ? (
                  data.map((item, index) => {
                    const rank = index + 1;
                    const intensity = (item.count / maxSalesCount) * 100;
                    
                    return (
                      <motion.tr 
                        key={item.name}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-8 py-8">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                            rank === 1 ? 'bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]' :
                            rank === 2 ? 'bg-zinc-800 text-zinc-300' :
                            rank === 3 ? 'bg-zinc-900 text-zinc-500' :
                            'text-zinc-600'
                          }`}>
                            {rank}
                          </div>
                        </td>
                        <td className="px-8 py-8">
                          <div className="flex items-center gap-4">
                            <div 
                              onClick={() => {
                                const url = getFullImageUrl(item.image, item.isWorkshop);
                                if (url) handleDownload(url, `${item.name}.png`);
                              }}
                              className="relative w-16 h-16 rounded-2xl overflow-hidden border border-white/10 group-hover:border-purple-500/50 transition-all flex-shrink-0 cursor-pointer"
                            >
                              {item.image ? (
                                <>
                                  <img 
                                    src={getFullImageUrl(item.image, item.isWorkshop)} 
                                    alt={item.name}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Download size={16} className="text-white" />
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800">
                                  <Package size={24} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-4">
                                <div className="text-white font-black text-lg tracking-tight group-hover:text-purple-400 transition-colors truncate">
                                  {item.name}
                                </div>
                                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest whitespace-nowrap">
                                  {Math.round(intensity)}%
                                </div>
                              </div>
                              <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden mt-2 border border-white/5">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${intensity}%` }}
                                  transition={{ duration: 1, delay: index * 0.1 }}
                                  className={`h-full rounded-full ${
                                    rank === 1 ? 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]' :
                                    rank <= 3 ? 'bg-purple-700' : 'bg-zinc-700'
                                  }`}
                                />
                              </div>
                              <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-1">
                                {item.isWorkshop ? 'Workshop Item' : 'Standard Product'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-8 text-right">
                          <div className="flex flex-col items-end">
                            <div className="text-white font-black text-xl tracking-tighter">
                              {item.count.toLocaleString()}<span className="text-xs text-zinc-500 ml-1">건</span>
                            </div>
                            <div className="text-zinc-500 font-mono text-xs mt-1">
                              ₩{item.revenue.toLocaleString()}
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="px-8 py-32 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-700">
                          <Flame size={32} />
                        </div>
                        <p className="text-zinc-500 font-bold">해당 기간에는 판매 데이터가 없습니다.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
