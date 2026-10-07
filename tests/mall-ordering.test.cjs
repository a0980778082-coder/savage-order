const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('Code.gs','utf8');
const today='2026-09-29';
const tomorrow='2026-09-30';
class FixedDate extends Date { constructor(...args){super(...(args.length?args:['2026-09-29T09:00:00+08:00']));} static now(){return new FixedDate().getTime();} }
const dateString=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const headers=['送餐日期','百貨','午餐開放','晚餐開放','暫停原因','更新時間','操作人'];
function setup(){
 let held=false,authCalls=0;
 const sheets=new Map();
 function makeSheet(data){return {data,getDataRange(){return {getValues:()=>this.data,getDisplayValues:()=>this.data.map(r=>r.map(String))};},getRange(row,col,rows=1,cols=1){return {setValues:values=>{values.forEach((r,i)=>{this.data[row-1+i]??=[];r.forEach((v,j)=>this.data[row-1+i][col-1+j]=v);});}};},appendRow(row){this.data.push(row);}};}
 const ss={getSheetByName:name=>sheets.get(name)||null};
 sheets.set('百貨樓層',makeSheet([['百貨','館別','樓層'],['中友百貨','A棟','1F'],['中友百貨','B棟','1F'],['台中大遠百','本館','1F']]));
 const ctx=vm.createContext({console,Date:FixedDate,SpreadsheetApp:{openById:()=>ss,flush(){}},Utilities:{formatDate:dateString},LockService:{getScriptLock:()=>({waitLock(){assert.equal(held,false);held=true;},releaseLock(){held=false;}})}});
 vm.runInContext(source,ctx);
 ctx.auth_=(token,roles)=>{authCalls++;assert.ok(roles.includes('staff'));if(token!=='valid')throw Error('登入失效');return {name:'測試店員'};};
 ctx.ensureBusinessSettings_=()=>{};
 let settings={營業狀態:'OPEN'};ctx.settingsObject_=()=>settings;
 ctx.createSheet_=(ss,name,h)=>{if(!sheets.has(name))sheets.set(name,makeSheet([h]));return sheets.get(name);};
 ctx.appendObjectRow_=(sh,obj)=>sh.appendRow(sh.data[0].map(h=>obj[h]??''));
 const save=(overrides={})=>ctx.saveMallOrdering_('valid',{date:today,mall:'中友百貨',lunchOpen:false,dinnerOpen:true,reason:'外送已額滿',...overrides});
 return {ctx,ss,sheets,save,setSettings:s=>settings=s,isHeld:()=>held,authCalls:()=>authCalls};
}
test('missing settings default open, unique malls, reads do not create sheets',()=>{
 const {ctx,ss,sheets}=setup();assert.equal(ctx.mallOrderAvailability_(ss,today,'午餐','中友百貨').open,true);
 assert.equal(ctx.getMallOrdering_('valid',today).rows.length,2);assert.equal(sheets.has('百貨接單設定'),false);
});
test('save pauses exactly one mall, date and meal; reopening updates rather than duplicates',()=>{
 const {ctx,ss,sheets,save,isHeld}=setup();save();
 assert.equal(ctx.getOrderAvailability_(today,'午餐','中友百貨').open,false);
 assert.equal(ctx.getOrderAvailability_(today,'晚餐','中友百貨').open,true);
 assert.equal(ctx.getOrderAvailability_(tomorrow,'午餐','中友百貨').open,true);
 assert.equal(ctx.getOrderAvailability_(today,'午餐','台中大遠百').open,true);
 assert.match(ctx.getOrderAvailability_(today,'午餐','中友百貨').message,/外送已額滿/);
 save({lunchOpen:true});assert.equal(sheets.get('百貨接單設定').data.length,2);
 assert.equal(ctx.mallOrderAvailability_(ss,today,'午餐','中友百貨').open,true);assert.equal(isHeld(),false);
});
test('global closure takes precedence; inactive global date still checks mall closure',()=>{
 const {ctx,save,setSettings}=setup();save();
 setSettings({營業狀態:'CLOSED'});assert.equal(ctx.getOrderAvailability_(today,'晚餐','台中大遠百').open,false);
 setSettings({營業狀態:'CLOSED',公告開始日期:tomorrow});assert.equal(ctx.getOrderAvailability_(today,'午餐','中友百貨').open,false);assert.equal(ctx.getOrderAvailability_(today,'晚餐','中友百貨').open,true);
 setSettings({營業狀態:'LUNCH_CLOSED'});assert.equal(ctx.getOrderAvailability_(today,'午餐','台中大遠百').open,false);assert.equal(ctx.getOrderAvailability_(today,'晚餐','台中大遠百').open,true);
});
test('reject unauthenticated, invalid dates, past dates, unknown malls and malformed states',()=>{
 const {ctx,save,isHeld}=setup();
 assert.throws(()=>ctx.saveMallOrdering_('wrong',{}),/登入/);
 for(const date of ['2026-02-30','bad','2026-09-28'])assert.throws(()=>save({date}),/日期/);
 assert.throws(()=>save({mall:'不存在'}),/百貨/);assert.equal(isHeld(),false);
 assert.throws(()=>save({lunchOpen:'false'}),/狀態/);
 assert.throws(()=>save({reason:'x'.repeat(121)}),/120/);
});
test('public response excludes audit identities and only returns active/future closures',()=>{
 const {ctx,save,sheets}=setup();save();save({date:tomorrow,mall:'台中大遠百',dinnerOpen:false});
 sheets.get('百貨接單設定').data.push(['2026-09-28','中友百貨',false,false,'old',new Date(),'private']);
 const rows=ctx.publicMallOrdering_();assert.equal(rows.length,2);assert.ok(!JSON.stringify(rows).includes('測試店員'));assert.ok(!JSON.stringify(rows).includes('private'));
});
test('actual order validation rejects a stale client before side effects',()=>{
 const {ctx,save}=setup();save();
 const p={deliveryDate:today,mall:'中友百貨',building:'A棟',floor:'1F',counterName:'Test',contactName:'Test',contactPhone:'0912345678',mealPeriod:'午餐',paymentMethod:'現金',invoiceType:'紙本發票',items:[{name:'Test',qty:1}]};
 assert.throws(()=>ctx.validateOrder_(p),/暫停配送/);
 p.mall='台中大遠百';ctx.validateAddonRules_=()=>{};assert.doesNotThrow(()=>ctx.validateOrder_(p));
});
test('post handlers preserve request correlation for success and authorization failure',()=>{
 const {ctx}=setup();ctx.postMessageResponse_=o=>o;
 let res=ctx.doPost({parameter:{action:'mallOrderingGet',payload:JSON.stringify({token:'valid',date:today,requestId:'r1'})}});
 assert.equal(res.ok,true);assert.equal(res.requestId,'r1');assert.equal(res.data.rows.length,2);
 res=ctx.doPost({parameter:{action:'mallOrderingSave',payload:JSON.stringify({token:'bad',requestId:'r2'})}});
 assert.equal(res.ok,false);assert.equal(res.requestId,'r2');
});
test('customer banner and button recover when switching date or mall',()=>{
 const js=fs.readFileSync('app.js','utf8');
 const chunk=js.slice(js.indexOf('  function settingTrue'),js.indexOf('  function renderPaymentInfo'));
 assert.ok(chunk.length>0);
 const element=()=>({value:'',textContent:'',hidden:false,dataset:{cartEmpty:'false'},classList:{toggle(){},add(){},remove(){}}});
 const els={deliveryDate:element(),mall:element(),submitBtn:element(),businessStatusBanner:element(),businessStatusTitle:element(),businessStatusMessage:element()};
 els.deliveryDate.value=today;els.mall.value='中友百貨';
 const state={settings:{},mallOrdering:[{date:today,mall:'中友百貨',lunchOpen:false,dinnerOpen:true,reason:'額滿'}],submitting:false};
 const ctx=vm.createContext({state,els,Date:FixedDate,cutoffReason:()=>'',document:{querySelector:()=>({value:'午餐'}),querySelectorAll:()=>[]},localDateValue:()=>today,console});
 vm.runInContext(chunk,ctx);ctx.applyOrderingAvailability();assert.equal(els.submitBtn.disabled,true);assert.match(els.businessStatusMessage.textContent,/額滿/);
 els.mall.value='台中大遠百';ctx.applyOrderingAvailability();assert.equal(els.submitBtn.disabled,false);assert.equal(els.businessStatusBanner.hidden,true);
 els.mall.value='中友百貨';els.deliveryDate.value=tomorrow;ctx.applyOrderingAvailability();assert.equal(els.submitBtn.disabled,false);
});
