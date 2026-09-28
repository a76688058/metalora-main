import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/cn';

export default function PasswordVisibilityToggle({
  visible,
  onToggle,
  dark,
}: {
  visible: boolean;
  onToggle: () => void;
  dark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
      aria-pressed={visible}
      className={cn(
        'absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 focus-ring',
        dark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900',
      )}
    >
      {visible ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
    </button>
  );
}
