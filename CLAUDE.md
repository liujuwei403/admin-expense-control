# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

行政费控提报系统 — 纯静态前端应用，无构建步骤，无后端服务器。所有数据通过 Teable REST API 读写，部署时直接托管 `public/` 目录。

## 运行方式

无需安装依赖。直接用任意静态服务器打开 `public/` 目录：

```bash
# Python
cd public && python -m http.server 8080

# Node.js
npx serve public
```

`create-tables.js` 是一次性初始化脚本，用于在 Teable 中创建数据库结构。运行后会打印新的表 ID，需手动更新到 `public/api.js` 的常量中：

```bash
node create-tables.js
```

## 架构

### 文件结构

- `public/api.js` — 所有页面共享的全局库，每个 HTML 页面通过 `<script src="api.js">` 引入
- `public/style.css` — 全局样式
- `public/*.html` — 各功能页面，每个页面底部的 `<script>` 包含该页面的业务逻辑

### 页面路由

| 文件 | 功能 |
|------|------|
| `index.html` | 登录（SSO + 手动登录） |
| `home.html` | 首页仪表盘 |
| `submit.html` | 费用提报表单 |
| `ledger.html` | 费用台账列表 |
| `approve.html` | 审批中心 |
| `config.html` | 场景配置查看 |
| `admin.html` | 管理后台（仅管理员） |

### HTML 页面结构模板

每个页面（`index.html` 除外）必须包含以下 DOM 结构，`renderNav()` 依赖这两个 ID：

```html
<aside class="sidebar" id="sidebar"></aside>
<header class="topbar" id="topbar"></header>
<main class="main">
  <!-- 页面内容 -->
</main>
<script src="api.js"></script>
<script>
  requireLogin();
  renderNav('当前页面.html');
  // 页面业务逻辑
</script>
```

### api.js 核心模块

**Teable CRUD**
- `teableGet(tableId, skipCache)` — 读取全表记录，最多 1000 条，含 sessionStorage 缓存（120s TTL）和 in-flight 去重
- `teableGetWithView(tableId, viewId, skipCache)` — 通过 View 读取记录（最多 200 条），用于场景配置表
- `teableCreate(tableId, fields)` / `teableUpdate(tableId, id, fields)` / `teableDelete(tableId, id)` — 写操作后自动调用 `cacheClear(tableId)`
- `cacheClear(tableId)` — 清除指定表的 sessionStorage 缓存

**场景配置**
- `loadConfigRecords(skipCache)` — 从只读参考数据 Base 获取场景列表

**用户认证**
- `getCurrentUser()` — 读 localStorage `xzfk_user`，返回 `{id, account, nickname, department, role, approver}`
- `requireLogin()` — 未登录时跳转 `index.html`
- `isAdmin()` / `isApprover()` — 角色判断（管理员同时满足 isApprover）
- `findUser(account)` — 先按字段过滤查询，失败则全表扫描

**SSO 认证**
- `handleSSOCallback(ssoToken)` — 处理好未来 SSO 回调，JWT 存 `sso_jwt`（localStorage），关联到 Teable 用户表
- `getSavedSSO()` — 读取并验证已保存的 SSO JWT（自动处理过期）

**OCR**
- `ocrVatInvoice(base64Image)` — 调用阿里云增值税发票识别，`OCR_PROXY_URL` 为空时直连（受 CORS 限制）

**工具函数**
- `formatDate(iso)` / `formatMoney(n)` / `statusBadge(status)` — 展示格式化
- `showToast(msg, type)` — 全局 Toast 通知（`success` / `error`）
- `renderNav(activePage)` — 渲染侧边栏和顶栏
- `trackAction(action, page)` — 异步写操作日志（失败静默忽略）
- `genLedgerNo()` — 生成台账编号，格式 `BX{YYYYMMDD}{4位随机序号}`
- `parseBenefitDates(description)` — 从中文描述中提取受益日期区间（匹配"XXXX年XX月"模式）
- `checkOverdue(record)` — 判断台账是否逾期
- `debounce(fn, ms)` — 防抖

### 数据表关系

```
场景配置表（只读）→ 驱动 submit.html 自动填充
费用台账主表（TABLE_LEDGER）← 提报时创建，审批时更新进度
费用提报表（TABLE_SUBMIT）← 存储提报详情，关联台账编号
用户表（TABLE_USER）← 登录时查找/创建用户
操作日志表（TABLE_LOG）← trackAction() 异步写入
```

### 台账进度流转

`待预提` → `预提完成` → `待收账单` → `已收账单` → `费控提报中` → `费控提报完成` → `待付款` → `已付款`

### 用户角色

- `员工`：提报费用、查看自己的台账
- `审批人`：额外可访问审批中心
- `管理员`：额外可访问管理后台，同时满足 `isApprover()`

## 关键约定

- 所有 Teable API 调用使用 `fieldKeyType=name`（字段名而非 ID）
- 每次写操作后 `cacheClear(tableId)` 自动调用，下次读取强制刷新
- `teableGet` 上限 1000 条；`teableGetWithView` 上限 200 条
- 场景配置表（`REF_CONFIG_TABLE`）属于另一个只读 Base，不得写入
- 新增页面：HTML 需有 `id="sidebar"` 和 `id="topbar"` 元素；`<script>` 顶部调用 `requireLogin()` 和 `renderNav('当前页面.html')`
