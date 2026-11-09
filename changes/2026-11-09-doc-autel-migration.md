# 变更：道通 EIS 架构说明书静态页迁入 docs/autel（2026-11-09）

- 来源：https://ai.7x24.work/products/eis/arch/（纯前端单页，自包含，无站内其他引用；外链仅 Google Fonts CDN）
- 文件（6 个，共约 1.8MB）：index.html（36,179B）+ development.png / logical.png / physical.png / process.png / usecase.png（相对路径引用，与 index 同目录平铺即可）
- 目标：https://doc.outofwork.cn/uva/arch/autel/ ，静态源以本仓 `docs/autel/` 为准

## 落地状态
- 本地仓：已提交（953b65b，含 6 个文件）
- GitHub：index.html 已推送 main（a2f7bd29）；**5 个 PNG 未推送**——Muse 的 GitHub 通道（push_files/create_or_update_file）只接受 UTF-8 文本，二进制被拒（实测报错 "not UTF-8"）。待用户二选一：① 给本仓加 Deploy Key（写权限）后由 Muse 用 git 直推；② 用户在 GitHub 网页端把 5 个 PNG 上传到 docs/autel/。
- 服务器（ecs-sz）：6 个文件已部署到 /usr/share/nginx/html/uva/arch/autel/（664，大小逐一核对一致）；容器栈新增 vhost doc.conf（HTTP，root=/usr/share/nginx/html），nginx -t 通过（duplicate MIME 警告为既存）、已 reload；服务器侧 --resolve 验收：index 200（36,179B）、logical.png 200（381,282B）、outofwork.cn 回归 200。
- 待办：① 用户加 DNS：doc.outofwork.cn A → 47.112.123.73；② DNS 生效后 Muse 补 HTTPS（certbot webroot 签发 + 443 块 + HTTP 跳转，仿 uva-app.conf 式样，证书进 /etc/nginx/conf.d/cert 后同步容器）；③ GitHub PNG 补齐后校验 6 文件与本地仓一致。

## 修订（2026-11-09 下午，用户拍板改走 SVG）
- PNG 二进制进不了仓的问题改用 **SVG 包装**解决：每张 PNG 以 base64 内嵌进同名 .svg（纯文本、逐字节哈希校验与原图一致，非矢量重绘，放大不增清晰度）；index.html 引用已全部由 .png 改为 .svg。单文件约 450–510KB。
- GitHub：index.html + 5 个 .svg 已一并推送（见下个提交）。docs/autel 自此只含 index.html + 5×.svg，PNG 不再入仓（源站与服务器部署副本仍保留 PNG 文件本身，不影响引用）。
- 若将来想要可编辑的真矢量图：按说明书文字 + 原图逐张重绘是另一单活，本次未做。
