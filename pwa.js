(()=>{
'use strict';
const $=id=>document.getElementById(id);
let deferredPrompt=null;
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
async function registerSW(){if(!('serviceWorker'in navigator))return null;try{return await navigator.serviceWorker.register('./sw.js?v=400',{scope:'./'});}catch(e){console.warn(e);return null}}
function updateInstallUI(){if(standalone){$('pwaInstallCard').hidden=true;return}if(isIOS){$('pwaInstallText').textContent='iPhone/iPad：點 Safari 分享按鈕 →「加入主畫面」，再從桌面開啟。';$('pwaInstallBtn').textContent='查看安裝方式';}else{$('pwaInstallText').textContent='安裝到手機桌面，之後像 App 一樣直接開啟。';}}
async function installPWA(){if(isIOS){alert('iPhone / iPad 安裝方式：\n\n1. 使用 Safari 開啟本頁\n2. 點「分享」\n3. 選「加入主畫面」\n4. 從桌面的「小野人點餐」開啟\n5. 再按「開啟通知」');return}if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;updateInstallUI();return}alert('請使用 Chrome 選單中的「安裝應用程式」或「加到主畫面」。')}
async function enablePush(){if(!('Notification'in window)||!('serviceWorker'in navigator)){alert('這台裝置/瀏覽器不支援系統通知。');return}if(isIOS&&!standalone){alert('iPhone/iPad 必須先加入主畫面，再從桌面的小野人 App 開啟後才能允許通知。');return}const permission=await Notification.requestPermission();if(permission!=='granted'){$('pushStatusText').textContent='通知尚未允許，可到手機設定重新開啟。';return}await navigator.serviceWorker.ready;localStorage.setItem('savagePushPermission','granted');$('pushStatusText').textContent='通知權限已開啟；完成推播伺服器設定後即可接收配送通知。';}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;updateInstallUI()});
window.addEventListener('appinstalled',()=>{$('pwaInstallCard').hidden=true});
document.addEventListener('DOMContentLoaded',async()=>{updateInstallUI();await registerSW();$('pwaInstallBtn')?.addEventListener('click',installPWA);$('enablePushBtn')?.addEventListener('click',enablePush);if(window.Notification&&Notification.permission==='granted')$('pushStatusText').textContent='通知權限已開啟 ✅';});
})();