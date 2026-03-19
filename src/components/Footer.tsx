import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Github, Twitter, Instagram, Mail } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message }),
      });

      if (response.ok) {
        setStatus('success');
        setEmail('');
        setMessage('');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Contact form error:', error);
      setStatus('error');
    }
  };

  return (
    <footer className="relative bg-black border-t border-white/5 pt-24 pb-12 overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16">
        {/* Brand Section */}
        <div className="space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl font-extrabold tracking-tighter">METALORA</h2>
            <p className="text-zinc-500 max-w-md leading-relaxed font-light">
              디지털 연금술의 미래를 개척합니다.<br/>고감도 인터랙션과 물리 기반 셰이더를 통해 디지털 영역의 럭셔리 갭을 재정의합니다.
            </p>
          </div>

          <div className="flex gap-6">
            <a href="#" className="text-zinc-500 hover:text-white transition-colors"><Twitter size={20} /></a>
            <a href="#" className="text-zinc-500 hover:text-white transition-colors"><Github size={20} /></a>
            <a href="#" className="text-zinc-500 hover:text-white transition-colors"><Instagram size={20} /></a>
            <a href="#" className="text-zinc-500 hover:text-white transition-colors"><Mail size={20} /></a>
          </div>
        </div>

        {/* Contact Form Section */}
        <div className="relative p-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
          <h3 className="text-xl font-extrabold mb-6">보안 문의</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="이메일 주소"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 focus:border-white/30 outline-none transition-all text-sm font-light"
              />
            </div>
            <div>
              <textarea
                placeholder="문의 내용"
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 focus:border-white/30 outline-none transition-all text-sm resize-none font-light"
              />
            </div>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full py-3 rounded-xl bg-white text-black font-extrabold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={18} />
                  <span>메시지 전송</span>
                </>
              )}
            </button>
            {status === 'success' && (
              <p className="text-emerald-400 text-xs text-center font-light">문의가 성공적으로 전송되었습니다. 곧 연락드리겠습니다.</p>
            )}
            {status === 'error' && (
              <p className="text-rose-400 text-xs text-center font-light">전송에 실패했습니다. 나중에 다시 시도해주세요.</p>
            )}
          </form>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="max-w-7xl mx-auto px-6 mt-24 pt-8 border-t border-white/5 flex flex-col md:row justify-between items-center gap-4 text-[10px] uppercase tracking-[0.4em] text-zinc-600 font-medium">
        <p>© {currentYear} METALORA. ALL RIGHTS RESERVED.</p>
        <div className="flex gap-8">
          <a href="#" className="hover:text-white transition-colors">개인정보 처리방침</a>
          <a href="#" className="hover:text-white transition-colors">이용약관</a>
          <a href="#" className="hover:text-white transition-colors">쿠키 정책</a>
        </div>
      </div>
    </footer>
  );
}
