import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { supabase } from '../lib/supabase';
import { Search, Filter, TrendingUp, Users, ArrowUpDown, X, Save, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../context/ToastContext';
import LoadingScreen from '../components/LoadingScreen';

interface Profile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  zip_code: string | null;
  address: string | null;
  address_detail: string | null;
  total_spent: number;
  updated_at: string;
}

export default function AdminUsers() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal State
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editData, setEditData] = useState({
    full_name: '',
    phone_number: '',
    zip_code: '',
    address: '',
    address_detail: ''
  });

  useEffect(() => {
    fetchUsers();

    // Real-time Sync
    const channel = supabase
      .channel('public:profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUsers = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('total_spent', { ascending: sortOrder === 'asc' });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      // Silent error
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newOrder);
    setUsers([...users].sort((a, b) => {
      if (newOrder === 'asc') return a.total_spent - b.total_spent;
      return b.total_spent - a.total_spent;
    }));
  };

  const handleRowClick = (user: Profile) => {
    setSelectedUser(user);
    setEditData({
      full_name: user.full_name || '',
      phone_number: user.phone_number || '',
      zip_code: user.zip_code || '',
      address: user.address || '',
      address_detail: user.address_detail || ''
    });
    setIsModalOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!selectedUser || !supabase) return;

    try {
      setIsUpdating(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editData.full_name,
          phone_number: editData.phone_number,
          zip_code: editData.zip_code,
          address: editData.address,
          address_detail: editData.address_detail,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      showToast('회원 정보가 수정되었습니다.', 'success');
      setIsModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      showToast('수정 실패: ' + error.message, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredUsers = (users || []).filter((u) =>
    (u?.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (u?.phone_number || '').includes(searchTerm)
  );

  const totalMembers = users?.length || 0;
  const totalRevenue = (users || []).reduce((acc, u) => acc + (u?.total_spent || 0), 0);
  const vvipCount = (users || []).filter(u => (u?.total_spent || 0) >= 1000000).length;

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* 상단 통계 대시보드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 shadow-lg">
            <div className="flex justify-between items-start mb-2">
              <span className="text-zinc-400 text-sm font-medium">총 회원 수</span>
              <Users className="text-indigo-400" size={20} />
            </div>
            <div className="text-2xl font-bold text-white">{totalMembers.toLocaleString()} <span className="text-sm font-normal text-zinc-500">명</span></div>
          </div>
          <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 shadow-lg">
            <div className="flex justify-between items-start mb-2">
              <span className="text-zinc-400 text-sm font-medium">VVIP 유저 (100만 이상)</span>
              <TrendingUp className="text-yellow-400" size={20} />
            </div>
            <div className="text-2xl font-bold text-white">{vvipCount.toLocaleString()} <span className="text-sm font-normal text-zinc-500">명</span></div>
          </div>
          <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 shadow-lg">
            <div className="flex justify-between items-start mb-2">
              <span className="text-zinc-400 text-sm font-medium">총 누적 결제액 (LTV)</span>
              <TrendingUp className="text-green-400" size={20} />
            </div>
            <div className="text-2xl font-bold text-white">₩{totalRevenue.toLocaleString()}</div>
          </div>
        </div>

        {/* 헤더 및 액션 버튼 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            회원 관리
            <span className="text-sm font-normal text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{totalMembers}</span>
          </h2>
        </div>

        {/* 검색 및 필터 */}
        <div className="flex items-center gap-4 bg-zinc-900 p-4 rounded-xl border border-zinc-800 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="이름, 연락처 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600"
            />
          </div>
          <button className="p-2.5 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">
            <Filter size={18} />
          </button>
        </div>

        {/* 회원 리스트 테이블 */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-400">
              <thead className="bg-zinc-800/80 text-xs uppercase font-medium text-zinc-500 border-b border-zinc-800 backdrop-blur-sm">
                <tr>
                  <th className="px-6 py-4">회원 정보</th>
                  <th className="px-6 py-4">연락처</th>
                  <th className="px-6 py-4">배송지</th>
                  <th className="px-6 py-4 cursor-pointer hover:text-white transition-colors" onClick={toggleSort}>
                    <div className="flex items-center gap-2">
                      누적 결제액 (LTV)
                      <ArrowUpDown size={14} className={sortOrder === 'desc' ? 'text-indigo-400' : 'text-zinc-500'} />
                    </div>
                  </th>
                  <th className="px-6 py-4">가입/수정일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <LoadingScreen />
                    </td>
                  </tr>
                ) : !filteredUsers || filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-24 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-2">
                          <Users size={32} className="text-zinc-600" />
                        </div>
                        <p className="text-zinc-400 font-medium text-lg">등록된 회원이 없습니다.</p>
                        <p className="text-zinc-600 text-sm">검색 조건을 변경하거나 나중에 다시 확인해주세요.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr 
                      key={user.id} 
                      onClick={() => handleRowClick(user)}
                      className="hover:bg-zinc-800/40 transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="font-bold text-white text-base mb-0.5 flex items-center gap-2">
                          {user?.full_name || '미입력'}
                          {(user?.total_spent || 0) >= 1000000 && (
                            <span className="text-[10px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-1.5 py-0.5 rounded font-bold">VVIP</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500">
                          ID: {user?.id?.substring(0, 8) || 'unknown'}...
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {user?.phone_number || '-'}
                      </td>
                      <td className="px-6 py-4 max-w-xs truncate" title={`${user?.address || ''} ${user?.address_detail || ''}`}>
                        {user?.address ? `${user.address} ${user.address_detail || ''}`.trim() : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-white">₩{(user?.total_spent || 0).toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-500">
                        {user?.updated_at ? new Date(user.updated_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 회원 상세 정보 모달 */}
      <AnimatePresence>
        {isModalOpen && selectedUser && (
          <div className="fixed inset-0 w-screen h-screen h-[100dvh] z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50">
                <h3 className="text-xl font-bold text-white">회원 상세 정보</h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">이름</label>
                    <input
                      type="text"
                      value={editData.full_name}
                      onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">연락처</label>
                    <input
                      type="text"
                      value={editData.phone_number}
                      onChange={(e) => setEditData({ ...editData, phone_number: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">우편번호</label>
                  <input
                    type="text"
                    value={editData.zip_code}
                    onChange={(e) => setEditData({ ...editData, zip_code: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">기본 주소</label>
                  <input
                    type="text"
                    value={editData.address}
                    onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">상세 주소</label>
                  <input
                    type="text"
                    placeholder={editData.address_detail ? "" : "상세 주소 없음"}
                    value={editData.address_detail}
                    onChange={(e) => setEditData({ ...editData, address_detail: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600"
                  />
                  {!editData.address_detail && (
                    <p className="text-[10px] text-zinc-600 ml-1 italic">- 상세 주소 정보가 없습니다.</p>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-800">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-500">누적 결제액</span>
                    <span className="text-white font-bold">₩{(selectedUser?.total_spent || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-2">
                    <span className="text-zinc-500">최근 업데이트</span>
                    <span className="text-zinc-400">{selectedUser?.updated_at ? new Date(selectedUser.updated_at).toLocaleString() : '-'}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-zinc-800/30 border-t border-zinc-800 flex gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 text-zinc-400 font-bold rounded-xl hover:bg-zinc-700 transition-all active:scale-95"
                >
                  취소
                </button>
                <button
                  onClick={handleUpdateUser}
                  disabled={isUpdating}
                  className="flex-1 px-4 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  저장하기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
