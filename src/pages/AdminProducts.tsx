import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Edit, Eye, EyeOff, GripVertical, Loader2, Package, Plus, Save, Search, Trash2 } from 'lucide-react';
import { Reorder } from 'framer-motion';
import AdminLayout from '../components/admin/AdminLayout';
import AdminProductForm from '../components/admin/AdminProductForm';
import {
  catalogListPrice,
  fetchAdminCatalog,
  type AdminCatalogProduct,
} from '../components/admin/adminCatalog';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { getFullImageUrl } from '../lib/utils';
import { cn } from '../lib/cn';

const CUSTOM_M_PRICE_KEY = 'custom_m_price';

type VisibilityFilter = 'all' | 'visible' | 'hidden';

function parsePositiveKrwInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

function CustomMPriceControl() {
  const { showToast } = useToast();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'setup' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedPrice, setSavedPrice] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadPrice = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);
    setFieldError(null);

    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', CUSTOM_M_PRICE_KEY)
      .maybeSingle();

    if (error) {
      setSavedPrice(null);
      setDraft('');
      setLoadError('판매가 정보를 불러오지 못했습니다.');
      setLoadState('error');
      return;
    }

    if (!data || typeof data.value !== 'string') {
      setSavedPrice(null);
      setDraft('');
      setLoadError(null);
      setLoadState('setup');
      return;
    }

    const parsed = parsePositiveKrwInteger(data.value);
    if (parsed === null) {
      setSavedPrice(null);
      setDraft(data.value.trim());
      setLoadError(null);
      setLoadState('setup');
      return;
    }

    setSavedPrice(parsed);
    setDraft(String(parsed));
    setLoadState('ready');
  }, []);

  useEffect(() => {
    void loadPrice();
  }, [loadPrice]);

  const handleSave = async () => {
    if (loadState === 'error' || loadState === 'loading') return;
    const parsed = parsePositiveKrwInteger(draft);
    if (parsed === null) {
      setFieldError('1원 이상의 정수 원화만 입력할 수 있습니다.');
      return;
    }

    setIsSaving(true);
    setFieldError(null);
    const { error } = await supabase
      .from('site_settings')
      .upsert({ key: CUSTOM_M_PRICE_KEY, value: String(parsed) }, { onConflict: 'key' });
    setIsSaving(false);

    if (error) {
      setFieldError('판매가 저장에 실패했습니다.');
      showToast('판매가 저장에 실패했습니다.', 'error');
      return;
    }

    setSavedPrice(parsed);
    setDraft(String(parsed));
    setLoadState('ready');
    setLoadError(null);
    showToast('커스텀 M 판매가가 저장되었습니다.', 'success');
  };

  const parsedDraft = parsePositiveKrwInteger(draft);
  const isReadError = loadState === 'error';
  const canEdit = loadState === 'ready' || loadState === 'setup';
  const canSave = canEdit && !isSaving && parsedDraft !== null && parsedDraft !== savedPrice;
  const supportingCopy =
    loadState === 'loading'
      ? '불러오는 중'
      : loadState === 'ready' && savedPrice !== null
        ? `현재 판매가 ₩${savedPrice.toLocaleString('ko-KR')}`
        : loadState === 'setup'
          ? '아직 판매가가 설정되지 않았습니다.'
          : '판매가 정보를 불러오지 못했습니다.';

  return (
    <section className="bg-zinc-900 px-4 py-3 rounded-xl border border-zinc-800">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white tracking-tight">커스텀 · M 판매가</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{supportingCopy}</p>
        </div>
        {loadState === 'loading' ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            불러오는 중...
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="custom-m-price-input">커스텀 M 판매가</label>
            <input
              id="custom-m-price-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft}
              disabled={isSaving || !canEdit}
              aria-invalid={Boolean(fieldError || isReadError)}
              aria-describedby="custom-m-price-status"
              onChange={(event) => {
                setDraft(event.target.value);
                setFieldError(null);
              }}
              className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600 disabled:opacity-50"
              placeholder="0"
            />
            <span className="text-sm text-zinc-500 shrink-0">원</span>
            <button
              type="button"
              onClick={() => { void handleSave(); }}
              disabled={!canSave}
              className="flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        )}
      </div>
      <div id="custom-m-price-status">
        {isReadError && loadError && (
          <div className="mt-1.5 flex items-center gap-3">
            <p className="text-xs text-red-400">{loadError}</p>
            <button type="button" onClick={() => { void loadPrice(); }} className="text-xs font-medium text-zinc-400 hover:text-white transition-colors">
              다시 불러오기
            </button>
          </div>
        )}
        {fieldError && <p className="mt-1.5 text-xs text-red-400">{fieldError}</p>}
      </div>
    </section>
  );
}

function thumbUrl(product: AdminCatalogProduct): string | null {
  return getFullImageUrl(product.front_image || product.image);
}

export default function AdminProducts() {
  const { showToast } = useToast();
  const [catalog, setCatalog] = useState<AdminCatalogProduct[]>([]);
  const [savedOrderIds, setSavedOrderIds] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminCatalogProduct | null>(null);
  const [productToDelete, setProductToDelete] = useState<AdminCatalogProduct | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoadState('loading');
    const { data, error } = await fetchAdminCatalog();
    if (error) {
      setCatalog([]);
      setSavedOrderIds([]);
      setLoadState('error');
      return;
    }
    setCatalog(data);
    setSavedOrderIds(data.map((product) => product.id));
    setLoadState('ready');
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!productToDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) setProductToDelete(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [productToDelete, isDeleting]);

  const canReorder = debouncedSearch.length === 0 && visibilityFilter === 'all';
  const orderDirty = catalog.some((product, index) => product.id !== savedOrderIds[index]);

  const visibleRows = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    return catalog.filter((product) => {
      if (visibilityFilter === 'visible' && product.is_visible === false) return false;
      if (visibilityFilter === 'hidden' && product.is_visible !== false) return false;
      if (!query) return true;
      const title = (product.title || '').toLowerCase();
      const subtitle = (product.subtitle || product.artist || '').toLowerCase();
      const id = (product.id || '').toLowerCase();
      return title.includes(query) || subtitle.includes(query) || id.includes(query);
    });
  }, [catalog, debouncedSearch, visibilityFilter]);

  const notifyStorefront = () => {
    window.dispatchEvent(new CustomEvent('refresh-products'));
  };

  const handleSave = async () => {
    await loadCatalog();
    notifyStorefront();
    setIsFormOpen(false);
    setEditingProduct(null);
  };

  const handleVisibilityToggle = async (product: AdminCatalogProduct) => {
    const previous = catalog;
    const nextVisible = product.is_visible === false;
    setCatalog((current) =>
      current.map((item) => (item.id === product.id ? { ...item, is_visible: nextVisible } : item)),
    );
    const { error } = await supabase
      .from('products')
      .update({ is_visible: nextVisible })
      .eq('id', product.id);
    if (error) {
      setCatalog(previous);
      showToast('잠시 후 다시 시도해주세요.', 'error');
      return;
    }
    showToast(nextVisible ? '상품이 노출되었습니다.' : '상품이 숨겨졌습니다.', 'success');
    notifyStorefront();
  };

  const moveProduct = (id: string, direction: -1 | 1) => {
    if (!canReorder || isSavingOrder) return;
    setCatalog((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const handleSaveOrder = async () => {
    if (!canReorder || !orderDirty) return;
    setIsSavingOrder(true);
    const updates = catalog.map((product, index) => ({
      id: product.id,
      display_order: index,
    }));
    const results = await Promise.all(
      updates.map((item) =>
        supabase.from('products').update({ display_order: item.display_order }).eq('id', item.id),
      ),
    );
    const failed = results.find((result) => result.error);
    setIsSavingOrder(false);
    if (failed?.error) {
      showToast('잠시 후 다시 시도해주세요.', 'error');
      return;
    }
    setCatalog((current) => current.map((product, index) => ({ ...product, display_order: index })));
    setSavedOrderIds(catalog.map((product) => product.id));
    showToast('상품 순서가 저장되었습니다.', 'success');
    notifyStorefront();
  };

  const handleDelete = async () => {
    if (!productToDelete || isDeleting) return;
    setIsDeleting(true);
    const { data, error } = await supabase.from('products').delete().eq('id', productToDelete.id).select('id');
    setIsDeleting(false);
    if (error || !data || data.length === 0) {
      showToast('상품 삭제에 실패했습니다.', 'error');
      return;
    }
    showToast('상품이 삭제되었습니다.', 'success');
    setProductToDelete(null);
    await loadCatalog();
    notifyStorefront();
  };

  const actionButtons = (product: AdminCatalogProduct, index: number) => {
    const visible = product.is_visible !== false;
    return (
      <div className="flex items-center gap-2">
        {canReorder && (
          <>
            <button
              type="button"
              onClick={() => moveProduct(product.id, -1)}
              disabled={index === 0 || isSavingOrder}
              aria-label={`${product.title} 위로`}
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white/5 text-zinc-300 hover:text-white disabled:opacity-40"
            >
              <ChevronUp size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => moveProduct(product.id, 1)}
              disabled={index === catalog.length - 1 || isSavingOrder}
              aria-label={`${product.title} 아래로`}
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white/5 text-zinc-300 hover:text-white disabled:opacity-40"
            >
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => { void handleVisibilityToggle(product); }}
          aria-label={visible ? `${product.title} 숨기기` : `${product.title} 노출하기`}
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white/5 text-zinc-300 hover:text-white"
        >
          {visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingProduct(product);
            setIsFormOpen(true);
          }}
          aria-label={`${product.title} 수정`}
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white/5 text-zinc-300 hover:text-white"
        >
          <Edit size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setProductToDelete(product)}
          aria-label={`${product.title} 삭제`}
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white/5 text-zinc-300 hover:text-red-400"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    );
  };

  const rowBody = (product: AdminCatalogProduct) => {
    const src = thumbUrl(product);
    const visible = product.is_visible !== false;
    return (
      <>
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 border border-white/5 shrink-0">
          {src ? (
            <img src={src} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Package size={20} aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-white truncate">{product.title || '제목 없음'}</p>
          <p className="text-sm text-zinc-400">₩{catalogListPrice(product).toLocaleString('ko-KR')}</p>
        </div>
        <span className={cn(
          'shrink-0 text-xs px-2 py-1 rounded-md border',
          visible ? 'text-zinc-200 border-white/10' : 'text-zinc-500 border-white/5',
        )}>
          {visible ? '노출' : '숨김'}
        </span>
      </>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-white">
            상품 관리
            {loadState === 'ready' && (
              <span className="ml-2 text-sm font-normal text-zinc-500">{catalog.length}</span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            {canReorder && (
              <button
                type="button"
                onClick={() => { void handleSaveOrder(); }}
                disabled={isSavingOrder || !orderDirty}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 min-h-11"
              >
                {isSavingOrder ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                {isSavingOrder ? '저장 중...' : '순서 저장'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setIsFormOpen(true);
              }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium min-h-11"
            >
              <Plus size={18} aria-hidden="true" />
              신규 상품 등록
            </button>
          </div>
        </div>

        <CustomMPriceControl />

        <div className="flex flex-col gap-3 bg-zinc-900 p-4 rounded-xl border border-zinc-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} aria-hidden="true" />
            <label htmlFor="admin-product-search" className="sr-only">상품 검색</label>
            <input
              id="admin-product-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="상품명, 식별 텍스트 검색"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="노출 상태 필터">
            {([
              ['all', '전체'],
              ['visible', '노출'],
              ['hidden', '숨김'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setVisibilityFilter(value)}
                aria-pressed={visibilityFilter === value}
                className={cn(
                  'min-h-11 px-3 rounded-lg text-sm font-medium border',
                  visibilityFilter === value
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {loadState === 'ready' && !canReorder && (
            <p className="text-xs text-zinc-500">
              {orderDirty
                ? '저장하지 않은 순서가 있습니다. 검색과 필터를 해제하면 저장할 수 있습니다.'
                : '검색 또는 필터가 켜져 있으면 순서를 바꿀 수 없습니다.'}
            </p>
          )}
        </div>

        {loadState === 'loading' && (
          <div className="py-16 flex flex-col items-center gap-3 text-zinc-500" aria-busy="true">
            <Loader2 className="animate-spin" size={22} aria-hidden="true" />
            <p className="text-sm">상품 목록을 불러오는 중</p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-zinc-800">
            <p className="text-white font-medium">상품 목록을 불러오지 못했습니다.</p>
            <button
              type="button"
              onClick={() => { void loadCatalog(); }}
              className="mt-4 min-h-11 px-4 rounded-lg bg-zinc-800 text-white"
            >
              다시 시도
            </button>
          </div>
        )}

        {loadState === 'ready' && catalog.length === 0 && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-dashed border-white/10">
            <p className="text-white font-medium">등록된 상품이 없습니다.</p>
          </div>
        )}

        {loadState === 'ready' && catalog.length > 0 && visibleRows.length === 0 && (
          <div className="py-16 text-center bg-zinc-900 rounded-xl border border-dashed border-white/10">
            <p className="text-white font-medium">
              {debouncedSearch ? '검색 결과가 없습니다.' : '조건에 맞는 상품이 없습니다.'}
            </p>
          </div>
        )}

        {loadState === 'ready' && visibleRows.length > 0 && canReorder && (
          <Reorder.Group axis="y" values={catalog} onReorder={(next) => { if (!isSavingOrder) setCatalog(next); }} className="space-y-3">
            {catalog.map((product, index) => (
              <Reorder.Item
                key={product.id}
                value={product}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500 cursor-grab active:cursor-grabbing shrink-0" aria-hidden="true">
                    <GripVertical size={18} />
                  </span>
                  <span className="w-8 text-xs text-zinc-500 tabular-nums shrink-0">{index}</span>
                  <div className="hidden md:flex items-center gap-4 min-w-0 flex-1">
                    {rowBody(product)}
                    {actionButtons(product, index)}
                  </div>
                  <div className="md:hidden flex flex-col gap-3 min-w-0 flex-1">
                    <div className="flex items-center gap-3 min-w-0">{rowBody(product)}</div>
                    {actionButtons(product, index)}
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}

        {loadState === 'ready' && visibleRows.length > 0 && !canReorder && (
          <>
            <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">상품</th>
                    <th className="px-4 py-3 font-medium">가격</th>
                    <th className="px-4 py-3 font-medium">상태</th>
                    <th className="px-4 py-3 font-medium">순서</th>
                    <th className="px-4 py-3 font-medium">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((product, index) => {
                    const src = thumbUrl(product);
                    return (
                      <tr key={product.id} className="border-t border-zinc-800 bg-zinc-950">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-md overflow-hidden bg-zinc-800 shrink-0">
                              {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="m-auto text-zinc-600" aria-hidden="true" />}
                            </div>
                            <span className="text-white font-medium truncate">{product.title || '제목 없음'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-300">₩{catalogListPrice(product).toLocaleString('ko-KR')}</td>
                        <td className="px-4 py-3 text-zinc-300">{product.is_visible === false ? '숨김' : '노출'}</td>
                        <td className="px-4 py-3 text-zinc-500 tabular-nums">{product.display_order}</td>
                        <td className="px-4 py-3">{actionButtons(product, index)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-3">
              {visibleRows.map((product, index) => (
                <article key={product.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">{rowBody(product)}</div>
                  <p className="text-xs text-zinc-500">순서 {product.display_order}</p>
                  {actionButtons(product, index)}
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {isFormOpen && (
        <AdminProductForm
          product={editingProduct}
          onSave={handleSave}
          onClose={() => {
            setIsFormOpen(false);
            setEditingProduct(null);
          }}
        />
      )}

      {productToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-product-delete-title"
            aria-describedby="admin-product-delete-desc"
            className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-6 max-w-sm w-full"
          >
            <h3 id="admin-product-delete-title" className="text-xl font-bold text-white mb-2">상품 삭제</h3>
            <p id="admin-product-delete-desc" className="text-zinc-400 mb-6 text-sm leading-relaxed">
              정말 <span className="text-white font-medium">'{productToDelete.title}'</span> 상품을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => setProductToDelete(null)}
                disabled={isDeleting}
                className="min-h-11 px-4 rounded-lg font-medium text-zinc-400 hover:text-white"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => { void handleDelete(); }}
                disabled={isDeleting}
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
