import React from 'react';
import { Moon, Sun, ArrowLeft, QrCode, Share2, Copy, Check, Trash2, Lock } from 'lucide-react';

interface HeaderProps {
  currentRoomId?: string | null;
  hasPassword?: boolean;
  onGoHome?: () => void;
  onCopyLink?: () => void;
  copiedLink?: boolean;
  onOpenQR?: () => void;
  onClearRoom?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRoomId,
  hasPassword,
  onGoHome,
  onCopyLink,
  copiedLink,
  onOpenQR,
  onClearRoom,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-3.5 sm:px-6 py-2.5 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 transition-colors">
      {/* Brand: Logo + QuickRoom Share */}
      <div className="flex items-center gap-3">
        <button
          onClick={onGoHome}
          className="flex items-center gap-2 group focus:outline-hidden"
          title="Về trang chủ"
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-2xs group-hover:bg-indigo-500 transition-colors">
            <Share2 className="w-3.5 h-3.5" />
          </div>
          <span className="text-base font-bold tracking-tight text-neutral-900 dark:text-white whitespace-nowrap">
            QuickRoom Share
          </span>
        </button>

        {/* Current Room Badge + Lock icon if has password */}
        {currentRoomId && (
          <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-neutral-200 dark:border-neutral-800">
            <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/50 dark:border-indigo-800/50 truncate max-w-[130px] sm:max-w-[200px]">
              #{currentRoomId}
            </span>

            {hasPassword && (
              <span
                className="p-1 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400"
                title="Phòng có mật khẩu bảo vệ"
              >
                <Lock className="w-3 h-3" />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Actions: QR, Copy Link, Clear Room, Theme */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {currentRoomId && (
          <>
            {onOpenQR && (
              <button
                onClick={onOpenQR}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors whitespace-nowrap"
                title="Mã QR cho điện thoại quét"
              >
                <QrCode className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden sm:inline">Mã QR</span>
              </button>
            )}

            {onCopyLink && (
              <button
                onClick={onCopyLink}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors whitespace-nowrap"
                title="Sao chép link phòng"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sao chép link</span>
                  </>
                )}
              </button>
            )}

            {onClearRoom && (
              <button
                onClick={onClearRoom}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors whitespace-nowrap"
                title="Xóa nhanh tất cả dữ liệu phòng sau họp"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Xóa phòng</span>
              </button>
            )}

            {onGoHome && (
              <button
                onClick={onGoHome}
                className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title="Về sảnh"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
          </>
        )}

        <button
          onClick={onToggleTheme}
          className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100 bg-neutral-100 dark:bg-neutral-800 rounded-lg transition-colors"
          title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
