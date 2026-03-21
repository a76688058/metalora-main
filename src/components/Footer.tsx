import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Github, Twitter, Instagram, Mail } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative bg-black pt-24 pb-12 overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="max-w-7xl mx-auto px-6 flex flex-col items-center text-center space-y-12">
        {/* Brand Section */}
        <div className="space-y-6">
          <h2 className="text-3xl font-extrabold tracking-tighter text-white">METALORA</h2>
          <p className="text-zinc-500 max-w-md mx-auto leading-relaxed font-light text-sm">
            디지털 연금술의 미래를 개척합니다.<br/>고감도 인터랙션과 물리 기반 셰이더를 통해 디지털 영역의 럭셔리 갭을 재정의합니다.
          </p>
        </div>

        <div className="flex gap-8 justify-center">
          <a href="#" className="text-zinc-600 hover:text-white transition-colors"><Twitter size={18} /></a>
          <a href="#" className="text-zinc-600 hover:text-white transition-colors"><Github size={18} /></a>
          <a href="#" className="text-zinc-600 hover:text-white transition-colors"><Instagram size={18} /></a>
          <a href="#" className="text-zinc-600 hover:text-white transition-colors"><Mail size={18} /></a>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="max-w-7xl mx-auto px-6 mt-24 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] uppercase tracking-[0.4em] text-zinc-600 font-medium">
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
