import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';

export default function PaymentFail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const code = searchParams.get('code');
  const message = searchParams.get('message');
  const orderId = searchParams.get('orderId');

  return (
    <div className="min-h-screen bg-[#0F0F11] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#1C1C1E] rounded-3xl p-8 text-center shadow-2xl border border-red-500/20">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          <XCircle size={40} className="text-red-500" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 tracking-tight">결제에 실패했습니다</h1>
        <p className="text-zinc-400 mb-8 text-sm md:text-base">
          {message || '알 수 없는 오류가 발생했습니다.'}<br/>
          (에러 코드: {code})
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex-1 h-14 bg-[#2C2C2E] text-white font-semibold rounded-2xl hover:bg-[#3C3C3E] transition-colors"
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
