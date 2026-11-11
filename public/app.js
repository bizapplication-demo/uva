'use strict';
/* UVA 前端 — 原生 JS, 数据全部来自 /uva/api/v1 (模拟) */
const BASE = '/uva/api/v1';
let token = localStorage.getItem('uva_token') || '';
let state = { devices: [], docks: [], missions: [], alerts: [], fences: [], waylines: [], records: [], members: [], selected: null, trails: {}, zoom: 1 };
const $ = (s) => document.querySelector(s);

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (r.status === 401) { showLogin(); throw new Error('unauthorized'); }
  return r.json();
}
function skeleton(el, rows = 5) { el.innerHTML = '<div class="skel">' + '<i></i>'.repeat(rows) + '</div>'; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------- 进入（无自有登录：统一走门户登录页，2026-11-11） ---------- */
function showLogin() { showApp(); }
function showApp() { const a = $('#app'); if (a) a.style.display = 'flex'; initApp(); }
$('#logoutBtn').addEventListener('click', () => { location.href = 'https://app.outofwork.cn/'; });
$('#fsBtn').addEventListener('click', () => document.documentElement.requestFullscreen());

/* ---------- 页签工作台 ---------- */
const TABS = { situation: '态势地图', workflow: '任务规划', devices: '设备中心', media: '媒体中心', alerts: '消息中心', org: '用户中心', projects: '项目中心', search: '智能搜索' };
let openTabs = ['situation'], activeTab = 'situation';
function renderTabs() {
  $('#tabbar').innerHTML = openTabs.map(id => `<span class="tab ${id === activeTab ? 'active' : ''}" data-tab="${id}">${TABS[id]}${id !== 'situation' ? `<b data-close="${id}">×</b>` : ''}</span>`).join('') + '<button class="tab-add" id="tabAdd">＋ 新增页签</button>';
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => { if (e.target.dataset.close) return; activateTab(t.dataset.tab); }));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); closeTab(b.dataset.close); }));
  $('#tabAdd').addEventListener('click', () => { const next = Object.keys(TABS).find(k => !openTabs.includes(k)); if (next) openTab(next); });
  document.querySelectorAll('.page').forEach(pg => pg.classList.toggle('active', pg.id === 'page-' + activeTab));
  if (activeTab === 'situation') requestAnimationFrame(drawMap);
}
function openTab(id) { if (!openTabs.includes(id)) openTabs.push(id); activateTab(id); }
function closeTab(id) { openTabs = openTabs.filter(t => t !== id); if (activeTab === id) activeTab = openTabs[openTabs.length - 1]; renderTabs(); }
function activateTab(id) { activeTab = id; renderTabs(); loaders[id] && loaders[id](); }
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openTab(b.dataset.open)));

/* ---------- 时钟 ---------- */
setInterval(() => { const d = new Date(); $('#clock').textContent = d.toLocaleTimeString('zh-CN', { hour12: false }); }, 250);

/* ---------- 初始化 / 数据加载 (骨架屏先行) ---------- */
let inited = false;
async function initApp() {
  if (inited) return; inited = true;
  renderTabs();
  skeleton($('#dockCards'), 3); skeleton($('#taskCards'), 3);
  const [ov, dev, dock, mis, al, fe, wl, mem] = await Promise.all([
    api('/overview'), api('/devices'), api('/docks'), api('/missions'), api('/alerts'), api('/fences'), api('/waylines'), api('/org/members')]);
  state.devices = dev.data; state.docks = dock.data; state.missions = mis.data; state.alerts = al.data;
  state.fences = fe.data; state.waylines = wl.data; state.members = mem.data;
  $('#alertCount').textContent = '告警 ' + ov.data.alertsOpen;
  $('#dataTime').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  $('#trackFlying').textContent = ov.data.devicesFlying;
  $('#avatarGroup').innerHTML = state.members.slice(0, 6).map(m => `<i style="background:${m.avatarColor}" title="${esc(m.displayName)}">${esc(m.displayName.slice(-1))}</i>`).join('') + `<span class="muted" style="margin-left:6px">${state.members.length} 人</span>`;
  renderDocks(); renderTasks(); connectSSE(); startVideoSim(); drawMap();
  $('#alertCount').addEventListener('click', () => openTab('alerts'));
}
function renderDocks() {
  $('#dockCards').innerHTML = state.docks.map(d => {
    const drone = state.devices.find(x => x.dock_id === d.id);
    return `<div class="card" data-dock="${d.id}"><div class="t"><span>⌂ ${esc(d.name)}</span><span class="tag ${d.status === 'idle' ? 'green' : 'amber'}">${esc(d.status)}</span></div>
    <div class="muted">巢内飞机: ${d.has_drone ? esc(drone ? drone.name : '有') : '无'} · 型号 ${esc(d.model)} · 固件 <span class="mono">${esc(d.firmware)}</span></div>
    <button data-cockpit="${d.id}">进入设备驾驶舱</button></div>`;
  }).join('');
  document.querySelectorAll('[data-dock]').forEach(c => c.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') selectObject('dock', Number(c.dataset.dock)); }));
  document.querySelectorAll('[data-cockpit]').forEach(b => b.addEventListener('click', () => selectObject('dock', Number(b.dataset.cockpit), true)));
}
function renderTasks() {
  $('#taskCards').innerHTML = state.missions.slice(0, 6).map(m => `<div class="card" data-mission="${m.id}"><div class="t"><span>${esc(m.name)}</span><span class="tag ${m.status === 'flying' ? 'green' : m.status === 'failed' ? 'red' : m.status === 'timeout' ? 'amber' : 'grey'}">${esc(m.status)}</span></div>
    <div class="muted">${esc(m.device_name || '未分配')} · 同步 <span class="mono">${new Date().toLocaleTimeString('zh-CN', { hour12: false })}</span></div>
    <progress value="${m.progress}" max="100"></progress> <span class="mono">${m.progress}%</span></div>`).join('');
  document.querySelectorAll('[data-mission]').forEach(c => c.addEventListener('click', () => selectObject('mission', Number(c.dataset.mission))));
}

/* ---------- 本体详情卡 ---------- */
function selectObject(kind, id, cockpit = false) {
  state.selected = { kind, id };
  let title = '', rows = '', extra = '';
  if (kind === 'device') {
    const d = state.devices.find(x => x.id === id); if (!d) return;
    title = `✈ ${d.name} · 本体详情`;
    rows = [['编号', d.sn], ['型号', d.model], ['状态', d.status], ['电量', d.battery + '%'], ['高度', (d.alt || 0).toFixed(0) + ' m'], ['速度', (d.speed || 0).toFixed(1) + ' m/s'], ['航向', Math.round(d.heading || 0) + '°'], ['坐标', `${d.lng.toFixed(5)}, ${d.lat.toFixed(5)}`], ['固件', d.firmware]];
    const rel = state.missions.filter(m => m.device_id === id);
    extra = rel.length ? '关联任务: ' + rel.map(m => esc(m.name)).join('、') : '无关联任务';
    if (cockpit) extra += '<br>驾驶舱（模拟回执）: <button onclick="alert(\'模拟回执: 起降指令 ACK（模拟）\')">起飞</button> <button onclick="alert(\'模拟回执: 云台指令 ACK（模拟）\')">云台归中</button>';
  } else if (kind === 'dock') {
    const d = state.docks.find(x => x.id === id); if (!d) return;
    title = `⌂ ${d.name} · 本体详情`;
    rows = [['编号', d.code], ['型号', d.model], ['状态', d.status], ['巢内飞机', d.has_drone ? '有' : '无'], ['坐标', `${d.lng.toFixed(5)}, ${d.lat.toFixed(5)}`], ['固件', d.firmware]];
    if (cockpit) extra = '驾驶舱（模拟回执）: <button onclick="alert(\'模拟回执: 开舱 ACK（模拟）\')">开舱</button> <button onclick="alert(\'模拟回执: 充电 ACK（模拟）\')">开始充电</button>';
  } else {
    const m = state.missions.find(x => x.id === id); if (!m) return;
    title = `任务 · ${m.name}`;
    rows = [['状态', m.status], ['进度', m.progress + '%'], ['航线', m.wayline_name || '-'], ['设备', m.device_name || '-'], ['计划时间', m.planned_at || '-']];
  }
  $('#detailSlot').innerHTML = `<div class="panel"><h3>${esc(title)}</h3><div class="card detail-card"><dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl><div class="muted" style="margin-top:6px">${extra}</div></div></div>`;
  drawMap();
}

/* ---------- 地图 (canvas 自绘) ---------- */
const BOUNDS = { lngMin: 114.370, lngMax: 114.404, latMin: 23.138, latMax: 23.172 };
function proj(lng, lat, w, h) { return [((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * w, h - ((lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin)) * h]; }
function drawMap() {
  const cv = $('#mapCanvas'); if (!cv || activeTab !== 'situation') return;
  const r = cv.parentElement.getBoundingClientRect(); cv.width = r.width; cv.height = r.height;
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  ctx.fillStyle = '#0a0f16'; ctx.fillRect(0, 0, W, H);
  // 网格
  ctx.strokeStyle = '#16202e'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // 抽象道路 / 水体
  ctx.strokeStyle = '#24344a'; ctx.lineWidth = 5; ctx.beginPath();
  let p = proj(114.370, 23.150, W, H); ctx.moveTo(p[0], p[1]); p = proj(114.404, 23.153, W, H); ctx.lineTo(p[0], p[1]); ctx.stroke();
  ctx.strokeStyle = '#1b3a55'; ctx.lineWidth = 10; ctx.beginPath();
  p = proj(114.390, 23.172, W, H); ctx.moveTo(p[0], p[1]); p = proj(114.396, 23.138, W, H); ctx.lineTo(p[0], p[1]); ctx.stroke();
  ctx.fillStyle = '#5b6b82'; ctx.font = '11px sans-serif'; ctx.fillText('演示水体（虚构）', proj(114.393, 23.161, W, H)[0], proj(114.393, 23.161, W, H)[1]);
  // 围栏
  const fenceColor = { no_fly: '#e5534b', mission: '#e0a63c', area: '#d7dee9' };
  for (const f of state.fences) {
    ctx.beginPath(); f.polygon.forEach(([lng, lat], i) => { const [x, y] = proj(lng, lat, W, H); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
    ctx.strokeStyle = fenceColor[f.kind]; ctx.lineWidth = f.kind === 'area' ? 1 : 2; ctx.setLineDash(f.kind === 'area' ? [6, 4] : []); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = fenceColor[f.kind] + '22'; ctx.fill();
    const [lx, ly] = proj(f.polygon[0][0], f.polygon[0][1], W, H); ctx.fillStyle = fenceColor[f.kind]; ctx.fillText(f.name, lx + 4, ly - 4);
  }
  // 航线
  ctx.strokeStyle = '#4f8ff788'; ctx.lineWidth = 1.5;
  for (const wl of state.waylines) { ctx.beginPath(); wl.waypoints.forEach((wp, i) => { const [x, y] = proj(wp.lng, wp.lat, W, H); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
  // 轨迹尾迹
  for (const d of state.devices) {
    const tr = state.trails[d.id] || []; if (tr.length < 2) continue;
    ctx.strokeStyle = '#3fb97f99'; ctx.lineWidth = 2; ctx.beginPath();
    tr.forEach(([lng, lat], i) => { const [x, y] = proj(lng, lat, W, H); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  }
  // 机巢
  for (const d of state.docks) {
    const [x, y] = proj(d.lng, d.lat, W, H); const sel = state.selected && state.selected.kind === 'dock' && state.selected.id === d.id;
    ctx.fillStyle = sel ? '#4f8ff7' : '#e0a63c'; ctx.fillRect(x - 6, y - 6, 12, 12);
    ctx.fillStyle = '#d7dee9'; ctx.font = '11px sans-serif'; ctx.fillText('⌂ ' + d.name, x + 9, y + 4);
  }
  // 无人机
  for (const d of state.devices) {
    if (d.lng == null) continue; const [x, y] = proj(d.lng, d.lat, W, H);
    const sel = state.selected && state.selected.kind === 'device' && state.selected.id === d.id;
    ctx.save(); ctx.translate(x, y); ctx.rotate((d.heading || 0) * Math.PI / 180);
    ctx.fillStyle = d.status === 'offline' ? '#5b6b82' : d.battery < 30 ? '#e5534b' : '#3fb97f';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.restore();
    if (sel) { ctx.strokeStyle = '#4f8ff7'; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#d7dee9'; ctx.font = '11px sans-serif'; ctx.fillText(`${d.name} ${d.battery}%`, x + 9, y + 4);
  }
  cv.onclick = (e) => {
    const rect = cv.getBoundingClientRect(); const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bd = 22;
    for (const d of state.devices) { const [x, y] = proj(d.lng, d.lat, cv.width, cv.height); const dist = Math.hypot(x - mx, y - my); if (dist < bd) { bd = dist; best = { kind: 'device', id: d.id }; } }
    for (const d of state.docks) { const [x, y] = proj(d.lng, d.lat, cv.width, cv.height); const dist = Math.hypot(x - mx, y - my); if (dist < bd) { bd = dist; best = { kind: 'dock', id: d.id }; } }
    if (best) selectObject(best.kind, best.id);
  };
}
$('#zoomIn').addEventListener('click', () => { BOUNDS.lngMin += 0.002; BOUNDS.lngMax -= 0.002; BOUNDS.latMin += 0.002; BOUNDS.latMax -= 0.002; drawMap(); });
$('#zoomOut').addEventListener('click', () => { BOUNDS.lngMin -= 0.002; BOUNDS.lngMax += 0.002; BOUNDS.latMin -= 0.002; BOUNDS.latMax += 0.002; drawMap(); });
window.addEventListener('resize', drawMap);

/* ---------- SSE 实时流 ---------- */
function connectSSE() {
  const es = new EventSource(BASE + '/stream?token=' + encodeURIComponent(token));
  es.addEventListener('telemetry', (e) => {
    const d = JSON.parse(e.data);
    for (const nd of d.devices) {
      const old = state.devices.find(x => x.id === nd.id); if (old) Object.assign(old, nd);
      if (nd.status === 'flying') { (state.trails[nd.id] = state.trails[nd.id] || []).push([nd.lng, nd.lat]); if (state.trails[nd.id].length > 60) state.trails[nd.id].shift(); }
    }
    for (const nm of d.missions) { const old = state.missions.find(x => x.id === nm.id); if (old) Object.assign(old, nm); }
    $('#dataTime').textContent = new Date(d.at).toLocaleTimeString('zh-CN', { hour12: false });
    if (state.selected && state.selected.kind === 'device') selectObject('device', state.selected.id);
    drawMap();
    if (activeTab === 'situation') renderTasksLight();
  });
  es.addEventListener('event', (e) => {
    const d = JSON.parse(e.data);
    $('#eventLatest').textContent = `[${new Date(d.at).toLocaleTimeString('zh-CN', { hour12: false })}] ${d.text}`;
    $('#eventHistory').textContent = d.kind + '/' + d.level;
    api('/alerts').then(j => { state.alerts = j.data; const open = state.alerts.filter(a => a.status === 'open').length; $('#alertCount').textContent = '告警 ' + open; }).catch(() => {});
  });
}
let taskRenderAt = 0;
function renderTasksLight() { const now = Date.now(); if (now - taskRenderAt < 4000) return; taskRenderAt = now; renderTasks(); }

/* ---------- 模拟视频 (canvas 动画, 非静态占位) ---------- */
function startVideoSim() {
  const draw = (id, osdId, label, hue) => {
    const cv = document.getElementById(id); if (!cv) return; const ctx = cv.getContext('2d'); let t = 0;
    setInterval(() => {
      t++; const W = cv.width, H = cv.height;
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a2b22'); g.addColorStop(1, '#0c1712'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#2c4a3a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0, 20 + i * 24 + Math.sin(t / 9 + i) * 3); ctx.lineTo(W, 14 + i * 26); ctx.stroke(); }
      ctx.fillStyle = '#33523f'; ctx.fillRect((t * 2) % W, H - 34, 26, 20); ctx.fillRect((t * 1.2 + 80) % W, H - 30, 18, 16);
      ctx.strokeStyle = 'rgba(120,255,170,.25)'; const sy = (t * 3) % H; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke(); // 扫描线
      ctx.strokeStyle = '#7ee2a8'; ctx.strokeRect(10, 10, W - 20, H - 20);
      ctx.fillStyle = '#ff5f56'; ctx.beginPath(); ctx.arc(18, 20, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d7dee9'; ctx.font = '10px monospace';
      const tc = new Date().toISOString().slice(11, 19) + ':' + String(t % 30).padStart(2, '0');
      ctx.fillText(`REC ${label} · SIM`, 28, 23); ctx.fillText(tc, W - 86, H - 14);
      const osd = document.getElementById(osdId); if (osd) osd.textContent = `OSD ${tc} · 信号 -${58 + (t % 7)}dBm · 码率 4.2Mbps（模拟画面）`;
    }, 120);
  };
  draw('vid1', 'vidOsd1', 'DOCK-A CAM', 1); draw('vid2', 'vidOsd2', 'UAV-001 CAM', 2);
}

/* ---------- AI 助理 ---------- */
async function askAssistant(text) {
  if (!text.trim()) return;
  $('#chatBox').insertAdjacentHTML('beforeend', `<div class="msg me">${esc(text)}</div>`);
  const j = await api('/assistant', { method: 'POST', body: JSON.stringify({ message: text }) });
  $('#chatBox').insertAdjacentHTML('beforeend', `<div class="msg bot">${esc(j.data.reply)}</div>`);
  $('#chatBox').scrollTop = 1e6;
}
document.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => askAssistant(b.dataset.ask)));
$('#chatSend').addEventListener('click', () => { askAssistant($('#chatInput').value); $('#chatInput').value = ''; });
$('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#chatSend').click(); });

/* ---------- 各页加载器 ---------- */
const DEVICE_COLS = [['name', '名称'], ['sn', '编号'], ['model', '型号'], ['status', '状态'], ['battery', '电量%'], ['firmware', '固件'], ['dock', '所属机巢']];
let visibleCols = DEVICE_COLS.map(c => c[0]); let deviceSub = 'drones';
function renderColCfg() {
  $('#colCfg').innerHTML = '<span class="muted">列显隐:</span>' + DEVICE_COLS.map(([k, label]) => `<label><input type="checkbox" data-col="${k}" ${visibleCols.includes(k) ? 'checked' : ''} style="width:auto"> ${label}</label>`).join('');
  document.querySelectorAll('[data-col]').forEach(cb => cb.addEventListener('change', () => { visibleCols = [...document.querySelectorAll('[data-col]:checked')].map(x => x.dataset.col); renderDevices(); }));
}
function renderDevices() {
  const el = $('#deviceTable'); skeleton(el, 4);
  setTimeout(() => { // 骨架屏短暂展示, 避免先闪 0 条
    if (deviceSub === 'docks') {
      el.innerHTML = `<table><tr><th>名称</th><th>编号</th><th>型号</th><th>状态</th><th>巢内飞机</th><th>固件</th></tr>${state.docks.map(d => `<tr><td>${esc(d.name)}</td><td class="mono">${esc(d.code)}</td><td>${esc(d.model)}</td><td>${esc(d.status)}</td><td>${d.has_drone ? '有' : '无'}</td><td class="mono">${esc(d.firmware)}</td></tr>`).join('')}</table>`;
      return;
    }
    const head = DEVICE_COLS.filter(([k]) => visibleCols.includes(k));
    el.innerHTML = `<table><tr>${head.map(([, l]) => `<th>${l}</th>`).join('')}</tr>${state.devices.map(d => {
      const vals = { name: d.name, sn: d.sn, model: d.model, status: d.status, battery: d.battery + '%', firmware: d.firmware, dock: (state.docks.find(x => x.id === d.dock_id) || {}).name || '-' };
      return `<tr>${head.map(([k]) => `<td class="${k === 'sn' || k === 'firmware' ? 'mono' : ''}">${esc(String(vals[k]))}</td>`).join('')}</tr>`;
    }).join('')}</table>`;
  }, 350);
}
const loaders = {
  workflow: () => {
    skeleton($('#missionTable'), 3);
    setTimeout(() => { $('#missionTable').innerHTML = `<table><tr><th>任务</th><th>航线</th><th>设备</th><th>状态</th><th>进度</th></tr>${state.missions.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.wayline_name || '-')}</td><td>${esc(m.device_name || '-')}</td><td>${esc(m.status)}</td><td class="mono">${m.progress}%</td></tr>`).join('')}</table>`; }, 300);
    drawPlan();
  },
  devices: () => { renderColCfg(); renderDevices(); },
  media: async () => {
    const el = $('#recordTable'); skeleton(el, 6);
    const j = await api('/records'); state.records = j.data;
    el.innerHTML = `<table><tr><th>时间</th><th>计划</th><th>项目</th><th>状态</th><th>飞机</th><th>机巢</th><th>里程m</th><th>时长s</th><th>喊话s</th><th>最大高度</th><th>耗电%</th><th>操作</th></tr>${state.records.map(r => `<tr><td class="mono">${esc(r.started_at || '')}</td><td>${esc(r.mission_name || '')}</td><td>${esc(r.project_name || '')}</td><td>${esc(r.status)}</td><td>${esc(r.device_name || '')}</td><td>${esc(r.dock_name || '')}</td><td class="mono">${r.distance_m}</td><td class="mono">${r.duration_s}</td><td class="mono">${r.shout_duration_s}</td><td class="mono">${r.max_alt}</td><td class="mono">${r.battery_used}</td><td><button data-replay="${r.id}">回放</button></td></tr>`).join('')}</table>`;
    document.querySelectorAll('[data-replay]').forEach(b => b.addEventListener('click', () => setupReplay(Number(b.dataset.replay))));
    if (state.records[0]) setupReplay(state.records[0].id);
  },
  alerts: async () => {
    const el = $('#alertTable'); skeleton(el, 5);
    const j = await api('/alerts'); state.alerts = j.data;
    el.innerHTML = `<table><tr><th>时间</th><th>等级</th><th>型号/类型</th><th>设备</th><th>内容</th><th>状态</th><th>操作</th></tr>${state.alerts.map(a => `<tr><td class="mono">${esc(a.created_at)}</td><td><span class="tag ${a.level === 'red' ? 'red' : a.level === 'amber' ? 'amber' : 'blue'}">${esc(a.level)}</span></td><td>${esc(a.type)}</td><td>${esc(a.target_name || '')}</td><td>${esc(a.content)}</td><td>${a.status}</td><td>${a.status === 'open' ? `<button data-ack="${a.id}">确认</button>` : '已确认'}</td></tr>`).join('')}</table>`;
    document.querySelectorAll('[data-ack]').forEach(b => b.addEventListener('click', async () => { await api(`/alerts/${b.dataset.ack}/ack`, { method: 'POST', body: '{}' }); loaders.alerts(); }));
  },
  org: () => {
    $('#memberTable').innerHTML = `<table><tr><th>成员</th><th>账号</th><th>角色</th><th>加入时间</th></tr>${state.members.map(m => `<tr><td>${esc(m.displayName)}</td><td class="mono">${esc(m.username)}</td><td>${esc(m.role)}</td><td class="mono">${esc(m.created_at)}</td></tr>`).join('')}</table>`;
  },
  projects: () => {
    $('#projGrid').innerHTML = [['惠州演示区巡检项目', '默认 · 永久', state.members.length, '演示管理员'], ['演示区测绘项目', '永久', 4, '飞手·陈演示'], ['湖畔生态巡查项目', '永久', 3, '演示管理员']].map(([n, t, c, by]) => `<div class="proj"><div class="t" style="display:flex;justify-content:space-between"><b>${n}</b><span class="tag blue">${t}</span></div><p class="muted" style="margin-top:8px">成员 ${c} 人 · 创建者 ${by}<br>点位: 惠州演示区（虚构坐标）· 机巢 ${state.docks.length} 座</p></div>`).join('');
  },
  search: () => {},
};
document.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => { deviceSub = b.dataset.sub; renderDevices(); }));

/* ---------- 任务规划画布 (示例方案) ---------- */
function drawPlan() {
  const cv = $('#planCanvas'); if (!cv) return; const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  ctx.fillStyle = '#0a0f16'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#16202e'; for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const wl = state.waylines[0]; if (!wl) return;
  const pts = wl.waypoints.map(wp => proj(wp.lng, wp.lat, W, H));
  ctx.strokeStyle = '#4f8ff7'; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  pts.forEach(([x, y], i) => { ctx.fillStyle = '#e0a63c'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0b0e13'; ctx.font = 'bold 10px monospace'; ctx.fillText(String(i + 1), x - 3, y + 3); ctx.fillStyle = '#d7dee9'; ctx.fillText(`WP${i + 1} ${wl.waypoints[i].alt}m`, x + 9, y); });
  // 相机视野幅宽示意
  if (pts[1] && pts[2]) { ctx.strokeStyle = '#3fb97f88'; ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[1][0] + 46, pts[1][1] + 30); ctx.lineTo(pts[2][0] + 46, pts[2][1] + 30); ctx.stroke(); }
  ctx.fillStyle = '#8b98ab'; ctx.font = '12px sans-serif'; ctx.fillText(`示例方案: ${wl.name} · ${wl.waypoints.length} 航点 · 里程 ${wl.distance_m}m（模拟）`, 14, 22);
}
$('#dispatchBtn') && $('#dispatchBtn').addEventListener('click', () => { $('#dispatchAck').textContent = '模拟回执 ACK · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + ' · 任务已下发（模拟，未连接真实设备）'; });

/* ---------- 轨迹回放 ---------- */
let replayTrack = [];
function setupReplay(id) {
  const r = state.records.find(x => x.id === id); if (!r) return;
  try { replayTrack = JSON.parse(r.track || '[]'); } catch { replayTrack = []; }
  // 用航线补足回放轨迹点
  if (replayTrack.length < 4 && state.waylines[0]) replayTrack = state.waylines[0].waypoints.map(w => ({ lng: w.lng, lat: w.lat }));
  drawReplay(0);
}
function drawReplay(pct) {
  const cv = $('#replayCanvas'); if (!cv) return; const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  ctx.fillStyle = '#0a0f16'; ctx.fillRect(0, 0, W, H);
  if (!replayTrack.length) return;
  // 在航点间插值出平滑轨迹
  const pts = []; for (let i = 0; i < replayTrack.length - 1; i++) { for (let s = 0; s < 10; s++) pts.push({ lng: replayTrack[i].lng + (replayTrack[i + 1].lng - replayTrack[i].lng) * s / 10, lat: replayTrack[i].lat + (replayTrack[i + 1].lat - replayTrack[i].lat) * s / 10 }); }
  pts.push(replayTrack[replayTrack.length - 1]);
  ctx.strokeStyle = '#2c3748'; ctx.beginPath(); pts.forEach((pt, i) => { const [x, y] = proj(pt.lng, pt.lat, W, H); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  const upto = Math.max(1, Math.floor(pts.length * pct / 100));
  ctx.strokeStyle = '#3fb97f'; ctx.lineWidth = 2; ctx.beginPath(); pts.slice(0, upto).forEach((pt, i) => { const [x, y] = proj(pt.lng, pt.lat, W, H); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  const cur = pts[upto - 1]; const [cx, cy] = proj(cur.lng, cur.lat, W, H);
  ctx.fillStyle = '#e0a63c'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  $('#replayLabel').textContent = `t=${pct}% · ${cur.lng.toFixed(5)}, ${cur.lat.toFixed(5)}（模拟轨迹）`;
}
$('#replaySlider') && $('#replaySlider').addEventListener('input', e => drawReplay(Number(e.target.value)));

/* ---------- 智能搜索 ---------- */
$('#searchBtn') && $('#searchBtn').addEventListener('click', () => {
  const q = $('#searchInput').value || '目标';
  $('#searchResults').innerHTML = [1, 2, 3].map(i => `<div class="proj"><b>命中 ${i} · ${esc(q)}</b><p class="muted" style="margin-top:6px">来源: 计划执行记录 #${(i * 7)} · 置信度 ${(96 - i * 7)}%（模拟）<br>时间码 <span class="mono">00:0${i}:1${i}</span> · 帧已取样 1fps</p><canvas width="220" height="70" style="background:#12241a;width:100%"></canvas></div>`).join('');
});

/* 启动 */
showApp();
