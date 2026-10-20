const selected = new URLSearchParams(location.search).get('service') === 'deep' ? 'deep' : 'standard';
for (const panel of document.querySelectorAll('.service-panel')) panel.hidden = panel.id !== selected;
for (const link of document.querySelectorAll('[data-service]')) {
  if (link.dataset.service === selected) link.setAttribute('aria-current', 'page');
}
// Direct section links take precedence when a customer shares a specific policy.
const anchor = document.getElementById(location.hash.slice(1));
if (anchor?.closest('.service-panel')?.hidden) {
  const service = anchor.closest('.service-panel').id;
  location.replace(`?service=${service}${location.hash}`);
}
