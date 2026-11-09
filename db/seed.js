'use strict';
// 种子数据 — 全部为模拟数据。地点为虚构「惠州演示区」，不含真实 SN 全号 / 姓名 / 电话。
const crypto = require('node:crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const calc = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'));
}
module.exports = { hashPassword, verifyPassword };

function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM orgs').get().c;
  if (count > 0) return false;

  const now = new Date();
  const iso = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
  const daysAgo = (n, h = 10, m = 0) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return iso(d); };

  db.prepare('INSERT INTO orgs(id,name,code,region) VALUES(1,?,?,?)')
    .run('惠州演示区指挥中心', 'HZ-DEMO', '惠州演示区（虚构）');

  const { salt, hash } = hashPassword('uva-demo');
  const users = [
    [1, 'demo', '演示管理员', 'admin', '#2563eb'],
    [2, 'pilot01', '飞手·陈演示', 'pilot', '#0f766e'],
    [3, 'pilot02', '飞手·林演示', 'pilot', '#7c3aed'],
    [4, 'observer01', '观察员·周演示', 'observer', '#b45309'],
    [5, 'observer02', '观察员·吴演示', 'observer', '#be185d'],
    [6, 'duty01', '值班员·郑演示', 'observer', '#475569'],
  ];
  const insUser = db.prepare('INSERT INTO users(id,org_id,username,display_name,role,password_hash,password_salt,avatar_color) VALUES(?,1,?,?,?,?,?,?)');
  for (const [id, u, dn, role, color] of users) insUser.run(id, u, dn, role, hash, salt, color);

  // 中心约 114.385, 23.152 (演示区虚构坐标)
  const docks = [
    [1, '机巢 A · 南门', 'DOCK-A01', 'UVA Dock Pro', 'busy', 114.378, 23.146, 1, 'v3.2.1'],
    [2, '机巢 B · 湖畔', 'DOCK-B02', 'UVA Dock Pro', 'idle', 114.392, 23.158, 1, 'v3.2.1'],
    [3, '机巢 C · 北岗', 'DOCK-C03', 'UVA Dock Mini', 'idle', 114.385, 23.166, 0, 'v3.1.0'],
  ];
  const insDock = db.prepare('INSERT INTO docks(id,org_id,name,code,model,status,lng,lat,has_drone,firmware) VALUES(?,1,?,?,?,?,?,?,?,?)');
  for (const d of docks) insDock.run(...d);

  const devices = [
    [1, 'UVA-DEMO-001', '巡检一号', 'UVA X4 Pro', 'flying', 62, 114.380, 23.148, 82, 8.5, 45, 'v5.1.0', 1],
    [2, 'UVA-DEMO-002', '巡检二号', 'UVA X4 Pro', 'flying', 28, 114.390, 23.156, 95, 7.2, 120, 'v5.1.0', 2],
    [3, 'UVA-DEMO-003', '测绘一号', 'UVA X4 RTK', 'idle', 96, 114.392, 23.158, 0, 0, 0, 'v5.0.3', 2],
    [4, 'UVA-DEMO-004', '夜巡一号', 'UVA X4 Thermal', 'charging', 44, 114.378, 23.146, 0, 0, 0, 'v5.1.0', 1],
    [5, 'UVA-DEMO-005', '巡检三号', 'UVA X4 Pro', 'idle', 88, 114.385, 23.166, 0, 0, 0, 'v5.1.0', 3],
    [6, 'UVA-DEMO-006', '备勤一号', 'UVA X4 Mini', 'offline', 15, 114.385, 23.166, 0, 0, 0, 'v4.9.0', 3],
  ];
  const insDev = db.prepare('INSERT INTO devices(id,org_id,sn,name,model,status,battery,lng,lat,alt,speed,heading,firmware,dock_id) VALUES(?,1,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const d of devices) insDev.run(...d);

  const waylines = [
    [1, '南门周界巡检线', '沿演示区南侧周界往返巡检', JSON.stringify([
      { lng: 114.378, lat: 23.146, alt: 80 }, { lng: 114.382, lat: 23.144, alt: 80 },
      { lng: 114.388, lat: 23.144, alt: 85 }, { lng: 114.392, lat: 23.147, alt: 85 },
      { lng: 114.390, lat: 23.151, alt: 80 }, { lng: 114.378, lat: 23.146, alt: 80 }]), 2860],
    [2, '湖畔生态巡查线', '环湖畔演示水体巡查', JSON.stringify([
      { lng: 114.392, lat: 23.158, alt: 90 }, { lng: 114.396, lat: 23.160, alt: 90 },
      { lng: 114.397, lat: 23.155, alt: 95 }, { lng: 114.394, lat: 23.152, alt: 90 },
      { lng: 114.392, lat: 23.158, alt: 90 }]), 1980],
    [3, '北岗测绘网格线', '北岗片区网格测绘', JSON.stringify([
      { lng: 114.385, lat: 23.166, alt: 110 }, { lng: 114.380, lat: 23.168, alt: 110 },
      { lng: 114.380, lat: 23.163, alt: 110 }, { lng: 114.390, lat: 23.163, alt: 110 },
      { lng: 114.390, lat: 23.168, alt: 110 }, { lng: 114.385, lat: 23.166, alt: 110 }]), 3420],
  ];
  const insWl = db.prepare('INSERT INTO waylines(id,org_id,name,description,waypoints,distance_m) VALUES(?,1,?,?,?,?)');
  for (const w of waylines) insWl.run(...w);

  const missions = [
    // name, wayline, device, dock, status, progress, planned offset days
    ['南门晨间巡检', 1, 1, 1, 'flying', 46, 0],
    ['湖畔午间巡查', 2, 2, 2, 'flying', 31, 0],
    ['北岗测绘作业', 3, 3, 2, 'ready', 0, 0],
    ['南门傍晚巡检', 1, 4, 1, 'ready', 0, 0],
    ['南门夜间巡检（昨日）', 1, 1, 1, 'completed', 100, 1],
    ['湖畔巡查（昨日）', 2, 2, 2, 'completed', 100, 1],
    ['北岗测绘（昨日）', 3, 5, 3, 'failed', 62, 1],
    ['南门巡检（超时）', 1, 3, 2, 'timeout', 88, 2],
    ['湖畔巡查（前日）', 2, 2, 2, 'completed', 100, 2],
    ['园区全域草稿方案', 1, null, null, 'draft', 0, 0],
  ];
  const insMis = db.prepare('INSERT INTO missions(org_id,name,wayline_id,device_id,dock_id,status,progress,planned_at,started_at) VALUES(1,?,?,?,?,?,?,?,?)');
  missions.forEach(([name, wl, dev, dock, st, prog, off], i) => {
    insMis.run(name, wl, dev, dock, st, prog, daysAgo(off, 8 + i, 15), st === 'flying' || st === 'completed' || st === 'failed' ? daysAgo(off, 8 + i, 20) : null);
  });

  // 围栏: 限飞红 / 任务黄 / 区域白
  const fences = [
    ['演示限飞区（虚构）', 'no_fly', JSON.stringify([[114.398, 23.162], [114.402, 23.162], [114.402, 23.166], [114.398, 23.166]])],
    ['当前任务区', 'mission', JSON.stringify([[114.376, 23.142], [114.394, 23.142], [114.394, 23.153], [114.376, 23.153]])],
    ['演示区边界', 'area', JSON.stringify([[114.372, 23.140], [114.402, 23.140], [114.402, 23.170], [114.372, 23.170]])],
  ];
  const insFence = db.prepare('INSERT INTO fences(org_id,name,kind,polygon) VALUES(1,?,?,?)');
  for (const f of fences) insFence.run(...f);

  const alertsSeed = [
    ['amber', 'low_battery', 'device', '巡检二号', '电量 28%，低于 30% 阈值，建议返航或换电', 'open', 0],
    ['red', 'fence_approach', 'device', '巡检二号', '接近演示限飞区边界约 320m（模拟判定）', 'open', 0],
    ['blue', 'system', 'system', '模拟引擎', '模拟引擎已启动，遥测以 1Hz 推进（模拟数据）', 'open', 0],
    ['amber', 'offline', 'device', '备勤一号', '设备离线超过 2 小时（模拟状态）', 'open', 1],
    ['blue', 'mission', 'mission', '北岗测绘作业', '任务已就绪，等待下发（模拟下发）', 'acked', 1],
  ];
  const insAlert = db.prepare('INSERT INTO alerts(org_id,level,type,target_type,target_name,content,status,created_at) VALUES(1,?,?,?,?,?,?,?)');
  for (const [lv, tp, tt, tn, ct, st, off] of alertsSeed) insAlert.run(lv, tp, tt, tn, ct, st, daysAgo(off, 9, 30));

  // 计划执行记录 >=30 条
  const insFlight = db.prepare(`INSERT INTO flights(org_id,mission_id,mission_name,project_name,device_id,device_name,dock_id,dock_name,status,distance_m,duration_s,max_alt,battery_used,shout_duration_s,track,started_at,ended_at)
    VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const devNames = { 1: '巡检一号', 2: '巡检二号', 3: '测绘一号', 4: '夜巡一号', 5: '巡检三号' };
  const dockNames = { 1: '机巢 A · 南门', 2: '机巢 B · 湖畔', 3: '机巢 C · 北岗' };
  const wlNames = { 1: '南门晨间巡检', 2: '湖畔午间巡查', 3: '北岗测绘作业' };
  let fid = 0;
  for (let day = 6; day >= 0 && fid < 34; day--) {
    for (let slot = 0; slot < 5 && fid < 34; slot++) {
      fid++;
      const wl = (fid % 3) + 1;
      const dev = (fid % 5) + 1;
      const dock = ((fid + 1) % 3) + 1;
      const status = fid % 11 === 0 ? 'failed' : (fid % 13 === 0 ? 'timeout' : 'completed');
      const dist = 1500 + (fid * 137) % 2200;
      const dur = 480 + (fid * 53) % 900;
      const track = JSON.stringify([
        { lng: 114.378 + (fid % 5) * 0.002, lat: 23.146 + (fid % 4) * 0.002 },
        { lng: 114.384 + (fid % 3) * 0.002, lat: 23.150 },
        { lng: 114.390, lat: 23.155 - (fid % 3) * 0.001 },
      ]);
      insFlight.run(null, wlNames[wl], '惠州演示区巡检项目', dev, devNames[dev], dock, dockNames[dock],
        status, dist, dur, 80 + (fid % 4) * 10, 18 + (fid % 20), fid % 4 === 0 ? 30 : 0,
        track, daysAgo(day, 7 + slot * 2, 5), daysAgo(day, 7 + slot * 2, 5 + Math.floor(dur / 60)));
    }
  }

  const insMedia = db.prepare('INSERT INTO media(org_id,flight_id,kind,name) VALUES(1,?,?,?)');
  for (let i = 1; i <= 8; i++) insMedia.run(i, i % 2 ? 'photo' : 'video', `演示媒体-${String(i).padStart(2, '0')}.${i % 2 ? 'jpg' : 'mp4'}`);

  db.prepare('INSERT INTO audit_logs(org_id,username,action,detail) VALUES(1,?,?,?)').run('system', 'seed', '初始化模拟种子数据（惠州演示区）');
  return true;
}
module.exports.seed = seed;
