(()=>{
'use strict';
const $=id=>document.getElementById(id);
let deferredPrompt=null;
const ua=navigator.userAgent||'';
const isIOS=/iphone|ipad|ipod/i.test(ua);
const isAndroid=/android/i.test(ua);
const standalone=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;

async function registerSW(){
  if(!('serviceWorker' in navigator)) return null;
  try{return await navigator.serviceWorker.register('./sw.js?v=401',{scope:'./'});}
  catch(e){console.warn('Service Worker 註冊失敗',e);return null;}
}
function setInstallCopy(){
  const card=$('pwaInstallCard'),text=$('pwaInstallText'),btn=$('pwaInstallBtn');
  if(!card||!text||!btn)return;
  if(standalone){card.hidden=true;return;}
  if(isIOS){text.textContent='iPhone / iPad：請用 Safari 開啟，點「分享」→「加入主畫面」。';btn.textContent='查看 iPhone 安裝方式';}
  else if(isAndroid){text.textContent='Android：使用 Chrome 可直接安裝到主畫面，之後像 App 一樣開啟。';btn.textContent=deferredPrompt?'立即安裝 App':'查看 Android 安裝方式';}
  else{text.textContent='可將小野人點餐安裝到主畫面，開啟方式更像 App。';btn.textContent=deferredPrompt?'立即安裝 App':'查看安裝方式';}
}
function showIOSHelp(){alert(`iPhone / iPad 安裝方式：\n\n1. 請用 Safari 開啟小野人點餐頁\n2. 點 Safari 下方「分享」按鈕\n3. 往下找「加入主畫面」\n4. 名稱確認為「小野人點餐」\n5. 按右上角「加入」\n6. 回到桌面，從「小野人點餐」圖示開啟\n7. 再按「🔔 開啟通知」\n\n※ iPhone / iPad 必須從加入主畫面的 App 內開啟通知。`);}
function showAndroidHelp(){alert(`Android 安裝方式：\n\n1. 請用 Chrome 開啟小野人點餐頁\n2. 如果頁面有「立即安裝 App」，直接按下去\n3. 如果沒有跳出安裝視窗：\n   Chrome 右上角「⋮」\n   →「安裝應用程式」或「加到主畫面」\n4. 確認安裝\n5. 回到桌面，從「小野人點餐」圖示開啟\n6. 再按「🔔 開啟通知」\n\n※ 建議使用 Chrome，通知與安裝支援最完整。`);}
async function installPWA(){
  if(standalone)return;
  if(isIOS){showIOSHelp();return;}
  if(deferredPrompt){
    try{deferredPrompt.prompt();const choice=await deferredPrompt.userChoice;if(choice&&choice.outcome==='accepted')$('pwaInstallText').textContent='App 已安裝完成 ✅';deferredPrompt=null;setInstallCopy();return;}
    catch(e){console.warn('PWA 安裝提示失敗',e);}
  }
  if(isAndroid)showAndroidHelp();else alert('請使用瀏覽器選單中的「安裝應用程式」或「加到主畫面」。');
}
async function enablePush(){
  const status=$('pushStatusText');
  if(!('Notification' in window)||!('serviceWorker' in navigator)){alert('這台裝置或瀏覽器目前不支援系統通知。');return;}
  if(isIOS&&!standalone){alert('iPhone / iPad 必須先「加入主畫面」，再從桌面的「小野人點餐」開啟後，才能允許通知。');return;}
  if(isAndroid&&!standalone){const go=confirm('建議先安裝「小野人點餐 App」再開啟通知，通知會比較穩定。\n\n要先查看安裝方式嗎？');if(go){if(deferredPrompt)await installPWA();else showAndroidHelp();return;}}
  const permission=await Notification.requestPermission();
  if(permission!=='granted'){if(status)status.textContent='通知尚未允許，可到手機設定重新開啟。';return;}
  await navigator.serviceWorker.ready;localStorage.setItem('savagePushPermission','granted');if(status)status.textContent='通知權限已開啟 ✅ 推播伺服器完成後即可接收配送通知。';
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;setInstallCopy();});
window.addEventListener('appinstalled',()=>{const card=$('pwaInstallCard');if(card)card.hidden=true;deferredPrompt=null;});
document.addEventListener('DOMContentLoaded',async()=>{setInstallCopy();await registerSW();$('pwaInstallBtn')?.addEventListener('click',installPWA);$('enablePushBtn')?.addEventListener('click',enablePush);if(window.Notification&&Notification.permission==='granted'){const status=$('pushStatusText');if(status)status.textContent='通知權限已開啟 ✅';}});
})();