import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function PaymentFail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  
  const code = searchParams.get('code');
  const message = searchParams.get('message');
  const orderId = searchParams.get('orderId');

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F0F11]' : 'bg-white'}`}>
      <div className={`max-w-md w-full rounded-3xl p-8 text-center shadow-2xl border transition-colors duration-500 ${
        theme === 'dark' ? 'bg-[#1C1C1E] border-red-500/20' : 'bg-zinc-50 border-red-500/10'
      }`}>
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border ${
          theme === 'dark' ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50/50 border-red-500/10'
        }`}>
          <XCircle size={40} className="text-red-500" />
        </div>
        <h1 className={`text-2xl md:text-3xl font-bold mb-4 tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>결제에 실패했습니다</h1>
        <p className={`mb-8 text-sm md:text-base ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
          {message || '알 수 없는 오류가 발생했습니다.'}<br/>
          (에러 코드: {code})
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/')}
            className={`flex-1 h-14 font-semibold rounded-2xl transition-colors ${
              theme === 'dark' ? 'bg-[#2C2C2E] text-white hover:bg-[#3C3C3E]' : 'bg-zinc-200 text-black hover:bg-zinc-300'
            }`}
          >
            홈으로
          </button>
          <button
            onClick={() => navigate(-1)}
            className="flex-1 h-14 btn-cyberpunk text-white font-bold text-lg rounded-2xl"
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}
