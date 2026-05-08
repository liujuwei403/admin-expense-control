// 单元测试：api.js 纯函数
// 运行：node test/unit.js

// ─── 从 api.js 复制纯函数（不依赖浏览器 API）─────────────────────

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
  const iso = [...description.matchAll(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g)];
  if (iso.length >= 2) {
    return {
      from: ds(iso[0][1], iso[0][2], iso[0][3]),
      to:   ds(iso[iso.length-1][1], iso[iso.length-1][2], iso[iso.length-1][3])
    };
  }
  const lastM = curM === 1  ? 12 : curM - 1;  const lastY = curM === 1  ? curY - 1 : curY;
  const nextM = curM === 12 ? 1  : curM + 1;  const nextY = curM === 12 ? curY + 1 : curY;
  const qRanges = [[1,3],[4,6],[7,9],[10,12]];
  const cnQ = {'一':0,'二':1,'三':2,'四':3,'1':0,'2':1,'3':2,'4':3};
  function qStr(yr, qi) {
    const [m1,m2] = qRanges[qi];
    return `${yr}年${m1}月到${yr}年${m2}月`;
  }
  function fixY(y) { return +y < 100 ? +y + 2000 : +y; }
  let text = description
    .replace(/前天/g, relDay(-2)).replace(/昨天|昨日/g, relDay(-1))
    .replace(/今天|今日/g, relDay(0)).replace(/明天|明日/g, relDay(1))
    .replace(/后天/g, relDay(2))
    .replace(/去年/g, `${curY-1}年`).replace(/明年/g, `${curY+1}年`).replace(/今年/g, `${curY}年`)
    .replace(/上月|上个月/g, `${lastY}年${lastM}月`)
    .replace(/下月|下个月/g, `${nextY}年${nextM}月`)
    .replace(/本月/g, `${curY}年${curM}月`)
    .replace(/(\d{2,4})年?上半年/g, (_,y) => `${fixY(y)}年1月到${fixY(y)}年6月`)
    .replace(/(\d{2,4})年?下半年/g, (_,y) => `${fixY(y)}年7月到${fixY(y)}年12月`)
    .replace(/上半年/g, `${curY}年1月到${curY}年6月`)
    .replace(/下半年/g, `${curY}年7月到${curY}年12月`)
    .replace(/(\d{2,4})年?第?([一二三四])季度/g, (_,y,q) => qStr(fixY(y), cnQ[q]))
    .replace(/(\d{2,4})年?[Qq]([1-4])/g,        (_,y,q) => qStr(fixY(y), cnQ[q]))
    .replace(/第?([一二三四])季度/g, (_,q) => qStr(curY, cnQ[q]))
    .replace(/[Qq]([1-4])/g,        (_,q) => qStr(curY, cnQ[q]));
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
      if (/^月?[初头]/.test(afterMo)) { day = 1; }
      else if (/^月?[末底尾]/.test(afterMo)) { if (month) day = daysInMonth(year || curY, month); }
      else if (/^上半月/.test(afterMo)) { day = 1; }
      else if (/^下半月/.test(afterMo)) { day = 16; }
      else {
        const trail = afterMo.match(new RegExp(`^(${CN})(?![月年])`));
        if (trail) day = cn2n(trail[1]);
      }
    }
    return { year, month, day };
  }
  const segments = text.split(/到|至|[～~—–]/).map(s => s.trim()).filter(Boolean);
  const dated = segments.map(extractParts).filter(p => p.year || p.month || p.day);
  if (dated.length >= 2) {
    const A = dated[0], B = dated[dated.length - 1];
    if (!A.year) A.year = curY;
    if (!B.year) B.year = A.year;
    if (!B.month && A.month) B.month = A.month;
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

function parseInvoiceTexts(texts) {
  const lines = texts.map(s => String(s || '').trim()).filter(Boolean);
  const joined = lines.join(' ');
  let invoiceType = '';
  const t = lines.filter(l => /电子发票|增值税|专用发票|普通发票/.test(l))
    .join('').replace(/[\s（）()]/g, '');
  if (/电子/.test(t) && /专用发票/.test(t)) invoiceType = '增值税电子专用发票';
  else if (/电子/.test(t) && /普通发票/.test(t)) invoiceType = '增值税电子普通发票';
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

function checkOverdue(record) {
  const f = record.fields;
  const progress = f['当前进度'];
  if (progress === '已付款') return '正常';
  const deadline = f['付款截止日期'];
  if (!deadline) return '正常';
  return new Date(deadline) < new Date() ? '逾期' : '正常';
}

function genLedgerNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  return `BX${y}${m}${d}${seq}`;
}

// ─── 测试框架 ─────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    Expected: ${e}`);
    console.error(`    Actual:   ${a}`);
    failed++;
  }
}

// ─── TC-FN-01：ISO 格式 ───────────────────────────────────────────
console.log('\nTC-FN-01: parseBenefitDates — ISO 格式');
assert('YYYY-MM-DD 到 YYYY-MM-DD',
  parseBenefitDates('2026-01-01 到 2026-03-31'),
  { from: '2026-01-01', to: '2026-03-31' });
assert('YYYY/MM/DD 至 YYYY/MM/DD',
  parseBenefitDates('2026/01/01 至 2026/03/31'),
  { from: '2026-01-01', to: '2026-03-31' });
assert('申请报销带日期',
  parseBenefitDates('申请报销2026-01-01房租费用 到 2026-03-31'),
  { from: '2026-01-01', to: '2026-03-31' });

// ─── TC-FN-02：中文月份 ───────────────────────────────────────────
console.log('\nTC-FN-02: parseBenefitDates — 中文月份');
assert('2026年1月至2026年3月 from', parseBenefitDates('2026年1月至2026年3月').from, '2026-01-01');
assert('2026年1月至2026年3月 to',   parseBenefitDates('2026年1月至2026年3月').to,   '2026-03-31');
assert('单月 2026年2月 from', parseBenefitDates('2026年2月').from, '2026-02-01');
assert('单月 2026年2月 to（2026非闰年28天）', parseBenefitDates('2026年2月').to, '2026-02-28');
assert('单月 2026年12月 to', parseBenefitDates('2026年12月').to, '2026-12-31');
assert('2026年1月1日', parseBenefitDates('2026年1月1日').from, '2026-01-01');
assert('1月5日到1月18号 同月不同日',
  parseBenefitDates('2026年1月5日到18号'),
  { from: '2026-01-05', to: '2026-01-18' });

// ─── TC-FN-03：相对词 ─────────────────────────────────────────────
console.log('\nTC-FN-03: parseBenefitDates — 相对词');
const now = new Date();
const curY = now.getFullYear(), curM = now.getMonth() + 1;
const pad = n => String(n).padStart(2, '0');
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

const thisMonthFrom = `${curY}-${pad(curM)}-01`;
const thisMonthTo   = `${curY}-${pad(curM)}-${pad(daysInMonth(curY, curM))}`;
assert('本月 from', parseBenefitDates('本月').from, thisMonthFrom);
assert('本月 to',   parseBenefitDates('本月').to,   thisMonthTo);
assert('今年 from', parseBenefitDates('今年').from, `${curY}-01-01`);
assert('今年 to',   parseBenefitDates('今年').to,   `${curY}-12-31`);

// ─── TC-FN-04：季度 ───────────────────────────────────────────────
console.log('\nTC-FN-04: parseBenefitDates — 季度');
assert('2026年Q1 from', parseBenefitDates('2026年Q1').from, '2026-01-01');
assert('2026年Q1 to',   parseBenefitDates('2026年Q1').to,   '2026-03-31');
assert('2026年第二季度 from', parseBenefitDates('2026年第二季度').from, '2026-04-01');
assert('2026年第二季度 to',   parseBenefitDates('2026年第二季度').to,   '2026-06-30');
assert('2025年Q4 from', parseBenefitDates('2025年Q4').from, '2025-10-01');
assert('2025年Q4 to',   parseBenefitDates('2025年Q4').to,   '2025-12-31');
assert('上半年 from', parseBenefitDates('上半年').from, `${curY}-01-01`);
assert('上半年 to',   parseBenefitDates('上半年').to,   `${curY}-06-30`);

// ─── TC-FN-05：parseInvoiceTexts — 电子专用发票 ────────────────
console.log('\nTC-FN-05: parseInvoiceTexts — 增值税电子专用发票');
const texts1 = [
  '增值税电子专用发票',
  '购买方信息', '名称：好未来教育科技有限公司',
  '销售方信息', '名称：北京XX科技有限公司',
  '价税合计（小写）¥10800.00',
  '税率：6%'
];
const r1 = parseInvoiceTexts(texts1);
assert('发票类型', r1.invoiceType, '增值税电子专用发票');
assert('金额（小写）', r1.totalAmount, '10800.00');
assert('税率', r1.taxRate, '0.06');
assert('购方名称', r1.purchaserName, '好未来教育科技有限公司');
assert('销方名称', r1.sellerName, '北京XX科技有限公司');

// ─── TC-FN-06：parseInvoiceTexts — 无小写金额取最大值 ──────────
console.log('\nTC-FN-06: parseInvoiceTexts — 无小写金额，取最大¥');
const texts2 = ['增值税普通发票', '¥500.00', '¥1200.00', '¥800.00'];
const r2 = parseInvoiceTexts(texts2);
assert('普通发票类型', r2.invoiceType, '增值税普通发票');
assert('最大金额', r2.totalAmount, '1200');

// ─── TC-FN-07：checkOverdue ───────────────────────────────────────
console.log('\nTC-FN-07: checkOverdue');
assert('过期截止日+待付款 = 逾期',
  checkOverdue({ fields: { '当前进度': '待付款', '付款截止日期': '2020-01-01' } }), '逾期');
assert('未来截止日 = 正常',
  checkOverdue({ fields: { '当前进度': '待付款', '付款截止日期': '2099-01-01' } }), '正常');
assert('已付款不逾期（即使截止已过）',
  checkOverdue({ fields: { '当前进度': '已付款',  '付款截止日期': '2020-01-01' } }), '正常');
assert('无截止日 = 正常',
  checkOverdue({ fields: { '当前进度': '待付款' } }), '正常');

// ─── TC-FN-08：genLedgerNo 格式 ──────────────────────────────────
console.log('\nTC-FN-08: genLedgerNo');
const no = genLedgerNo();
assert('格式 BX + 8位日期 + 4位序号', /^BX\d{12}$/.test(no), true);
console.log(`  生成编号样本：${no}`);

// ─── TC-FN-09：parseBenefitDates — 空/无效输入 ────────────────
console.log('\nTC-FN-09: parseBenefitDates — 空/无效输入');
assert('空字符串', parseBenefitDates(''),          { from: null, to: null });
assert('null',     parseBenefitDates(null),         { from: null, to: null });
assert('纯文字无日期', parseBenefitDates('申请报销差旅费'), { from: null, to: null });

// ─── TC-FN-10：parseInvoiceTexts — 无匹配 ─────────────────────
console.log('\nTC-FN-10: parseInvoiceTexts — 空数组/无识别内容');
const r3 = parseInvoiceTexts([]);
assert('空数组类型', r3.invoiceType, '');
assert('空数组金额', r3.totalAmount, '');
const r4 = parseInvoiceTexts(['收据', '金额：一百元']);
assert('无¥金额 = 空', r4.totalAmount, '');

// ─── 汇总 ─────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`测试结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
