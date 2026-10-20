import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

/**
 * Toss TEST redirect target for card screening.
 * Does not call /api/payment/confirm and does not create an order.
 */
export default function ScreeningPaymentResult({ outcome }: { outcome: 'success' | 'fail' }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const orderId = searchParams.get('orderId');
  const dark = theme === 'dark';

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${dark ? 'bg-[#0F0F11] text-[#f3f1ec]' : 'bg-[#f6f4ef] text-[#16150f]'}`}>
      <div className={`max-w-md w-full border p-8 ${dark ? 'border-white/10 bg-[#16171c]' : 'border-black/10 bg-white'}`}>
        <p className="text-sm font-medium">카드사 심사 테스트</p>
        <h1 className="mt-3 text-2xl font-medium tracking-[-0.03em]">
          {outcome === 'success' ? '테스트 결제가 완료되었습니다' : '테스트 결제가 완료되지 않았습니다'}
        </h1>
        <p className={`mt-4 text-sm leading-relaxed ${dark ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
          이 화면은 심사 테스트 결과입니다. 실제 주문과 배송은 만들어지지 않습니다.
        </p>
        {orderId?.startsWith('MLSCRN-') ? (
          <p className={`mt-4 text-sm break-all ${dark ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>테스트 주문번호 {orderId}</p>
        ) : null}
        <button
          type="button"
          onClick={() => navigate('/')}
          className={`mt-8 h-12 w-full rounded-[2px] font-medium ${dark ? 'bg-[#f2f0ea] text-[#16150f]' : 'bg-[#1a1914] text-[#f4f1eb]'}`}
        >
          홈으로
        </button>
      </div>
    </div>
  );
}
