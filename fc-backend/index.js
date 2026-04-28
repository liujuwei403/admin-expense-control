const http = require('http');
const https = require('https');
const crypto = require('crypto');

const SSO_APP_ID       = process.env.SSO_APP_ID;
const SSO_APP_KEY      = process.env.SSO_APP_KEY;
const JWT_SECRET       = process.env.JWT_SECRET;
const FRONTEND_URL     = process.env.FRONTEND_URL;
const PADDLEOCR_TOKEN  = process.env.PADDLEOCR_TOKEN;
const PADDLEOCR_URL    = 'https://c2maw7jdm04fy5a2.aistudio-app.com/ocr';

let ticketCache = { value: null, expireAt: 0 };

async function getTicket() {
  if (ticketCache.value && Date.now() < ticketCache.expireAt) return ticketCache.value;
  const result = await httpGetJson(
    `https://sso.100tal.com/basic/get_ticket?appid=${encodeURIComponent(SSO_APP_ID)}&appkey=${encodeURIComponent(SSO_APP_KEY)}`
  );
  if (result.errcode !== 0) throw new Error(`get_ticket failed: ${result.errmsg}`);
  ticketCache = { value: result.ticket, expireAt: Date.now() + 115 * 60 * 1000 };
  return result.ticket;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function callPaddleOcr(fileBase64, fileType) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ file: fileBase64, fileType });
    const u = new URL(PADDLEOCR_URL);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'token ' + PADDLEOCR_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: { raw: data } }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
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

  return {
    invoiceType,
    totalAmount,
    taxRate,
    sellerName:    findNameAfter(/销售方信息|销\s*售\s*方/),
    purchaserName: findNameAfter(/购买方信息|购\s*买\s*方/),
  };
}

function signJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 7200
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyJWT(token) {
  try {
    const [h, b, s] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
    if (s !== expected) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 10 * 1024 * 1024) { req.destroy(); reject(new Error('payload too large')); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // SSO 回调：GET /auth/callback?token=xxx
  if (url.pathname === '/auth/callback' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    if (!token) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'missing token' }));
      return;
    }
    try {
      const ticket = await getTicket();
      const result = await httpGetJson(
        `https://sso.100tal.com/api/v1/sso/verify?token=${encodeURIComponent(token)}&ticket=${encodeURIComponent(ticket)}`
      );
      if (result.errcode !== 0) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: result.errmsg }));
        return;
      }
      console.log('[SSO data keys]', JSON.stringify(result.data));
      const jwt = signJWT({
        account_id: result.data.account_id,
        name: result.data.name,
        workcode: result.data.workcode,
        email: result.data.email,
        department: result.data.dept_name || result.data.department || result.data.org_name || '',
      });
      res.writeHead(200);
      res.end(JSON.stringify({ token: jwt, user: result.data }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // OCR 代理：POST /ocr  body: { fileBase64, fileType, jwt }
  if (url.pathname === '/ocr' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { fileBase64, fileType, jwt } = JSON.parse(raw);
      if (!jwt || !verifyJWT(jwt)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      if (!fileBase64) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'missing fileBase64' }));
        return;
      }
      if (!PADDLEOCR_TOKEN) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'PADDLEOCR_TOKEN 未配置' }));
        return;
      }
      const { status, body } = await callPaddleOcr(fileBase64, fileType ?? 1);
      if (status !== 200) throw new Error('PaddleOCR 返回异常: ' + JSON.stringify(body).slice(0, 200));
      const texts = body?.result?.ocrResults?.[0]?.prunedResult?.rec_texts || [];
      if (!texts.length) throw new Error('OCR 未识别到文字');
      const parsed = parseInvoiceTexts(texts);
      res.writeHead(200);
      res.end(JSON.stringify(parsed));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(9000, () => {
  console.log('backend running on port 9000');
});
