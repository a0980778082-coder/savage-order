(() => {
  'use strict';
  const cfg = window.SAVAGE_CONFIG || {};
  const DELIVERY_MEMORY_KEY = 'savage_delivery_profile_v1';
  const state = { malls: [], menu: [], settings: {}, cart: new Map(), submitting: false, spinning: false, lastOrder: null, requestId: null, submitTimer: null, editingOrderNo: '', originalPhone: '', historyLoading: false, historyOrders: [] };
  const $ = (id) => document.getElementById(id);
  const els = { deliveryDate:$('deliveryDate'), mall:$('mall'), building:$('building'), floor:$('floor'), categorySelect:$('categorySelect'), menuRoot:$('menuRoot'), menuLoading:$('menuLoading'), totalQty:$('totalQty'), totalPrice:$('totalPrice'), submitBtn:$('submitBtn'), linePayBox:$('linePayBox'), linePayLast3:$('linePayLast3'), linePayAcknowledged:$('linePayAcknowledged'), transferBox:$('transferBox'), invoiceExtraField:$('invoiceExtraField'), invoiceExtraLabel:$('invoiceExtraLabel'), invoiceCarrier:$('invoiceCarrier'), wheelDialog:$('wheelDialog'), prizeWheel:$('prizeWheel'), spinResult:$('spinResult'), submitOverlay:$('submitOverlay'), submitOverlayText:$('submitOverlayText'), siteMarquee:$('siteMarquee'), siteMarqueeText:$('siteMarqueeText'), businessStatusBanner:$('businessStatusBanner'), businessStatusTitle:$('businessStatusTitle'), businessStatusMessage:$('businessStatusMessage'), announcementDialog:$('announcementDialog') };

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
      setupDeliveryDate();renderMallOptions();renderMenu();renderPaymentInfo();restoreDeliveryProfile();renderBusinessNotice();
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
    els.deliveryDate.addEventListener('change',()=>{updateDeliveryDateHint();applyOrderingAvailability();});
    els.mall.addEventListener('change',onMallChange);els.building.addEventListener('change',onBuildingChange);
    document.querySelectorAll('input[name="paymentMethod"]').forEach(x=>x.addEventListener('change',renderPaymentChoice));
    document.querySelectorAll('input[name="mealPeriod"]').forEach(x=>x.addEventListener('change',applyOrderingAvailability));
    document.querySelectorAll('input[name="invoiceType"]').forEach(x=>x.addEventListener('change',renderInvoiceChoice));
    els.submitBtn.addEventListener('click',submitOrder);$('newOrderBtn').addEventListener('click',()=>location.reload());$('editOrderBtn').addEventListener('click',startEditOrder);$('orderFailBtn').addEventListener('click',()=>$('orderResultDialog').close());
    $('spinBtn').addEventListener('click',openWheel);
    $('startSpinBtn').addEventListener('click',startSpin);
    $('closeWheelBtn').addEventListener('click',()=>els.wheelDialog.close());
    $('couponCode').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/\s+/g,'')});
    $('clearDeliveryMemory').addEventListener('click',clearDeliveryMemory);
    $('closeAnnouncementBtn').addEventListener('click',()=>els.announcementDialog.close());
    $('ackAnnouncementBtn').addEventListener('click',()=>els.announcementDialog.close());
    $('openHistoryBtn').addEventListener('click',openHistoryDialog);
    $('closeHistoryBtn').addEventListener('click',()=>$('historyDialog').close());
    $('historyLookupBtn').addEventListener('click',lookupHistory);
    $('historyLookupPin').addEventListener('keydown',e=>{if(e.key==='Enter')lookupHistory()});
    $('historyResults').addEventListener('click',onHistoryResultClick);
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
    els.menuRoot.addEventListener('change',onUnitCustomChange);
    els.menuRoot.addEventListener('click',onUnitActionClick);
    updateAddonAvailability();
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
    return `<article class="menu-item ${soldOut?'sold-out':''}" data-item="${escAttr(key)}"><div class="item-main"><div><div class="item-name">${esc(key)}${soldOut?'<span class="sold-out-badge">今日售完</span>':''}</div><div class="item-price">$${Number(item['價格'])}</div>${limited&&showStock&&!soldOut?`<div class="stock-note">今日剩餘：${stock} 份</div>`:''}</div><div class="qty-control"><button type="button" data-action="minus" data-name="${escAttr(key)}" ${soldOut?'disabled':''}>−</button><span class="qty-value" data-qty="${escAttr(key)}">0</span><button type="button" data-action="plus" data-name="${escAttr(key)}" ${soldOut?'disabled':''}>＋</button></div></div>${rice?`<div class="custom-options portion-options" data-options="${escAttr(key)}" hidden></div>`:''}</article>`;
  }
  function ensurePortions(entry){
    if(!Array.isArray(entry.portions))entry.portions=[];
    while(entry.portions.length<entry.qty)entry.portions.push({rice:'紫米飯',amount:'正常飯'});
    if(entry.portions.length>entry.qty)entry.portions.length=entry.qty;
    return entry;
  }
  function riceSelect(value,name,index){
    return `<select data-portion-custom="rice" data-name="${escAttr(name)}" data-index="${index}">
      <option value="紫米飯" ${value==='紫米飯'?'selected':''}>紫米飯</option>
      <option value="紅藜麥白飯" ${value==='紅藜麥白飯'?'selected':''}>紅藜麥白飯</option>
    </select>`;
  }
  function amountSelect(value,name,index){
    return `<select data-portion-custom="amount" data-name="${escAttr(name)}" data-index="${index}">
      <option value="正常飯" ${value==='正常飯'?'selected':''}>正常飯</option>
      <option value="半飯" ${value==='半飯'?'selected':''}>半飯</option>
      <option value="無飯" ${value==='無飯'?'selected':''}>無飯</option>
    </select>`;
  }
  function renderPortionOptions(name){
    const entry=state.cart.get(name),box=document.querySelector(`[data-options="${cssEsc(name)}"]`);
    if(!entry||!box)return;
    ensurePortions(entry);
    box.hidden=entry.qty===0;
    if(entry.qty===0){box.innerHTML='';return}
    box.innerHTML=`<div class="portion-options-head">
      <div><strong>每份飯量設定</strong><small>${entry.qty>1?'每一份都可以選不同飯量':'請選擇這份餐盒的飯種與飯量'}</small></div>
      ${entry.qty>1?`<button type="button" class="apply-all-rice" data-portion-action="apply-all" data-name="${escAttr(name)}">全部套用第1份</button>`:''}
    </div>
    <div class="portion-list">${entry.portions.map((portion,index)=>`<div class="portion-row">
      <div class="portion-number">第 ${index+1} 份</div>
      <label><span>飯種</span>${riceSelect(portion.rice,name,index)}</label>
      <label><span>飯量</span>${amountSelect(portion.amount,name,index)}</label>
    </div>`).join('')}</div>`;
  }
  function isAddonItem(item){
    const category=String((item&&item['分類'])||'');
    return category==='餐盒加購優惠'||category.includes('加購');
  }
  function isEconomicBento(item){
    const category=String((item&&item['分類'])||'');
    return category.includes('外送百元')||category.includes('百元');
  }
  function isRegularBento(item){
    const category=String((item&&item['分類'])||'');
    return category.includes('餐盒')&&!isEconomicBento(item)&&!isAddonItem(item);
  }
  function cartQtyBy(test){
    return [...state.cart.values()].reduce((sum,entry)=>sum+(entry.qty>0&&test(entry.item)?Number(entry.qty):0),0);
  }
  function addonRuleStatus(){
    return {
      regularQty:cartQtyBy(isRegularBento),
      economicQty:cartQtyBy(isEconomicBento),
      addonQty:cartQtyBy(isAddonItem)
    };
  }
  function enforceAddonLimit(showToast=false){
    const status=addonRuleStatus();
    let excess=Math.max(0,status.addonQty-status.regularQty);
    if(excess>0){
      const addonEntries=[...state.cart.entries()].filter(([,entry])=>entry.qty>0&&isAddonItem(entry.item)).reverse();
      addonEntries.forEach(([name,entry])=>{
        if(excess<=0)return;
        const cut=Math.min(excess,entry.qty);
        entry.qty-=cut;
        excess-=cut;
        state.cart.set(name,entry);
        const qtyEl=document.querySelector(`[data-qty="${cssEsc(name)}"]`);
        if(qtyEl)qtyEl.textContent=entry.qty;
      });
      if(showToast)toast(status.regularQty===0?'百元外送餐盒不提供「餐盒加購優惠」':'加購優惠數量已依一般餐盒份數自動調整');
    }
    updateAddonAvailability();
  }
  function updateAddonAvailability(){
    const status=addonRuleStatus();
    const canAddon=status.regularQty>0;
    const remaining=Math.max(0,status.regularQty-status.addonQty);
    const addonSection=[...els.menuRoot.querySelectorAll('.menu-category')].find(section=>section.dataset.category==='餐盒加購優惠'||String(section.dataset.category).includes('加購'));
    if(addonSection){
      addonSection.classList.toggle('addon-disabled',!canAddon);
      let note=addonSection.querySelector('.addon-rule-note');
      const itemsBox=addonSection.querySelector('.category-items');
      if(!note&&itemsBox){
        note=document.createElement('div');
        note.className='addon-rule-note';
        itemsBox.prepend(note);
      }
      if(note){
        note.textContent=canAddon
          ? `一般餐盒可加購 ${status.regularQty} 杯，目前已選 ${status.addonQty} 杯${remaining?`，還可加購 ${remaining} 杯`:''}`
          : (status.economicQty>0?'百元外送餐盒不適用餐盒加購優惠':'請先選擇一般餐盒，才能使用餐盒加購優惠');
      }
      addonSection.querySelectorAll('[data-action="plus"]').forEach(btn=>{
        const entry=state.cart.get(btn.dataset.name);
        const ownQty=entry?Number(entry.qty):0;
        btn.disabled=!canAddon||remaining<=0;
        btn.title=!canAddon?'百元外送餐盒不適用此優惠':(remaining<=0?'已達可加購上限':'');
      });
    }
  }

  function onQtyClick(e){
    const name=e.currentTarget.dataset.name,item=state.menu.find(x=>x['品項']===name);if(!item)return;
    const action=e.currentTarget.dataset.action;
    const limited=String(item['限量品']).toLowerCase()==='true',soldOut=String(item['今日售完']).toLowerCase()==='true'||(limited&&Number(item['每日庫存']||0)<=0);
    if(action==='plus'&&soldOut){toast(name+'今日已售完');return}
    if(action==='plus'&&isAddonItem(item)){
      const status=addonRuleStatus();
      if(status.regularQty<=0){
        toast(status.economicQty>0?'百元外送餐盒不提供「餐盒加購優惠」':'請先選擇一般餐盒才能加購優惠飲料');
        return;
      }
      if(status.addonQty>=status.regularQty){toast('餐盒加購優惠最多 '+status.regularQty+' 杯（依一般餐盒份數）');return}
    }
    const entry=state.cart.get(name)||{item,qty:0,portions:[]};
    if(action==='plus'){
      if(limited&&entry.qty>=Number(item['每日庫存']||0)){toast(name+'目前只剩 '+Number(item['每日庫存']||0)+' 份');return}
      entry.qty++;
    }else entry.qty=Math.max(0,entry.qty-1);
    ensurePortions(entry);
    state.cart.set(name,entry);
    document.querySelector(`[data-qty="${cssEsc(name)}"]`).textContent=entry.qty;
    renderPortionOptions(name);
    enforceAddonLimit(action==='minus'&&isRegularBento(item));
    updateSummary();
  }
  function onUnitCustomChange(e){
    const sel=e.target.closest('[data-portion-custom]');if(!sel)return;
    const entry=state.cart.get(sel.dataset.name);if(!entry)return;
    ensurePortions(entry);
    const index=Number(sel.dataset.index);if(!entry.portions[index])return;
    entry.portions[index][sel.dataset.portionCustom]=sel.value;
    state.cart.set(sel.dataset.name,entry);
  }
  function onUnitActionClick(e){
    const btn=e.target.closest('[data-portion-action="apply-all"]');if(!btn)return;
    const entry=state.cart.get(btn.dataset.name);if(!entry||entry.qty<2)return;
    ensurePortions(entry);
    const first={...entry.portions[0]};
    entry.portions=entry.portions.map(()=>({...first}));
    state.cart.set(btn.dataset.name,entry);
    renderPortionOptions(btn.dataset.name);
    toast('已套用第1份的飯量設定');
  }
  function updateSummary(){
    const entries=[...state.cart.values()].filter(x=>x.qty>0);const qty=entries.reduce((s,x)=>s+x.qty,0);const total=entries.reduce((s,x)=>s+Number(x.item['價格'])*x.qty,0);
    els.totalQty.textContent=qty;els.totalPrice.textContent=total.toLocaleString('zh-TW');els.submitBtn.dataset.cartEmpty=String(qty===0);updateAddonAvailability();applyOrderingAvailability();
  }


  function settingTrue(v){return v===true||String(v||'').trim().toUpperCase()==='TRUE'}
  function dateInRange(value,start,end){
    if(!value)return false;
    if(start&&value<start)return false;
    if(end&&value>end)return false;
    return true;
  }
  function effectiveBusinessState(){
    const st=state.settings||{};
    const date=els.deliveryDate.value||localDateValue(new Date());
    const start=String(st['公告開始日期']||'').slice(0,10);
    const end=String(st['公告結束日期']||'').slice(0,10);
    const active=dateInRange(date,start,end);
    return {
      active,
      status:active?String(st['營業狀態']||'OPEN'):'OPEN',
      noticeEnabled:active&&settingTrue(st['公告啟用']),
      popupEnabled:active&&settingTrue(st['公告彈窗']),
      marqueeEnabled:active&&settingTrue(st['公告跑馬燈']),
      title:String(st['公告標題']||'系統公告'),
      message:String(st['公告內容']||'')
    };
  }
  function orderingBlockReason(){
    const b=effectiveBusinessState();
    if(!b.active)return '';
    const meal=(document.querySelector('input[name="mealPeriod"]:checked')||{}).value||'午餐';
    if(b.status==='CLOSED')return '目前店休，暫停接受訂單';
    if(b.status==='LUNCH_CLOSED'&&meal==='午餐')return '本日午餐暫停接單';
    if(b.status==='DINNER_CLOSED'&&meal==='晚餐')return '本日晚餐暫停接單';
    return '';
  }
  function statusDefaultCopy(status){
    return {
      CLOSED:['今日店休','今日暫停供應餐點，造成不便敬請見諒。'],
      LUNCH_CLOSED:['今日午餐暫停接單','今日午餐時段暫停供應，晚餐仍可正常預訂。'],
      DINNER_CLOSED:['今日晚餐暫停接單','今日晚餐時段暫停供應，午餐仍可正常預訂。'],
      ANNOUNCEMENT:['最新公告','請留意本店最新公告。'],
      OPEN:['正常營業','目前正常接受訂單。']
    }[status]||['系統公告',''];
  }
  function renderBusinessNotice(){
    const b=effectiveBusinessState();
    const defaults=statusDefaultCopy(b.status);
    const title=b.title||defaults[0],message=b.message||defaults[1];
    const shouldShow=b.noticeEnabled||b.status!=='OPEN';
    els.siteMarquee.hidden=!(shouldShow&&b.marqueeEnabled);
    els.siteMarqueeText.textContent=`📣 ${title}｜${message}`;
    els.businessStatusBanner.hidden=!shouldShow;
    els.businessStatusBanner.classList.toggle('closed',['CLOSED','LUNCH_CLOSED','DINNER_CLOSED'].includes(b.status));
    els.businessStatusTitle.textContent=title;
    els.businessStatusMessage.textContent=message;
    if(shouldShow&&b.popupEnabled){
      $('announcementDialogTitle').textContent=title;
      $('announcementDialogMessage').textContent=message;
      const key='savage_notice_seen_'+[title,message,state.settings['公告開始日期'],state.settings['公告結束日期']].join('|');
      if(!sessionStorage.getItem(key)){
        setTimeout(()=>{if(typeof els.announcementDialog.showModal==='function')els.announcementDialog.showModal();},250);
        sessionStorage.setItem(key,'1');
      }
    }
    applyOrderingAvailability();
  }
  function applyOrderingAvailability(){
    const reason=orderingBlockReason();
    const cartEmpty=els.submitBtn.dataset.cartEmpty!=='false';
    els.submitBtn.disabled=!!reason||cartEmpty||state.submitting;
    els.submitBtn.classList.toggle('ordering-closed',!!reason);
    if(reason){
      els.submitBtn.textContent=reason.includes('午餐')?'午餐暫停接單':reason.includes('晚餐')?'晚餐暫停接單':'目前店休';
      els.businessStatusBanner.hidden=false;
      els.businessStatusBanner.classList.add('closed');
      if(!els.businessStatusTitle.textContent)els.businessStatusTitle.textContent='暫停接單';
      if(!els.businessStatusMessage.textContent)els.businessStatusMessage.textContent=reason;
    }else if(!state.submitting){
      els.submitBtn.textContent=state.editingOrderNo?'更新訂單':'送出訂單';
    }
  }

  function renderPaymentInfo(){
    const s=state.settings;
    $('bankName').textContent=s['銀行名稱']||'—';
    $('bankCode').textContent=s['銀行代碼']||'—';
    $('bankAccount').textContent=s['轉帳帳號']||'—';
    $('bankHolder').textContent=s['轉帳戶名']||'—';

    const qr=$('linePayQr');
    const missing=$('linePayMissing');
    const localQr='./linepay-qr.png?v=373';
    const configured=String(s.LINE_PAY_QR_URL||'').trim();

    qr.hidden=false;
    missing.hidden=true;
    qr.onerror=()=>{
      if(!qr.src.includes('linepay-qr.png')){
        qr.src=localQr;
        return;
      }
      qr.hidden=true;
      missing.hidden=false;
    };
    qr.onload=()=>{
      qr.hidden=false;
      missing.hidden=true;
    };

    // 有設定網址時先嘗試；失敗就自動退回專案內的 QR 圖片。
    qr.src=configured||localQr;
  }
  function renderPaymentChoice(){
    const v=document.querySelector('input[name="paymentMethod"]:checked').value;
    const isLinePay=v==='LINE Pay';
    els.linePayBox.hidden=!isLinePay;
    els.transferBox.hidden=v!=='轉帳';
    if(!isLinePay){
      els.linePayLast3.value='';
      els.linePayAcknowledged.checked=false;
    }
  }
  function renderInvoiceChoice(){const v=document.querySelector('input[name="invoiceType"]:checked').value;const show=v!=='紙本發票';els.invoiceExtraField.hidden=!show;els.invoiceExtraLabel.textContent=v==='手機條碼載具'?'手機條碼載具':'公司統一編號';els.invoiceCarrier.placeholder=v==='手機條碼載具'?'例如：/ABC1234':'請輸入8碼統編'}

  function validate(){
    const blocked=orderingBlockReason();if(blocked){toast(blocked);return false}
    const required=[['deliveryDate','請選擇送餐日期'],['mall','請選擇百貨'],['building','請選擇館別'],['floor','請選擇樓層'],['counterName','請填寫櫃位／品牌'],['contactName','請填寫聯絡人'],['contactPhone','請填寫聯絡電話']];
    for(const [id,msg] of required){if(!$(id).value.trim()){toast(msg);$(id).focus();return false}}
    if(!/^[0-9+()\-\s]{8,20}$/.test($('contactPhone').value.trim())){toast('聯絡電話格式不正確');return false}
    const payment=document.querySelector('input[name="paymentMethod"]:checked').value;
    if(payment==='LINE Pay'){
      const last3=els.linePayLast3.value.trim();
      if(!/^\d{3}$/.test(last3)){toast('請輸入 LINE Pay 付款手機後三碼');els.linePayLast3.focus();return false}
      if(!els.linePayAcknowledged.checked){toast('請勾選「付款後會到社群傳送後三碼」');els.linePayAcknowledged.focus();return false}
    }
    const inv=document.querySelector('input[name="invoiceType"]:checked').value;if(inv!=='紙本發票'&&!els.invoiceCarrier.value.trim()){toast(inv==='手機條碼載具'?'請輸入載具號碼':'請輸入公司統編');return false}
    if(inv==='公司統編'&&!/^\d{8}$/.test(els.invoiceCarrier.value.trim())){toast('公司統編需為8碼數字');return false}
    const historyPin=$('historyPin').value.trim();
    if(historyPin&&!/^\d{4}$/.test(historyPin)){toast('歷史查詢密碼請輸入4位數字');$('historyPin').focus();return false}
    const addonStatus=addonRuleStatus();
    if(addonStatus.addonQty>0&&addonStatus.regularQty===0){toast(addonStatus.economicQty>0?'百元外送餐盒不提供「餐盒加購優惠」':'加購優惠需搭配一般餐盒');return false}
    if(addonStatus.addonQty>addonStatus.regularQty){toast('餐盒加購優惠數量不可超過一般餐盒份數');return false}
    return true;
  }
  function buildOrderItems(){
    const rows=[];
    [...state.cart.values()].filter(x=>x.qty>0).forEach(entry=>{
      const riceEnabled=String(entry.item['飯量可選']).toLowerCase()!=='false';
      if(!riceEnabled){
        rows.push({category:entry.item['分類'],name:entry.item['品項'],price:Number(entry.item['價格']),qty:entry.qty,riceOption:''});
        return;
      }
      ensurePortions(entry);
      const groups=new Map();
      entry.portions.forEach(portion=>{
        const riceOption=`${portion.rice}／${portion.amount}`;
        const key=riceOption;
        const current=groups.get(key)||{category:entry.item['分類'],name:entry.item['品項'],price:Number(entry.item['價格']),qty:0,riceOption};
        current.qty++;
        groups.set(key,current);
      });
      rows.push(...groups.values());
    });
    return rows;
  }
  function buildPayload(){return {clientRequestId:state.requestId,orderNo:state.editingOrderNo,originalPhone:state.originalPhone,deliveryDate:els.deliveryDate.value,mall:els.mall.value,building:els.building.value,floor:els.floor.value,counterName:$('counterName').value.trim(),contactName:$('contactName').value.trim(),contactPhone:$('contactPhone').value.trim(),historyPin:$('historyPin').value.trim(),mealPeriod:document.querySelector('input[name="mealPeriod"]:checked').value,paymentMethod:document.querySelector('input[name="paymentMethod"]:checked').value,linePayLast3:els.linePayLast3.value.trim(),invoiceType:document.querySelector('input[name="invoiceType"]:checked').value,invoiceCarrier:els.invoiceCarrier.value.trim(),couponCode:$('couponCode').value.trim().toUpperCase(),sideDishWish:$('sideDishWish').value.trim(),note:$('note').value.trim(),items:buildOrderItems()}}
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
    if(d.action==='customerHistory'){handleHistoryResponse(d);return}
    clearTimeout(state.submitTimer);state.submitting=false;els.submitBtn.textContent='送出訂單';hideSubmitOverlay();updateSummary();
    if(d.ok){
      saveDeliveryProfile();
      state.lastOrder={orderNo:d.orderNo,phone:$('contactPhone').value.trim(),rewardStatus:d.rewardStatus||null};state.requestId=null;
      $('successOrderNo').textContent=d.orderNo;$('successDeliveryDate').textContent=displayDeliveryDate(els.deliveryDate.value);$('editOrderBtn').hidden=!!d.edited;if(d.edited){state.editingOrderNo='';state.originalPhone='';$('editBanner').hidden=true;$('submitBtn').textContent='送出訂單';}
      $('successTotal').textContent=Number(d.total).toLocaleString('zh-TW');
      const selectedPayment=document.querySelector('input[name="paymentMethod"]:checked').value;
      const showLinePayNotice=selectedPayment==='LINE Pay';
      $('successLinePayNotice').hidden=!showLinePayNotice;
      if(showLinePayNotice)$('successLinePayLast3').textContent=els.linePayLast3.value.trim();
      renderRewardProgress(d.rewardStatus);
      $('successDialog').showModal();
    }else { const msg=d.error||'訂單送出失敗，請確認資料與網路連線後再試一次'; $('orderFailMessage').textContent=msg; if(typeof $('orderResultDialog').showModal==='function') $('orderResultDialog').showModal(); else alert(msg); }
  }


  function openHistoryDialog(){
    const phone=$('contactPhone').value.trim();
    if(phone&&!$('historyPhone').value)$('historyPhone').value=phone;
    $('historyLookupPin').value='';
    $('historyResults').hidden=true;
    $('historyResults').innerHTML='';
    if(typeof $('historyDialog').showModal==='function')$('historyDialog').showModal();
    setTimeout(()=>$(phone?'historyLookupPin':'historyPhone').focus(),120);
  }
  function lookupHistory(){
    if(state.historyLoading)return;
    const phone=$('historyPhone').value.trim(),pin=$('historyLookupPin').value.trim();
    if(!/^[0-9+()\-\s]{8,20}$/.test(phone)){toast('請輸入正確的聯絡手機');$('historyPhone').focus();return}
    if(!/^\d{4}$/.test(pin)){toast('請輸入4碼查詢密碼');$('historyLookupPin').focus();return}
    state.historyLoading=true;
    $('historyLookupBtn').disabled=true;$('historyLookupBtn').textContent='查詢中…';$('historyLoading').hidden=false;$('historyResults').hidden=true;
    $('historyPayloadInput').value=JSON.stringify({requestId:makeRequestId(),phone,pin});
    $('historyForm').action=cfg.API_URL;$('historyForm').submit();
    setTimeout(()=>{if(state.historyLoading){state.historyLoading=false;$('historyLookupBtn').disabled=false;$('historyLookupBtn').textContent='查詢歷史訂單';$('historyLoading').hidden=true;toast('查詢逾時，請再試一次');}},20000);
  }
  function handleHistoryResponse(d){
    state.historyLoading=false;$('historyLookupBtn').disabled=false;$('historyLookupBtn').textContent='查詢歷史訂單';$('historyLoading').hidden=true;
    const box=$('historyResults');box.hidden=false;
    if(!d.ok){box.innerHTML=`<div class="history-error">${esc(d.error||'查詢失敗')}</div>`;return}
    state.historyOrders=Array.isArray(d.orders)?d.orders:[];
    if(!state.historyOrders.length){box.innerHTML='<div class="history-empty">目前找不到歷史訂單。</div>';return}
    box.innerHTML=`<div class="history-summary">共找到 <strong>${state.historyOrders.length}</strong> 筆最近訂單</div>`+state.historyOrders.map((o,i)=>{
      const items=(o.items||[]).map(x=>`<li><span>${esc(x.name)} ×${Number(x.qty||0)}</span>${x.riceOption?`<small>${esc(x.riceOption)}</small>`:''}</li>`).join('');
      return `<article class="history-order-card">
        <div class="history-order-top"><div><strong>${esc(o.deliveryDateDisplay||o.deliveryDate||'')}</strong><small>${esc(o.mealPeriod||'')}｜${esc(o.mall||'')} ${esc(o.building||'')} ${esc(o.floor||'')}</small></div><span class="history-status">${esc(o.status||'')}</span></div>
        <div class="history-counter">${esc(o.counterName||'')}｜訂單 ${esc(o.orderNo||'')}</div>
        <ul>${items}</ul>
        <div class="history-order-bottom"><div><small>${esc(o.paymentMethod||'')}｜${esc(o.paymentStatus||'')}</small><strong>$${Number(o.total||0).toLocaleString('zh-TW')}</strong></div><button type="button" class="history-reorder-button" data-history-reorder="${i}">再訂一次</button></div>
      </article>`;
    }).join('');
  }
  function onHistoryResultClick(e){
    const btn=e.target.closest('[data-history-reorder]');if(!btn)return;
    reorderFromHistory(Number(btn.dataset.historyReorder));
  }
  function reorderFromHistory(index){
    const order=state.historyOrders[index];if(!order)return;
    state.cart.clear();
    els.menuRoot.querySelectorAll('[data-qty]').forEach(el=>el.textContent='0');
    els.menuRoot.querySelectorAll('[data-options]').forEach(el=>{el.innerHTML='';el.hidden=true});
    let skipped=0;
    (order.items||[]).forEach(row=>{
      const item=state.menu.find(x=>x['品項']===row.name);
      if(!item){skipped++;return}
      const limited=String(item['限量品']).toLowerCase()==='true',soldOut=String(item['今日售完']).toLowerCase()==='true'||(limited&&Number(item['每日庫存']||0)<=0);
      if(soldOut){skipped++;return}
      const qty=Math.max(0,Math.floor(Number(row.qty)||0));if(!qty)return;
      const entry=state.cart.get(row.name)||{item,qty:0,portions:[]};
      const riceEnabled=String(item['飯量可選']).toLowerCase()!=='false';
      const parts=String(row.riceOption||'').split(/[／/]/).map(x=>x.trim()).filter(Boolean);
      for(let n=0;n<qty;n++){
        entry.qty++;
        if(riceEnabled)entry.portions.push({rice:parts[0]||'紫米飯',amount:parts[1]||'正常飯'});
      }
      state.cart.set(row.name,entry);
    });
    state.cart.forEach((entry,name)=>{
      const q=document.querySelector(`[data-qty="${cssEsc(name)}"]`);if(q)q.textContent=entry.qty;
      renderPortionOptions(name);
    });
    enforceAddonLimit(false);updateSummary();
    $('historyDialog').close();
    const first=els.menuRoot.querySelector('.menu-category');if(first)first.scrollIntoView({behavior:'smooth',block:'start'});
    toast(skipped?`已帶入可訂餐點，${skipped} 項目前無法再訂`:'已帶入上次餐點，可再調整後送出');
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
