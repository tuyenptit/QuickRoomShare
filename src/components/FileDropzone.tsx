import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  File,
  Image as ImageIcon,
  Download,
  Trash2,
  FileArchive,
  Eye,
  Play,
  FileText,
  FileSpreadsheet,
  Film,
  Music,
  Layers,
  Check,
} from 'lucide-react';
import { RoomFile } from '../types.ts';
import { formatBytes, formatTimeAgo, isImageFile, isPdfFile } from '../utils/formatters.ts';

interface FileDropzoneProps {
  files: RoomFile[];
  onUploadFiles: (files: File[]) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
  onPreviewFile: (file: RoomFile) => void;
  onOpenBackdrop: (imageIndex: number) => void;
  roomId: string;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  files,
  onUploadFiles,
  onDeleteFile,
  onPreviewFile,
  onOpenBackdrop,
  roomId,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'docs'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clipboardToast, setClipboardToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Clipboard Paste (Ctrl+V) across window
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text')) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            const ext = file.type.split('/')[1] || 'png';
            const fileName = `screenshot_${Date.now()}.${ext}`;
            const renamed = new (window as any).File([file], fileName, {
              type: file.type,
            }) as File;
            pastedFiles.push(renamed);
          }
        }
      }

      if (pastedFiles.length > 0) {
        setClipboardToast(`Đang tải ảnh dán từ clipboard...`);
        handleUpload(pastedFiles);
        setTimeout(() => setClipboardToast(null), 3000);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleUpload = async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setIsUploading(true);
    setUploadProgress(20);

    const interval = setInterval(() => {
      setUploadProgress((p) => Math.min(90, p + 15));
    }, 150);

    try {
      await onUploadFiles(fileList);
      setUploadProgress(100);
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      clearInterval(interval);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 400);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDelete = async (fileId: string) => {
    setDeletingId(fileId);
    try {
      await onDeleteFile(fileId);
    } finally {
      setDeletingId(null);
    }
  };

  const imageFiles = files.filter((f) => isImageFile(f.mimeType, f.name));
  const docFiles = files.filter((f) => !isImageFile(f.mimeType, f.name));
  const displayedFiles = activeTab === 'images' ? imageFiles : activeTab === 'docs' ? docFiles : files;

  const getFileIcon = (file: RoomFile) => {
    if (isImageFile(file.mimeType, file.name)) {
      return <ImageIcon className="w-4 h-4 text-indigo-500" />;
    }
    if (isPdfFile(file.mimeType, file.name)) {
      return <FileText className="w-4 h-4 text-red-500" />;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['doc', 'docx'].includes(ext || '')) {
      return <FileText className="w-4 h-4 text-blue-500" />;
    }
    if (['ppt', 'pptx'].includes(ext || '')) {
      return <FileText className="w-4 h-4 text-amber-500" />;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <FileArchive className="w-4 h-4 text-amber-500" />;
    }
    if (['mp4', 'mov', 'avi', 'mkv'].includes(ext || '')) {
      return <Film className="w-4 h-4 text-purple-500" />;
    }
    if (['mp3', 'wav', 'ogg'].includes(ext || '')) {
      return <Music className="w-4 h-4 text-pink-500" />;
    }
    return <File className="w-4 h-4 text-neutral-400" />;
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xs overflow-hidden transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Tài liệu & Tệp tin
          </h2>
          <span className="text-[11px] font-mono font-medium px-1.5 py-0.2 rounded bg-neutral-200/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
            {files.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {imageFiles.length > 0 && (
            <button
              onClick={() => onOpenBackdrop(0)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs"
              title="Chiếu Backdrop toàn màn hình"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Trình chiếu</span>
            </button>
          )}

          {files.length > 0 && (
            <a
              href={`/api/rooms/${roomId}/download-all`}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              title="Tải tất cả tệp (.zip)"
            >
              <Download className="w-3.5 h-3.5 text-neutral-500" />
              <span className="hidden sm:inline">Tải tất cả (.zip)</span>
            </a>
          )}
        </div>
      </div>

      {clipboardToast && (
        <div className="px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-200">
          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{clipboardToast}</span>
        </div>
      )}

      {/* Drop Area */}
      <div className="p-3">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-4 border border-dashed rounded-xl cursor-pointer transition-all ${
            isDragging
              ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40'
              : 'border-neutral-300 dark:border-neutral-700 hover:border-indigo-400 bg-neutral-50/50 dark:bg-neutral-800/30'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />

          <UploadCloud className="w-5 h-5 text-indigo-500 mb-1" />
          <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 text-center">
            Kéo thả tệp hoặc chọn file
          </p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 text-center mt-0.5">
            Hỗ trợ Ctrl + V dán ảnh
          </p>

          {isUploading && (
            <div className="w-full max-w-xs mt-2">
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      {files.length > 0 && (
        <div className="px-3 pb-1.5 flex items-center gap-1 border-b border-neutral-100 dark:border-neutral-800 text-xs">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400'
            }`}
          >
            Tất cả ({files.length})
          </button>
          <button
            onClick={() => setActiveTab('images')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              activeTab === 'images'
                ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400'
            }`}
          >
            Ảnh ({imageFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              activeTab === 'docs'
                ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400'
            }`}
          >
            Tài liệu ({docFiles.length})
          </button>
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {displayedFiles.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-xs italic">
            Chưa có tệp nào
          </div>
        ) : (
          displayedFiles.map((file) => {
            const isImg = isImageFile(file.mimeType, file.name);

            return (
              <div
                key={file.id}
                className="group flex items-center justify-between p-2 rounded-xl border border-neutral-200/70 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/40 dark:bg-neutral-800/20 hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {isImg ? (
                    <button
                      onClick={() => onPreviewFile(file)}
                      className="shrink-0 w-9 h-9 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-neutral-900 focus:outline-hidden"
                      title="Xem ảnh"
                    >
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 border border-neutral-200/60 dark:border-neutral-700/60">
                      {getFileIcon(file)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                      onClick={() => onPreviewFile(file)}
                      title={`Bấm để xem trước ${file.name}`}
                    >
                      {file.name}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 font-mono">
                      <span>{formatBytes(file.size)}</span>
                      <span>·</span>
                      <span>{formatTimeAgo(file.uploadedAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => onPreviewFile(file)}
                    className="p-1 text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
                    title="Xem trước (Preview)"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={file.url}
                    download={file.name}
                    className="p-1 text-neutral-400 hover:text-neutral-800 dark:hover:text-white rounded transition-colors"
                    title="Tải về"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={() => handleDelete(file.id)}
                    disabled={deletingId === file.id}
                    className="p-1 text-neutral-400 hover:text-red-600 rounded transition-colors"
                    title="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
