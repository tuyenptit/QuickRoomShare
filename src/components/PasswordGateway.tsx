import React, { useState } from 'react';
import { Lock, Unlock, ArrowLeft, Eye, EyeOff, AlertCircle, RefreshCw, KeyRound } from 'lucide-react';

interface PasswordGatewayProps {
  roomId: string;
  onUnlock: (password: string) => Promise<{ success: boolean; error?: string }>;
  onGoHome: () => void;
}

export const PasswordGateway: React.FC<PasswordGatewayProps> = ({
  roomId,
  onUnlock,
  onGoHome,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await onUnlock(password.trim());
      if (!result.success) {
        setError(result.error || 'Mật khẩu không chính xác!');
      }
    } catch (err: any) {
      setError(err.message || 'Mật khẩu không chính xác!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-neutral-200 dark:border-neutral-800 transition-all">
        {/* Lock Icon Badge */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 ring-8 ring-amber-500/5">
            <Lock className="w-7 h-7" />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Phòng Được Bảo Vệ
          </h2>
          
          <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span>Mã phòng:</span>
            <span className="font-mono font-semibold px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
              #{roomId}
            </span>
          </div>

          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-xs">
            Phòng họp này đã được cài đặt mật khẩu. Toàn bộ ghi chú và tài liệu được ẩn cho đến khi xác thực thành công.
          </p>
        </div>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Mật khẩu truy cập
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
                placeholder="Nhập mật khẩu phòng..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                disabled={isSubmitting}
                className="w-full pl-9 pr-10 py-2.5 text-sm bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:border-indigo-600 dark:focus:border-indigo-500 text-neutral-900 dark:text-white placeholder-neutral-400 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-3 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 rounded-xl animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onGoHome}
              disabled={isSubmitting}
              className="flex items-center justify-center gap-1.5 flex-1 py-2.5 px-4 text-xs font-semibold text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl transition-colors disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Về sảnh</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className="flex items-center justify-center gap-1.5 flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang mở...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Mở khóa / Vào phòng</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
