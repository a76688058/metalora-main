import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface OrderStepperProps {
  status: string;
}

export const OrderStepper = ({ status }: OrderStepperProps) => {
  const { theme } = useTheme();
  const steps = [
    { label: '결제확인', desc: '주문이 성공적으로 접수되었습니다.' },
    { label: '제작/검수 중', desc: '정성껏 제품을 제작하고 검수하고 있습니다.' },
    { label: '배송 중', desc: '제품이 배송지로 이동하고 있습니다.' },
    { label: '배송완료', desc: '배송이 완료되었습니다. 감사합니다.' },
  ];

  const getActiveStep = (value: string) => {
    switch (value) {
      case 'PAID':
      case '결제확인':
      case '결제완료': return 0;
      case 'PRODUCTION':
      case '제작중':
      case '제작/검수 중': return 1;
      case 'SHIPPING':
      case '배송중':
      case '배송 중': return 2;
      case 'COMPLETED':
      case '배송완료':
      case '구매확정': return 3;
      default: return -1;
    }
  };

  const activeIndex = getActiveStep(status);
  const progress = activeIndex <= 0 ? 0 : (activeIndex / (steps.length - 1)) * 100;
  const ink = theme === 'dark' ? 'bg-[#f3f1ec]' : 'bg-[#16150f]';
  const rule = theme === 'dark' ? 'bg-white/15' : 'bg-black/10';
  const secondary = theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]';

  return (
    <div className="relative">
      <div className={`absolute left-[3px] top-2 bottom-2 w-px ${rule}`}>
        <div className={`w-px ${ink}`} style={{ height: `${progress}%` }} />
      </div>
      <ol className="space-y-6">
        {steps.map((step, idx) => {
          const isCompleted = idx < activeIndex;
          const isActive = idx === activeIndex;
          const marked = isCompleted || isActive;
          return (
            <li key={step.label} className="relative flex gap-4">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${marked ? ink : `border ${theme === 'dark' ? 'border-white/35 bg-[#101114]' : 'border-black/25 bg-[#f6f4ef]'}`}`}
              />
              <div className="min-w-0">
                <p className={`text-sm ${isActive ? 'font-medium' : secondary}`}>
                  {step.label}
                </p>
                <p className={`mt-1 text-sm leading-relaxed ${secondary}`}>
                  {step.desc}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
