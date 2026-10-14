import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertCircle,
  RefreshCw,
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
import { PasswordPromptModal } from './PasswordPromptModal.tsx';

interface RoomViewProps {
  roomId: string;
  onGoHome: () => void;
  onRegisterHeaderActions?: (actions: {
    copyLink: () => void;
    copied: boolean;
    openQR: () => void;
    clearRoom: () => void;
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
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

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
      onRegisterHeaderActions({
        copyLink: handleCopyLink,
        copied: copiedLink,
        openQR: () => setShowQR(true),
        clearRoom: () => setShowClearConfirm(true),
        hasPassword: Boolean(room?.hasPassword),
      });
    }
  }, [onRegisterHeaderActions, handleCopyLink, copiedLink, room?.hasPassword]);

  // Fetch initial room state
  const fetchRoom = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const savedPass = getStoredPassword(roomId);
      const headers: Record<string, string> = {};
      if (savedPass) {
        headers['x-room-password'] = savedPass;
      }

      const res = await fetch(`/api/rooms/${roomId}`, { headers });
      if (!res.ok) {
        throw new Error(`Lỗi kết nối phòng: ${res.statusText}`);
      }
      const data: RoomDetails = await res.json();
      setRoom(data);
      lastUpdatedAtRef.current = data.updatedAt;

      if (!data.isLocked) {
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

  // 1. REAL-TIME VIA SERVER-SENT EVENTS (SSE)
  useEffect(() => {
    if (!room || room.isLocked) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/rooms/${roomId}/events`);

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
  }, [roomId, room?.isLocked]);

  // 2. REAL-TIME VIA SMART-POLLING (1.8s interval)
  useEffect(() => {
    if (!room || room.isLocked) return;

    const pollTimer = setInterval(async () => {
      if (isTypingRef.current) return;

      try {
        const password = getStoredPassword(roomId);
        const headers: Record<string, string> = {};
        if (password) headers['x-room-password'] = password;

        const res = await fetch(`/api/rooms/${roomId}/sync?since=${lastUpdatedAtRef.current}`, { headers });
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
  }, [roomId, room?.isLocked]);

  // Handle password unlock
  const handleUnlock = async (password: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        saveStoredPassword(roomId, password);
        await fetchRoom();
        return true;
      }
      return false;
    } catch {
      return false;
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
      const res = await fetch(`/api/rooms/${roomId}/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: enteredPassword || '',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        return {
          success: false,
          message: data.message || 'Mật khẩu không chính xác hoặc phòng yêu cầu mật khẩu để xóa.',
        };
      }

      lastUpdatedAtRef.current = Date.now();
      clearStoredPassword(roomId);
      removeRecentRoom(roomId);
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Lỗi kết nối khi xóa phòng.',
      };
    }
  };

  // Handle save settings
  const handleSaveSettings = async (settings: {
    password?: string;
    removePassword?: boolean;
    ttlHours?: number;
  }) => {
    const currentPass = getStoredPassword(roomId);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentPass) headers['x-room-password'] = currentPass;

    const res = await fetch(`/api/rooms/${roomId}/settings`, {
      method: 'POST',
      headers,
      body: JSON.stringify(settings),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Lỗi cập nhật');
    }

    if (settings.removePassword) {
      clearStoredPassword(roomId);
    } else if (settings.password) {
      saveStoredPassword(roomId, settings.password);
    }

    const data = await res.json();
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            hasPassword: data.hasPassword,
            ttlHours: data.ttlHours,
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

  if (room?.isLocked) {
    return (
      <PasswordPromptModal
        roomId={roomId}
        onUnlock={handleUnlock}
        onGoBack={onGoHome}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3.5 space-y-3">
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

      {/* Settings Modal (Password & TTL) */}
      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          roomId={roomId}
          hasPassword={Boolean(room?.hasPassword)}
          ttlHours={room?.ttlHours || 12}
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
