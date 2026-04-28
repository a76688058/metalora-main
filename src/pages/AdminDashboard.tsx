import React, { useEffect, useState, useMemo, useCallback } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { useProducts } from '../context/ProductContext';
import { Package, DollarSign, ShoppingBag, Users, Globe, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Calendar as CalendarIcon, Info, BarChart3, PieChart as PieChartIcon, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion';
import LoadingScreen from '../components/LoadingScreen';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';

type RangeType = 'daily' | 'monthly' | 'yearly';

interface StatsData {
  revenue: number;
  ordersCount: number;
  comparison: { value: number; isIncrease: boolean };
}

function CountUp({ value, prefix = '', suffix = '', className = '' }: { value: number, prefix?: string, suffix?: string, className?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest).toLocaleString());

  useEffect(() => {
    const animation = animate(count, value, { 
      duration: 1.5, 
      ease: [0.16, 1, 0.3, 1], // Custom "Toss-style" ease
    });
    return animation.stop;
  }, [value]);

  return (
    <span className={`flex items-baseline gap-1 ${className}`}>
      {prefix && <span className="text-2xl md:text-3xl font-medium text-zinc-500 mr-1">{prefix}</span>}
      <motion.span>{rounded}</motion.span>
      {suffix && <span className="text-2xl md:text-3xl font-medium text-zinc-500 ml-1">{suffix}</span>}
    </span>
  );
}

interface CalendarDayData {
  revenue: number;
  orders: number;
}

interface DailyReport {
  date: string;
  totalRevenue: number;
  orderCount: number;
  topItem: { 
    name: string; 
    count: number; 
    revenue: number;
    isWorkshop: boolean;
  } | null;
}

interface TrendData {
  date: string;
  revenue: number;
  orders: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0F0F0F] border border-white/10 p-4 rounded-2xl shadow-2xl backdrop-blur-xl">
        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-2">{label}</p>
        <p className="text-white font-black text-lg tracking-tighter">
          ₩{payload[0].value.toLocaleString()}
        </p>
        <p className="text-purple-400 text-xs font-bold mt-1">
          {payload[1]?.value || 0}건의 주문
        </p>
      </div>
    );
  }
  return null;
};

const SalesTrendChart = React.memo(({ data }: { data: TrendData[] }) => {
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
          <YAxis 
            hide 
          />
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
  onDateClick
}: { 
  data: Record<string, CalendarDayData>, 
  currentMonth: Date, 
  onMonthChange: (date: Date) => void,
  onDateClick: (date: string) => void
}) => {
  const kstCurrentMonth = new Date(currentMonth.getTime() + 9 * 60 * 60 * 1000);
  const currentYear = kstCurrentMonth.getUTCFullYear();
  const currentMonthNum = kstCurrentMonth.getUTCMonth();

  const daysInMonth = new Date(Date.UTC(currentYear, currentMonthNum + 1, 0)).getUTCDate();
  const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonthNum, 1)).getUTCDay();
  
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const maxRevenue = useMemo(() => {
    const values = Object.values(data).map(d => d.revenue);
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
      {/* Decorative Glow */}
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
    </div>
  );
});

const DailyBottomSheet = React.memo(({ 
  report, 
  onClose,
  loading
}: { 
  report: DailyReport | null, 
  onClose: () => void,
  loading: boolean
}) => {
  if (!report && !loading) return null;

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
        {/* Handle */}
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
  const { products } = useProducts();
  const [range, setRange] = useState<RangeType>('daily');
  const [stats, setStats] = useState<StatsData>({
    revenue: 0,
    ordersCount: 0,
    comparison: { value: 0, isIncrease: true }
  });
  const [loadingStats, setLoadingStats] = useState(true);
  
  // Cache for stats to avoid redundant calls
  const [statsCache, setStatsCache] = useState<Record<RangeType, StatsData | null>>({
    daily: null,
    monthly: null,
    yearly: null
  });

  // Calendar State
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState<Record<string, CalendarDayData>>({});
  
  // Daily Report State
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Trend Data State
  const [trendData, setTrendData] = useState<TrendData[]>([]);

  const fetchTrendData = useCallback(async () => {
    if (!supabase) return;
    try {
      const now = new Date();
      const last14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      
      const { data, error } = await supabase
        .from('orders')
        .select('total_price, created_at')
        .gte('created_at', last14Days.toISOString())
        .in('status', ['PAID', 'PRODUCTION', 'SHIPPING', 'COMPLETED', '결제확인', '제작중', '배송중', '배송완료', '구매확정', 'paid', 'production', 'shipping', 'completed']);

      if (error) throw error;

      const aggregated: Record<string, { revenue: number, orders: number }> = {};
      
      // Initialize last 14 days with 0
      for (let i = 0; i < 14; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const kstD = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const key = `${kstD.getUTCMonth() + 1}/${kstD.getUTCDate()}`;
        aggregated[key] = { revenue: 0, orders: 0 };
      }

      data?.forEach(order => {
        const dateUTC = new Date(order.created_at);
        const dateKST = new Date(dateUTC.getTime() + 9 * 60 * 60 * 1000);
        const key = `${dateKST.getUTCMonth() + 1}/${dateKST.getUTCDate()}`;
        if (aggregated[key]) {
          aggregated[key].revenue += (order.total_price || 0);
          aggregated[key].orders += 1;
        }
      });

      const formatted = Object.entries(aggregated)
        .map(([date, stats]) => ({ date, ...stats }))
        .reverse();

      setTrendData(formatted);
    } catch (error) {
      console.error('Trend data fetch error:', error);
    }
  }, []);

  const fetchDailyReport = useCallback(async (dateKey: string) => {
    if (!supabase) return;
    try {
      setLoadingReport(true);
      setSelectedReport(null);

      // Parse the clicked date (which is in KST like '2026-04-02')
      const [year, month, day] = dateKey.split('-').map(Number);
      
      // Create KST boundaries using UTC methods to avoid browser timezone issues
      const startKST_UTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const endKST_UTC = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

      const startUTC = new Date(startKST_UTC.getTime() - 9 * 60 * 60 * 1000);
      const endUTC = new Date(endKST_UTC.getTime() - 9 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', startUTC.toISOString())
        .lte('created_at', endUTC.toISOString())
        .in('status', ['PAID', 'PRODUCTION', 'SHIPPING', 'COMPLETED', '결제확인', '제작중', '배송중', '배송완료', '구매확정', 'paid', 'production', 'shipping', 'completed']);

      if (error) throw error;

      let totalRevenue = 0;
      let orderCount = data?.length || 0;
      
      // Aggregation Map: Key is product title
      const productStats: Record<string, { count: number; revenue: number; isWorkshop: boolean }> = {};

      data?.forEach(order => {
        totalRevenue += (order.total_price || 0);
        
        const items = (order.ordered_items as any[]) || [];

        items.forEach((ji: any) => {
          const name = ji.title || '커스텀 작품(Workshop)';
          const quantity = Number(ji.quantity) || 1;
          const price = Number(ji.price) || 0;
          const revenue = quantity * price;
          
          const userImageUrl = ji.user_image_url;
          
          // Workshop detection: No product_id or specific keywords in title
          const isWorkshop = ji.product_id === 'workshop-single' || 
                            name.includes('커스텀') || 
                            name.includes('Workshop') || 
                            name.includes('Atelier') ||
                            name === '커스텀 작품(Workshop)' ||
                            !!userImageUrl;

          if (!productStats[name]) {
            productStats[name] = { count: 0, revenue: 0, isWorkshop };
          }
          
          productStats[name].count += quantity;
          productStats[name].revenue += revenue;
        });
      });

      // Sorting Logic: Quantity DESC, then Revenue DESC
      const sortedItems = Object.entries(productStats)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.revenue - a.revenue;
        });

      const topItem = sortedItems.length > 0 ? sortedItems[0] : null;

      setSelectedReport({
        date: dateKey,
        totalRevenue,
        orderCount,
        topItem
      });
    } catch (error) {
      console.error('Daily report fetch error:', error);
    } finally {
      setLoadingReport(false);
    }
  }, []);

  // Real-time Presence State
  const [presenceCount, setPresenceCount] = useState({
    members: 0,
    guests: 0
  });

  const fetchStats = useCallback(async (targetRange: RangeType, forceRefresh = false) => {
    if (!supabase) return;
    
    // Check cache first
    if (!forceRefresh && statsCache[targetRange]) {
      setStats(statsCache[targetRange]!);
      return;
    }

    try {
      setLoadingStats(true);
      
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      
      const year = kstNow.getUTCFullYear();
      const month = kstNow.getUTCMonth();
      const day = kstNow.getUTCDate();
      
      let startKST_UTC: Date;
      let endKST_UTC: Date;
      let startPrevKST_UTC: Date;
      let endPrevKST_UTC: Date;

      if (targetRange === 'daily') {
        startKST_UTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        endKST_UTC = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        startPrevKST_UTC = new Date(startKST_UTC.getTime() - 24 * 60 * 60 * 1000);
        endPrevKST_UTC = new Date(endKST_UTC.getTime() - 24 * 60 * 60 * 1000);
      } else if (targetRange === 'monthly') {
        startKST_UTC = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        endKST_UTC = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        startPrevKST_UTC = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        endPrevKST_UTC = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      } else {
        // yearly
        startKST_UTC = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
        endKST_UTC = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
        startPrevKST_UTC = new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0, 0));
        endPrevKST_UTC = new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999));
      }

      const startUTC = new Date(startKST_UTC.getTime() - 9 * 60 * 60 * 1000);
      const endUTC = new Date(endKST_UTC.getTime() - 9 * 60 * 60 * 1000);
      const startPrevUTC = new Date(startPrevKST_UTC.getTime() - 9 * 60 * 60 * 1000);
      const endPrevUTC = new Date(endPrevKST_UTC.getTime() - 9 * 60 * 60 * 1000);

      // 1. Current Period Stats
      const { data: currentData, error: currentError } = await supabase
        .from('orders')
        .select('total_price, created_at, status')
        .gte('created_at', startUTC.toISOString())
        .lte('created_at', endUTC.toISOString())
        .in('status', ['PAID', 'PRODUCTION', 'SHIPPING', 'COMPLETED', '결제확인', '제작중', '배송중', '배송완료', '구매확정', 'paid', 'production', 'shipping', 'completed']);

      if (currentError) throw currentError;

      const currentTotal = currentData?.reduce((sum, o) => sum + (o.total_price || 0), 0) || 0;
      const currentOrders = currentData?.length || 0;

      // 2. Previous Period for Comparison
      const { data: prevData, error: prevError } = await supabase
        .from('orders')
        .select('total_price')
        .gte('created_at', startPrevUTC.toISOString())
        .lte('created_at', endPrevUTC.toISOString())
        .in('status', ['PAID', 'PRODUCTION', 'SHIPPING', 'COMPLETED', '결제확인', '제작중', '배송중', '배송완료', '구매확정', 'paid', 'production', 'shipping', 'completed']);

      if (prevError) throw prevError;


      const prevTotal = prevData?.reduce((sum, o) => sum + (o.total_price || 0), 0) || 0;
      
      let compValue = 0;
      let isIncrease = true;

      if (prevTotal === 0) {
        compValue = currentTotal > 0 ? 100 : 0;
        isIncrease = true;
      } else {
        const diff = ((currentTotal - prevTotal) / prevTotal) * 100;
        compValue = Math.abs(Math.round(diff));
        isIncrease = diff >= 0;
      }

      const newStats = {
        revenue: currentTotal,
        ordersCount: currentOrders,
        comparison: { value: compValue, isIncrease }
      };

      setStats(newStats);
      setStatsCache(prev => ({ ...prev, [targetRange]: newStats }));

    } catch (error) {
      console.error('Stats fetch error:', error);
    } finally {
      setLoadingStats(false);
    }
  }, [statsCache]);

  const fetchCalendarData = useCallback(async () => {
    if (!supabase) return;
    try {
      const kstMonth = new Date(calendarMonth.getTime() + 9 * 60 * 60 * 1000);
      const year = kstMonth.getUTCFullYear();
      const month = kstMonth.getUTCMonth();
      
      const startKST_UTC = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const endKST_UTC = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

      const startOfMonth = new Date(startKST_UTC.getTime() - 9 * 60 * 60 * 1000);
      const endOfMonth = new Date(endKST_UTC.getTime() - 9 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('orders')
        .select('total_price, created_at')
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString())
        .in('status', ['PAID', 'PRODUCTION', 'SHIPPING', 'COMPLETED', '결제확인', '제작중', '배송중', '배송완료', '구매확정', 'paid', 'production', 'shipping', 'completed']);

      if (error) throw error;

      const aggregated: Record<string, CalendarDayData> = {};
      data?.forEach(order => {
        // Convert order.created_at to KST date string
        const dateUTC = new Date(order.created_at);
        const dateKST = new Date(dateUTC.getTime() + 9 * 60 * 60 * 1000);
        const key = `${dateKST.getUTCFullYear()}-${String(dateKST.getUTCMonth() + 1).padStart(2, '0')}-${String(dateKST.getUTCDate()).padStart(2, '0')}`;
        if (!aggregated[key]) {
          aggregated[key] = { revenue: 0, orders: 0 };
        }
        aggregated[key].revenue += (order.total_price || 0);
        aggregated[key].orders += 1;
      });

      setCalendarData(aggregated);
    } catch (error) {
      console.error('Calendar data fetch error:', error);
    }
  }, [calendarMonth]);

  useEffect(() => {
    let isMounted = true;
    const runFetch = async () => {
      await fetchStats(range);
    };
    runFetch();
    return () => { isMounted = false; };
  }, [range, fetchStats]);

  useEffect(() => {
    let isMounted = true;
    const runFetch = async () => {
      await fetchCalendarData();
      await fetchTrendData();
    };
    runFetch();
    return () => { isMounted = false; };
  }, [calendarMonth, fetchCalendarData, fetchTrendData]);

  useEffect(() => {
    // Real-time Presence Subscription
    const channel = supabase.channel('online-users');
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        let members = 0;
        let guests = 0;

        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.is_member) members++;
            else guests++;
          });
        });

        setPresenceCount({ members, guests });
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const [totalProducts, setTotalProducts] = useState(0);

  useEffect(() => {
    const fetchTotalProducts = async () => {
      if (!supabase) return;
      const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });
      if (!error && count !== null) {
        setTotalProducts(count);
      }
    };
    fetchTotalProducts();
  }, []);

  if (loadingStats && stats.revenue === 0) {
    return <LoadingScreen />;
  }

  return (
    <AdminLayout>
      <div className="space-y-10 pb-20 bg-black min-h-screen">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-4xl font-black text-white tracking-tighter mb-2">대시보드 v2.0</h2>
            <p className="text-zinc-500 font-bold tracking-tight">실시간 비즈니스 현황 및 매출 분석 리포트</p>
          </div>
          
          {/* Real-time Presence Indicators */}
          <div className="flex flex-wrap gap-4">
            <div className="bg-zinc-900/80 border border-white/5 px-6 py-3.5 rounded-2xl flex items-center gap-3 backdrop-blur-xl shadow-2xl">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.6)]" />
              <span className="text-sm font-black text-zinc-400">
                현재 갤러리 감상 중: <span className="text-white ml-1">{presenceCount.guests}명</span>
              </span>
            </div>
            <div className="bg-zinc-900/80 border border-white/5 px-6 py-3.5 rounded-2xl flex items-center gap-3 backdrop-blur-xl shadow-2xl">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse shadow-[0_0_15px_rgba(168,85,247,0.6)]" />
              <span className="text-sm font-black text-zinc-400">
                로그인 중인 작가: <span className="text-white ml-1">{presenceCount.members}명</span>
              </span>
            </div>
          </div>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Card & Trend Chart */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-2 bg-[#0A0A0A] p-10 md:p-12 rounded-[48px] border border-white/5 shadow-2xl relative overflow-hidden group"
          >
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-full group-hover:bg-purple-600/20 transition-all duration-1000" />
            
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-3xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 shadow-inner">
                    <BarChart3 size={32} />
                  </div>
                  <div>
                    <span className="text-zinc-400 font-black text-2xl block tracking-tight">
                      {range === 'daily' ? '오늘의 매출' : range === 'monthly' ? '이번 달 매출' : '올해 매출'}
                    </span>
                    <span className="text-[10px] text-zinc-600 font-black tracking-[0.3em] uppercase">Revenue & Trend Analysis</span>
                  </div>
                </div>

                {/* Range Tabs */}
                <div className="flex p-1.5 bg-zinc-900/80 rounded-2xl border border-white/10 backdrop-blur-xl">
                  {(['daily', 'monthly', 'yearly'] as RangeType[]).map((r) => (
                    <button
                      key={r}
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-end">
                <div className="flex flex-col gap-4">
                  <div className="text-6xl md:text-7xl font-black text-white tracking-tighter leading-none">
                    <CountUp value={stats.revenue} prefix="₩" className="drop-shadow-[0_0_40px_rgba(255,255,255,0.15)]" />
                  </div>
                  
                  {/* Comparison Metric */}
                  <div className={`flex items-center gap-3 text-lg font-black mt-4 ${stats.comparison.isIncrease ? 'text-purple-400' : 'text-blue-400'}`}>
                    <div className={`p-1.5 rounded-lg ${stats.comparison.isIncrease ? 'bg-purple-500/10' : 'bg-blue-500/10'}`}>
                      {stats.comparison.isIncrease ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>
                    <span className="tracking-tight">
                      {range === 'daily' ? '어제' : range === 'monthly' ? '지난달' : '작년'} 대비 {stats.comparison.value}% {stats.comparison.isIncrease ? '상승' : '하락'}
                    </span>
                  </div>
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

              {/* Sales Trend Chart */}
              <SalesTrendChart data={trendData} />
              
              <div className="mt-8 flex items-center gap-3 text-zinc-600 font-bold text-sm">
                <Activity size={18} className="text-zinc-700" />
                <span>데이터는 1시간마다 자동으로 갱신됩니다.</span>
              </div>
            </div>
          </motion.div>

          {/* Side Stats & Infographics */}
          <div className="flex flex-col gap-6">
            {/* Orders Count Card */}
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
                      {range === 'daily' ? '오늘의 주문' : range === 'monthly' ? '이번 달 주문' : '올해 주문'}
                    </span>
                    <span className="text-[9px] text-zinc-600 font-black tracking-widest uppercase">Order Volume</span>
                  </div>
                </div>
              </div>
              <div className="text-5xl font-black text-white tracking-tighter mt-8 relative z-10">
                <CountUp value={stats.ordersCount} suffix="건" />
              </div>
            </motion.div>

            {/* Infographic: Average Order Value (AOV) */}
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
                <CountUp value={stats.ordersCount > 0 ? Math.round(stats.revenue / stats.ordersCount) : 0} prefix="₩" />
              </div>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest relative z-10">
                <div className="w-1 h-1 rounded-full bg-emerald-500" />
                <span>프리미엄 세그먼트 유지 중</span>
              </div>
            </motion.div>

            {/* Total Products Card */}
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
                <CountUp value={totalProducts} suffix="개" />
              </div>
            </motion.div>
          </div>
        </div>

        {/* Bottom Section: Calendar & Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RevenueCalendar 
              data={calendarData} 
              currentMonth={calendarMonth} 
              onMonthChange={setCalendarMonth} 
              onDateClick={fetchDailyReport}
            />
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-[#0A0A0A] border border-white/5 p-10 rounded-[40px] shadow-2xl flex-1 flex flex-col">
              <h3 className="text-xl font-black text-white mb-10 flex items-center gap-3 tracking-tight">
                <Users size={22} className="text-purple-500" />
                실시간 접속자 분석
              </h3>
              <div className="space-y-10">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1">Active Sessions</span>
                    <span className="text-white font-black text-4xl tracking-tighter">{presenceCount.members + presenceCount.guests}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-500 text-[10px] font-black uppercase tracking-widest block mb-1">Status</span>
                    <span className="text-emerald-500 font-black text-sm flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE
                    </span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="w-full bg-zinc-900 h-4 rounded-full overflow-hidden border border-white/5 p-1">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(presenceCount.members / (presenceCount.members + presenceCount.guests || 1)) * 100}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="bg-purple-500 h-full rounded-full shadow-[0_0_20px_rgba(168,85,247,0.6)]" 
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
                    <span className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]" />
                      Members ({presenceCount.members})
                    </span>
                    <span className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-zinc-800" />
                      Guests ({presenceCount.guests})
                    </span>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                  <div className="bg-zinc-900/50 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                      <TrendingUp size={18} />
                    </div>
                    <p className="text-xs text-zinc-400 font-bold leading-relaxed">
                      현재 접속자의 <span className="text-white font-black">{Math.round((presenceCount.members / (presenceCount.members + presenceCount.guests || 1)) * 100)}%</span>가 <br />
                      회원 작가로 식별되었습니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-[#0A0A0A] border border-white/5 p-10 rounded-[40px] shadow-2xl flex items-center justify-center text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <p className="text-zinc-500 text-sm font-bold italic leading-relaxed relative z-10">
                "METALORA: Elevating the standard of <br />
                <span className="text-zinc-300 not-italic font-black tracking-tight">Premium Metal Art Membership.</span>"
              </p>
            </div>
          </div>
        </div>
        
        {/* Bottom Section: Calendar & Analysis */}
      </div>

      <AnimatePresence mode="sync">
        {(selectedReport || loadingReport) && (
          <DailyBottomSheet 
            key="daily-report-modal"
            report={selectedReport} 
            loading={loadingReport}
            onClose={() => {
              if (!loadingReport) {
                setSelectedReport(null);
              }
            }} 
          />
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
