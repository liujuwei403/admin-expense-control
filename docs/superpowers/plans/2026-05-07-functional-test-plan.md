# 快提快报 功能测试计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 作为资深测试人员，对「快提快报」行政费控系统所有功能模块进行全面功能测试，定位缺陷并输出测试报告。

**Architecture:** 纯静态前端（GitHub Pages） + FC 后端（阿里云函数计算）+ Teable REST API。重点测试 SSO 认证、多场景费用提报、审批流程、管理后台、核心 JS 工具函数、FC 后端接口。

**Tech Stack:** 浏览器手工测试 + 浏览器 DevTools（Network/Console）+ Node.js 单元测试（api.js 纯函数）+ curl/fetch 接口测试（FC 后端）

---

## 测试环境准备

| 项目 | 值 |
|------|-----|
| 线上地址 | https://liujuwei403.github.io/admin-expense-control/ |
| 本地启动 | `cd public && npx serve .` （将 api.js 中 `REMOVED_TOKEN` 换成真实 Token） |
| FC 后端 | https://sso-bacend-xzfk-tayrqiioai.cn-hangzhou.fcapp.run |
| 角色账号 | 员工账号 / 审批人账号 / 管理员账号（各一个，通过 SSO 登录获得） |
| 浏览器 | Chrome 最新版（主测）；Firefox（回归） |

---

## Task 1：SSO 认证流程测试

**Files:** `public/index.html`, `public/api.js:187-299`, `fc-backend/index.js:14-185`

### TC-AUTH-01：未登录用户访问首页自动跳转 SSO

- [ ] **Step 1: 清空 localStorage**

  打开 Chrome DevTools → Application → Local Storage → 清空所有 `xzfk_*` 和 `sso_jwt` 键。

- [ ] **Step 2: 访问 index.html**

  ```
  导航到 https://liujuwei403.github.io/admin-expense-control/
  ```
  预期：1秒内跳转到 `https://sso.100tal.com/portal/login/1876691221`

- [ ] **Step 3: 验证**

  预期 URL 包含 `sso.100tal.com`，无 JS 报错。

---

### TC-AUTH-02：SSO token 回调成功，新用户自动注册

- [ ] **Step 1: 模拟 SSO 回调（携带有效 token）**

  ```
  导航到 index.html?token=<真实SSO_token>
  ```

- [ ] **Step 2: 观察 Network 面板**

  预期调用：`FC /auth/callback?token=...` → HTTP 200，返回 `{token: "eyJ..."}`。

- [ ] **Step 3: 观察 localStorage**

  ```js
  // 在 DevTools Console 执行
  JSON.parse(localStorage.getItem('xzfk_user'))
  // 预期字段：id, account, nickname, role='员工', workcode
  localStorage.getItem('sso_jwt')
  // 预期：非空 JWT 字符串
  ```

- [ ] **Step 4: 最终跳转**

  预期：自动跳转到 `home.html`，topbar 显示用户昵称首字头像。

---

### TC-AUTH-03：JWT 过期后访问受保护页面

- [ ] **Step 1: 手动伪造过期 JWT**

  ```js
  // DevTools Console
  const expired = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.AAAA';
  localStorage.setItem('sso_jwt', expired);
  ```

- [ ] **Step 2: 刷新 home.html**

  预期：`getCurrentUser()` 返回 null → 跳转回 `index.html` → 跳转 SSO 登录。

---

### TC-AUTH-04：被禁用账号登录被拦截

- [ ] **Step 1: 在管理后台将测试账号状态改为"已禁用"**

- [ ] **Step 2: 用该账号 SSO 登录**

  预期：index.html 显示 `登录失败：账号已被禁用`，2秒后跳 SSO。

---

### TC-AUTH-05：已登录用户访问 index.html 直接进 home

- [ ] **Step 1: 确保 localStorage 有有效的 `xzfk_user` 和 `sso_jwt`**

- [ ] **Step 2: 导航 index.html**

  预期：立即跳转 `home.html`，不调用 FC `/auth/callback`。

---

## Task 2：导航 & 布局测试

**Files:** `public/api.js:579-653`, `public/style.css`

### TC-NAV-01：侧边栏菜单角色过滤

- [ ] **Step 1: 以员工角色登录**

  预期侧边栏：首页 / 费用提报 / 费用台账 / 审批中心 / 场景配置（无"管理后台"）

- [ ] **Step 2: 以管理员角色登录**

  预期侧边栏：多出"管理后台"菜单项。

---

### TC-NAV-02：侧边栏折叠/展开

- [ ] **Step 1: 点击右边框浮动按钮 `#sidebar-edge-toggle`**

  预期：侧边栏宽度从 220px 过渡到 60px，文字隐藏，箭头旋转 180°。

- [ ] **Step 2: 刷新页面**

  预期：折叠状态持久化（读取 `localStorage.sidebar_collapsed`）。

- [ ] **Step 3: 再次点击展开**

  预期：宽度恢复 220px，`localStorage.sidebar_collapsed = '0'`。

---

### TC-NAV-03：topbar 退出登录

- [ ] **Step 1: 点击 topbar 右侧"退出"按钮**

  预期：`xzfk_user` 和 `sso_jwt` 从 localStorage 移除，跳转 SSO 退出页。

---

## Task 3：首页仪表盘测试

**Files:** `public/home.html:48-95`

### TC-HOME-01：统计卡片数据正确性

- [ ] **Step 1: 登录后打开 home.html**

  预期渲染 4 张统计卡片：
  - 本月提报：本月内该用户提交的台账条数
  - 待处理：全部台账中进度不是「费控提报完成」或「已付款」的条数
  - 逾期项：`checkOverdue` 返回「逾期」的条数
  - 本月已付：本月「已付款」台账金额之和

- [ ] **Step 2: 手动计算并对比 Teable 数据**

  在 Teable 台账表手动筛选，验证数字一致。

---

### TC-HOME-02：最近提报列表

- [ ] **Step 1: 验证最多显示 5 条，按编号倒序**

  预期：第一行是编号最大的台账。

- [ ] **Step 2: 无数据时显示空状态**

  清空台账表后刷新，预期显示"暂无提报记录"。

---

## Task 4：费用提报核心功能测试

**Files:** `public/submit.html`（整体）

### TC-SUB-01：场景权限过滤（工号匹配）

- [ ] **Step 1: 以员工角色登录（workcode 存在于某些场景的负责人/跟进人）**

  预期：只显示该用户有权限的场景 pill，费用类型下拉只包含有权限的类型。

- [ ] **Step 2: 以审批人角色登录**

  预期：显示全部场景，无过滤。

- [ ] **Step 3: 以工号未关联任何场景的员工登录**

  预期：`#noPermissionHint` 出现，提示无提报权限，费用类型下拉 disabled。

---

### TC-SUB-02：费用类型 → 场景 pills 联动

- [ ] **Step 1: 选择费用类型 A**

  预期：右侧"场景说明"列出属于类型 A 的场景 pill。

- [ ] **Step 2: 切换费用类型到 B**

  预期：已选场景块全部清除，重新渲染类型 B 的 pills，selectedSceneIds 清空。

---

### TC-SUB-03：单场景提报黄金路径

- [ ] **Step 1: 选择 1 个场景**

  预期：出现 1 个 `.scene-block`，不显示总费用合计栏（待填金额后显示）。

- [ ] **Step 2: 上传发票（JPG < 5MB）**

  预期：
  - 显示图片预览
  - ocrResult 显示"正在识别发票..."
  - OCR 完成后显示类型/金额/税率/销方
  - 表单字段（金额、税率、发票类型）自动填充

- [ ] **Step 3: 填写事由描述（含日期范围）**

  ```
  示例："申请报销2026年1月1日房租费用 到 2026年3月31日"
  ```
  预期：800ms 后 LLM 解析日期，填充「受益日期从」2026-01-01、「受益日期到」2026-03-31。
  （内网 LLM 不可用时，降级为正则解析，状态显示"✓ 已解析（本地）"）

- [ ] **Step 4: 点击提交**

  预期：
  - 按钮变为"上传附件(1/1)..."→"提交中(1/1)..."
  - Network 面板：POST Teable `TABLE_LEDGER` → POST `TABLE_SUBMIT`
  - Toast"费用提报成功！"
  - 1.5s 后跳转 `ledger.html`

---

### TC-SUB-04：发票大小校验

- [ ] **Step 1: 上传 > 5MB 的文件**

  预期：Toast 显示"文件不能超过 5MB"，不触发 OCR。

---

### TC-SUB-05：提交前必填校验

- [ ] **Step 1: 不上传发票直接点提交**

  预期：Toast "请为每个场景上传发票"，不发网络请求。

- [ ] **Step 2: 不填事由描述直接提交**

  预期：Toast "请填写每个场景的事由描述"。

---

### TC-SUB-06：多场景（3 个场景）并行提报

- [ ] **Step 1: 选择 3 个场景**

  预期：3 个 `.scene-block` 进入 compact 布局（单列），总费用合计栏出现。

- [ ] **Step 2: 分别为每个场景上传发票、填写事由**

- [ ] **Step 3: 提交**

  预期：Network 面板出现 3 对 `TABLE_LEDGER` + `TABLE_SUBMIT` 创建请求，编号连续，Toast 显示"共提交 3 条"。

---

### TC-SUB-07：≥4 场景横向滚动布局

- [ ] **Step 1: 选择 4 个场景**

  预期：`#sceneBlocksScroll` 获得 `.scrollable` 类，出现横向滚动条（位于顶部），每次展示 3.5 张卡片。

- [ ] **Step 2: 横向滑动**

  预期：卡片 snap 对齐，滚动流畅。

---

### TC-SUB-08：费控映射同步展开

- [ ] **Step 1: 选择 2 个场景，点击场景 1 的「费控映射」展开**

  预期：场景 2 的费控映射同步展开（`syncFkDetails`）。

---

### TC-SUB-09：OCR 结果冲突处理（供应商不同）

- [ ] **Step 1: 配置表中场景供应商已有值，上传发票，OCR 识别出不同供应商**

  预期：弹出 `confirm` 对话框，询问是否替换，用户取消则保留原值。

---

### TC-SUB-10：拖拽上传发票

- [ ] **Step 1: 拖拽图片文件到 upload-zone**

  预期：拖拽时 zone 出现 `.dragover` 样式，松开后触发 OCR，与点击上传行为一致。

---

## Task 5：费用台账功能测试

**Files:** `public/ledger.html`

### TC-LED-01：三维筛选

- [ ] **Step 1: 依次切换费用类型 / 进度 / 逾期状态筛选**

  每次预期：表格数据实时过滤，多条件叠加生效。

---

### TC-LED-02：推进进度

- [ ] **Step 1: 点击一条台账的「详情」按钮**

  预期：弹窗显示当前进度，推进按钮显示"推进至: 下一状态"。

- [ ] **Step 2: 点击推进**

  预期：Network 面板 PATCH Teable，弹窗关闭，列表刷新，当前进度+1。

- [ ] **Step 3: 已付款台账查看详情**

  预期：推进按钮隐藏。

---

### TC-LED-03：完整进度流转

- [ ] **Step 1: 从「费控提报中」逐步推进到「已付款」**

  验证流程：`待预提→预提完成→待收账单→已收账单→费控提报中→费控提报完成→待付款→已付款`（8 步，共 7 次推进）。

---

## Task 6：审批中心功能测试

**Files:** `public/approve.html`

### TC-APP-01：权限保护

- [ ] **Step 1: 以普通员工登录，尝试访问 approve.html**

  预期：侧边栏"审批中心"对所有角色可见（代码中无 `needApprover` 过滤）；但数据加载后"待审批"Tab 内只显示`费控提报中`状态的记录，员工角色可看到但只能是查看模式——**注：此处存在潜在权限问题，见 Bug 记录**。

---

### TC-APP-02：通过审批

- [ ] **Step 1: 以审批人登录，选一条"待审批"记录点"审批"**

  预期：弹窗展示台账详情 + 提报明细（法律主体、供应商、事由描述）。

- [ ] **Step 2: 填写审批意见，点"通过"**

  预期：
  - 台账进度 → 「费控提报完成」
  - 备注写入"审批通过: xxx"
  - Toast"已通过"
  - 该条从"待审批"移入"已处理"Tab

---

### TC-APP-03：驳回审批

- [ ] **Step 1: 点"驳回"，填写意见**

  预期：台账进度退回「待预提」（流程重启），备注写入"驳回: xxx"，Toast"已驳回"。

---

## Task 7：场景配置页测试

**Files:** `public/config.html`

### TC-CFG-01：只读加载所有场景卡片

- [ ] **Step 1: 登录后访问 config.html**

  预期：显示记录总数，每条记录渲染为配置卡片，字段完整（付款方式/法律主体/供应商等）。

- [ ] **Step 2: 按费用类型筛选**

  预期：只展示对应类型的配置卡片。

---

### TC-CFG-02：跟进人字段格式化

- [ ] **Step 1: 找一条有多个跟进人的场景记录**

  预期：跟进人字段显示为逗号分隔的 title 列表（非 JSON 对象）。

---

## Task 8：管理后台测试

**Files:** `public/admin.html`

### TC-ADM-01：非管理员无法访问

- [ ] **Step 1: 以员工角色登录，手动在地址栏输入 admin.html**

  预期：`requireLogin()` 通过（已登录），但侧边栏无"管理后台"入口；页面加载后 `isAdmin()` 返回 false，**目前代码中 admin.html 没有 `isAdmin()` 拦截！** 员工可直接查看数据——**记录为安全 Bug**。

---

### TC-ADM-02：用户管理 Tab

- [ ] **Step 1: 管理员打开 admin.html，默认显示用户列表**

  预期：表格显示所有用户（账号/昵称/部门/角色/状态）。

- [ ] **Step 2: 点击某用户"编辑"，修改角色为"审批人"，保存**

  预期：PATCH Teable 用户表，Toast"用户信息已更新"，列表刷新。

- [ ] **Step 3: 修改用户状态为"已禁用"，保存**

  验证该用户下次 SSO 登录时被拦截（配合 TC-AUTH-04）。

---

### TC-ADM-03：统计报表 Tab

- [ ] **Step 1: 切换到"统计报表" Tab**

  预期：显示总台账数、已付款数、逾期数、总金额 4 张统计卡，以及按费用类型的明细表。

- [ ] **Step 2: 对比首页统计（TC-HOME-01 记录的数据）**

  预期：管理后台「总台账」与首页「待处理」+「已付款」等数字之间逻辑一致。

---

### TC-ADM-04：操作日志 Tab

- [ ] **Step 1: 切换到"操作日志" Tab**

  预期：最近 100 条日志按时间倒序，展示时间/账号/昵称/页面/操作。

- [ ] **Step 2: 执行一次提交操作（TC-SUB-03）后回到日志 Tab 刷新**

  预期：日志新增"提交费用:xxx"记录。

---

## Task 9：核心工具函数单元测试

**Files:** `public/api.js`（在 Node.js 环境用 `eval` 或直接 copy 函数）

运行方式：

```bash
node --input-type=module << 'EOF'
# 将 api.js 中的纯函数粘贴后测试
EOF
```

### TC-FN-01：parseBenefitDates — ISO 格式

- [ ] **Step 1: 编写并运行测试**

```js
const assert = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

assert(parseBenefitDates('2026-01-01 到 2026-03-31'), { from: '2026-01-01', to: '2026-03-31' });
assert(parseBenefitDates('2026/01/01 至 2026/03/31'), { from: '2026-01-01', to: '2026-03-31' });
console.log('TC-FN-01 PASS');
```

---

### TC-FN-02：parseBenefitDates — 中文月份

- [ ] **Step 1: 运行测试**

```js
assert(parseBenefitDates('2026年1月至2026年3月').from, '2026-01-01');
assert(parseBenefitDates('2026年1月至2026年3月').to, '2026-03-31');
assert(parseBenefitDates('2026年2月').from, '2026-02-01');
assert(parseBenefitDates('2026年2月').to, '2026-02-28');
console.log('TC-FN-02 PASS');
```

---

### TC-FN-03：parseBenefitDates — 相对词

- [ ] **Step 1: 运行测试（注：结果依赖执行时当前日期，需动态计算预期）**

```js
const now = new Date();
const { from, to } = parseBenefitDates('本月');
assert(from, `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`);
console.log('TC-FN-03 PASS');
```

---

### TC-FN-04：parseBenefitDates — 季度

- [ ] **Step 1: 运行测试**

```js
assert(parseBenefitDates('2026年Q1').from, '2026-01-01');
assert(parseBenefitDates('2026年Q1').to, '2026-03-31');
assert(parseBenefitDates('第二季度').from, `${new Date().getFullYear()}-04-01`);
console.log('TC-FN-04 PASS');
```

---

### TC-FN-05：parseInvoiceTexts — 增值税电子专用发票

- [ ] **Step 1: 运行测试**

```js
const texts = [
  '增值税电子专用发票',
  '购买方信息', '名称：好未来教育科技有限公司',
  '销售方信息', '名称：北京XX科技有限公司',
  '价税合计（小写）¥10800.00',
  '税率：6%'
];
const r = parseInvoiceTexts(texts);
assert(r.invoiceType, '增值税电子专用发票');
assert(r.totalAmount, '10800');
assert(r.taxRate, '0.06');
assert(r.purchaserName, '好未来教育科技有限公司');
assert(r.sellerName, '北京XX科技有限公司');
console.log('TC-FN-05 PASS');
```

---

### TC-FN-06：parseInvoiceTexts — 无小写金额时取最大值

- [ ] **Step 1: 运行测试**

```js
const texts2 = ['增值税普通发票', '¥500.00', '¥1200.00', '¥800.00'];
const r2 = parseInvoiceTexts(texts2);
assert(r2.totalAmount, '1200');
console.log('TC-FN-06 PASS');
```

---

### TC-FN-07：checkOverdue — 逾期/正常判断

- [ ] **Step 1: 运行测试**

```js
const overdueRecord = { fields: { '当前进度': '待付款', '付款截止日期': '2020-01-01' } };
const normalRecord  = { fields: { '当前进度': '待付款', '付款截止日期': '2099-01-01' } };
const paidRecord    = { fields: { '当前进度': '已付款',  '付款截止日期': '2020-01-01' } };
assert(checkOverdue(overdueRecord), '逾期');
assert(checkOverdue(normalRecord),  '正常');
assert(checkOverdue(paidRecord),    '正常');
console.log('TC-FN-07 PASS');
```

---

### TC-FN-08：genLedgerNo 格式验证

- [ ] **Step 1: 运行测试**

```js
const no = genLedgerNo();
if (!/^BX\d{8}\d{4}$/.test(no)) throw new Error('格式错误: ' + no);
console.log('TC-FN-08 PASS, no =', no);
```

---

## Task 10：FC 后端接口测试

**Files:** `fc-backend/index.js`

本地运行 FC 后端：

```bash
cd fc-backend
SSO_APP_ID=xxx SSO_APP_KEY=xxx JWT_SECRET=test_secret FRONTEND_URL=http://localhost:3000 PADDLEOCR_TOKEN=xxx node index.js
```

### TC-FC-01：健康检查

- [ ] **Step 1: 运行**

```bash
curl http://localhost:9000/health
```

预期：`{"status":"ok"}`，HTTP 200。

---

### TC-FC-02：/auth/callback 缺少 token 参数

- [ ] **Step 1: 运行**

```bash
curl "http://localhost:9000/auth/callback"
```

预期：HTTP 400，`{"error":"missing token"}`。

---

### TC-FC-03：/auth/callback 无效 token

- [ ] **Step 1: 运行**

```bash
curl "http://localhost:9000/auth/callback?token=invalid_token_xyz"
```

预期：HTTP 401（SSO 验证失败）或 500（网络异常）。

---

### TC-FC-04：/ocr 缺少 JWT

- [ ] **Step 1: 运行**

```bash
curl -X POST http://localhost:9000/ocr \
  -H 'Content-Type: application/json' \
  -d '{"fileBase64":"aGVsbG8=","fileType":1}'
```

预期：HTTP 401，`{"error":"unauthorized"}`。

---

### TC-FC-05：/ocr 使用伪造 JWT

- [ ] **Step 1: 运行**

```bash
curl -X POST http://localhost:9000/ocr \
  -H 'Content-Type: application/json' \
  -d '{"fileBase64":"aGVsbG8=","fileType":1,"jwt":"eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OX0.FAKE_SIG"}'
```

预期：HTTP 401，`{"error":"unauthorized"}`。

---

### TC-FC-06：/ocr 缺少 fileBase64

- [ ] **Step 1: 构造有效 JWT**

```js
// 临时用 JWT_SECRET=test_secret 签发
const crypto = require('crypto');
const JWT_SECRET = 'test_secret';
const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const b = Buffer.from(JSON.stringify({exp: Math.floor(Date.now()/1000)+7200})).toString('base64url');
const s = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
console.log(`${h}.${b}.${s}`);
```

- [ ] **Step 2: 用有效 JWT 发缺参数请求**

```bash
curl -X POST http://localhost:9000/ocr \
  -H 'Content-Type: application/json' \
  -d "{\"jwt\":\"<上一步的JWT>\"}"
```

预期：HTTP 400，`{"error":"missing fileBase64"}`。

---

### TC-FC-07：CORS headers 验证

- [ ] **Step 1: 发送 OPTIONS 预检请求**

```bash
curl -X OPTIONS http://localhost:9000/ocr \
  -H 'Origin: http://localhost:3000' \
  -H 'Access-Control-Request-Method: POST' -v
```

预期：HTTP 204，响应头包含 `Access-Control-Allow-Origin: http://localhost:3000`（等于 FRONTEND_URL）。

---

### TC-FC-08：请求体超大（> 10MB）

- [ ] **Step 1: 生成超大请求体**

```bash
python3 -c "print('{\"jwt\":\"x\",\"fileBase64\":\"' + 'A'*(11*1024*1024) + '\"}')" > /tmp/large.json
curl -X POST http://localhost:9000/ocr -H 'Content-Type: application/json' -d @/tmp/large.json
```

预期：连接被服务端主动关闭（`req.destroy()`），客户端收到网络错误。

---

## Task 11：边界与异常情况测试

### TC-EDGE-01：XSS 防护（escHtml）

- [ ] **Step 1: 在场景配置表「场景说明」字段注入 XSS payload**

  ```
  <img src=x onerror=alert(1)>
  ```

- [ ] **Step 2: 打开 submit.html，观察 pill 和 scene-block 标题**

  预期：内容被 `escHtml` 转义，显示为 `&lt;img...&gt;`，不执行 JS。

---

### TC-EDGE-02：金额边界值

- [ ] **Step 1: 在金额字段输入负数 `-100`**

  预期：提交后台账金额为 -100（系统无拦截，**记录为潜在业务规则缺失 Bug**）。

- [ ] **Step 2: 输入 0**

  预期：可以提交，台账金额为 0。

- [ ] **Step 3: 输入 `9999999999.99`**

  预期：formatMoney 正常格式化显示，不溢出。

---

### TC-EDGE-03：Teable 缓存机制

- [ ] **Step 1: 打开 submit.html，观察 Network 面板**

  第一次加载台账表 → 缓存到 sessionStorage（`tc_` 前缀）。

- [ ] **Step 2: 刷新页面（不关闭标签页）**

  预期：120s 内不发起第二次 Teable 请求（命中缓存）。

- [ ] **Step 3: 提交一条费用**

  预期：提交后 `cacheClear` 清除缓存，下次读取重新发请求。

---

### TC-EDGE-04：PDF 发票上传

- [ ] **Step 1: 上传 .pdf 格式发票**

  预期：预览区不显示图片（只显示文件名），OCR 调用时 `fileType=0`，识别结果正常解析。

---

## Task 12：安全测试

### TC-SEC-01：未登录直接访问受保护页面

- [ ] **Step 1: 清空 localStorage，依次访问 home/submit/ledger/approve/config/admin**

  预期：每个页面都调用 `requireLogin()` → 跳回 `index.html`（不暴露任何数据）。

---

### TC-SEC-02：Teable Token 不暴露在 docs/api.js

- [ ] **Step 1: 访问 https://liujuwei403.github.io/admin-expense-control/api.js**

  预期：Token 值为 `REMOVED_TOKEN` 字符串（占位符），不是真实 Token。

---

### TC-SEC-03：非管理员直接 URL 访问 admin.html（已知 Bug）

- [ ] **Step 1: 以员工身份登录后，地址栏输入 admin.html**

  预期（当前实际）：页面加载成功，可以看到所有用户数据。
  **Bug 记录**：admin.html 缺少 `isAdmin()` 拦截，应在页面顶部加：
  ```js
  if (!isAdmin()) { showToast('无权限', 'error'); location.href = 'home.html'; throw ''; }
  ```

---

### TC-SEC-04：approve.html 无角色鉴权

- [ ] **Step 1: 以员工身份登录后，访问 approve.html，尝试点击"通过"或"驳回"**

  预期（当前实际）：员工可以执行审批操作，无角色校验。
  **Bug 记录**：`doApprove` 函数缺少 `isApprover()` 检查。

---

## Bug 汇总

| ID | 位置 | 描述 | 严重级别 |
|----|------|------|---------|
| BUG-01 | admin.html | 非管理员可直接访问 admin.html 查看所有用户/统计/日志 | 高 |
| BUG-02 | approve.html | 普通员工可执行审批通过/驳回操作 | 高 |
| BUG-03 | submit.html:737 | 金额字段无负数校验，可提交负金额台账 | 中 |
| BUG-04 | ledger.html | 台账推进无角色限制，员工可自行推进进度 | 中 |
| BUG-05 | api.js:522-529 | `genLedgerNo` 使用随机数而非台账最大编号+1，高并发下可能编号重复 | 低（已在 submitExpense 中通过 maxNo+1 修正，但 genLedgerNo 函数本身误导） |

---

## 测试执行顺序建议

1. Task 9（单元测试，不依赖环境）
2. Task 10（FC 后端接口，本地可独立运行）
3. Task 1（认证流程，其他功能前置依赖）
4. Task 2（导航，全局 UI）
5. Task 3（首页）
6. Task 4（提报，最复杂，建议单独半天）
7. Task 5（台账）
8. Task 6（审批）
9. Task 7（场景配置）
10. Task 8（管理后台）
11. Task 11（边界情况）
12. Task 12（安全）
