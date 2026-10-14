import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import bcrypt from 'bcryptjs';
import { createClient } from '@libsql/client';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Configuration from Environment
const DB_PATH = process.env.DATABASE_PATH || path.resolve(__dirname, 'data', 'app.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, 'uploads');
const FILE_TTL_HOURS = parseInt(process.env.FILE_TTL_HOURS || '12', 10);
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '200', 10);

// Ensure storage directories exist
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Initialize SQLite Client via @libsql/client
const db = createClient({
  url: `file:${path.resolve(DB_PATH)}`,
});

// Initialize SQLite Schema
async function initDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      text TEXT DEFAULT '',
      password TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      ttl_hours INTEGER DEFAULT 12
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      room_id TEXT,
      name TEXT,
      original_name TEXT,
      size INTEGER,
      mime_type TEXT,
      uploaded_at INTEGER,
      url TEXT
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_files_room_id ON files(room_id);
  `);

  console.log(`[Database] SQLite connected at: ${path.resolve(DB_PATH)}`);
}

initDatabase().catch((err) => {
  console.error('[Database] Failed to initialize SQLite schema:', err);
});

// SSE Subscribers per room for real-time synchronization
const roomSubscribers = new Map<string, Set<Response>>();

function broadcastToRoom(roomId: string, event: { type: string; [key: string]: any }, excludeRes?: Response) {
  const subs = roomSubscribers.get(roomId);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of subs) {
    if (client !== excludeRes) {
      try {
        client.write(payload);
      } catch {
        subs.delete(client);
      }
    }
  }
}

// Background Worker: Auto-cleanup expired rooms & files (TTL)
async function performCleanup() {
  try {
    const ttlMs = FILE_TTL_HOURS * 3600 * 1000;
    const cutoff = Date.now() - ttlMs;

    const expiredRoomsResult = await db.execute({
      sql: 'SELECT id FROM rooms WHERE updated_at < ?',
      args: [cutoff],
    });

    for (const row of expiredRoomsResult.rows) {
      const roomId = String(row.id);
      console.log(`[Auto-Cleanup] Room expired: ${roomId}`);

      const roomUploadDir = path.join(UPLOAD_DIR, roomId);
      if (fs.existsSync(roomUploadDir)) {
        try {
          fs.rmSync(roomUploadDir, { recursive: true, force: true });
        } catch (e) {
          console.error(`[Auto-Cleanup] Error deleting directory ${roomUploadDir}:`, e);
        }
      }

      await db.execute({
        sql: 'DELETE FROM files WHERE room_id = ?',
        args: [roomId],
      });
      await db.execute({
        sql: 'DELETE FROM rooms WHERE id = ?',
        args: [roomId],
      });

      broadcastToRoom(roomId, { type: 'ROOM_CLEARED' });
    }

    if (expiredRoomsResult.rows.length > 0) {
      console.log(`[Auto-Cleanup] Cleaned ${expiredRoomsResult.rows.length} expired room(s).`);
    }
  } catch (err) {
    console.error('[Auto-Cleanup] Error during periodic cleanup:', err);
  }
}

// Run cleanup every 30 minutes
setInterval(performCleanup, 30 * 60 * 1000);
setTimeout(performCleanup, 5000);

// Express Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

function sanitizeRoomId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

// Helper to check room password against client header
async function verifyRoomAccess(roomId: string, rawPassword?: string): Promise<{ authorized: boolean; room: any }> {
  const roomRes = await db.execute({
    sql: 'SELECT * FROM rooms WHERE id = ?',
    args: [roomId],
  });
  const room = roomRes.rows[0];
  if (!room) return { authorized: false, room: null };

  if (!room.password) {
    return { authorized: true, room };
  }

  if (!rawPassword) {
    return { authorized: false, room };
  }

  const match = await bcrypt.compare(rawPassword, String(room.password));
  return { authorized: match, room };
}

// Multer storage for uploads (up to MAX_FILE_SIZE_MB)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const roomId = sanitizeRoomId(req.params.roomId);
    const roomFolder = path.join(UPLOAD_DIR, roomId);
    if (!fs.existsSync(roomFolder)) {
      fs.mkdirSync(roomFolder, { recursive: true });
    }
    cb(null, roomFolder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  },
});

// API Routes
// 0. Lightweight check-auth / room status check
app.get('/api/rooms/:roomId/check-auth', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  if (!roomId) {
    return res.status(400).json({ error: 'Mã phòng không hợp lệ' });
  }

  try {
    const roomRes = await db.execute({
      sql: 'SELECT id, password FROM rooms WHERE id = ?',
      args: [roomId],
    });

    const roomRow = roomRes.rows[0];
    if (!roomRow) {
      return res.json({ exists: false, hasPassword: false });
    }

    return res.json({
      exists: true,
      hasPassword: Boolean(roomRow.password),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 1. Get Room details
app.get('/api/rooms/:roomId', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  if (!roomId) {
    return res.status(400).json({ error: 'Mã phòng không hợp lệ' });
  }

  try {
    const roomRes = await db.execute({
      sql: 'SELECT * FROM rooms WHERE id = ?',
      args: [roomId],
    });

    const now = Date.now();
    const clientPass = req.headers['x-room-password'] as string | undefined;
    let roomRow: any = roomRes.rows[0];

    if (!roomRow) {
      let initialHash: string | null = null;
      if (clientPass && clientPass.trim()) {
        const salt = await bcrypt.genSalt(10);
        initialHash = await bcrypt.hash(clientPass.trim(), salt);
      }
      await db.execute({
        sql: 'INSERT INTO rooms (id, text, password, created_at, updated_at, ttl_hours) VALUES (?, ?, ?, ?, ?, ?)',
        args: [roomId, '', initialHash, now, now, FILE_TTL_HOURS],
      });
      roomRow = {
        id: roomId,
        text: '',
        password: initialHash,
        created_at: now,
        updated_at: now,
        ttl_hours: FILE_TTL_HOURS,
      };
    }

    const hasPassword = Boolean(roomRow.password);
    let isLocked = false;

    if (hasPassword) {
      if (!clientPass) {
        isLocked = true;
      } else {
        const match = await bcrypt.compare(clientPass, String(roomRow.password));
        isLocked = !match;
      }
    }

    // Fetch files if not locked
    let files: any[] = [];
    if (!isLocked) {
      const filesRes = await db.execute({
        sql: 'SELECT id, name, original_name as originalName, size, mime_type as mimeType, uploaded_at as uploadedAt, url FROM files WHERE room_id = ? ORDER BY uploaded_at DESC',
        args: [roomId],
      });
      files = filesRes.rows;
    }

    return res.json({
      id: roomRow.id,
      hasPassword,
      isLocked,
      text: isLocked ? '' : (roomRow.text || ''),
      files: isLocked ? [] : files,
      ttlHours: Number(roomRow.ttl_hours) || FILE_TTL_HOURS,
      createdAt: Number(roomRow.created_at),
      updatedAt: Number(roomRow.updated_at),
    });
  } catch (err: any) {
    console.error('Error fetching room:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// 1.1 Fast Smart-Polling Sync Endpoint (1.8s interval)
app.get('/api/rooms/:roomId/sync', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const since = parseInt(req.query.since as string, 10) || 0;
  const clientPass = req.headers['x-room-password'] as string | undefined;

  try {
    const { authorized, room } = await verifyRoomAccess(roomId, clientPass);
    if (!room) return res.json({ hasUpdates: false, notFound: true });
    if (!authorized) return res.status(401).json({ error: 'Chưa mở khóa' });

    const currentUpdatedAt = Number(room.updated_at);
    if (since > 0 && currentUpdatedAt <= since) {
      return res.json({ hasUpdates: false, updatedAt: currentUpdatedAt });
    }

    const filesRes = await db.execute({
      sql: 'SELECT id, name, original_name as originalName, size, mime_type as mimeType, uploaded_at as uploadedAt, url FROM files WHERE room_id = ? ORDER BY uploaded_at DESC',
      args: [roomId],
    });

    return res.json({
      hasUpdates: true,
      text: String(room.text || ''),
      files: filesRes.rows,
      updatedAt: currentUpdatedAt,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Unlock room with bcrypt password verification
app.post('/api/rooms/:roomId/unlock', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const { password } = req.body;

  try {
    const roomRes = await db.execute({
      sql: 'SELECT password, text FROM rooms WHERE id = ?',
      args: [roomId],
    });

    const roomRow = roomRes.rows[0];
    if (!roomRow) return res.status(404).json({ error: 'Phòng không tồn tại' });

    if (!roomRow.password) {
      const filesRes = await db.execute({
        sql: 'SELECT id, name, original_name as originalName, size, mime_type as mimeType, uploaded_at as uploadedAt, url FROM files WHERE room_id = ? ORDER BY uploaded_at DESC',
        args: [roomId],
      });
      return res.json({ success: true, text: roomRow.text, files: filesRes.rows });
    }

    const match = await bcrypt.compare(password || '', String(roomRow.password));
    if (match) {
      const filesRes = await db.execute({
        sql: 'SELECT id, name, original_name as originalName, size, mime_type as mimeType, uploaded_at as uploadedAt, url FROM files WHERE room_id = ? ORDER BY uploaded_at DESC',
        args: [roomId],
      });
      return res.json({ success: true, text: roomRow.text, files: filesRes.rows });
    }

    return res.status(401).json({ error: 'Mật khẩu phòng không đúng' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Save Notepad Text
app.post('/api/rooms/:roomId/text', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const { text, senderId } = req.body;
  const clientPass = req.headers['x-room-password'] as string | undefined;

  try {
    const { authorized, room } = await verifyRoomAccess(roomId, clientPass);
    if (room && !authorized) {
      return res.status(401).json({ error: 'Chưa mở khóa phòng' });
    }

    const now = Date.now();
    const cleanText = typeof text === 'string' ? text : '';

    await db.execute({
      sql: `INSERT INTO rooms (id, text, created_at, updated_at, ttl_hours)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
      args: [roomId, cleanText, now, now, FILE_TTL_HOURS],
    });

    broadcastToRoom(roomId, {
      type: 'TEXT_UPDATE',
      text: cleanText,
      updatedAt: now,
      senderId,
    });

    return res.json({ success: true, updatedAt: now });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Update room settings (Password hashing with bcrypt & TTL)
app.post('/api/rooms/:roomId/settings', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const { password, removePassword, ttlHours } = req.body;
  const clientPass = req.headers['x-room-password'] as string | undefined;

  try {
    const { authorized, room } = await verifyRoomAccess(roomId, clientPass);
    let activeRoom = room;
    if (!activeRoom) {
      const now = Date.now();
      await db.execute({
        sql: 'INSERT INTO rooms (id, text, password, created_at, updated_at, ttl_hours) VALUES (?, ?, NULL, ?, ?, ?)',
        args: [roomId, '', now, now, FILE_TTL_HOURS],
      });
      activeRoom = { id: roomId, text: '', password: null, created_at: now, updated_at: now, ttl_hours: FILE_TTL_HOURS };
    } else if (!authorized) {
      return res.status(401).json({ error: 'Cần mật khẩu hiện tại để sửa cài đặt' });
    }

    let newHashedPass = activeRoom.password;
    if (removePassword) {
      newHashedPass = null;
    } else if (typeof password === 'string' && password.trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      newHashedPass = await bcrypt.hash(password.trim(), salt);
    }

    const newTtl = typeof ttlHours === 'number' ? ttlHours : (activeRoom.ttl_hours || FILE_TTL_HOURS);
    const now = Date.now();

    await db.execute({
      sql: 'UPDATE rooms SET password = ?, ttl_hours = ?, updated_at = ? WHERE id = ?',
      args: [newHashedPass, newTtl, now, roomId],
    });

    broadcastToRoom(roomId, {
      type: 'SETTINGS_UPDATE',
      hasPassword: Boolean(newHashedPass),
      ttlHours: newTtl,
    });

    return res.json({
      success: true,
      hasPassword: Boolean(newHashedPass),
      ttlHours: newTtl,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Upload Files
app.post('/api/rooms/:roomId/upload', upload.array('files', 15), async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const clientPass = req.headers['x-room-password'] as string | undefined;

  try {
    const { authorized, room } = await verifyRoomAccess(roomId, clientPass);
    if (room && !authorized) {
      return res.status(401).json({ error: 'Chưa mở khóa phòng' });
    }

    const uploadedFiles = (req.files as Express.Multer.File[]) || [];
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'Không có tệp nào được tải lên' });
    }

    const now = Date.now();

    for (const f of uploadedFiles) {
      const url = `/api/uploads/${roomId}/${f.filename}`;
      await db.execute({
        sql: `INSERT INTO files (id, room_id, name, original_name, size, mime_type, uploaded_at, url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [f.filename, roomId, f.originalname, f.originalname, f.size, f.mimetype, now, url],
      });
    }

    await db.execute({
      sql: 'UPDATE rooms SET updated_at = ? WHERE id = ?',
      args: [now, roomId],
    });

    const allFiles = await db.execute({
      sql: 'SELECT id, name, original_name as originalName, size, mime_type as mimeType, uploaded_at as uploadedAt, url FROM files WHERE room_id = ? ORDER BY uploaded_at DESC',
      args: [roomId],
    });

    broadcastToRoom(roomId, {
      type: 'FILES_UPDATE',
      files: allFiles.rows,
    });

    return res.json({ success: true, files: allFiles.rows });
  } catch (err: any) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Tải tệp thất bại' });
  }
});

// 6. Delete specific file
app.delete('/api/rooms/:roomId/files/:fileId', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const fileId = path.basename(req.params.fileId);
  const clientPass = req.headers['x-room-password'] as string | undefined;

  try {
    const { authorized, room } = await verifyRoomAccess(roomId, clientPass);
    if (room && !authorized) {
      return res.status(401).json({ error: 'Chưa mở khóa phòng' });
    }

    const filePath = path.join(UPLOAD_DIR, roomId, fileId);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Error removing file:', e);
      }
    }

    await db.execute({
      sql: 'DELETE FROM files WHERE id = ? AND room_id = ?',
      args: [fileId, roomId],
    });

    const now = Date.now();
    await db.execute({
      sql: 'UPDATE rooms SET updated_at = ? WHERE id = ?',
      args: [now, roomId],
    });

    const allFiles = await db.execute({
      sql: 'SELECT id, name, original_name as originalName, size, mime_type as mimeType, uploaded_at as uploadedAt, url FROM files WHERE room_id = ? ORDER BY uploaded_at DESC',
      args: [roomId],
    });

    broadcastToRoom(roomId, {
      type: 'FILES_UPDATE',
      files: allFiles.rows,
    });

    return res.json({ success: true, files: allFiles.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Clear Room Controller (Strict Security: Requires valid bcrypt password from request body)
async function handleClearRoom(req: Request, res: Response) {
  const roomId = sanitizeRoomId(req.params.roomId);
  const bodyPass = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  const queryPass = typeof req.query?.password === 'string' ? req.query.password.trim() : '';
  const password = bodyPass || queryPass;

  try {
    const roomRes = await db.execute({
      sql: 'SELECT password FROM rooms WHERE id = ?',
      args: [roomId],
    });
    const roomRow = roomRes.rows[0];
    if (!roomRow) {
      const roomFolder = path.join(UPLOAD_DIR, roomId);
      if (fs.existsSync(roomFolder)) {
        try {
          fs.rmSync(roomFolder, { recursive: true, force: true });
        } catch (e) {}
      }
      return res.status(200).json({ success: true, message: 'Đã xóa phòng thành công' });
    }

    // 2. Nếu phòng CÓ mật khẩu:
    if (roomRow.password) {
      // Nếu không có password hoặc password rỗng:
      if (!password) {
        return res.status(403).json({
          success: false,
          error: 'Mật khẩu phòng không đúng!',
          message: 'Phòng được bảo vệ, vui lòng nhập mật khẩu để xóa.',
        });
      }

      // So khớp mật khẩu với hash trong database bằng bcrypt.compare
      const match = await bcrypt.compare(password, String(roomRow.password));
      if (!match) {
        return res.status(403).json({
          success: false,
          error: 'Mật khẩu phòng không đúng!',
          message: 'Mật khẩu phòng không đúng!',
        });
      }
    }

    // 3. Khớp mật khẩu hoặc phòng không có mật khẩu: tiến hành xóa sạch
    const roomFolder = path.join(UPLOAD_DIR, roomId);
    if (fs.existsSync(roomFolder)) {
      try {
        fs.rmSync(roomFolder, { recursive: true, force: true });
      } catch (e) {
        console.error('Error removing room directory:', e);
      }
    }

    // Xóa sạch bản ghi file và phòng trong SQLite
    await db.execute({
      sql: 'DELETE FROM files WHERE room_id = ?',
      args: [roomId],
    });
    await db.execute({
      sql: 'DELETE FROM rooms WHERE id = ?',
      args: [roomId],
    });

    broadcastToRoom(roomId, {
      type: 'ROOM_CLEARED',
    });

    return res.status(200).json({ success: true, message: 'Đã xóa phòng thành công' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Lỗi máy chủ', message: err.message || 'Lỗi máy chủ' });
  }
}

app.delete('/api/rooms/:roomId', handleClearRoom);
app.post('/api/rooms/:roomId/clear', handleClearRoom);

// 8. Serve uploaded file directly
app.get('/api/uploads/:roomId/:fileId', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const fileId = path.basename(req.params.fileId);
  const filePath = path.join(UPLOAD_DIR, roomId, fileId);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Tệp không tồn tại');
  }

  try {
    const fileRes = await db.execute({
      sql: 'SELECT name, mime_type as mimeType FROM files WHERE id = ? AND room_id = ?',
      args: [fileId, roomId],
    });

    const fileMeta = fileRes.rows[0];
    if (fileMeta) {
      res.setHeader('Content-Type', String(fileMeta.mimeType) || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(String(fileMeta.name))}"`);
    }
  } catch {}

  return res.sendFile(filePath);
});

// 9. Download all files as a ZIP archive
app.get('/api/rooms/:roomId/download-all', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);

  try {
    const roomRes = await db.execute({
      sql: 'SELECT text FROM rooms WHERE id = ?',
      args: [roomId],
    });
    const filesRes = await db.execute({
      sql: 'SELECT id, name FROM files WHERE room_id = ?',
      args: [roomId],
    });

    if (filesRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không có tệp nào để tải xuống' });
    }

    const zip = new JSZip();
    for (const f of filesRes.rows) {
      const filePath = path.join(UPLOAD_DIR, roomId, String(f.id));
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath);
        zip.file(String(f.name), fileData);
      }
    }

    const roomText = String(roomRes.rows[0]?.text || '').trim();
    if (roomText) {
      zip.file(`ghi-chu-${roomId}.txt`, roomText);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${roomId}-quickroom-share.zip"`);
    return res.send(zipBuffer);
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi tạo zip' });
  }
});

// 10. Server-Sent Events (SSE) for live sync
app.get('/api/rooms/:roomId/events', (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!roomSubscribers.has(roomId)) {
    roomSubscribers.set(roomId, new Set());
  }
  const subs = roomSubscribers.get(roomId)!;
  subs.add(res);

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', roomId })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    subs.delete(res);
    if (subs.size === 0) {
      roomSubscribers.delete(roomId);
    }
  });
});

// Vite middleware in dev or static serving in production
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 QuickRoom Share running on http://0.0.0.0:${PORT} (SQLite: ${DB_PATH}, Max: ${MAX_FILE_SIZE_MB}MB, TTL: ${FILE_TTL_HOURS}h)`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
