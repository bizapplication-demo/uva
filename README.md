# UVA · 无人机智能指挥系统（高仿 MVP）

前端体验对标并超越道通 EIS、后台刻意轻量的无人机智能指挥系统高仿版。**全部数据均为模拟数据**，由内置模拟引擎以 1Hz 推进；不连接任何真实设备。

- 真源文字稿：`docs/UVA-产品与架构文字稿-v0.2.md`（定位、十模块、态势页布局、技术栈、数据模型）
- 本版范围：M1 骨架 + M2 模拟闭环第一切（登录 / 态势页活数据 / SSE 遥测 / 任务推进 / 告警 / 助理规则问答 / 其余页签可用版）

## 本地运行

```bash
node --version   # 需要 Node >= 22（用到内置 node:sqlite；开发机为 Node 24）
npm start        # 或 PORT=9000 npm start
# 打开 http://127.0.0.1:8734/uva/
```

零外部依赖：不装任何 npm 包、不用 CDN。首次启动自动建库 `data/uva.db`（已 gitignore）并写入种子数据；删掉该文件重启即可重置演示数据。

## 演示账号

| 用户名 | 密码 | 角色 |
|---|---|---|
| demo | uva-demo | 管理员（演示） |

其余种子成员（pilot01 / observer01 等）同密码，仅作组织成员展示。密码在库中以 `node:crypto` scrypt 哈希存储。

## 入口与 API

基础路径 `/uva/`（单进程单端口，后端同进程托管前端静态文件）：

- 页面：`GET /uva/`
- 健康：`GET /uva/api/v1/health`（免鉴权）
- 登录：`POST /uva/api/v1/login` → `{ token }`，后续接口带 `Authorization: Bearer <token>`（有效期 720 分钟，对齐文字稿口径）
- REST：`GET /uva/api/v1/{overview,devices,docks,missions,alerts,records,fences,waylines,org/members,simulator}`
- 写操作仅两类：`POST /uva/api/v1/alerts/:id/ack`（确认告警）、`POST /uva/api/v1/assistant`（助理对话）；其余只读
- 实时：`GET /uva/api/v1/stream`（SSE，每秒推 `telemetry` + 即时 `event`；EventSource 无法带 header，故支持 `?token=`）
- 所有响应带 `{"simulated": true, "source": "simulator"}` 标注

> 与文字稿 §7 的差异：本 M1 版实时通道用 SSE 而非 WebSocket、前端用原生 JS 而非 Vue/Leaflet——理由与后续计划见 `changes/2026-11-09-m1-mvp.md`。API 契约不变，前端可后续替换。

## 目录结构

```
uva/
├── README.md
├── package.json          # scripts: start / dev / test
├── db/
│   ├── schema.sql        # orgs/users/devices/docks/waylines/missions/flights/alerts/fences/media/audit_logs(+sessions)
│   └── seed.js           # 种子: 1 组织 / 6 成员 / 3 机巢 / 6 无人机 / 3 航线 / 10 任务 / 34 条执行记录 / 围栏三类
├── src/
│   ├── server.js         # HTTP 服务 + REST + SSE + 鉴权 + 助理规则问答
│   ├── db.js             # 打开 SQLite、执行 schema、注入种子
│   └── simulator.js      # 模拟引擎: 1Hz 沿航线推进 / 耗电 / 完成生成飞行记录 / 低电与围栏告警
├── public/               # index.html / app.js / style.css（Palantir 式深色指挥风，原生实现）
├── docs/                 # 文字稿 v0.2 副本（真源在 goals/uva，仓内为开工快照）
├── changes/              # 变更文件（沿用既定规范）
├── test/smoke.js         # 冒烟自测（npm test，需先启动服务或用 PORT 指向已启动实例）
└── data/                 # 运行时 SQLite（gitignore，不入仓）
```

模拟地点为虚构「惠州演示区」坐标范围；设备编号为 `UVA-DEMO-*` 示意号，不含真实 SN、姓名、电话。

## 部署预告（未执行）

目标形态：`app.outofwork.cn/uva`（前端）+ `api.outofwork.cn/uva`（后端）。前置未决：两子域名 DNS 尚无 A 记录、GitHub 仓库 `bizapplication-demo/uva` 尚未授权本机推送。本版仅本地 git 管理，**不推送**。部署时由 nginx 反代到本进程端口即可（单进程托管静态文件，无需单独前端部署）。
