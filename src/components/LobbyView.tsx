import React, { useState } from 'react';
import {
  ArrowRight,
  Dices,
  Share2,
  Lock,
} from 'lucide-react';
import { RecentRoom } from '../types.ts';
import { RecentRooms } from './RecentRooms.tsx';
import { saveStoredPassword } from '../utils/storage.ts';

interface LobbyViewProps {
  onJoinRoom: (roomId: string, optionalPassword?: string) => void;
  recentRooms: RecentRoom[];
  onRemoveRecentRoom: (roomId: string) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  onJoinRoom,
  recentRooms,
  onRemoveRecentRoom,
}) => {
  const [roomIdInput, setRoomIdInput] = useState<string>('');
  const [optionalPassword, setOptionalPassword] = useState<string>('');
  const [showPassField, setShowPassField] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = roomIdInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanId) {
      setError('Vui lòng nhập tên phòng hoặc mã PIN');
      return;
    }

    const pass = optionalPassword.trim();

    try {
      await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: cleanId,
          password: pass || undefined,
        }),
      });
    } catch (err) {
      console.error('Failed to create room with options:', err);
    }

    // YÊU CẦU 1: Lưu tạm mật khẩu vào sessionStorage khi tạo phòng có pass
    if (pass) {
      sessionStorage.setItem(`room_pass_${cleanId}`, pass);
      saveStoredPassword(cleanId, pass);
    }

    onJoinRoom(cleanId);
  };

  const handleCreateRandomPin = async () => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const pass = optionalPassword.trim();
    try {
      await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: pin,
          password: pass || undefined,
        }),
      });
    } catch (err) {
      console.error('Failed to create random pin room:', err);
    }

    // YÊU CẦU 1: Lưu tạm mật khẩu vào sessionStorage khi tạo phòng có pass
    if (pass) {
      sessionStorage.setItem(`room_pass_${pin}`, pass);
      saveStoredPassword(pin, pass);
    }

    onJoinRoom(pin);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12 md:py-20 space-y-8">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white shadow-2xs mb-1">
          <Share2 className="w-6 h-6" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
          QuickRoom Share
        </h1>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Chia sẻ tài liệu và văn bản phòng họp tức thì
        </p>
      </div>

      {/* Main Room Entry Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 shadow-sm border border-neutral-200 dark:border-neutral-800">
        <form onSubmit={handleJoin} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              autoFocus
              placeholder="Nhập tên phòng hoặc mã PIN..."
              value={roomIdInput}
              onChange={(e) => {
                setRoomIdInput(e.target.value);
                setError(null);
              }}
              className="flex-1 px-4 py-2.5 bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:border-indigo-600 text-sm font-medium text-neutral-900 dark:text-white transition-colors"
            />

            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs md:text-sm rounded-xl transition-all shrink-0 shadow-2xs"
            >
              <span>Vào phòng</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Toggle optional password */}
          {!showPassField ? (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => setShowPassField(true)}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <Lock className="w-3 h-3" />
                <span>+ Đặt mật khẩu bảo vệ (tùy chọn)</span>
              </button>
            </div>
          ) : (
            <div className="pt-1">
              <div className="relative">
                <input
                  type="password"
                  placeholder="Đặt mật khẩu phòng (tùy chọn)..."
                  value={optionalPassword}
                  onChange={(e) => setOptionalPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:border-indigo-600 text-neutral-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <div className="pt-2">
            <button
              type="button"
              onClick={handleCreateRandomPin}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium text-xs rounded-xl transition-all"
            >
              <Dices className="w-4 h-4 text-indigo-500" />
              <span>Tạo phòng ngẫu nhiên (PIN 6 số)</span>
            </button>
          </div>
        </form>
      </div>

      {/* Recent Rooms Section */}
      <RecentRooms
        recentRooms={recentRooms}
        onJoinRoom={onJoinRoom}
        onRemoveRecentRoom={onRemoveRecentRoom}
      />
    </div>
  );
};
