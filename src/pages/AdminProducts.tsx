import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import AdminProductForm from '../components/admin/AdminProductForm';
import { useProducts } from '../context/ProductContext';
import { Product } from '../data/products';
import { Plus, Edit, Eye, EyeOff, Search, Filter, Package, AlertTriangle, TrendingUp, GripVertical, Save } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Reorder } from 'framer-motion';
import { supabase } from '../lib/supabase';

export default function AdminProducts() {
  const { products, addProduct, updateProduct, deleteProduct, fetchProducts } = useProducts();
  const { showToast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [orderedProducts, setOrderedProducts] = useState<Product[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  useEffect(() => {
    setOrderedProducts(products);
  }, [products]);

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

  const filteredProducts = orderedProducts.filter((p) => {
    const searchLower = debouncedSearchTerm.toLowerCase();
    const titleMatch = (p.title || '').toLowerCase().includes(searchLower);
    const subtitleMatch = (p.subtitle || '').toLowerCase().includes(searchLower);
    return titleMatch || subtitleMatch;
  });

  return (
    <AdminLayout>
      <div className="space-y-8">
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
                        <img 
                          src={product.front_image || product.image} 
                          alt={product.title} 
                          className="w-full h-full object-cover" 
                        />
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
    </AdminLayout>
  );
}
