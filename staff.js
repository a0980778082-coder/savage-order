(() => {
  'use strict';
  const API_URL = window.SAVAGE_CONFIG.API_URL;
  const $ = id => document.getElementById(id);
  let token = sessionStorage.getItem('savage_staff_token') || '';
  let allRows = [];
  let selectedMall = '';
  let selectedPeriod = '';
  const pendingRequests = new Map();

  const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const boolTrue = v => String(v).toUpperCase() === 'TRUE' || v === true;
  const money = v => '$' + Number(v || 0).toLocaleString('zh-TW');

  function showToast(text, type = '') {
    const t = $('toast'); t.textContent = text; t.className = 'toast' + (type ? ' ' + type : ''); t.hidden = false;
    clearTimeout(t._timer); t._timer = setTimeout(() => t.hidden = true, 3000);
  }
  function showLoginResult(ok, message) {
    const d = $('loginResultDialog');
    d.classList.toggle('fail', !ok);
    $('loginResultIcon').textContent = ok ? '✓' : '!';
    $('loginResultTitle').textContent = ok ? '登入成功' : '登入失敗';
    $('loginResultMessage').textContent = message || (ok ? '正在載入今日訂單…' : '請確認帳號、密碼或網路連線後再試一次。');
    if (typeof d.showModal === 'function') d.showModal(); else alert((ok ? '登入成功：' : '登入失敗：') + $('loginResultMessage').textContent);
  }
  function setBlocking(on) { $('blocking').hidden = !on; }

  function apiPost(action, payload) {
    return new Promise((resolve, reject) => {
      const requestId = uid();
      const body = {...payload, requestId};
      const frame = document.createElement('iframe');
      frame.name = 'api_' + requestId; frame.hidden = true;
      const form = document.createElement('form');
      form.method = 'POST'; form.action = API_URL + '?action=' + encodeURIComponent(action);
      form.target = frame.name; form.hidden = true;
      const input = document.createElement('input');
      input.name = 'payload'; input.value = JSON.stringify(body); form.appendChild(input);
      document.body.append(frame, form);
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId); frame.remove(); form.remove();
        reject(new Error('連線逾時：請確認 Apps Script 已部署新版，並重新整理再試'));
      }, 30000);
      pendingRequests.set(requestId, {resolve, reject, frame, form, timer});
      form.submit();
    });
  }

  window.addEventListener('message', event => {
    const d = event.data;
    if (!d || d.source !== 'savage-order-api' || !d.requestId) return;
    const req = pendingRequests.get(d.requestId); if (!req) return;
    clearTimeout(req.timer); pendingRequests.delete(d.requestId);
    req.frame.remove(); req.form.remove();
    d.ok ? req.resolve(d) : req.reject(new Error(d.error || '操作失敗'));
  });

  async function login() {
    const username = $('username').value.trim();
    const password = $('password').value;
    if (!username || !password) {
      $('loginError').textContent = '請輸入帳號與密碼';
      showLoginResult(false, '請先完整輸入帳號與密碼。');
      return;
    }
    $('loginBtn').disabled = true; $('loginError').textContent = ''; setBlocking(true);
    try {
      const r = await apiPost('staffLogin', {username, password});
      token = r.token; sessionStorage.setItem('savage_staff_token', token);
      showStaff();
      setBlocking(false);
      showLoginResult(true, `歡迎 ${r.name || username}，正在載入今日百貨訂單。`);
      await loadOrders();
    } catch (e) {
      const msg = e && e.message ? e.message : '登入失敗，請稍後再試';
      $('loginError').textContent = msg;
      showLoginResult(false, msg);
    } finally { $('loginBtn').disabled = false; setBlocking(false); }
  }

  function logout() {
    token = ''; sessionStorage.removeItem('savage_staff_token');
    $('staffView').hidden = true; $('loginView').hidden = false;
  }
  function showStaff() { $('loginView').hidden = true; $('staffView').hidden = false; }

  async function loadOrders() {
    if (!token) return;
    $('loading').hidden = false; $('refreshBtn').disabled = true;
    try {
      // 後端只負責抓今天全部訂單，篩選由手機端即時完成，切換更快。
      const r = await apiPost('staffOrders', {token, filters:{today:true}});
      allRows = r.rows || [];
      renderMallChips(); render();
      $('lastUpdated').textContent = '更新：' + new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
    } catch (e) {
      if (/登入已逾時|權限/.test(e.message)) { logout(); $('loginError').textContent = '登入已逾時，請重新登入'; }
      else showToast(e.message);
    } finally { $('loading').hidden = true; $('refreshBtn').disabled = false; }
  }

  function renderMallChips() {
    const malls = [...new Set(allRows.map(r => r['百貨']).filter(Boolean))];
    if (selectedMall && !malls.includes(selectedMall)) selectedMall = '';
    $('mallChips').innerHTML = [`<button class="chip ${selectedMall===''?'active':''}" data-mall="">全部百貨</button>`]
      .concat(malls.map(m => `<button class="chip ${m===selectedMall?'active':''}" data-mall="${esc(m)}">${esc(m)}</button>`)).join('');
  }

  function filteredRows() {
    const q = $('searchInput').value.trim().toLowerCase();
    const mode = $('modeFilter').value;
    return allRows.filter(o => {
      const keyed = boolTrue(o['POS已Key']);
      if (mode === 'pending' && keyed) return false;
      if (mode === 'keyed' && !keyed) return false;
      if (selectedMall && o['百貨'] !== selectedMall) return false;
      if (selectedPeriod && o['餐期'] !== selectedPeriod) return false;
      if (q) {
        const hay = [o['櫃位/品牌'],o['聯絡人姓名'],o['聯絡電話'],o['訂單編號'],o['百貨'],o['館別'],o['樓層'],...(o.items||[]).map(i=>i['品項'])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function render() {
    const rows = filteredRows();
    $('pendingCount').textContent = allRows.filter(o => !boolTrue(o['POS已Key'])).length;
    $('keyedCount').textContent = allRows.filter(o => boolTrue(o['POS已Key'])).length;
    $('orderCount').textContent = rows.length;
    $('totalAmount').textContent = money(rows.reduce((s,o)=>s+Number(o['總金額']||0),0));
    document.querySelectorAll('[data-mode-shortcut]').forEach(b => b.classList.toggle('active', b.dataset.modeShortcut === $('modeFilter').value));
    if (!rows.length) { $('orderList').innerHTML = '<div class="empty">目前沒有符合條件的訂單</div>'; return; }
    const groups = new Map();
    rows.forEach(o => {
      const key = [o['百貨'],o['館別'],o['樓層']].filter(Boolean).join('｜');
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o);
    });
    $('orderList').innerHTML = [...groups.entries()].map(([key,list]) =>
      `<section class="floor-group"><div class="floor-title">${esc(key)}｜${list.length} 筆</div>${list.map(orderCard).join('')}</section>`
    ).join('');
  }

  function orderCard(o) {
    const done = boolTrue(o['POS已Key']);
    const items = (o.items || []).map(i => `<div class="item"><div><div class="item-name">${esc(i['品項'])}</div>${i['飯量/客製']?`<div class="custom">${esc(i['飯量/客製'])}</div>`:''}</div><div class="qty">×${esc(i['數量'])}</div></div>`).join('');
    return `<article class="order-card ${done?'done':''}">
      <div class="order-top"><div><div class="counter">${esc(o['櫃位/品牌'])}</div><div class="meta">${esc(o['餐期'])}｜${esc(o['訂單編號'])}</div></div><div class="amount">${money(o['總金額'])}<div class="payment">${esc(o['付款方式'])}</div></div></div>
      <div class="contact"><b>${esc(o['聯絡人姓名'])}</b>｜<a href="tel:${esc(o['聯絡電話'])}">${esc(o['聯絡電話'])}</a></div>
      <div class="invoice">發票：${esc(o['發票方式'])}${o['發票載具']?`<br>載具：<b>${esc(o['發票載具'])}</b>`:''}</div>
      <div class="items">${items || '<div class="item">尚無餐點明細</div>'}</div>
      <div class="note">備註：${esc(o['訂單備註']||'無')}</div>
      <div class="actions"><select data-status="${esc(o['訂單編號'])}">${['新訂單','製作中','已完成','已送達'].map(s=>`<option ${s===o['訂單狀態']?'selected':''}>${s}</option>`).join('')}</select><button class="key-btn ${done?'cancel':''}" data-key="${esc(o['訂單編號'])}" data-value="${done?'false':'true'}">${done?'取消已 Key':'✓ 完成 Key 單'}</button></div>
    </article>`;
  }

  async function update(no, status, posKeyed) {
    setBlocking(true);
    try { await apiPost('updateOrderStatus',{token,orderNo:no,status,posKeyed}); showToast(posKeyed===true?'已完成 Key 單':'已更新'); await loadOrders(); }
    catch(e) { showToast(e.message); }
    finally { setBlocking(false); }
  }

  $('loginBtn').addEventListener('click', login);
  $('loginResultBtn').addEventListener('click', () => $('loginResultDialog').close());
  $('password').addEventListener('keydown', e => { if(e.key === 'Enter') login(); });
  $('logoutBtn').addEventListener('click', logout);
  $('refreshBtn').addEventListener('click', loadOrders);
  $('searchInput').addEventListener('input', render);
  $('modeFilter').addEventListener('change', render);
  $('mallChips').addEventListener('click', e => { const b=e.target.closest('[data-mall]'); if(!b)return; selectedMall=b.dataset.mall; renderMallChips(); render(); });
  document.querySelector('.period-tabs').addEventListener('click', e => { const b=e.target.closest('[data-period]'); if(!b)return; selectedPeriod=b.dataset.period; document.querySelectorAll('.period').forEach(x=>x.classList.toggle('active',x===b)); render(); });
  document.querySelector('.stats').addEventListener('click', e => { const b=e.target.closest('[data-mode-shortcut]'); if(!b)return; $('modeFilter').value=b.dataset.modeShortcut; render(); });
  $('orderList').addEventListener('change', e => { if(e.target.matches('[data-status]')) update(e.target.dataset.status,e.target.value,null); });
  $('orderList').addEventListener('click', e => { const b=e.target.closest('[data-key]'); if(b) update(b.dataset.key,null,b.dataset.value==='true'); });

  if (token) { showStaff(); loadOrders(); }
  setInterval(() => { if(token && !document.hidden) loadOrders(); }, 30000);
})();
