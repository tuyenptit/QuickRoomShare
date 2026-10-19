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
      ttl_hours INTEGER DEFAULT 12,
      expiresAt INTEGER
    );
  `);

  // Safely alter table to add expiresAt if column doesn't exist yet
  try {
    await db.execute('ALTER TABLE rooms ADD COLUMN expiresAt INTEGER');
    console.log('[Database] Added expiresAt column to rooms table');
  } catch (e) {
    // Column already exists
  }

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

// Helper: Parse expiresIn parameter to calculate future expiresAt timestamp
function parseExpiresIn(expiresIn: any): number | null {
  if (expiresIn === undefined || expiresIn === null || expiresIn === '' || expiresIn === 'never' || expiresIn === 0 || expiresIn === '0') {
    return null;
  }
  const now = Date.now();
  if (typeof expiresIn === 'number') {
    if (expiresIn > 1000000000) {
      if (expiresIn < 10000000000) return expiresIn * 1000;
      return expiresIn <= Number.MAX_SAFE_INTEGER ? expiresIn : null;
    }
    return now + Math.round(expiresIn * 3600 * 1000);
  }
  if (typeof expiresIn === 'string') {
    const s = expiresIn.trim().toLowerCase();
    if (s === 'never' || s === '0') return null;
    if (s.endsWith('h')) {
      const h = parseFloat(s);
      if (!isNaN(h) && h > 0) return now + Math.round(h * 3600 * 1000);
    }
    if (s.endsWith('d')) {
      const d = parseFloat(s);
      if (!isNaN(d) && d > 0) return now + Math.round(d * 24 * 3600 * 1000);
    }
    if (s.endsWith('m')) {
      const m = parseFloat(s);
      if (!isNaN(m) && m > 0) return now + Math.round(m * 60 * 1000);
    }
    const num = parseFloat(s);
    if (!isNaN(num) && num > 0) {
      if (num > 1000000000) {
        if (num < 10000000000) return Math.round(num * 1000);
        return num <= Number.MAX_SAFE_INTEGER ? Math.round(num) : null;
      }
      return now + Math.round(num * 3600 * 1000);
    }
  }
  return null;
}

// Helper: Completely delete a room physically and in SQLite
async function deleteRoomPhysicallyAndDb(roomId: string) {
  const roomUploadDir = path.join(UPLOAD_DIR, roomId);
  if (fs.existsSync(roomUploadDir)) {
    try {
      // Unlink all physical files in folder
      const files = fs.readdirSync(roomUploadDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(roomUploadDir, file));
        } catch {}
      }
      fs.rmSync(roomUploadDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`[DeleteRoom] Error deleting directory ${roomUploadDir}:`, e);
    }
  }

  try {
    await db.execute({
      sql: 'DELETE FROM files WHERE room_id = ?',
      args: [roomId],
    });
  } catch (e) {}

  try {
    await db.execute({
      sql: 'DELETE FROM texts WHERE room_id = ?',
      args: [roomId],
    });
  } catch (e) {}

  try {
    await db.execute({
      sql: 'DELETE FROM rooms WHERE id = ?',
      args: [roomId],
    });
  } catch (e) {}

  broadcastToRoom(roomId, { type: 'ROOM_CLEARED' });
}

// Background Worker: Auto-cleanup expired rooms (Self-destruct) & inactive TTL
async function performCleanup() {
  try {
    const now = Date.now();

    // 1. Dọn dẹp các phòng đã đến thời hạn tự hủy: expiresAt IS NOT NULL AND expiresAt < Date.now()
    const expiredByTimestamp = await db.execute({
      sql: 'SELECT id FROM rooms WHERE expiresAt IS NOT NULL AND expiresAt < ?',
      args: [now],
    });

    for (const row of expiredByTimestamp.rows) {
      const roomId = String(row.id);
      console.log(`[Auto-Cleanup] Room self-destructed: ${roomId}`);
      await deleteRoomPhysicallyAndDb(roomId);
    }

    // 2. Dọn dẹp phòng không hoạt động theo TTL mặc định
    const ttlMs = FILE_TTL_HOURS * 3600 * 1000;
    const cutoff = now - ttlMs;
    const expiredByInactivity = await db.execute({
      sql: 'SELECT id FROM rooms WHERE expiresAt IS NULL AND updated_at < ?',
      args: [cutoff],
    });

    for (const row of expiredByInactivity.rows) {
      const roomId = String(row.id);
      console.log(`[Auto-Cleanup] Inactive room expired: ${roomId}`);
      await deleteRoomPhysicallyAndDb(roomId);
    }

    const totalCleaned = expiredByTimestamp.rows.length + expiredByInactivity.rows.length;
    if (totalCleaned > 0) {
      console.log(`[Auto-Cleanup] Cleaned ${totalCleaned} expired room(s).`);
    }
  } catch (err) {
    console.error('[Auto-Cleanup] Error during periodic cleanup:', err);
  }
}

// Run cleanup every 15 minutes (900000ms)
setInterval(performCleanup, 15 * 60 * 1000);
setTimeout(performCleanup, 5000);

// Express Configuration & Middleware
app.set('etag', false);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Anti-Cache Middleware for ALL /api endpoints (equivalent to dynamic = 'force-dynamic')
app.use('/api', (req: Request, res: Response, next: any) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

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

// 0.1 Create or Initialize Room (POST /api/rooms)
app.post('/api/rooms', async (req: Request, res: Response) => {
  const rawId = req.body.roomId || req.body.id || '';
  const roomId = sanitizeRoomId(rawId) || Math.floor(100000 + Math.random() * 900000).toString();
  const { password, expiresIn } = req.body;
  const now = Date.now();
  const expiresAt = parseExpiresIn(expiresIn);

  try {
    const roomRes = await db.execute({
      sql: 'SELECT id, password, expiresAt FROM rooms WHERE id = ?',
      args: [roomId],
    });

    let hash: string | null = null;
    if (typeof password === 'string' && password.trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      hash = await bcrypt.hash(password.trim(), salt);
    }

    if (roomRes.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO rooms (id, text, password, created_at, updated_at, ttl_hours, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [roomId, '', hash, now, now, FILE_TTL_HOURS, expiresAt],
      });
    } else {
      const existing = roomRes.rows[0];
      const finalHash = hash !== null ? hash : existing.password;
      await db.execute({
        sql: 'UPDATE rooms SET password = ?, expiresAt = ?, updated_at = ? WHERE id = ?',
        args: [finalHash, expiresAt, now, roomId],
      });
    }

    return res.json({
      success: true,
      id: roomId,
      roomId,
      expiresAt,
      hasPassword: Boolean(hash || (roomRes.rows[0] && roomRes.rows[0].password)),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 0.2 Explicit Room Initialization / Creation with optional password & expiration
app.post('/api/rooms/:roomId/init', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  if (!roomId) {
    return res.status(400).json({ error: 'Mã phòng không hợp lệ' });
  }

  const { password, expiresIn } = req.body;
  const now = Date.now();
  const expiresAt = parseExpiresIn(expiresIn);

  try {
    const roomRes = await db.execute({
      sql: 'SELECT id, password, expiresAt FROM rooms WHERE id = ?',
      args: [roomId],
    });

    let hash: string | null = null;
    if (typeof password === 'string' && password.trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      hash = await bcrypt.hash(password.trim(), salt);
    }

    if (roomRes.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO rooms (id, text, password, created_at, updated_at, ttl_hours, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [roomId, '', hash, now, now, FILE_TTL_HOURS, expiresAt],
      });
    } else {
      const existing = roomRes.rows[0];
      const finalHash = hash !== null ? hash : existing.password;
      await db.execute({
        sql: 'UPDATE rooms SET password = ?, expiresAt = ?, updated_at = ? WHERE id = ?',
        args: [finalHash, expiresAt, now, roomId],
      });
    }

    return res.json({
      success: true,
      id: roomId,
      expiresAt,
      hasPassword: Boolean(hash || (roomRes.rows[0] && roomRes.rows[0].password)),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 1. Get Room details (Strict Security + NO CACHE + Auto-Expire Check)
app.get('/api/rooms/:roomId', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

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
    const rawHeaderPass = req.headers['x-room-password'];
    const clientPass = typeof rawHeaderPass === 'string' 
      ? rawHeaderPass.trim() 
      : (typeof req.query.pass === 'string' ? req.query.pass.trim() : (typeof req.query.password === 'string' ? req.query.password.trim() : ''));

    let roomRow: any = roomRes.rows[0];

    // Kiểm tra xem phòng đã hết hạn tự hủy chưa
    if (roomRow && roomRow.expiresAt && Number(roomRow.expiresAt) < now) {
      await deleteRoomPhysicallyAndDb(roomId);
      return res.status(404).json({ error: 'Phòng đã hết hạn và tự hủy!', expired: true });
    }

    // Auto-create room if not found
    if (!roomRow) {
      let initialHash: string | null = null;
      if (clientPass && clientPass.length > 0) {
        const salt = await bcrypt.genSalt(10);
        initialHash = await bcrypt.hash(clientPass, salt);
      }
      await db.execute({
        sql: 'INSERT INTO rooms (id, text, password, created_at, updated_at, ttl_hours, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [roomId, '', initialHash, now, now, FILE_TTL_HOURS, null],
      });
      roomRow = {
        id: roomId,
        text: '',
        password: initialHash,
        created_at: now,
        updated_at: now,
        ttl_hours: FILE_TTL_HOURS,
        expiresAt: null,
      };
    }

    const hasPassword = Boolean(roomRow.password);

    // 1. NẾU PHÒNG CÓ PASSWORD -> BẮT BUỘC KIỂM TRA HEADER
    if (hasPassword) {
      let isMatch = false;
      if (clientPass && clientPass.length > 0) {
        try {
          isMatch = await bcrypt.compare(clientPass, String(roomRow.password));
        } catch {
          isMatch = false;
        }
      }

      // NẾU SAI HOẶC KHÔNG CÓ PASS -> CHẶN NGAY LẬP TỨC!
      // TUYỆT ĐỐI KHÔNG QUERY texts và files!
      if (!isMatch) {
        return res.status(401).json({
          id: roomRow.id,
          error: 'Phòng có mật khẩu',
          isProtected: true,
          hasPassword: true,
          isLocked: true,
          expiresAt: roomRow.expiresAt ? Number(roomRow.expiresAt) : null,
        });
      }
    }

    // 2. CHỈ KHI PHÒNG KHÔNG CÓ PASS HOẶC ĐÃ NHẬP ĐÚNG PASS MỚI TRẢ VỀ NỘI DUNG:
    const filesRes = await db.execute({
      sql: 'SELECT id, name, original_name as originalName, size, mime_type as mimeType, uploaded_at as uploadedAt, url FROM files WHERE room_id = ? ORDER BY uploaded_at DESC',
      args: [roomId],
    });

    return res.json({
      id: roomRow.id,
      isProtected: hasPassword,
      hasPassword,
      isLocked: false,
      text: roomRow.text || '',
      files: filesRes.rows,
      ttlHours: Number(roomRow.ttl_hours) || FILE_TTL_HOURS,
      expiresAt: roomRow.expiresAt ? Number(roomRow.expiresAt) : null,
      createdAt: Number(roomRow.created_at),
      updatedAt: Number(roomRow.updated_at),
    });
  } catch (err: any) {
    console.error('Error fetching room:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// 1.0 PATCH room - Update self-destruct / expiration time (expiresAt)
app.patch('/api/rooms/:roomId', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  if (!roomId) {
    return res.status(400).json({ error: 'Mã phòng không hợp lệ' });
  }

  const rawHeaderPass = req.headers['x-room-password'];
  const clientPass = typeof rawHeaderPass === 'string'
    ? rawHeaderPass.trim()
    : (typeof req.body?.password === 'string' ? req.body.password.trim() : '');

  const { expiresIn } = req.body || {};

  try {
    const roomRes = await db.execute({
      sql: 'SELECT * FROM rooms WHERE id = ?',
      args: [roomId],
    });
    const room = roomRes.rows[0];

    if (!room) {
      return res.status(404).json({ error: 'Phòng không tồn tại' });
    }

    // BẮT BUỘC kiểm tra mật khẩu phòng (từ header x-room-password). Nếu phòng có pass mà header sai -> 401
    if (room.password) {
      let isMatch = false;
      if (clientPass && clientPass.length > 0) {
        try {
          isMatch = await bcrypt.compare(clientPass, String(room.password));
        } catch {
          isMatch = false;
        }
      }

      if (!isMatch) {
        return res.status(401).json({
          error: 'Mật khẩu không đúng!',
          isProtected: true,
        });
      }
    }

    // Đọc expiresIn và tính toán expiresAt
    let expiresAt: number | null = null;
    if (expiresIn === 'never' || expiresIn === null) {
      expiresAt = null;
    } else {
      expiresAt = parseExpiresIn(expiresIn);
    }

    const now = Date.now();
    await db.execute({
      sql: 'UPDATE rooms SET expiresAt = ?, updated_at = ? WHERE id = ?',
      args: [expiresAt, now, roomId],
    });

    broadcastToRoom(roomId, {
      type: 'SETTINGS_UPDATE',
      hasPassword: Boolean(room.password),
      ttlHours: room.ttl_hours,
      expiresAt,
    });

    return res.json({
      success: true,
      roomId,
      expiresAt,
      message: 'Cập nhật thời gian tự hủy thành công',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi máy chủ' });
  }
});

// 1.1 Fast Smart-Polling Sync Endpoint (1.8s interval)
app.get('/api/rooms/:roomId/sync', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const since = parseInt(req.query.since as string, 10) || 0;
  const rawHeaderPass = req.headers['x-room-password'];
  const clientPass = typeof rawHeaderPass === 'string'
    ? rawHeaderPass.trim()
    : (typeof req.query.pass === 'string' ? req.query.pass.trim() : (typeof req.query.password === 'string' ? req.query.password.trim() : undefined));

  try {
    const { authorized, room } = await verifyRoomAccess(roomId, clientPass);
    if (!room) return res.json({ hasUpdates: false, notFound: true });

    if (room.expiresAt && Number(room.expiresAt) < Date.now()) {
      await deleteRoomPhysicallyAndDb(roomId);
      return res.status(404).json({ error: 'Phòng đã hết hạn và tự hủy!', expired: true });
    }

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
      expiresAt: room.expiresAt ? Number(room.expiresAt) : null,
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

// 4. Update room settings (Password hashing with bcrypt & TTL / Expiration)
app.post('/api/rooms/:roomId/settings', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const { password, removePassword, ttlHours, expiresIn } = req.body;
  const clientPass = req.headers['x-room-password'] as string | undefined;

  try {
    const { authorized, room } = await verifyRoomAccess(roomId, clientPass);
    let activeRoom = room;
    if (!activeRoom) {
      const now = Date.now();
      const expiresAt = parseExpiresIn(expiresIn);
      await db.execute({
        sql: 'INSERT INTO rooms (id, text, password, created_at, updated_at, ttl_hours, expiresAt) VALUES (?, ?, NULL, ?, ?, ?, ?)',
        args: [roomId, '', now, now, FILE_TTL_HOURS, expiresAt],
      });
      activeRoom = { id: roomId, text: '', password: null, created_at: now, updated_at: now, ttl_hours: FILE_TTL_HOURS, expiresAt };
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
    let newExpiresAt = activeRoom.expiresAt ? Number(activeRoom.expiresAt) : null;
    if (expiresIn !== undefined) {
      newExpiresAt = parseExpiresIn(expiresIn);
    }
    const now = Date.now();

    await db.execute({
      sql: 'UPDATE rooms SET password = ?, ttl_hours = ?, expiresAt = ?, updated_at = ? WHERE id = ?',
      args: [newHashedPass, newTtl, newExpiresAt, now, roomId],
    });

    broadcastToRoom(roomId, {
      type: 'SETTINGS_UPDATE',
      hasPassword: Boolean(newHashedPass),
      ttlHours: newTtl,
      expiresAt: newExpiresAt,
    });

    return res.json({
      success: true,
      hasPassword: Boolean(newHashedPass),
      ttlHours: newTtl,
      expiresAt: newExpiresAt,
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

// 7. Clear Room Controller (Strict Security: Requires valid bcrypt password from request body or header)
async function handleClearRoom(req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/json');
  const roomId = sanitizeRoomId(req.params.roomId);
  if (!roomId) {
    return res.status(400).json({ success: false, error: 'Mã phòng không hợp lệ' });
  }

  const bodyPass = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  const queryPass = typeof req.query?.password === 'string' ? req.query.password.trim() : '';
  const headerPass = typeof req.headers['x-room-password'] === 'string' 
    ? (req.headers['x-room-password'] as string).trim() 
    : '';
  const password = bodyPass || queryPass || headerPass;

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
        return res.status(401).json({
          success: false,
          error: 'Mật khẩu không đúng!',
          message: 'Mật khẩu không đúng!',
        });
      }

      // So khớp mật khẩu với hash trong database bằng bcrypt.compare
      let match = false;
      try {
        match = await bcrypt.compare(password, String(roomRow.password));
      } catch {
        match = false;
      }

      if (!match) {
        return res.status(401).json({
          success: false,
          error: 'Mật khẩu không đúng!',
          message: 'Mật khẩu không đúng!',
        });
      }
    }

    // 3. Khớp mật khẩu hoặc phòng không có mật khẩu: tiến hành xóa sạch
    await deleteRoomPhysicallyAndDb(roomId);

    return res.status(200).json({ success: true, message: 'Đã xóa phòng thành công' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Lỗi máy chủ', message: err.message || 'Lỗi máy chủ' });
  }
}

app.delete('/api/rooms/:roomId', handleClearRoom);
app.delete('/api/rooms/:roomId/clear', handleClearRoom);
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
app.get('/api/rooms/:roomId/events', async (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  const rawHeaderPass = req.headers['x-room-password'];
  const clientPass = typeof rawHeaderPass === 'string'
    ? rawHeaderPass.trim()
    : (typeof req.query.pass === 'string' ? req.query.pass.trim() : (typeof req.query.password === 'string' ? req.query.password.trim() : undefined));

  try {
    const { authorized, room } = await verifyRoomAccess(roomId, clientPass);
    if (room && !authorized) {
      return res.status(401).json({ error: 'Yêu cầu mật khẩu để kết nối sự kiện' });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }

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

// Safe API Fallbacks: Prevent any /api route from returning HTML
app.use('/api', (err: any, req: Request, res: Response, next: any) => {
  console.error('[API Error]', err);
  res.setHeader('Content-Type', 'application/json');
  return res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Lỗi máy chủ',
    message: err.message || 'Lỗi máy chủ',
  });
});

app.use('/api', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  return res.status(404).json({
    success: false,
    error: 'API endpoint không tồn tại',
    message: 'API endpoint không tồn tại',
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
