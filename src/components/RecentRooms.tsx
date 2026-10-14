import React, { useState } from 'react';
import { Clock, Trash2, ChevronRight, AlertTriangle, X, Lock } from 'lucide-react';
import { RecentRoom } from '../types.ts';
import { formatTimeAgo } from '../utils/formatters.ts';
import { clearStoredPassword } from '../utils/storage.ts';

export interface RecentRoomsProps {
  recentRooms: RecentRoom[];
  onJoinRoom: (roomId: string) => void;
  onRemoveRecentRoom: (roomId: string) => void;
}

export const RecentRooms: React.FC<RecentRoomsProps> = ({
  recentRooms,
  onJoinRoom,
  onRemoveRecentRoom,
}) => {
  const [deletingRoom, setDeletingRoom] = useState<RecentRoom | null>(null);
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  if (recentRooms.length === 0) {
    return null;
  }

  const handleOpenDeleteModal = (e: React.MouseEvent, room: RecentRoom) => {
    e.stopPropagation();
    e.preventDefault();
    setDeletingRoom(room);
    setPassword('');
    setError(null);
    setIsDeleting(false);
  };

  const handleCloseModal = () => {
    if (isDeleting) return;
    setDeletingRoom(null);
    setPassword('');
    setError(null);
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingRoom) return;

    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(deletingRoom.id)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: password.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Nếu API trả về mã lỗi 401 / 403 hoặc thất bại
      if (!res.ok || data.success === false) {
        setError(data.error || data.message || 'Mật khẩu phòng không đúng!');
        setIsDeleting(false);
        return;
      }

      // Xóa thành công trên Server (HTTP 200)
      // Lúc này MỚI xóa ID phòng khỏi localStorage và cập nhật danh sách hiển thị
      clearStoredPassword(deletingRoom.id);
      onRemoveRecentRoom(deletingRoom.id);
      setDeletingRoom(null);
      setPassword('');
      setIsDeleting(false);
    } catch (err: any) {
      setError(err.message || 'Mật khẩu phòng không đúng!');
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400 px-1">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Phòng gần đây</span>
          </div>
          <span>{recentRooms.length}</span>
        </div>

        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-2xs">
          {recentRooms.map((room) => (
            <div
              key={room.id}
              className="group flex items-center justify-between p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
            >
              <button
                type="button"
                onClick={() => onJoinRoom(room.id)}
                className="flex-1 text-left flex items-center gap-2.5 min-w-0"
              >
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono font-semibold text-xs shrink-0">
                  #{room.id}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    {room.id}
                  </p>
                  <p className="text-[11px] text-neutral-400 font-mono">
                    {formatTimeAgo(room.lastVisited)}
                    {room.fileCount !== undefined && room.fileCount > 0 && ` · ${room.fileCount} tệp`}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => onJoinRoom(room.id)}
                  className="p-1 text-neutral-400 group-hover:text-indigo-600 rounded transition-colors"
                  title="Vào phòng"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleOpenDeleteModal(e, room)}
                  className="p-1 text-neutral-400 hover:text-red-500 rounded transition-colors"
                  title="Xóa vĩnh viễn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Popup Xác nhận Xóa vĩnh viễn */}
      {deletingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-sm p-5 sm:p-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 transition-all">
            {/* Header Icon & Close */}
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-red-50 dark:bg-red-950/60 rounded-xl text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isDeleting}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Title */}
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Xóa vĩnh viễn phòng #{deletingRoom.id}
            </h3>

            {/* Warning Message */}
            <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Dữ liệu văn bản và toàn bộ tệp tin của phòng sẽ bị xóa hoàn toàn trên máy chủ.
            </p>

            <form onSubmit={handleConfirmDelete} className="mt-4 space-y-3">
              {/* Password Input */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  <Lock className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Mật khẩu phòng (nếu có):</span>
                </label>
                <input
                  type="password"
                  autoFocus
                  placeholder="Nhập mật khẩu phòng (nếu có)"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  disabled={isDeleting}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:border-red-500 text-neutral-900 dark:text-white transition-colors"
                />
              </div>

              {/* Red error message under password input */}
              {error && (
                <p className="text-xs text-red-500 font-medium">
                  {error}
                </p>
              )}

              {/* Actions: Hủy & Xác nhận xóa */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isDeleting}
                  className="py-2 px-3 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 py-2 px-3.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl shadow-2xs transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
