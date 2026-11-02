(function routeContractorPhone() {
  const installed = navigator.standalone === true ||
    ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(mode =>
      window.matchMedia?.('(display-mode: ' + mode + ')')?.matches);
  if (installed || window.ReactNativeWebView || window.Capacitor?.isNativePlatform?.()) return;
  const agent = navigator.userAgent || '';
  const phone = navigator.userAgentData?.mobile === true ||
    /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(agent);
  if (!phone || /iPad|Tablet/i.test(agent)) return;
  // Some native clients open portal screens inside their own web view.
  if (/; wv\)|\bWebView\b/i.test(agent) || (/iPhone|iPod/i.test(agent) && /AppleWebKit/i.test(agent) && !/Safari|CriOS|FxiOS|EdgiOS/i.test(agent))) return;
  window.location.replace('/get-turnly-pro.html');
})();
