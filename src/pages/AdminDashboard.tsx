import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { Package, ShoppingBag, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Calendar as CalendarIcon, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  DASHBOARD_ERROR_MESSAGE,
  fetchDashboardCalendar,
  fetchDashboardDayReport,
  fetchDashboardProductCount,
  fetchDashboardRangeStats,
  fetchDashboardTrend,
  kstMonthKey,
  dashboardComparePeriodLabel,
  type DashboardCalendarDay,
  type DashboardComparison,
  type DashboardDayReport,
  type DashboardRangeType,
  type DashboardStats,
  type DashboardTrendPoint,
} from '../components/admin/adminDashboard';

type LoadState = 'loading' | 'ready' | 'error';

function CountUp({ value, prefix = '', suffix = '', className = '' }: { value: number, prefix?: string, suffix?: string, className?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest).toLocaleString());

  useEffect(() => {
    const animation = animate(count, value, {
      duration: 1.5,
      ease: [0.16, 1, 0.3, 1],
    });
    return animation.stop;
  }, [count, value]);

  return (
    <span className={`flex items-baseline gap-1 ${className}`}>
      {prefix && <span className="text-2xl md:text-3xl font-medium text-zinc-500 mr-1">{prefix}</span>}
      <motion.span>{rounded}</motion.span>
      {suffix && <span className="text-2xl md:text-3xl font-medium text-zinc-500 ml-1">{suffix}</span>}
    </span>
  );
}

function MetricValue({
  state,
  value,
  prefix,
  suffix,
  className,
}: {
  state: LoadState;
  value: number | null;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  if (value == null) {
    if (state === 'error') {
      return <span className="text-2xl md:text-3xl font-black text-zinc-500">—</span>;
    }
    return (
      <span
        className="inline-block h-12 w-44 max-w-full rounded-xl bg-zinc-800/80 animate-pulse"
        aria-busy="true"
        aria-label="불러오는 중"
      />
    );
  }
  return <CountUp value={value} prefix={prefix} suffix={suffix} className={className} />;
}

function ComparisonIndicator({
  range,
  comparison,
}: {
  range: DashboardRangeType;
  comparison: DashboardComparison;
}) {
  const period = dashboardComparePeriodLabel(range);

  if (comparison.kind === 'flat') {
    return (
      <div className="flex items-center gap-3 text-lg font-black mt-4 text-zinc-500">
        <span className="tracking-tight">변동 없음</span>
      </div>
    );
  }

  if (comparison.kind === 'new') {
    return (
      <div className="flex items-center gap-3 text-lg font-black mt-4 text-zinc-400">
        <span className="tracking-tight">{period} 신규 매출 발생</span>
      </div>
    );
  }

  const isUp = comparison.kind === 'up';
  return (
    <div className={`flex items-center gap-3 text-lg font-black mt-4 ${isUp ? 'text-purple-400' : 'text-blue-400'}`}>
      <div className={`p-1.5 rounded-lg ${isUp ? 'bg-purple-500/10' : 'bg-blue-500/10'}`}>
        {isUp ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
      </div>
      <span className="tracking-tight">
        {period} {comparison.percent}% {isUp ? '상승' : '감소'}
      </span>
    </div>
  );
}

function RetryButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 min-h-11 px-4 rounded-lg bg-zinc-800 text-white text-sm font-bold"
    >
      {label ?? '다시 시도'}
    </button>
  );
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0F0F0F] border border-white/10 p-4 rounded-2xl shadow-2xl backdrop-blur-xl">
        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">{label}</p>
        <p className="text-white font-black text-lg tracking-tighter">
          ₩{(payload[0].value ?? 0).toLocaleString()}
        </p>
        <p className="text-purple-400 text-xs font-bold mt-1">
          {payload[1]?.value || 0}건의 주문
        </p>
      </div>
    );
  }
  return null;
};

const SalesTrendChart = React.memo(({ data }: { data: DashboardTrendPoint[] }) => {
  return (
    <div className="h-[350px] w-full mt-8">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1F1F1F" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#525252', fontSize: 10, fontWeight: 900 }}
            dy={10}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#A855F7"
            strokeWidth={4}
            fillOpacity={1}
            fill="url(#colorRevenue)"
            animationDuration={2000}
          />
          <Area
            type="monotone"
            dataKey="orders"
            stroke="transparent"
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

const RevenueCalendar = React.memo(({
  data,
  currentMonth,
  onMonthChange,
  onDateClick,
  loadState,
  onRetry,
}: {
  data: Record<string, DashboardCalendarDay> | null,
  currentMonth: Date,
  onMonthChange: (date: Date) => void,
  onDateClick: (date: string) => void,
  loadState: LoadState,
  onRetry: () => void,
}) => {
  const kstCurrentMonth = new Date(currentMonth.getTime() + 9 * 60 * 60 * 1000);
  const currentYear = kstCurrentMonth.getUTCFullYear();
  const currentMonthNum = kstCurrentMonth.getUTCMonth();

  const daysInMonth = new Date(Date.UTC(currentYear, currentMonthNum + 1, 0)).getUTCDate();
  const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonthNum, 1)).getUTCDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const maxRevenue = useMemo(() => {
    const values = Object.values(data ?? {}).map(d => d.revenue);
    return Math.max(...values, 1);
  }, [data]);

  const today = new Date();
  const kstToday = new Date(today.getTime() + 9 * 60 * 60 * 1000);
  const todayKey = `${kstToday.getUTCFullYear()}-${String(kstToday.getUTCMonth() + 1).padStart(2, '0')}-${String(kstToday.getUTCDate()).padStart(2, '0')}`;

  const getIntensity = (rev: number) => {
    if (rev === 0) return 'bg-zinc-900/40 text-zinc-600 hover:bg-zinc-800/60';
    const ratio = rev / maxRevenue;

    if (ratio > 0.8) return 'bg-gradient-to-br from-purple-400 to-purple-600 text-white shadow-[0_0_25px_rgba(168,85,247,0.5)] z-10';
    if (ratio > 0.5) return 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]';
    if (ratio > 0.2) return 'bg-purple-700/80 text-purple-100';
    return 'bg-purple-900/40 text-purple-300';
  };

  return (
    <div className="bg-[#0A0A0A]/80 border border-white/5 rounded-[40px] p-8 md:p-10 shadow-2xl flex flex-col h-full backdrop-blur-3xl relative overflow-hidden">
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-purple-600/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex items-center justify-between mb-10 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 shadow-inner">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">매출 캘린더</h3>
            <p className="text-[10px] font-black text-zinc-500 tracking-widest uppercase">Revenue Heatmap</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-zinc-900/50 p-1 rounded-2xl border border-white/5 backdrop-blur-xl">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => {
              const next = new Date(currentMonth);
              next.setMonth(next.getMonth() - 1);
              onMonthChange(next);
            }}
            className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all active:scale-90"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-black text-white px-4 min-w-[100px] text-center tracking-tighter">
            {currentYear}. {String(currentMonthNum + 1).padStart(2, '0')}
          </span>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => {
              const next = new Date(currentMonth);
              next.setMonth(next.getMonth() + 1);
              onMonthChange(next);
            }}
            className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all active:scale-90"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loadState === 'error' ? (
        <div className="relative z-10 py-16 text-center">
          <p className="text-white font-medium">캘린더를 불러오지 못했습니다.</p>
          <RetryButton onClick={onRetry} />
        </div>
      ) : loadState === 'loading' || !data ? (
        <div className="grid grid-cols-7 gap-2 md:gap-3 relative z-10" aria-busy="true" aria-label="캘린더 불러오는 중">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
            <div key={d} className="text-center text-[9px] font-black text-zinc-700 mb-2 tracking-widest">{d}</div>
          ))}
          {Array.from({ length: 35 }, (_, i) => (
            <div key={`sk-${i}`} className="aspect-square rounded-xl md:rounded-2xl bg-zinc-900/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-2 md:gap-3 mb-4 relative z-10">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
              <div key={d} className="text-center text-[9px] font-black text-zinc-700 mb-2 tracking-widest">{d}</div>
            ))}
            {blanks.map(b => <div key={`blank-${b}`} />)}
            {days.map(d => {
              const dateKey = `${currentYear}-${String(currentMonthNum + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dayData = data[dateKey] || { revenue: 0, orders: 0 };
              const isToday = dateKey === todayKey;

              return (
                <motion.button
                  key={d}
                  type="button"
                  whileHover={{ scale: 1.08, zIndex: 30 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onDateClick(dateKey);
                  }}
                  className={`aspect-square rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 transition-all relative border-2 ${
                    isToday ? 'border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'border-transparent'
                  } ${getIntensity(dayData.revenue)}`}
                >
                  <span className={`text-xs md:text-sm font-black ${isToday ? 'text-white' : ''}`}>{d}</span>
                  {dayData.revenue > 0 && (
                    <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                  )}
                  {isToday && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full border-2 border-[#0A0A0A] animate-pulse" />
                  )}
                </motion.button>
              );
            })}
          </div>

          <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-zinc-800" />
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">No Sales</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-purple-900/40" />
              <div className="w-2 h-2 rounded-full bg-purple-700/80" />
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Volume</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

const DailyBottomSheet = React.memo(({
  report,
  onClose,
  loading,
  error,
  onRetry,
}: {
  report: DashboardDayReport | null,
  onClose: () => void,
  loading: boolean,
  error: string | null,
  onRetry: () => void,
}) => {
  if (!report && !loading && !error) return null;

  return (
    <div className="fixed inset-0 w-screen h-screen h-[100dvh] z-[100] flex items-end justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-2xl bg-[#0F0F0F] border-t border-white/10 rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
      >
        <div className="w-full flex justify-center pt-4 pb-2">
          <div className="w-12 h-1.5 bg-zinc-800 rounded-full" />
        </div>

        <div className="p-8 md:p-12">
          {loading ? (
            <div className="space-y-8 animate-pulse">
              <div className="h-8 bg-zinc-900 rounded-xl w-1/2" />
              <div className="h-24 bg-zinc-900 rounded-[32px] w-full" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-20 bg-zinc-900 rounded-2xl" />
                <div className="h-20 bg-zinc-900 rounded-2xl" />
              </div>
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-white font-medium">{error}</p>
              <RetryButton onClick={onRetry} />
              <button
                type="button"
                onClick={onClose}
                className="mt-4 w-full py-5 bg-white text-black font-black rounded-2xl hover:bg-zinc-200 transition-all active:scale-[0.98]"
              >
                닫기
              </button>
            </div>
          ) : report && (
            <div className="space-y-10">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-zinc-500 text-xs font-black uppercase tracking-[0.2em] mb-2">Daily Performance Report</h4>
                  <h3 className="text-2xl md:text-3xl font-black text-white tracking-tighter">
                    {new Date(report.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 실적
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                >
                  <ChevronRight className="rotate-90" size={20} />
                </button>
              </div>

              <div className="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 rounded-[32px] p-8 md:p-10 relative overflow-hidden group">
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-500/10 blur-3xl rounded-full group-hover:bg-purple-500/20 transition-all duration-1000" />
                <div className="relative z-10">
                  <span className="text-purple-400 text-[10px] font-black uppercase tracking-widest block mb-4">Total Revenue</span>
                  <div className="text-5xl md:text-6xl font-black text-white tracking-tighter flex items-baseline gap-2">
                    <span className="text-3xl text-zinc-500 font-medium">₩</span>
                    {report.totalRevenue.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <ShoppingBag size={24} />
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1">Orders</span>
                    <span className="text-white font-black text-xl tracking-tighter">{report.orderCount}건</span>
                  </div>
                </div>

                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                    <Package size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1">Top Item</span>
                    <div className="flex flex-col">
                      <span className="text-white font-black text-lg tracking-tighter truncate flex items-center gap-2">
                        {report.topItem ? (
                          <>
                            <span className="text-xl">{report.topItem.isWorkshop ? '🎨' : '📦'}</span>
                            <span className="text-purple-400 truncate">{report.topItem.name}</span>
                          </>
                        ) : '데이터 없음'}
                      </span>
                      {report.topItem && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-zinc-400 text-xs font-bold">{report.topItem.count}건 판매</span>
                          <span className="text-zinc-600 text-[10px]">•</span>
                          <span className="text-zinc-400 text-xs font-mono">₩{report.topItem.revenue.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-5 bg-white text-black font-black rounded-2xl hover:bg-zinc-200 transition-all active:scale-[0.98] shadow-[0_20px_40px_rgba(255,255,255,0.1)]"
                >
                  확인 완료
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
});

export default function AdminDashboard() {
  const [range, setRange] = useState<DashboardRangeType>('daily');
  const [statsCache, setStatsCache] = useState<Record<DashboardRangeType, DashboardStats | null>>({
    daily: null,
    monthly: null,
    yearly: null,
  });
  const statsCacheRef = useRef(statsCache);
  const [statsState, setStatsState] = useState<LoadState>('loading');

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState<Record<string, DashboardCalendarDay> | null>(null);
  const [calendarMonthLoaded, setCalendarMonthLoaded] = useState<string | null>(null);
  const [calendarState, setCalendarState] = useState<LoadState>('loading');

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<DashboardDayReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const [trendData, setTrendData] = useState<DashboardTrendPoint[] | null>(null);
  const [trendState, setTrendState] = useState<LoadState>('loading');

  const [totalProducts, setTotalProducts] = useState<number | null>(null);
  const [productState, setProductState] = useState<LoadState>('loading');

  const statsGenRef = useRef(0);
  const calendarGenRef = useRef(0);
  const trendGenRef = useRef(0);
  const productGenRef = useRef(0);
  const reportGenRef = useRef(0);

  statsCacheRef.current = statsCache;

  const displayedStats = statsCache[range];
  const rangeLabel = range === 'daily' ? '오늘의' : range === 'monthly' ? '이번 달' : '올해';
  const aov = displayedStats && displayedStats.ordersCount > 0
    ? Math.round(displayedStats.revenue / displayedStats.ordersCount)
    : displayedStats
      ? 0
      : null;
  const calendarReadyData = calendarState === 'ready' && calendarMonthLoaded === kstMonthKey(calendarMonth)
    ? calendarData
    : null;
  const calendarViewState: LoadState = calendarReadyData ? 'ready' : calendarState === 'error' ? 'error' : 'loading';

  const loadStats = useCallback(async (targetRange: DashboardRangeType, forceRefresh = false) => {
    const generation = ++statsGenRef.current;
    if (!forceRefresh && statsCacheRef.current[targetRange]) {
      setStatsState('ready');
      return;
    }
    if (forceRefresh) {
      statsCacheRef.current = { ...statsCacheRef.current, [targetRange]: null };
      setStatsCache((prev) => ({ ...prev, [targetRange]: null }));
    }
    setStatsState('loading');
    const { data, error } = await fetchDashboardRangeStats(targetRange);
    if (generation !== statsGenRef.current) return;
    if (error || !data) {
      statsCacheRef.current = { ...statsCacheRef.current, [targetRange]: null };
      setStatsCache((prev) => ({ ...prev, [targetRange]: null }));
      setStatsState('error');
      return;
    }
    const nextCache = { ...statsCacheRef.current, [targetRange]: data };
    statsCacheRef.current = nextCache;
    setStatsCache(nextCache);
    setStatsState('ready');
  }, []);

  const loadCalendar = useCallback(async (month: Date) => {
    const generation = ++calendarGenRef.current;
    const monthKey = kstMonthKey(month);
    setCalendarState('loading');
    setCalendarData(null);
    setCalendarMonthLoaded(null);
    const { data, error } = await fetchDashboardCalendar(month);
    if (generation !== calendarGenRef.current) return;
    if (error || !data) {
      setCalendarState('error');
      return;
    }
    setCalendarData(data);
    setCalendarMonthLoaded(monthKey);
    setCalendarState('ready');
  }, []);

  const loadTrend = useCallback(async () => {
    const generation = ++trendGenRef.current;
    setTrendState('loading');
    const { data, error } = await fetchDashboardTrend();
    if (generation !== trendGenRef.current) return;
    if (error || !data) {
      setTrendData(null);
      setTrendState('error');
      return;
    }
    setTrendData(data);
    setTrendState('ready');
  }, []);

  const loadProducts = useCallback(async () => {
    const generation = ++productGenRef.current;
    setProductState('loading');
    const { count, error } = await fetchDashboardProductCount();
    if (generation !== productGenRef.current) return;
    if (error || count === null) {
      setTotalProducts(null);
      setProductState('error');
      return;
    }
    setTotalProducts(count);
    setProductState('ready');
  }, []);

  const loadDailyReport = useCallback(async (dateKey: string) => {
    const generation = ++reportGenRef.current;
    setSelectedDateKey(dateKey);
    setLoadingReport(true);
    setSelectedReport(null);
    setReportError(null);
    const { data, error } = await fetchDashboardDayReport(dateKey);
    if (generation !== reportGenRef.current) return;
    setLoadingReport(false);
    if (error || !data) {
      setReportError(error ?? DASHBOARD_ERROR_MESSAGE);
      return;
    }
    setSelectedReport(data);
  }, []);

  useEffect(() => {
    void loadStats(range);
  }, [range, loadStats]);

  useEffect(() => {
    void loadCalendar(calendarMonth);
  }, [calendarMonth, loadCalendar]);

  useEffect(() => {
    void loadTrend();
    void loadProducts();
  }, [loadTrend, loadProducts]);

  useEffect(() => {
    return () => {
      statsGenRef.current += 1;
      calendarGenRef.current += 1;
      trendGenRef.current += 1;
      productGenRef.current += 1;
      reportGenRef.current += 1;
    };
  }, []);

  const retryStats = () => {
    void loadStats(range, true);
  };

  const closeReport = () => {
    if (loadingReport) return;
    reportGenRef.current += 1;
    setSelectedDateKey(null);
    setSelectedReport(null);
    setReportError(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-10 pb-20 bg-black min-h-screen">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-4xl font-black text-white tracking-tighter mb-2">대시보드</h2>
            <p className="text-zinc-500 font-bold tracking-tight">매출 · 주문 현황</p>
          </div>
        </div>

        {statsState === 'error' && !displayedStats && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-white font-medium">매출 현황을 불러오지 못했습니다.</p>
            <RetryButton onClick={retryStats} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-2 bg-[#0A0A0A] p-10 md:p-12 rounded-[48px] border border-white/5 shadow-2xl relative overflow-hidden group"
          >
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-full group-hover:bg-purple-600/20 transition-all duration-1000" />

            <div className="relative z-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-3xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 shadow-inner">
                    <BarChart3 size={32} />
                  </div>
                  <div>
                    <span className="text-zinc-400 font-black text-2xl block tracking-tight">
                      {rangeLabel} 매출
                    </span>
                    <span className="text-[10px] text-zinc-600 font-black tracking-[0.3em] uppercase">Revenue & Trend Analysis</span>
                  </div>
                </div>

                <div className="flex p-1.5 bg-zinc-900/80 rounded-2xl border border-white/10 backdrop-blur-xl" role="tablist" aria-label="매출 기간">
                  {(['daily', 'monthly', 'yearly'] as DashboardRangeType[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={range === r}
                      onClick={() => setRange(r)}
                      className={`px-8 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
                        range === r
                          ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                          : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      {r === 'daily' ? '일간' : r === 'monthly' ? '월간' : '연간'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-end" aria-busy={statsState === 'loading' && !displayedStats}>
                <div className="flex flex-col gap-4">
                  <div className="text-6xl md:text-7xl font-black text-white tracking-tighter leading-none">
                    <MetricValue
                      state={statsState}
                      value={displayedStats ? displayedStats.revenue : null}
                      prefix="₩"
                      className="drop-shadow-[0_0_40px_rgba(255,255,255,0.15)]"
                    />
                  </div>

                  {displayedStats ? (
                    <ComparisonIndicator range={range} comparison={displayedStats.comparison} />
                  ) : statsState === 'error' ? (
                    <RetryButton onClick={retryStats} />
                  ) : (
                    <div className="h-8 w-48 rounded-lg bg-zinc-800/80 animate-pulse mt-4" />
                  )}
                </div>

                <div className="hidden md:block">
                  <div className="flex items-center justify-end gap-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                      <span>최근 14일 매출 추이</span>
                    </div>
                  </div>
                </div>
              </div>

              {trendState === 'error' ? (
                <div className="mt-8 py-16 text-center">
                  <p className="text-white font-medium">매출 추이를 불러오지 못했습니다.</p>
                  <RetryButton onClick={() => { void loadTrend(); }} />
                </div>
              ) : trendState === 'loading' || !trendData ? (
                <div className="h-[350px] w-full mt-8 rounded-[32px] bg-zinc-900/60 animate-pulse" aria-busy="true" aria-label="매출 추이 불러오는 중" />
              ) : (
                <SalesTrendChart data={trendData} />
              )}
            </div>
          </motion.div>

          <div className="flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="bg-[#0A0A0A] p-10 rounded-[40px] border border-white/5 shadow-xl flex flex-col justify-between group overflow-hidden relative"
            >
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full group-hover:bg-blue-500/10 transition-all duration-700" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <ShoppingBag size={28} />
                  </div>
                  <div>
                    <span className="text-zinc-400 font-black text-xl tracking-tight block">
                      {rangeLabel} 주문
                    </span>
                    <span className="text-[9px] text-zinc-600 font-black tracking-widest uppercase">Order Volume</span>
                  </div>
                </div>
              </div>
              <div className="text-5xl font-black text-white tracking-tighter mt-8 relative z-10">
                <MetricValue
                  state={statsState}
                  value={displayedStats ? displayedStats.ordersCount : null}
                  suffix="건"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-[#0A0A0A] p-10 rounded-[40px] border border-white/5 shadow-xl flex flex-col justify-between group overflow-hidden relative"
            >
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full group-hover:bg-emerald-500/10 transition-all duration-700" />
              <div className="flex items-center gap-5 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                  <PieChartIcon size={28} />
                </div>
                <div>
                  <span className="text-zinc-400 font-black text-xl tracking-tight block">평균 주문 금액</span>
                  <span className="text-[9px] text-zinc-600 font-black tracking-widest uppercase">Avg. Order Value</span>
                </div>
              </div>
              <div className="text-4xl font-black text-white tracking-tighter mt-8 relative z-10">
                <MetricValue state={statsState} value={aov} prefix="₩" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="bg-[#0A0A0A] p-10 rounded-[40px] border border-white/5 shadow-xl flex flex-col justify-between group overflow-hidden relative"
            >
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-zinc-500/5 blur-3xl rounded-full group-hover:bg-zinc-500/10 transition-all duration-700" />
              <div className="flex items-center gap-5 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-zinc-900 flex items-center justify-center text-zinc-500 border border-white/5">
                  <Package size={28} />
                </div>
                <div>
                  <span className="text-zinc-400 font-black text-xl tracking-tight block">전체 상품</span>
                  <span className="text-[9px] text-zinc-600 font-black tracking-widest uppercase">Inventory Count</span>
                </div>
              </div>
              <div className="text-4xl font-black text-white tracking-tighter mt-8 relative z-10">
                <MetricValue state={productState} value={totalProducts} suffix="개" />
              </div>
              {productState === 'error' && (
                <RetryButton onClick={() => { void loadProducts(); }} />
              )}
            </motion.div>
          </div>
        </div>

        <RevenueCalendar
          data={calendarReadyData}
          currentMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
          onDateClick={loadDailyReport}
          loadState={calendarViewState}
          onRetry={() => { void loadCalendar(calendarMonth); }}
        />

      </div>

      <AnimatePresence mode="sync">
        {(selectedReport || loadingReport || reportError) && (
          <DailyBottomSheet
            key="daily-report-modal"
            report={selectedReport}
            loading={loadingReport}
            error={reportError}
            onRetry={() => {
              if (selectedDateKey) void loadDailyReport(selectedDateKey);
            }}
            onClose={closeReport}
          />
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
