# UVA 部署 Runbook（正式入口，待触发）
状态：2026-11-09 已备好，未执行。用户已定：不挂临时预览，等正式入口一次上线。
触发条件（缺一不可）：
1. 阿里云 DNS：app.outofwork.cn、api.outofwork.cn 各加一条 A → 47.112.123.73（ecs-sz）
2. ecs-sz root 临时窗口有效期内（本轮至 2026-11-20，用户收回后须再开）

## 架构口径
- 单进程 Node 服务同时出页面与 API，基础路径 /uva/；两个域名都反代到同一个进程：
  - app.outofwork.cn/uva/ → 页面（页面内 API 走同域相对路径 /uva/api/v1）
  - api.outofwork.cn/uva/ → 同一服务（API 对外名，行为一致）
- 进程端口：127.0.0.1:8734（只监听本机，公网只走 nginx）

## 步骤
1. 前置核查（ecs-sz）：`node -v` 须 ≥ 22.5 且 node:sqlite 可用，目标 Node 24；
   不满足则先装 Node 24（官方 tarball 到 /usr/local）或改走容器，不改代码。
2. 传代码：本地仓打包（排除 .git、data/*.db）→ scp 到 ecs-sz:/srv/uva（muse 账号），
   文件 664 / 目录 775（防 nginx 403 的既定教训；本服务自出页面，nginx 只反代可免此坑，
   静态兜底时仍遵守）。
3. 服务托管：systemd unit `uva.service`（需 root 窗口）：
   WorkingDirectory=/srv/uva，ExecStart=/usr/bin/node src/server.js，
   Environment=PORT=8734，User=muse，Restart=always。enable + start 后本机 curl 健康检查。
4. nginx vhost（ecs-sz 的 nginx 配置目录以现网为准，先看现有 outofwork.cn 站点配置再动手）：
   - app.outofwork.cn 与 api.outofwork.cn 各一份 server{}，location /uva/ 反代 127.0.0.1:8734；
   - SSE 关键项：proxy_buffering off、proxy_http_version 1.1、proxy_read_timeout 1h、
     转发 Host/X-Forwarded-*；其余路径返回 404 或跳转 /uva/（app 域根路径跳 /uva/）。
5. 证书：certbot 为两个子域名各签一张（webroot 或 nginx 插件，DNS 生效后执行），
   确认自动续期 timer 覆盖新证书；HTTP 全量跳 HTTPS。
6. 数据：首次启动自动建库+种子（data/uva.db）；上线后演示账号 demo/uva-demo 是否保留，
   上线当天向用户确认（默认保留但在登录页标注演示账号，或改密后交付）。

## 验收清单（全过才算上线）
- [ ] https://app.outofwork.cn/uva/ 返回 200，页面标注「模拟数据」
- [ ] https://api.outofwork.cn/uva/api/v1/health 返回 ok 且 simulated:true
- [ ] 登录 demo 成功、overview/devices/records 数字与种子一致
- [ ] SSE：/uva/api/v1/stream 10 秒内收到 ≥ 8 条 telemetry
- [ ] 手机浏览器打开态势页，地图在动、电量在变、事件流在滚
- [ ] 仓内 changes/ 回写本次部署记录（版本 commit、时间、验收结果）

## 回滚
停 uva.service + 摘两个 vhost + nginx -t && reload，即恢复到上线前；DNS 记录保留无害。
