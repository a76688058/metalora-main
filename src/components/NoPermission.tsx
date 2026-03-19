import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export default function NoPermission() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl"
      >
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 mb-6">
          <ShieldAlert className="text-red-500" size={40} />
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-4">접근 권한이 없습니다</h1>
        <p className="text-zinc-400 mb-8 leading-relaxed">
          이 페이지에 접근할 수 있는 권한이 없습니다.<br />
          관리자 계정으로 로그인되어 있는지 확인해주세요.
        </p>
        
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors font-medium"
          >
            <ArrowLeft size={18} />
            <span>뒤로가기</span>
          </button>
          <Link 
            to="/"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-black hover:bg-zinc-200 rounded-xl transition-colors font-bold"
          >
            <Home size={18} />
            <span>홈으로</span>
          </Link>
        </div>
        
        <div className="mt-8 pt-8 border-t border-zinc-800">
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium underline underline-offset-4">
            다른 계정으로 로그인하기
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
