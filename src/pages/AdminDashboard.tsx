import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { useProducts } from '../context/ProductContext';
import { Package, DollarSign, ShoppingBag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import LoadingScreen from '../components/LoadingScreen';

function CountUp({ value, prefix = '', suffix = '' }: { value: number, prefix?: string, suffix?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest).toLocaleString());

  useEffect(() => {
    const animation = animate(count, value, { duration: 1.5, ease: "easeOut" });
    return animation.stop;
  }, [value]);

  return (
    <span className="flex items-baseline gap-1">
      {prefix && <span>{prefix}</span>}
      <motion.span>{rounded}</motion.span>
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

export default function AdminDashboard() {
  const { products } = useProducts();
  const [todayOrders, setTodayOrders] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!supabase) return;
      try {
        setLoadingStats(true);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString();

        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstDayStr = firstDayOfMonth.toISOString();

        // 1. 오늘 들어온 주문 건수
        const { count: todayCount, error: todayError } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayStr);

        if (todayError) throw todayError;

        // 2. 이번 달 누적 결제액
        const { data: monthOrders, error: monthError } = await supabase
          .from('orders')
          .select('total_price')
          .gte('created_at', firstDayStr);

        if (monthError) throw monthError;

        const totalRevenue = monthOrders?.reduce((sum, order) => sum + (order.total_price || 0), 0) || 0;

        setTodayOrders(todayCount || 0);
        setMonthRevenue(totalRevenue);
      } catch (error) {
        // Silent error
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, []);

  const totalProducts = products.length;

  if (loadingStats) {
    return <LoadingScreen />;
  }

  return (
    <AdminLayout>
      <div className="space-y-8 pb-20">
        <h2 className="text-2xl font-bold text-white">대시보드</h2>

        {/* 총 상품 수 (Top Placement) */}
        <div className="grid grid-cols-1 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                <Package size={20} />
              </div>
              <span className="text-zinc-400 font-medium text-lg">총 상품 수</span>
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">{totalProducts}개</span>
          </motion.div>
        </div>

        {/* 주요 지표 카드 (Toss Style) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-[#1A1A1A] p-8 rounded-3xl border border-zinc-800 shadow-xl flex flex-col justify-between"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <ShoppingBag size={24} />
              </div>
              <span className="text-zinc-400 font-medium text-lg">오늘 들어온 주문</span>
            </div>
            <div className="text-5xl font-bold text-white tracking-tight">
              {loadingStats ? (
                <span className="text-zinc-700">0건</span>
              ) : (
                <CountUp value={todayOrders} suffix="건" />
              )}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-[#1A1A1A] p-8 rounded-3xl border border-zinc-800 shadow-xl flex flex-col justify-between"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <DollarSign size={24} />
              </div>
              <span className="text-zinc-400 font-medium text-lg">이번 달 누적 결제액</span>
            </div>
            <div className="text-5xl font-bold text-white tracking-tight">
              {loadingStats ? (
                <span className="text-zinc-700">₩ 0</span>
              ) : (
                <CountUp value={monthRevenue} prefix="₩ " />
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </AdminLayout>
  );
}
