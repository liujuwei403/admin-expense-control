const http = require('http');
const https = require('https');
const crypto = require('crypto');

const SSO_APP_ID = process.env.SSO_APP_ID;
const SSO_APP_KEY = process.env.SSO_APP_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;
const AI_TOKEN = process.env.AI_TOKEN;

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

function httpPostJson(urlStr, token, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
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

const OCR_PROMPT = `你是一名发票识别专家。请识别下面这张发票图片，严格按以下JSON格式返回结果，不要有任何其他文字或 markdown 代码块：
{"invoiceType":"发票类型","totalAmount":价税合计金额数字,"taxRate":税率小数,"sellerName":"销售方名称","purchaserName":"购买方名称"}

要求：
- invoiceType 取值范围：增值税专用发票 / 增值税普通发票 / 电子发票（增值税专用发票）/ 电子发票（增值税普通发票）/ 其他
- totalAmount 为纯数字（价税合计），识别不到填 0
- taxRate 为小数（如 0.06、0.13），有多个税率取最大值，识别不到填 0
- sellerName 和 purchaserName 为字符串，识别不到填 ""`;

async function ocrInvoice(imageBase64) {
  if (!AI_TOKEN) throw new Error('AI_TOKEN 未配置');
  const { status, body } = await httpPostJson(
    'http://ai-service.tal.com/openai-compatible/v1/chat/completions',
    AI_TOKEN,
    {
      model: 'glm-5v-turbo',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 1024,
    }
  );
  if (status !== 200) throw new Error('AI返回异常: ' + JSON.stringify(body).slice(0, 200));
  let content = body.choices?.[0]?.message?.content || '';
  content = content.replace(/```json\s*|\s*```/g, '').trim();
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI返回非JSON: ' + content.slice(0, 200));
  return JSON.parse(match[0]);
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
      const jwt = signJWT({
        account_id: result.data.account_id,
        name: result.data.name,
        workcode: result.data.workcode,
        email: result.data.email,
      });
      res.writeHead(200);
      res.end(JSON.stringify({ token: jwt, user: result.data }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // OCR 代理：POST /ocr  body: { imageBase64, jwt }
  if (url.pathname === '/ocr' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { imageBase64, jwt } = JSON.parse(raw);
      if (!jwt || !verifyJWT(jwt)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      if (!imageBase64) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'missing imageBase64' }));
        return;
      }
      const data = await ocrInvoice(imageBase64);
      res.writeHead(200);
      res.end(JSON.stringify(data));
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
