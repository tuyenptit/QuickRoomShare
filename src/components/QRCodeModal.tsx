import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Smartphone, ExternalLink } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomUrl: string;
  roomId: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, roomUrl, roomId }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && roomUrl) {
      QRCode.toDataURL(roomUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Failed to generate QR', err));
    }
  }, [isOpen, roomUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(roomUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md p-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                Mã QR kết nối phòng
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Phòng: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{roomId}</span>
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

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code phòng ${roomId}`}
              className="w-56 h-56 rounded-lg shadow-xs bg-white p-2"
            />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-neutral-400 animate-pulse text-sm">
              Đang tạo mã QR...
            </div>
          )}
          <p className="mt-4 text-center text-xs text-neutral-600 dark:text-neutral-300 max-w-xs leading-relaxed">
            Mở camera điện thoại hoặc Zalo để quét mã và tải ảnh/tài liệu trực tiếp lên màn hình máy chiếu!
          </p>
        </div>

        {/* Room URL Display & Copy */}
        <div className="mt-4 flex items-center gap-2 p-2 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60 text-xs">
          <input
            type="text"
            readOnly
            value={roomUrl}
            className="flex-1 bg-transparent border-none outline-none text-neutral-700 dark:text-neutral-200 font-mono text-xs px-2 truncate"
          />
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium rounded-lg text-xs hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
                <span>Đã sao chép</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Sao chép</span>
              </>
            )}
          </button>
        </div>

        {/* Close Button */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-sm font-medium rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
