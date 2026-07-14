(() => {
  const API_URL = window.SAVAGE_CONFIG.API_URL;
  const $ = (id) => document.getElementById(id);
  let token = sessionStorage.getItem('savage_staff_token') || '';
  let rows = [];
  const pending = new Map();

  function uid(){ return 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function boolTrue(v){ return String(v).toUpperCase()==='TRUE' || v===true; }
  function showToast(text){ const t=$('toast'); t.textContent=text; t.hidden=false; clearTimeout(t._timer); t._timer=setTimeout(()=>t.hidden=true,2200); }

  function apiPost(action, payload){
    return new Promise((resolve,reject)=>{
      const requestId=uid(); payload={...payload,requestId};
      const frame=document.createElement('iframe'); frame.name='api_'+requestId; frame.hidden=true;
      const form=document.createElement('form'); form.method='POST'; form.action=API_URL+'?action='+encodeURIComponent(action); form.target=frame.name; form.hidden=true;
      const input=document.createElement('input'); input.name='payload'; input.value=JSON.stringify(payload); form.appendChild(input);
      document.body.append(frame,form); pending.set(requestId,{resolve,reject,frame,form,timer:setTimeout(()=>{pending.delete(requestId);frame.remove();form.remove();reject(new Error('連線逾時，請再試一次'));},30000)}); form.submit();
    });
  }
  window.addEventListener('message',(event)=>{
    const d=event.data; if(!d||d.source!=='savage-order-api'||!d.requestId)return;
    const p=pending.get(d.requestId); if(!p)return; clearTimeout(p.timer);pending.delete(d.requestId);p.frame.remove();p.form.remove(); d.ok?p.resolve(d):p.reject(new Error(d.error||'操作失敗'));
  });

  async function login(){
    $('loginBtn').disabled=true;$('loginError').textContent='';
    try{const r=await apiPost('staffLogin',{username:$('username').value.trim(),password:$('password').value});token=r.token;sessionStorage.setItem('savage_staff_token',token);showStaff();await loadOrders();}
    catch(e){$('loginError').textContent=e.message;}
    finally{$('loginBtn').disabled=false;}
  }
  function logout(){token='';sessionStorage.removeItem('savage_staff_token');$('staffView').hidden=true;$('loginView').hidden=false;}
  function showStaff(){$('loginView').hidden=true;$('staffView').hidden=false;}
  async function loadOrders(){
    if(!token)return; $('loading').hidden=false;$('refreshBtn').disabled=true;
    try{const r=await apiPost('staffOrders',{token,filters:{mall:$('mallFilter').value,mealPeriod:$('periodFilter').value,today:true}});rows=r.rows||[];populateMalls();render();}
    catch(e){if(/登入已逾時|權限/.test(e.message)){logout();$('loginError').textContent='登入已逾時，請重新登入';}else showToast(e.message);}
    finally{$('loading').hidden=true;$('refreshBtn').disabled=false;}
  }
  function populateMalls(){const current=$('mallFilter').value;const malls=[...new Set(rows.map(r=>r['百貨']).filter(Boolean))];$('mallFilter').innerHTML='<option value="">全部百貨</option>'+malls.map(m=>`<option ${m===current?'selected':''}>${esc(m)}</option>`).join('');}
  function visibleRows(){return rows.filter(o=>$('modeFilter').value==='all'||!boolTrue(o['POS已Key']));}
  function render(){
    const v=visibleRows(); $('pendingCount').textContent=rows.filter(o=>!boolTrue(o['POS已Key'])).length;$('orderCount').textContent=v.length;$('totalAmount').textContent='$'+v.reduce((s,o)=>s+Number(o['總金額']||0),0).toLocaleString();
    if(!v.length){$('orderList').innerHTML='<div class="empty">目前沒有符合條件的訂單</div>';return;}
    const groups=new Map();v.forEach(o=>{const key=[o['百貨'],o['館別'],o['樓層']].join('｜');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);});
    $('orderList').innerHTML=[...groups.entries()].map(([key,list])=>`<section class="floor-group"><div class="floor-title">${esc(key)}｜${list.length} 筆</div>${list.map(orderCard).join('')}</section>`).join('');
  }
  function orderCard(o){const done=boolTrue(o['POS已Key']);const items=(o.items||[]).map(i=>`<div class="item"><div><div class="item-name">${esc(i['品項'])}</div>${i['飯量/客製']?`<div class="custom">${esc(i['飯量/客製'])}</div>`:''}</div><div class="qty">×${esc(i['數量'])}</div></div>`).join('');
    return `<article class="order-card ${done?'done':''}"><div class="order-top"><div><div class="counter">${esc(o['櫃位/品牌'])}</div><div class="meta">${esc(o['餐期'])}｜${esc(o['訂單編號'])}</div></div><div class="amount">$${Number(o['總金額']||0).toLocaleString()}<div class="payment">${esc(o['付款方式'])}</div></div></div><div class="contact"><b>${esc(o['聯絡人姓名'])}</b>｜<a href="tel:${esc(o['聯絡電話'])}">${esc(o['聯絡電話'])}</a></div><div class="invoice">發票：${esc(o['發票方式'])}${o['發票載具']?`<br>載具：<b>${esc(o['發票載具'])}</b>`:''}</div><div class="items">${items}</div><div class="note">備註：${esc(o['訂單備註']||'無')}</div><div class="actions"><select data-status="${esc(o['訂單編號'])}">${['新訂單','製作中','已完成','已送達'].map(s=>`<option ${s===o['訂單狀態']?'selected':''}>${s}</option>`).join('')}</select><button class="key-btn ${done?'cancel':''}" data-key="${esc(o['訂單編號'])}" data-value="${done?'false':'true'}">${done?'取消已 Key':'✓ 完成 Key 單'}</button></div></article>`;}
  async function update(no,status,posKeyed){try{await apiPost('updateOrderStatus',{token,orderNo:no,status,posKeyed});showToast('已更新');await loadOrders();}catch(e){showToast(e.message);}}

  $('loginBtn').addEventListener('click',login);$('password').addEventListener('keydown',e=>{if(e.key==='Enter')login();});$('logoutBtn').addEventListener('click',logout);$('refreshBtn').addEventListener('click',loadOrders);$('mallFilter').addEventListener('change',loadOrders);$('periodFilter').addEventListener('change',loadOrders);$('modeFilter').addEventListener('change',render);
  $('orderList').addEventListener('change',e=>{if(e.target.matches('[data-status]'))update(e.target.dataset.status,e.target.value,null);});$('orderList').addEventListener('click',e=>{const b=e.target.closest('[data-key]');if(b)update(b.dataset.key,null,b.dataset.value==='true');});
  if(token){showStaff();loadOrders();} setInterval(()=>{if(token&&!document.hidden)loadOrders();},30000);
})();