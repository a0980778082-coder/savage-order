'use strict';

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const CHANNEL_ID = process.env.LINEPAY_CHANNEL_ID || '';
const CHANNEL_SECRET = process.env.LINEPAY_CHANNEL_SECRET || '';
const LINEPAY_ENV = (process.env.LINEPAY_ENV || 'PRODUCTION').toUpperCase();
const STOREFRONT_URL = process.env.STOREFRONT_URL || 'https://a0980778082-coder.github.io/savage-order/';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const BACKEND_NOTIFY_URL = process.env.BACKEND_NOTIFY_URL || '';
const BACKEND_NOTIFY_TOKEN = process.env.BACKEND_NOTIFY_TOKEN || '';

const API_BASE = LINEPAY_ENV === 'SANDBOX'
  ? 'https://sandbox-api-pay.line.me'
  : 'https://api-pay.line.me';

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': STOREFRONT_URL.replace(/\/$/, ''),
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
  try { data = JSON.parse(text); } catch { data = { returnCode: String(r.status), returnMessage: text }; }
  return data;
}

function safeOrderNo(value) {
  const s = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(s)) throw new Error('Invalid orderNo');
  return s;
}

function safeAmount(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 1000000) throw new Error('Invalid amount');
  return n;
}

async function notifyBackend(payload) {
  if (!BACKEND_NOTIFY_URL) return;
  const headers = { 'Content-Type': 'application/json' };
  if (BACKEND_NOTIFY_TOKEN) headers['X-Savage-Token'] = BACKEND_NOTIFY_TOKEN;
  try {
    await fetch(BACKEND_NOTIFY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    console.error('Backend notify failed:', err.message);
  }
}

async function handleRequestPayment(req, res) {
  if (!PUBLIC_BASE_URL) return json(res, 503, { ok:false, error:'PUBLIC_BASE_URL is not configured' });

  const b = await readJson(req);
  const orderNo = safeOrderNo(b.orderNo);
  const amount = safeAmount(b.amount);

  const confirmUrl = PUBLIC_BASE_URL + '/linepay/confirm?orderNo=' + encodeURIComponent(orderNo) + '&amount=' + amount;
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
    return json(res, 502, { ok:false, returnCode:result.returnCode, returnMessage:result.returnMessage });
  }

  const transactionId = String(result.info && result.info.transactionId || '');
  const paymentUrl = result.info && result.info.paymentUrl && result.info.paymentUrl.web;
  await notifyBackend({ action:'linePayReserved', orderNo, amount, transactionId });

  return json(res, 200, { ok:true, orderNo, transactionId, paymentUrl });
}

async function handleConfirm(url, res) {
  const orderNo = safeOrderNo(url.searchParams.get('orderNo'));
  const amount = safeAmount(url.searchParams.get('amount'));
  const transactionId = String(url.searchParams.get('transactionId') || '').trim();

  if (!/^\d{1,30}$/.test(transactionId)) {
    return redirect(res, STOREFRONT_URL + '?linepay=error&orderNo=' + encodeURIComponent(orderNo));
  }

  const result = await linePost('/v2/payments/' + encodeURIComponent(transactionId) + '/confirm', {
    amount,
    currency: 'TWD'
  });

  if (result.returnCode === '0000') {
    await notifyBackend({ action:'linePayPaid', orderNo, amount, transactionId, paidAt:new Date().toISOString() });
    return redirect(res, STOREFRONT_URL + '?linepay=success&orderNo=' + encodeURIComponent(orderNo));
  }

  await notifyBackend({ action:'linePayFailed', orderNo, amount, transactionId, returnCode:result.returnCode, returnMessage:result.returnMessage });
  return redirect(res, STOREFRONT_URL + '?linepay=error&orderNo=' + encodeURIComponent(orderNo));
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json(res, 200, { ok:true, service:'savage-linepay', env:LINEPAY_ENV });
    }
    if (req.method === 'POST' && url.pathname === '/linepay/request') {
      return await handleRequestPayment(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/linepay/confirm') {
      return await handleConfirm(url, res);
    }
    if (req.method === 'GET' && url.pathname === '/linepay/cancel') {
      const orderNo = safeOrderNo(url.searchParams.get('orderNo'));
      await notifyBackend({ action:'linePayCancelled', orderNo });
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
