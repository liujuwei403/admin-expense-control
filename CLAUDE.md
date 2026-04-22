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

# 一次性 Teable 建表脚本
node create-tables.js
```

**部署（GitHub Actions 自动）**：push 到 `main` 分支 → `.github/workflows/deploy.yml` 把 `docs/api.js` 里的占位符替换为 GitHub Secrets → 上传到 GitHub Pages。

- GitHub Secrets: `TEABLE_TOKEN`
- 仓库 URL: https://github.com/liujuwei403/admin-expense-control
- 线上 URL: https://liujuwei403.github.io/admin-expense-control/
- **本地 master 推线上 main**：`git push origin master:main`

## 目录结构

| 目录 | 用途 |
|------|------|
| `public/` | 开发源码（修改这里），每次改完 `cp public/* docs/` 同步 |
| `docs/` | GitHub Pages 部署源，Token 保持占位符 `REMOVED_TOKEN` |
| `fc-backend/` | FC 后端 Node.js 源码（`index.js` + `package.json`），改完打包 `sso-backend.zip` 让用户上传到阿里云 FC 控制台 |
| `alading/` | 内网备选方案：单文件 Vue 3 + Tailwind 测试页 + Dify 工作流 DSL |
| `create-tables.js` | 一次性 Teable 初始化脚本 |

## 页面路由

| 文件 | 功能 |
|------|------|
| `index.html` | 纯 SSO 跳转页（无手动登录表单） — 已登录 → home；带 token → 验证；否则跳 SSO |
| `home.html` | 首页仪表盘 |
| `submit.html` | 费用提报表单（多场景并行提报，见下文） |
| `ledger.html` | 费用台账列表 |
| `approve.html` | 审批中心 |
| `config.html` | 场景配置查看（只读 Ref Base） |
| `admin.html` | 管理后台（仅 `role === '管理员'`） |

所有非 `index.html` 页面必须有 `<aside id="sidebar">` + `<header id="topbar">`，`<script>` 顶部调用 `requireLogin()` 和 `renderNav('当前页面.html')`。

## submit.html — 多场景提报架构

`submit.html` 支持同时为多个场景提报费用，是最复杂的页面，架构如下：

### 状态变量
```js
selectedSceneIds  // 已选场景 ID 数组（有序）
invoiceFiles      // { sceneId: File } 每场景发票
attachFiles       // { sceneId: File } 每场景附件
ocrRawResults     // { sceneId: string } 每场景 OCR JSON
debouncedLLM      // { sid: Function } 每场景的 debounce LLM 调用
```

### 场景选择流程
1. 费用类型 `<select id="s_type">` 变化 → 按费用类型筛选 `configRecords`，在右列渲染 pill 多选（`.scene-option-label`）
2. 用户勾选 pill → `addScene(sceneId)` → `renderSceneBlock(record)` 动态插入 DOM 块
3. 取消勾选 / 点块内 ✕ → `removeScene(sceneId)` → 删除 DOM + 清理文件状态

### 场景块（`.scene-block`）
每个块包含独立的：发票上传 + OCR、金额/税率/发票类型、事由描述 + LLM 日期解析、附件上传、费控映射（折叠，自动填充自配置）。

字段 ID 格式：`{fieldName}-{sid}`（`sid = sceneId.replace(/[^a-z0-9]/gi, '_')`）。

**联动行为：**
- 任意场景展开/收起"费控映射" → `syncFkDetails()` 同步其他场景
- 任意金额字段 `input` 事件 → `updateTotalFee()` 更新顶部总费用栏
- 场景数 >2 → 块内字段折叠为单列（`.compact`）；>4 → 顶部横向滚动条（rotateX 技巧）

### LLM 日期解析
事由描述输入 800ms 后调内网 LLM 提取受益日期：
- 端点：`http://ai-service.tal.com/openai-compatible/v1/chat/completions`
- 模型：`gpt-5-chat`，需加 `system` message
- Token：`Bearer 300000485:61b228c575d42cbd37a266636c5b7364`
- 返回 `{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}`，失败静默忽略

### 提交逻辑
`submitExpense()` 一次性取台账最大编号，循环所有 `selectedSceneIds`，每个场景分别：上传附件 → `teableCreate(TABLE_LEDGER)` → `teableCreate(TABLE_SUBMIT)`。

## api.js 核心模块

**Teable CRUD（带 120s sessionStorage 缓存 + in-flight 去重）**
- `teableGet(tableId, skipCache)` — 最多 1000 条
- `teableGetWithView(tableId, viewId, skipCache)` — 最多 200 条，用于场景配置表
- `teableCreate` / `teableUpdate` / `teableDelete` — 写操作后自动 `cacheClear(tableId)`

**场景配置**
- `loadConfigRecords(skipCache)` — 从只读 Ref Base `REF_CONFIG_TABLE` 读取

**用户认证**
- `getCurrentUser()` — 同时校验 `xzfk_user` 和 `sso_jwt` 过期，任一失效即返回 null 并清理 localStorage
- `requireLogin()` / `isAdmin()` / `isApprover()`（管理员自动满足 isApprover）
- `getSavedSSO()` — 返回 `{ token, payload }`，`payload.workcode` 是公司工号
- `handleSSOCallback(ssoToken)` — 调 FC `/auth/callback` 拿 JWT，关联/创建 Teable 用户

**AI OCR（经 FC 后端代理 PaddleOCR）**
- `ocrVatInvoice(file)` — 入参是 **File 对象**，带 `sso_jwt` 调 FC `/ocr`，传 `{fileBase64, fileType, jwt}`。FC 调 PaddleOCR 并运行 `parseInvoiceTexts` 解析，返回 `{invoiceType, totalAmount, taxRate, sellerName, purchaserName}`
- `parseInvoiceTexts(texts)` — FC 侧和前端侧各有一份同逻辑的实现；FC 侧是权威执行路径
- `submit.html:applyOcrResult()` 里的 typeMap 对 `增值税电子专用发票` 等规范值做二次映射到下拉选项

**Teable 附件上传（三步法）**
- `teableUploadAttachment(file)` — ① POST `/api/attachments/signature`（`{type:2, contentType, contentLength}`）拿预签名 URL；② PUT 文件到腾讯云 COS；③ POST `/api/attachments/notify/{token}` 注册完成
- 附件字段写入格式：`[{token, name, size, mimetype}]` 数组（`发票图片` 和 `附件` 均为 Teable attachment 类型）

**工具函数**
- `formatDate` / `formatMoney` / `statusBadge` / `showToast` / `renderNav` / `trackAction`
- `genLedgerNo()` — 生成 `BX{YYYYMMDD}{4 位序号}`
- `parseBenefitDates(description)` — 正则解析日期（submit.html 已改用 LLM，其他页面仍可用）
- `checkOverdue(record)` / `debounce(fn, ms)`

## FC 后端（fc-backend/）

Web 函数，监听 9000，启动命令 `node index.js`。路由：

| 路由 | 说明 |
|------|------|
| `GET /auth/callback?token=` | SSO ticket → 验 token → 签发 JWT（HS256，2h 有效） |
| `POST /ocr`（JSON: `{fileBase64, fileType, jwt}`） | 验 JWT → 调 PaddleOCR（`callPaddleOcr`）→ `parseInvoiceTexts` 解析 → 返回结构化字段 |
| `GET /health` | 健康检查 |

FC 环境变量：`SSO_APP_ID` / `SSO_APP_KEY` / `JWT_SECRET` / `FRONTEND_URL`（CORS origin，必须是纯 origin 无路径） / `PADDLEOCR_TOKEN`。

改完 `fc-backend/index.js` → 用 PowerShell 打 ZIP（`index.js` 和 `package.json` 必须在 ZIP **根目录**，不能套子目录，否则 FC 502）。

## 数据流与权限

### 台账进度流转
`待预提 → 预提完成 → 待收账单 → 已收账单 → 费控提报中 → 费控提报完成 → 待付款 → 已付款`

### 用户角色
- `员工`：提报 + 看自己的台账
- `审批人`：上述 + 审批中心
- `管理员`：上述 + 管理后台 + 绕过场景过滤

### 场景过滤规则（submit.html）
登录用户的 `workcode`（来自 SSO JWT payload）需与场景配置表的 `负责人.title` 或 `跟进人[].title` 尾部 "-工号" 匹配，否则该场景不可见。`isApprover()` 绕过过滤。

工号提取：`title.slice(title.lastIndexOf('-') + 1)`。`跟进人` 字段必须是**数组类型**，单值时匹配会被忽略。

**审批驳回**：驳回时进度退回 `待预提`（最初状态），整个流程重启。

## 关键约定

- Teable API 一律 `fieldKeyType=name`（字段名而非 ID）
- 写操作后自动 `cacheClear(tableId)`，下次读强刷
- `REF_CONFIG_TABLE` 属于另一个只读 Base，**不得写入**
- 修改 `public/` 后必须 `cp public/* docs/` 同步（`docs/api.js` 里 `TEABLE_TOKEN` 保持 `REMOVED_TOKEN` 占位符）
- 新建非登录页：HTML 必须有 `id="sidebar"` 和 `id="topbar"`；`<script>` 顶部 `requireLogin()` 和 `renderNav('xxx.html')`
- `submit.html` 的"是否关联项目"（`s_linkProject`）是**派生字段**，由场景配置的 `费控战斗单元` 是否有值自动计算，不可手动填写
- `teableGet` 返回最多 1000 条；`teableGetWithView` 返回最多 200 条（用于场景配置等小数据集）
- submit.html 场景块字段 ID 格式：`{fieldName}-{sid}`，`sid = sceneId.replace(/[^a-z0-9]/gi, '_')`

## 备选方案（alading/）

当 FC 无法代理 AI 接口时（跨网隔离），`alading/invoice-ocr.dify.yml` 定义了一个 Dify 工作流（Start 上传图片 → LLM 视觉识别 → Code 解析 JSON → End），导入到公司内网 Dify 平台后可获得 HTTPS API，替换 FC 的 `/ocr` 路由。
