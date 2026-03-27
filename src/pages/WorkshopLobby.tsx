import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { Layout, Columns, Wand2, ChevronRight } from 'lucide-react';
import Header from '../components/Header';

interface RecentProject {
  id: string;
  serial_number: string;
  process_type: string;
  project_name: string;
}

export default function WorkshopLobby() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [recentProject, setRecentProject] = useState<RecentProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchRecentProject() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('user_collections')
          .select('id, serial_number, fx_config')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          setRecentProject({
            id: data.id,
            serial_number: data.serial_number,
            process_type: data.fx_config?.shaderType || 'AI 창작 제작',
            project_name: '네온 사자' 
          });
        }
      } catch (err) {
        console.error('Error fetching recent project:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRecentProject();
  }, [user]);

  const workshopMenus = [
    {
      id: 'single',
      title: '싱글 제작',
      description: '사진 한 장으로 만드는 마스터피스',
      icon: <Layout size={24} className="text-white" />,
      path: '/workshop/single',
      isReady: true
    },
    {
      id: 'dual',
      title: '듀얼 비교 제작',
      description: '두 장을 비교하며 최적의 결과 찾기',
      icon: <Columns size={24} className="text-white" />,
      path: '/workshop/dual',
      isReady: false
    },
    {
      id: 'ai',
      title: 'AI 창작 제작',
      description: '프롬프트로 새로운 이미지 연성하기',
      icon: <Wand2 size={24} className="text-[#8A2BE2]" />,
      path: '/workshop/ai',
      isReady: false
    }
  ];

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col">
      <Header />
      
      <motion.main 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex-1 w-full max-w-2xl mx-auto pt-24 pb-20 px-6"
      >
        {/* Header Section */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {profile?.full_name || user?.email?.split('@')[0]}님, 반갑습니다.
          </h1>
          <p className="text-lg text-zinc-500 mt-2">
            어떤 작업을 시작할까요?
          </p>
        </header>

        {/* Remind Card */}
        {!isLoading && recentProject && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 rounded-3xl p-6 mb-10 flex justify-between items-center cursor-pointer hover:bg-zinc-800 transition-colors border border-white/5"
            onClick={() => showToast('해당 기능은 준비 중입니다.', 'info')}
          >
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-[#8A2BE2] shadow-[0_0_10px_rgba(138,43,226,0.5)]" />
              <span className="text-[1rem] font-medium text-zinc-200">
                작업 중인 '{recentProject.project_name}'가 있어요
              </span>
            </div>
            <div className="flex items-center gap-1 text-zinc-500 text-sm font-medium">
              이어서 하기 <ChevronRight size={16} />
            </div>
          </motion.div>
        )}

        {/* Menu List */}
        <div className="flex flex-col gap-5">
          {workshopMenus.map((menu) => (
            <motion.button
              key={menu.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => menu.isReady ? navigate(menu.path) : showToast('해당 기능은 준비 중입니다.', 'info')}
              className="w-full bg-zinc-900/40 hover:bg-zinc-900 transition-all duration-300 rounded-[2.5rem] p-8 flex items-center justify-between text-left group border border-white/5 hover:border-white/10 relative overflow-hidden"
            >
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-3xl bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                  {menu.icon}
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1 text-white">{menu.title}</h3>
                  <p className="text-zinc-500 text-[0.95rem] font-medium">{menu.description}</p>
                </div>
              </div>
              {!menu.isReady && (
                <div className="absolute top-0 right-0 bg-zinc-800 text-zinc-400 text-[10px] px-3 py-1.5 rounded-bl-xl border-b border-l border-zinc-700 font-bold">
                  준비 중
                </div>
              )}
              <ChevronRight size={24} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
            </motion.button>
          ))}
        </div>
      </motion.main>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        body {
          font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
          background-color: #000;
        }
      `}} />
    </div>
  );
}
