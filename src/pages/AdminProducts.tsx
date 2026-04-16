import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import AdminProductForm from '../components/admin/AdminProductForm';
import { useProducts } from '../context/ProductContext';
import { Product } from '../data/products';
import { Plus, Edit, Eye, EyeOff, Search, Filter, Package, AlertTriangle, TrendingUp, GripVertical, Save } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Reorder } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { getFullImageUrl } from '../lib/utils';

import LoadingScreen from '../components/LoadingScreen';

export default function AdminProducts() {
  const { products, addProduct, updateProduct, deleteProduct, fetchProducts, isLoading, customBasePrice, updateCustomBasePrice } = useProducts();
  const { showToast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [orderedProducts, setOrderedProducts] = useState<Product[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [tempPrice, setTempPrice] = useState(customBasePrice.toString());
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  useEffect(() => {
    setOrderedProducts(products);
  }, [products]);

  useEffect(() => {
    setTempPrice(customBasePrice.toString());
  }, [customBasePrice]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleAddClick = () => {
    setEditingProduct(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setIsFormOpen(true);
  };

  const handleVisibilityToggle = async (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    
    // 1. 현재 상태 저장 (롤백용)
    const previousProducts = [...orderedProducts];
    const isVisible = product.is_visible !== false; // 기본값 true
    const newVisibility = !isVisible;

    // 2. Optimistic Update: UI 즉시 반영
    setOrderedProducts(prev => 
      prev.map(p => p.id === product.id ? { ...p, is_visible: newVisibility } : p)
    );

    try {
      // 3. Supabase 직접 호출 (컬럼명 매칭: is_visible)
      // DB 컬럼명과 UI 상태 모두 'is_visible'을 사용함
      const { error } = await supabase
        .from('products')
        .update({ is_visible: newVisibility })
        .eq('id', product.id);

      if (error) throw error;

      showToast(newVisibility ? "상품이 노출되었습니다." : "상품이 숨겨졌습니다.", 'success');
    } catch (error: any) {
      setOrderedProducts(previousProducts);
      showToast('잠시 후 다시 시도해주세요.', 'error');
    }
  };

  const handleSave = async () => {
    await fetchProducts();
    setIsFormOpen(false);
    setEditingProduct(null);
  };

  const handleSaveOrder = async () => {
    setIsSavingOrder(true);
    try {
      const updates = orderedProducts.map((product, index) => ({
        id: product.id,
        display_order: index,
      }));

      const { error } = await supabase
        .from('products')
        .upsert(updates, { onConflict: 'id' });

      if (error) throw error;
      showToast('상품 순서가 저장되었습니다.', 'success');
      await fetchProducts();
    } catch (error) {
      showToast('잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleUpdatePrice = async () => {
    const price = parseInt(tempPrice);
    if (isNaN(price)) {
      showToast('올바른 금액을 입력해주세요.', 'error');
      return;
    }

    setIsSavingPrice(true);
    try {
      await updateCustomBasePrice(price);
      showToast('커스텀 제작 기본가가 저장되었습니다.', 'success');
    } catch (error) {
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingPrice(false);
    }
  };

  const filteredProducts = orderedProducts.filter((p) => {
    const searchLower = debouncedSearchTerm.toLowerCase();
    const titleMatch = (p.title || '').toLowerCase().includes(searchLower);
    const subtitleMatch = (p.subtitle || '').toLowerCase().includes(searchLower);
    return titleMatch || subtitleMatch;
  });

  if (isLoading && products.length === 0) {
    return <LoadingScreen />;
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* 커스텀 제작 기본가 설정 */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">커스텀 제작 기본가 설정</h3>
              <p className="text-sm text-zinc-500">워크숍에서 커스텀 액자 제작 시 적용되는 기본 금액입니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">₩</span>
                <input
                  type="number"
                  value={tempPrice}
                  onChange={(e) => setTempPrice(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-4 py-2 text-white w-32 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <button
                onClick={handleUpdatePrice}
                disabled={isSavingPrice}
                className="bg-white text-black px-4 py-2 rounded-lg font-bold text-sm hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {isSavingPrice ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>

        {/* 헤더 및 액션 버튼 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            상품 관리
            <span className="text-sm font-normal text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{products.length}</span>
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveOrder}
              disabled={isSavingOrder}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm active:scale-95 duration-150 disabled:opacity-50"
            >
              <Save size={18} />
              {isSavingOrder ? '저장 중...' : '순서 저장'}
            </button>
            <button
              onClick={handleAddClick}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-lg shadow-indigo-500/20 active:scale-95 duration-150"
            >
              <Plus size={18} />
              신규 상품 등록
            </button>
          </div>
        </div>

        {/* 검색 및 필터 */}
        <div className="flex items-center gap-4 bg-zinc-900 p-4 rounded-xl border border-zinc-800 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="상품명, 작가명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600"
            />
          </div>
          <button className="p-2.5 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">
            <Filter size={18} />
          </button>
        </div>

        {/* 상품 리스트 (Card List) */}
        <div className="max-w-full">
          {filteredProducts.length > 0 ? (
            <Reorder.Group 
              axis="y" 
              values={orderedProducts} 
              onReorder={setOrderedProducts} 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4"
            >
              {filteredProducts.map((product) => {
                const minPrice = product.options && product.options.length > 0 
                  ? Math.min(...product.options.map(opt => opt.price))
                  : 0;

                return (
                  <Reorder.Item 
                    key={product.id} 
                    value={product} 
                    className={`bg-[#1C1C1E] rounded-2xl border border-white/5 p-4 hover:border-white/10 transition-all duration-300 group relative ${product.is_visible === false ? 'opacity-50 grayscale' : ''}`}
                  >
                    <div className="flex gap-4">
                      {/* 좌측: 썸네일 */}
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-zinc-800 border border-white/5 shrink-0">
                        {getFullImageUrl(product.front_image || product.image) ? (
                          <img 
                            src={getFullImageUrl(product.front_image || product.image) || undefined} 
                            alt={product.title} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-700">
                            <Package size={24} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                        
                        {/* 드래그 핸들 (오버레이) */}
                        <div className="absolute top-1 left-1 p-1 bg-black/40 rounded-md text-white/40 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
                          <GripVertical size={14} />
                        </div>
                      </div>

                      {/* 중앙: 정보 */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-bold text-white text-base truncate tracking-tight">
                            {product.title}
                          </h3>
                        </div>
                        <div className="text-sm text-zinc-400 flex items-center gap-2 font-medium">
                          <span>₩{minPrice.toLocaleString()}</span>
                        </div>
                        <div className="text-[10px] text-zinc-600 mt-1 truncate">
                          {product.subtitle || product.artist}
                        </div>
                      </div>

                      {/* 우측 상단: 배지 */}
                      <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
                        <div className="flex gap-1">
                          {product.limited && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 uppercase tracking-wider">
                              LTD
                            </span>
                          )}
                          {product.is_visible === false && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-zinc-800 text-zinc-400 border border-white/5 uppercase tracking-wider">
                              숨김
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 우측 하단: 액션 */}
                      <div className="absolute bottom-4 right-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleVisibilityToggle(e, product)}
                          className={`p-2 rounded-lg transition-all duration-300 active:scale-90 ${
                            product.is_visible !== false 
                              ? 'text-zinc-500 hover:text-purple-400 bg-white/5' 
                              : 'text-purple-400 bg-purple-500/10 border border-purple-500/20'
                          }`}
                          title={product.is_visible !== false ? "노출 중" : "숨김 상태"}
                        >
                          {product.is_visible !== false ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                        <button
                          onClick={() => handleEditClick(product)}
                          className="p-2 text-zinc-500 hover:text-white bg-white/5 hover:bg-indigo-600 rounded-lg transition-all active:scale-90"
                          title="수정"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductToDelete(product);
                          }}
                          className="p-2 text-zinc-500 hover:text-white bg-white/5 hover:bg-red-600 rounded-lg transition-all active:scale-90"
                          title="삭제"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                      </div>
                    </div>
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          ) : (
            <div className="py-20 text-center text-zinc-600 bg-[#1C1C1E] rounded-2xl border border-dashed border-white/5">
              <Search size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">해당 상품명 또는 작가명을 찾을 수 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* 상품 등록/수정 폼 모달 */}
      {isFormOpen && (
        <AdminProductForm
          product={editingProduct}
          onSave={handleSave}
          onClose={() => setIsFormOpen(false)}
        />
      )}

      {/* 상품 삭제 확인 모달 */}
      {productToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">상품 삭제</h3>
            <p className="text-zinc-400 mb-6 text-sm leading-relaxed">
              정말 <span className="text-white font-medium">'{productToDelete.title}'</span> 상품을 삭제하시겠습니까?<br/>
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteProduct(productToDelete.id);
                    showToast('상품이 성공적으로 삭제되었습니다.', 'success');
                  } catch (error: any) {
                    showToast(error.message || '상품 삭제에 실패했습니다.', 'error');
                  } finally {
                    setProductToDelete(null);
                  }
                }}
                className="px-4 py-2 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white transition-colors shadow-lg shadow-red-600/20"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
