import React, { useEffect, useState, useCallback } from 'react';
import { RoomFile } from '../types.ts';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Download,
  Clock,
} from 'lucide-react';
import { formatBytes } from '../utils/formatters.ts';

interface BackdropPresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: RoomFile[];
  initialIndex: number;
}

export const BackdropPresentationModal: React.FC<BackdropPresentationModalProps> = ({
  isOpen,
  onClose,
  images,
  initialIndex,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [slideshowInterval, setSlideshowInterval] = useState<number>(5000); // 5s default
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const handleNext = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const handlePrev = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // Slideshow timer
  useEffect(() => {
    let timer: any;
    if (isOpen && isPlaying && images.length > 1) {
      timer = setInterval(() => {
        handleNext();
      }, slideshowInterval);
    }
    return () => clearInterval(timer);
  }, [isOpen, isPlaying, images.length, slideshowInterval, handleNext]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none overflow-hidden animate-fade-in">
      {/* Top Floating Control Bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 text-xs font-mono font-medium bg-white/10 rounded-md backdrop-blur-md">
            {currentIndex + 1} / {images.length}
          </span>
          <span className="text-sm font-medium text-neutral-200 truncate max-w-sm md:max-w-lg">
            {currentImage?.name}
          </span>
          <span className="text-xs text-neutral-400 hidden sm:inline">
            ({formatBytes(currentImage?.size || 0)})
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Slideshow Button */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Tạm dừng chiếu (Space)' : 'Tự động chiếu lặp (Space)'}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg backdrop-blur-md transition-all ${
              isPlaying
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-white/10 hover:bg-white/20 text-neutral-200'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span className="hidden md:inline">{isPlaying ? 'Đang chiếu...' : 'Tự động chiếu'}</span>
          </button>

          {/* Speed picker when playing */}
          {isPlaying && (
            <select
              value={slideshowInterval}
              onChange={(e) => setSlideshowInterval(Number(e.target.value))}
              className="bg-black/60 text-neutral-300 text-xs px-2 py-1.5 rounded-lg border border-white/20 outline-none backdrop-blur-md"
            >
              <option value={3000}>3 giây</option>
              <option value={5000}>5 giây</option>
              <option value={10000}>10 giây</option>
            </select>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình máy chiếu (F)'}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-neutral-200 transition-colors backdrop-blur-md"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Download Current Image */}
          <a
            href={currentImage?.url}
            download={currentImage?.name}
            title="Tải ảnh này về máy"
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-neutral-200 transition-colors backdrop-blur-md"
          >
            <Download className="w-4 h-4" />
          </a>

          {/* Close Button */}
          <button
            onClick={onClose}
            title="Đóng chế độ trình chiếu (Esc)"
            className="p-2 bg-white/20 hover:bg-red-600/80 rounded-lg text-white transition-colors backdrop-blur-md ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Image Viewport */}
      <div className="relative flex-1 flex items-center justify-center p-2 sm:p-6">
        {currentImage && (
          <img
            key={currentImage.id}
            src={currentImage.url}
            alt={currentImage.name}
            className="max-h-full max-w-full object-contain select-none transition-transform duration-300 drop-shadow-2xl"
          />
        )}

        {/* Previous Button */}
        {images.length > 1 && (
          <button
            onClick={handlePrev}
            title="Ảnh trước (Mũi tên trái)"
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 rounded-full text-white backdrop-blur-md transition-all hover:scale-110 active:scale-95"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
        )}

        {/* Next Button */}
        {images.length > 1 && (
          <button
            onClick={handleNext}
            title="Ảnh tiếp theo (Mũi tên phải)"
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 rounded-full text-white backdrop-blur-md transition-all hover:scale-110 active:scale-95"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
        )}
      </div>

      {/* Bottom Filmstrip Thumbnails */}
      {images.length > 1 && (
        <div className="relative z-20 flex items-center justify-center gap-2 p-3 bg-gradient-to-t from-black/90 to-transparent overflow-x-auto">
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setCurrentIndex(idx)}
              className={`relative shrink-0 w-14 h-10 sm:w-16 sm:h-12 rounded-md overflow-hidden border-2 transition-all ${
                idx === currentIndex
                  ? 'border-indigo-500 scale-105 shadow-md shadow-indigo-500/40'
                  : 'border-transparent opacity-50 hover:opacity-100'
              }`}
            >
              <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
