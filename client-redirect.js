(() => {
  const pages = new Set(['/customer.html', '/residential-referral.html', '/gift-cards.html', '/gift-card-terms.html', '/crm-unsubscribe.html']);
  const path = pages.has(location.pathname) ? location.pathname : '/';
  // Preserve private reset, gift-card and booking fragments in the browser only.
  const target = 'https://client.turnlypros.com' + path + location.search + location.hash;
  document.getElementById('continue').href = target;
  location.replace(target);
})();
