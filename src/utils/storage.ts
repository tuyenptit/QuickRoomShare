import { RecentRoom } from '../types.ts';

const RECENT_ROOMS_KEY = 'quickroom_recent_rooms';
const THEME_KEY = 'quickroom_theme';
const PASSWORDS_KEY = 'quickroom_passwords';

export function getRecentRooms(): RecentRoom[] {
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentRoom(room: { id: string; snippet?: string; fileCount?: number }) {
  try {
    const list = getRecentRooms().filter((r) => r.id !== room.id);
    const updated: RecentRoom = {
      id: room.id,
      lastVisited: Date.now(),
      snippet: room.snippet?.substring(0, 80),
      fileCount: room.fileCount,
    };
    const nextList = [updated, ...list].slice(0, 10);
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(nextList));
  } catch (e) {
    console.error('Failed to save recent room', e);
  }
}

export function removeRecentRoom(id: string) {
  try {
    const list = getRecentRooms().filter((r) => r.id !== id);
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to remove recent room', e);
  }
}

export function getStoredPassword(roomId: string): string | null {
  try {
    const raw = localStorage.getItem(PASSWORDS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[roomId] || null;
  } catch {
    return null;
  }
}

export function saveStoredPassword(roomId: string, password: string) {
  try {
    const raw = localStorage.getItem(PASSWORDS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[roomId] = password;
    localStorage.setItem(PASSWORDS_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to store password', e);
  }
}

export function clearStoredPassword(roomId: string) {
  try {
    const raw = localStorage.getItem(PASSWORDS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    delete map[roomId];
    localStorage.setItem(PASSWORDS_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to clear stored password', e);
  }
}

export function getThemePreference(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setThemePreference(theme: 'light' | 'dark') {
  try {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    console.error('Failed to set theme', e);
  }
}
