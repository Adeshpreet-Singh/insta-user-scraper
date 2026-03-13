'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mail, Phone, MessageCircle, Copy, Check, Eye, ExternalLink } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ContactItemProps {
  type: 'email' | 'phone' | 'whatsapp';
  value: string;
}

const ContactItem = ({ type, value }: ContactItemProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const icons = {
    email: <Mail className="w-4 h-4" />,
    phone: <Phone className="w-4 h-4" />,
    whatsapp: <MessageCircle className="w-4 h-4" />,
  };

  const colors = {
    email: "text-blue-400 border-blue-500/30 hover:bg-blue-500/10",
    phone: "text-amber-400 border-amber-500/30 hover:bg-amber-500/10",
    whatsapp: "text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10",
  };

  const popupColors = {
    email: "bg-blue-950/90 border-blue-500/30",
    phone: "bg-amber-950/90 border-amber-500/30",
    whatsapp: "bg-emerald-950/90 border-emerald-500/30",
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-200",
          isOpen ? "scale-110 ring-2 ring-white/10" : "scale-100",
          colors[type],
          !isOpen && "bg-slate-800/40"
        )}
        title={type.charAt(0).toUpperCase() + type.slice(1)}
      >
        {icons[type]}
      </button>

      {isOpen && (
        <div className={cn(
          "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[200px] p-2 rounded-xl border backdrop-blur-md shadow-2xl animate-in fade-in zoom-in duration-200",
          popupColors[type]
        )}>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11px] font-mono whitespace-nowrap overflow-hidden text-ellipsis select-all text-white/90 px-1">
              {value}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  copied ? "bg-green-500/20 text-green-400" : "hover:bg-white/10 text-white/40 hover:text-white"
                )}
                title="Copy"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {type === 'whatsapp' && (
                <a
                  href={`https://wa.me/${value.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all"
                  title="Open Chat"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
          {/* Arrow */}
          <div className={cn(
            "absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b",
            popupColors[type],
            "border-t-0 border-l-0 -mt-[4.5px]"
          )} />
        </div>
      )}
    </div>
  );
};

interface ContactRevealProps {
  emails?: string[];
  phones?: string[];
  whatsapp?: string[];
}

export default function ContactReveal({ emails = [], phones = [], whatsapp = [] }: ContactRevealProps) {
  const hasContacts = emails.length > 0 || phones.length > 0 || whatsapp.length > 0;

  if (!hasContacts) {
    return (
      <div className="flex items-center justify-center p-2 border border-dashed border-slate-800/50 rounded-full w-8 h-8 opacity-30">
        <Eye className="w-3 h-3 text-slate-500" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {whatsapp.map((wa, i) => (
        <ContactItem key={`wa-${i}`} type="whatsapp" value={wa} />
      ))}
      {emails.map((email, i) => (
        <ContactItem key={`email-${i}`} type="email" value={email} />
      ))}
      {phones.map((phone, i) => (
        <ContactItem key={`phone-${i}`} type="phone" value={phone} />
      ))}
    </div>
  );
}
