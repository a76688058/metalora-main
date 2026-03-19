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
            <p className="text-zinc-500 max-w-md leading-relaxed">
              Crafting the future of digital alchemy through high-fidelity interactions and physical shaders. 
              Redefining the luxury gap in the digital realm.
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
          <h3 className="text-xl font-semibold mb-6">Secure Inquiry</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="Email Address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 focus:border-white/30 outline-none transition-all text-sm"
              />
            </div>
            <div>
              <textarea
                placeholder="Your Message"
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 focus:border-white/30 outline-none transition-all text-sm resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full py-3 rounded-xl bg-white text-black font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={18} />
                  <span>Send Message</span>
                </>
              )}
            </button>
            {status === 'success' && (
              <p className="text-emerald-400 text-xs text-center">Inquiry sent successfully. We will contact you soon.</p>
            )}
            {status === 'error' && (
              <p className="text-rose-400 text-xs text-center">Failed to send. Please try again later.</p>
            )}
          </form>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="max-w-7xl mx-auto px-6 mt-24 pt-8 border-t border-white/5 flex flex-col md:row justify-between items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium">
        <p>© {currentYear} METALORA. ALL RIGHTS RESERVED.</p>
        <div className="flex gap-8">
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-white transition-colors">Cookie Policy</a>
        </div>
      </div>
    </footer>
  );
}
