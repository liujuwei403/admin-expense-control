# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

快提快报 — 纯静态前端应用，通过 Teable REST API 读写数据，通过阿里云函数计算（FC）后端做 SSO 回调和 PaddleOCR 代理。**项目设计为公司内网使用**。

## 三层架构

```
前端（GitHub Pages 静态托管）
  │  HTTPS 直连 Teable          → https://yach-teable.zhiyinlou.com
  │  HTTPS 代理经 FC 后端       → SSO 验证、OCR 识别
  │  HTTP 直连内网 LLM          → http://ai-service.tal.com（仅内网/本地可用）
  ▼
FC 后端（阿里云函数计算 sso-backend-xzfk）
  ├─ /auth/callback   好未来 SSO 换 JWT
  ├─ /ocr             JWT 鉴权 + 调 PaddleOCR + 解析发票字段
  └─ /health
  ▼
外部服务
  ├─ Teable      HTTPS 公网
  ├─ SSO         https://sso.100tal.com（好未来统一登录）
  └─ PaddleOCR   https://c2maw7jdm04fy5a2.aistudio-app.com（公网，仅 FC 调用）
```

### 关键设计约束

- **前端页面是 HTTPS**（GitHub Pages 强制），PaddleOCR API 不支持跨域，必须经 FC 代理调用
- 内网 LLM（`http://ai-service.tal.com`）是 HTTP，从 GitHub Pages（HTTPS）调用会触发浏览器混合内容拦截；**本地开发或内网部署时正常**
- Teable Token 通过 `REMOVED_TOKEN` 占位符 + GitHub Actions `sed` 注入到 `docs/api.js`；PADDLEOCR_TOKEN 存 FC 环境变量，不暴露在前端

## 运行与部署

```bash
# 本地开发（需手动把 public/api.js 里 REMOVED_TOKEN 改成真实 Token）
cd public && python -m http.server 8080
# 或
npx serve public

# 运行纯函数单元测试（无需浏览器/网络）
node test/unit.js

# 数据一致性诊断（需真实 Token）
TEABLE_TOKEN=xxx node check-integrity.js

# 一次性进度状态迁移（旧8态 → 新3态）
TEABLE_TOKEN=xxx node migrate-states.js
```

**部署（GitHub Actions 自动）**：push 到 `main` 分支 → `.github/workflows/deploy.yml` 把 `docs/api.js` 里的占位符替换为 GitHub Secrets → 上传到 GitHub Pages。

- GitHub Secrets: `TEABLE_TOKEN`
- 仓库 URL: https://github.com/liujuwei403/admin-expense-control
- 线上 URL: https://liujuwei403.github.io/admin-expense-control/
- **本地 main 推线上 main**：`git push origin main`

## 目录结构

| 目录/文件 | 用途 |
|----------|------|
| `public/` | 开发源码（**永远改这里**），每次改完同步到 `docs/` |
| `docs/` | GitHub Pages 部署源，`api.js` 里 `TEABLE_TOKEN` 保持 `REMOVED_TOKEN` 占位符 |
| `fc-backend/` | FC 后端 Node.js 源码，改完打包 `sso-backend.zip` 上传到阿里云 FC 控制台 |
| `test/unit.js` | 40 个纯函数单元测试（无浏览器依赖） |
| `migrate-states.js` | 一次性脚本：将旧8态进度迁移到新3态 |
| `check-integrity.js` | 诊断台账主表与提报表行数不一致 |
| `create-tables.js` | 一次性 Teable 建表脚本 |

## 页面路由

| 文件 | 功能 | 权限守卫 |
|------|------|---------|
| `index.html` | 纯 SSO 跳转页 — 已登录 → home；带 token → 验证；否则跳 SSO | 无 |
| `home.html` | 首页仪表盘 | `requireLogin()` |
| `submit.html` | 费用提报表单（多场景并行提报） | `requireLogin()` |
| `ledger.html` | 费用台账列表（含修改/撤回操作） | `requireLogin()` |
| `approve.html` | 审批中心（全部/待审批/已处理/已驳回筛选） | `requireLogin()` |
| `admin.html` | 管理后台（用户/统计/日志/场景配置 4 个 Tab） | `requireLogin()` + `isAdmin()` |
| `config.html` | 保留文件（已迁移进 admin.html），不再出现在侧边栏 | - |

所有非 `index.html` 页面必须有 `<aside id="sidebar">` + `<header id="topbar">`，`<script>` 顶部调用 `requireLogin()` 和 `renderNav('当前页面.html')`。**admin.html 还需在 requireLogin 后立即调用 isAdmin() 检查。**

## 台账进度状态（3 态）

当前系统使用简化的 3 态流程（+已撤回终态）：

```
提交 → 费控提报中 ──→ 费控提报完成（终态，审批通过）
                  └→ 已驳回待修改（可修改重提）
任意非终态 → 撤回 → 已撤回（终态）
```

**终态判断**（`ledger.html`）：
```js
const OLD_TERMINAL = ['已付款','待付款','预提完成','待收账单','已收账单','待预提'];
const terminated = progress === '已撤回' || progress === '费控提报完成' || OLD_TERMINAL.includes(progress);
```
`OLD_TERMINAL` 是历史遗留数据的兜底，新记录不产生这些状态。

**STATUS_COLORS**（`api.js`）：
```js
'费控提报中':  '#7c3aed'
'费控提报完成': '#16a34a'
'已驳回待修改': '#ef4444'
'已撤回':      '#6b7280'
```

## 两表关系（TABLE_LEDGER ↔ TABLE_SUBMIT）

一对一，通过 `台账编号` = `编号` 关联：

| 表 | 存储内容 |
|----|---------|
| `TABLE_LEDGER`（台账主表） | 生命周期跟踪：编号、当前进度、付款金额、提交人 |
| `TABLE_SUBMIT`（提报明细表） | 提报内容：事由描述、发票图片、附件、费控映射字段、OCR结果 |

提交时顺序：先写 `TABLE_LEDGER`（拿到编号），再写 `TABLE_SUBMIT`（含 `台账编号`）。如果两步之间中断，会产生孤立台账记录（无提报明细），用 `check-integrity.js` 诊断。

## ledger.html — 台账操作

**操作列规则**（按 terminated + 权限判断）：

| 进度 | 提交人/管理员 | 其他角色 |
|------|-------------|---------|
| 费控提报中 | 修改 + 撤回 | - |
| 已驳回待修改 | 修改 + 撤回 | - |
| 费控提报完成 / 已撤回 | - | - |

**修改弹窗**（`openEditModal` / `saveEdit`）：
- 从 `TABLE_SUBMIT` 预填：事由描述、单价、发票类型、受益日期
- 可选重传：发票图片（≤5MB）、附件（≤5MB）
- 保存后：更新 `TABLE_SUBMIT` + 台账进度置为 `费控提报中`

## approve.html — 审批中心

4 个筛选按钮（`全部 / 待审批 / 已处理 / 已驳回`），无弹窗，行内操作：

| 进度 | 操作列 |
|------|-------|
| 费控提报中 | 驳回（红）+ 通过（绿）按钮 |
| 已驳回待修改 | 等待修改（红色文字） |
| 费控提报完成/已付款 | 已处理（绿色文字） |

`doApprove(id, action)` 用浏览器 `prompt()` 收集审批意见，点取消则中止。

## submit.html — 多场景提报架构

### 状态变量
```js
selectedSceneIds  // 已选场景 ID 数组（有序）
invoiceFiles      // { sceneId: File } 每场景发票
attachFiles       // { sceneId: File } 每场景附件
ocrRawResults     // { sceneId: string } 每场景 OCR JSON
debouncedLLM      // { sid: Function } 每场景的 debounce LLM 调用
```

### 场景选择流程
1. 费用类型 `<select id="s_type">` 变化 → 筛选 `configRecords`，渲染 pill 多选
2. 用户勾选 pill → `addScene(sceneId)` → `renderSceneBlock(record)` 动态插入 DOM 块
3. 取消勾选 / 点块内 ✕ → `removeScene(sceneId)` → 删除 DOM + 清理状态

场景块字段 ID 格式：`{fieldName}-{sid}`（`sid = sceneId.replace(/[^a-z0-9]/gi, '_')`）。场景数 ≥4 时激活横向滚动（`.scrollable`）。

### 提交逻辑
- 初始进度固定为 `费控提报中`（不再区分预提/实付）
- 校验：必填事由、必须发票、金额不得为负
- `KNOWN_FK` 集合外的场景配置字段仅只读展示，**禁止写入 TABLE_SUBMIT**

### LLM 日期解析
事由输入 800ms 后调内网 LLM，失败降级 `parseBenefitDates()` 正则，仍失败提示手动填：
- 端点：`http://ai-service.tal.com/openai-compatible/v1/chat/completions`（仅内网）
- 模型：`gpt-5-chat`

## api.js 核心模块

**Teable CRUD（带 120s sessionStorage 缓存 + in-flight 去重）**
- `teableGet(tableId, skipCache)` — 最多 1000 条
- `teableGetWithView(tableId, viewId, skipCache)` — 最多 200 条
- `teableCreate` / `teableUpdate` — 均带 `typecast: true`，自动创建单选字段的新选项值
- `teableDelete` — 写操作后自动 `cacheClear(tableId)`

**OCR**
- `ocrVatInvoice(file)` — 带 `sso_jwt` 调 FC `/ocr`
- `parseInvoiceTexts(texts)` — FC 侧和前端侧各一份，发票类型匹配用 `/电子/`（不是 `/电子发票/`）

**Teable 附件上传（三步法）**
- `teableUploadAttachment(file)` — 签名 → PUT COS → notify；返回 `{token, name, size, mimetype}`
- 附件字段写入格式：`[{token, name, size, mimetype}]` 数组

**其他**
- `parseBenefitDates(description)` — 支持 ISO、中文年月日、相对词、季度、上下半年
- `checkOverdue(record)` — `已付款 / 费控提报完成 / 已撤回` 均视为正常终态

## FC 后端（fc-backend/）

Web 函数，监听 9000，启动命令 `node index.js`。

| 路由 | 说明 |
|------|------|
| `GET /auth/callback?token=` | SSO ticket → 签发 JWT（HS256，2h） |
| `POST /ocr`（`{fileBase64, fileType, jwt}`） | 验 JWT → 调 PaddleOCR → 返回结构化字段 |
| `GET /health` | 健康检查 |

FC 环境变量：`SSO_APP_ID` / `SSO_APP_KEY` / `JWT_SECRET` / `FRONTEND_URL`（纯 origin）/ `PADDLEOCR_TOKEN`。

打 ZIP（`index.js` 和 `package.json` 必须在 ZIP **根目录**，不能套子目录，否则 FC 502）：
```powershell
Compress-Archive -Force -Path fc-backend/index.js, fc-backend/package.json -DestinationPath sso-backend.zip
```

## 权限体系

| 角色 | 能力 |
|------|-----|
| 员工 | 提报 + 查自己台账 + 修改/撤回自己的提报 |
| 审批人 | 上述 + 审批通过/驳回 |
| 管理员 | 上述 + 管理后台（含场景配置）+ 修改/撤回任意提报 + 绕过场景过滤 |

**页面级拦截**：
- 所有页面：`requireLogin()` — 未登录跳 SSO
- `admin.html`：额外 `isAdmin()` — 非管理员跳 home.html
- `approve.html:doApprove()`：`isApprover()` 校验
- `ledger.html:withdrawRecord()` / `saveEdit()`：`user.account === f['提交人'] || isAdmin()`

**场景过滤（submit.html）**：`workcode`（SSO JWT）需匹配场景配置表 `负责人.title` 或 `跟进人[].title` 尾部 `-工号`，`isApprover()` 绕过过滤。

## 关键约定

- Teable API 一律 `fieldKeyType=name`，写操作带 `typecast: true`
- 修改 `public/` 后必须逐文件同步 `docs/`（不要 `cp *`，会清掉 Token 占位符）
- `REF_CONFIG_TABLE` 只读 Base，**不得写入**
- 新建非登录页：需有 `id="sidebar"` + `id="topbar"`，顶部 `requireLogin()` + `renderNav()`
- Teable 单选字段写入新值时如遇 400 validation error，确认 `teableCreate/Update` 已包含 `typecast: true`

## 备选方案（alading/）

`alading/invoice-ocr.dify.yml` 定义 Dify 工作流，可替换 FC 的 `/ocr` 路由（适用于 FC 跨网隔离场景）。
