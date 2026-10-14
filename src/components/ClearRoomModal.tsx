import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X, Lock } from 'lucide-react';

interface ClearRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  hasPassword?: boolean;
  onConfirmClear: (password?: string) => Promise<{ success: boolean; message?: string }>;
  onDeletedSuccess?: () => void;
}

export const ClearRoomModal: React.FC<ClearRoomModalProps> = ({
  isOpen,
  onClose,
  roomId,
  hasPassword = false,
  onConfirmClear,
  onDeletedSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Reset state whenever modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setIsDeleting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();

    // If room has password, user must have entered something
    if (hasPassword && !password.trim()) {
      setError('Vui lòng nhập mật khẩu phòng để xác nhận xóa.');
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const result = await onConfirmClear(hasPassword ? password.trim() : undefined);
      if (!result.success) {
        setError(result.message || 'Mật khẩu không đúng.');
        setIsDeleting(false);
        return;
      }

      // Success
      setIsDeleting(false);
      onClose();
      onDeletedSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Mật khẩu không đúng.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-sm p-5 sm:p-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 transition-all">
        {/* Header Icon & Close */}
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 bg-red-50 dark:bg-red-950/60 rounded-xl text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
          Xác nhận xóa phòng
        </h3>

        {/* Description based on hasPassword */}
        <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          {hasPassword
            ? 'Phòng này được đặt mật khẩu bảo vệ. Vui lòng nhập mật khẩu phòng để xác nhận xóa.'
            : `Bạn có chắc chắn muốn xóa phòng #${roomId}? Toàn bộ văn bản và tệp tin sẽ bị xóa vĩnh viễn.`}
        </p>

        <form onSubmit={handleConfirm} className="mt-4 space-y-3">
          {/* Password Input required if room is protected */}
          {hasPassword && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>Mật khẩu phòng:</span>
              </label>
              <input
                type="password"
                autoFocus
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:border-red-500 text-neutral-900 dark:text-white transition-colors"
              />
            </div>
          )}

          {/* Red error message under input */}
          {error && (
            <p className="text-xs text-red-500 font-medium">
              {error}
            </p>
          )}

          {/* Actions: Cancel & Confirm Delete */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="py-2 px-3 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isDeleting || (hasPassword && !password.trim())}
              className="flex items-center gap-1.5 py-2 px-3.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl shadow-2xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
