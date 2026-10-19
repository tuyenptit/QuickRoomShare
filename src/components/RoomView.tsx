import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertCircle,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { RoomDetails, RoomFile, SyncStatus } from '../types.ts';
import {
  getStoredPassword,
  saveStoredPassword,
  clearStoredPassword,
  addRecentRoom,
  removeRecentRoom,
} from '../utils/storage.ts';
import { generateSenderId, isImageFile } from '../utils/formatters.ts';
import { NotepadEditor } from './NotepadEditor.tsx';
import { FileDropzone } from './FileDropzone.tsx';
import { QRCodeModal } from './QRCodeModal.tsx';
import { SettingsModal } from './SettingsModal.tsx';
import { ClearRoomModal } from './ClearRoomModal.tsx';
import { TextFullscreenModal } from './TextFullscreenModal.tsx';
import { DocumentViewerModal } from './DocumentViewerModal.tsx';
import { PasswordGateway } from './PasswordGateway.tsx';

interface RoomViewProps {
  roomId: string;
  onGoHome: () => void;
  onRegisterHeaderActions?: (actions: {
    copyLink?: () => void;
    copied?: boolean;
    openQR?: () => void;
    clearRoom?: () => void;
    hasPassword?: boolean;
  }) => void;
}

export const RoomView: React.FC<RoomViewProps> = ({
  roomId,
  onGoHome,
  onRegisterHeaderActions,
}) => {
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isProtected, setIsProtected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [currentPassword, setCurrentPassword] = useState<string>(() => {
    return sessionStorage.getItem(`room_pass_${roomId}`) || getStoredPassword(roomId) || '';
  });
  const [isUpdatingExpire, setIsUpdatingExpire] = useState<boolean>(false);

  // Modals state
  const [showQR, setShowQR] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [showTextFullscreen, setShowTextFullscreen] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<RoomFile | null>(null);

  // Refs for tracking real-time status & avoiding loopbacks
  const senderIdRef = useRef<string>(generateSenderId());
  const lastUpdatedAtRef = useRef<number>(0);
  const isTypingRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<any>(null);

  const roomUrl = `${window.location.origin}/room/${roomId}`;

  // Copy link handler
  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(roomUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, [roomUrl]);

  // Register actions with parent Header
  useEffect(() => {
    if (onRegisterHeaderActions) {
      if (isLocked || !room) {
        onRegisterHeaderActions({
          copyLink: handleCopyLink,
          copied: copiedLink,
          hasPassword: true,
        });
      } else {
        onRegisterHeaderActions({
          copyLink: handleCopyLink,
          copied: copiedLink,
          openQR: () => setShowQR(true),
          clearRoom: () => setShowClearConfirm(true),
          hasPassword: Boolean(room?.hasPassword || isProtected),
        });
      }
    }
  }, [onRegisterHeaderActions, handleCopyLink, copiedLink, room?.hasPassword, isLocked, isProtected, room]);

  // Fetch initial room state
  const fetchRoom = useCallback(async (passStr?: string) => {
    try {
      setLoading(true);
      setError(null);
      // YÊU CẦU 1: Đọc pass từ sessionStorage hoặc getStoredPassword
      const savedPass = passStr !== undefined
        ? passStr
        : (sessionStorage.getItem(`room_pass_${roomId}`) || getStoredPassword(roomId) || '');

      const headers: Record<string, string> = {};
      if (savedPass) {
        headers['x-room-password'] = savedPass;
      }

      const res = await fetch(`/api/rooms/${roomId}`, {
        cache: 'no-store',
        headers,
      });
      
      // 1. Phía Server trả về 401 khi phòng có mật khẩu và chưa gửi / sai mật khẩu
      if (res.status === 401) {
        setIsLocked(true);
        setIsProtected(true);
        setRoom(null);
        setCurrentPassword('');
        if (savedPass) {
          sessionStorage.removeItem(`room_pass_${roomId}`);
          clearStoredPassword(roomId);
        }
        setLoading(false);
        return;
      }

      if (res.status === 404) {
        const errorData = await res.json().catch(() => ({}));
        removeRecentRoom(roomId);
        sessionStorage.removeItem(`room_pass_${roomId}`);
        clearStoredPassword(roomId);
        setError(errorData.error || 'Phòng không tồn tại hoặc đã hết hạn và tự hủy!');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Lỗi kết nối phòng: ${res.statusText}`);
      }

      const data: RoomDetails = await res.json();
      if (data.isLocked) {
        setIsLocked(true);
        setIsProtected(true);
        setRoom(null);
        setCurrentPassword('');
        if (savedPass) {
          sessionStorage.removeItem(`room_pass_${roomId}`);
          clearStoredPassword(roomId);
        }
      } else {
        setIsLocked(false);
        setIsProtected(Boolean(data.hasPassword || data.isProtected));
        setRoom(data);
        if (savedPass) {
          setCurrentPassword(savedPass);
          sessionStorage.setItem(`room_pass_${roomId}`, savedPass);
          saveStoredPassword(roomId, savedPass);
        }
        lastUpdatedAtRef.current = data.updatedAt;

        addRecentRoom({
          id: data.id,
          fileCount: data.files?.length || 0,
          snippet: data.text?.substring(0, 60),
        });
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải thông tin phòng');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  // Countdown to self-destruct (expiresAt)
  useEffect(() => {
    if (!room?.expiresAt) {
      setTimeLeft('');
      return;
    }

    const updateRemaining = () => {
      const now = Date.now();
      const diff = room.expiresAt! - now;
      if (diff <= 0) {
        setTimeLeft('Đã hết hạn');
        removeRecentRoom(roomId);
        clearStoredPassword(roomId);
        setError('Phòng đã hết hạn và tự hủy!');
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remH = hours % 24;
        setTimeLeft(`${days} ngày ${remH}h`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}p ${seconds}s`);
      } else {
        setTimeLeft(`${minutes}p ${seconds}s`);
      }
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [room?.expiresAt, roomId]);

  // 1. REAL-TIME VIA SERVER-SENT EVENTS (SSE)
  useEffect(() => {
    if (isLocked || !room) return;

    let eventSource: EventSource | null = null;
    try {
      const savedPass = getStoredPassword(roomId);
      const passParam = savedPass ? `?pass=${encodeURIComponent(savedPass)}` : '';
      eventSource = new EventSource(`/api/rooms/${roomId}/events${passParam}`);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'CONNECTED') {
            setSyncStatus('synced');
          } else if (payload.type === 'TEXT_UPDATE') {
            if (payload.senderId !== senderIdRef.current) {
              lastUpdatedAtRef.current = payload.updatedAt || Date.now();
              setRoom((prev) => (prev ? { ...prev, text: payload.text, updatedAt: lastUpdatedAtRef.current } : prev));
              setSyncStatus('synced');
            }
          } else if (payload.type === 'FILES_UPDATE') {
            lastUpdatedAtRef.current = Date.now();
            setRoom((prev) => (prev ? { ...prev, files: payload.files, updatedAt: lastUpdatedAtRef.current } : prev));
            setSyncStatus('synced');
          } else if (payload.type === 'SETTINGS_UPDATE') {
            setRoom((prev) => (prev ? {
              ...prev,
              hasPassword: payload.hasPassword !== undefined ? payload.hasPassword : prev.hasPassword,
              ttlHours: payload.ttlHours !== undefined ? payload.ttlHours : prev.ttlHours,
              expiresAt: payload.expiresAt !== undefined ? payload.expiresAt : prev.expiresAt,
            } : prev));
          } else if (payload.type === 'ROOM_CLEARED') {
            lastUpdatedAtRef.current = Date.now();
            setRoom((prev) => (prev ? { ...prev, text: '', files: [] } : prev));
          }
        } catch (e) {
          console.error('Error handling SSE payload:', e);
        }
      };

      eventSource.onerror = () => {
        setSyncStatus('saved');
      };
    } catch (e) {
      console.error('SSE connection error:', e);
    }

    return () => {
      eventSource?.close();
    };
  }, [roomId, isLocked, room]);

  // 2. REAL-TIME VIA SMART-POLLING (1.8s interval)
  useEffect(() => {
    if (isLocked || !room) return;

    const pollTimer = setInterval(async () => {
      if (isTypingRef.current) return;

      try {
        const password = currentPassword || sessionStorage.getItem(`room_pass_${roomId}`) || getStoredPassword(roomId);
        const headers: Record<string, string> = {};
        if (password) headers['x-room-password'] = password;

        const res = await fetch(`/api/rooms/${roomId}/sync?since=${lastUpdatedAtRef.current}`, {
          cache: 'no-store',
          headers,
        });
        if (res.status === 401) {
          setIsLocked(true);
          setRoom(null);
          sessionStorage.removeItem(`room_pass_${roomId}`);
          clearStoredPassword(roomId);
          return;
        }

        if (res.ok) {
          const syncData = await res.json();
          if (syncData.hasUpdates) {
            lastUpdatedAtRef.current = syncData.updatedAt;
            setRoom((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                text: syncData.text,
                files: syncData.files,
                updatedAt: syncData.updatedAt,
                expiresAt: syncData.expiresAt !== undefined ? syncData.expiresAt : prev.expiresAt,
              };
            });
            setSyncStatus('synced');
          }
        }
      } catch {
        // Quietly ignore transient poll errors
      }
    }, 1800);

    return () => clearInterval(pollTimer);
  }, [roomId, isLocked, room, currentPassword]);

  // Handle password unlock
  const handleUnlock = async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        cache: 'no-store',
        headers: {
          'x-room-password': password,
        },
      });

      if (res.status === 401) {
        return { success: false, error: 'Mật khẩu không chính xác!' };
      }

      if (!res.ok) {
        return { success: false, error: 'Không thể kết nối máy chủ.' };
      }

      const data: RoomDetails = await res.json();
      // YÊU CẦU 1: Lưu mật khẩu vào sessionStorage và state khi mở khóa thành công
      sessionStorage.setItem(`room_pass_${roomId}`, password);
      saveStoredPassword(roomId, password);
      setCurrentPassword(password);

      setIsLocked(false);
      setIsProtected(Boolean(data.hasPassword || data.isProtected));
      setRoom(data);
      lastUpdatedAtRef.current = data.updatedAt;

      addRecentRoom({
        id: data.id,
        fileCount: data.files?.length || 0,
        snippet: data.text?.substring(0, 60),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: 'Mật khẩu không chính xác!' };
    }
  };

  // YÊU CẦU 2: Cập nhật thời hạn tự hủy trực tiếp từ trong phòng (PATCH /api/rooms/:roomId)
  const handleUpdateSelfDestruct = async (expiresInVal: string) => {
    setIsUpdatingExpire(true);
    try {
      const pass = currentPassword || sessionStorage.getItem(`room_pass_${roomId}`) || getStoredPassword(roomId) || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pass) {
        headers['x-room-password'] = pass;
      }

      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ expiresIn: expiresInVal }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Không thể cập nhật thời gian tự hủy');
        return;
      }

      const result = await res.json();
      setRoom((prev) => (prev ? { ...prev, expiresAt: result.expiresAt } : prev));
    } catch {
      alert('Lỗi kết nối máy chủ khi cập nhật thời gian tự hủy');
    } finally {
      setIsUpdatingExpire(false);
    }
  };

  // Handle text save
  const handleSaveText = async (newText: string) => {
    if (!room) return;
    setSyncStatus('saving');
    isTypingRef.current = true;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 1200);

    try {
      const password = getStoredPassword(roomId);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (password) headers['x-room-password'] = password;

      const res = await fetch(`/api/rooms/${roomId}/text`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: newText,
          senderId: senderIdRef.current,
        }),
      });

      if (res.ok) {
        const resData = await res.json();
        lastUpdatedAtRef.current = resData.updatedAt || Date.now();
        setRoom((prev) => (prev ? { ...prev, text: newText, updatedAt: lastUpdatedAtRef.current } : prev));
        setSyncStatus('saved');
        addRecentRoom({
          id: room.id,
          fileCount: room.files.length,
          snippet: newText.substring(0, 60),
        });
      } else {
        setSyncStatus('error');
      }
    } catch {
      setSyncStatus('error');
    }
  };

  // Handle file uploads
  const handleUploadFiles = async (files: File[]) => {
    if (!room) return;
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));

    const password = getStoredPassword(roomId);
    const headers: Record<string, string> = {};
    if (password) headers['x-room-password'] = password;

    const res = await fetch(`/api/rooms/${roomId}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      lastUpdatedAtRef.current = Date.now();
      setRoom((prev) => (prev ? { ...prev, files: data.files, updatedAt: lastUpdatedAtRef.current } : prev));
      addRecentRoom({
        id: room.id,
        fileCount: data.files.length,
        snippet: room.text.substring(0, 60),
      });
    } else {
      throw new Error('Upload tệp thất bại');
    }
  };

  // Handle single file delete
  const handleDeleteFile = async (fileId: string) => {
    const password = getStoredPassword(roomId);
    const headers: Record<string, string> = {};
    if (password) headers['x-room-password'] = password;

    const res = await fetch(`/api/rooms/${roomId}/files/${fileId}`, {
      method: 'DELETE',
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      lastUpdatedAtRef.current = Date.now();
      setRoom((prev) => (prev ? { ...prev, files: data.files, updatedAt: lastUpdatedAtRef.current } : prev));
    }
  };

  // Handle clear room (strictly requires password verification if room has password)
  const handleConfirmClear = async (enteredPassword?: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-room-password': enteredPassword || '',
        },
        body: JSON.stringify({
          password: enteredPassword || '',
        }),
      });

      // Kiểm tra xem phản hồi có phải là JSON không
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.indexOf('application/json') !== -1) {
        const data = await res.json();
        if (!res.ok || data.success === false) {
          return {
            success: false,
            message: data.error || data.message || 'Mật khẩu không đúng!',
          };
        }

        lastUpdatedAtRef.current = Date.now();
        clearStoredPassword(roomId);
        removeRecentRoom(roomId);
        return { success: true };
      } else {
        return {
          success: false,
          message: 'Lỗi máy chủ: Không thể nhận diện phản hồi.',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: 'Lỗi kết nối đến máy chủ.',
      };
    }
  };

  // Handle save settings
  const handleSaveSettings = async (settings: {
    password?: string;
    removePassword?: boolean;
    ttlHours?: number;
    expiresIn?: string;
  }) => {
    const currentPass = currentPassword || sessionStorage.getItem(`room_pass_${roomId}`) || getStoredPassword(roomId);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentPass) headers['x-room-password'] = currentPass;

    const res = await fetch(`/api/rooms/${roomId}/settings`, {
      method: 'POST',
      headers,
      body: JSON.stringify(settings),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Lỗi cập nhật');
    }

    if (settings.removePassword) {
      sessionStorage.removeItem(`room_pass_${roomId}`);
      clearStoredPassword(roomId);
      setCurrentPassword('');
    } else if (settings.password) {
      sessionStorage.setItem(`room_pass_${roomId}`, settings.password);
      saveStoredPassword(roomId, settings.password);
      setCurrentPassword(settings.password);
    }

    const data = await res.json();
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            hasPassword: data.hasPassword,
            ttlHours: data.ttlHours,
            expiresAt: data.expiresAt !== undefined ? data.expiresAt : prev.expiresAt,
          }
        : prev
    );
  };

  const imageFiles = (room?.files || []).filter((f) => isImageFile(f.mimeType, f.name));
  const totalStorage = (room?.files || []).reduce((acc, f) => acc + f.size, 0);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-2">
        <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
        <p className="text-xs text-neutral-400">Đang tải #{roomId}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-sm mx-auto my-12 p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-red-200 dark:border-red-900/40 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Không thể vào phòng</h3>
        <p className="text-xs text-neutral-500">{error}</p>
        <button
          onClick={onGoHome}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700"
        >
          Về sảnh
        </button>
      </div>
    );
  }

  // Màn hình khóa Gateway chặn cửa hoàn toàn khi phòng có mật khẩu
  if (isLocked) {
    return (
      <PasswordGateway
        roomId={roomId}
        onUnlock={handleUnlock}
        onGoHome={onGoHome}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3.5 space-y-3">
      {/* YÊU CẦU 2: Tính năng Tự hủy phòng chuyển vào bên trong giao diện phòng (Chỉ hiển thị khi unlocked) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl shrink-0 ${room?.expiresAt ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'}`}>
            <Clock className={`w-4 h-4 ${room?.expiresAt ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">Tự hủy dữ liệu:</span>
              {room?.expiresAt && timeLeft ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  Còn {timeLeft}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                  Không bao giờ xóa
                </span>
              )}
            </div>
            {room?.expiresAt ? (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Phòng và toàn bộ file sẽ tự hủy vào lúc: {new Date(room.expiresAt).toLocaleTimeString('vi-VN')} ngày {new Date(room.expiresAt).toLocaleDateString('vi-VN')}
              </p>
            ) : (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Phòng lưu trữ an toàn đến khi bạn chọn thời hạn tự hủy hoặc bấm xóa phòng.
              </p>
            )}
          </div>
        </div>

        {/* Change expiration dropdown & settings shortcut */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            Đổi thời hạn:
          </label>
          <select
            disabled={isUpdatingExpire}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleUpdateSelfDestruct(e.target.value);
                e.target.value = '';
              }
            }}
            className="px-2.5 py-1.5 text-xs font-medium bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl outline-none focus:border-indigo-500 text-neutral-800 dark:text-neutral-200 cursor-pointer disabled:opacity-50"
          >
            <option value="" disabled>-- Chọn thời hạn --</option>
            <option value="1h">1 giờ</option>
            <option value="12h">12 giờ</option>
            <option value="24h">24 giờ (1 ngày)</option>
            <option value="3d">3 ngày</option>
            <option value="7d">7 ngày</option>
            <option value="never">Không bao giờ xóa</option>
          </select>
          <button
            onClick={() => setShowSettings(true)}
            className="px-2.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-xl border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
          >
            Cài đặt phòng
          </button>
        </div>
      </div>

      {/* Workspace: 50% Notepad / 50% File Dropzone & Gallery */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 h-[calc(100vh-80px)] min-h-[540px]">
        {/* Left Column: Notepad Editor */}
        <div className="h-full">
          <NotepadEditor
            initialText={room?.text || ''}
            onSaveText={handleSaveText}
            syncStatus={syncStatus}
            onOpenFullscreen={() => setShowTextFullscreen(true)}
            roomId={roomId}
          />
        </div>

        {/* Right Column: File Dropzone & Gallery */}
        <div className="h-full">
          <FileDropzone
            files={room?.files || []}
            onUploadFiles={handleUploadFiles}
            onDeleteFile={handleDeleteFile}
            onPreviewFile={(file) => setPreviewFile(file)}
            onOpenBackdrop={(idx) => {
              if (imageFiles[idx]) setPreviewFile(imageFiles[idx]);
            }}
            roomId={roomId}
          />
        </div>
      </div>

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        roomUrl={roomUrl}
        roomId={roomId}
      />

      {/* Settings Modal (Password & TTL / Self-destruct) */}
      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          roomId={roomId}
          hasPassword={Boolean(room?.hasPassword)}
          ttlHours={room?.ttlHours || 12}
          expiresAt={room?.expiresAt}
          totalStorageUsed={totalStorage}
          fileCount={room?.files.length || 0}
          onSaveSettings={handleSaveSettings}
        />
      )}

      {/* Clear Room Modal (Secure deletion with password verification) */}
      {showClearConfirm && (
        <ClearRoomModal
          isOpen={showClearConfirm}
          onClose={() => setShowClearConfirm(false)}
          roomId={roomId}
          hasPassword={Boolean(room?.hasPassword)}
          onConfirmClear={handleConfirmClear}
          onDeletedSuccess={onGoHome}
        />
      )}

      {/* Text Projector Fullscreen Modal */}
      {showTextFullscreen && (
        <TextFullscreenModal
          isOpen={showTextFullscreen}
          onClose={() => setShowTextFullscreen(false)}
          text={room?.text || ''}
          roomId={roomId}
        />
      )}

      {/* In-Browser Document & Backdrop Viewer Modal (PDF, DOCX, PPTX, Images, etc.) */}
      {previewFile && (
        <DocumentViewerModal
          isOpen={Boolean(previewFile)}
          onClose={() => setPreviewFile(null)}
          file={previewFile}
          allImages={imageFiles}
          onSelectImage={(idx) => setPreviewFile(imageFiles[idx])}
        />
      )}
    </div>
  );
};
