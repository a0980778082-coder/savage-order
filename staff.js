(() => {
  'use strict';
  const API_URL = window.SAVAGE_CONFIG.API_URL;
  const $ = id => document.getElementById(id);
  let token = sessionStorage.getItem('savage_staff_token') || '';
  let allRows = [];
  let selectedMall = '';
  let selectedPeriod = '';
  let inventoryRows = [];
  let selectedDeliveryDate = '';
  let focusMode = localStorage.getItem('savage_focus_mode') !== 'false';
  let focusIndex = 0;
  let initialOrdersLoaded = false;
  let knownOrderNos = new Set();
  let swRegistration = null;
  let businessSettings = {};
  const pendingRequests = new Map();

  const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const boolTrue = v => String(v).toUpperCase() === 'TRUE' || v === true;
  const money = v => '$' + Number(v || 0).toLocaleString('zh-TW');


  async function registerServiceWorker(){
    if(!('serviceWorker' in navigator)) return null;
    try{swRegistration=await navigator.serviceWorker.register('./sw.js?v=390');return swRegistration;}catch(e){console.warn('Service worker registration failed',e);return null;}
  }
  function updateNotifyButton(){
    const b=$('notifyBtn'); if(!b)return;
    if(!('Notification' in window)){b.textContent='不支援通知';b.disabled=true;return;}
    b.classList.toggle('enabled',Notification.permission==='granted');
    b.classList.toggle('denied',Notification.permission==='denied');
    b.textContent=Notification.permission==='granted'?'通知已開啟':(Notification.permission==='denied'?'通知被封鎖':'開啟通知');
  }
  async function enableNotifications(){
    if(!('Notification' in window)){showToast('這台裝置不支援瀏覽器通知','error');return;}
    const result=await Notification.requestPermission(); updateNotifyButton();
    if(result==='granted'){
      await registerServiceWorker();
      await showSystemNotification('小野人通知已開啟','新訂單會在手機上提醒你。','notification-test');
      showToast('手機通知已開啟','success');
    }else showToast('請到瀏覽器設定允許通知','error');
  }
  async function showSystemNotification(title,body,tag){
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    const reg=swRegistration||await registerServiceWorker();
    const options={body,tag:tag||'savage-order',renotify:true,vibrate:[250,120,250],icon:'./icon-192.svg',badge:'./icon-192.svg',data:{url:location.href}};
    if(reg&&reg.showNotification) await reg.showNotification(title,options); else new Notification(title,options);
  }
  function announceNewOrders(rows){
    const pending=rows.filter(o=>!boolTrue(o['POS已Key']));
    const current=new Set(pending.map(o=>String(o['訂單編號'])));
    if(initialOrdersLoaded){
      const fresh=pending.filter(o=>!knownOrderNos.has(String(o['訂單編號'])));
      fresh.forEach(o=>showSystemNotification('🔔 新訂單｜'+(o['櫃位/品牌']||'百貨櫃位'),`${o['送餐日期']||''} ${o['餐期']||''}｜${(o.items||[]).map(i=>i['品項']+'×'+i['數量']).join('、')}`,'order-'+o['訂單編號']));
      if(fresh.length){showToast(`收到 ${fresh.length} 筆新訂單`,'success');if(navigator.vibrate)navigator.vibrate([250,120,250]);}
    }
    knownOrderNos=current; initialOrdersLoaded=true;
  }
  function applyFocusMode(){
    document.body.classList.toggle('focus-mode',focusMode);
    $('focusModeBtn').textContent=focusMode?'一般模式':'專注模式';
    localStorage.setItem('savage_focus_mode',String(focusMode));
    focusIndex=0;render();
  }

  function localDateValue(date){
    const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  function shiftSelectedDate(days){
    const base=new Date((selectedDeliveryDate||localDateValue(new Date()))+'T00:00:00');
    base.setDate(base.getDate()+days);
    selectedDeliveryDate=localDateValue(base);$('staffDeliveryDate').value=selectedDeliveryDate;loadOrders();
  }

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
      frame.name = 'api_' + requestId;
      frame.id = frame.name;
      frame.setAttribute('aria-hidden', 'true');
      frame.style.position = 'fixed';
      frame.style.width = '1px';
      frame.style.height = '1px';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      frame.style.border = '0';

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = API_URL + '?action=' + encodeURIComponent(action) + '&_=' + Date.now();
      form.target = frame.name;
      form.acceptCharset = 'UTF-8';
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify(body);
      form.appendChild(input);

      document.body.appendChild(frame);
      document.body.appendChild(form);

      const cleanup = () => {
        pendingRequests.delete(requestId);
        try { frame.remove(); } catch (_) {}
        try { form.remove(); } catch (_) {}
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('連線逾時：員工登入請求未收到回覆，請重新整理後再試'));
      }, 20000);

      pendingRequests.set(requestId, {resolve, reject, frame, form, timer, cleanup});

      // 等 iframe 真正建立完成後再送出，避免 Chrome / iPhone 內建瀏覽器忽略隱藏目標。
      requestAnimationFrame(() => {
        try {
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.submit();
        } catch (err) {
          clearTimeout(timer);
          cleanup();
          reject(new Error('無法送出登入請求：' + (err && err.message ? err.message : err)));
        }
      });
    });
  }

  window.addEventListener('message', event => {
    let d = event.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (ignore) {} }
    if (!d || d.source !== 'savage-order-api' || !d.requestId) return;
    const req = pendingRequests.get(d.requestId); if (!req) return;
    clearTimeout(req.timer); pendingRequests.delete(d.requestId);
    if (req.cleanup) req.cleanup(); else { req.frame.remove(); req.form.remove(); }
    d.ok ? req.resolve(d) : req.reject(new Error(d.error || '操作失敗'));
  });


  function looksLikeFloor(value) {
    const v = String(value || '').trim().toUpperCase();
    return /^(B\d+|\d+F|RF|R|頂樓|地下\d+樓|\d+樓)$/.test(v);
  }
  function normalizeOrderRows(rows) {
    return rows.map(row => {
      const copy = {...row};
      const building = String(copy['館別'] || '').trim();
      const floor = String(copy['樓層'] || '').trim();
      if (looksLikeFloor(building) && floor && !looksLikeFloor(floor)) {
        copy['館別'] = floor;
        copy['樓層'] = building;
      }
      return copy;
    });
  }

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
      const r = await apiPost('staffOrders', {token, filters:{deliveryDate:selectedDeliveryDate||localDateValue(new Date())}});
      allRows = normalizeOrderRows(r.rows || []);
      announceNewOrders(allRows);
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
        const hay = [o['櫃位/品牌'],o['聯絡人姓名'],o['聯絡電話'],o['訂單編號'],o['百貨'],o['館別'],o['樓層'],o['LINE 顯示名稱'],o['LINE User ID'],...(o.items||[]).map(i=>i['品項'])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function render() {
    let rows = filteredRows();
    $('pendingCount').textContent = allRows.filter(o => !boolTrue(o['POS已Key'])).length;
    $('keyedCount').textContent = allRows.filter(o => boolTrue(o['POS已Key'])).length;
    $('orderCount').textContent = rows.length;
    $('totalAmount').textContent = money(rows.reduce((s,o)=>s+Number(o['總金額']||0),0));
    document.querySelectorAll('[data-mode-shortcut]').forEach(b => b.classList.toggle('active', b.dataset.modeShortcut === $('modeFilter').value));
    if (!rows.length) { $('focusNav').hidden=true;$('orderList').innerHTML = '<div class="empty">目前沒有符合條件的訂單</div>'; return; }
    if(focusMode){
      focusIndex=Math.max(0,Math.min(focusIndex,rows.length-1));
      const o=rows[focusIndex], key=[o['百貨'],o['館別'],o['樓層']].filter(Boolean).join('｜');
      $('focusNav').hidden=rows.length<2;$('focusPosition').textContent=`${focusIndex+1} / ${rows.length}`;
      $('prevOrderBtn').disabled=focusIndex<=0;$('nextOrderBtn').disabled=focusIndex>=rows.length-1;
      $('orderList').innerHTML=`<section class="floor-group"><div class="floor-title">${esc(key)}｜專注 Key 單</div>${orderCard(o)}</section>`;
      return;
    }
    $('focusNav').hidden=true;
    const groups = new Map();
    rows.forEach(o => { const key = [o['百貨'],o['館別'],o['樓層']].filter(Boolean).join('｜'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o); });
    $('orderList').innerHTML = [...groups.entries()].map(([key,list]) =>
      `<section class="floor-group"><div class="floor-title">${esc(key)}｜${list.length} 筆</div>${list.map(orderCard).join('')}</section>`
    ).join('');
  }

  function orderCard(o) {
    const done = boolTrue(o['POS已Key']);
    const cancelled=String(o['訂單狀態']||'').includes('取消');
    const deliveryDate=esc(o['送餐日期']||'未設定');
    const location=[o['百貨'],o['館別'],o['樓層']].filter(Boolean).join('｜');
    const items = (o.items || []).map(i => `<div class="item"><div><div class="item-name">${esc(i['品項'])}</div>${i['飯量/客製']?`<div class="custom">⚠ ${esc(i['飯量/客製'])}</div>`:''}</div><div class="qty">×${esc(i['數量'])}</div></div>`).join('');
    return `<article class="order-card ${done?'done':''} ${cancelled?'cancelled':''}" data-order-card="${esc(o['訂單編號'])}">
      <div><span class="delivery-badge">📅 ${deliveryDate} ${esc(o['餐期'])}</span><span class="location-badge">🏬 ${esc(location)}</span></div>
      <div class="order-top"><div><div class="counter">${esc(o['櫃位/品牌'])}</div><div class="meta">訂單：${esc(o['訂單編號'])}</div></div><div class="amount">${money(o['總金額'])}<div class="payment">${esc(o['付款方式'])}${o['付款狀態']?`｜${esc(o['付款狀態'])}`:''}</div></div></div>
      <div class="contact"><b>${esc(o['聯絡人姓名'])}</b>｜<a href="tel:${esc(o['聯絡電話'])}">${esc(o['聯絡電話'])}</a></div>
      <div class="line-identity ${o['LINE User ID']?'verified':'missing'}">
        <span>${o['LINE User ID']?'✅ LINE 已驗證':'⚠ 未綁定 LINE'}</span>
        ${o['LINE User ID']?`<strong>${esc(o['LINE 顯示名稱']||'LINE 使用者')}</strong><small>ID：${esc(o['LINE User ID'])}</small>`:''}
      </div>
      <div class="invoice">發票：${esc(o['發票方式'])}${o['發票載具']?`<br>載具：<b>${esc(o['發票載具'])}</b>`:''}</div>
      ${o['付款方式']==='LINE Pay'?`<div class="linepay-check"><div><span>LINE Pay 後三碼</span><strong>${esc(o['LINE Pay後三碼']||'未填')}</strong></div><div class="payment-state ${o['付款狀態']==='已付款'?'paid':''}">${esc(o['付款狀態']||'待核對')}</div>${o['付款狀態']==='已付款'?`<button class="payment-btn undo" data-payment="${esc(o['訂單編號'])}" data-payment-status="待核對">改回待核對</button>`:`<button class="payment-btn" data-payment="${esc(o['訂單編號'])}" data-payment-status="已付款">✓ 確認已付款</button>`}</div>`:''}
      <div class="items">${items || '<div class="item">尚無餐點明細</div>'}</div>
      <div class="note">⚠ 備註：${esc(o['訂單備註']||'無')}</div>
      <div class="actions"><select data-status="${esc(o['訂單編號'])}" ${cancelled?'disabled':''}>${['新訂單','製作中','已完成','已送達','客人取消','店家取消'].map(s=>`<option ${s===o['訂單狀態']?'selected':''}>${s}</option>`).join('')}</select><button class="key-btn ${done?'cancel':''}" data-key="${esc(o['訂單編號'])}" data-value="${done?'false':'true'}" ${cancelled?'disabled':''}>${done?'取消已 Key':'✓ 完成 Key 單'}</button>${cancelled?'':`<button class="cancel-order-btn" data-cancel-order="${esc(o['訂單編號'])}">取消訂單</button>`}</div>
    </article>`;
  }

  async function update(no, status, posKeyed) {
    setBlocking(true);
    try { await apiPost('updateOrderStatus',{token,orderNo:no,status,posKeyed}); showToast(posKeyed===true?'已完成 Key 單':'已更新'); await loadOrders(); }
    catch(e) { showToast(e.message); }
    finally { setBlocking(false); }
  }

  async function cancelOrderByStaff(no){
    const reason=prompt('請輸入取消原因（例如：客人日期選錯、重複下單）','客人來電取消');
    if(reason===null)return;
    if(!confirm('確定取消訂單 '+no+'？取消後會保留紀錄並自動回補限量庫存。'))return;
    setBlocking(true);
    try{const r=await apiPost('staffCancelOrder',{token,orderNo:no,reason:reason||'店家取消'});showToast(r.refundPending?'已取消，LINE Pay 已標示待退款':'訂單已取消','success');await loadOrders();}
    catch(e){showToast(e.message,'error')}finally{setBlocking(false)}
  }

  async function updatePayment(no, paymentStatus) {
    setBlocking(true);
    try {
      await apiPost('updatePaymentStatus',{token,orderNo:no,paymentStatus});
      showToast(paymentStatus==='已付款'?'已確認 LINE Pay 付款':'已改回待核對','success');
      await loadOrders();
    } catch(e) { showToast(e.message,'error'); }
    finally { setBlocking(false); }
  }



  // ===== V39 智慧配送 =====
  let deliverySession=null,geoWatchId=null,mallGeoRows=[];
  function haversineMeters(a,b,c,d){const R=6371000,rad=x=>x*Math.PI/180,dp=rad(c-a),dl=rad(d-b),q=Math.sin(dp/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
  async function openDelivery(){
    $('deliveryDialog').showModal();
    try{
      const [r,pd]=await Promise.all([
        apiPost('deliveryConfigGet',{token}),
        jsonp('publicData').catch(()=>null)
      ]);
      mallGeoRows=r.rows||[];
      if(pd&&pd.ok!==false) window.__PUBLIC_DATA__=pd;
      renderDeliveryMallOptions();
      if($('deliveryMall').options.length<=1) showToast('目前找不到百貨資料，請先確認後台已有百貨設定','error');
    }catch(e){showToast(e.message,'error')}
  }
  function renderDeliveryMallOptions(){
    // V39.1：百貨選單不能依賴「今天有沒有訂單」。
    // 優先從系統既有 publicData/malls 取得，再合併目前訂單與已儲存 GPS 的百貨。
    const fromPublic=[];
    const pd=window.__PUBLIC_DATA__||window.publicData||state?.publicData||{};
    const rawMalls=pd.malls||pd.mallOptions||pd.mallList||[];
    if(Array.isArray(rawMalls)){
      rawMalls.forEach(m=>{
        if(typeof m==='string') fromPublic.push(m);
        else if(m&&typeof m==='object') fromPublic.push(String(m.name||m.mall||m['百貨']||''));
      });
    }
    // 現有員工頁若已經有百貨篩選選項，也一起收進來。
    const mallSelect=document.getElementById('mallFilter')||document.getElementById('mallSelect');
    if(mallSelect) [...mallSelect.options].forEach(o=>{if(o.value)fromPublic.push(o.value)});
    const fromOrders=[...new Set(allRows.map(x=>String(x['百貨']||'')).filter(Boolean))];
    const known=mallGeoRows.map(x=>String(x.mall||'')).filter(Boolean);
    const malls=[...new Set([...fromPublic,...fromOrders,...known].map(x=>String(x||'').trim()).filter(Boolean))].sort();
    $('deliveryMall').innerHTML='<option value="">請選擇百貨</option>'+malls.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    if(selectedMall&&[...$('deliveryMall').options].some(o=>o.value===selectedMall))$('deliveryMall').value=selectedMall;
    fillMallGeo();
  }
  function fillMallGeo(){const m=$('deliveryMall').value,r=mallGeoRows.find(x=>x.mall===m)||{};$('mallLat').value=r.lat??'';$('mallLng').value=r.lng??'';$('mallRadius').value=r.radius||150;}
  async function saveMallGeo(){
    const mall=$('deliveryMall').value,lat=Number($('mallLat').value),lng=Number($('mallLng').value),radius=Number($('mallRadius').value||150);
    if(!mall||!Number.isFinite(lat)||!Number.isFinite(lng)){showToast('請選百貨並填入正確座標','error');return}
    try{await apiPost('deliveryConfigSave',{token,mall,lat,lng,radius});showToast('百貨座標已儲存','success');const r=await apiPost('deliveryConfigGet',{token});mallGeoRows=r.rows||[];}catch(e){showToast(e.message,'error')}
  }
  function useCurrentLocation(){if(!navigator.geolocation){showToast('此裝置不支援定位','error');return}navigator.geolocation.getCurrentPosition(p=>{$('mallLat').value=p.coords.latitude.toFixed(6);$('mallLng').value=p.coords.longitude.toFixed(6);showToast('已帶入目前位置','success')},e=>showToast('無法取得位置：'+e.message,'error'),{enableHighAccuracy:true,timeout:12000});}
  async function startDelivery(){
    const mall=$('deliveryMall').value;if(!mall){showToast('請先選擇配送百貨','error');return}
    const cfg=mallGeoRows.find(x=>x.mall===mall);if(!cfg){showToast('請先儲存這家百貨的 GPS 座標','error');return}
    try{deliverySession=await apiPost('deliveryStart',{token,mall,deliveryDate:selectedDeliveryDate||localDateValue(new Date())});$('startDeliveryBtn').hidden=true;$('arrivedDeliveryBtn').hidden=false;$('finishDeliveryBtn').hidden=false;updateDeliveryState('配送中','正在前往 '+mall+'，GPS 定位已啟動。');startGeoWatch(cfg);await loadOrders();}catch(e){showToast(e.message,'error')}
  }
  function startGeoWatch(cfg){
    if(!navigator.geolocation){showToast('此裝置不支援 GPS，請使用手動抵達','error');return}
    if(geoWatchId!==null)navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId=navigator.geolocation.watchPosition(async p=>{if(!deliverySession)return;const dist=Math.round(haversineMeters(p.coords.latitude,p.coords.longitude,Number(cfg.lat),Number(cfg.lng)));updateDeliveryState(dist<=Number(cfg.radius)?'已進入抵達範圍':'配送中',`距離 ${deliverySession.mall} 約 ${dist} 公尺`);if(dist<=Number(cfg.radius)&&!deliverySession.arrived){try{await markArrived(true)}catch(e){console.warn(e)}}},e=>updateDeliveryState('GPS 定位中斷','可使用「我已抵達百貨」手動確認。'),{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  }
  function updateDeliveryState(title,text){$('deliveryState').innerHTML=`<strong>${esc(title)}</strong><span>${esc(text)}</span>`;$('deliveryState').classList.toggle('arrived',title.includes('抵達'));}
  async function markArrived(auto=false){if(!deliverySession)return;const r=await apiPost('deliveryArrive',{token,tripId:deliverySession.tripId});deliverySession.arrived=true;updateDeliveryState('📍 已抵達百貨',auto?'GPS 已自動判定抵達，開始送餐。':'已手動確認抵達，開始送餐。');$('arrivedDeliveryBtn').hidden=true;showToast('客人訂單已顯示「已抵達百貨」','success');await loadOrders();return r;}
  async function finishDelivery(){if(!deliverySession)return;if(!confirm('確定完成這一趟配送？'))return;try{await apiPost('deliveryFinish',{token,tripId:deliverySession.tripId});if(geoWatchId!==null)navigator.geolocation.clearWatch(geoWatchId);geoWatchId=null;deliverySession=null;$('startDeliveryBtn').hidden=false;$('arrivedDeliveryBtn').hidden=true;$('finishDeliveryBtn').hidden=true;updateDeliveryState('配送完成','本趟配送已結束。');await loadOrders();}catch(e){showToast(e.message,'error')}}

  function checkedValue(id){return $(id).checked?'TRUE':'FALSE'}
  function businessDefaults(status){
    return {
      OPEN:['正常營業','目前正常接受訂單。'],
      LUNCH_CLOSED:['今日午餐暫停接單','今日午餐時段暫停供應，晚餐仍可正常預訂。'],
      DINNER_CLOSED:['今日晚餐暫停接單','今日晚餐時段暫停供應，午餐仍可正常預訂。'],
      CLOSED:['今日店休','今日暫停供應餐點，造成不便敬請見諒。'],
      ANNOUNCEMENT:['最新公告','請留意本店最新公告。']
    }[status]||['系統公告',''];
  }
  function renderBusinessPreview(){
    const status=$('businessStatus').value;
    const defaults=businessDefaults(status);
    const title=$('noticeTitle').value.trim()||defaults[0];
    const msg=$('noticeMessage').value.trim()||defaults[1];
    $('businessPreview').classList.toggle('closed',['CLOSED','LUNCH_CLOSED','DINNER_CLOSED'].includes(status));
    $('businessPreview').innerHTML=`<strong>${esc(title)}</strong><span>${esc(msg)}</span>`;
  }
  function fillBusinessForm(data){
    businessSettings=data||{};
    $('businessStatus').value=businessSettings['營業狀態']||'OPEN';
    $('noticeStartDate').value=String(businessSettings['公告開始日期']||'').slice(0,10);
    $('noticeEndDate').value=String(businessSettings['公告結束日期']||'').slice(0,10);
    $('noticeTitle').value=businessSettings['公告標題']||'';
    $('noticeMessage').value=businessSettings['公告內容']||'';
    $('noticeEnabled').checked=String(businessSettings['公告啟用']).toUpperCase()==='TRUE';
    $('noticePopup').checked=String(businessSettings['公告彈窗']).toUpperCase()==='TRUE';
    $('noticeMarquee').checked=String(businessSettings['公告跑馬燈']).toUpperCase()==='TRUE';
    renderBusinessPreview();
  }
  async function openBusiness(){
    setBlocking(true);
    try{
      const r=await apiPost('businessSettingsGet',{token});
      fillBusinessForm(r.settings||{});
      $('businessDialog').showModal();
    }catch(e){showToast(e.message,'error')}
    finally{setBlocking(false)}
  }
  async function saveBusiness(){
    const start=$('noticeStartDate').value,end=$('noticeEndDate').value;
    if(start&&end&&end<start){showToast('公告結束日期不能早於開始日期','error');return}
    const status=$('businessStatus').value,defaults=businessDefaults(status);
    const settings={
      '營業狀態':status,
      '公告開始日期':start,
      '公告結束日期':end,
      '公告標題':$('noticeTitle').value.trim()||defaults[0],
      '公告內容':$('noticeMessage').value.trim()||defaults[1],
      '公告啟用':checkedValue('noticeEnabled'),
      '公告彈窗':checkedValue('noticePopup'),
      '公告跑馬燈':checkedValue('noticeMarquee')
    };
    setBlocking(true);
    try{
      const r=await apiPost('businessSettingsUpdate',{token,settings});
      businessSettings=r.settings||settings;
      fillBusinessForm(businessSettings);
      showToast('營業狀態與公告已更新','success');
    }catch(e){showToast(e.message,'error')}
    finally{setBlocking(false)}
  }

  async function openInventory(){
    $('inventoryDialog').showModal();$('inventoryList').innerHTML='<div class="loading">載入商品中…</div>';
    try{const r=await apiPost('inventoryList',{token});inventoryRows=r.rows||[];renderInventory();}catch(e){showToast(e.message,'error')}
  }
  function renderInventory(){
    const q=$('inventorySearch').value.trim().toLowerCase(),rows=inventoryRows.filter(x=>!q||[x.name,x.category].join(' ').toLowerCase().includes(q));
    $('inventoryList').innerHTML=rows.map(x=>`<article class="inventory-card ${x.soldOut?'sold':''}" data-inventory="${esc(x.name)}"><div class="inventory-title"><span>${esc(x.name)}</span><span>${x.enabled?(x.soldOut?'今日售完':'販售中'):'已停售'}</span></div><div class="inventory-meta">${esc(x.category)}｜$${x.price}${x.limited?'｜限量商品':'｜一般商品'}</div>${x.limited?`<div class="stock-step"><button data-stock-delta="-1">−</button><strong>${x.stock}</strong><button data-stock-delta="1">＋</button></div>`:''}<div class="inventory-actions"><button class="${x.enabled?'danger':'ok'}" data-toggle-enabled>${x.enabled?'停止販售':'恢復販售'}</button><button class="${x.soldOut?'ok':'danger'}" data-toggle-sold>${x.soldOut?'取消售完':'設為售完'}</button>${x.limited?'<button class="neutral" data-stock-set="10">補到10份</button><button class="neutral" data-stock-set="20">補到20份</button>':''}</div></article>`).join('')||'<div class="empty">找不到商品</div>';
  }
  async function inventoryChange(name,changes){setBlocking(true);try{await apiPost('inventoryUpdate',{token,itemName:name,changes});const r=await apiPost('inventoryList',{token});inventoryRows=r.rows||[];renderInventory();showToast('商品已更新','success')}catch(e){showToast(e.message,'error')}finally{setBlocking(false)}}

  $('loginBtn').addEventListener('click', login);
  $('loginResultBtn').addEventListener('click', () => $('loginResultDialog').close());
  $('password').addEventListener('keydown', e => { if(e.key === 'Enter') login(); });
  $('logoutBtn').addEventListener('click', logout);
  $('refreshBtn').addEventListener('click', loadOrders);
  $('notifyBtn').addEventListener('click',enableNotifications);
  $('focusModeBtn').addEventListener('click',()=>{focusMode=!focusMode;applyFocusMode();});
  $('prevOrderBtn').addEventListener('click',()=>{if(focusIndex>0){focusIndex--;render();window.scrollTo({top:0,behavior:'smooth'});}});
  $('nextOrderBtn').addEventListener('click',()=>{const rows=filteredRows();if(focusIndex<rows.length-1){focusIndex++;render();window.scrollTo({top:0,behavior:'smooth'});}});
  $('businessBtn').addEventListener('click',openBusiness);
  $('closeBusinessBtn').addEventListener('click',()=>$('businessDialog').close());
  $('saveBusinessBtn').addEventListener('click',saveBusiness);
  ['businessStatus','noticeStartDate','noticeEndDate','noticeTitle','noticeMessage','noticeEnabled','noticePopup','noticeMarquee'].forEach(id=>$(id).addEventListener(id.startsWith('notice')&&['noticeTitle','noticeMessage'].includes(id)?'input':'change',renderBusinessPreview));
  $('inventoryBtn').addEventListener('click',openInventory);$('closeInventoryBtn').addEventListener('click',()=>$('inventoryDialog').close());$('inventorySearch').addEventListener('input',renderInventory);$('restockAllBtn').addEventListener('click',async()=>{if(!confirm('確定要把所有限量品補回預設庫存？'))return;setBlocking(true);try{await apiPost('inventoryRestockAll',{token});const r=await apiPost('inventoryList',{token});inventoryRows=r.rows||[];renderInventory();showToast('已完成一鍵補貨','success')}catch(e){showToast(e.message,'error')}finally{setBlocking(false)}});$('inventoryList').addEventListener('click',e=>{const card=e.target.closest('[data-inventory]');if(!card)return;const name=card.dataset.inventory,item=inventoryRows.find(x=>x.name===name);if(!item)return;if(e.target.closest('[data-toggle-enabled]'))inventoryChange(name,{enabled:!item.enabled});else if(e.target.closest('[data-toggle-sold]'))inventoryChange(name,{soldOut:!item.soldOut});else if(e.target.closest('[data-stock-delta]'))inventoryChange(name,{stock:Math.max(0,item.stock+Number(e.target.closest('[data-stock-delta]').dataset.stockDelta))});else if(e.target.closest('[data-stock-set]'))inventoryChange(name,{stock:Number(e.target.closest('[data-stock-set]').dataset.stockSet)});});
  $('searchInput').addEventListener('input', render);
  $('modeFilter').addEventListener('change', render);
  $('mallChips').addEventListener('click', e => { const b=e.target.closest('[data-mall]'); if(!b)return; selectedMall=b.dataset.mall; renderMallChips(); render(); });
  document.querySelector('.period-tabs').addEventListener('click', e => { const b=e.target.closest('[data-period]'); if(!b)return; selectedPeriod=b.dataset.period; document.querySelectorAll('.period').forEach(x=>x.classList.toggle('active',x===b)); render(); });
  document.querySelector('.stats').addEventListener('click', e => { const b=e.target.closest('[data-mode-shortcut]'); if(!b)return; $('modeFilter').value=b.dataset.modeShortcut; render(); });
  $('orderList').addEventListener('change', e => { if(e.target.matches('[data-status]')) update(e.target.dataset.status,e.target.value,null); });
  $('orderList').addEventListener('click', e => {
    const cancelBtn=e.target.closest('[data-cancel-order]');
    if(cancelBtn){cancelOrderByStaff(cancelBtn.dataset.cancelOrder);return;}
    const pay=e.target.closest('[data-payment]');
    if(pay){
      const status=pay.dataset.paymentStatus;
      if(status==='已付款'&&!confirm('已核對入帳，確定標示為「已付款」？'))return;
      updatePayment(pay.dataset.payment,status);
      return;
    }
    const b=e.target.closest('[data-key]');
    if(b) update(b.dataset.key,null,b.dataset.value==='true');
  });

  $('deliveryBtn').addEventListener('click',openDelivery);
  $('closeDeliveryBtn').addEventListener('click',()=>$('deliveryDialog').close());
  $('deliveryMall').addEventListener('change',fillMallGeo);
  $('useCurrentLocationBtn').addEventListener('click',useCurrentLocation);
  $('saveMallGeoBtn').addEventListener('click',saveMallGeo);
  $('startDeliveryBtn').addEventListener('click',startDelivery);
  $('arrivedDeliveryBtn').addEventListener('click',()=>markArrived(false));
  $('finishDeliveryBtn').addEventListener('click',finishDelivery);
  selectedDeliveryDate=localDateValue(new Date());$('staffDeliveryDate').value=selectedDeliveryDate;
  $('staffDeliveryDate').addEventListener('change',e=>{selectedDeliveryDate=e.target.value;loadOrders();});
  $('todayDateBtn').addEventListener('click',()=>{selectedDeliveryDate=localDateValue(new Date());$('staffDeliveryDate').value=selectedDeliveryDate;loadOrders();});
  $('tomorrowDateBtn').addEventListener('click',()=>{const d=new Date();d.setDate(d.getDate()+1);selectedDeliveryDate=localDateValue(d);$('staffDeliveryDate').value=selectedDeliveryDate;loadOrders();});
  $('prevDateBtn').addEventListener('click',()=>shiftSelectedDate(-1));
  $('nextDateBtn').addEventListener('click',()=>shiftSelectedDate(1));

  registerServiceWorker();updateNotifyButton();
  if (focusMode) document.body.classList.add('focus-mode');
  if (token) { showStaff(); loadOrders(); }
  setInterval(() => { if(token) loadOrders(); }, 20000);
})();
