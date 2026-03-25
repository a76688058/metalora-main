import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function WorkshopAI() {
  const navigate = useNavigate();
  return (
    <div className="h-screen w-full bg-black flex flex-col font-mono text-[#A0A0A0]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-[60px] border-b border-white/10 flex items-center px-6 bg-black/80 backdrop-blur-md z-50">
        <button 
          onClick={() => navigate(-1)} 
          className="p-2 -ml-2 hover:bg-white/5 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90"
        >
          <ChevronLeft size={24} />
        </button>
        
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
          <h1 className="text-xl font-black tracking-tighter text-white uppercase">커스텀 공방</h1>
          <div className="text-[10px] tracking-[0.3em] font-bold text-[#8A2BE2] -mt-1">AI_CREATIVE_PRODUCTION</div>
        </div>

        <div className="ml-auto text-[0.75rem] tracking-widest uppercase hidden sm:block">
          SYSTEM_READY
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center gap-4 pt-[60px]">
        <div className="text-[0.75rem] tracking-[0.5em] text-[#8A2BE2] animate-pulse">INITIALIZING_AI_CREATIVE_ENGINE...</div>
        <div className="text-[0.6rem] text-white/20 uppercase">AI Creative mode is under maintenance.</div>
      </main>
    </div>
  );
}
