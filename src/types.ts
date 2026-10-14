export interface RoomFile {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: number;
  url: string;
}

export interface RoomDetails {
  id: string;
  hasPassword: boolean;
  isLocked: boolean;
  text: string;
  files: RoomFile[];
  ttlHours: number;
  createdAt: number;
  updatedAt: number;
}

export interface RecentRoom {
  id: string;
  lastVisited: number;
  fileCount?: number;
  snippet?: string;
}

export type SyncStatus = 'saved' | 'saving' | 'synced' | 'error' | 'offline';
