'use strict';

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const CHANNEL_ID = process.env.LINEPAY_CHANNEL_ID || '';
const CHANNEL_SECRET = process.env.LINEPAY_CHANNEL_SECRET || '';
const LINEPAY_ENV = (process.env.LINEPAY_ENV || 'PRODUCTION').toUpperCase();
const STOREFRONT_URL = process.env.STOREFRONT_URL || 'https://a0980778082-coder.github.io/savage-order/';
const STOREFRONT_ORIGIN = new URL(STOREFRONT_URL).origin;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1kzWWfa7ES04Ly4oyNdcwsTsOtSjPC01VF5ovHMSSwcE';
const ORDER_SHEET = process.env.ORDER_SHEET || '訂單主檔';

const API_BASE = LINEPAY_ENV === 'SANDBOX'
  ? 'https://sandbox-api-pay.line.me'
  : 'https://api-pay.line.me';

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': STOREFRONT_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(data);
}

function redirect(res, url) {
  res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' });
  res.end();
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100000) throw new Error('Request too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function lineHeaders() {
  if (!CHANNEL_ID || !CHANNEL_SECRET) throw new Error('LINE Pay credentials are not configured');
  return {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-LINE-ChannelId': CHANNEL_ID,
    'X-LINE-ChannelSecret': CHANNEL_SECRET
  };
}

async function linePost(path, body) {
  const r = await fetch(API_BASE + path, {
    method: 'POST',
    headers: lineHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000)
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); }
  catch { data = { returnCode: String(r.status), returnMessage: text }; }
  return data;
}

function safeOrderNo(value) {
  const s = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(s)) throw new Error('Invalid orderNo');
  return s;
}

function safeAmount(value) {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  if (!Number.isInteger(n) || n <= 0 || n > 1000000) throw new Error('Invalid amount');
  return n;
}

function sheetRange(a1) {
  return "'" + ORDER_SHEET.replace(/'/g, "''") + "'!" + a1;
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

async function googleToken() {
  const r = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(10000) }
  );
  if (!r.ok) throw new Error('Google service account token unavailable');
  const data = await r.json();
  return data.access_token;
}

async function sheetsRequest(method, range, body) {
  const token = await googleToken();
  let url = 'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(SPREADSHEET_ID) + '/values/' + encodeURIComponent(range);
  if (method === 'PUT') url += '?valueInputOption=USER_ENTERED';
  const r = await fetch(url, {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!r.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : text;
    throw new Error('Google Sheets API: ' + msg);
  }
  return data;
}

async function getSheetValues(range) {
  return (await sheetsRequest('GET', range)).values || [];
}

async function putSheetValues(range, values) {
  return sheetsRequest('PUT', range, { range, majorDimension:'ROWS', values });
}

async function ensurePaymentHeaders() {
  const rows = await getSheetValues(sheetRange('1:1'));
  const headers = rows[0] || [];
  const needed = ['LINE Pay交易編號','LINE Pay付款時間'];
  for (const name of needed) {
    if (headers.indexOf(name) === -1) {
      headers.push(name);
      const c = colLetter(headers.length);
      await putSheetValues(sheetRange(c + '1'), [[name]]);
    }
  }
  return headers;
}

async function findOrder(orderNo) {
  await ensurePaymentHeaders();
  const rows = await getSheetValues(sheetRange('A:AZ'));
  if (!rows.length) throw new Error('訂單主檔沒有資料');
  const headers = rows[0].map(x => String(x || '').trim());
  const orderCol = headers.indexOf('訂單編號');
  if (orderCol < 0) throw new Error('訂單主檔缺少訂單編號欄位');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][orderCol] || '') === String(orderNo)) {
      const obj = {};
      headers.forEach((h, idx) => { if (h) obj[h] = rows[i][idx] ?? ''; });
      return { rowNumber:i + 1, headers, values:rows[i], obj };
    }
  }
  throw new Error('找不到訂單 ' + orderNo);
}

async function updateOrderFields(order, fields) {
  for (const [name, value] of Object.entries(fields)) {
    const idx = order.headers.indexOf(name);
    if (idx < 0) throw new Error('訂單主檔缺少欄位：' + name);
    const cell = colLetter(idx + 1) + order.rowNumber;
    await putSheetValues(sheetRange(cell), [[value]]);
  }
}

async function handleRequestPayment(req, res) {
  if (!PUBLIC_BASE_URL) return json(res, 503, { ok:false, error:'PUBLIC_BASE_URL is not configured' });

  const b = await readJson(req);
  const orderNo = safeOrderNo(b.orderNo);
  const order = await findOrder(orderNo);

  const paymentMethod = String(order.obj['付款方式'] || '').trim();
  if (paymentMethod !== 'LINE Pay' && paymentMethod !== '線上付款') {
    return json(res, 409, { ok:false, error:'此訂單不是 LINE Pay 付款' });
  }

  if (String(order.obj['付款狀態'] || '').trim() === '已付款') {
    return json(res, 409, { ok:false, error:'此訂單已完成付款' });
  }

  const amount = safeAmount(order.obj['總金額']);
  const confirmUrl = PUBLIC_BASE_URL + '/linepay/confirm?orderNo=' + encodeURIComponent(orderNo);
  const cancelUrl = PUBLIC_BASE_URL + '/linepay/cancel?orderNo=' + encodeURIComponent(orderNo);

  const result = await linePost('/v2/payments/request', {
    productName: '小野人餐盒 ' + orderNo,
    amount,
    currency: 'TWD',
    orderId: orderNo,
    confirmUrl,
    cancelUrl,
    capture: true,
    confirmUrlType: 'CLIENT'
  });

  if (result.returnCode !== '0000') {
    await updateOrderFields(order, { '付款狀態':'未付款' });
    return json(res, 502, {
      ok:false,
      returnCode:result.returnCode,
      returnMessage:result.returnMessage
    });
  }

  const transactionId = String(result.info && result.info.transactionId || '');
  const paymentUrl = result.info && result.info.paymentUrl && result.info.paymentUrl.web;
  if (!transactionId || !paymentUrl) {
    await updateOrderFields(order, { '付款狀態':'未付款' });
    return json(res, 502, { ok:false, error:'LINE Pay 未回傳付款網址' });
  }

  await updateOrderFields(order, {
    '付款方式':'LINE Pay',
    '付款狀態':'未付款',
    'LINE Pay交易編號':transactionId
  });

  return json(res, 200, { ok:true, orderNo, transactionId, paymentUrl });
}

async function handleConfirm(url, res) {
  const orderNo = safeOrderNo(url.searchParams.get('orderNo'));
  const transactionId = String(url.searchParams.get('transactionId') || '').trim();

  if (!/^\d{1,30}$/.test(transactionId)) {
    return redirect(res, STOREFRONT_URL + '?linepay=error&orderNo=' + encodeURIComponent(orderNo));
  }

  const order = await findOrder(orderNo);
  if (String(order.obj['付款狀態'] || '').trim() === '已付款') {
    return redirect(res, STOREFRONT_URL + '?linepay=success&orderNo=' + encodeURIComponent(orderNo));
  }

  const storedTx = String(order.obj['LINE Pay交易編號'] || '').trim();
  if (storedTx && storedTx !== transactionId) {
    return redirect(res, STOREFRONT_URL + '?linepay=error&orderNo=' + encodeURIComponent(orderNo));
  }

  const amount = safeAmount(order.obj['總金額']);
  const result = await linePost('/v2/payments/' + encodeURIComponent(transactionId) + '/confirm', {
    amount,
    currency: 'TWD'
  });

  if (result.returnCode === '0000') {
    const paidAt = new Date().toLocaleString('zh-TW', { timeZone:'Asia/Taipei', hour12:false });
    await updateOrderFields(order, {
      '付款狀態':'已付款',
      'LINE Pay交易編號':transactionId,
      'LINE Pay付款時間':paidAt
    });
    return redirect(res, STOREFRONT_URL + '?linepay=success&orderNo=' + encodeURIComponent(orderNo));
  }

  await updateOrderFields(order, { '付款狀態':'未付款' });
  return redirect(res, STOREFRONT_URL + '?linepay=error&orderNo=' + encodeURIComponent(orderNo));
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json(res, 200, {
        ok:true,
        service:'savage-linepay',
        env:LINEPAY_ENV,
        sheetsConfigured:!!SPREADSHEET_ID
      });
    }
    if (req.method === 'POST' && url.pathname === '/linepay/request') {
      return await handleRequestPayment(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/linepay/confirm') {
      return await handleConfirm(url, res);
    }
    if (req.method === 'GET' && url.pathname === '/linepay/cancel') {
      const orderNo = safeOrderNo(url.searchParams.get('orderNo'));
      try {
        const order = await findOrder(orderNo);
        if (String(order.obj['付款狀態'] || '').trim() !== '已付款') {
          await updateOrderFields(order, { '付款狀態':'未付款' });
        }
      } catch (e) {
        console.error('Cancel status update failed:', e.message);
      }
      return redirect(res, STOREFRONT_URL + '?linepay=cancel&orderNo=' + encodeURIComponent(orderNo));
    }

    return json(res, 404, { ok:false, error:'Not found' });
  } catch (err) {
    console.error(err);
    return json(res, 500, { ok:false, error:err.message || 'Internal error' });
  }
}

http.createServer(handler).listen(PORT, '0.0.0.0', () => {
  console.log('savage-linepay listening on', PORT);
});
