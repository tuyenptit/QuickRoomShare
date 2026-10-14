import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Copy,
  Check,
  Maximize2,
  ExternalLink,
  FileText,
  Link2,
  CheckCircle2,
  Loader2,
  Wifi,
  Eye,
  Edit3,
} from 'lucide-react';
import { extractUrls, getLinkDomain } from '../utils/formatters.ts';
import { SyncStatus } from '../types.ts';

interface NotepadEditorProps {
  initialText: string;
  onSaveText: (newText: string) => void;
  syncStatus: SyncStatus;
  onOpenFullscreen: () => void;
  roomId: string;
}

export const NotepadEditor: React.FC<NotepadEditorProps> = ({
  initialText,
  onSaveText,
  syncStatus,
  onOpenFullscreen,
}) => {
  const [text, setText] = useState<string>(initialText);
  const [copied, setCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    if (initialText !== text) {
      setText(initialText);
    }
  }, [initialText]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onSaveText(val);
    }, 400);
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const detectedLinks = useMemo(() => extractUrls(text), [text]);

  const stats = useMemo(() => {
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text ? text.split('\n').length : 0;
    return { chars, words, lines };
  }, [text]);

  // Helper to render text with clickable links in preview mode
  const renderFormattedText = (raw: string) => {
    if (!raw) return null;
    const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
    const parts = raw.split(urlRegex);

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium underline underline-offset-2 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            <span>{part}</span>
            <ExternalLink className="w-3 h-3 inline-block shrink-0" />
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xs overflow-hidden transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Ghi chú
          </h2>

          <div className="flex items-center gap-1.5 ml-2 text-xs">
            {syncStatus === 'saving' && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Đang lưu...</span>
              </span>
            )}
            {syncStatus === 'saved' && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                <CheckCircle2 className="w-3 h-3" />
                <span>Đã lưu</span>
              </span>
            )}
            {syncStatus === 'synced' && (
              <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 text-[11px] font-medium">
                <Wifi className="w-3 h-3" />
                <span>Realtime</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Toggle View/Edit when links exist */}
          {detectedLinks.length > 0 && (
            <button
              onClick={() => setViewMode(viewMode === 'edit' ? 'preview' : 'edit')}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                viewMode === 'preview'
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              title={viewMode === 'preview' ? 'Chuyển sang soạn thảo' : 'Xem và mở trực tiếp liên kết'}
            >
              {viewMode === 'preview' ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{viewMode === 'preview' ? 'Sửa text' : 'Mở link'}</span>
            </button>
          )}

          <button
            onClick={handleCopyAll}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            title="Sao chép toàn bộ"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Đã chép</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Sao chép</span>
              </>
            )}
          </button>

          <button
            onClick={onOpenFullscreen}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs"
            title="Chiếu toàn màn hình"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Toàn màn hình</span>
          </button>
        </div>
      </div>

      {/* Clickable links strip */}
      {detectedLinks.length > 0 && (
        <div className="px-3 py-1.5 bg-indigo-50/40 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/30 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium shrink-0 text-[11px]">
            <Link2 className="w-3 h-3" />
            <span>Mở liên kết ({detectedLinks.length}):</span>
          </span>
          <div className="flex items-center gap-1.5">
            {detectedLinks.map((link, idx) => (
              <a
                key={idx}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 rounded border border-indigo-200/60 dark:border-indigo-800 text-[11px] hover:bg-indigo-50 dark:hover:bg-neutral-700 transition-colors shrink-0 max-w-xs truncate"
                title={link}
              >
                <span className="truncate">{getLinkDomain(link)}</span>
                <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="relative flex-1 p-3.5 flex flex-col min-h-[300px] overflow-y-auto">
        {viewMode === 'preview' ? (
          <div className="w-full flex-1 whitespace-pre-wrap text-sm md:text-base text-neutral-800 dark:text-neutral-100 leading-relaxed font-sans select-text">
            {text ? renderFormattedText(text) : <span className="text-neutral-400 italic">Trống</span>}
          </div>
        ) : (
          <textarea
            value={text}
            onChange={handleChange}
            placeholder="Nhập hoặc dán nội dung tại đây (link họp, văn bản, ghi chú)..."
            className="w-full flex-1 resize-none bg-transparent text-sm md:text-base text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 outline-none leading-relaxed font-sans"
            spellCheck={false}
          />
        )}
      </div>

      {/* Footer Metrics */}
      <div className="px-3.5 py-1.5 border-t border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/40 dark:bg-neutral-950/20 flex items-center justify-end text-[11px] font-mono text-neutral-400 dark:text-neutral-500 tabular-nums">
        <span>{stats.words} từ</span>
        <span className="mx-1.5">·</span>
        <span>{stats.chars} ký tự</span>
        <span className="mx-1.5">·</span>
        <span>{stats.lines} dòng</span>
      </div>
    </div>
  );
};
