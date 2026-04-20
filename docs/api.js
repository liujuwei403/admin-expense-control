// ─── Teable API 配置 ─────────────────────────────────────────────
const TEABLE_BASE   = 'https://yach-teable.zhiyinlou.com';
const TEABLE_TOKEN  = 'REMOVED_TOKEN';
const TABLE_LEDGER  = 'tbluIKIuJRIXIVbfPYM';
const TABLE_SUBMIT  = 'tbl3uasnN8YG32UAZ6z';
const TABLE_USER    = 'tbltScUHfP0Q10bw99N';
const TABLE_LOG     = 'tblAXAbf8MnTmFx1VlJ';

// 场景配置表（参考数据 Base，只读连接）
const REF_CONFIG_TABLE = 'tblAxpoD2Rh7PhJzJLG';
const REF_CONFIG_VIEW  = 'viwh50JByJ1SrEtmiNg';

// ─── SSO 配置 ─────────────────────────────────────────────────────
const SSO_APP_ID    = '1876691221';
const SSO_FC_BASE   = 'https://sso-bacend-xzfk-tayrqiioai.cn-hangzhou.fcapp.run';
const SSO_LOGIN_URL = `https://sso.100tal.com/portal/login/${SSO_APP_ID}`;

// ─── AI 发票识别（通过 FC 后端代理调用 GLM-5V）────────────────────

const HEADERS = {
  Authorization: `Bearer ${TEABLE_TOKEN}`,
  'Content-Type': 'application/json',
};

// ─── 通用 Teable CRUD ───────────────────────────────────────────
const _inflight = {};
const CACHE_TTL = 120000;

function _cacheKey(tableId) { return 'tc_' + tableId; }

function _cacheGet(tableId) {
  try {
    const raw = sessionStorage.getItem(_cacheKey(tableId));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(_cacheKey(tableId)); return null; }
    return data;
  } catch { return null; }
}

function _cacheSet(tableId, data) {
  try { sessionStorage.setItem(_cacheKey(tableId), JSON.stringify({ data, ts: Date.now() })); } catch {}
}

async function teableGet(tableId, skipCache) {
  if (!skipCache) {
    const cached = _cacheGet(tableId);
    if (cached) return cached;
  }
  if (_inflight[tableId]) return _inflight[tableId];
  _inflight[tableId] = (async () => {
    const res = await fetch(
      `${TEABLE_BASE}/api/table/${tableId}/record?fieldKeyType=name&take=1000`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error('获取数据失败');
    const data = (await res.json()).records || [];
    _cacheSet(tableId, data);
    delete _inflight[tableId];
    return data;
  })();
  return _inflight[tableId];
}

// 通过 View 获取记录（用于读取场景配置表）
async function teableGetWithView(tableId, viewId, skipCache) {
  const key = tableId + '_' + viewId;
  if (!skipCache) {
    const cached = _cacheGet(key);
    if (cached) return cached;
  }
  if (_inflight[key]) return _inflight[key];
  _inflight[key] = (async () => {
    const res = await fetch(
      `${TEABLE_BASE}/api/table/${tableId}/record?fieldKeyType=name&take=200&viewId=${viewId}`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error('获取配置数据失败');
    const data = (await res.json()).records || [];
    _cacheSet(key, data);
    delete _inflight[key];
    return data;
  })();
  return _inflight[key];
}

function cacheClear(tableId) { sessionStorage.removeItem(_cacheKey(tableId)); }

async function teableCreate(tableId, fields) {
  const res = await fetch(`${TEABLE_BASE}/api/table/${tableId}/record`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fieldKeyType: 'name', records: [{ fields }] }),
  });
  if (!res.ok) throw new Error('创建失败');
  cacheClear(tableId);
  return (await res.json()).records?.[0];
}

async function teableUpdate(tableId, id, fields) {
  const res = await fetch(`${TEABLE_BASE}/api/table/${tableId}/record`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fieldKeyType: 'name', records: [{ id, fields }] }),
  });
  if (!res.ok) throw new Error('更新失败');
  cacheClear(tableId);
  return (await res.json()).records?.[0];
}

async function teableDelete(tableId, id) {
  const res = await fetch(`${TEABLE_BASE}/api/table/${tableId}/record/${id}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  if (!res.ok) throw new Error('删除失败');
  cacheClear(tableId);
}

// ─── 场景配置表读取 ─────────────────────────────────────────────
async function loadConfigRecords(skipCache) {
  return teableGetWithView(REF_CONFIG_TABLE, REF_CONFIG_VIEW, skipCache);
}

// ─── 用户与认证 ─────────────────────────────────────────────────
async function findUser(account) {
  try {
    const filter = encodeURIComponent(JSON.stringify({ fieldKey: '账号', operator: 'is', value: account }));
    const res = await fetch(
      `${TEABLE_BASE}/api/table/${TABLE_USER}/record?fieldKeyType=name&take=1&filter=${filter}`,
      { headers: HEADERS }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.records?.length > 0) return data.records[0];
    }
  } catch {}
  const records = await teableGet(TABLE_USER);
  return records.find(r => r.fields['账号'] === account) || null;
}

function getCurrentUser() {
  const s = localStorage.getItem('xzfk_user');
  if (!s) return null;
  const sso = getSavedSSO();
  if (!sso) {
    localStorage.removeItem('xzfk_user');
    return null;
  }
  return JSON.parse(s);
}

function requireLogin() {
  if (!getCurrentUser()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('xzfk_user');
  localStorage.removeItem('sso_jwt');
  window.location.href = 'https://sso.100tal.com/sso/logout?path=https://sso.100tal.com/portal/login/1876691221';
}

function isAdmin() {
  const u = getCurrentUser();
  return u && u.role === '管理员';
}

function isApprover() {
  const u = getCurrentUser();
  return u && (u.role === '审批人' || u.role === '管理员');
}

// ─── SSO 认证 ─────────────────────────────────────────────────
function decodeJWT(token) {
  const payload = token.split('.')[1];
  const bin = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function getSavedSSO() {
  const jwt = localStorage.getItem('sso_jwt');
  if (!jwt) return null;
  try {
    const payload = decodeJWT(jwt);
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('sso_jwt');
      return null;
    }
    return { token: jwt, payload };
  } catch {
    localStorage.removeItem('sso_jwt');
    return null;
  }
}

async function handleSSOCallback(ssoToken) {
  const res = await fetch(`${SSO_FC_BASE}/auth/callback?token=${encodeURIComponent(ssoToken)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'SSO验证失败');
  }
  const data = await res.json();
  localStorage.setItem('sso_jwt', data.token);

  const payload = decodeJWT(data.token);
  const emailPrefix = (payload.email || '').split('@')[0];
  const record = await findUser(emailPrefix);

  if (record) {
    const f = record.fields;
    if (f['状态'] === '已禁用') throw new Error('账号已被禁用');
    if (f['状态'] !== '已激活') {
      await teableUpdate(TABLE_USER, record.id, { '状态': '已激活' });
    }
    localStorage.setItem('xzfk_user', JSON.stringify({
      id: record.id,
      account: f['账号'],
      nickname: f['昵称'],
      department: f['部门'] || '',
      role: f['角色'] || '员工',
      approver: f['审批人'] || '',
    }));
  } else {
    const newUser = await teableCreate(TABLE_USER, {
      '账号': emailPrefix || payload.workcode || 'sso_user',
      '昵称': payload.name || '新用户',
      '部门': '',
      '角色': '员工',
      '状态': '已激活',
      '注册时间': new Date().toISOString(),
    });
    localStorage.setItem('xzfk_user', JSON.stringify({
      id: newUser.id,
      account: emailPrefix,
      nickname: payload.name || '新用户',
      department: '',
      role: '员工',
      approver: '',
    }));
  }

  window.location.href = 'home.html';
}

// ─── 阿里云 OCR 发票识别 ────────────────────────────────────────
async function ocrVatInvoice(base64Image) {
  const jwt = localStorage.getItem('sso_jwt');
  if (!jwt) throw new Error('未登录，请先用 SSO 登录');
  const res = await fetch(`${SSO_FC_BASE}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64Image, jwt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '识别失败');
  }
  return await res.json();
}

// ─── 事由描述日期解析 ───────────────────────────────────────────
// 支持「2026年1月1日」「2026年1月」两种格式
//   有日：直接采用
//   无日：起始默认 01，结束默认该月最后一天
function parseBenefitDates(description) {
  const pattern = /(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/g;
  const matches = [...description.matchAll(pattern)];
  if (matches.length === 0) return { from: null, to: null };

  const pad = n => String(n).padStart(2, '0');

  const first = matches[0];
  const fromYear = parseInt(first[1]);
  const fromMonth = parseInt(first[2]);
  const fromDay = first[3] ? parseInt(first[3]) : 1;
  const fromDate = `${fromYear}-${pad(fromMonth)}-${pad(fromDay)}`;

  const last = matches[matches.length - 1];
  const toYear = parseInt(last[1]);
  const toMonth = parseInt(last[2]);
  const toDay = last[3] ? parseInt(last[3]) : new Date(toYear, toMonth, 0).getDate();
  const toDate = `${toYear}-${pad(toMonth)}-${pad(toDay)}`;

  return { from: fromDate, to: toDate };
}

// ─── 工具函数 ───────────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function genLedgerNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  return `BX${y}${m}${d}${seq}`;
}

function checkOverdue(record) {
  const f = record.fields;
  const progress = f['当前进度'];
  if (progress === '已付款') return '正常';
  const deadline = f['付款截止日期'];
  if (!deadline) return '正常';
  return new Date(deadline) < new Date() ? '逾期' : '正常';
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('zh-CN');
}

function formatMoney(n) {
  if (n == null) return '-';
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COLORS = {
  '待预提': '#f59e0b',
  '预提完成': '#3b82f6',
  '待收账单': '#f59e0b',
  '已收账单': '#3b82f6',
  '费控提报中': '#7c3aed',
  '费控提报完成': '#16a34a',
  '待付款': '#f59e0b',
  '已付款': '#10b981',
};

function statusBadge(status) {
  const color = STATUS_COLORS[status] || '#6b7280';
  return `<span class="status-badge" style="--status-color:${color}">${status || '-'}</span>`;
}

// ─── Toast 通知 ───────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ─── 导航栏渲染 ───────────────────────────────────────────────
function renderNav(activePage) {
  const user = getCurrentUser();
  const pages = [
    { href: 'home.html', icon: 'home', label: '首页' },
    { href: 'submit.html', icon: 'edit', label: '费用提报' },
    { href: 'ledger.html', icon: 'book', label: '费用台账' },
    { href: 'approve.html', icon: 'check-circle', label: '审批中心' },
    { href: 'config.html', icon: 'settings', label: '场景配置' },
    { href: 'admin.html', icon: 'shield', label: '管理后台', needAdmin: true },
  ];

  const svgIcons = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    'check-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  };

  const navLinks = pages
    .filter(p => {
      if (p.needAdmin && !isAdmin()) return false;
      if (p.needApprover && !isApprover()) return false;
      return true;
    })
    .map(p => `<a class="sidebar-link ${activePage === p.href ? 'active' : ''}" href="${p.href}">
      <span class="sidebar-icon">${svgIcons[p.icon] || ''}</span>
      <span class="sidebar-text">${p.label}</span>
    </a>`).join('');

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-logo">
      <span class="logo-text">行政费控</span>
    </div>
    <nav class="sidebar-nav">${navLinks}</nav>
    <div class="sidebar-footer">
      <span class="sidebar-user">${user?.nickname || ''}</span>
      <button class="btn-logout" onclick="logout()">退出</button>
    </div>
  `;

  document.getElementById('topbar').innerHTML = `
    <div class="topbar-title">${pages.find(p => p.href === activePage)?.label || ''}</div>
    <div class="topbar-right">
      <span class="topbar-name">${user?.nickname || ''}</span>
    </div>
  `;
}

// ─── 操作日志 ─────────────────────────────────────────────────
function trackAction(action, page) {
  const u = getCurrentUser();
  if (!u) return;
  fetch(`${TEABLE_BASE}/api/table/${TABLE_LOG}/record`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ fieldKeyType: 'name', records: [{ fields: {
      '时间': new Date().toISOString(),
      '账号': u.account || '',
      '昵称': u.nickname || '',
      '页面': page || location.pathname.split('/').pop(),
      '操作': action,
    }}] }),
  }).catch(() => {});
}
