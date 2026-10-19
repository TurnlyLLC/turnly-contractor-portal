const iconPaths = {
  "badge-dollar": '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M15 9.5c-.8-.7-1.8-1-3-1-1.7 0-3 .8-3 2s1.3 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.2 0-2.3-.4-3.2-1.2"/>',
  "bar-chart": '<path d="M3 3v18h18"/><path d="M8 17V9"/><path d="M13 17V5"/><path d="M18 17v-6"/>',
  briefcase: '<path d="M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1"/><path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 13h18"/>',
  building: '<path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 8h1"/><path d="M14 8h1"/><path d="M9 12h1"/><path d="M14 12h1"/><path d="M9 16h1"/><path d="M14 16h1"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  "calendar-days": '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  "clipboard-list": '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8"/><path d="M8 16h8"/>',
  document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  "file-check": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-5"/>',
  "file-signature": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 18c2-4 4-4 6 0"/><path d="M8 14h6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-7h6v7"/>',
  "layout-grid": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  "message-square": '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
  settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3L5.8 21 7 14.2l-5-4.9 6.9-1Z"/>',
  "trending-up": '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M17 5h3a2 2 0 0 1-2 4h-1"/><path d="M7 5H4a2 2 0 0 0 2 4h1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  video: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  wallet: '<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5Z"/><path d="M16 12h5"/><path d="M17 12v4"/>',
};
function navIcon(name, className = "") {
  const path = iconPaths[name] || iconPaths.grid;
  return `<span class="suite-icon ${className}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}
export const navSections = [
  {
    title: "",
    links: [
      { key: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "home" },
      { key: "command-center", label: "Command Center", href: "admin.html", icon: "layout-grid" },
      { key: "messages", label: "Messages", href: "messages.html", icon: "message-square" }
    ]
  },
  {
    title: "Sales",
    links: [
      { key: "sales-portal", label: "Open Sales CRM ↗", href: "https://sales.turnlypros.com", icon: "trending-up" }
    ]
  },
  {
    title: "Operations",
    links: [
      { key: "residential-bookings", label: "Residential", href: "admin-residential.html", icon: "calendar" },
      { key: "schedule", label: "Schedule", href: "schedule.html", icon: "calendar" },
      { key: "coverage-center", label: "Regions & Access", href: "coverage-center.html", icon: "shield" },
      { key: "assignments", label: "Assignments", href: "assignments.html", icon: "clipboard-list" },
      { key: "property-units", label: "Property Units", href: "property-units.html", icon: "building" }
    ]
  },
  {
    title: "Contractors",
    links: [
      { key: "applicants", label: "Cleaner applicants", href: "applicants.html?role=cleaner", icon: "users" },
      { key: "ambassador-applicants", label: "Ambassador applicants", href: "applicants.html?role=brand_ambassador", icon: "users" },
      { key: "ambassadors", label: "Brand ambassadors", href: "https://ba.turnlypros.com", icon: "users" },
      { key: "directory", label: "Directory", href: "directory.html", icon: "users" }
    ]
  },
  {
    title: "Quality",
    links: [
      { key: "qa-queue", label: "QA Queue", href: "qa-queue.html", icon: "message-square" },
      { key: "checklists", label: "Checklists", href: "checklists.html", icon: "file-check" },
      { key: "resident-feedback", label: "Resident Feedback", href: "resident-feedback.html", icon: "star" },
      { key: "qr-tracker", label: "QR Tracker", href: "qr-tracker.html", icon: "layout-grid" },
      { key: "videos", label: "Video Library", href: "videos.html", icon: "video" }
    ]
  },
  {
    title: "Clients",
    links: [
      { key: "client-directory", label: "Client Directory", href: "client-directory.html", icon: "building" },
      { key: "contracts", label: "Contracts", href: "contracts.html", icon: "briefcase" }
    ]
  },
  {
    title: "Reports",
    links: [
      { key: "finance", label: "Finance", href: "finance.html", icon: "badge-dollar" },
      { key: "reports-sales", label: "Sales", href: "reports-sales.html", icon: "wallet" },
      { key: "invoices", label: "Invoices", href: "invoices.html", icon: "document" },
      { key: "contractor-feedback", label: "Contractor Feedback", href: "contractor-feedback.html", icon: "star" },
    ]
  }
];

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sectionKey=title=>title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const aliases={'contractor-file':'directory',contacts:'contracts','qa-reviews':'qa-queue'};
// Every admin page starts with the complete menu expanded. Collapsing is local
// to the current page, so a saved preference cannot hide links on other pages.
export function renderAdminNavigation(activeKey,{badge=()=>''}={}){
  const current=aliases[activeKey]||activeKey;
  return `<nav class="suite-nav" aria-label="Admin navigation">${navSections.map(section=>{
    const key=sectionKey(section.title);
    return `<div class="nav-section-group">${key?`<button class="nav-section-title" type="button" data-nav-section-toggle="${key}" aria-expanded="true" aria-controls="nav-section-${key}"><span>${esc(section.title)}</span><span aria-hidden="true">⌄</span></button>`:''}<div class="nav-section-links" ${key?`id="nav-section-${key}" data-nav-section="${key}"`:''}>${section.links.map(link=>`<a class="suite-nav-link ${current===link.key?'active':''}" ${current===link.key?'aria-current="page"':''} href="${link.href}">${navIcon(link.icon)}<span>${esc(link.label)}</span>${badge(link.key)}</a>`).join('')}</div></div>`;
  }).join('')}</nav>`;
}
export function renderStandaloneAdminSidebar(activeKey){
  return `<aside class="suite-sidebar admin-shared-sidebar"><a class="suite-brand" href="admin.html" aria-label="Turnly admin"><span class="brand-mark" aria-hidden="true"></span><strong>Turnly</strong></a>${renderAdminNavigation(activeKey)}<div class="suite-legal-links"><a href="privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a><a href="terms-and-conditions.html" target="_blank" rel="noopener">Terms</a></div></aside>`;
}
export function bindStandaloneAdminNavigation(root=document){
  try{document.body.dataset.dashboardTheme=localStorage.getItem('turnlyAdminDashboardThemeV2')==='dark'?'dark':'light';}catch{}
  root.addEventListener('click',event=>{
    const toggle=event.target.closest('.admin-shared-sidebar [data-nav-section-toggle]');
    if(!toggle)return;
    const links=document.getElementById(toggle.getAttribute('aria-controls'));
    const expanded=toggle.getAttribute('aria-expanded')==='true';
    toggle.setAttribute('aria-expanded',String(!expanded));
    if(links)links.hidden=expanded;
  });
}
