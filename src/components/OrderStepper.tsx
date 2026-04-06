import React from 'react';
import { motion } from 'framer-motion';
import { Check, Package, Hammer, Truck, CheckCircle2 } from 'lucide-react';

interface OrderStepperProps {
  status: string;
}

export const OrderStepper = ({ status }: OrderStepperProps) => {
  const steps = [
    { label: '결제확인', desc: '주문이 성공적으로 접수되었습니다.', icon: Check },
    { label: '제작/검수 중', desc: '정성껏 제품을 제작하고 검수하고 있습니다.', icon: Hammer },
    { label: '배송 중', desc: '제품이 배송지로 이동하고 있습니다.', icon: Truck },
    { label: '배송완료', desc: '배송이 완료되었습니다. 감사합니다.', icon: CheckCircle2 },
  ];
  
  const getActiveStep = (status: string) => {
    switch (status) {
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

  return (
    <div className="w-full py-4 px-2">
      <div className="relative space-y-10">
        {/* Vertical Connecting Line */}
        <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-zinc-800 z-0">
          <motion.div 
            initial={{ height: 0 }}
            animate={{ height: `${(activeIndex / (steps.length - 1)) * 100}%` }}
            className="w-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
            transition={{ duration: 1, ease: "easeInOut" }}
          />
        </div>
        
        {steps.map((step, idx) => {
          const isCompleted = idx < activeIndex;
          const isActive = idx === activeIndex;
          const StepIcon = step.icon;
          
          return (
            <div key={step.label} className="relative z-10 flex items-start gap-6 group">
              {/* Indicator Circle */}
              <div className="relative flex-shrink-0 mt-1">
                <motion.div 
                  animate={isActive ? {
                    scale: [1, 1.15, 1],
                    boxShadow: [
                      "0 0 0px rgba(99, 102, 241, 0)",
                      "0 0 20px rgba(99, 102, 241, 0.4)",
                      "0 0 0px rgba(99, 102, 241, 0)"
                    ]
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${
                    isActive 
                      ? 'bg-indigo-600 border-indigo-400 text-white' 
                      : isCompleted 
                        ? 'bg-zinc-800 border-zinc-700 text-indigo-400' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-700'
                  }`}
                >
                  {isCompleted ? (
                    <Check size={16} strokeWidth={3} />
                  ) : (
                    <StepIcon size={16} strokeWidth={isActive ? 2.5 : 2} />
                  )}
                </motion.div>

                {/* Breathing Aura for Active Step */}
                {isActive && (
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0.5 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                    className="absolute inset-0 bg-indigo-500 rounded-full -z-10"
                  />
                )}
              </div>

              {/* Text Content */}
              <div className="flex flex-col gap-1 pt-0.5">
                <h4 className={`text-sm font-black tracking-tight transition-colors duration-500 ${
                  isActive ? 'text-white' : isCompleted ? 'text-zinc-300' : 'text-zinc-600'
                }`}>
                  {step.label}
                </h4>
                <p className={`text-[11px] font-medium leading-relaxed transition-colors duration-500 ${
                  isActive ? 'text-zinc-400' : 'text-zinc-700'
                }`}>
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
