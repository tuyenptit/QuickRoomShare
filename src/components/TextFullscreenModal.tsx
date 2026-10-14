import React, { useState, useEffect } from 'react';
import { X, Copy, Check, ZoomIn, ZoomOut, Maximize2, Minimize2, ExternalLink } from 'lucide-react';
import { extractUrls, getLinkDomain } from '../utils/formatters.ts';

interface TextFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  text: string;
  roomId: string;
}

export const TextFullscreenModal: React.FC<TextFullscreenModalProps> = ({
  isOpen,
  onClose,
  text,
  roomId,
}) => {
  const [fontSize, setFontSize] = useState<number>(26);
  const [copied, setCopied] = useState<boolean>(false);
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const links = extractUrls(text);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleBrowserFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col transition-colors duration-200 ${
        isDarkTheme ? 'bg-neutral-950 text-neutral-100' : 'bg-white text-neutral-900'
      }`}
    >
      {/* Top Projector Toolbar */}
      <div
        className={`flex items-center justify-between px-6 py-4 border-b ${
          isDarkTheme ? 'border-neutral-800 bg-neutral-900/60' : 'border-neutral-200 bg-neutral-50'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-400">
            Chế độ máy chiếu
          </span>
          <span className="text-sm font-medium opacity-70">
            Phòng: <span className="font-mono font-bold">{roomId}</span>
          </span>
        </div>

        {/* Zoom & Display Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-neutral-200/50 dark:bg-neutral-800/80">
            <button
              onClick={() => setFontSize((s) => Math.max(16, s - 3))}
              title="Giảm cỡ chữ"
              className="p-1.5 rounded hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-medium px-2">{fontSize}px</span>
            <button
              onClick={() => setFontSize((s) => Math.min(52, s + 3))}
              title="Tăng cỡ chữ"
              className="p-1.5 rounded hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setIsDarkTheme(!isDarkTheme)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {isDarkTheme ? 'Giao diện sáng' : 'Giao diện tối'}
          </button>

          <button
            onClick={toggleBrowserFullscreen}
            className="p-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title="Toàn màn hình trình duyệt"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Đã sao chép' : 'Sao chép tất cả'}</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8 md:p-14 max-w-5xl mx-auto w-full">
        {text ? (
          <pre
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
            className="whitespace-pre-wrap font-sans font-normal selection:bg-indigo-500 selection:text-white"
          >
            {text}
          </pre>
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-400 italic text-lg">
            Chưa có nội dung ghi chú trong phòng...
          </div>
        )}
      </div>

      {/* Quick Launch Links in Footer */}
      {links.length > 0 && (
        <div
          className={`p-4 border-t flex items-center gap-3 overflow-x-auto ${
            isDarkTheme ? 'border-neutral-800 bg-neutral-900/80' : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <span className="text-xs font-medium text-neutral-400 shrink-0">Các liên kết trong phòng:</span>
          {links.map((link, i) => (
            <a
              key={i}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors shrink-0"
            >
              <span>{getLinkDomain(link)}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
