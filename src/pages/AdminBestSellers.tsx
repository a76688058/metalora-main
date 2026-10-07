import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, TrendingUp, Package, DollarSign,
  Calendar, Search, Download,
  Award, BarChart3, RefreshCcw
} from 'lucide-react';
import { getFullImageUrl } from '../lib/utils';
import { useWorkshopMediaDisplay } from '../hooks/useWorkshopMediaDisplay';
import {
  BEST_SELLER_ERROR_MESSAGE,
  bestSellerQueryKey,
  fetchBestSellerReport,
  validateCustomRange,
  type BestSellerCustomRange,
  type BestSellerItem,
  type BestSellerPeriod,
} from '../components/admin/adminBestSellers';

type LoadState = 'loading' | 'ready' | 'error';

const PERIOD_TABS: Array<{ value: Exclude<BestSellerPeriod, 'custom'>; label: string }> = [
  { value: 'today', label: '오늘' },
  { value: 'week', label: '이번 주' },
  { value: 'month', label: '이번 달' },
  { value: 'year', label: '올해' },
  { value: 'all', label: '전체' },
];

/**
 * Workshop srcs are temporary signed URLs: fetched without referrer or credentials and never
 * opened in a tab, so they do not reach navigation or history.
 */
const downloadImage = async (url: string, filename: string, workshop = false) => {
  try {
    const response = workshop
      ? await fetch(url, { referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store' })
      : await fetch(url);
    if (workshop && !response.ok) return;
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || 'product-image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    if (!workshop) window.open(url, '_blank');
  }
};

function StatCard({
  title,
  value,
  unit,
  icon: Icon,
  colorClass,
  delay = 0,
  loading,
}: {
  title: string;
  value: number | null;
  unit: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  colorClass: string;
  delay?: number;
  loading: boolean;
}) {
  return (
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
        {loading ? (
          <span className="inline-block h-9 w-24 rounded-xl bg-zinc-800/80 animate-pulse" aria-busy="true" aria-label="불러오는 중" />
        ) : value == null ? (
          <span className="text-zinc-500">—</span>
        ) : (
          <>
            {value.toLocaleString()}
            <span className="text-sm sm:text-lg text-zinc-600 font-bold">{unit}</span>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default function AdminBestSellers() {
  const [period, setPeriod] = useState<BestSellerPeriod>('month');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [appliedRange, setAppliedRange] = useState<BestSellerCustomRange | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [items, setItems] = useState<BestSellerItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const requestGenRef = useRef(0);
  const mountedRef = useRef(true);

  const queryKey = bestSellerQueryKey(period, appliedRange);
  const rankingVisible = loadState === 'ready' && loadedKey === queryKey;
  const displayedItems = rankingVisible ? items : [];
  const workshopMedia = useWorkshopMediaDisplay(
    displayedItems.filter((item) => item.isWorkshop).map((item) => item.image),
    'admin',
  );

  const loadReport = useCallback(async (targetPeriod: BestSellerPeriod, custom: BestSellerCustomRange | null) => {
    if (targetPeriod === 'custom' && (!custom || validateCustomRange(custom.start, custom.end))) return;
    const generation = ++requestGenRef.current;
    const key = bestSellerQueryKey(targetPeriod, custom);
    setLoadState('loading');
    const { data, error } = await fetchBestSellerReport({ period: targetPeriod, custom });
    if (!mountedRef.current || generation !== requestGenRef.current) return;
    if (error || !data) {
      setItems([]);
      setLoadedKey(null);
      setLoadState('error');
      return;
    }
    setItems(data);
    setLoadedKey(key);
    setLoadState('ready');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    void loadReport(period, appliedRange);
  }, [period, appliedRange, loadReport]);

  const handlePeriodSelect = (next: Exclude<BestSellerPeriod, 'custom'>) => {
    setDateError(null);
    setAppliedRange(null);
    setPeriod(next);
  };

  const handleCustomSearch = () => {
    const message = validateCustomRange(dateRange.start, dateRange.end);
    if (message) {
      setDateError(message);
      return;
    }
    setDateError(null);
    setAppliedRange({ start: dateRange.start, end: dateRange.end });
    setPeriod('custom');
  };

  const stats = useMemo(() => ({
    totalCount: displayedItems.reduce((sum, item) => sum + item.count, 0),
    totalRevenue: displayedItems.reduce((sum, item) => sum + item.revenue, 0),
    productCount: displayedItems.length,
    maxCount: Math.max(...displayedItems.map((item) => item.count), 1),
  }), [displayedItems]);

  const reportTitle = useMemo(() => {
    const titles = { today: '오늘', week: '이번 주', month: '이번 달', year: '올해', all: '전체' };
    if (period === 'custom' && appliedRange) {
      return `${appliedRange.start} ~ ${appliedRange.end}`;
    }
    return titles[period as keyof typeof titles] || '';
  }, [period, appliedRange]);

  return (
    <AdminLayout>
      <div className="max-w-[1400px] mx-auto space-y-8 pb-20 px-4 sm:px-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-[#0A0A0A] p-6 sm:p-8 rounded-[32px] border border-white/5 shadow-2xl">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white shadow-xl shadow-purple-500/20 ring-1 ring-white/20 flex-shrink-0">
              <Award className="w-6 h-6 sm:w-8 sm:h-8" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">인기 판매 제품</h2>
              <p className="text-zinc-500 font-medium mt-1 text-sm sm:text-base">기간별 판매 집계 리포트</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex p-1 bg-zinc-900/60 rounded-xl border border-white/5 overflow-x-auto no-scrollbar" role="tablist" aria-label="집계 기간">
              {PERIOD_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={period === tab.value}
                  onClick={() => handlePeriodSelect(tab.value)}
                  className={`px-4 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all duration-200 ${
                    period === tab.value ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/60 rounded-xl border border-white/5">
                <label htmlFor="admin-best-seller-start" className="sr-only">시작일</label>
                <input
                  id="admin-best-seller-start"
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => {
                    setDateRange((prev) => ({ ...prev, start: e.target.value }));
                    setDateError(null);
                  }}
                  aria-invalid={Boolean(dateError)}
                  aria-describedby={dateError ? 'admin-best-seller-date-error' : undefined}
                  className="bg-transparent text-white text-[10px] font-bold outline-none [color-scheme:dark] w-24"
                />
                <span className="text-zinc-700 text-[10px]">~</span>
                <label htmlFor="admin-best-seller-end" className="sr-only">종료일</label>
                <input
                  id="admin-best-seller-end"
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => {
                    setDateRange((prev) => ({ ...prev, end: e.target.value }));
                    setDateError(null);
                  }}
                  aria-invalid={Boolean(dateError)}
                  aria-describedby={dateError ? 'admin-best-seller-date-error' : undefined}
                  className="bg-transparent text-white text-[10px] font-bold outline-none [color-scheme:dark] w-24"
                />
                <button
                  type="button"
                  onClick={handleCustomSearch}
                  aria-label="사용자 지정 기간 조회"
                  className="p-1.5 bg-purple-600 rounded-lg text-white hover:bg-purple-500 transition-colors"
                >
                  <Search size={14} aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => { void loadReport(period, appliedRange); }}
                aria-label="다시 불러오기"
                className="p-2.5 bg-zinc-900/60 rounded-xl border border-white/5 text-zinc-500 hover:text-white transition-colors"
              >
                <RefreshCcw size={18} className={loadState === 'loading' ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {dateError && (
          <p id="admin-best-seller-date-error" className="text-sm text-red-400 font-medium" role="alert">
            {dateError}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <StatCard title="총 판매 수량" value={rankingVisible ? stats.totalCount : null} unit="건" icon={TrendingUp} colorClass="bg-purple-500" delay={0.1} loading={loadState === 'loading' || (loadState === 'ready' && loadedKey !== queryKey)} />
          <StatCard title="총 판매 금액" value={rankingVisible ? stats.totalRevenue : null} unit="원" icon={DollarSign} colorClass="bg-emerald-500" delay={0.2} loading={loadState === 'loading' || (loadState === 'ready' && loadedKey !== queryKey)} />
          <StatCard title="분석된 제품 수" value={rankingVisible ? stats.productCount : null} unit="종" icon={Package} colorClass="bg-blue-500" delay={0.3} loading={loadState === 'loading' || (loadState === 'ready' && loadedKey !== queryKey)} />
        </div>

        <div className="bg-[#0A0A0A] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
          <div className="p-6 sm:p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                <BarChart3 size={20} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  <span className="text-purple-500 mr-2">{reportTitle}</span>
                  판매 랭킹
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/40 rounded-full border border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              <Calendar size={14} className="text-purple-500" aria-hidden="true" />
              <span>{new Date().toLocaleDateString('ko-KR')} 기준</span>
            </div>
          </div>

          <div className="p-4 sm:p-8">
            <div className="space-y-4">
              <AnimatePresence mode="wait">
                {loadState === 'loading' || (loadState === 'ready' && loadedKey !== queryKey) ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-24 bg-zinc-900/40 rounded-2xl animate-pulse border border-white/5" />
                  ))
                ) : loadState === 'error' ? (
                  <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-[32px]">
                    <p className="text-xl font-bold text-white">{BEST_SELLER_ERROR_MESSAGE}</p>
                    <button
                      type="button"
                      onClick={() => { void loadReport(period, appliedRange); }}
                      className="mt-4 min-h-11 px-4 rounded-lg bg-zinc-800 text-white"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : displayedItems.length > 0 ? (
                  displayedItems.map((item, index) => {
                    const rank = index + 1;
                    const percentage = (item.count / stats.maxCount) * 100;
                    const imageUrl = item.isWorkshop
                      ? workshopMedia.get(item.image).src
                      : getFullImageUrl(item.image);

                    return (
                      <motion.div
                        key={item.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group relative bg-zinc-900/20 hover:bg-white/[0.03] p-4 sm:p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center gap-6"
                      >
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-black text-lg sm:text-xl flex-shrink-0 ${
                          rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-orange-600 text-white shadow-lg shadow-orange-500/20' :
                          rank === 2 ? 'bg-zinc-800 text-zinc-300' :
                          rank === 3 ? 'bg-zinc-900 text-zinc-500' :
                          'bg-transparent text-zinc-700'
                        }`}>
                          {rank}
                        </div>

                        <div className="flex-1 flex items-center gap-4 sm:gap-6 w-full min-w-0">
                          <div
                            role={imageUrl ? 'button' : undefined}
                            tabIndex={imageUrl ? 0 : undefined}
                            onClick={() => {
                              if (imageUrl) void downloadImage(imageUrl, `${item.name}.png`, item.isWorkshop);
                            }}
                            onKeyDown={(event) => {
                              if (!imageUrl) return;
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                void downloadImage(imageUrl, `${item.name}.png`, item.isWorkshop);
                              }
                            }}
                            className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0 cursor-pointer group-hover:border-purple-500/30 transition-all"
                          >
                            {imageUrl ? (
                              <>
                                <img
                                  src={imageUrl}
                                  alt=""
                                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                  referrerPolicy="no-referrer"
                                  onError={item.isWorkshop ? () => void workshopMedia.onLoadError(item.image, imageUrl) : undefined}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Download size={18} className="text-white" aria-hidden="true" />
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800">
                                <Package size={24} aria-hidden="true" />
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

                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                <span>판매 비중</span>
                                <span>{Math.round(percentage)}%</span>
                              </div>
                              <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percentage}%` }}
                                  transition={{ duration: 1.5, ease: 'easeOut' }}
                                  className={`h-full rounded-full ${
                                    rank === 1 ? 'bg-gradient-to-r from-purple-600 to-blue-500' : 'bg-zinc-700'
                                  }`}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

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
                        <Flame size={32} aria-hidden="true" />
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
    </AdminLayout>
  );
}
