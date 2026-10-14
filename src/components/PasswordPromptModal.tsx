import React, { useState } from 'react';
import { Lock, ArrowRight, ArrowLeft } from 'lucide-react';

interface PasswordPromptModalProps {
  roomId: string;
  onUnlock: (password: string) => Promise<boolean>;
  onGoBack: () => void;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  roomId,
  onUnlock,
  onGoBack,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const success = await onUnlock(password.trim());
      if (!success) {
        setError('Mật khẩu không chính xác, vui lòng thử lại.');
      }
    } catch (err: any) {
      setError(err.message || 'Mật khẩu không đúng.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/80 backdrop-blur-md">
      <div className="relative w-full max-w-sm p-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800">
        <div className="flex flex-col items-center text-center">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
            Phòng họp có mật khẩu bảo vệ
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Vui lòng nhập mật khẩu để truy cập phòng <strong className="font-mono text-neutral-800 dark:text-neutral-200">{roomId}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <input
              type="password"
              autoFocus
              placeholder="Nhập mật khẩu phòng..."
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              className="w-full px-3.5 py-2.5 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:border-indigo-500 text-neutral-900 dark:text-white transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 font-medium text-center">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onGoBack}
              className="flex items-center justify-center gap-1.5 flex-1 py-2.5 px-3 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại</span>
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="flex items-center justify-center gap-1.5 flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
            >
              <span>{loading ? 'Đang mở...' : 'Mở khóa'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
