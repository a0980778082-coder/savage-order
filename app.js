(() => {
  'use strict';
  const cfg = window.SAVAGE_CONFIG || {};
  const DELIVERY_MEMORY_KEY = 'savage_delivery_profile_v1';
  const state = { malls: [], menu: [], settings: {}, cart: new Map(), submitting: false, spinning: false, lastOrder: null, requestId: null, submitTimer: null, editingOrderNo: '', originalPhone: '' };
  const $ = (id) => document.getElementById(id);
  const els = { deliveryDate:$('deliveryDate'), mall:$('mall'), building:$('building'), floor:$('floor'), categorySelect:$('categorySelect'), menuRoot:$('menuRoot'), menuLoading:$('menuLoading'), totalQty:$('totalQty'), totalPrice:$('totalPrice'), submitBtn:$('submitBtn'), linePayBox:$('linePayBox'), transferBox:$('transferBox'), invoiceExtraField:$('invoiceExtraField'), invoiceExtraLabel:$('invoiceExtraLabel'), invoiceCarrier:$('invoiceCarrier'), wheelDialog:$('wheelDialog'), prizeWheel:$('prizeWheel'), spinResult:$('spinResult'), submitOverlay:$('submitOverlay'), submitOverlayText:$('submitOverlayText') };

  function jsonp(action, params={}) {
    return new Promise((resolve,reject) => {
      const cb='__savage_cb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const script=document.createElement('script');
      const timeout=setTimeout(()=>cleanup(new Error('連線逾時，請稍後重試')),15000);
      function cleanup(err,data){clearTimeout(timeout);delete window[cb];script.remove();err?reject(err):resolve(data)}
      window[cb]=(data)=>cleanup(null,data);
      const q=new URLSearchParams({action,callback:cb,...params});
      script.src=cfg.API_URL+'?'+q.toString();script.onerror=()=>cleanup(new Error('無法連線到訂單系統'));document.head.appendChild(script);
    });
  }

  async function init(){
    if(!cfg.API_URL){showFatal('尚未設定 Apps Script API 網址');return}
    bindEvents();
    try{
      const res=await jsonp('publicData');
      if(!res || res.ok===false) throw new Error(res && res.error || '資料載入失敗');
      state.malls=normalizeMallRows(res.data.malls||[]);state.menu=res.data.menu||[];state.settings=res.data.settings||{};
      setupDeliveryDate();renderMallOptions();renderMenu();renderPaymentInfo();restoreDeliveryProfile();
      els.menuLoading.hidden=true;els.menuRoot.hidden=false;updateSummary();
    }catch(err){showFatal(err.message||String(err));}
  }


  function looksLikeFloor(value){
    const v=String(value||'').trim().toUpperCase();
    return /^(B\d+|\d+F|RF|R|頂樓|地下\d+樓|\d+樓)$/.test(v);
  }
  function normalizeMallRows(rows){
    return rows.map(row=>{
      const copy={...row};
      const rawBuilding=String(copy['館別']||'').trim();
      const rawFloor=String(copy['樓層']||'').trim();

      // 百貨樓層表曾出現欄位內容顛倒：館別欄放 1F/B1，樓層欄放本館。
      // 只要其中一個值像樓層、另一個不像樓層，就固定把樓層格式放回「樓層」。
      if(looksLikeFloor(rawBuilding) && !looksLikeFloor(rawFloor)){
        copy['館別']=rawFloor || '本館';
        copy['樓層']=rawBuilding;
      }else if(!looksLikeFloor(rawBuilding) && looksLikeFloor(rawFloor)){
        copy['館別']=rawBuilding || '本館';
        copy['樓層']=rawFloor;
      }else{
        copy['館別']=rawBuilding || '本館';
        copy['樓層']=rawFloor;
      }
      return copy;
    }).filter(row=>row['百貨'] && row['館別'] && row['樓層']);
  }

  function localDateValue(date){
    const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  function setupDeliveryDate(){
    const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
    els.deliveryDate.min=localDateValue(today);
    if(!els.deliveryDate.value)els.deliveryDate.value=localDateValue(now.getHours()>=20?tomorrow:today);
    updateDeliveryDateHint();
  }
  function updateDeliveryDateHint(){
    const value=els.deliveryDate.value;if(!value)return;
    const today=localDateValue(new Date()),tomorrowDate=new Date();tomorrowDate.setDate(tomorrowDate.getDate()+1);
    const tomorrow=localDateValue(tomorrowDate);
    $('deliveryDateHint').textContent=value===today?'今天送達櫃上':value===tomorrow?'明天送達櫃上':'請確認此日期送達櫃上';
  }
  function displayDeliveryDate(value){
    if(!value)return '';
    const d=new Date(value+'T00:00:00');
    return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).format(d);
  }

  function bindEvents(){
    els.deliveryDate.addEventListener('change',updateDeliveryDateHint);
    els.mall.addEventListener('change',onMallChange);els.building.addEventListener('change',onBuildingChange);
    document.querySelectorAll('input[name="paymentMethod"]').forEach(x=>x.addEventListener('change',renderPaymentChoice));
    document.querySelectorAll('input[name="invoiceType"]').forEach(x=>x.addEventListener('change',renderInvoiceChoice));
    els.submitBtn.addEventListener('click',submitOrder);$('newOrderBtn').addEventListener('click',()=>location.reload());$('editOrderBtn').addEventListener('click',startEditOrder);$('orderFailBtn').addEventListener('click',()=>$('orderResultDialog').close());
    $('spinBtn').addEventListener('click',openWheel);
    $('startSpinBtn').addEventListener('click',startSpin);
    $('closeWheelBtn').addEventListener('click',()=>els.wheelDialog.close());
    $('couponCode').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/\s+/g,'')});
    $('clearDeliveryMemory').addEventListener('click',clearDeliveryMemory);
    window.addEventListener('message',handleSubmitResponse);
  }

  function restoreDeliveryProfile(){
    let profile=null;
    try{profile=JSON.parse(localStorage.getItem(DELIVERY_MEMORY_KEY)||'null')}catch(ignore){}
    if(!profile)return;
    if(profile.mall){els.mall.value=profile.mall;onMallChange()}
    if(profile.building){els.building.value=profile.building;onBuildingChange()}
    if(profile.floor)els.floor.value=profile.floor;
    $('counterName').value=profile.counterName||'';
    $('contactName').value=profile.contactName||'';
    $('contactPhone').value=profile.contactPhone||'';
    $('rememberDelivery').checked=true;
    if(profile.mall||profile.counterName||profile.contactPhone)setTimeout(()=>toast('已帶入上次配送資料'),350);
  }

  function saveDeliveryProfile(){
    if(!$('rememberDelivery').checked){localStorage.removeItem(DELIVERY_MEMORY_KEY);return}
    const profile={
      mall:els.mall.value,building:els.building.value,floor:els.floor.value,
      counterName:$('counterName').value.trim(),contactName:$('contactName').value.trim(),
      contactPhone:$('contactPhone').value.trim(),savedAt:new Date().toISOString()
    };
    try{localStorage.setItem(DELIVERY_MEMORY_KEY,JSON.stringify(profile))}catch(ignore){}
  }

  function clearDeliveryMemory(){
    localStorage.removeItem(DELIVERY_MEMORY_KEY);
    $('rememberDelivery').checked=false;
    toast('已清除這台手機儲存的配送資料');
  }

  function renderMallOptions(){
    const malls=[...new Map(state.malls.map(x=>[x['百貨'],x])).keys()];
    els.mall.innerHTML='<option value="">請選擇百貨商場</option>'+malls.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  }
  function onMallChange(){
    const rows=state.malls.filter(x=>x['百貨']===els.mall.value);const buildings=[...new Set(rows.map(x=>x['館別']))];
    els.building.disabled=!els.mall.value;els.floor.disabled=true;
    els.building.innerHTML='<option value="">請選擇館別／棟別</option>'+buildings.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    els.floor.innerHTML='<option value="">請先選館別</option>';
  }
  function onBuildingChange(){
    const rows=state.malls.filter(x=>x['百貨']===els.mall.value&&x['館別']===els.building.value).sort((a,b)=>Number(a['樓層排序'])-Number(b['樓層排序']));
    els.floor.disabled=!els.building.value;els.floor.innerHTML='<option value="">請選擇樓層</option>'+rows.map(x=>`<option value="${esc(x['樓層'])}">${esc(x['樓層'])}</option>`).join('');
  }

  function renderMenu(){
    const groups=[...new Map(state.menu.sort((a,b)=>Number(a['分類排序'])-Number(b['分類排序'])||Number(a['品項排序'])-Number(b['品項排序'])).map(x=>[x['分類'],[]])).entries()];
    state.menu.forEach(item=>{const g=groups.find(x=>x[0]===item['分類']);if(g)g[1].push(item)});

    els.categorySelect.innerHTML='<option value="">請選擇餐點分類</option>'+groups.map(([name])=>`<option value="${escAttr(name)}">${categoryEmoji(name)} ${esc(name)}</option>`).join('');
    els.categorySelect.disabled=false;

    els.menuRoot.innerHTML=groups.map(([name,items],idx)=>`<section class="menu-category" id="category-${idx}" data-category="${escAttr(name)}"><button class="category-button" type="button" aria-expanded="false"><span>${categoryEmoji(name)} ${esc(name)}</span><span class="category-meta"><span class="category-count">${items.length}項</span><span class="category-chevron" aria-hidden="true">⌄</span></span></button><div class="category-items" hidden>${items.map(renderItem).join('')}</div></section>`).join('');

    els.menuRoot.querySelectorAll('.category-button').forEach(btn=>btn.addEventListener('click',()=>toggleCategory(btn)));
    els.categorySelect.addEventListener('change',jumpToCategory);
    els.menuRoot.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',onQtyClick));
    els.menuRoot.querySelectorAll('select[data-custom]').forEach(sel=>sel.addEventListener('change',onCustomChange));
  }

  function toggleCategory(btn, forceOpen){
    const box=btn.nextElementSibling;
    const shouldOpen=forceOpen===true?true:forceOpen===false?false:box.hidden;
    box.hidden=!shouldOpen;
    btn.setAttribute('aria-expanded',String(shouldOpen));
  }

  function jumpToCategory(){
    const name=els.categorySelect.value;
    if(!name)return;
    const target=[...els.menuRoot.querySelectorAll('.menu-category')].find(section=>section.dataset.category===name);
    if(!target)return;
    els.menuRoot.querySelectorAll('.menu-category').forEach(section=>toggleCategory(section.querySelector('.category-button'),section===target));
    requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  function renderItem(item){
    const key=item['品項'],rice=String(item['飯量可選']).toLowerCase()!=='false',limited=String(item['限量品']).toLowerCase()==='true';
    const soldOut=String(item['今日售完']).toLowerCase()==='true'||(limited&&Number(item['每日庫存']||0)<=0),stock=Number(item['每日庫存']||0),showStock=String(item['顯示庫存']).toLowerCase()==='true'||(item['顯示庫存']===undefined&&limited);
    return `<article class="menu-item ${soldOut?'sold-out':''}" data-item="${escAttr(key)}"><div class="item-main"><div><div class="item-name">${esc(key)}${soldOut?'<span class="sold-out-badge">今日售完</span>':''}</div><div class="item-price">$${Number(item['價格'])}</div>${limited&&showStock&&!soldOut?`<div class="stock-note">今日剩餘：${stock} 份</div>`:''}</div><div class="qty-control"><button type="button" data-action="minus" data-name="${escAttr(key)}" ${soldOut?'disabled':''}>−</button><span class="qty-value" data-qty="${escAttr(key)}">0</span><button type="button" data-action="plus" data-name="${escAttr(key)}" ${soldOut?'disabled':''}>＋</button></div></div>${rice?`<div class="custom-options" data-options="${escAttr(key)}" hidden><label>飯種<select data-custom="rice" data-name="${escAttr(key)}"><option value="紫米飯">紫米飯</option><option value="紅藜麥白飯">紅藜麥白飯</option></select></label><label>飯量<select data-custom="amount" data-name="${escAttr(key)}"><option value="正常飯">正常飯</option><option value="半飯">半飯</option><option value="無飯">無飯</option></select></label></div>`:''}</article>`;
  }
  function onQtyClick(e){
    const name=e.currentTarget.dataset.name,item=state.menu.find(x=>x['品項']===name);if(!item)return;
    const limited=String(item['限量品']).toLowerCase()==='true',soldOut=String(item['今日售完']).toLowerCase()==='true'||(limited&&Number(item['每日庫存']||0)<=0);
    if(e.currentTarget.dataset.action==='plus'&&soldOut){toast(name+'今日已售完');return}
    const entry=state.cart.get(name)||{item,qty:0,rice:'紫米飯',amount:'正常飯'};
    if(e.currentTarget.dataset.action==='plus'){if(limited&&entry.qty>=Number(item['每日庫存']||0)){toast(name+'目前只剩 '+Number(item['每日庫存']||0)+' 份');return}entry.qty++;}else entry.qty=Math.max(0,entry.qty-1);
    state.cart.set(name,entry);document.querySelector(`[data-qty="${cssEsc(name)}"]`).textContent=entry.qty;const options=document.querySelector(`[data-options="${cssEsc(name)}"]`);if(options)options.hidden=entry.qty===0;updateSummary();
  }
  function onCustomChange(e){const entry=state.cart.get(e.target.dataset.name);if(!entry)return;entry[e.target.dataset.custom]=e.target.value;state.cart.set(e.target.dataset.name,entry)}
  function updateSummary(){
    const entries=[...state.cart.values()].filter(x=>x.qty>0);const qty=entries.reduce((s,x)=>s+x.qty,0);const total=entries.reduce((s,x)=>s+Number(x.item['價格'])*x.qty,0);
    els.totalQty.textContent=qty;els.totalPrice.textContent=total.toLocaleString('zh-TW');els.submitBtn.disabled=qty===0||state.submitting;
  }

  function renderPaymentInfo(){const s=state.settings;$('bankName').textContent=s['銀行名稱']||'—';$('bankCode').textContent=s['銀行代碼']||'—';$('bankAccount').textContent=s['轉帳帳號']||'—';$('bankHolder').textContent=s['轉帳戶名']||'—';if(s.LINE_PAY_QR_URL){$('linePayQr').src=s.LINE_PAY_QR_URL;$('linePayQr').hidden=false;$('linePayMissing').hidden=true}}
  function renderPaymentChoice(){const v=document.querySelector('input[name="paymentMethod"]:checked').value;els.linePayBox.hidden=v!=='LINE Pay';els.transferBox.hidden=v!=='轉帳'}
  function renderInvoiceChoice(){const v=document.querySelector('input[name="invoiceType"]:checked').value;const show=v!=='紙本發票';els.invoiceExtraField.hidden=!show;els.invoiceExtraLabel.textContent=v==='手機條碼載具'?'手機條碼載具':'公司統一編號';els.invoiceCarrier.placeholder=v==='手機條碼載具'?'例如：/ABC1234':'請輸入8碼統編'}

  function validate(){
    const required=[['deliveryDate','請選擇送餐日期'],['mall','請選擇百貨'],['building','請選擇館別'],['floor','請選擇樓層'],['counterName','請填寫櫃位／品牌'],['contactName','請填寫聯絡人'],['contactPhone','請填寫聯絡電話']];
    for(const [id,msg] of required){if(!$(id).value.trim()){toast(msg);$(id).focus();return false}}
    if(!/^[0-9+()\-\s]{8,20}$/.test($('contactPhone').value.trim())){toast('聯絡電話格式不正確');return false}
    const inv=document.querySelector('input[name="invoiceType"]:checked').value;if(inv!=='紙本發票'&&!els.invoiceCarrier.value.trim()){toast(inv==='手機條碼載具'?'請輸入載具號碼':'請輸入公司統編');return false}
    if(inv==='公司統編'&&!/^\d{8}$/.test(els.invoiceCarrier.value.trim())){toast('公司統編需為8碼數字');return false}
    const hasBento=[...state.cart.values()].some(x=>x.qty>0&&String(x.item['分類']).includes('餐盒'));const hasAddon=[...state.cart.values()].some(x=>x.qty>0&&x.item['分類']==='餐盒加購優惠');if(hasAddon&&!hasBento){toast('加購優惠需搭配至少一份餐盒');return false}
    return true;
  }
  function buildPayload(){return {clientRequestId:state.requestId,orderNo:state.editingOrderNo,originalPhone:state.originalPhone,deliveryDate:els.deliveryDate.value,mall:els.mall.value,building:els.building.value,floor:els.floor.value,counterName:$('counterName').value.trim(),contactName:$('contactName').value.trim(),contactPhone:$('contactPhone').value.trim(),mealPeriod:document.querySelector('input[name="mealPeriod"]:checked').value,paymentMethod:document.querySelector('input[name="paymentMethod"]:checked').value,invoiceType:document.querySelector('input[name="invoiceType"]:checked').value,invoiceCarrier:els.invoiceCarrier.value.trim(),couponCode:$('couponCode').value.trim().toUpperCase(),sideDishWish:$('sideDishWish').value.trim(),note:$('note').value.trim(),items:[...state.cart.values()].filter(x=>x.qty>0).map(x=>({category:x.item['分類'],name:x.item['品項'],price:Number(x.item['價格']),qty:x.qty,riceOption:String(x.item['飯量可選']).toLowerCase()!=='false'?`${x.rice}／${x.amount}`:''}))}}
  function makeRequestId(){
    if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
    return 'req-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  }
  function showSubmitOverlay(message){
    els.submitOverlayText.textContent=message||'訂單送出中，請勿重複點擊';
    els.submitOverlay.hidden=false;
    document.body.classList.add('is-submitting');
  }
  function hideSubmitOverlay(){
    els.submitOverlay.hidden=true;
    document.body.classList.remove('is-submitting');
  }
  function submitOrder(){
    if(state.submitting||!validate())return;
    const meal=document.querySelector('input[name="mealPeriod"]:checked').value;
    const confirmText=`請確認送餐資訊：\n\n送餐日期：${displayDeliveryDate(els.deliveryDate.value)}\n餐期：${meal}\n地點：${els.mall.value}｜${els.building.value}｜${els.floor.value}\n櫃位：${$('counterName').value.trim()}\n\n確認後送出訂單？`;
    if(!window.confirm(confirmText))return;
    if(!state.requestId)state.requestId=makeRequestId();
    state.submitting=true;els.submitBtn.disabled=true;els.submitBtn.textContent='送出中…';
    showSubmitOverlay('訂單送出中，請勿關閉頁面或重複點擊');
    $('submitForm').action=cfg.API_URL;$('orderActionInput').value=state.editingOrderNo?'updateCustomerOrder':'submitOrder';$('payloadInput').value=JSON.stringify(buildPayload());$('submitForm').submit();
    clearTimeout(state.submitTimer);
    state.submitTimer=setTimeout(()=>{
      if(state.submitting){
        state.submitting=false;els.submitBtn.textContent='重新確認送出';updateSummary();hideSubmitOverlay();
        toast('連線較久，請按「重新確認送出」；系統會避免重複訂單');
      }
    },30000);
  }
  function handleSubmitResponse(event){
    if(!event.data||event.data.source!=='savage-order-api')return;
    const d=event.data;
    if(d.action==='spinReward'){handleSpinResponse(d);return}
    clearTimeout(state.submitTimer);state.submitting=false;els.submitBtn.textContent='送出訂單';hideSubmitOverlay();updateSummary();
    if(d.ok){
      saveDeliveryProfile();
      state.lastOrder={orderNo:d.orderNo,phone:$('contactPhone').value.trim(),rewardStatus:d.rewardStatus||null};state.requestId=null;
      $('successOrderNo').textContent=d.orderNo;$('successDeliveryDate').textContent=displayDeliveryDate(els.deliveryDate.value);$('editOrderBtn').hidden=!!d.edited;if(d.edited){state.editingOrderNo='';state.originalPhone='';$('editBanner').hidden=true;$('submitBtn').textContent='送出訂單';}
      $('successTotal').textContent=Number(d.total).toLocaleString('zh-TW');
      renderRewardProgress(d.rewardStatus);
      $('successDialog').showModal();
    }else { const msg=d.error||'訂單送出失敗，請確認資料與網路連線後再試一次'; $('orderFailMessage').textContent=msg; if(typeof $('orderResultDialog').showModal==='function') $('orderResultDialog').showModal(); else alert(msg); }
  }


  function startEditOrder(){
    if(!state.lastOrder)return;state.editingOrderNo=state.lastOrder.orderNo;state.originalPhone=state.lastOrder.phone;
    $('successDialog').close();$('editOrderNo').textContent=state.editingOrderNo;$('editBanner').hidden=false;$('submitBtn').textContent='更新原訂單';
    window.scrollTo({top:0,behavior:'smooth'});toast('可修改餐點與資料，完成後按「更新原訂單」');
  }

  function renderRewardProgress(status){
    const box=$('rewardProgress'),btn=$('spinBtn');
    if(!status){box.hidden=true;return}
    box.hidden=false;
    $('rewardProgressTitle').textContent=`你已累積 ${status.orderCount} 次下單`;
    if(status.availableSpins>0){
      $('rewardProgressText').textContent=`目前可轉 ${status.availableSpins} 次好運輪盤！`;
      btn.hidden=false;
    }else{
      const remain=Math.max(0,status.nextSpinIn||0);
      $('rewardProgressText').textContent=remain===0?'即將獲得下一次抽獎資格':`再下單 ${remain} 次，就能轉一次輪盤`;
      btn.hidden=true;
    }
  }

  function openWheel(){
    if(!state.lastOrder)return;
    $('successDialog').close();
    els.prizeWheel.style.transform='rotate(0deg)';
    els.spinResult.hidden=true;
    $('startSpinBtn').hidden=false;
    $('startSpinBtn').disabled=false;
    els.wheelDialog.showModal();
  }

  function startSpin(){
    if(state.spinning||!state.lastOrder)return;
    state.spinning=true;
    $('startSpinBtn').disabled=true;
    $('startSpinBtn').textContent='轉動中…';
    $('spinPayloadInput').value=JSON.stringify({phone:state.lastOrder.phone,orderNo:state.lastOrder.orderNo});
    $('spinForm').action=cfg.API_URL;
    $('spinForm').submit();
  }

  function handleSpinResponse(d){
    if(!state.spinning)return;
    if(!d.ok){
      state.spinning=false;
      $('startSpinBtn').disabled=false;
      $('startSpinBtn').textContent='開始轉動';
      toast(d.error||'輪盤暫時無法使用');
      return;
    }
    const prize=d.reward||'沒中，下次加油';
    const isNoWin=prize.includes('沒中');
    const target=prize.includes('蒸蛋')?2925:(prize.includes('折抵')?3045:3165);
    els.prizeWheel.style.transform=`rotate(${target}deg)`;
    setTimeout(()=>{
      state.spinning=false;
      $('startSpinBtn').hidden=true;
      $('startSpinBtn').textContent='開始轉動';
      els.spinResult.hidden=false;
      $('spinPrize').textContent=isNoWin?'這次沒中，下次加油！':prize;
      $('spinResultLead').textContent=isNoWin?'再接再厲':'恭喜獲得';
      $('spinCoupon').hidden=isNoWin;
      $('spinCoupon').textContent=d.couponCode||'';
      $('spinResultNote').textContent=isNoWin?'完成下一輪累積後，還可以再挑戰一次。':'下次點餐請填入此優惠碼，有效期限以系統記錄為準。';
      if(state.lastOrder&&state.lastOrder.rewardStatus){
        state.lastOrder.rewardStatus.availableSpins=Math.max(0,Number(state.lastOrder.rewardStatus.availableSpins||1)-1);
      }
    },4300);
  }
  function showFatal(msg){els.menuLoading.innerHTML=`<strong>載入失敗</strong><br>${esc(msg)}<br><button type="button" class="primary-button" onclick="location.reload()">重新載入</button>`}
  function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.hidden=true,3200)}
  function categoryEmoji(name){if(name.includes('限量'))return'🔥';if(name.includes('百元'))return'🍱';if(name.includes('雞'))return'🐔';if(name.includes('豚'))return'🐷';if(name.includes('牛'))return'🐂';if(name.includes('魚'))return'🐟';if(name.includes('時蔬'))return'🥦';if(name.includes('湯'))return'🥣';if(name.includes('飲'))return'🥤';if(name.includes('加購'))return'➕';return'🍽️'}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  const escAttr=esc;function cssEsc(s){return window.CSS&&CSS.escape?CSS.escape(s):String(s).replace(/(["\\])/g,'\\$1')}
  init();
})();
