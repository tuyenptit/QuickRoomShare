import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Film,
  Music,
  File,
  Loader2,
  AlertCircle,
  Presentation,
} from 'lucide-react';
import { renderAsync } from 'docx-preview';
import { RoomFile } from '../types.ts';
import { formatBytes, formatTimeAgo, isImageFile, isPdfFile } from '../utils/formatters.ts';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: RoomFile | null;
  allImages?: RoomFile[];
  onSelectImage?: (index: number) => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  file,
  allImages = [],
  onSelectImage,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [docxLoading, setDocxLoading] = useState<boolean>(false);
  const [docxError, setDocxError] = useState<string | null>(null);

  const docxContainerRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Determine file type
  const filename = file?.name || '';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const isDocx = ext === 'docx';
  const isPptx = ext === 'pptx' || ext === 'ppt';
  const isPdf = isPdfFile(file?.mimeType || '', filename);
  const isImage = isImageFile(file?.mimeType || '', filename);

  // Image index for gallery navigation
  const currentImageIndex = allImages.findIndex((img) => img.id === file?.id);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      modalContainerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  // Keyboard navigation & Esc key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (isImage && allImages.length > 1) {
        if (e.key === 'ArrowRight' && currentImageIndex < allImages.length - 1) {
          onSelectImage?.(currentImageIndex + 1);
        } else if (e.key === 'ArrowLeft' && currentImageIndex > 0) {
          onSelectImage?.(currentImageIndex - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isImage, allImages.length, currentImageIndex, onSelectImage, onClose]);

  // Render Docx via docx-preview client-side
  useEffect(() => {
    if (isOpen && isDocx && file?.url && docxContainerRef.current) {
      setDocxLoading(true);
      setDocxError(null);
      docxContainerRef.current.innerHTML = '';

      fetch(file.url)
        .then((res) => {
          if (!res.ok) throw new Error('Không thể tải tệp Word');
          return res.blob();
        })
        .then((blob) => {
          if (docxContainerRef.current) {
            return renderAsync(blob, docxContainerRef.current, undefined, {
              className: 'docx-viewer-content',
              inWrapper: false,
              ignoreWidth: false,
              ignoreHeight: false,
              renderHeaders: true,
              renderFooters: true,
            });
          }
        })
        .then(() => {
          setDocxLoading(false);
        })
        .catch((err) => {
          console.error('Error rendering docx:', err);
          setDocxError('Không thể giải mã tệp Word trực tiếp. Vui lòng tải về máy để xem.');
          setDocxLoading(false);
        });
    }
  }, [isOpen, isDocx, file?.url]);

  // Reset zoom on open
  useEffect(() => {
    if (isOpen) {
      setZoomLevel(100);
    }
  }, [isOpen, file?.id]);

  if (!isOpen || !file) return null;

  // 1. Fullscreen Backdrop Image Viewer (Pure black background, borderless)
  if (isImage) {
    return (
      <div
        ref={modalContainerRef}
        className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none overflow-hidden animate-fade-in"
      >
        {/* Top Floating Control Bar */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-3.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <div className="flex items-center gap-2.5">
            {allImages.length > 1 && (
              <span className="px-2 py-0.5 text-xs font-mono font-medium bg-white/10 rounded-md backdrop-blur-md">
                {currentImageIndex + 1} / {allImages.length}
              </span>
            )}
            <span className="text-sm font-medium text-neutral-200 truncate max-w-sm md:max-w-md">
              {file.name}
            </span>
            <span className="text-xs text-neutral-400 hidden sm:inline">
              ({formatBytes(file.size)})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-neutral-200 transition-colors backdrop-blur-md"
              title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình máy chiếu (F)'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <a
              href={file.url}
              download={file.name}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-neutral-200 transition-colors backdrop-blur-md"
              title="Tải ảnh về máy"
            >
              <Download className="w-4 h-4" />
            </a>

            <button
              onClick={onClose}
              className="p-2 bg-white/20 hover:bg-red-600/80 rounded-lg text-white transition-colors backdrop-blur-md ml-1"
              title="Đóng (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Image Container */}
        <div className="relative flex-1 flex items-center justify-center p-2 sm:p-6">
          <img
            key={file.id}
            src={file.url}
            alt={file.name}
            className="max-h-full max-w-full object-contain select-none transition-transform duration-200 drop-shadow-2xl"
          />

          {/* Navigation Arrows */}
          {allImages.length > 1 && currentImageIndex > 0 && (
            <button
              onClick={() => onSelectImage?.(currentImageIndex - 1)}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 rounded-full text-white backdrop-blur-md transition-transform hover:scale-110"
              title="Ảnh trước (←)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {allImages.length > 1 && currentImageIndex < allImages.length - 1 && (
            <button
              onClick={() => onSelectImage?.(currentImageIndex + 1)}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 rounded-full text-white backdrop-blur-md transition-transform hover:scale-110"
              title="Ảnh tiếp theo (→)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. Document Viewer (PDF, DOCX, PPTX, or Other files)
  const officeOnlineUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(
    window.location.origin + file.url
  )}`;

  return (
    <div
      ref={modalContainerRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/70 backdrop-blur-xs animate-fade-in"
    >
      <div className="relative flex flex-col w-full h-full max-w-6xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs uppercase font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
              {ext || 'FILE'}
            </span>
            <span className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate">
              {file.name}
            </span>
            <span className="text-[11px] text-neutral-400 font-mono hidden md:inline">
              ({formatBytes(file.size)})
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Zoom controls for PDF or Docx */}
            {(isPdf || isDocx) && (
              <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-800/80 text-xs">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
                  className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
                  title="Thu nhỏ"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] px-1">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(200, z + 15))}
                  className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
                  title="Phóng to"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Fallback for PPTX to Office Web Viewer */}
            {isPptx && (
              <a
                href={officeOnlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                title="Xem slide qua Microsoft Office Online (cần mạng ngoài)"
              >
                <span>Office Viewer</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
            )}

            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              title="Toàn màn hình"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <a
              href={file.url}
              download={file.name}
              className="p-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              title="Tải về máy"
            >
              <Download className="w-4 h-4" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg transition-colors"
              title="Đóng (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-950 p-2 sm:p-4 flex items-center justify-center">
          {/* A. PDF Viewer */}
          {isPdf && (
            <div
              style={{
                width: `${zoomLevel}%`,
                height: '100%',
                transition: 'width 0.15s ease',
              }}
              className="h-full max-w-full bg-white dark:bg-neutral-900 rounded-xl shadow-xs overflow-hidden flex flex-col"
            >
              <iframe
                src={`${file.url}#toolbar=1&navpanes=1`}
                title={file.name}
                className="w-full h-full border-0 rounded-xl"
              />
            </div>
          )}

          {/* B. DOCX Viewer (Client-side HTML render via docx-preview) */}
          {isDocx && (
            <div className="w-full h-full flex flex-col items-center overflow-y-auto">
              {docxLoading && (
                <div className="my-auto flex flex-col items-center gap-2 text-neutral-400">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="text-xs">Đang giải mã tệp Word...</span>
                </div>
              )}

              {docxError && (
                <div className="my-auto max-w-md p-6 text-center space-y-3 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-xs text-neutral-600 dark:text-neutral-300">{docxError}</p>
                  <a
                    href={file.url}
                    download={file.name}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải tệp về máy</span>
                  </a>
                </div>
              )}

              <div
                ref={docxContainerRef}
                style={{
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease',
                }}
                className={`max-w-4xl w-full bg-white text-neutral-900 shadow-md p-6 sm:p-12 rounded-xl my-4 ${
                  docxLoading || docxError ? 'hidden' : 'block'
                }`}
              />
            </div>
          )}

          {/* C. PPTX Presentation Fallback */}
          {isPptx && (
            <div className="my-auto max-w-lg p-8 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Presentation className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  Bài thuyết trình PowerPoint ({file.name})
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Dung lượng: {formatBytes(file.size)} · Tải lên {formatTimeAgo(file.uploadedAt)}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <a
                  href={file.url}
                  download={file.name}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-2xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải bài trình chiếu về máy</span>
                </a>

                <a
                  href={officeOnlineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-medium rounded-xl transition-colors"
                >
                  <span>Mở Office Web Viewer</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </a>
              </div>
            </div>
          )}

          {/* D. Other file formats (Excel, ZIP, Code, etc.) */}
          {!isPdf && !isDocx && !isPptx && (
            <div className="my-auto max-w-md p-8 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center mx-auto">
                {['xls', 'xlsx', 'csv'].includes(ext) ? (
                  <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
                ) : ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) ? (
                  <FileArchive className="w-6 h-6 text-amber-500" />
                ) : ['mp4', 'mov', 'avi'].includes(ext) ? (
                  <Film className="w-6 h-6 text-purple-500" />
                ) : ['mp3', 'wav'].includes(ext) ? (
                  <Music className="w-6 h-6 text-pink-500" />
                ) : (
                  <File className="w-6 h-6 text-neutral-500" />
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                  {file.name}
                </h3>
                <p className="text-xs text-neutral-500 font-mono mt-1">
                  {formatBytes(file.size)} · Tải lên {formatTimeAgo(file.uploadedAt)}
                </p>
              </div>

              <div className="pt-2">
                <a
                  href={file.url}
                  download={file.name}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-2xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải tệp này về máy</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
