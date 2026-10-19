import React, { useState } from 'react';
import { X, Lock, Unlock, Clock, ShieldCheck, Check, HardDrive } from 'lucide-react';
import { formatBytes } from '../utils/formatters.ts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  hasPassword: boolean;
  ttlHours: number;
  expiresAt?: number | null;
  totalStorageUsed: number;
  fileCount: number;
  onSaveSettings: (settings: { password?: string; removePassword?: boolean; ttlHours?: number; expiresIn?: string }) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  roomId,
  hasPassword,
  ttlHours,
  expiresAt,
  totalStorageUsed,
  fileCount,
  onSaveSettings,
}) => {
  const [selectedTtl, setSelectedTtl] = useState<number>(ttlHours || 24);
  const [selectedExpire, setSelectedExpire] = useState<string>('24h');
  const [newPassword, setNewPassword] = useState<string>('');
  const [removePass, setRemovePass] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      await onSaveSettings({
        ttlHours: selectedTtl,
        expiresIn: selectedExpire,
        password: newPassword.trim() ? newPassword.trim() : undefined,
        removePassword: removePass,
      });
      setStatusMsg('Đã cập nhật cài đặt phòng thành công!');
      setTimeout(() => {
        setStatusMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setStatusMsg('Lỗi khi lưu cài đặt: ' + (err.message || 'Thử lại sau'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md p-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                Cài đặt & Tự hủy phòng
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Phòng: <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">{roomId}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* TTL / Self-destruct section */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              <span>Thời gian tự hủy dữ liệu phòng (Self-destruct)</span>
            </label>
            {expiresAt && expiresAt > Date.now() && (
              <div className="p-2 mb-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between">
                <span>Thời hạn hiện tại:</span>
                <span className="font-semibold">{new Date(expiresAt).toLocaleTimeString('vi-VN')} {new Date(expiresAt).toLocaleDateString('vi-VN')}</span>
              </div>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[
                { label: '1 Giờ', value: '1h', num: 1 },
                { label: '12 Giờ', value: '12h', num: 12 },
                { label: '24 Giờ', value: '24h', num: 24 },
                { label: '3 Ngày', value: '3d', num: 72 },
                { label: '7 Ngày', value: '7d', num: 168 },
                { label: 'Không hủy', value: 'never', num: 0 },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => {
                    setSelectedExpire(opt.value);
                    setSelectedTtl(opt.num);
                  }}
                  className={`py-2 px-1.5 text-[11px] font-medium rounded-xl border text-center transition-all ${
                    selectedExpire === opt.value
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold shadow-xs'
                      : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {selectedExpire === 'never'
                ? 'Dữ liệu được lưu trữ cho đến khi bạn bấm nút "Xóa phòng".'
                : `Dữ liệu và file sẽ tự động bị xóa và hủy phòng vĩnh viễn theo thời hạn đã chọn.`}
            </p>
          </div>

          {/* Password Protection */}
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              {hasPassword ? (
                <Lock className="w-4 h-4 text-amber-500" />
              ) : (
                <Unlock className="w-4 h-4 text-neutral-400" />
              )}
              <span>Bảo vệ bằng mật khẩu (Tùy chọn)</span>
            </label>

            {hasPassword ? (
              <div className="space-y-2">
                <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                  Phòng này hiện đang có mật khẩu bảo vệ.
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="Nhập mật khẩu mới để đổi..."
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (e.target.value) setRemovePass(false);
                    }}
                    className="flex-1 px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:border-indigo-500 text-neutral-900 dark:text-white"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={removePass}
                      onChange={(e) => {
                        setRemovePass(e.target.checked);
                        if (e.target.checked) setNewPassword('');
                      }}
                      className="rounded text-indigo-600 focus:ring-0"
                    />
                    <span>Gỡ mật khẩu</span>
                  </label>
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="password"
                  placeholder="Đặt mật khẩu phòng (để trống nếu không cần)..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:border-indigo-500 text-neutral-900 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Khi đặt mật khẩu, người khác phải nhập đúng mật khẩu mới xem được nội dung.
                </p>
              </div>
            )}
          </div>

          {/* Room Storage Statistics */}
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-neutral-400" />
              <span>Dung lượng đã sử dụng:</span>
            </div>
            <span className="font-mono font-medium text-neutral-900 dark:text-white">
              {formatBytes(totalStorageUsed)} ({fileCount} tệp)
            </span>
          </div>

          {statusMsg && (
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-xs font-medium text-center">
              {statusMsg}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2 px-5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
