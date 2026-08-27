(()=>{
'use strict';

const $ = id => document.getElementById(id);
const cfg = window.SAVAGE_CONFIG || {};

let deferredPrompt = null;

const ua = navigator.userAgent || '';
const isIOS = /iphone|ipad|ipod/i.test(ua);
const isAndroid = /android/i.test(ua);

const standalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true;


/* =========================================================
   VAPID 公鑰轉換
========================================================= */

function b64ToUint8(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);

  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);

  return Uint8Array.from(
    [...rawData].map(char => char.charCodeAt(0))
  );
}


/* =========================================================
   手機號碼處理
========================================================= */

function normalizePhone(value){

  let phone = String(value || '')
    .replace(/[^\d+]/g, '');

  if(phone.startsWith('+886')){
    phone = '0' + phone.slice(4);
  }
  else if(
    phone.startsWith('886') &&
    phone.length >= 12
  ){
    phone = '0' + phone.slice(3);
  }

  return phone.replace(/\D/g, '');
}


function currentPhone(){

  return normalizePhone(

    $('contactPhone')?.value ||

    $('historyPhone')?.value ||

    localStorage.getItem('savage_push_phone') ||

    ''

  );

}


/* =========================================================
   Service Worker
========================================================= */

async function registerSW(){

  if(!('serviceWorker' in navigator)){
    return null;
  }

  try{

    return await navigator.serviceWorker.register(
      './sw.js?v=401',
      {
        scope:'./'
      }
    );

  }
  catch(error){

    console.warn(
      'Service Worker 註冊失敗',
      error
    );

    return null;

  }

}


/* =========================================================
   PWA 安裝畫面
========================================================= */

function updateInstallUI(){

  const card = $('pwaInstallCard');
  const text = $('pwaInstallText');
  const btn = $('pwaInstallBtn');

  if(!card || !text || !btn){
    return;
  }


  if(standalone){

    card.hidden = true;

    return;

  }


  if(isIOS){

    text.textContent =
      'iPhone / iPad：請用 Safari 開啟，點「分享」→「加入主畫面」。';

    btn.textContent =
      '查看 iPhone 安裝方式';

  }

  else if(isAndroid){

    text.textContent =
      'Android：使用 Chrome 可直接安裝到主畫面，之後像 App 一樣開啟。';

    btn.textContent =
      deferredPrompt
        ? '立即安裝 App'
        : '查看 Android 安裝方式';

  }

}


/* =========================================================
   安裝 PWA
========================================================= */

async function installPWA(){

  if(standalone){
    return;
  }


  /* ---------- iPhone ---------- */

  if(isIOS){

    alert(
`iPhone / iPad 安裝方式：

1. 使用 Safari 開啟小野人點餐頁

2. 點 Safari 的「分享」

3. 選擇「加入主畫面」

4. 名稱確認為「小野人點餐」

5. 按右上角「加入」

6. 回到手機桌面

7. 從「小野人點餐」圖示開啟

8. 再按「🔔 開啟通知」

※ iPhone 必須從加入主畫面的 App 開啟通知。`
    );

    return;

  }


  /* ---------- Android ---------- */

  if(deferredPrompt){

    try{

      deferredPrompt.prompt();

      await deferredPrompt.userChoice;

      deferredPrompt = null;

      updateInstallUI();

      return;

    }
    catch(error){

      console.warn(
        'PWA 安裝失敗',
        error
      );

    }

  }


  alert(
`Android 安裝方式：

1. 使用 Chrome 開啟小野人點餐頁

2. 點 Chrome 右上角「⋮」

3. 選擇「安裝應用程式」
   或「加到主畫面」

4. 確認安裝

5. 回到手機桌面

6. 從「小野人點餐」開啟

7. 再按「🔔 開啟通知」`
  );

}


/* =========================================================
   呼叫 Cloudflare Push Worker
========================================================= */

async function pushFetch(
  path,
  options = {}
){

  if(!cfg.PUSH_URL){

    throw new Error(
      '推播伺服器尚未設定'
    );

  }


  const url =
    cfg.PUSH_URL.replace(/\/$/, '') +
    path;


  const response =
    await fetch(
      url,
      options
    );


  const data =
    await response
      .json()
      .catch(() => ({}));


  if(
    !response.ok ||
    data.ok === false
  ){

    throw new Error(
      data.error ||
      ('HTTP ' + response.status)
    );

  }


  return data;

}


/* =========================================================
   將這支手機註冊到 Cloudflare / D1
========================================================= */

async function subscribeForPhone(phone){

  phone = normalizePhone(phone);


  if(!/^09\d{8}$/.test(phone)){

    throw new Error(
      '請先輸入正確的 10 碼手機號碼'
    );

  }


  /* 等 Service Worker 就緒 */

  const registration =
    await navigator.serviceWorker.ready;


  /* 從 Worker 取得 VAPID 公鑰 */

  const config =
    await pushFetch('/config');


  if(!config.vapidPublicKey){

    throw new Error(
      '無法取得通知公鑰'
    );

  }


  /* 看這台手機之前有沒有訂閱 */

  let subscription =
    await registration
      .pushManager
      .getSubscription();


  /* 沒有的話建立新的訂閱 */

  if(!subscription){

    subscription =
      await registration
        .pushManager
        .subscribe({

          userVisibleOnly:true,

          applicationServerKey:
            b64ToUint8(
              config.vapidPublicKey
            )

        });

  }


  /* 把手機號碼＋Push Subscription 存進 Worker */

  await pushFetch(
    '/subscribe',
    {

      method:'POST',

      headers:{
        'Content-Type':'application/json'
      },

      body:JSON.stringify({

        phone:phone,

        subscription:
          subscription.toJSON(),

        ua:navigator.userAgent

      })

    }
  );


  /* 本機記住這個手機 */

  localStorage.setItem(
    'savage_push_phone',
    phone
  );

  localStorage.setItem(
    'savagePushPermission',
    'granted'
  );


  return subscription;

}


/* =========================================================
   客人按「開啟通知」
========================================================= */

async function enablePush(){

  const status =
    $('pushStatusText');


  /* 瀏覽器不支援 */

  if(
    !('Notification' in window) ||
    !('serviceWorker' in navigator)
  ){

    alert(
      '這台裝置或瀏覽器目前不支援系統通知。'
    );

    return;

  }


  /* iPhone 必須先安裝到主畫面 */

  if(
    isIOS &&
    !standalone
  ){

    alert(
      'iPhone / iPad 必須先「加入主畫面」，再從桌面的「小野人點餐」開啟後，才能允許通知。'
    );

    return;

  }


  /* Worker 網址沒設定 */

  if(!cfg.PUSH_URL){

    alert(
      '推播伺服器尚未設定。'
    );

    return;

  }


  /* 取得客人手機 */

  const phone =
    currentPhone();


  if(!/^09\d{8}$/.test(phone)){

    alert(
      '請先在「配送與聯絡資料」填入正確的 10 碼聯絡手機，再開啟訂單通知。'
    );

    $('contactPhone')?.focus();

    return;

  }


  try{

    if(status){

      status.textContent =
        '正在開啟通知…';

    }


    /* 註冊 SW */

    await registerSW();


    /* 要求系統通知權限 */

    const permission =
      await Notification.requestPermission();


    if(permission !== 'granted'){

      if(status){

        status.textContent =
          '通知尚未允許，可到手機設定重新開啟。';

      }

      return;

    }


    /* 綁定手機 */

    await subscribeForPhone(phone);


    /* 成功 */

    if(status){

      status.textContent =
        '訂單通知已開啟 ✅';

    }


    /* 成功後把按鈕隱藏 */

    const button =
      $('enablePushBtn');


    if(button){

      button.hidden = true;

    }

  }

  catch(error){

    console.error(error);


    if(status){

      status.textContent =
        '通知開啟失敗，請稍後再試。';

    }


    alert(
      '通知設定失敗：' +
      (
        error?.message ||
        String(error)
      )
    );

  }

}


/* =========================================================
   已允許通知的客人，自動同步手機
========================================================= */

async function syncPushPhone(phone){

  phone =
    normalizePhone(phone);


  if(
    Notification.permission !== 'granted' ||
    !cfg.PUSH_URL ||
    !/^09\d{8}$/.test(phone)
  ){

    return false;

  }


  try{

    await registerSW();

    await subscribeForPhone(phone);


    if($('pushStatusText')){

      $('pushStatusText').textContent =
        '訂單通知已開啟 ✅';

    }


    if($('enablePushBtn')){

      $('enablePushBtn').hidden =
        true;

    }


    return true;

  }

  catch(error){

    console.warn(
      'Push 同步失敗',
      error
    );

    return false;

  }

}


/* =========================================================
   提供 app.js 使用
========================================================= */

window.SavagePush = {

  syncPhone:
    syncPushPhone,

  enable:
    enablePush

};


/* =========================================================
   Android 安裝事件
========================================================= */

window.addEventListener(
  'beforeinstallprompt',
  event => {

    event.preventDefault();

    deferredPrompt =
      event;

    updateInstallUI();

  }
);


/* =========================================================
   安裝完成
========================================================= */

window.addEventListener(
  'appinstalled',
  () => {

    const card =
      $('pwaInstallCard');


    if(card){

      card.hidden =
        true;

    }


    deferredPrompt =
      null;

  }
);


/* =========================================================
   頁面載入
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    updateInstallUI();


    await registerSW();


    /* 安裝 App */

    $('pwaInstallBtn')
      ?.addEventListener(
        'click',
        installPWA
      );


    /* 開啟通知 */

    $('enablePushBtn')
      ?.addEventListener(
        'click',
        enablePush
      );


    /* 如果之前已允許通知 */

    if(
      window.Notification &&
      Notification.permission ===
        'granted'
    ){

      if($('pushStatusText')){

        $('pushStatusText').textContent =
          '訂單通知已開啟 ✅';

      }


      if($('enablePushBtn')){

        $('enablePushBtn').hidden =
          true;

      }


      const phone =
        currentPhone();


      if(phone){

        syncPushPhone(phone);

      }

    }

  }
);

})();