import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { Plus, Trash2, Save, GripVertical, Check, X, Loader2, Globe, AlertTriangle } from 'lucide-react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';

interface Banner {
  id: string;
  content: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export default function AdminBanners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newBannerContent, setNewBannerContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchBanners = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setBanners(data || []);
    } catch (err: any) {
      console.error('Error fetching banners:', err);
      if (err.code === 'PGRST205' || err.message?.includes('banners')) {
        setError('DATABASE_MISSING');
      } else {
        setError(err.message || 'Failed to fetch');
        showToast('배너 데이터를 불러오는 중 오류가 발생했습니다.', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  const handleAddBanner = async () => {
    if (!newBannerContent.trim()) return;

    try {
      setIsSaving(true);
      const newBanner = {
        content: newBannerContent.trim(),
        is_active: true,
        display_order: banners.length,
      };

      const { data, error } = await supabase
        .from('banners')
        .insert([newBanner])
        .select();

      if (error) throw error;

      setBanners([...banners, data[0]]);
      setNewBannerContent('');
      showToast('새 배너가 추가되었습니다.', 'success');
    } catch (error: any) {
      showToast('배너 추가 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBanner = async (id: string) => {
    try {
      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setBanners(banners.filter(b => b.id !== id));
      showToast('배너가 삭제되었습니다.', 'success');
    } catch (error: any) {
      showToast('배너 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    try {
      const { error } = await supabase
        .from('banners')
        .update({ is_active: !banner.is_active })
        .eq('id', banner.id);

      if (error) throw error;

      setBanners(banners.map(b => b.id === banner.id ? { ...b, is_active: !b.is_active } : b));
      showToast(banner.is_active ? '배너가 비활성화되었습니다.' : '배너가 활성화되었습니다.', 'success');
    } catch (error: any) {
      showToast('상태 변경 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleSaveOrder = async () => {
    try {
      setIsSaving(true);
      const updates = banners.map((banner, index) => ({
        id: banner.id,
        display_order: index,
        content: banner.content,
        is_active: banner.is_active
      }));

      const { error } = await supabase
        .from('banners')
        .upsert(updates, { onConflict: 'id' });

      if (error) throw error;

      showToast('배너 순서가 저장되었습니다.', 'success');
    } catch (error: any) {
      showToast('순서 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
              <Globe className="text-purple-500" size={28} />
              배너 관리
              <span className="text-sm font-normal text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{banners.length}</span>
            </h2>
            <p className="text-zinc-500 text-sm mt-1">홈페이지 상단에 노출되는 공지 배너를 관리합니다.</p>
          </div>
          <button
            onClick={handleSaveOrder}
            disabled={isSaving}
            className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-xl transition-all font-bold active:scale-95 disabled:opacity-50 shadow-lg shadow-white/10"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            순서 저장
          </button>
        </div>

        {/* Add New Banner */}
        <div className="bg-[#0A0A0A] p-6 rounded-3xl border border-white/5 shadow-xl">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="새로운 배너 내용을 입력하세요..."
              value={newBannerContent}
              onChange={(e) => setNewBannerContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddBanner()}
              className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
            />
            <button
              onClick={handleAddBanner}
              disabled={isSaving || !newBannerContent.trim()}
              className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl transition-all font-bold active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              <Plus size={20} />
              추가
            </button>
          </div>
        </div>

        {/* Banner List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="text-purple-500 animate-spin" size={40} />
              <p className="text-zinc-500 font-medium">배너 목록을 불러오는 중...</p>
            </div>
          ) : error === 'DATABASE_MISSING' ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-8 text-center">
              <AlertTriangle className="mx-auto mb-4 text-red-500" size={48} />
              <h3 className="text-xl font-bold text-white mb-2">데이터베이스 설정 필요</h3>
              <p className="text-zinc-400 mb-6 max-w-md mx-auto">
                배너 관리 기능을 사용하려면 Supabase에 'banners' 테이블을 생성해야 합니다.
                아래 SQL을 복사하여 Supabase SQL Editor에서 실행해 주세요.
              </p>
              <div className="bg-black rounded-xl p-4 text-left overflow-x-auto mb-6">
                <pre className="text-xs text-zinc-500 font-mono leading-relaxed">
{`CREATE TABLE public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to active banners" ON public.banners FOR SELECT USING (true);
CREATE POLICY "Allow admin full access to banners" ON public.banners FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
);`}
                </pre>
              </div>
              <button
                onClick={fetchBanners}
                className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-zinc-200 transition-all"
              >
                설정 완료 후 새로고침
              </button>
            </div>
          ) : banners.length > 0 ? (
            <Reorder.Group axis="y" values={banners} onReorder={setBanners} className="space-y-3">
              <AnimatePresence mode="popLayout">
                {banners.map((banner) => (
                  <Reorder.Item
                    key={banner.id}
                    value={banner}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-[#0F0F0F] border border-white/5 rounded-2xl p-4 flex items-center gap-4 group hover:border-white/10 transition-all ${!banner.is_active ? 'opacity-50' : ''}`}
                  >
                    <div className="cursor-grab active:cursor-grabbing text-zinc-700 group-hover:text-zinc-500 transition-colors">
                      <GripVertical size={20} />
                    </div>
                    
                    <div className="flex-1">
                      <p className="text-white font-medium">{banner.content}</p>
                      <p className="text-[10px] text-zinc-600 mt-1 uppercase tracking-widest">
                        Created at: {new Date(banner.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(banner)}
                        className={`p-2 rounded-xl transition-all ${banner.is_active ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border border-white/5'}`}
                        title={banner.is_active ? '활성화됨' : '비활성화됨'}
                      >
                        {banner.is_active ? <Check size={18} /> : <X size={18} />}
                      </button>
                      <button
                        onClick={() => handleDeleteBanner(banner.id)}
                        className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20"
                        title="삭제"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
          ) : (
            <div className="py-20 text-center bg-[#0A0A0A] rounded-3xl border border-dashed border-white/5">
              <Globe size={48} className="mx-auto mb-4 text-zinc-800" />
              <p className="text-zinc-600 font-medium">등록된 배너가 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
