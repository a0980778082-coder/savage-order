const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(time='2026-10-07T10:00:00+08:00'){
 class Clock extends Date{constructor(...a){super(...(a.length?a:[time]));}static now(){return new Clock().getTime();}}
 const headers=['訂單編號','送餐日期','餐期','百貨','聯絡電話','訂單狀態','POS已Key','付款狀態','總金額','配送狀態','餐期更改紀錄'];
 const row=['ORDER1','2026-10-07','午餐','中友','0912345678','新訂單',false,'已付款',135,'',''];
 const data=[headers,row];let held=false,maxColumns=headers.length;
 const sh={getMaxColumns:()=>maxColumns,insertColumnsAfter(at,n){assert.equal(at,maxColumns);maxColumns+=n;},getDataRange:()=>({getValues:()=>data.map(r=>[...r])}),getRange(r,c){return {setValue(x){assert.ok(held);assert.ok(c<=maxColumns);data[r-1][c-1]=x;return this;}};}};
 const ss={getSheetByName:()=>sh};
 const ctx=vm.createContext({Date:Clock,console,Utilities:{formatDate:d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)},SpreadsheetApp:{openById:()=>ss,flush(){}},LockService:{getScriptLock:()=>({waitLock(){assert.equal(held,false);held=true;},releaseLock(){held=false;}})}});
 vm.runInContext(fs.readFileSync('Code.gs','utf8'),ctx);
 ctx.auth_=token=>{if(token!=='staff')throw Error('權限不足');return {name:'店員'};};
 ctx.ensureBusinessSettings_=()=>{};ctx.settingsObject_=()=>({});ctx.mallOrderAvailability_=()=>({open:true,message:''});
 const p={orderNo:'ORDER1',phone:'0912345678',deliveryDate:'2026-10-08',mealPeriod:'午餐',requestId:'request-123'};
 const order=()=>Object.fromEntries(headers.map((h,i)=>[h,row[i]]));
 return {ctx,p,row,headers,order,held:()=>held};
}
test('Taipei cutoff edges and future meals (same result on overseas machines)',()=>{
 const {ctx}=setup();const check=(date,meal,time)=>ctx.mealCutoff_(date,meal,new Date(time)).open;
 assert.equal(check('2026-10-07','午餐','2026-10-07T11:39:59+08:00'),true);
 assert.equal(check('2026-10-07','午餐','2026-10-07T11:40:00+08:00'),false);
 assert.equal(check('2026-10-07','晚餐','2026-10-07T15:59:59+08:00'),true);
 assert.equal(check('2026-10-07','晚餐','2026-10-07T16:00:00+08:00'),false);
 assert.equal(check('2026-10-08','午餐','2026-10-07T23:59:59+08:00'),true);
 assert.equal(check('2026-10-08','晚餐','2026-10-07T23:59:59+08:00'),true);
 assert.equal(ctx.mealCutoff_('2026-02-30','午餐').open,false);
 assert.equal(ctx.mealCutoff_('2026-10-08','早餐').open,false);
});
test('customer changes only date/period, preserves paid amount, retries are idempotent',()=>{
 const {ctx,p,row,order,held}=setup();ctx.changeMeal_(p,false);
 assert.equal(order()['送餐日期'],'2026-10-08');assert.equal(order()['付款狀態'],'已付款');assert.equal(order()['總金額'],135);
 const saved=JSON.stringify(row);ctx.changeMeal_(p,false);assert.equal(JSON.stringify(row),saved);assert.equal(held(),false);
});
test('after original cutoff or after Key requires approval and keeps original meal',()=>{
 for(const keyed of [false,true]){
 const {ctx,p,row,order}=setup(keyed?'2026-10-07T10:00:00+08:00':'2026-10-07T12:00:00+08:00');row[6]=keyed;
 const r=ctx.changeMeal_(p,false);assert.match(r.message,/待店家確認/);assert.equal(order()['送餐日期'],'2026-10-07');
 assert.throws(()=>ctx.changeMeal_({...p,requestId:'second-request'},false),/已有待確認/);
 assert.throws(()=>ctx.changeMeal_({...p,token:'wrong',changeId:p.requestId,decision:'approve'},true),/權限/);
 ctx.changeMeal_({...p,token:'staff',changeId:p.requestId,decision:'approve'},true);
 assert.equal(order()['送餐日期'],'2026-10-08');assert.equal(order()['付款狀態'],'已付款');assert.equal(order()['總金額'],135);
 assert.throws(()=>ctx.changeMeal_({...p,token:'staff',changeId:p.requestId,decision:'approve'},true),/已處理/);
 }
});
test('closed target needs review; rejection preserves original and provides reason',()=>{
 const {ctx,p,order}=setup('2026-10-07T16:30:00+08:00');p.deliveryDate='2026-10-07';p.mealPeriod='晚餐';ctx.changeMeal_(p,false);
 ctx.changeMeal_({...p,token:'staff',changeId:p.requestId,decision:'reject',reason:'外送已出發'},true);
 assert.equal(order()['餐期'],'午餐');assert.match(ctx.mealRequest_(order()).message,/外送已出發/);
});
test('wrong phone, terminal states and dispatch between request and review cannot move order',()=>{
 const {ctx,p,row,order,held}=setup('2026-10-07T12:00:00+08:00');
 assert.throws(()=>ctx.changeMeal_({...p,phone:'0999999999'},false),/電話不符/);
 ctx.changeMeal_(p,false);row[5]='配送中';
 assert.throws(()=>ctx.changeMeal_({...p,token:'staff',changeId:p.requestId,decision:'approve'},true),/配送/);
 assert.equal(order()['送餐日期'],'2026-10-07');assert.equal(held(),false);
 for(const status of ['客人取消','製作完成','已出餐','已完成','已送達']){row[10]='';row[5]=status;assert.throws(()=>ctx.changeMeal_(p,false),/結束/);}
});
test('first request creates an audit column even when sheet capacity is full',()=>{
 const {ctx,p,headers,row,order}=setup();headers.pop();row.pop();
 ctx.changeMeal_(p,false);assert.equal(headers.at(-1),'餐期更改紀錄');assert.equal(ctx.mealRequest_(order()).pending,false);assert.equal(order()['付款狀態'],'已付款');
});
test('empty phone cannot authorize a malformed historical order',()=>{
 const {ctx,p,row}=setup();row[4]='';assert.throws(()=>ctx.changeMeal_({...p,phone:''},false),/電話不符/);
});
test('repeated iframe replies show one result and restore the history action',()=>{
 const source=fs.readFileSync('app.js','utf8');const start=source.indexOf('  function finishMealChange('),end=source.indexOf("  $('changeMealSubmit').addEventListener",start);
 let alerts=0,lookups=0;const els={changeMealSubmit:{},changeMealDialog:{close(){}},historyActionInput:{}};
 const front=vm.createContext({mealChangeRequest:'qa-request',mealChangeTimer:0,clearTimeout(){},$:id=>els[id],alert(){alerts++;},lookupHistory(){lookups++;},startHistoryAutoRefresh(){},toast(){}});
 vm.runInContext(source.slice(start,end),front);for(let i=0;i<3;i++)front.finishMealChange({requestId:'qa-request',ok:true,message:'done'});
 assert.equal(alerts,1);assert.equal(lookups,1);assert.equal(els.historyActionInput.value,'customerHistory');
});
test('frontend and backend agree across cutoffs and midnight',()=>{
 const {ctx}=setup();const source=fs.readFileSync('app.js','utf8');
 const start=source.indexOf('  function cutoffReason('),end=source.indexOf('  function setupDeliveryDate()',start);
 const front=vm.createContext({Date});vm.runInContext(source.slice(start,end),front);
 for(const time of ['2026-10-07T11:39:59+08:00','2026-10-07T11:40:00+08:00','2026-10-07T16:00:00+08:00','2026-10-08T00:00:00+08:00'])for(const date of ['2026-10-07','2026-10-08'])for(const meal of ['午餐','晚餐'])assert.equal(!front.cutoffReason(date,meal,new Date(time).getTime()),ctx.mealCutoff_(date,meal,new Date(time)).open);
});
test('initial delivery date advances after dinner cutoff without preselecting a meal',()=>{
 const source=fs.readFileSync('app.js','utf8');const start=source.indexOf('  function taipeiToday('),end=source.indexOf('  function updateDeliveryDateHint()',start);
 for(const [time,expected] of [['2026-10-07T15:59:59+08:00','2026-10-07'],['2026-10-07T16:00:00+08:00','2026-10-08'],['2026-10-08T00:00:00+08:00','2026-10-08']]){
  class Clock extends Date{constructor(...a){super(...(a.length?a:[time]));}static now(){return new Clock().getTime();}}
  const els={deliveryDate:{value:''}};const front=vm.createContext({Date:Clock,Intl,els,updateDeliveryDateHint(){},setInterval(){},applyOrderingAvailability(){}});
  vm.runInContext(source.slice(start,end),front);front.setupDeliveryDate();assert.equal(els.deliveryDate.value,expected);
 }
});
