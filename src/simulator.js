'use strict';
// 模拟引擎: 1Hz tick —— 执行中任务的无人机沿航点移动 / 电量下降 / 完成生成飞行记录 / 告警注入
// 全部为模拟数据 (simulated: true)。
class Simulator {
  constructor(db, broadcast) {
    this.db = db;
    this.broadcast = broadcast; // (type, payload) => void
    this.tickCount = 0;
    this.timer = null;
    this.startedAt = new Date().toISOString();
    // 运行时状态: deviceId -> { wpIndex, t }
    this.runtime = new Map();
  }
  status() {
    return {
      running: !!this.timer, tick: this.tickCount, startedAt: this.startedAt,
      source: 'simulator', simulated: true, hz: 1,
    };
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  _waypoints(mission) {
    if (!mission.wayline_id) return [];
    const row = this.db.prepare('SELECT waypoints FROM waylines WHERE id=?').get(mission.wayline_id);
    try { return JSON.parse(row.waypoints || '[]'); } catch { return []; }
  }

  tick() {
    this.tickCount++;
    const db = this.db;
    const missions = db.prepare("SELECT * FROM missions WHERE status='flying'").all();
    const events = [];
    for (const m of missions) {
      const dev = db.prepare('SELECT * FROM devices WHERE id=?').get(m.device_id);
      if (!dev) continue;
      const wps = this._waypoints(m);
      if (!wps.length) continue;
      let rt = this.runtime.get(dev.id);
      if (!rt) { rt = { wpIndex: 1, segT: 0 }; this.runtime.set(dev.id, rt); }
      if (rt.wpIndex >= wps.length) rt.wpIndex = 1;
      const target = wps[rt.wpIndex];
      const from = wps[rt.wpIndex - 1] || wps[0];
      rt.segT += 0.12; // 约 8 秒走完一段
      if (rt.segT >= 1) {
        rt.segT = 0; rt.wpIndex++;
        if (rt.wpIndex >= wps.length) {
          // 完成一圈 = 任务完成
          this._completeMission(m, dev, events);
          this.runtime.delete(dev.id);
          continue;
        }
      }
      const curTarget = wps[Math.min(rt.wpIndex, wps.length - 1)];
      const curFrom = wps[Math.max(0, rt.wpIndex - 1)];
      const lng = curFrom.lng + (curTarget.lng - curFrom.lng) * rt.segT;
      const lat = curFrom.lat + (curTarget.lat - curFrom.lat) * rt.segT;
      const alt = curTarget.alt || 80;
      const heading = (Math.atan2(curTarget.lng - curFrom.lng, curTarget.lat - curFrom.lat) * 180 / Math.PI + 360) % 360;
      const battery = Math.max(0, dev.battery - (this.tickCount % 6 === 0 ? 1 : 0));
      const progress = Math.min(99, (m.progress || 0) + 1);
      db.prepare('UPDATE devices SET lng=?,lat=?,alt=?,speed=?,heading=?,battery=?,status=? WHERE id=?')
        .run(lng, lat, alt, 7 + Math.random() * 3, Math.round(heading), battery, 'flying', dev.id);
      db.prepare('UPDATE missions SET progress=? WHERE id=?').run(progress, m.id);

      if (battery === 30 || battery === 20) {
        const msg = `电量 ${battery}%（模拟遥测），建议关注返航`;
        db.prepare('INSERT INTO alerts(org_id,level,type,target_type,target_name,content) VALUES(1,?,?,?,?,?)')
          .run(battery <= 20 ? 'red' : 'amber', 'low_battery', 'device', dev.name, msg);
        events.push({ kind: 'alert', level: battery <= 20 ? 'red' : 'amber', text: `${dev.name}: ${msg}` });
      }
      // 围栏接近: 靠近限飞区西界 lng 0.398
      if (lng > 0 + 114.394 && dev.id === 2 && this.tickCount % 30 === 0) {
        events.push({ kind: 'alert', level: 'amber', text: `${dev.name}: 接近演示限飞区边界（模拟判定）` });
      }
    }
    // 广播遥测
    const devices = db.prepare('SELECT id,name,sn,status,battery,lng,lat,alt,speed,heading FROM devices').all();
    const activeMissions = db.prepare("SELECT id,name,status,progress,device_id FROM missions WHERE status='flying'").all();
    this.broadcast('telemetry', { devices, missions: activeMissions, tick: this.tickCount, at: new Date().toISOString(), simulated: true });
    for (const e of events) this.broadcast('event', { ...e, at: new Date().toISOString(), simulated: true });
  }

  _completeMission(mission, dev, events) {
    const db = this.db;
    db.prepare("UPDATE missions SET status='completed', progress=100, ended_at=datetime('now') WHERE id=?").run(mission.id);
    db.prepare("UPDATE devices SET status='idle', speed=0 WHERE id=?").run(dev.id);
    const wl = mission.wayline_id ? db.prepare('SELECT distance_m FROM waylines WHERE id=?').get(mission.wayline_id) : null;
    db.prepare(`INSERT INTO flights(org_id,mission_id,mission_name,device_id,device_name,dock_id,dock_name,status,distance_m,duration_s,max_alt,battery_used,started_at,ended_at)
      VALUES(1,?,?,?,?,?,?,'completed',?,900,90,22,datetime('now','-15 minutes'),datetime('now'))`)
      .run(mission.id, mission.name, dev.id, dev.name, mission.dock_id, null, wl ? wl.distance_m : 2000);
    // 自动生成下一轮: 把已完成任务重置为新一轮执行中, 保持演示持续有在飞对象 (模拟闭环)
    db.prepare("UPDATE missions SET status='flying', progress=5, started_at=datetime('now'), ended_at=NULL WHERE id=?").run(mission.id);
    db.prepare("UPDATE devices SET status='flying', battery=MAX(battery,55) WHERE id=?").run(dev.id);
    events.push({ kind: 'mission', level: 'blue', text: `任务「${mission.name}」完成一轮并生成飞行记录，已自动进入下一轮（模拟闭环）` });
  }
}
module.exports = { Simulator };
