(()=>{
'use strict';

const $=id=>document.getElementById(id);
const ONESIGNAL_APP_ID='85f48a6b-7c6b-4013-a74d-aa59d3f94a4f';
let deferredPrompt=null;
let oneSignalPromise=null;

const ua=navigator.userAgent||'';
const isIOS=/iphone|ipad|ipod/i.test(ua);
const isAndroid=/android/i.test(ua);
const standalone=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;

async function registerSW(){
  if(!('serviceWorker' in navigator)) return null;
  try{
    return await navigator.serviceWorker.register('./sw.js?v=402',{scope:'./'});
  }catch(e){
    console.warn('Service Worker 註冊失敗',e);
    return null;
  }
}

function normalizePhone(v){
  let s=String(v||'').replace(/[^\d+]/g,'');
  if(s.startsWith('+886')) s='0'+s.slice(4);
  else if(s.startsWith('886') && s.length>=12) s='0'+s.slice(3);
  return s.replace(/\D/g,'');
}

function customerExternalId(phone){
  const p=normalizePhone(phone);
  return p ? 'customer_'+p : '';
}

function setInstallCopy(){
  const card=$('pwaInstallCard'),text=$('pwaInstallText'),btn=$('pwaInstallBtn');
  if(!card||!text||!btn)return;
  if(standalone){card.hidden=true;return;}
  if(isIOS){
    text.textContent='iPhone / iPad：請用 Safari 開啟，點「分享」→「加入主畫面」。';
    btn.textContent='查看 iPhone 安裝方式';
  }else if(isAndroid){
    text.textContent='Android：使用 Chrome 可直接安裝到主畫面，之後像 App 一樣開啟。';
    btn.textContent=deferredPrompt?'立即安裝 App':'查看 Android 安裝方式';
  }else{
    text.textContent='可將小野人點餐安裝到主畫面，開啟方式更像 App。';
    btn.textContent=deferredPrompt?'立即安裝 App':'查看安裝方式';
  }
}

function showIOSHelp(){
  alert(`iPhone / iPad 安裝方式：

1. 請用 Safari 開啟小野人點餐頁
2. 點 Safari 下方「分享」按鈕
3. 往下找「加入主畫面」
4. 名稱確認為「小野人點餐」
5. 按右上角「加入」
6. 回到桌面，從「小野人點餐」圖示開啟
7. 再按「🔔 開啟通知」

※ iPhone / iPad 必須從加入主畫面的 App 內開啟通知。`);
}

function showAndroidHelp(){
  alert(`Android 安裝方式：

1. 請用 Chrome 開啟小野人點餐頁
2. 如果頁面有「立即安裝 App」，直接按下去
3. 如果沒有跳出安裝視窗：
   Chrome 右上角「⋮」
   →「安裝應用程式」或「加到主畫面」
4. 確認安裝
5. 回到桌面，從「小野人點餐」圖示開啟
6. 再按「🔔 開啟通知」

※ 建議使用 Chrome，通知與安裝支援最完整。`);
}

async function installPWA(){
  if(standalone)return;
  if(isIOS){showIOSHelp();return;}
  if(deferredPrompt){
    try{
      deferredPrompt.prompt();
      const choice=await deferredPrompt.userChoice;
      if(choice&&choice.outcome==='accepted')$('pwaInstallText').textContent='App 已安裝完成 ✅';
      deferredPrompt=null;
      setInstallCopy();
      return;
    }catch(e){console.warn('PWA 安裝提示失敗',e);}
  }
  if(isAndroid)showAndroidHelp();
  else alert('請使用瀏覽器選單中的「安裝應用程式」或「加到主畫面」。');
}

function loadOneSignal(){
  if(oneSignalPromise) return oneSignalPromise;

  oneSignalPromise=new Promise((resolve,reject)=>{
    window.OneSignalDeferred=window.OneSignalDeferred||[];

    window.OneSignalDeferred.push(async function(OneSignal){
      try{
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          notifyButton:{enable:false},
          serviceWorkerPath:'sw.js',
          serviceWorkerParam:{scope:'./'}
        });
        resolve(OneSignal);
      }catch(err){
        console.error('OneSignal 初始化失敗',err);
        reject(err);
      }
    });

    if(!document.querySelector('script[data-savage-onesignal]')){
      const s=document.createElement('script');
      s.src='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      s.defer=true;
      s.dataset.savageOnesignal='1';
      s.onerror=()=>reject(new Error('OneSignal SDK 載入失敗'));
      document.head.appendChild(s);
    }
  });

  return oneSignalPromise;
}

async function bindCustomerIdentity(OneSignal,phone){
  const p=normalizePhone(phone);
  if(!/^09\d{8}$/.test(p)) throw new Error('請先輸入正確的 10 碼手機號碼');

  const externalId=customerExternalId(p);
  await OneSignal.login(externalId);

  try{
    await OneSignal.User.addTag('user_type','customer');
    await OneSignal.User.addTag('customer_phone',p);
  }catch(e){
    console.warn('OneSignal tag 設定略過',e);
  }

  localStorage.setItem('savagePushExternalId',externalId);
  localStorage.setItem('savagePushPhone',p);
  return externalId;
}

async function syncIdentityIfPossible(){
  const phone=$('contactPhone')?.value||localStorage.getItem('savagePushPhone')||'';
  if(!phone || Notification.permission!=='granted') return;
  try{
    const OneSignal=await loadOneSignal();
    await bindCustomerIdentity(OneSignal,phone);
    const status=$('pushStatusText');
    if(status) status.textContent='訂單通知已開啟 ✅';
  }catch(e){
    console.warn('同步通知身分失敗',e);
  }
}

async function enablePush(){
  const status=$('pushStatusText');

  if(!('Notification' in window)||!('serviceWorker' in navigator)){
    alert('這台裝置或瀏覽器目前不支援系統通知。');
    return;
  }
  if(isIOS&&!standalone){
    alert('iPhone / iPad 必須先「加入主畫面」，再從桌面的「小野人點餐」開啟後，才能允許通知。');
    return;
  }
  if(isAndroid&&!standalone){
    const go=confirm('建議先安裝「小野人點餐 App」再開啟通知，通知會比較穩定。\n\n要先查看安裝方式嗎？');
    if(go){
      if(deferredPrompt) await installPWA(); else showAndroidHelp();
      return;
    }
  }

  const phone=normalizePhone($('contactPhone')?.value||'');
  if(!/^09\d{8}$/.test(phone)){
    alert('請先在「配送與聯絡資料」填入正確的 10 碼聯絡手機，再開啟訂單通知。');
    $('contactPhone')?.focus();
    return;
  }

  try{
    if(status) status.textContent='正在開啟通知…';
    await registerSW();
    const OneSignal=await loadOneSignal();

    let permission=Notification.permission;
    if(permission!=='granted'){
      permission=await OneSignal.Notifications.requestPermission();
    }
    if(Notification.permission!=='granted' && permission!==true && permission!=='granted'){
      if(status)status.textContent='通知尚未允許，可到手機設定重新開啟。';
      return;
    }

    await bindCustomerIdentity(OneSignal,phone);
    localStorage.setItem('savagePushPermission','granted');

    if(status) status.textContent='訂單通知已開啟 ✅ 配送狀態更新時會收到提醒。';
    const btn=$('enablePushBtn');
    if(btn) btn.textContent='通知已開啟';
  }catch(e){
    console.error(e);
    if(status) status.textContent='通知開啟失敗，請稍後再試。';
    alert('通知設定失敗：'+(e&&e.message?e.message:String(e)));
  }
}

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredPrompt=e;
  setInstallCopy();
});

window.addEventListener('appinstalled',()=>{
  const card=$('pwaInstallCard');
  if(card)card.hidden=true;
  deferredPrompt=null;
});

document.addEventListener('DOMContentLoaded',async()=>{
  setInstallCopy();
  await registerSW();

  $('pwaInstallBtn')?.addEventListener('click',installPWA);
  $('enablePushBtn')?.addEventListener('click',enablePush);

  const phone=$('contactPhone');
  if(phone){
    phone.addEventListener('change',syncIdentityIfPossible);
    phone.addEventListener('blur',syncIdentityIfPossible);
  }

  try{
    await loadOneSignal();
  }catch(e){
    console.warn('OneSignal 尚未就緒',e);
  }

  if(window.Notification&&Notification.permission==='granted'){
    const status=$('pushStatusText');
    if(status)status.textContent='通知權限已開啟，正在同步訂餐手機…';
    setTimeout(syncIdentityIfPossible,500);
  }
});

})();