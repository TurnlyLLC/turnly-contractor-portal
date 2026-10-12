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
      { key: "sales-overview", label: "Sales Dashboard", href: "sales-overview.html", icon: "layout-grid" },
      { key: "leads", label: "Leads", href: "leads.html", icon: "users" },
      { key: "agent-referrals", label: "Agent Referrals", href: "admin-agents.html", icon: "users" },
      { key: "walkthroughs", label: "Walkthroughs", href: "walkthroughs.html", icon: "calendar-days" },
      { key: "sales-tasks", label: "Tasks & Follow-ups", href: "sales-follow-ups.html", icon: "clipboard-list" },
      { key: "quotes", label: "Quotes", href: "quotes.html", icon: "badge-dollar" },
      { key: "contracts-pending", label: "Contracts", href: "contracts-pending.html", icon: "file-signature" }
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
      { key: "directory", label: "Directory", href: "directory.html", icon: "users" }
    ]
  },
  {
    title: "Quality",
    links: [
      { key: "qa-queue", label: "QA Queue", href: "qa-queue.html", icon: "message-square" },
      { key: "checklists", label: "Checklists", href: "checklists.html", icon: "file-check" },
      { key: "qa-analytics", label: "QA Analytics", href: "qa-analytics.html", icon: "bar-chart" },
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
      { key: "reports-operations", label: "Operations", href: "reports-operations.html", icon: "settings" },
      { key: "contractor-performance", label: "Contractor Performance", href: "contractor-performance.html", icon: "trophy" },
      { key: "growth", label: "Growth", href: "growth.html", icon: "trending-up" }
    ]
  }
];

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sectionKey=title=>title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const aliases={'contractor-file':'directory',contacts:'contracts','qa-reviews':'qa-queue'};
// Every admin page starts with the complete menu expanded. Collapsing is local
// to the current page, so a saved preference cannot hide links on other pages.
export function renderAdminNavigation(activeKey,{icon=()=>'',badge=()=>''}={}){
  const current=aliases[activeKey]||activeKey;
  return `<nav class="suite-nav" aria-label="Admin navigation">${navSections.map(section=>{
    const key=sectionKey(section.title);
    return `<div class="nav-section-group">${key?`<button class="nav-section-title" type="button" data-nav-section-toggle="${key}" aria-expanded="true" aria-controls="nav-section-${key}"><span>${esc(section.title)}</span><span aria-hidden="true">⌄</span></button>`:''}<div class="nav-section-links" ${key?`id="nav-section-${key}" data-nav-section="${key}"`:''}>${section.links.map(link=>`<a class="suite-nav-link ${current===link.key?'active':''}" ${current===link.key?'aria-current="page"':''} href="${link.href}">${icon(link.icon)}<span>${esc(link.label)}</span>${badge(link.key)}</a>`).join('')}</div></div>`;
  }).join('')}</nav>`;
}
export function renderStandaloneAdminSidebar(activeKey){
  return `<aside class="sidebar admin-shared-sidebar"><a class="brand" href="admin.html" aria-label="Turnly admin">Turnly.</a><small>Admin Portal</small>${renderAdminNavigation(activeKey)}<div class="admin-nav-legal"><a href="privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a><a href="terms-and-conditions.html" target="_blank" rel="noopener">Terms</a></div></aside>`;
}
export function bindStandaloneAdminNavigation(root=document){
  root.addEventListener('click',event=>{
    const toggle=event.target.closest('.admin-shared-sidebar [data-nav-section-toggle]');
    if(!toggle)return;
    const links=document.getElementById(toggle.getAttribute('aria-controls'));
    const expanded=toggle.getAttribute('aria-expanded')==='true';
    toggle.setAttribute('aria-expanded',String(!expanded));
    if(links)links.hidden=expanded;
  });
}
