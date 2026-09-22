const CONFIG = {
  spreadsheetId: '1kzWWfa7ES04Ly4oyNdcwsTsOtSjPC01VF5ovHMSSwcE',
  timezone: 'Asia/Taipei',
  sheets: {
    orders: '訂單主檔', items: '訂單明細', menu: '菜單', malls: '百貨樓層',
    settings: '系統設定', users: '使用者', wishes: '配菜許願池', customers: '顧客紀錄', rewards: '輪盤獎勵', mallGeo:'百貨座標', deliveries:'配送任務'
  }
};

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'linePayConfirm') return handleLinePayConfirm_(e);
  if (action === 'linePayCancel') return handleLinePayCancel_(e);
  if (action === 'publicData') {
    return jsonpResponse_(e, {ok:true, data:getPublicData()});
  }
  if (action === 'lineLoginStart') {
    try {
      return jsonpResponse_(e, {ok:true, state:createLineLoginState_()});
    } catch (err) {
      return jsonpResponse_(e, {ok:false, error:String(err && err.message || err)});
    }
  }
  if (action === 'lineLoginExchange') {
    try {
      var lineResult = exchangeLineLoginCode_(
        (e.parameter && e.parameter.code) || '',
        (e.parameter && e.parameter.redirectUri) || '',
        (e.parameter && e.parameter.state) || ''
      );
      return jsonpResponse_(e, {ok:true, user:lineResult.user, authToken:lineResult.authToken, expiresAt:lineResult.expiresAt});
    } catch (err) {
      return jsonpResponse_(e, {ok:false, error:String(err && err.message || err)});
    }
  }

  var page = (e && e.parameter && e.parameter.page) || 'order';
  var map = { order: 'Index', staff: 'Staff', admin: 'Admin' };
  var file = map[page] || 'Index';
  var titles = { Index:'小野人百貨點餐', Staff:'員工 POS Key 單', Admin:'老闆管理後台' };
  return HtmlService.createTemplateFromFile(file).evaluate().setTitle(titles[file]).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var action = e && e.parameter && e.parameter.action;
    if (action === 'submitOrder') {
      var payload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      var result = submitOrder(payload);
      return postMessageResponse_({
        source:'savage-order-api', action:'submitOrder', ok:true,
        orderNo:result.orderNo, total:result.total, rewardStatus:result.rewardStatus,
        couponApplied:result.couponApplied || null, paymentUrl:result.paymentUrl || ''
      });
    }
    if (action === 'spinReward') {
      var spinPayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      var spinResult = spinReward_(spinPayload);
      return postMessageResponse_({
        source:'savage-order-api', action:'spinReward', ok:true,
        reward:spinResult.reward, couponCode:spinResult.couponCode,
        expiry:spinResult.expiry, remainingSpins:spinResult.remainingSpins
      });
    }
    if (action === 'staffLogin') {
      var loginPayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      var loginResult = login(loginPayload.username || '', loginPayload.password || '');
      return postMessageResponse_({
        source:'savage-order-api', action:'staffLogin', requestId:loginPayload.requestId || '', ok:true,
        token:loginResult.token, name:loginResult.name, role:loginResult.role
      });
    }
    if (action === 'staffOrders') {
      var orderPayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      var staffRows = getStaffOrders(orderPayload.token || '', orderPayload.filters || {});
      return postMessageResponse_({
        source:'savage-order-api', action:'staffOrders', requestId:orderPayload.requestId || '', ok:true,
        rows:staffRows
      });
    }
    if (action === 'updateOrderStatus') {
      var updatePayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      updateOrderStatusSecure(updatePayload.token || '', updatePayload.orderNo || '', updatePayload.status, updatePayload.posKeyed);
      return postMessageResponse_({
        source:'savage-order-api', action:'updateOrderStatus', requestId:updatePayload.requestId || '', ok:true
      });
    }
    if (action === 'updatePaymentStatus') {
      var paymentPayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      updatePaymentStatusSecure_(paymentPayload.token || '', paymentPayload.orderNo || '', paymentPayload.paymentStatus || '');
      return postMessageResponse_({
        source:'savage-order-api', action:'updatePaymentStatus', requestId:paymentPayload.requestId || '', ok:true
      });
    }
    if (action === 'deliveryConfigGet') { var x=JSON.parse((e.parameter&&e.parameter.payload)||'{}'),r=getDeliveryConfigBundle_(x.token||''); return postMessageResponse_({source:'savage-order-api',action:'deliveryConfigGet',requestId:x.requestId||'',ok:true,rows:r.rows,malls:r.malls}); }
    if (action === 'deliveryConfigSave') { var x=JSON.parse((e.parameter&&e.parameter.payload)||'{}'); saveDeliveryConfig_(x.token||'',x); return postMessageResponse_({source:'savage-order-api',action:'deliveryConfigSave',requestId:x.requestId||'',ok:true}); }
    if (action === 'deliveryStart') { var x=JSON.parse((e.parameter&&e.parameter.payload)||'{}'),r=startDeliveryTrip_(x.token||'',x.mall||'',x.deliveryDate||''); return postMessageResponse_({source:'savage-order-api',action:'deliveryStart',requestId:x.requestId||'',ok:true,tripId:r.tripId,mall:r.mall,arrived:false}); }
    if (action === 'deliveryArrive') { var x=JSON.parse((e.parameter&&e.parameter.payload)||'{}'),r=arriveDeliveryTrip_(x.token||'',x.tripId||''); return postMessageResponse_({source:'savage-order-api',action:'deliveryArrive',requestId:x.requestId||'',ok:true,updated:r.updated}); }
    if (action === 'deliveryFinish') { var x=JSON.parse((e.parameter&&e.parameter.payload)||'{}'); finishDeliveryTrip_(x.token||'',x.tripId||''); return postMessageResponse_({source:'savage-order-api',action:'deliveryFinish',requestId:x.requestId||'',ok:true}); }
    if (action === 'inventoryList') {
      var inventoryPayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      return postMessageResponse_({source:'savage-order-api', action:'inventoryList', requestId:inventoryPayload.requestId||'', ok:true, rows:getInventoryList_(inventoryPayload.token||'')});
    }
    if (action === 'inventoryUpdate') {
      var iu = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      return postMessageResponse_({source:'savage-order-api', action:'inventoryUpdate', requestId:iu.requestId||'', ok:true, item:updateInventoryItem_(iu.token||'',iu.itemName||'',iu.changes||{})});
    }
    if (action === 'inventoryRestockAll') {
      var ir = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      return postMessageResponse_({source:'savage-order-api', action:'inventoryRestockAll', requestId:ir.requestId||'', ok:true, result:restockAllLimitedItems_(ir.token||'')});
    }
    if (action === 'businessSettingsGet') {
      var bg = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      return postMessageResponse_({source:'savage-order-api', action:'businessSettingsGet', requestId:bg.requestId||'', ok:true, settings:getBusinessSettingsSecure_(bg.token||'')});
    }
    if (action === 'businessSettingsUpdate') {
      var bu = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      return postMessageResponse_({source:'savage-order-api', action:'businessSettingsUpdate', requestId:bu.requestId||'', ok:true, settings:updateBusinessSettingsSecure_(bu.token||'',bu.settings||{})});
    }
    if (action === 'customerHistory') {
      var historyPayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      var historyRows = getCustomerHistory_(historyPayload);
      return postMessageResponse_({source:'savage-order-api', action:'customerHistory', requestId:historyPayload.requestId||'', ok:true, orders:historyRows});
    }
    if (action === 'customerCancelOrder') {
      var cancelPayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      var cancelResult = cancelCustomerOrder_(cancelPayload);
      return postMessageResponse_({source:'savage-order-api', action:'customerCancelOrder', requestId:cancelPayload.requestId||'', ok:true, orderNo:cancelResult.orderNo, refundPending:cancelResult.refundPending});
    }
    if (action === 'staffCancelOrder') {
      var staffCancelPayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      var staffCancelResult = cancelOrderSecure_(staffCancelPayload.token||'',staffCancelPayload.orderNo||'',staffCancelPayload.reason||'店家取消');
      return postMessageResponse_({source:'savage-order-api', action:'staffCancelOrder', requestId:staffCancelPayload.requestId||'', ok:true, orderNo:staffCancelResult.orderNo, refundPending:staffCancelResult.refundPending});
    }
    if (action === 'updateCustomerOrder') {
      var editPayload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      var editResult = updateCustomerOrder_(editPayload);
      return postMessageResponse_({source:'savage-order-api', action:'updateCustomerOrder', ok:true, orderNo:editResult.orderNo, total:editResult.total, edited:true});
    }

    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    var event = body.events && body.events[0];
    if (event && event.source && event.source.groupId) {
      setSetting_('LINE_GROUP_ID', event.source.groupId);
    }
    return ContentService.createTextOutput('OK');
  } catch (err) {
    var errorRequestId = '';
    try {
      var errorPayload = JSON.parse((e && e.parameter && e.parameter.payload) || '{}');
      errorRequestId = errorPayload.requestId || '';
    } catch (ignore) {}
    return postMessageResponse_({source:'savage-order-api', action:action||'', requestId:errorRequestId, ok:false, error:String(err && err.message || err)});
  }
}

function jsonpResponse_(e, obj) {
  var callback = String((e && e.parameter && e.parameter.callback) || 'callback').replace(/[^a-zA-Z0-9_.$]/g, '');
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function postMessageResponse_(obj) {
  var json = JSON.stringify(obj).replace(/</g, '\u003c');
  var html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>(function(){var data=' + json + ';' +
    'function send(){try{window.parent.postMessage(data,"*");}catch(e){}' +
    'try{window.top.postMessage(data,"*");}catch(e){}}' +
    'send();setTimeout(send,150);setTimeout(send,600);})();<\/script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupV3System() {
  var ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  createSheet_(ss, CONFIG.sheets.orders, ['訂單編號','建立時間','送餐日期','餐期','百貨','館別','樓層','樓層排序','櫃位/品牌','聯絡人姓名','聯絡電話','發票方式','發票載具','付款方式','LINE Pay後三碼','付款狀態','總金額','訂單備註','訂單狀態','POS已Key','LINE User ID','LINE 顯示名稱','LINE驗證時間']);
  createSheet_(ss, CONFIG.sheets.items, ['訂單編號','分類','品項','單價','數量','飯量/客製','小計']);
  createSheet_(ss, CONFIG.sheets.menu, ['啟用','分類排序','分類','品項排序','品項','價格','限量品','每日庫存','飯量可選','今日售完','預設庫存','庫存警戒值','顯示庫存']);
  createSheet_(ss, CONFIG.sheets.malls, ['百貨排序','百貨','館別排序','館別','樓層排序','樓層']);
  createSheet_(ss, CONFIG.sheets.settings, ['設定項目','設定值']);
  createSheet_(ss, CONFIG.sheets.users, ['帳號','密碼雜湊','顯示名稱','權限','啟用']);
  createSheet_(ss, CONFIG.sheets.wishes, ['提交時間','訂單編號','聯絡電話','聯絡人','百貨','館別','樓層','櫃位/品牌','許願配菜','處理狀態','店家備註']);
  createSheet_(ss, CONFIG.sheets.customers, ['聯絡電話','聯絡人','累積下單次數','最後下單時間','更新時間','查詢密碼雜湊','查詢密碼設定時間']);
  createSheet_(ss, CONFIG.sheets.rewards, ['抽獎時間','聯絡電話','聯絡人','當時下單次數','獎品','優惠碼','有效期限','使用狀態','使用訂單編號','使用時間']);
  createSheet_(ss, CONFIG.sheets.orders, ['優惠碼','優惠內容','優惠折抵','配菜許願']);
  seedMallFloors_(ss); seedMenu_(ss); seedSettings_(ss); seedUsers_(ss); ensureRewardSettings_(ss);
  return '小野人百貨訂餐 POS v3.1 初始化完成（含配菜許願池與好運輪盤）';
}

function setupV2System() { return setupV3System(); }
function upgradeToV2() { return setupV3System(); }
function upgradeToV3() { return setupV3System(); }

function createSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var current = sh.getLastRow() ? sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getDisplayValues()[0] : [];
  if (!current.length || !current[0]) sh.getRange(1,1,1,headers.length).setValues([headers]);
  else {
    var missing = headers.filter(function(h){ return current.indexOf(h) === -1; });
    if (missing.length) sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);
  }
  sh.setFrozenRows(1); sh.getRange(1,1,1,sh.getLastColumn()).setFontWeight('bold');
  return sh;
}

function seedMallFloors_(ss) {
  var sh = ss.getSheetByName(CONFIG.sheets.malls); if (sh.getLastRow() > 1) return;
  var defs = [
    [1,'漢神洲際購物廣場',1,'本館',['B1','1F','2F','3F','4F','5F','6F']],
    [2,'中友百貨',1,'A棟',['B3','B2','B1','1F','2F','3F','4F','5F','6F','7F','8F','9F','10F','11F','12F','13F','14F','15F']],
    [2,'中友百貨',2,'B棟',['B3','B2','B1','1F','2F','3F','4F','5F','6F','7F','8F','9F','10F','11F','12F','13F','14F','15F']],
    [2,'中友百貨',3,'C棟',['B3','B2','B1','1F','2F','3F','4F','5F','6F','7F','8F','9F','10F','11F','12F','13F','14F','15F']],
    [3,'LaLaport 台中',1,'南館',['B1','1F','2F','3F']],
    [3,'LaLaport 台中',2,'北館',['1F','2F','3F','4F','5F','7F']],
    [4,'新光三越台中中港店',1,'本館',['B2','B1','1F','2F','3F','4F','5F','6F','7F','8F','9F','10F','11F','12F','13F','14F','15F']],
    [5,'台中大遠百',1,'本館',['B2','B1','1F','2F','3F','4F','5F','6F','7F','8F','9F','10F','11F','12F','13F','14F']]
  ];
  var rows=[]; defs.forEach(function(d){ d[4].forEach(function(f,i){ rows.push([d[0],d[1],d[2],d[3],i+1,f]); }); });
  sh.getRange(2,1,rows.length,6).setValues(rows);
}


function addTaichungFarEasternMall() {
  var ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var sh = ss.getSheetByName(CONFIG.sheets.malls);
  if (!sh) throw new Error('找不到「百貨樓層」工作表，請先執行 setupV3System');

  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var rows = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues()
    : [];

  var mallCol = headers.indexOf('百貨');
  var buildingCol = headers.indexOf('館別');
  var floorCol = headers.indexOf('樓層');
  if (mallCol < 0 || buildingCol < 0 || floorCol < 0) {
    throw new Error('「百貨樓層」工作表欄位不完整');
  }

  var existing = {};
  rows.forEach(function(r) {
    existing[r[mallCol] + '|' + r[buildingCol] + '|' + r[floorCol]] = true;
  });

  var floors = ['B2','B1','1F','2F','3F','4F','5F','6F','7F','8F','9F','10F','11F','12F','13F','14F'];
  var appendRows = [];
  floors.forEach(function(floor, index) {
    var key = '台中大遠百|本館|' + floor;
    if (!existing[key]) {
      appendRows.push([5, '台中大遠百', 1, '本館', index + 1, floor]);
    }
  });

  if (appendRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, 6).setValues(appendRows);
  }
  return appendRows.length ? '已新增台中大遠百，共 ' + appendRows.length + ' 個樓層' : '台中大遠百已經存在，不需重複新增';
}

function seedMenu_(ss) { var sh=ss.getSheetByName(CONFIG.sheets.menu); if(sh.getLastRow()>1)return; writeMenu_(sh); }
function resetMenuToCurrentVersion(){ var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=ss.getSheetByName(CONFIG.sheets.menu); if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).clearContent(); writeMenu_(sh); return '最新版菜單已寫入'; }
function writeMenu_(sh) {
  var groups = [
    ['限量版系列餐盒',1,[['限量版餐盒',140,true,99,true]]],
    ['外送百元經濟專區',2,[['舒肥雞胸肉便當',100,false,'',false],['泰式打拋豬便當',100,false,'',false],['蒜泥白肉便當',100,false,'',false]]],
    ['雞肉系列餐盒',3,[['精典原味雞胸餐盒',125],['麻辣口水雞胸餐盒',135],['蔥鹽醬燒雞胸餐盒',135],['日式胡麻雞胸餐盒',135],['迷迭香烤雞腿餐盒',145],['野膳清燉雞腿餐盒',145],['戰斧酥炸雞腿餐盒',145],['南洋海南雞腿餐盒',145],['塔塔佐唐揚雞餐盒',145]]],
    ['豚肉系列餐盒',4,[['野煎里肌肉餐盒',145],['極上豚野燒肉餐盒',145],['泰式松阪豬餐盒',185],['蔥鹽松阪豬餐盒',185],['BBQ碳烤肋排餐盒',175]]],
    ['牛肉系列餐盒',5,[['野烤蒜香牛排餐盒',190],['西西里燉牛肉餐盒',190]]],
    ['魚類系列餐盒',6,[['蒜香烤鱸魚餐盒',170],['野烤檸香鮭魚餐盒',185],['香煎虱目魚肚餐盒',185],['海鮮大三元餐盒',200]]],
    ['時蔬系列餐盒',7,[['野好菜時蔬餐盒',105],['炭烤野菇時蔬餐盒',135],['今日特餐餐盒',105]]],
    ['湯品系列',8,[['鮮菇干貝雞湯',120,false,'',false],['薑絲鱸魚湯',120,false,'',false],['老薑麻油雞湯',120,false,'',false]]],
    ['單點系列',9,[['原味雞胸',70,false,'',false],['蔥燒/口水/胡麻雞胸',80,false,'',false],['唐揚雞',70,false,'',false],['藥膳雞腿',85,false,'',false],['迷迭香烤雞腿',85,false,'',false],['煎里肌肉',75,false,'',false],['炭烤燒肉',65,false,'',false],['碳烤豬肋排',75,false,'',false],['椒鹽松阪豬',85,false,'',false],['菲力牛排',95,false,'',false],['燉牛肉',90,false,'',false],['烤鱸魚',70,false,'',false],['煎虱目魚肚',90,false,'',false],['碳烤杏鮑菇',60,false,'',false],['水煮蛋整顆',15,false,'',false],['加飯（紫米/紅藜麥）',20,false,'',false],['加一樣菜',10,false,'',false]]],
    ['餐盒加購優惠',10,[['加購 A.冷泡青茶',10,false,'',false],['加購 A.錫蘭紅茶',10,false,'',false],['加購 B.無糖豆漿',15,false,'',false],['加購 C.泰式奶茶',30,false,'',false]]],
    ['飲品系列',11,[['泰式奶茶',40,false,'',false],['無糖豆漿',30,false,'',false],['冷泡青茶',25,false,'',false],['錫蘭紅茶',25,false,'',false]]]
  ];
  var rows=[]; groups.forEach(function(g){ g[2].forEach(function(it,i){ rows.push([true,g[1],g[0],i+1,it[0],it[1],!!it[2],it[3]||'',it[4]!==false]); }); });
  sh.getRange(2,1,rows.length,9).setValues(rows);
}

function seedSettings_(ss) {
  var sh=ss.getSheetByName(CONFIG.sheets.settings); if(sh.getLastRow()>1)return;
  sh.getRange(2,1,12,2).setValues([
    ['LINE_PAY_QR_URL',''],['銀行名稱',''],['銀行代碼',''],['轉帳帳號',''],['轉帳戶名',''],
    ['LINE_CHANNEL_ACCESS_TOKEN',''],['LINE_GROUP_ID',''],['新訂單LINE通知','FALSE'],
    ['店名','小野人餐盒製造所'],['系統版本','3.0'],['午餐預設','午餐'],['晚餐預設','晚餐']
  ]);
}

function seedUsers_(ss) {
  var sh=ss.getSheetByName(CONFIG.sheets.users); if(sh.getLastRow()>1)return;
  sh.getRange(2,1,2,5).setValues([
    ['boss',hashPassword_('admin1234'),'老闆','admin',true],
    ['staff',hashPassword_('123456'),'店員','staff',true]
  ]);
}

function getPublicData() {
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  return { malls:sheetObjects_(ss.getSheetByName(CONFIG.sheets.malls)), menu:sheetObjects_(ss.getSheetByName(CONFIG.sheets.menu)).filter(function(r){return !isFalse_(r['啟用']);}), settings:publicSettings_(ss) };
}
function publicSettings_(ss){ var s=settingsObject_(ss); return {
  LINE_PAY_QR_URL:s.LINE_PAY_QR_URL||'',銀行名稱:s['銀行名稱']||'',銀行代碼:s['銀行代碼']||'',
  轉帳帳號:s['轉帳帳號']||'',轉帳戶名:s['轉帳戶名']||'',
  輪盤門檻:Number(s['輪盤門檻']||3),輪盤說明:s['輪盤說明']||'每累積3次下單可抽1次',
  營業狀態:s['營業狀態']||'OPEN',公告啟用:s['公告啟用']||'FALSE',公告彈窗:s['公告彈窗']||'FALSE',
  公告跑馬燈:s['公告跑馬燈']||'FALSE',公告標題:s['公告標題']||'',公告內容:s['公告內容']||'',
  公告開始日期:normalizeDeliveryDate_(s['公告開始日期']),公告結束日期:normalizeDeliveryDate_(s['公告結束日期'])
}; }

function submitOrder(p) {
  var lineIdentity=null;
p.lineUserId='';
p.lineDisplayName='';
  var requestId=String((p&&p.clientRequestId)||'').trim();
  var cache=CacheService.getScriptCache();
  if(requestId){
    var previous=cache.get('order_result_'+requestId);
    if(previous)return JSON.parse(previous);
  }
  var lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if(requestId){
      var afterWait=cache.get('order_result_'+requestId);
      if(afterWait)return JSON.parse(afterWait);
    }
    var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId), now=new Date();
    var fixedLocation = normalizeLocation_(ss, p.mall, p.building, p.floor);
    p.building = fixedLocation.building;
    p.floor = fixedLocation.floor;
    p.contactPhone = normalizePhone_(p.contactPhone);
    validateOrder_(p);

    // V38.1 第二層防重複：同手機、同日期餐期、同地點、同餐點與金額在 90 秒內只建立一張。
    var fingerprint=orderFingerprint_(p);
    var dupKey='order_fp_'+fingerprint;
    var dupNo=cache.get(dupKey);
    if(dupNo){
      var dup=findOrderSummaryByNo_(ss,dupNo);
      if(dup)return {ok:true,orderNo:dupNo,total:Number(dup['總金額']||0),rewardStatus:getRewardStatus_(ss,p.contactPhone),duplicatePrevented:true};
    }

    var no=Utilities.formatDate(now,CONFIG.timezone,'yyyyMMdd-HHmmss')+'-'+Math.floor(100+Math.random()*900);
    var subtotal=p.items.reduce(function(s,x){return s+Number(x.price)*Number(x.qty);},0);
    var coupon=validateRewardCoupon_(ss,p.couponCode,p.contactPhone);
    var discount=coupon && coupon.reward==='折抵 $5' ? 5 : 0;
    var total=Math.max(0,subtotal-discount);

    decrementLimitedStock_(ss,p.items);
    appendObjectRow_(ss.getSheetByName(CONFIG.sheets.orders),{
      '訂單編號':no,'建立時間':now,'送餐日期':normalizeDeliveryDate_(p.deliveryDate),'餐期':p.mealPeriod,'百貨':p.mall,'館別':p.building,'樓層':p.floor,
      '樓層排序':getFloorSort_(ss,p.mall,p.building,p.floor),'櫃位/品牌':p.counterName,'聯絡人姓名':p.contactName,
      '聯絡電話':p.contactPhone,'發票方式':p.invoiceType,'發票載具':p.invoiceCarrier||'','付款方式':p.paymentMethod,
      'LINE Pay後三碼':'',
      '付款狀態':p.paymentMethod==='LINE Pay'?'等待付款':'待確認','總金額':total,'訂單備註':p.note||'','訂單狀態':'新訂單','POS已Key':false,
      '優惠碼':coupon ? coupon.code : '','優惠內容':coupon ? coupon.reward : '','優惠折抵':discount,
      '配菜許願':String(p.sideDishWish||'').trim(),
      'LINE User ID':p.lineUserId,'LINE 顯示名稱':p.lineDisplayName,'LINE驗證時間':now
    });

    var rows=p.items.filter(function(x){return Number(x.qty)>0;}).map(function(x){
      return [no,x.category,x.name,Number(x.price),Number(x.qty),x.riceOption||'',Number(x.price)*Number(x.qty)];
    });
    if(coupon && coupon.reward==='免費蒸蛋') rows.push([no,'輪盤贈品','免費蒸蛋',0,1,'輪盤優惠碼 '+coupon.code,0]);
    if(rows.length){
      var itemSh=ss.getSheetByName(CONFIG.sheets.items);
      itemSh.getRange(itemSh.getLastRow()+1,1,rows.length,7).setValues(rows);
    }

    if(String(p.sideDishWish||'').trim()) saveSideDishWish_(ss,no,p,now);
    if(coupon) markRewardUsed_(ss,coupon.rowIndex,no,now);
    updateCustomerOrderCount_(ss,p.contactPhone,p.contactName,now);
    var rewardStatus=getRewardStatus_(ss,p.contactPhone);

    try{sendLineOrderNotification_(no,p,total);}catch(ignore){}
    var paymentUrl='';
    if(p.paymentMethod==='LINE Pay'){
      try{
        var lp=linePayRequest_(no,total,p);
        paymentUrl=lp.paymentUrl;
        updateOrderFieldsByNo_(ss,no,{'LINE Pay交易編號':String(lp.transactionId),'付款狀態':'等待付款'});
      }catch(payErr){
        updateOrderFieldsByNo_(ss,no,{'付款狀態':'付款建立失敗'});
        throw new Error('訂單已建立（'+no+'），但 LINE Pay 無法啟動：'+String(payErr && payErr.message || payErr));
      }
    }
    var result={
      ok:true,orderNo:no,total:total,rewardStatus:rewardStatus,paymentUrl:paymentUrl,
      couponApplied:coupon ? {code:coupon.code,reward:coupon.reward,discount:discount} : null
    };
    if(requestId)cache.put('order_result_'+requestId,JSON.stringify(result),600);
    cache.put(dupKey,no,90);
    return result;
  } finally {lock.releaseLock();}
}

function login(username,password) {
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId), users=sheetObjects_(ss.getSheetByName(CONFIG.sheets.users));
  var u=users.find(function(x){return x['帳號']===String(username).trim() && String(x['啟用']).toUpperCase()!=='FALSE';});
  if(!u || u['密碼雜湊']!==hashPassword_(password)) throw new Error('帳號或密碼錯誤');
  var token=Utilities.getUuid(); CacheService.getScriptCache().put('session_'+token,JSON.stringify({username:u['帳號'],name:u['顯示名稱'],role:u['權限']}),21600);
  return {token:token,name:u['顯示名稱'],role:u['權限']};
}
function logout(token){CacheService.getScriptCache().remove('session_'+token);return true;}
function auth_(token,roles){var raw=CacheService.getScriptCache().get('session_'+token);if(!raw)throw new Error('登入已逾時，請重新登入');var s=JSON.parse(raw);if(roles&&roles.indexOf(s.role)===-1)throw new Error('沒有此頁面權限');return s;}

function getStaffOrders(token,filters){auth_(token,['staff','admin']);return getOrders_(filters||{});}
function getAdminDashboard(token,filters){auth_(token,['admin']);var rows=getOrders_(filters||{}),sales=0,pay={},mall={},items={};rows.forEach(function(o){sales+=Number(o['總金額']||0);pay[o['付款方式']]=(pay[o['付款方式']]||0)+Number(o['總金額']||0);mall[o['百貨']]=(mall[o['百貨']]||0)+1;o.items.forEach(function(i){items[i['品項']]=(items[i['品項']]||0)+Number(i['數量']);});});return {orders:rows,stats:{count:rows.length,sales:sales,pending:rows.filter(function(o){return String(o['POS已Key']).toUpperCase()!=='TRUE';}).length,payment:pay,malls:mall,items:items}};}

function getOrders_(filters) {
  var ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var orders = sheetObjects_(ss.getSheetByName(CONFIG.sheets.orders));
  var items = sheetObjects_(ss.getSheetByName(CONFIG.sheets.items));
  var by = {};

  items.forEach(function (x) {
    var orderNo = x['訂單編號'];
    if (!by[orderNo]) by[orderNo] = [];
    by[orderNo].push(x);
  });

  var now = new Date();
  var todayYear = Number(
    Utilities.formatDate(now, CONFIG.timezone, 'yyyy')
  );
  var todayMonth = Number(
    Utilities.formatDate(now, CONFIG.timezone, 'M')
  );
  var todayDay = Number(
    Utilities.formatDate(now, CONFIG.timezone, 'd')
  );

  return orders
    .filter(function (o) {
      var targetDeliveryDate=String(filters.deliveryDate||'').trim();
      if(!targetDeliveryDate && filters.today!==false){
        targetDeliveryDate=Utilities.formatDate(now,CONFIG.timezone,'yyyy-MM-dd');
      }
      if(targetDeliveryDate){
        var orderDeliveryDate=normalizeDeliveryDate_(o['送餐日期']);
        if(!orderDeliveryDate){
          var createdText=String(o['建立時間']||'').replace(/-/g,'/').trim();
          var dateMatch=createdText.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
          if(!dateMatch)return false;
          orderDeliveryDate=dateMatch[1]+'-'+String(dateMatch[2]).padStart(2,'0')+'-'+String(dateMatch[3]).padStart(2,'0');
        }
        if(orderDeliveryDate!==normalizeDeliveryDate_(targetDeliveryDate))return false;
      }

      if (filters.mall && o['百貨'] !== filters.mall) return false;
      if (filters.building && o['館別'] !== filters.building) return false;
      if (
        filters.mealPeriod &&
        o['餐期'] !== filters.mealPeriod
      ) {
        return false;
      }
      if (filters.status && o['訂單狀態'] !== filters.status) {
        return false;
      }

      return true;
    })
    .map(function (o) {
      o.items = by[o['訂單編號']] || [];
      return o;
    })
    .sort(function (a, b) {
      return (
        Number(a['樓層排序']) - Number(b['樓層排序']) ||
        new Date(a['建立時間']) - new Date(b['建立時間'])
      );
    });
}

function updateOrderStatusSecure(token,no,status,pos){auth_(token,['staff','admin']);var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=ss.getSheetByName(CONFIG.sheets.orders),v=sh.getDataRange().getValues(),h=v[0],nc=h.indexOf('訂單編號'),sc=h.indexOf('訂單狀態'),pc=h.indexOf('POS已Key');for(var i=1;i<v.length;i++){if(v[i][nc]===no){if(status!==null&&status!==undefined)sh.getRange(i+1,sc+1).setValue(status);if(pos!==null&&pos!==undefined)sh.getRange(i+1,pc+1).setValue(pos);return true;}}throw new Error('找不到訂單');}
function updatePaymentStatusSecure_(token,no,paymentStatus){
  auth_(token,['staff','admin']);
  var allowed=['待核對','已付款','未付款','退款'];
  if(allowed.indexOf(String(paymentStatus))===-1)throw new Error('付款狀態不正確');
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=ss.getSheetByName(CONFIG.sheets.orders),v=sh.getDataRange().getValues(),h=v[0],
      nc=h.indexOf('訂單編號'),pc=h.indexOf('付款狀態');
  if(pc<0)throw new Error('訂單主檔缺少付款狀態欄位');
  for(var i=1;i<v.length;i++){
    if(String(v[i][nc])===String(no)){
      sh.getRange(i+1,pc+1).setValue(paymentStatus);
      return true;
    }
  }
  throw new Error('找不到訂單');
}

function changeMyPassword(token,oldPwd,newPwd){var s=auth_(token,['staff','admin']);if(String(newPwd).length<6)throw new Error('新密碼至少6碼');var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=ss.getSheetByName(CONFIG.sheets.users),v=sh.getDataRange().getValues(),h=v[0],uc=h.indexOf('帳號'),pc=h.indexOf('密碼雜湊');for(var i=1;i<v.length;i++){if(v[i][uc]===s.username){if(v[i][pc]!==hashPassword_(oldPwd))throw new Error('舊密碼錯誤');sh.getRange(i+1,pc+1).setValue(hashPassword_(newPwd));return true;}}throw new Error('找不到帳號');}

function sendLineOrderNotification_(no,p,total){var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),s=settingsObject_(ss);if(String(s['新訂單LINE通知']).toUpperCase()!=='TRUE'||!s.LINE_CHANNEL_ACCESS_TOKEN||!s.LINE_GROUP_ID)return;var lines=['🔔【送餐 '+formatDeliveryDateDisplay_(p.deliveryDate)+'｜'+p.mealPeriod+'】',p.mall+'｜'+p.building+'｜'+p.floor,p.counterName,'聯絡人：'+p.contactName+' '+p.contactPhone,'LINE驗證：'+(p.lineDisplayName||'已驗證'),''];p.items.filter(function(x){return Number(x.qty)>0;}).forEach(function(x){lines.push(x.name+' ×'+x.qty+(x.riceOption?'（'+x.riceOption+'）':''));});lines.push('付款：'+p.paymentMethod,'總金額：$'+total,'備註：'+(p.note||'無'),'訂單編號：'+no);UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+s.LINE_CHANNEL_ACCESS_TOKEN},payload:JSON.stringify({to:s.LINE_GROUP_ID,messages:[{type:'text',text:lines.join('\n')}]})});}

function setSetting_(key,value){var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=ss.getSheetByName(CONFIG.sheets.settings),v=sh.getDataRange().getValues();for(var i=1;i<v.length;i++){if(v[i][0]===key){sh.getRange(i+1,2).setValue(value);return;}}sh.appendRow([key,value]);}
function settingsObject_(ss){var o={};sheetObjects_(ss.getSheetByName(CONFIG.sheets.settings)).forEach(function(r){o[r['設定項目']]=r['設定值'];});return o;}
function appendObjectRow_(sh,obj){var h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];sh.appendRow(h.map(function(k){return Object.prototype.hasOwnProperty.call(obj,k)?obj[k]:'';}));}
function sheetObjects_(sh){var v=sh.getDataRange().getDisplayValues();if(v.length<2)return[];var h=v[0];return v.slice(1).filter(function(r){return r.some(function(x){return x!=='';});}).map(function(r){var o={};h.forEach(function(k,i){o[k]=r[i];});return o;});}
function sheetObjectsRaw_(sh){
  var v=sh.getDataRange().getValues();
  if(v.length<2)return[];
  var h=v[0];
  return v.slice(1).filter(function(r){return r.some(function(x){return x!=='';});}).map(function(r){
    var o={};
    h.forEach(function(k,i){o[k]=r[i];});
    return o;
  });
}

function normalizeLocation_(ss,mall,building,floor){
  var rows=sheetObjects_(ss.getSheetByName(CONFIG.sheets.malls));
  var direct=rows.some(function(r){return r['百貨']===mall&&r['館別']===building&&r['樓層']===floor;});
  if(direct) return {building:building,floor:floor};

  var swapped=rows.some(function(r){return r['百貨']===mall&&r['館別']===floor&&r['樓層']===building;});
  if(swapped) return {building:floor,floor:building};

  return {building:building,floor:floor};
}

function repairSwappedBuildingFloor(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var sh=ss.getSheetByName(CONFIG.sheets.orders);
  var values=sh.getDataRange().getValues();
  if(values.length<2) return '沒有訂單需要修正';

  var headers=values[0];
  var mallCol=headers.indexOf('百貨');
  var buildingCol=headers.indexOf('館別');
  var floorCol=headers.indexOf('樓層');
  var sortCol=headers.indexOf('樓層排序');
  if([mallCol,buildingCol,floorCol,sortCol].some(function(i){return i<0;})) throw new Error('訂單主檔欄位不完整');

  var fixed=0;
  for(var i=1;i<values.length;i++){
    var mall=values[i][mallCol];
    var building=values[i][buildingCol];
    var floor=values[i][floorCol];
    if(!mall&&!building&&!floor) continue;

    var normalized=normalizeLocation_(ss,mall,building,floor);
    if(normalized.building!==building||normalized.floor!==floor){
      sh.getRange(i+1,buildingCol+1).setValue(normalized.building);
      sh.getRange(i+1,floorCol+1).setValue(normalized.floor);
      sh.getRange(i+1,sortCol+1).setValue(getFloorSort_(ss,mall,normalized.building,normalized.floor));
      fixed++;
    }
  }
  return '已修正 '+fixed+' 筆館別／樓層資料';
}


function ensureRewardSettings_(ss){
  var defaults=[
    ['輪盤門檻','3'],
    ['輪盤免費蒸蛋機率','20'],
    ['輪盤折5元機率','30'],
    ['輪盤沒中機率','50'],
    ['輪盤優惠有效天數','30'],
    ['輪盤說明','每累積3次下單可抽1次；獎品限下次使用且不可折現']
  ];
  var sh=ss.getSheetByName(CONFIG.sheets.settings);
  var values=sh.getDataRange().getDisplayValues();
  var existing={};
  for(var i=1;i<values.length;i++) existing[values[i][0]]=true;
  defaults.forEach(function(row){if(!existing[row[0]])sh.appendRow(row);});
}

function normalizePhone_(phone){
  var digits=String(phone||'').replace(/\D/g,'');
  if(!digits)return '';
  // 台灣手機：+886 9xx / 886 9xx 統一轉為 09xx；試算表若把開頭 0 吃掉也補回。
  if(digits.indexOf('886')===0&&digits.length>=12)digits='0'+digits.slice(3);
  if(digits.length===9&&digits.charAt(0)==='9')digits='0'+digits;
  return digits;
}

function saveSideDishWish_(ss,no,p,now){
  appendObjectRow_(ss.getSheetByName(CONFIG.sheets.wishes),{
    '提交時間':now,'訂單編號':no,'聯絡電話':p.contactPhone,'聯絡人':p.contactName,
    '百貨':p.mall,'館別':p.building,'樓層':p.floor,'櫃位/品牌':p.counterName,
    '許願配菜':String(p.sideDishWish||'').trim(),'處理狀態':'待評估','店家備註':''
  });
}

function ensureCustomerHistoryColumns_(ss){
  var sh=createSheet_(ss,CONFIG.sheets.customers,['聯絡電話','聯絡人','累積下單次數','最後下單時間','更新時間','查詢密碼雜湊','查詢密碼設定時間']);
  return sh;
}
function saveCustomerHistoryPin_(ss,phone,name,pin,now){
  pin=String(pin||'').trim();
  if(!pin)return false;
  if(!/^\d{4}$/.test(pin))throw new Error('歷史查詢密碼需為4位數字');
  phone=normalizePhone_(phone);if(!phone)return false;
  var sh=ensureCustomerHistoryColumns_(ss),v=sh.getDataRange().getValues(),h=v[0],pc=h.indexOf('聯絡電話'),nc=h.indexOf('聯絡人'),hc=h.indexOf('查詢密碼雜湊'),tc=h.indexOf('查詢密碼設定時間');
  for(var i=1;i<v.length;i++)if(normalizePhone_(v[i][pc])===phone){
    if(nc>=0&&name)sh.getRange(i+1,nc+1).setValue(name);
    if(!String(v[i][hc]||'').trim()){
      sh.getRange(i+1,hc+1).setValue(hashPassword_(pin));
      if(tc>=0)sh.getRange(i+1,tc+1).setValue(now||new Date());
      return true;
    }
    return false;
  }
  appendObjectRow_(sh,{'聯絡電話':phone,'聯絡人':name||'','累積下單次數':countOrdersByPhone_(ss,phone),'最後下單時間':now||new Date(),'更新時間':now||new Date(),'查詢密碼雜湊':hashPassword_(pin),'查詢密碼設定時間':now||new Date()});
  return true;
}
function updateCustomerOrderCount_(ss,phone,name,now){
  var sh=ensureCustomerHistoryColumns_(ss);
  var values=sh.getDataRange().getValues(),headers=values[0];
  var phoneCol=headers.indexOf('聯絡電話'),nameCol=headers.indexOf('聯絡人'),countCol=headers.indexOf('累積下單次數'),lastCol=headers.indexOf('最後下單時間'),updatedCol=headers.indexOf('更新時間');
  for(var i=1;i<values.length;i++){
    if(normalizePhone_(values[i][phoneCol])===phone){
      if(nameCol>=0)sh.getRange(i+1,nameCol+1).setValue(name);
      if(countCol>=0)sh.getRange(i+1,countCol+1).setValue(Number(values[i][countCol]||0)+1);
      if(lastCol>=0)sh.getRange(i+1,lastCol+1).setValue(now);
      if(updatedCol>=0)sh.getRange(i+1,updatedCol+1).setValue(now);
      return;
    }
  }
  appendObjectRow_(sh,{'聯絡電話':phone,'聯絡人':name,'累積下單次數':countOrdersByPhone_(ss,phone),'最後下單時間':now,'更新時間':now});
}
function historyRateLimit_(phone,success){
  var cache=CacheService.getScriptCache(),key='history_try_'+phone;
  if(success){cache.remove(key);return;}
  var n=Number(cache.get(key)||0)+1;
  cache.put(key,String(n),900);
  if(n>5)throw new Error('查詢錯誤次數過多，請15分鐘後再試');
}
function getCustomerHistory_(p){
  var phone=normalizePhone_(p&&p.phone);
  if(!phone)throw new Error('請輸入正確手機號碼');
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var orders=sheetObjectsRaw_(ss.getSheetByName(CONFIG.sheets.orders)).filter(function(o){return normalizePhone_(o['聯絡電話'])===phone;});
  var items=sheetObjectsRaw_(ss.getSheetByName(CONFIG.sheets.items)),by={};
  items.forEach(function(x){var no=String(x['訂單編號']||'');if(!by[no])by[no]=[];by[no].push({name:String(x['品項']||''),category:String(x['分類']||''),price:Number(x['單價']||0),qty:Number(x['數量']||0),riceOption:String(x['飯量/客製']||'')});});
  orders.sort(function(a,b){var ad=a['建立時間'] instanceof Date?a['建立時間'].getTime():new Date(a['建立時間']).getTime()||0,bd=b['建立時間'] instanceof Date?b['建立時間'].getTime():new Date(b['建立時間']).getTime()||0;return bd-ad;});
  return orders.slice(0,20).map(function(o){var dd=normalizeDeliveryDate_(o['送餐日期']);return {orderNo:String(o['訂單編號']||''),createdAt:formatHistoryDateTime_(o['建立時間']),deliveryDate:dd,deliveryDateDisplay:formatDeliveryDateDisplay_(dd),mealPeriod:String(o['餐期']||''),mall:String(o['百貨']||''),building:String(o['館別']||''),floor:String(o['樓層']||''),counterName:String(o['櫃位/品牌']||''),paymentMethod:String(o['付款方式']||''),paymentStatus:String(o['付款狀態']||''),status:String(o['訂單狀態']||''),total:Number(o['總金額']||0),note:String(o['訂單備註']||''),canCancel:!isTrue_(o['POS已Key'])&&!String(o['訂單狀態']||'').includes('取消'),cancelMessage:isTrue_(o['POS已Key'])?'已完成 Key 單，如需取消請聯絡店家':(String(o['訂單狀態']||'').includes('取消')?'此訂單已取消':''),items:by[String(o['訂單編號']||'')]||[]};});
}
function formatHistoryDateTime_(value){
  var d=value instanceof Date?value:new Date(value);if(isNaN(d.getTime()))return String(value||'');return Utilities.formatDate(d,CONFIG.timezone,'yyyy/MM/dd HH:mm');
}
function orderFingerprint_(p){
  var items=(p.items||[]).filter(function(x){return Number(x.qty)>0;}).map(function(x){return [x.name,Number(x.qty),x.riceOption||'',Number(x.price)].join(':');}).sort().join('|');
  var raw=[normalizePhone_(p.contactPhone),normalizeDeliveryDate_(p.deliveryDate),p.mealPeriod,p.mall,p.building,p.floor,p.counterName,items].join('||');
  return hashPassword_(raw).slice(0,32);
}
function findOrderSummaryByNo_(ss,no){
  var rows=sheetObjectsRaw_(ss.getSheetByName(CONFIG.sheets.orders));
  for(var i=0;i<rows.length;i++)if(String(rows[i]['訂單編號'])===String(no))return rows[i];
  return null;
}
function restoreCouponForCancelledOrder_(ss,orderNo){
  var sh=ss.getSheetByName(CONFIG.sheets.rewards);if(!sh)return;
  var v=sh.getDataRange().getValues(),h=v[0],oc=h.indexOf('使用訂單編號'),sc=h.indexOf('使用狀態'),tc=h.indexOf('使用時間');
  if(oc<0||sc<0)return;
  for(var i=1;i<v.length;i++)if(String(v[i][oc])===String(orderNo)){
    sh.getRange(i+1,sc+1).setValue('未使用');sh.getRange(i+1,oc+1).clearContent();if(tc>=0)sh.getRange(i+1,tc+1).clearContent();
  }
}
function cancelOrderCore_(ss,orderNo,actor,reason,expectedPhone){
  var osh=ss.getSheetByName(CONFIG.sheets.orders),ov=osh.getDataRange().getValues(),oh=ov[0];
  var nc=oh.indexOf('訂單編號'),pc=oh.indexOf('聯絡電話'),kc=oh.indexOf('POS已Key'),sc=oh.indexOf('訂單狀態'),payc=oh.indexOf('付款狀態'),pmc=oh.indexOf('付款方式'),row=-1;
  for(var i=1;i<ov.length;i++)if(String(ov[i][nc])===String(orderNo)){row=i;break;}
  if(row<0)throw new Error('找不到訂單');
  if(expectedPhone&&normalizePhone_(ov[row][pc])!==normalizePhone_(expectedPhone))throw new Error('聯絡電話不符');
  var oldStatus=String(ov[row][sc]||'');if(oldStatus.indexOf('取消')>=0)return {orderNo:orderNo,refundPending:String(ov[row][payc]||'')==='待退款'};
  if(actor==='客人'&&isTrue_(ov[row][kc]))throw new Error('此訂單已完成 Key 單，請直接聯絡店家取消');
  var ish=ss.getSheetByName(CONFIG.sheets.items),iv=ish.getDataRange().getValues(),ih=iv[0],inc=ih.indexOf('訂單編號'),items=[];
  for(var j=1;j<iv.length;j++)if(String(iv[j][inc])===String(orderNo)){var o={};ih.forEach(function(k,x){o[k]=iv[j][x];});items.push(o);}
  restoreLimitedStock_(ss,items);restoreCouponForCancelledOrder_(ss,orderNo);
  var status=actor==='客人'?'客人取消':'店家取消';osh.getRange(row+1,sc+1).setValue(status);
  var paymentMethod=String(ov[row][pmc]||''),paymentStatus=String(ov[row][payc]||''),refundPending=paymentMethod==='LINE Pay'&&paymentStatus==='已付款';
  if(refundPending)osh.getRange(row+1,payc+1).setValue('待退款');
  ['取消時間','取消人','取消原因'].forEach(function(k){if(oh.indexOf(k)<0){osh.getRange(1,osh.getLastColumn()+1).setValue(k);oh.push(k);}});
  osh.getRange(row+1,oh.indexOf('取消時間')+1).setValue(new Date());osh.getRange(row+1,oh.indexOf('取消人')+1).setValue(actor);osh.getRange(row+1,oh.indexOf('取消原因')+1).setValue(String(reason||''));
  SpreadsheetApp.flush();return {orderNo:orderNo,refundPending:refundPending};
}
function cancelCustomerOrder_(p){
  var phone=normalizePhone_(p&&p.phone),no=String((p&&p.orderNo)||'').trim();
  if(!phone||!no)throw new Error('取消資料不完整');
  var lock=LockService.getScriptLock();lock.waitLock(20000);try{return cancelOrderCore_(SpreadsheetApp.openById(CONFIG.spreadsheetId),no,'客人',p.reason||'客人自行取消',phone);}finally{lock.releaseLock();}
}
function cancelOrderSecure_(token,no,reason){
  var user=auth_(token,['staff','admin']);var lock=LockService.getScriptLock();lock.waitLock(20000);try{return cancelOrderCore_(SpreadsheetApp.openById(CONFIG.spreadsheetId),String(no||'').trim(),'店家',(reason||'店家取消')+'｜操作：'+(user.name||user.username||''),'');}finally{lock.releaseLock();}
}
function upgradeToV381(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=ss.getSheetByName(CONFIG.sheets.orders),h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  ['取消時間','取消人','取消原因'].forEach(function(k){if(h.indexOf(k)<0){sh.getRange(1,sh.getLastColumn()+1).setValue(k);h.push(k);}});
  setSetting_('系統版本','3.8.1');return 'V38.1 完成：防重複送單＋客人/店家取消訂單＋庫存回補＋已付款待退款';
}

function upgradeToV38(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);ensureCustomerHistoryColumns_(ss);setSetting_('系統版本','3.8');return 'V38 歷史訂單查詢欄位已完成';
}

function countOrdersByPhone_(ss,phone){
  var orders=sheetObjects_(ss.getSheetByName(CONFIG.sheets.orders));
  return orders.filter(function(o){return normalizePhone_(o['聯絡電話'])===phone&&!String(o['訂單狀態']||'').includes('取消');}).length;
}

function getCustomerOrderCount_(ss,phone){
  // v36：輪盤資格以「訂單主檔」為唯一依據，不再相信可能重複或不同步的顧客紀錄。
  return countOrdersByPhone_(ss,normalizePhone_(phone));
}

function getSpinCount_(ss,phone){
  return sheetObjects_(ss.getSheetByName(CONFIG.sheets.rewards))
    .filter(function(r){return normalizePhone_(r['聯絡電話'])===phone;}).length;
}

function getRewardStatus_(ss,phone){
  var s=settingsObject_(ss),threshold=Math.max(1,Number(s['輪盤門檻']||3));
  var orderCount=getCustomerOrderCount_(ss,phone),spinCount=getSpinCount_(ss,phone);
  var earned=Math.floor(orderCount/threshold),available=Math.max(0,earned-spinCount);
  var remainder=orderCount%threshold;
  return {
    orderCount:orderCount,threshold:threshold,availableSpins:available,
    nextSpinIn:available>0?0:(remainder===0?threshold:threshold-remainder)
  };
}

function spinReward_(p){
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),phone=normalizePhone_(p.phone),orderNo=String(p.orderNo||'').trim();
    if(!phone||!orderNo)throw new Error('抽獎資料不完整');
    var orders=sheetObjects_(ss.getSheetByName(CONFIG.sheets.orders));
    var order=orders.find(function(o){return o['訂單編號']===orderNo&&normalizePhone_(o['聯絡電話'])===phone;});
    if(!order)throw new Error('找不到符合的訂單');
    var status=getRewardStatus_(ss,phone);
    if(status.availableSpins<1)throw new Error('目前沒有可用的抽獎次數');

    var settings=settingsObject_(ss);
    var eggWeight=Math.max(0,Number(settings['輪盤免費蒸蛋機率']||20));
    var discountWeight=Math.max(0,Number(settings['輪盤折5元機率']||30));
    var noWinWeight=Math.max(0,Number(settings['輪盤沒中機率']||50));
    var totalWeight=eggWeight+discountWeight+noWinWeight;
    if(totalWeight<=0){eggWeight=20;discountWeight=30;noWinWeight=50;totalWeight=100;}
    var roll=Math.random()*totalWeight;
    var reward=roll<eggWeight?'免費蒸蛋':(roll<eggWeight+discountWeight?'折抵 $5':'沒中，下次加油');
    var isWinner=reward!=='沒中，下次加油';
    var coupon=isWinner?'SAV-'+Utilities.getUuid().replace(/-/g,'').slice(0,6).toUpperCase():'';
    var days=Math.max(1,Number(settings['輪盤優惠有效天數']||30));
    var now=new Date(),expiry=isWinner?new Date(now.getTime()+days*24*60*60*1000):'';
    appendObjectRow_(ss.getSheetByName(CONFIG.sheets.rewards),{
      '抽獎時間':now,'聯絡電話':phone,'聯絡人':order['聯絡人姓名'],
      '當時下單次數':status.orderCount,'獎品':reward,'優惠碼':coupon,
      '有效期限':expiry,'使用狀態':isWinner?'未使用':'未中獎','使用訂單編號':'','使用時間':''
    });
    return {
      reward:reward,couponCode:coupon,
      expiry:isWinner?Utilities.formatDate(expiry,CONFIG.timezone,'yyyy/MM/dd'):'',
      remainingSpins:Math.max(0,status.availableSpins-1)
    };
  }finally{lock.releaseLock();}
}

function validateRewardCoupon_(ss,code,phone){
  code=String(code||'').trim().toUpperCase();
  if(!code)return null;
  var sh=ss.getSheetByName(CONFIG.sheets.rewards),values=sh.getDataRange().getValues();
  if(values.length<2)throw new Error('優惠碼不存在');
  var h=values[0],codeCol=h.indexOf('優惠碼'),phoneCol=h.indexOf('聯絡電話'),rewardCol=h.indexOf('獎品'),
      expiryCol=h.indexOf('有效期限'),statusCol=h.indexOf('使用狀態');
  for(var i=1;i<values.length;i++){
    if(String(values[i][codeCol]).trim().toUpperCase()!==code)continue;
    if(normalizePhone_(values[i][phoneCol])!==phone)throw new Error('優惠碼與聯絡電話不符');
    if(String(values[i][statusCol])!=='未使用')throw new Error('此優惠碼已使用或失效');
    var expiry=values[i][expiryCol] instanceof Date?values[i][expiryCol]:new Date(values[i][expiryCol]);
    if(!isNaN(expiry.getTime())&&expiry.getTime()<new Date().setHours(0,0,0,0))throw new Error('此優惠碼已過期');
    return {rowIndex:i+1,code:code,reward:String(values[i][rewardCol])};
  }
  throw new Error('優惠碼不存在');
}

function markRewardUsed_(ss,rowIndex,orderNo,now){
  var sh=ss.getSheetByName(CONFIG.sheets.rewards),h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  sh.getRange(rowIndex,h.indexOf('使用狀態')+1).setValue('已使用');
  sh.getRange(rowIndex,h.indexOf('使用訂單編號')+1).setValue(orderNo);
  sh.getRange(rowIndex,h.indexOf('使用時間')+1).setValue(now);
}

function getFloorSort_(ss,m,b,f){var r=sheetObjects_(ss.getSheetByName(CONFIG.sheets.malls)).find(function(x){return x['百貨']===m&&x['館別']===b&&x['樓層']===f;});return r?Number(r['百貨排序'])*10000+Number(r['館別排序'])*100+Number(r['樓層排序']):999999;}
function normalizeDeliveryDate_(value){
  if(value instanceof Date)return Utilities.formatDate(value,CONFIG.timezone,'yyyy-MM-dd');
  var s=String(value||'').trim().replace(/\//g,'-');
  var m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(!m)return '';
  return m[1]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[3]).slice(-2);
}
function formatDeliveryDateDisplay_(value){
  var s=normalizeDeliveryDate_(value);if(!s)return '日期未設定';
  var p=s.split('-');return Number(p[1])+'/'+Number(p[2]);
}

function validateOrder_(p){if(!p||!p.deliveryDate||!p.mall||!p.building||!p.floor||!p.counterName||!p.contactName||!p.contactPhone||!p.mealPeriod||!p.paymentMethod||!p.invoiceType)throw new Error('請完整填寫送餐日期、配送、聯絡、餐期、付款及發票資料');var delivery=normalizeDeliveryDate_(p.deliveryDate),today=Utilities.formatDate(new Date(),CONFIG.timezone,'yyyy-MM-dd');if(!delivery)throw new Error('送餐日期格式不正確');if(delivery<today)throw new Error('送餐日期不能選過去日期');var availability=getOrderAvailability_(delivery,p.mealPeriod);if(!availability.open)throw new Error(availability.message);if(p.invoiceType==='手機條碼載具'&&!String(p.invoiceCarrier||'').trim())throw new Error('請輸入手機條碼載具');if(!/^[0-9+()\-\s]{8,20}$/.test(String(p.contactPhone)))throw new Error('聯絡電話格式不正確');if(!Array.isArray(p.items)||!p.items.some(function(x){return Number(x.qty)>0;}))throw new Error('請至少選擇一項餐點');validateAddonRules_(p.items);}
function validateAddonRules_(items){
  items=Array.isArray(items)?items:[];
  var regularQty=0,economicQty=0,addonQty=0;
  items.forEach(function(it){
    var category=String(it.category||'');
    var qty=Math.max(0,Number(it.qty)||0);
    var isAddon=category==='餐盒加購優惠'||category.indexOf('加購')>=0;
    var isEconomic=category.indexOf('外送百元')>=0||category.indexOf('百元')>=0;
    var isRegular=category.indexOf('餐盒')>=0&&!isEconomic&&!isAddon;
    if(isAddon)addonQty+=qty;
    else if(isEconomic)economicQty+=qty;
    else if(isRegular)regularQty+=qty;
  });
  if(addonQty>0&&regularQty===0){
    throw new Error(economicQty>0?'百元外送餐盒不提供「餐盒加購優惠」':'餐盒加購優惠需搭配一般餐盒');
  }
  if(addonQty>regularQty)throw new Error('餐盒加購優惠數量不可超過一般餐盒份數');
  return true;
}

function decrementLimitedStock_(ss,items){
  var sh=ss.getSheetByName(CONFIG.sheets.menu),v=sh.getDataRange().getValues(),h=v[0];
  var nc=h.indexOf('品項'),ec=h.indexOf('啟用'),lc=h.indexOf('限量品'),sc=h.indexOf('每日庫存'),soc=h.indexOf('今日售完');
  items.filter(function(x){return Number(x.qty)>0;}).forEach(function(it){
    var found=false;
    for(var i=1;i<v.length;i++){
      if(String(v[i][nc]).trim()!==String(it.name).trim())continue;
      found=true;
      if(ec>=0&&isFalse_(v[i][ec]))throw new Error(it.name+'目前已停止販售');
      if(soc>=0&&isTrue_(v[i][soc]))throw new Error(it.name+'今日已售完');
      if(!isTrue_(v[i][lc]))break;
      var stock=Number(v[i][sc]||0),qty=Number(it.qty||0);
      if(stock<qty)throw new Error(it.name+'庫存不足，目前只剩 '+stock+' 份');
      var left=stock-qty; sh.getRange(i+1,sc+1).setValue(left); v[i][sc]=left;
      if(soc>=0&&left<=0){sh.getRange(i+1,soc+1).setValue(true);v[i][soc]=true;}
      break;
    }
    if(!found)throw new Error('找不到商品：'+it.name);
  });
}


/** v35 商品管理與客人改單 */
function upgradeToV35(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=createSheet_(ss,CONFIG.sheets.menu,['啟用','分類排序','分類','品項排序','品項','價格','限量品','每日庫存','飯量可選','今日售完','預設庫存','庫存警戒值','顯示庫存']);
  var v=sh.getDataRange().getValues(),h=v[0],lc=h.indexOf('限量品'),sc=h.indexOf('每日庫存'),soc=h.indexOf('今日售完'),dc=h.indexOf('預設庫存'),wc=h.indexOf('庫存警戒值'),vc=h.indexOf('顯示庫存');
  for(var i=1;i<v.length;i++){
    var limited=isTrue_(v[i][lc]),stock=Number(v[i][sc]||0);
    if(v[i][soc]==='')sh.getRange(i+1,soc+1).setValue(false);
    if(v[i][dc]==='')sh.getRange(i+1,dc+1).setValue(limited?stock:'');
    if(v[i][wc]==='')sh.getRange(i+1,wc+1).setValue(limited?5:'');
    if(v[i][vc]==='')sh.getRange(i+1,vc+1).setValue(limited);
  }
  createSheet_(ss,CONFIG.sheets.orders,['最後修改時間','修改次數']);
  setSetting_('系統版本','3.5');
  return 'v35 升級完成';
}
function upgradeToV361(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  createSheet_(ss,CONFIG.sheets.orders,['送餐日期']);
  var sh=ss.getSheetByName(CONFIG.sheets.orders),v=sh.getDataRange().getValues(),h=v[0];
  var dc=h.indexOf('送餐日期'),cc=h.indexOf('建立時間'),filled=0;
  for(var i=1;i<v.length;i++){
    if(!v[i][dc]&&v[i][cc]){
      var created=v[i][cc] instanceof Date?v[i][cc]:new Date(v[i][cc]);
      if(!isNaN(created.getTime())){sh.getRange(i+1,dc+1).setValue(Utilities.formatDate(created,CONFIG.timezone,'yyyy-MM-dd'));filled++;}
    }
  }
  setSetting_('系統版本','3.6.1');
  return 'v36.1 升級完成，已補入送餐日期欄位；舊訂單補日期 '+filled+' 筆';
}

function isTrue_(v){return v===true||String(v).trim().toUpperCase()==='TRUE';}
function isFalse_(v){return v===false||String(v).trim().toUpperCase()==='FALSE';}
function getInventoryList_(token){
  auth_(token,['staff','admin']); var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  return sheetObjects_(ss.getSheetByName(CONFIG.sheets.menu)).map(function(r){var limited=isTrue_(r['限量品']),stock=Number(r['每日庫存']||0);return {name:r['品項'],category:r['分類'],price:Number(r['價格']||0),enabled:!isFalse_(r['啟用']),limited:limited,stock:stock,defaultStock:Number(r['預設庫存']||stock||0),warningStock:Number(r['庫存警戒值']||5),displayStock:isTrue_(r['顯示庫存']),soldOut:isTrue_(r['今日售完'])||(limited&&stock<=0)};});
}
function updateInventoryItem_(token,itemName,changes){
  auth_(token,['staff','admin']); var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=ss.getSheetByName(CONFIG.sheets.menu),v=sh.getDataRange().getValues(),h=v[0];
  var nc=h.indexOf('品項'),ec=h.indexOf('啟用'),lc=h.indexOf('限量品'),sc=h.indexOf('每日庫存'),soc=h.indexOf('今日售完'),dc=h.indexOf('預設庫存'),wc=h.indexOf('庫存警戒值'),vc=h.indexOf('顯示庫存');
  for(var i=1;i<v.length;i++)if(String(v[i][nc]).trim()===String(itemName).trim()){
    var r=i+1;
    if(changes.enabled!==undefined)sh.getRange(r,ec+1).setValue(!!changes.enabled);
    if(changes.limited!==undefined)sh.getRange(r,lc+1).setValue(!!changes.limited);
    if(changes.stock!==undefined){var s=Math.max(0,Math.floor(Number(changes.stock)||0));sh.getRange(r,sc+1).setValue(s);if(s>0)sh.getRange(r,soc+1).setValue(false);if(s===0&&isTrue_(v[i][lc]))sh.getRange(r,soc+1).setValue(true);}
    if(changes.soldOut!==undefined)sh.getRange(r,soc+1).setValue(!!changes.soldOut);
    if(changes.defaultStock!==undefined&&dc>=0)sh.getRange(r,dc+1).setValue(Math.max(0,Math.floor(Number(changes.defaultStock)||0)));
    if(changes.warningStock!==undefined&&wc>=0)sh.getRange(r,wc+1).setValue(Math.max(0,Math.floor(Number(changes.warningStock)||0)));
    if(changes.displayStock!==undefined&&vc>=0)sh.getRange(r,vc+1).setValue(!!changes.displayStock);
    SpreadsheetApp.flush(); return getInventoryList_(token).filter(function(x){return x.name===itemName;})[0];
  }
  throw new Error('找不到商品：'+itemName);
}
function restockAllLimitedItems_(token){
  auth_(token,['staff','admin']);var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=ss.getSheetByName(CONFIG.sheets.menu),v=sh.getDataRange().getValues(),h=v[0],lc=h.indexOf('限量品'),sc=h.indexOf('每日庫存'),soc=h.indexOf('今日售完'),dc=h.indexOf('預設庫存'),n=0;
  for(var i=1;i<v.length;i++)if(isTrue_(v[i][lc])){var s=Number(v[i][dc]||v[i][sc]||0);sh.getRange(i+1,sc+1).setValue(s);sh.getRange(i+1,soc+1).setValue(s<=0);n++;}
  return {updated:n};
}
function restoreLimitedStock_(ss,items){
  var sh=ss.getSheetByName(CONFIG.sheets.menu),v=sh.getDataRange().getValues(),h=v[0],nc=h.indexOf('品項'),lc=h.indexOf('限量品'),sc=h.indexOf('每日庫存'),soc=h.indexOf('今日售完');
  items.forEach(function(it){for(var i=1;i<v.length;i++)if(String(v[i][nc]).trim()===String(it['品項']||it.name).trim()&&isTrue_(v[i][lc])){var s=Number(v[i][sc]||0)+Number(it['數量']||it.qty||0);sh.getRange(i+1,sc+1).setValue(s);if(s>0&&soc>=0)sh.getRange(i+1,soc+1).setValue(false);break;}});
}
function updateCustomerOrder_(p){
var lineIdentity=null;
p.lineUserId='';
p.lineDisplayName='';
  var no=String(p.orderNo||'').trim(),phone=normalizePhone_(p.originalPhone||p.contactPhone);if(!no||!phone)throw new Error('缺少訂單編號或電話');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),osh=ss.getSheetByName(CONFIG.sheets.orders),ov=osh.getDataRange().getValues(),oh=ov[0];
    var nc=oh.indexOf('訂單編號'),pc=oh.indexOf('聯絡電話'),kc=oh.indexOf('POS已Key'),luc=oh.indexOf('LINE User ID'),row=-1;
    for(var i=1;i<ov.length;i++)if(String(ov[i][nc])===no){row=i;break;}
    if(row<0)throw new Error('找不到訂單');
    if(normalizePhone_(ov[row][pc])!==phone)throw new Error('聯絡電話不符，無法修改');
    // LINE 登入驗證目前停用：改單以訂單編號 + 原聯絡電話驗證，不再檢查 LINE User ID。
    if(isTrue_(ov[row][kc]))throw new Error('此訂單已完成 Key 單，請直接來電 04-22070520');
    var fixed=normalizeLocation_(ss,p.mall,p.building,p.floor);p.building=fixed.building;p.floor=fixed.floor;p.contactPhone=normalizePhone_(p.contactPhone);validateOrder_(p);
    var ish=ss.getSheetByName(CONFIG.sheets.items),iv=ish.getDataRange().getValues(),ih=iv[0],inc=ih.indexOf('訂單編號'),old=[];
    for(var j=1;j<iv.length;j++)if(String(iv[j][inc])===no){var o={};ih.forEach(function(k,x){o[k]=iv[j][x];});old.push(o);}
    restoreLimitedStock_(ss,old); decrementLimitedStock_(ss,p.items);
    for(var j=iv.length-1;j>=1;j--)if(String(iv[j][inc])===no)ish.deleteRow(j+1);
    var rows=p.items.filter(function(x){return Number(x.qty)>0;}).map(function(x){return [no,x.category,x.name,Number(x.price),Number(x.qty),x.riceOption||'',Number(x.price)*Number(x.qty)];});
    if(rows.length)ish.getRange(ish.getLastRow()+1,1,rows.length,7).setValues(rows);
    var subtotal=p.items.reduce(function(s,x){return s+Number(x.price)*Number(x.qty);},0),map={'送餐日期':normalizeDeliveryDate_(p.deliveryDate),'餐期':p.mealPeriod,'百貨':p.mall,'館別':p.building,'樓層':p.floor,'樓層排序':getFloorSort_(ss,p.mall,p.building,p.floor),'櫃位/品牌':p.counterName,'聯絡人姓名':p.contactName,'聯絡電話':p.contactPhone,'發票方式':p.invoiceType,'發票載具':p.invoiceCarrier||'','付款方式':p.paymentMethod,'LINE Pay後三碼':'','付款狀態':p.paymentMethod==='LINE Pay'?'等待付款':'待確認','總金額':subtotal,'訂單備註':p.note||'','配菜許願':String(p.sideDishWish||'').trim(),'LINE User ID':p.lineUserId,'LINE 顯示名稱':p.lineDisplayName,'LINE驗證時間':new Date(),'最後修改時間':new Date(),'修改次數':Number(ov[row][oh.indexOf('修改次數')]||0)+1};
    Object.keys(map).forEach(function(k){var c=oh.indexOf(k);if(c>=0)osh.getRange(row+1,c+1).setValue(map[k]);});
    try{sendLineOrderNotification_('✏️修改 '+no,p,subtotal);}catch(ignore){}
    return {orderNo:no,total:subtotal};
  }finally{lock.releaseLock();}
}


/** v36 輪盤統計修正：以訂單主檔計算、統一電話格式、重建顧客紀錄 */
function upgradeToV36(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  ensureRewardSettings_(ss);
  var result=rebuildCustomerRecordsV36_(ss);
  setSetting_('系統版本','3.6');
  return 'v36 升級完成：已整理 '+result.customers+' 位顧客、統計 '+result.orders+' 張訂單';
}

function rebuildCustomerRecordsV36_(ss){
  ss=ss||SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var orderRows=sheetObjectsRaw_(ss.getSheetByName(CONFIG.sheets.orders));
  var customerMap={};
  orderRows.forEach(function(o){
    var phone=normalizePhone_(o['聯絡電話']);
    if(!phone)return;
    var created=o['建立時間'] instanceof Date?o['建立時間']:new Date(o['建立時間']);
    var current=customerMap[phone]||{phone:phone,name:'',count:0,last:null};
    current.count++;
    if(String(o['聯絡人姓名']||'').trim())current.name=String(o['聯絡人姓名']).trim();
    if(!isNaN(created.getTime())&&(!current.last||created>current.last))current.last=created;
    customerMap[phone]=current;
  });
  var sh=ss.getSheetByName(CONFIG.sheets.customers)||createSheet_(ss,CONFIG.sheets.customers,['聯絡電話','聯絡人','累積下單次數','最後下單時間','更新時間']);
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,Math.max(5,sh.getLastColumn())).clearContent();
  var now=new Date();
  var rows=Object.keys(customerMap).sort().map(function(phone){
    var c=customerMap[phone];
    return [c.phone,c.name,c.count,c.last||'',now];
  });
  if(rows.length)sh.getRange(2,1,rows.length,5).setValues(rows);
  return {customers:rows.length,orders:orderRows.length};
}

function hashPassword_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(function (b) {
      const value = b < 0 ? b + 256 : b;
      return ('0' + value.toString(16)).slice(-2);
    })
    .join('');
}

/** v37.1 LINE Pay 後三碼核對 */
function upgradeToV371(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  createSheet_(ss,CONFIG.sheets.orders,['LINE Pay後三碼']);
  setSetting_('系統版本','3.7.1');
  return 'v37.1 升級完成：已新增 LINE Pay 後三碼欄位與付款核對功能';
}


/** v37.2 營業狀態與前台公告 */
function businessSettingKeys_(){
  return ['營業狀態','公告啟用','公告彈窗','公告跑馬燈','公告標題','公告內容','公告開始日期','公告結束日期'];
}
function ensureBusinessSettings_(ss){
  var defaults={
    '營業狀態':'OPEN','公告啟用':'FALSE','公告彈窗':'FALSE','公告跑馬燈':'FALSE',
    '公告標題':'','公告內容':'','公告開始日期':'','公告結束日期':''
  };
  var current=settingsObject_(ss);
  Object.keys(defaults).forEach(function(k){if(current[k]===undefined)setSetting_(k,defaults[k]);});
}
function getBusinessSettingsSecure_(token){
  auth_(token,['staff','admin']);
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);ensureBusinessSettings_(ss);
  var all=settingsObject_(ss),result={};
  businessSettingKeys_().forEach(function(k){result[k]=all[k]||'';});
  if(!result['營業狀態'])result['營業狀態']='OPEN';
  return result;
}
function updateBusinessSettingsSecure_(token,settings){
  auth_(token,['staff','admin']);
  var allowed=['OPEN','LUNCH_CLOSED','DINNER_CLOSED','CLOSED','ANNOUNCEMENT'];
  var status=String(settings['營業狀態']||'OPEN');
  if(allowed.indexOf(status)===-1)throw new Error('營業狀態不正確');
  var start=normalizeDeliveryDate_(settings['公告開始日期']),end=normalizeDeliveryDate_(settings['公告結束日期']);
  if(start&&end&&end<start)throw new Error('公告結束日期不能早於開始日期');
  var clean={
    '營業狀態':status,
    '公告啟用':isTrue_(settings['公告啟用'])?'TRUE':'FALSE',
    '公告彈窗':isTrue_(settings['公告彈窗'])?'TRUE':'FALSE',
    '公告跑馬燈':isTrue_(settings['公告跑馬燈'])?'TRUE':'FALSE',
    '公告標題':String(settings['公告標題']||'').slice(0,60),
    '公告內容':String(settings['公告內容']||'').slice(0,300),
    '公告開始日期':start,
    '公告結束日期':end
  };
  Object.keys(clean).forEach(function(k){setSetting_(k,clean[k]);});
  return getBusinessSettingsSecure_(token);
}
function getOrderAvailability_(deliveryDate,mealPeriod){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);ensureBusinessSettings_(ss);
  var s=settingsObject_(ss),status=String(s['營業狀態']||'OPEN');
  var date=normalizeDeliveryDate_(deliveryDate),start=normalizeDeliveryDate_(s['公告開始日期']),end=normalizeDeliveryDate_(s['公告結束日期']);
  var active=!!date&&(!start||date>=start)&&(!end||date<=end);
  if(!active)return {open:true,message:''};
  if(status==='CLOSED')return {open:false,message:'目前店休，暫停接受訂單'};
  if(status==='LUNCH_CLOSED'&&mealPeriod==='午餐')return {open:false,message:'本日午餐暫停接單'};
  if(status==='DINNER_CLOSED'&&mealPeriod==='晚餐')return {open:false,message:'本日晚餐暫停接單'};
  return {open:true,message:''};
}
function upgradeToV372(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  ensureBusinessSettings_(ss);
  setSetting_('系統版本','3.7.2');
  return 'v37.2 升級完成：已新增營業開關、店休、午晚餐暫停、公告彈窗與跑馬燈';
}


/** v37.5 LINE Login 安全驗證 */
function lineLoginConfig_(){
  var props=PropertiesService.getScriptProperties();
  var channelId=String(props.getProperty('LINE_LOGIN_CHANNEL_ID')||'').trim();
  var channelSecret=String(props.getProperty('LINE_LOGIN_CHANNEL_SECRET')||'').trim();
  var callbackUrl=String(props.getProperty('LINE_LOGIN_CALLBACK_URL')||'').trim();
  if(!channelId)throw new Error('尚未設定 Script Property：LINE_LOGIN_CHANNEL_ID');
  if(!channelSecret)throw new Error('尚未設定 Script Property：LINE_LOGIN_CHANNEL_SECRET');
  if(!callbackUrl)throw new Error('尚未設定 Script Property：LINE_LOGIN_CALLBACK_URL');
  return {channelId:channelId,channelSecret:channelSecret,callbackUrl:callbackUrl};
}
function lineSigningSecret_(){
  var props=PropertiesService.getScriptProperties();
  var secret=String(props.getProperty('LINE_AUTH_SIGNING_SECRET')||'').trim();
  if(!secret){secret=Utilities.getUuid()+Utilities.getUuid();props.setProperty('LINE_AUTH_SIGNING_SECRET',secret);}
  return secret;
}
function b64urlEncodeString_(value){return Utilities.base64EncodeWebSafe(String(value),Utilities.Charset.UTF_8).replace(/=+$/,'');}
function b64urlDecodeString_(value){return Utilities.newBlob(Utilities.base64DecodeWebSafe(String(value))).getDataAsString();}
function hmacB64url_(value,secret){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(value),String(secret))).replace(/=+$/,'');}
function secureEqual_(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function makeSignedToken_(payload,secret){var body=b64urlEncodeString_(JSON.stringify(payload));return body+'.'+hmacB64url_(body,secret);}
function readSignedToken_(token,secret){
  var parts=String(token||'').split('.');if(parts.length!==2)throw new Error('LINE 驗證憑證格式錯誤');
  var expected=hmacB64url_(parts[0],secret);if(!secureEqual_(expected,parts[1]))throw new Error('LINE 驗證憑證無效');
  var payload=JSON.parse(b64urlDecodeString_(parts[0]));
  if(!payload.exp||Date.now()>Number(payload.exp))throw new Error('LINE 驗證已過期，請重新登入');
  return payload;
}
function createLineLoginState_(){
  var now=Date.now();
  var nonce=Utilities.getUuid();
  var token=makeSignedToken_({type:'line_oauth_state',nonce:nonce,iat:now,exp:now+10*60*1000},lineSigningSecret_());
  CacheService.getScriptCache().put('line_oauth_state_'+nonce,'1',600);
  return token;
}
function verifyLineLoginState_(state){
  var p=readSignedToken_(state,lineSigningSecret_());
  if(p.type!=='line_oauth_state'||!p.nonce)throw new Error('LINE 登入 state 無效');
  var cache=CacheService.getScriptCache(), key='line_oauth_state_'+p.nonce;
  if(cache.get(key)!=='1')throw new Error('LINE 登入驗證已失效，請重新登入');
  cache.remove(key);
  return p;
}
function exchangeLineLoginCode_(code,redirectUri,state){
  verifyLineLoginState_(state);
  code=String(code||'').trim();redirectUri=String(redirectUri||'').trim();
  if(!code)throw new Error('LINE 未回傳授權碼');
  var cfg=lineLoginConfig_();
  if(redirectUri!==cfg.callbackUrl)throw new Error('LINE Callback URL 不一致');
  var tokenRes=UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/token',{
    method:'post',contentType:'application/x-www-form-urlencoded',muteHttpExceptions:true,
    payload:{grant_type:'authorization_code',code:code,redirect_uri:redirectUri,client_id:cfg.channelId,client_secret:cfg.channelSecret}
  });
  if(tokenRes.getResponseCode()!==200)throw new Error('LINE Token 交換失敗：'+safeLineError_(tokenRes.getContentText()));
  var tokenData=JSON.parse(tokenRes.getContentText()||'{}'),accessToken=String(tokenData.access_token||'');
  if(!accessToken)throw new Error('LINE 未回傳 Access Token');

  var verifyRes=UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(accessToken),{muteHttpExceptions:true});
  if(verifyRes.getResponseCode()!==200)throw new Error('LINE Access Token 驗證失敗');
  var verified=JSON.parse(verifyRes.getContentText()||'{}');
  if(String(verified.client_id)!==cfg.channelId||Number(verified.expires_in||0)<=0)throw new Error('LINE Access Token 不屬於本點餐系統');

  var profileRes=UrlFetchApp.fetch('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+accessToken},muteHttpExceptions:true});
  if(profileRes.getResponseCode()!==200)throw new Error('無法取得 LINE 使用者資料');
  var profile=JSON.parse(profileRes.getContentText()||'{}');
  if(!profile.userId)throw new Error('LINE 使用者資料不完整');

  var now=Date.now(),expiresAt=now+30*24*60*60*1000;
  var authToken=makeSignedToken_({type:'line_auth',userId:String(profile.userId),displayName:String(profile.displayName||''),iat:now,exp:expiresAt},lineSigningSecret_());
  return {user:{userId:String(profile.userId),displayName:String(profile.displayName||'')},authToken:authToken,expiresAt:expiresAt};
}
function safeLineError_(text){try{var o=JSON.parse(String(text||'{}'));return String(o.error_description||o.error||'請確認 LINE Login 設定');}catch(e){return '請確認 LINE Login 設定';}}
function requireLineAuth_(token){
  var p=readSignedToken_(token,lineSigningSecret_());
  if(p.type!=='line_auth'||!p.userId)throw new Error('請先完成 LINE 登入驗證');
  return {userId:String(p.userId),displayName:String(p.displayName||'')};
}
function upgradeToV375(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  createSheet_(ss,CONFIG.sheets.orders,['LINE User ID','LINE 顯示名稱','LINE驗證時間']);
  var props=PropertiesService.getScriptProperties();
  if(!props.getProperty('LINE_LOGIN_CHANNEL_ID'))props.setProperty('LINE_LOGIN_CHANNEL_ID','2011074058');
  if(!props.getProperty('LINE_LOGIN_CALLBACK_URL'))props.setProperty('LINE_LOGIN_CALLBACK_URL','https://a0980778082-coder.github.io/savage-order/line-callback.html');
  lineSigningSecret_();
  setSetting_('系統版本','3.7.5');
  return 'v37.5 升級完成。下一步請到「專案設定 → 指令碼屬性」新增 LINE_LOGIN_CHANNEL_SECRET。';
}


/** v37.7 百元外送餐盒加購規則修正 */
function upgradeToV377(){
  setSetting_('系統版本','3.7.7');
  return 'v37.7 升級完成：百元外送餐盒不可使用餐盒加購優惠，且加購數量不得超過一般餐盒份數';
}


/** v37.8 LINE 驗證正式綁定訂單 */
function upgradeToV378(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  createSheet_(ss,CONFIG.sheets.orders,['LINE User ID','LINE 顯示名稱','LINE驗證時間']);
  lineSigningSecret_();
  setSetting_('系統版本','3.7.8');
  return 'v37.8 完成：未驗證 LINE 無法送單；LINE 身分由後端驗證並寫入訂單主檔；員工 POS 可查看 LINE 名稱與 User ID。';
}

function upgradeToV379(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  createSheet_(ss,CONFIG.sheets.orders,['LINE User ID','LINE 顯示名稱','LINE驗證時間']);
  lineSigningSecret_();
  setSetting_('系統版本','3.7.9');
  return 'v37.9 完成：修正 LINE 內建瀏覽器登入跳轉造成 state 遺失。';
}


function upgradeToV382(){
  setSetting_('系統版本','3.8.2');
  return 'V38.2 完成：歷史訂單改為僅需聯絡手機查詢，不再要求4碼密碼';
}


// ===== V39 智慧配送 =====
function upgradeToV39(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  createSheet_(ss,CONFIG.sheets.mallGeo,['tenantId','百貨','緯度','經度','抵達半徑公尺','更新時間']);
  createSheet_(ss,CONFIG.sheets.deliveries,['tenantId','配送任務ID','送餐日期','百貨','狀態','開始時間','抵達時間','完成時間','操作人']);
  createSheet_(ss,CONFIG.sheets.orders,['配送任務ID','配送狀態','配送更新時間','tenantId']);
  setSetting_('系統版本','3.9');setSetting_('tenantId','SAVAGE001');
  return 'V39 智慧配送初始化完成';
}
function tenantId_(ss){var s=settingsObject_(ss);return String(s.tenantId||'SAVAGE001');}
function getDeliveryConfig_(token){auth_(token,['staff','admin']);var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=ss.getSheetByName(CONFIG.sheets.mallGeo);if(!sh)return [];return sheetObjectsRaw_(sh).map(function(r){return {mall:String(r['百貨']||''),lat:Number(r['緯度']||0),lng:Number(r['經度']||0),radius:Number(r['抵達半徑公尺']||150)};}).filter(function(r){return r.mall;});}
function saveDeliveryConfig_(token,p){auth_(token,['staff','admin']);var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=createSheet_(ss,CONFIG.sheets.mallGeo,['tenantId','百貨','緯度','經度','抵達半徑公尺','更新時間']),mall=String(p.mall||'').trim(),lat=Number(p.lat),lng=Number(p.lng),radius=Math.max(50,Math.min(1000,Number(p.radius)||150));if(!mall||!isFinite(lat)||!isFinite(lng))throw new Error('百貨座標資料不完整');var v=sh.getDataRange().getValues(),h=v[0],mc=h.indexOf('百貨');for(var i=1;i<v.length;i++)if(String(v[i][mc])===mall){sh.getRange(i+1,1,1,h.length).setValues([[tenantId_(ss),mall,lat,lng,radius,new Date()]]);return true;}sh.appendRow([tenantId_(ss),mall,lat,lng,radius,new Date()]);return true;}
function startDeliveryTrip_(token,mall,date){var u=auth_(token,['staff','admin']),ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),sh=createSheet_(ss,CONFIG.sheets.deliveries,['tenantId','配送任務ID','送餐日期','百貨','狀態','開始時間','抵達時間','完成時間','操作人']);if(!mall||!date)throw new Error('請選擇百貨與送餐日期');var id='TRIP-'+Utilities.formatDate(new Date(),CONFIG.timezone,'yyyyMMdd-HHmmss');sh.appendRow([tenantId_(ss),id,date,mall,'配送中',new Date(),'','',u.name||u.username||'']);updateMallDeliveryOrders_(ss,id,date,mall,'配送中');return {tripId:id,mall:mall};}
function arriveDeliveryTrip_(token,id){auth_(token,['staff','admin']);var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),trip=findTripRow_(ss,id);if(!trip)throw new Error('找不到配送任務');trip.sheet.getRange(trip.row,trip.statusCol).setValue('已抵達百貨');trip.sheet.getRange(trip.row,trip.arriveCol).setValue(new Date());var n=updateMallDeliveryOrders_(ss,id,trip.date,trip.mall,'已抵達百貨');return {updated:n};}
function finishDeliveryTrip_(token,id){auth_(token,['staff','admin']);var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId),trip=findTripRow_(ss,id);if(!trip)throw new Error('找不到配送任務');trip.sheet.getRange(trip.row,trip.statusCol).setValue('配送完成');trip.sheet.getRange(trip.row,trip.finishCol).setValue(new Date());return true;}
function findTripRow_(ss,id){var sh=ss.getSheetByName(CONFIG.sheets.deliveries);if(!sh)return null;var v=sh.getDataRange().getValues(),h=v[0],ic=h.indexOf('配送任務ID'),dc=h.indexOf('送餐日期'),mc=h.indexOf('百貨'),sc=h.indexOf('狀態'),ac=h.indexOf('抵達時間'),fc=h.indexOf('完成時間');for(var i=1;i<v.length;i++)if(String(v[i][ic])===String(id))return {sheet:sh,row:i+1,date:normalizeDeliveryDate_(v[i][dc]),mall:String(v[i][mc]),statusCol:sc+1,arriveCol:ac+1,finishCol:fc+1};return null;}
function updateMallDeliveryOrders_(ss,tripId,date,mall,status){var sh=ss.getSheetByName(CONFIG.sheets.orders),v=sh.getDataRange().getValues(),h=v[0],dc=h.indexOf('送餐日期'),mc=h.indexOf('百貨'),sc=h.indexOf('訂單狀態'),tc=h.indexOf('配送任務ID'),dsc=h.indexOf('配送狀態'),duc=h.indexOf('配送更新時間'),cc=h.indexOf('tenantId'),n=0;for(var i=1;i<v.length;i++){var od=normalizeDeliveryDate_(v[i][dc]),st=String(v[i][sc]||'');if(od===date&&String(v[i][mc])===mall&&!st.includes('取消')&&st!=='已送達'){if(tc>=0)sh.getRange(i+1,tc+1).setValue(tripId);if(dsc>=0)sh.getRange(i+1,dsc+1).setValue(status);if(duc>=0)sh.getRange(i+1,duc+1).setValue(new Date());if(cc>=0&&!v[i][cc])sh.getRange(i+1,cc+1).setValue(tenantId_(ss));if(status==='配送中'||status==='已抵達百貨')sh.getRange(i+1,sc+1).setValue(status);n++;}}return n;}


// ===== V39.2 配送百貨清單修正 =====
function getDeliveryConfigBundle_(token){
  auth_(token,['staff','admin']);
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var geoSh=ss.getSheetByName(CONFIG.sheets.mallGeo);
  var rows=[];
  if(geoSh){
    rows=sheetObjectsRaw_(geoSh).map(function(r){
      return {mall:String(r['百貨']||'').trim(),lat:Number(r['緯度']||0),lng:Number(r['經度']||0),radius:Number(r['抵達半徑公尺']||150)};
    }).filter(function(r){return r.mall;});
  }

  var mallSh=ss.getSheetByName(CONFIG.sheets.malls);
  var malls=[];
  if(mallSh){
    var list=sheetObjectsRaw_(mallSh);
    var seen={};
    list.forEach(function(r){
      var name=String(r['百貨']||r['百貨商場']||r['商場']||'').trim();
      if(name&&!seen[name]){seen[name]=true;malls.push(name);}
    });
  }
  // 即使百貨樓層資料暫時沒有，也把已經儲存過 GPS 的百貨保留在清單內。
  rows.forEach(function(r){if(r.mall&&malls.indexOf(r.mall)<0)malls.push(r.mall);});
  malls.sort();
  return {rows:rows,malls:malls};
}

function upgradeToV392(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  createSheet_(ss,CONFIG.sheets.mallGeo,['tenantId','百貨','緯度','經度','抵達半徑公尺','更新時間']);
  createSheet_(ss,CONFIG.sheets.deliveries,['tenantId','配送任務ID','送餐日期','百貨','狀態','開始時間','抵達時間','完成時間','操作人']);
  setSetting_('系統版本','3.9.2');
  return 'V39.2 完成：智慧配送百貨清單改由後端直接讀取「百貨樓層」資料';
}


// ==================== V4.0.6 LINE Pay 網站付款 ====================
function upgradeToV406LinePay(){
  var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
  createSheet_(ss,CONFIG.sheets.orders,['LINE Pay交易編號','LINE Pay付款時間']);
  setSetting_('系統版本','4.0.6');
  return 'V4.0.6 LINE Pay 線上付款欄位建立完成';
}

function linePayConfig_(){
  var p=PropertiesService.getScriptProperties();
  var id=String(p.getProperty('LINEPAY_CHANNEL_ID')||'').trim();
  var secret=String(p.getProperty('LINEPAY_CHANNEL_SECRET')||'').trim();
  var env=String(p.getProperty('LINEPAY_ENV')||'PRODUCTION').trim().toUpperCase();
  if(!id||!secret)throw new Error('尚未設定 LINEPAY_CHANNEL_ID / LINEPAY_CHANNEL_SECRET');
  return {channelId:id,channelSecret:secret,base:env==='SANDBOX'?'https://sandbox-api-pay.line.me':'https://api-pay.line.me'};
}

function linePayWebAppUrl_(){
  return ScriptApp.getService().getUrl();
}

function linePayRequest_(orderNo,amount,p){
  var c=linePayConfig_();
  var callback=linePayWebAppUrl_();
  if(!callback)throw new Error('Apps Script 尚未部署為網頁應用程式');
  var body={
    productName:'小野人餐盒 '+orderNo,
    productImageUrl:'https://a0980778082-coder.github.io/savage-order/icon-192.svg',
    amount:Number(amount),currency:'TWD',orderId:String(orderNo),
    confirmUrl:callback+'?action=linePayConfirm&orderNo='+encodeURIComponent(orderNo),
    cancelUrl:callback+'?action=linePayCancel&orderNo='+encodeURIComponent(orderNo),
    capture:true,confirmUrlType:'CLIENT',langCd:'zh-Hant',
    deliveryPlacePhone:String(p.contactPhone||'')
  };
  var res=UrlFetchApp.fetch(c.base+'/v2/payments/request',{
    method:'post',contentType:'application/json; charset=UTF-8',
    headers:{'X-LINE-ChannelId':c.channelId,'X-LINE-ChannelSecret':c.channelSecret},
    payload:JSON.stringify(body),muteHttpExceptions:true
  });
  var data;try{data=JSON.parse(res.getContentText());}catch(e){throw new Error('LINE Pay 回傳格式錯誤');}
  if(String(data.returnCode)!=='0000')throw new Error((data.returnCode||'ERROR')+' '+(data.returnMessage||'LINE Pay Request 失敗'));
  var info=data.info||{}, urls=info.paymentUrl||{};
  if(!urls.web)throw new Error('LINE Pay 未回傳付款網址');
  return {transactionId:info.transactionId,paymentUrl:urls.web};
}

function handleLinePayConfirm_(e){
  var orderNo=String(e.parameter.orderNo||'').trim();
  var transactionId=String(e.parameter.transactionId||'').trim();
  var site='https://a0980778082-coder.github.io/savage-order/';
  try{
    if(!orderNo||!transactionId)throw new Error('缺少 LINE Pay 交易資訊');
    var ss=SpreadsheetApp.openById(CONFIG.spreadsheetId);
    var order=findOrderSummaryByNo_(ss,orderNo);
    if(!order)throw new Error('找不到訂單 '+orderNo);
    if(String(order['付款方式'])!=='LINE Pay')throw new Error('此訂單不是 LINE Pay');
    if(String(order['付款狀態'])==='已付款')return linePayRedirectPage_(site+'?linepay=success&orderNo='+encodeURIComponent(orderNo),'付款已完成');
    var savedTx=String(order['LINE Pay交易編號']||'').trim();
    if(savedTx && savedTx!==transactionId)throw new Error('交易編號不符');
    var amount=Number(order['總金額']||0);
    var c=linePayConfig_();
    var res=UrlFetchApp.fetch(c.base+'/v2/payments/'+encodeURIComponent(transactionId)+'/confirm',{
      method:'post',contentType:'application/json; charset=UTF-8',
      headers:{'X-LINE-ChannelId':c.channelId,'X-LINE-ChannelSecret':c.channelSecret},
      payload:JSON.stringify({amount:amount,currency:'TWD'}),muteHttpExceptions:true
    });
    var data=JSON.parse(res.getContentText());
    if(String(data.returnCode)!=='0000')throw new Error((data.returnCode||'ERROR')+' '+(data.returnMessage||'LINE Pay Confirm 失敗'));
    updateOrderFieldsByNo_(ss,orderNo,{'付款狀態':'已付款','LINE Pay交易編號':transactionId,'LINE Pay付款時間':new Date()});
    return linePayRedirectPage_(site+'?linepay=success&orderNo='+encodeURIComponent(orderNo),'LINE Pay 付款成功');
  }catch(err){
    try{if(orderNo)updateOrderFieldsByNo_(SpreadsheetApp.openById(CONFIG.spreadsheetId),orderNo,{'付款狀態':'付款確認失敗'});}catch(ignore){}
    return linePayRedirectPage_(site+'?linepay=error&orderNo='+encodeURIComponent(orderNo),'付款確認失敗：'+String(err&&err.message||err));
  }
}

function handleLinePayCancel_(e){
  var orderNo=String(e.parameter.orderNo||'').trim();
  try{if(orderNo)updateOrderFieldsByNo_(SpreadsheetApp.openById(CONFIG.spreadsheetId),orderNo,{'付款狀態':'付款取消'});}catch(ignore){}
  return linePayRedirectPage_('https://a0980778082-coder.github.io/savage-order/?linepay=cancel&orderNo='+encodeURIComponent(orderNo),'已取消 LINE Pay 付款');
}

function linePayRedirectPage_(url,message){
  var safeUrl=String(url).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  var safeMsg=String(message||'處理完成').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LINE Pay</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>'+safeMsg+'</h2><p>正在回到小野人百貨點餐…</p><p><a href="'+safeUrl+'">如果沒有自動跳轉，請點這裡</a></p><script>setTimeout(function(){location.replace('+JSON.stringify(url)+')},700)<\\/script></body></html>');
}

function updateOrderFieldsByNo_(ss,orderNo,fields){
  var sh=ss.getSheetByName(CONFIG.sheets.orders), h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  var noCol=h.indexOf('訂單編號'); if(noCol<0)throw new Error('訂單主檔缺少訂單編號');
  var values=sh.getRange(2,1,Math.max(0,sh.getLastRow()-1),sh.getLastColumn()).getValues();
  var row=-1;for(var i=0;i<values.length;i++){if(String(values[i][noCol])===String(orderNo)){row=i+2;break;}}
  if(row<0)throw new Error('找不到訂單 '+orderNo);
  Object.keys(fields).forEach(function(k){
    var col=h.indexOf(k);
    if(col<0){sh.getRange(1,sh.getLastColumn()+1).setValue(k);h.push(k);col=h.length-1;}
    sh.getRange(row,col+1).setValue(fields[k]);
  });
}
