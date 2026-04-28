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

// ─── AI 发票识别（前端直连 PaddleOCR）────────────────────────────
const PADDLE_OCR_URL   = 'https://c2maw7jdm04fy5a2.aistudio-app.com/ocr';
const PADDLE_OCR_TOKEN = 'REMOVED_PADDLEOCR_TOKEN';

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
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`创建失败 ${res.status}: ${errText.slice(0, 300)}`);
  }
  cacheClear(tableId);
  return (await res.json()).records?.[0];
}

async function teableUpdate(tableId, id, fields) {
  const res = await fetch(`${TEABLE_BASE}/api/table/${tableId}/record`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fieldKeyType: 'name', records: [{ id, fields }] }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`更新失败 ${res.status}: ${errText.slice(0, 300)}`);
  }
  cacheClear(tableId);
  return (await res.json()).records?.[0];
}

async function teableDelete(tableId, id) {
  const res = await fetch(`${TEABLE_BASE}/api/table/${tableId}/record/${id}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`删除失败 ${res.status}: ${errText.slice(0, 300)}`);
  }
  cacheClear(tableId);
}

// ─── Teable 附件上传（三步：签名 → PUT COS → notify）──────────────
async function teableUploadAttachment(file) {
  const contentType = file.type || 'application/octet-stream';

  // 1. 获取预签名 URL
  const sigRes = await fetch(`${TEABLE_BASE}/api/attachments/signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TEABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 2, contentType, contentLength: file.size }),
  });
  if (!sigRes.ok) {
    const text = await sigRes.text().catch(() => '');
    throw new Error(`获取上传签名失败 ${sigRes.status}: ${text.slice(0, 200)}`);
  }
  const { url, token } = await sigRes.json();

  // 2. PUT 文件到腾讯云 COS（浏览器自动携带 Content-Length）
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!putRes.ok) throw new Error(`上传文件失败 ${putRes.status}`);

  // 3. 通知 Teable 完成上传
  await fetch(`${TEABLE_BASE}/api/attachments/notify/${token}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TEABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name || 'file' }),
  }).catch(() => {});

  return { token, name: file.name || 'file', size: file.size, mimetype: contentType };
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
    const updateFields = { '状态': '已激活' };
    if (payload.department && !f['部门']) updateFields['部门'] = payload.department;
    if (payload.workcode && !f['工号']) updateFields['工号'] = payload.workcode;
    if (Object.keys(updateFields).length > 1 || f['状态'] !== '已激活') {
      await teableUpdate(TABLE_USER, record.id, updateFields);
    }
    localStorage.setItem('xzfk_user', JSON.stringify({
      id: record.id,
      account: f['账号'],
      nickname: f['昵称'],
      department: f['部门'] || payload.department || '',
      workcode: f['工号'] || payload.workcode || '',
      role: f['角色'] || '员工',
      approver: f['审批人'] || '',
    }));
  } else {
    const newUser = await teableCreate(TABLE_USER, {
      '账号': emailPrefix || payload.workcode || 'sso_user',
      '昵称': payload.name || '新用户',
      '部门': payload.department || '',
      '工号': payload.workcode || '',
      '角色': '员工',
      '状态': '已激活',
      '注册时间': new Date().toISOString(),
    });
    localStorage.setItem('xzfk_user', JSON.stringify({
      id: newUser.id,
      account: emailPrefix,
      nickname: payload.name || '新用户',
      department: payload.department || '',
      workcode: payload.workcode || '',
      role: '员工',
      approver: '',
    }));
  }

  window.location.href = 'home.html';
}

// ─── PaddleOCR 发票识别（经 FC 后端代理，解决 CORS）──────────────
function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('读取文件失败'));
    r.readAsDataURL(file);
  });
}

async function ocrVatInvoice(file) {
  if (!(file instanceof File) && !(file instanceof Blob)) {
    throw new Error('参数必须是 File 对象');
  }
  const jwt = localStorage.getItem('sso_jwt');
  if (!jwt) throw new Error('未登录，请先用 SSO 登录');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  const fileBase64 = await _fileToBase64(file);
  const res = await fetch(`${SSO_FC_BASE}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64, fileType: isPdf ? 0 : 1, jwt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `OCR HTTP ${res.status}`);
  }
  return await res.json();
}

function parseInvoiceTexts(texts) {
  const lines = texts.map(s => String(s || '').trim()).filter(Boolean);
  const joined = lines.join(' ');

  let invoiceType = '';
  const t = lines.filter(l => /电子发票|增值税|专用发票|普通发票/.test(l))
    .join('').replace(/[\s（）()]/g, '');
  if (/电子发票/.test(t) && /专用发票/.test(t)) invoiceType = '增值税电子专用发票';
  else if (/电子发票/.test(t) && /普通发票/.test(t)) invoiceType = '增值税电子普通发票';
  else if (/专用发票/.test(t)) invoiceType = '增值税专用发票';
  else if (/普通发票/.test(t)) invoiceType = '增值税普通发票';

  let totalAmount = '';
  const small = joined.match(/[(（]\s*小写\s*[)）]\s*[￥¥]?\s*([0-9]+(?:\.[0-9]+)?)/);
  if (small) {
    totalAmount = small[1];
  } else {
    const nums = [...joined.matchAll(/[￥¥]\s*([0-9]+(?:\.[0-9]+)?)/g)].map(m => parseFloat(m[1]));
    if (nums.length) totalAmount = String(Math.max(...nums));
  }

  let taxRate = '';
  const rate = joined.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (rate) taxRate = (parseFloat(rate[1]) / 100).toFixed(2);

  const findNameAfter = (anchorRe) => {
    const idx = lines.findIndex(l => anchorRe.test(l));
    if (idx < 0) return '';
    for (let i = idx + 1; i < Math.min(idx + 8, lines.length); i++) {
      const m = lines[i].match(/名\s*称\s*[：:]\s*(.+)/);
      if (m) return m[1].trim();
    }
    return '';
  };
  const sellerName    = findNameAfter(/销售方信息|销\s*售\s*方/);
  const purchaserName = findNameAfter(/购买方信息|购\s*买\s*方/);

  return { invoiceType, totalAmount, taxRate, sellerName, purchaserName };
}

// ─── 事由描述日期解析 ───────────────────────────────────────────
// 支持「2026年1月1日」「2026年1月」两种格式
//   有日：直接采用
//   无日：起始默认 01，结束默认该月最后一天
function parseBenefitDates(description) {
  if (!description || !description.trim()) return { from: null, to: null };

  const pad  = n => String(n).padStart(2, '0');
  const now  = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const curD = now.getDate();

  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function ds(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
  function relDay(offset) {
    const t = new Date(now); t.setDate(curD + offset);
    return `${t.getFullYear()}年${t.getMonth()+1}月${t.getDate()}日`;
  }

  // 中文数字 → 整数（1–31）
  function cn2n(s) {
    if (!s) return null;
    s = s.trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    const d = {'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
    if (s === '十') return 10;
    if (s.startsWith('十')) return 10 + (d[s[1]] || 0);
    if (s.includes('十')) {
      const i = s.indexOf('十');
      return (d[s[i-1]] || 0) * 10 + (d[s[i+1]] || 0);
    }
    return d[s[0]] || null;
  }

  // ① ISO 格式优先（YYYY-MM-DD 或 YYYY/MM/DD）
  const iso = [...description.matchAll(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g)];
  if (iso.length >= 2) {
    return {
      from: ds(iso[0][1], iso[0][2], iso[0][3]),
      to:   ds(iso[iso.length-1][1], iso[iso.length-1][2], iso[iso.length-1][3])
    };
  }

  // ② 相对词 & 特殊词预处理
  const lastM = curM === 1  ? 12 : curM - 1;  const lastY = curM === 1  ? curY - 1 : curY;
  const nextM = curM === 12 ? 1  : curM + 1;  const nextY = curM === 12 ? curY + 1 : curY;

  // 季度映射：索引 0–3 对应 Q1–Q4
  const qRanges = [[1,3],[4,6],[7,9],[10,12]];
  const cnQ = {'一':0,'二':1,'三':2,'四':3,'1':0,'2':1,'3':2,'4':3};
  function qStr(yr, qi) {
    const [m1,m2] = qRanges[qi];
    return `${yr}年${m1}月到${yr}年${m2}月`;
  }
  function fixY(y) { return +y < 100 ? +y + 2000 : +y; }

  let text = description
    // 相对天
    .replace(/前天/g, relDay(-2)).replace(/昨天|昨日/g, relDay(-1))
    .replace(/今天|今日/g, relDay(0)).replace(/明天|明日/g, relDay(1))
    .replace(/后天/g, relDay(2))
    // 相对年
    .replace(/去年/g, `${curY-1}年`).replace(/明年/g, `${curY+1}年`).replace(/今年/g, `${curY}年`)
    // 相对月
    .replace(/上月|上个月/g, `${lastY}年${lastM}月`)
    .replace(/下月|下个月/g, `${nextY}年${nextM}月`)
    .replace(/本月/g, `${curY}年${curM}月`)
    // 上/下半年（先处理带年份）
    .replace(/(\d{2,4})年?上半年/g, (_,y) => `${fixY(y)}年1月到${fixY(y)}年6月`)
    .replace(/(\d{2,4})年?下半年/g, (_,y) => `${fixY(y)}年7月到${fixY(y)}年12月`)
    .replace(/上半年/g, `${curY}年1月到${curY}年6月`)
    .replace(/下半年/g, `${curY}年7月到${curY}年12月`)
    // 季度（带年份先匹配）
    .replace(/(\d{2,4})年?第?([一二三四])季度/g, (_,y,q) => qStr(fixY(y), cnQ[q]))
    .replace(/(\d{2,4})年?[Qq]([1-4])/g,        (_,y,q) => qStr(fixY(y), cnQ[q]))
    .replace(/第?([一二三四])季度/g, (_,q) => qStr(curY, cnQ[q]))
    .replace(/[Qq]([1-4])/g,        (_,q) => qStr(curY, cnQ[q]));

  // ③ 片段提取 {year, month, day}
  const CN = '[一二三四五六七八九十\\d]+';
  function extractParts(s) {
    const ym = s.match(/(\d{2,4})年/);
    const mm = s.match(new RegExp(`(${CN})月`));
    const dm = s.match(new RegExp(`(${CN})[日号]`));
    let year = null;
    if (ym) { year = parseInt(ym[1]); if (year < 100) year += 2000; }
    const month = mm ? cn2n(mm[1]) : null;
    let day = dm ? cn2n(dm[1]) : null;

    if (!day && mm) {
      const afterMo = s.slice(s.indexOf('月') + 1).trim();
      if (/^月?[初头]/.test(afterMo)) {
        // 月初/月头/初 → 1 日
        day = 1;
      } else if (/^月?[末底尾]/.test(afterMo)) {
        // 月末/月底/月尾/末/底 → 当月最后一天
        if (month) day = daysInMonth(year || curY, month);
      } else if (/^上半月/.test(afterMo)) {
        // 上半月 → 记 day=1（结束端用 15）
        day = 1;
      } else if (/^下半月/.test(afterMo)) {
        // 下半月 → 16 日起
        day = 16;
      } else {
        // 无后缀数字，如"四月十五"
        const trail = afterMo.match(new RegExp(`^(${CN})(?![月年])`));
        if (trail) day = cn2n(trail[1]);
      }
    }
    return { year, month, day };
  }

  // ④ 分割 → 过滤有日期信息的片段 → 推断缺省值
  const segments = text.split(/到|至|[～~—–]/).map(s => s.trim()).filter(Boolean);
  const dated = segments.map(extractParts).filter(p => p.year || p.month || p.day);

  if (dated.length >= 2) {
    const A = dated[0], B = dated[dated.length - 1];
    if (!A.year) A.year = curY;
    if (!B.year) B.year = A.year;
    if (!B.month && A.month) B.month = A.month; // 同月不同日，如"1月5日到18号"
    const fd = A.day || 1;
    const td = B.day || (B.month ? daysInMonth(B.year, B.month) : 1);
    if (A.month && B.month) return { from: ds(A.year, A.month, fd), to: ds(B.year, B.month, td) };
    if (A.year && B.year)   return { from: `${A.year}-01-01`, to: `${B.year}-12-31` };
  }

  if (dated.length === 1) {
    const p = dated[0], y = p.year || curY;
    if (p.month) {
      return {
        from: ds(y, p.month, p.day || 1),
        to:   ds(y, p.month, p.day || daysInMonth(y, p.month))
      };
    }
    if (p.year) return { from: `${y}-01-01`, to: `${y}-12-31` };
  }

  return { from: null, to: null };
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
    .map(p => `<a class="sidebar-link ${activePage === p.href ? 'active' : ''}" href="${p.href}" data-label="${p.label}" title="${p.label}">
      <span class="sidebar-icon">${svgIcons[p.icon] || ''}</span>
      <span class="sidebar-text">${p.label}</span>
    </a>`).join('');

  const logoIconSvg = '<svg class="sidebar-logo-icon" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor"/><text x="12" y="17" text-anchor="middle" fill="white" font-size="13" font-weight="900" font-family="PingFang SC,Microsoft YaHei,sans-serif">快</text></svg>';

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-logo">
      ${logoIconSvg}
      <span class="logo-text">快提快报</span>
    </div>
    <nav class="sidebar-nav">${navLinks}</nav>
  `;

  // 右边框浮动收起按钮（Notion 风格），仅创建一次
  if (!document.getElementById('sidebar-edge-toggle')) {
    const btn = document.createElement('button');
    btn.id = 'sidebar-edge-toggle';
    btn.className = 'sidebar-edge-toggle';
    btn.title = '收起/展开侧边栏';
    btn.onclick = toggleSidebar;
    btn.innerHTML = '<svg viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,1 2,7 6,13"/></svg>';
    document.body.appendChild(btn);
  }

  const nickname = user?.nickname || '';
  const initials = nickname ? nickname.charAt(0) : '?';

  document.getElementById('topbar').innerHTML = `
    <div class="topbar-title">${pages.find(p => p.href === activePage)?.label || ''}</div>
    <div class="topbar-right">
      <div class="topbar-user">
        <div class="topbar-avatar">${initials}</div>
        <span class="topbar-name">${nickname}</span>
        <button class="btn-logout" onclick="logout()">退出</button>
      </div>
    </div>
  `;

  if (localStorage.getItem('sidebar_collapsed') === '1') {
    document.body.classList.add('sidebar-collapsed');
  }
}

function toggleSidebar() {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0');
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
