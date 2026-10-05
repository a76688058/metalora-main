import React, { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { useToast } from '../context/ToastContext';
import { Plus, Trash2, Save, GripVertical, Check, X, Loader2, Globe } from 'lucide-react';
import { Reorder, AnimatePresence } from 'framer-motion';
import {
  ADMIN_BANNERS_ERROR,
  createAdminBanner,
  deleteAdminBanner,
  fetchAdminBanners,
  nextBannerDisplayOrder,
  saveBannerDisplayOrder,
  updateBannerActive,
  type AdminBanner,
} from '../components/admin/adminBanners';

type LoadState = 'loading' | 'ready' | 'error';

export default function AdminBanners() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Record<string, true>>({});
  const [newBannerContent, setNewBannerContent] = useState('');
  const [bannerToDelete, setBannerToDelete] = useState<AdminBanner | null>(null);
  const { showToast } = useToast();

  const requestGenRef = useRef(0);
  const mountedRef = useRef(true);
  const lastOpenerRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const loadBanners = useCallback(async () => {
    const generation = ++requestGenRef.current;
    setBannerToDelete(null);
    setLoadState('loading');
    const { data, error } = await fetchAdminBanners();
    if (!mountedRef.current || generation !== requestGenRef.current) return;
    if (error) {
      setBanners([]);
      setLoadState('error');
      return;
    }
    setBanners(data);
    setLoadState('ready');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadBanners();
    return () => {
      mountedRef.current = false;
      requestGenRef.current += 1;
    };
  }, [loadBanners]);

  const listLocked = loadState === 'loading' || isSavingOrder;

  const closeDeleteDialog = useCallback(() => {
    if (isDeleting) return;
    setBannerToDelete(null);
    lastOpenerRef.current?.focus();
  }, [isDeleting]);

  useEffect(() => {
    if (!bannerToDelete) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDeleteDialog();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bannerToDelete, closeDeleteDialog]);

  const handleAddBanner = async () => {
    const content = newBannerContent.trim();
    if (!content || isCreating || listLocked) return;

    setIsCreating(true);
    const { data, error } = await createAdminBanner({
      content,
      displayOrder: nextBannerDisplayOrder(banners),
    });
    if (!mountedRef.current) return;
    setIsCreating(false);

    if (error || !data) {
      showToast(error ?? '배너 추가 중 오류가 발생했습니다.', 'error');
      return;
    }

    setBanners((current) => (current.some((banner) => banner.id === data.id) ? current : [...current, data]));
    setNewBannerContent('');
    showToast('새 배너가 추가되었습니다.', 'success');
    await loadBanners();
  };

  const handleDeleteBanner = async () => {
    if (!bannerToDelete || isDeleting || listLocked) return;
    const id = bannerToDelete.id;
    setIsDeleting(true);
    const { ok, error } = await deleteAdminBanner(id);
    if (!mountedRef.current) return;
    setIsDeleting(false);
    if (!ok) {
      showToast(error ?? '배너 삭제 중 오류가 발생했습니다.', 'error');
      return;
    }
    setBanners((current) => current.filter((banner) => banner.id !== id));
    setBannerToDelete(null);
    lastOpenerRef.current?.focus();
    showToast('배너가 삭제되었습니다.', 'success');
    await loadBanners();
  };

  const handleToggleActive = async (banner: AdminBanner) => {
    if (listLocked || togglingIds[banner.id]) return;
    const nextActive = !banner.is_active;
    setTogglingIds((current) => ({ ...current, [banner.id]: true }));
    const { ok, error } = await updateBannerActive(banner.id, nextActive);
    if (!mountedRef.current) return;
    setTogglingIds((current) => {
      const next = { ...current };
      delete next[banner.id];
      return next;
    });
    if (!ok) {
      showToast(error ?? '상태 변경 중 오류가 발생했습니다.', 'error');
      return;
    }
    setBanners((current) =>
      current.map((item) => (item.id === banner.id ? { ...item, is_active: nextActive } : item)),
    );
    showToast(nextActive ? '배너가 활성화되었습니다.' : '배너가 비활성화되었습니다.', 'success');
    await loadBanners();
  };

  const handleSaveOrder = async () => {
    if (isSavingOrder || loadState !== 'ready') return;
    setIsSavingOrder(true);
    const updates = banners.map((banner, index) => ({
      id: banner.id,
      display_order: index,
    }));
    const { ok, error } = await saveBannerDisplayOrder(updates);
    if (!mountedRef.current) return;
    if (!ok) {
      showToast(error ?? '순서 저장 중 오류가 발생했습니다.', 'error');
      await loadBanners();
      if (!mountedRef.current) return;
      setIsSavingOrder(false);
      return;
    }
    showToast('배너 순서가 저장되었습니다.', 'success');
    await loadBanners();
    if (!mountedRef.current) return;
    setIsSavingOrder(false);
  };

  const openDeleteDialog = (banner: AdminBanner, opener: HTMLElement | null) => {
    if (listLocked) return;
    lastOpenerRef.current = opener;
    setBannerToDelete(banner);
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
              <Globe className="text-purple-500" size={28} aria-hidden="true" />
              배너 관리
              {loadState === 'ready' && (
                <span className="text-sm font-normal text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{banners.length}</span>
              )}
            </h2>
            <p className="text-zinc-500 text-sm mt-1">홈페이지 상단에 노출되는 공지 배너를 관리합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => { void handleSaveOrder(); }}
            disabled={isSavingOrder || loadState !== 'ready' || banners.length === 0}
            className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-xl transition-all font-bold active:scale-95 disabled:opacity-50 shadow-lg shadow-white/10"
          >
            {isSavingOrder ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
            순서 저장
          </button>
        </div>

        <div className="bg-[#0A0A0A] p-6 rounded-3xl border border-white/5 shadow-xl">
          <div className="flex gap-3">
            <label htmlFor="admin-banner-content" className="sr-only">배너 내용</label>
            <input
              id="admin-banner-content"
              type="text"
              placeholder="새로운 배너 내용을 입력하세요..."
              value={newBannerContent}
              onChange={(e) => setNewBannerContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleAddBanner()}
              disabled={isCreating || listLocked}
              className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => { void handleAddBanner(); }}
              disabled={isCreating || listLocked || !newBannerContent.trim()}
              className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl transition-all font-bold active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {isCreating ? <Loader2 className="animate-spin" size={20} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}
              추가
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {loadState === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20 gap-4" aria-busy="true">
              <Loader2 className="text-purple-500 animate-spin" size={40} aria-hidden="true" />
              <p className="text-zinc-500 font-medium">배너 목록을 불러오는 중...</p>
            </div>
          )}

          {loadState === 'error' && (
            <div className="py-16 text-center bg-zinc-900 rounded-3xl border border-zinc-800">
              <p className="text-white font-medium">{ADMIN_BANNERS_ERROR}</p>
              <button
                type="button"
                onClick={() => { void loadBanners(); }}
                className="mt-4 min-h-11 px-4 rounded-lg bg-zinc-800 text-white"
              >
                다시 시도
              </button>
            </div>
          )}

          {loadState === 'ready' && banners.length === 0 && (
            <div className="py-20 text-center bg-[#0A0A0A] rounded-3xl border border-dashed border-white/5">
              <Globe size={48} className="mx-auto mb-4 text-zinc-800" aria-hidden="true" />
              <p className="text-zinc-600 font-medium">등록된 배너가 없습니다.</p>
            </div>
          )}

          {loadState === 'ready' && banners.length > 0 && (
            <Reorder.Group
              axis="y"
              values={banners}
              onReorder={isSavingOrder ? () => undefined : setBanners}
              className="space-y-3"
            >
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
                    <div className="cursor-grab active:cursor-grabbing text-zinc-700 group-hover:text-zinc-500 transition-colors" aria-hidden="true">
                      <GripVertical size={20} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium">{banner.content}</p>
                      <p className="text-[10px] text-zinc-600 mt-1 uppercase tracking-widest">
                        Created at: {new Date(banner.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { void handleToggleActive(banner); }}
                        disabled={listLocked || Boolean(togglingIds[banner.id])}
                        aria-pressed={banner.is_active}
                        aria-label={banner.is_active ? '배너 활성' : '배너 비활성'}
                        className={`min-h-11 px-3 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 ${banner.is_active ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border border-white/5'}`}
                      >
                        {banner.is_active ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
                        <span className="text-[10px] font-bold">{banner.is_active ? '활성' : '비활성'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => openDeleteDialog(banner, event.currentTarget)}
                        disabled={listLocked}
                        aria-label={`${banner.content} 삭제`}
                        className="min-h-11 min-w-11 p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20 disabled:opacity-50"
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
          )}
        </div>
      </div>

      {bannerToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-banner-delete-title"
            aria-describedby="admin-banner-delete-desc"
            className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-6 max-w-sm w-full"
          >
            <h3 id="admin-banner-delete-title" className="text-xl font-bold text-white mb-2">배너 삭제</h3>
            <p id="admin-banner-delete-desc" className="text-zinc-400 mb-6 text-sm leading-relaxed">
              다음 배너를 삭제할까요? 홈페이지 상단 공지에서 바로 사라집니다.
              <span className="mt-3 block text-white font-medium break-words">‘{bannerToDelete.content}’</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                ref={cancelRef}
                type="button"
                onClick={closeDeleteDialog}
                disabled={isDeleting}
                className="min-h-11 px-4 rounded-lg font-medium text-zinc-400 hover:text-white"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => { void handleDeleteBanner(); }}
                disabled={isDeleting || listLocked}
                className="min-h-11 px-4 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
