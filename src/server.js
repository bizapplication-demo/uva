'use strict';
// UVA 单进程服务: 静态前端 + REST + SSE, 基础路径 /uva/
// 零外部依赖: 仅 node:http / node:sqlite / node:crypto 等内置模块
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('./db');
const { verifyPassword } = require('../db/seed');
const { Simulator } = require('./simulator');

const PORT = parseInt(process.env.PORT || '8734', 10);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const db = openDb();

// ---- SSE clients ----
const sseClients = new Set();
function broadcast(type, payload) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) { try { res.write(msg); } catch { sseClients.delete(res); } }
}
const simulator = new Simulator(db, broadcast);
simulator.start();

// ---- helpers ----
function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function ok(res, data, extra = {}) {
  json(res, 200, { ok: true, simulated: true, source: 'simulator', at: new Date().toISOString(), data, ...extra });
}
function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
  });
}
function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now')`).get(token);
  return row || null;
}
// 2026-11-11 用户定：UVA 去掉自有登录，统一走门户登录页；无令牌时回退演示用户直接进控制台
function demoUser() {
  return db.prepare("SELECT * FROM users WHERE username='demo'").get() || null;
}
function requireAuth(req, res) {
  const u = authUser(req) || demoUser();
  if (!u) { json(res, 401, { ok: false, simulated: true, error: 'unauthorized' }); return null; }
  return u;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const method = req.method;

  // 健康检查 (免鉴权)
  if (p === '/uva/api/v1/health' || p === '/uva/health') {
    return json(res, 200, { ok: true, simulated: true, service: 'uva', version: '0.1.0', simulator: simulator.status(), at: new Date().toISOString() });
  }

  // 登录 (免鉴权)
  if (p === '/uva/api/v1/login' && method === 'POST') {
    const body = await readBody(req);
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(body.username || '');
    if (!user || !verifyPassword(body.password || '', user.password_salt, user.password_hash)) {
      return json(res, 401, { ok: false, simulated: true, error: 'invalid_credentials' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+12 hours'))").run(token, user.id);
    db.prepare('INSERT INTO audit_logs(org_id,username,action,detail) VALUES(1,?,?,?)').run(user.username, 'login', '演示登录（模拟系统）');
    return json(res, 200, { ok: true, simulated: true, token, expiresInMinutes: 720, user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role } });
  }

  // SSE (需鉴权: header 或 ?token=)
  if (p === '/uva/api/v1/stream' && method === 'GET') {
    const tokenQ = url.searchParams.get('token');
    let user = authUser(req);
    if (!user && tokenQ) user = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now')`).get(tokenQ);
    if (!user) user = demoUser();
    if (!user) return json(res, 401, { ok: false, error: 'unauthorized' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ simulated: true, at: new Date().toISOString() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ---- 以下 API 均需鉴权 ----
  if (p.startsWith('/uva/api/v1/')) {
    const user = requireAuth(req, res);
    if (!user) return;

    if (p === '/uva/api/v1/overview' && method === 'GET') {
      const c = (sql) => db.prepare(sql).get().c;
      return ok(res, {
        devicesTotal: c('SELECT COUNT(*) c FROM devices'),
        devicesFlying: c("SELECT COUNT(*) c FROM devices WHERE status='flying'"),
        devicesLowBattery: db.prepare('SELECT id,name,battery FROM devices WHERE battery<30').all(),
        docksTotal: c('SELECT COUNT(*) c FROM docks'),
        missionsToday: c("SELECT COUNT(*) c FROM missions"),
        missionsFlying: c("SELECT COUNT(*) c FROM missions WHERE status='flying'"),
        alertsOpen: c("SELECT COUNT(*) c FROM alerts WHERE status='open'"),
        flightsTotal: c('SELECT COUNT(*) c FROM flights'),
        simulator: simulator.status(),
        org: db.prepare('SELECT * FROM orgs WHERE id=1').get(),
      });
    }
    if (p === '/uva/api/v1/devices' && method === 'GET') return ok(res, db.prepare('SELECT * FROM devices ORDER BY id').all());
    if (p === '/uva/api/v1/docks' && method === 'GET') return ok(res, db.prepare('SELECT * FROM docks ORDER BY id').all());
    if (p === '/uva/api/v1/missions' && method === 'GET') {
      return ok(res, db.prepare(`SELECT m.*, w.name AS wayline_name, d.name AS device_name FROM missions m
        LEFT JOIN waylines w ON w.id=m.wayline_id LEFT JOIN devices d ON d.id=m.device_id ORDER BY m.id`).all());
    }
    if (p === '/uva/api/v1/alerts' && method === 'GET') return ok(res, db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 100').all());
    const ackMatch = p.match(/^\/uva\/api\/v1\/alerts\/(\d+)\/ack$/);
    if (ackMatch && method === 'POST') {
      db.prepare("UPDATE alerts SET status='acked', acked_at=datetime('now'), acked_by=? WHERE id=?").run(user.username, ackMatch[1]);
      db.prepare('INSERT INTO audit_logs(org_id,username,action,detail) VALUES(1,?,?,?)').run(user.username, 'alert_ack', `确认告警 #${ackMatch[1]}`);
      return ok(res, { acked: Number(ackMatch[1]) });
    }
    if (p === '/uva/api/v1/records' && method === 'GET') return ok(res, db.prepare('SELECT * FROM flights ORDER BY id DESC LIMIT 100').all());
    if (p === '/uva/api/v1/fences' && method === 'GET') {
      return ok(res, db.prepare('SELECT * FROM fences ORDER BY id').all().map(f => ({ ...f, polygon: JSON.parse(f.polygon) })));
    }
    if (p === '/uva/api/v1/waylines' && method === 'GET') {
      return ok(res, db.prepare('SELECT * FROM waylines ORDER BY id').all().map(w => ({ ...w, waypoints: JSON.parse(w.waypoints) })));
    }
    if (p === '/uva/api/v1/org/members' && method === 'GET') {
      return ok(res, db.prepare('SELECT id,username,display_name AS displayName,role,avatar_color AS avatarColor,created_at FROM users ORDER BY id').all());
    }
    if (p === '/uva/api/v1/simulator' && method === 'GET') return ok(res, simulator.status());
    if (p === '/uva/api/v1/assistant' && method === 'POST') {
      const body = await readBody(req);
      const q = String(body.message || '');
      return ok(res, { reply: assistantReply(q), simulated: true });
    }
    return json(res, 404, { ok: false, simulated: true, error: 'not_found', path: p });
  }

  // ---- 静态文件: /uva/ 与 /uva/* ----
  if (p === '/uva' || p === '/uva/') {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'));
    res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(html);
  }
  if (p.startsWith('/uva/')) {
    const rel = p.slice('/uva/'.length);
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (file.startsWith(PUBLIC_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
    return json(res, 404, { ok: false, error: 'not_found' });
  }
  if (p === '/') { res.writeHead(302, { Location: '/uva/' }); return res.end(); }
  return json(res, 404, { ok: false, error: 'not_found' });
}

function assistantReply(q) {
  const dbDevices = db.prepare('SELECT * FROM devices').all();
  const flying = dbDevices.filter(d => d.status === 'flying');
  const low = dbDevices.filter(d => d.battery < 30);
  const todayMissions = db.prepare('SELECT COUNT(*) c FROM missions').get().c;
  const openAlerts = db.prepare("SELECT COUNT(*) c FROM alerts WHERE status='open'").get().c;
  if (/低电|电量|返航/.test(q)) {
    if (!low.length) return '当前没有低电量设备（阈值 30%）。全部设备电量均在安全范围。（数据来自模拟引擎实时库）';
    return `低电量设备 ${low.length} 架：` + low.map(d => `${d.name} ${d.battery}%（${d.status}）`).join('、') + '。建议：执行中设备优先返航至所属机巢充电，备勤设备安排换电后再下发新任务。（模拟建议）';
  }
  if (/机队|设备|状态|多少架/.test(q)) {
    return `机队共 ${dbDevices.length} 架：飞行中 ${flying.length} 架（${flying.map(d => d.name).join('、') || '无'}），空闲 ${dbDevices.filter(d => d.status === 'idle').length} 架，充电 ${dbDevices.filter(d => d.status === 'charging').length} 架，离线 ${dbDevices.filter(d => d.status === 'offline').length} 架。未确认告警 ${openAlerts} 条。（模拟数据）`;
  }
  if (/任务|今日|计划/.test(q)) {
    const flyingM = db.prepare("SELECT name,progress FROM missions WHERE status='flying'").all();
    return `当前任务共 ${todayMissions} 个，其中执行中 ${flyingM.length} 个：` + (flyingM.map(m => `${m.name}（进度 ${m.progress}%）`).join('、') || '无') + '。可在「任务规划」页签查看示例方案与状态机。（模拟数据）';
  }
  if (/生成任务|创建任务|智能生成/.test(q)) {
    return '已为你生成示例方案（模拟）：「南门周界巡检线」× 巡检三号，预计里程 2.86km / 时长约 15 分钟。打开顶部「任务规划」页签即可查看航点画布，确认后可模拟下发。（本版助理为规则问答，不接真实 LLM）';
  }
  if (/告警|异常/.test(q)) {
    const rows = db.prepare("SELECT level,content FROM alerts WHERE status='open' ORDER BY id DESC LIMIT 3").all();
    return rows.length ? `未确认告警 ${openAlerts} 条，最近：` + rows.map(r => `[${r.level}] ${r.content}`).join('；') : '当前无未确认告警。（模拟数据）';
  }
  return '我是 UVA 模拟助理（规则问答）。可以问我：机队状态、低电量清单、今日任务数、告警情况，或点「智能生成任务」查看示例方案。所有回答均基于模拟数据库实时查询。';
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => { console.error(err); if (!res.headersSent) json(res, 500, { ok: false, error: 'internal' }); });
});
server.listen(PORT, () => {
  console.log(`UVA listening on http://127.0.0.1:${PORT}/uva/  (simulated data, zero-dependency)`);
});
