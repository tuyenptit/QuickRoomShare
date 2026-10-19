/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { LobbyView } from './components/LobbyView.tsx';
import { RoomView } from './components/RoomView.tsx';
import { RecentRoom } from './types.ts';
import {
  getRecentRooms,
  removeRecentRoom,
  getThemePreference,
  setThemePreference,
  clearStoredPassword,
} from './utils/storage.ts';

interface HeaderActionSet {
  copyLink?: () => void;
  copied?: boolean;
  openQR?: () => void;
  clearRoom?: () => void;
  hasPassword?: boolean;
}

export default function App() {
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [headerActions, setHeaderActions] = useState<HeaderActionSet>({});

  useEffect(() => {
    const savedTheme = getThemePreference();
    setTheme(savedTheme);
    setThemePreference(savedTheme);
    setRecentRooms(getRecentRooms());
  }, []);

  const handleToggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setThemePreference(next);
  };

  const parseRoomFromUrl = useCallback(() => {
    const pathname = window.location.pathname;
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);

    const pathMatch = pathname.match(/^\/rooms?\/([a-zA-Z0-9_-]+)/i);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1].toLowerCase();
    }

    const hashMatch = hash.match(/^#\/?(?:rooms?\/)?([a-zA-Z0-9_-]+)/i);
    if (hashMatch && hashMatch[1]) {
      return hashMatch[1].toLowerCase();
    }

    const q = searchParams.get('room');
    if (q) {
      return q.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    }

    return null;
  }, []);

  useEffect(() => {
    const rId = parseRoomFromUrl();
    if (rId) {
      setCurrentRoomId(rId);
    }

    const handlePopState = () => {
      const room = parseRoomFromUrl();
      setCurrentRoomId(room);
      setHeaderActions({});
      setRecentRooms(getRecentRooms());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [parseRoomFromUrl]);

  const handleJoinRoom = (roomId: string) => {
    const cleanId = roomId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanId) return;

    window.history.pushState({}, '', `/room/${cleanId}`);
    setCurrentRoomId(cleanId);
    setHeaderActions({});
    setRecentRooms(getRecentRooms());
  };

  const handleGoHome = () => {
    if (currentRoomId) {
      clearStoredPassword(currentRoomId);
    }
    window.history.pushState({}, '', '/');
    setCurrentRoomId(null);
    setHeaderActions({});
    setRecentRooms(getRecentRooms());
  };

  const handleRemoveRecent = (roomId: string) => {
    removeRecentRoom(roomId);
    setRecentRooms(getRecentRooms());
  };

  return (
    <div className="min-h-screen flex flex-col bg-neutral-100/60 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      <Header
        currentRoomId={currentRoomId}
        hasPassword={headerActions.hasPassword}
        onGoHome={handleGoHome}
        onCopyLink={headerActions.copyLink}
        copiedLink={headerActions.copied}
        onOpenQR={headerActions.openQR}
        onClearRoom={headerActions.clearRoom}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="flex-1">
        {currentRoomId ? (
          <RoomView
            key={currentRoomId}
            roomId={currentRoomId}
            onGoHome={handleGoHome}
            onRegisterHeaderActions={(actions) => setHeaderActions(actions)}
          />
        ) : (
          <LobbyView
            onJoinRoom={handleJoinRoom}
            recentRooms={recentRooms}
            onRemoveRecentRoom={handleRemoveRecent}
          />
        )}
      </main>
    </div>
  );
}
