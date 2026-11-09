'use strict';
// 冒烟自测: 需服务已启动 (PORT 与服务一致, 默认 8734)。用法: npm test
const http = require('node:http');
const PORT = process.env.PORT || '8734';
const BASE = `http://127.0.0.1:${PORT}`;

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const r = http.request(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } },
      (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); cond ? pass++ : fail++; };

  const health = await req('GET', '/uva/api/v1/health');
  check('health 200', health.status === 200, health.body.slice(0, 80));
  const login = await req('POST', '/uva/api/v1/login', { username: 'demo', password: 'uva-demo' });
  const token = JSON.parse(login.body).token;
  check('login returns token', !!token);
  const ov = await req('GET', '/uva/api/v1/overview', null, token);
  const ovj = JSON.parse(ov.body);
  check('overview simulated', ovj.simulated === true && ovj.data.devicesTotal === 6, `devices=${ovj.data && ovj.data.devicesTotal} flights=${ovj.data && ovj.data.flightsTotal}`);
  const dev = await req('GET', '/uva/api/v1/devices', null, token);
  check('devices 6', JSON.parse(dev.body).data.length === 6);
  const rec = await req('GET', '/uva/api/v1/records', null, token);
  check('records >=30', JSON.parse(rec.body).data.length >= 30, `n=${JSON.parse(rec.body).data.length}`);
  const page = await req('GET', '/uva/');
  check('page HTML 200', page.status === 200 && page.body.includes('UVA'));

  // SSE: 抓 3.5 秒, 期望 >=2 条 telemetry
  const count = await new Promise((resolve) => {
    let n = 0, buf = '';
    const r = http.get(`${BASE}/uva/api/v1/stream?token=${token}`, (res) => {
      res.on('data', (c) => { buf += c; const m = buf.match(/event: telemetry/g); if (m) n = m.length; });
      setTimeout(() => { res.destroy(); resolve(n); }, 3500);
    });
    r.on('error', () => resolve(0));
  });
  check('SSE telemetry >=2 in 3.5s', count >= 2, `n=${count}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
