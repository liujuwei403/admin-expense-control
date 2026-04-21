# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

快提快报 — 纯静态前端应用，通过 Teable REST API 读写数据，通过阿里云函数计算（FC）后端做 SSO 回调；AI OCR 由前端直连 PaddleOCR 完成。**项目设计为公司内网使用**。

## 三层架构

```
前端（GitHub Pages 静态托管）
  │  HTTPS 直连 Teable          → https://yach-teable.zhiyinlou.com
  │  HTTPS 直连 PaddleOCR       → https://c2maw7jdm04fy5a2.aistudio-app.com/ocr
  │  HTTPS 代理经 FC 后端       → SSO 验证
  ▼
FC 后端（阿里云函数计算 sso-backend-xzfk）
  ├─ /auth/callback   好未来 SSO 换 JWT
  ├─ /ocr             DEPRECATED（旧 GLM-5V 代理，保留用于紧急回滚）
  └─ /health
  ▼
外部服务
  ├─ Teable      HTTPS 公网
  ├─ SSO         https://sso.100tal.com（好未来统一登录）
  └─ PaddleOCR   https://c2maw7jdm04fy5a2.aistudio-app.com（公网 HTTPS）
```

### 关键设计约束

- **前端页面是 HTTPS**（GitHub Pages 强制），所有外部接口必须是 HTTPS，否则触发混合内容拦截
- PaddleOCR Token 和 Teable Token 通过 `REMOVED_*` 占位符 + GitHub Actions `sed` 注入到 `docs/api.js`（明文暴露在前端，需定期轮换）

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
| `submit.html` | 费用提报表单（场景按工号过滤；PDF 直传 PaddleOCR；正则解析发票字段） |
| `ledger.html` | 费用台账列表 |
| `approve.html` | 审批中心 |
| `config.html` | 场景配置查看（只读 Ref Base） |
| `admin.html` | 管理后台（仅 `role === '管理员'`） |

所有非 `index.html` 页面必须有 `<aside id="sidebar">` + `<header id="topbar">`，`<script>` 顶部调用 `requireLogin()` 和 `renderNav('当前页面.html')`。

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

**AI OCR（PaddleOCR 前端直连）**
- `ocrVatInvoice(file)` — 入参是 **File 对象**（不是 base64），内部根据 MIME/后缀判断 `fileType`（0=PDF / 1=图片），直接 POST 到 PaddleOCR。返回 `{invoiceType, totalAmount, taxRate, sellerName, purchaserName, _rawTexts}`
- `parseInvoiceTexts(texts)` — 纯函数，把 OCR 返回的文字行数组用正则解析为结构化字段（发票类型拼接判别、金额优先取"(小写)￥XXX"、税率 `N%` 转小数、销方/购方锚定"销售方/购买方信息"后找"名称："）
- `submit.html:applyOcrResult()` 里的 typeMap 仍会对 `增值税电子专用发票` / `增值税电子普通发票` 等规范值做二次映射到下拉选项（如 `电子发票（增值税专用发票）`）
- `trackAction(action, page)` — 操作日志，fire-and-forget（`.catch(() => {})`），不阻塞主流程

**工具函数**
- `formatDate` / `formatMoney` / `statusBadge` / `showToast` / `renderNav` / `trackAction`
- `genLedgerNo()` — 生成 `BX{YYYYMMDD}{4 位序号}`
- `parseBenefitDates(description)` — 解析「2026年1月1日」或「2026年1月」格式（有日用日，无日起始=01/结束=月末）
- `checkOverdue(record)` / `debounce(fn, ms)`

## FC 后端（fc-backend/）

Web 函数，监听 9000，启动命令 `node index.js`。路由：

| 路由 | 说明 |
|------|------|
| `GET /auth/callback?token=` | SSO ticket → 验 token → 签发 JWT（HS256，2h 有效） |
| `POST /ocr`（JSON: `{imageBase64, jwt}`） | **DEPRECATED 2026-04-21** — 旧 GLM-5V 代理逻辑，前端已切换到直连 PaddleOCR，仅保留用于紧急回滚 |
| `GET /health` | 健康检查 |

FC 环境变量：`SSO_APP_ID` / `SSO_APP_KEY` / `JWT_SECRET` / `FRONTEND_URL`（CORS origin，必须是纯 origin 无路径） / `AI_TOKEN`。

SSO ticket 在 FC 内存中缓存 115 分钟（TTL 比 SSO 有效期短 5 分钟），FC 重启后首次调用会重新获取。

（旧版 OCR 响应解析笔记：LLM 有时在 JSON 外包裹 Markdown 代码块，FC 正则剥离后 `JSON.parse` — 切换 PaddleOCR 后此逻辑仅在 deprecated 路由中保留）

改完 `fc-backend/index.js` → 用 PowerShell 打 ZIP（`index.js` 和 `package.json` 必须在 ZIP **根目录**，不能套子目录，否则 FC 502） → 让用户在阿里云控制台手动上传并点"部署代码"。

## 数据流与权限

### 台账进度流转
`待预提 → 预提完成 → 待收账单 → 已收账单 → 费控提报中 → 费控提报完成 → 待付款 → 已付款`

### 用户角色
- `员工`：提报 + 看自己的台账
- `审批人`：上述 + 审批中心
- `管理员`：上述 + 管理后台 + 绕过场景过滤

### 场景过滤规则（submit.html）
登录用户的 `workcode`（来自 SSO JWT payload）需与场景配置表的 `负责人.title` 或 `跟进人[].title` 尾部 "-工号" 匹配，否则该场景不可见。管理员+审批人 `isApprover()` 绕过过滤。

工号提取：`title.slice(title.lastIndexOf('-') + 1)`（取最后一个 `-` 之后的部分）。`跟进人` 字段必须是**数组类型**，单值时匹配会被忽略。若负责人和跟进人均为空，员工将看到"无可用场景"提示。

**审批驳回**：驳回时进度退回 `待预提`（最初状态），不只是当前环节 — 意味着整个流程重启。

## 关键约定

- Teable API 一律 `fieldKeyType=name`（字段名而非 ID）
- 写操作后自动 `cacheClear(tableId)`，下次读强刷
- `REF_CONFIG_TABLE` 属于另一个只读 Base，**不得写入**
- 修改 `public/` 后必须 `cp public/* docs/` 同步（`docs/api.js` 里 `TEABLE_TOKEN` 保持 `REMOVED_TOKEN` 占位符）
- 新建非登录页：HTML 必须有 `id="sidebar"` 和 `id="topbar"`；`<script>` 顶部 `requireLogin()` 和 `renderNav('xxx.html')`
- 涉及 UI/UX 改动后，测试需覆盖：普通员工、审批人、管理员、工号不匹配任何场景的用户
- `submit.html` 的"是否关联项目"（`s_linkProject`）是**派生字段**，由场景配置的 `费控战斗单元` 是否有值自动计算，不可手动填写
- `teableGet` 返回最多 1000 条；`teableGetWithView` 返回最多 200 条（用于场景配置等小数据集）

## 备选方案（alading/）

当 FC 无法代理 AI 接口时（跨网隔离），`alading/invoice-ocr.dify.yml` 定义了一个 Dify 工作流（Start 上传图片 → LLM 视觉识别 → Code 解析 JSON → End），导入到公司内网 Dify 平台后可获得 HTTPS API，替换 FC 的 `/ocr` 路由。
