const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function portal({page='schedule',search='',surface='pwa',bootstrap=null}={}) {
  const markup={innerHTML:'',addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
  const body={dataset:{contractorPage:page},classList:{toggle(){},contains(){return false;}}};
  const context=vm.createContext({URLSearchParams,Date,Map,Set,console,
    window:{turnlyContractorBootstrap:bootstrap,__ENV:{},location:{search},localStorage:{getItem(){return 'dark';}}},
    document:{body,getElementById(){return markup;}},
    currentContractorSurface:()=>surface, propertyManagerNotesHtml:()=>'',
    contractorRoute:(page)=>`contractor-${page}.html`,
  });
  const source=fs.readFileSync('contractor-portal.js','utf8')
    .replace(/import[\s\S]*?from\s+"[^"]+";\s*/g,'')
    .replace(/attachEvents\(\);\s*applyDashboardTheme\(\);\s*renderShell\(\);\s*void loadData\(\);\s*$/,'');
  vm.runInContext(fs.readFileSync('contractor-release-policy.mjs','utf8').replace('export function','function'),context);
  vm.runInContext(source,context);
  vm.runInContext("state.user={id:'test-contractor'};",context);
  return code=>vm.runInContext(code,context);
}

test('native calendar uses Monday through Sunday, including Sunday but not adjacent weeks',()=>{
  const run=portal();
  run(`state.myAssignments=[
    {id:'before',start_window:'2026-10-18T12:00:00',status:'scheduled'},
    {id:'monday',start_window:'2026-10-19T00:00:00',status:'scheduled'},
    {id:'sunday',start_window:'2026-10-25T23:59:00',status:'scheduled'},
    {id:'next',start_window:'2026-10-26T00:00:00',status:'scheduled'},
    {id:'cancelled',start_window:'2026-10-21T12:00:00',status:'cancelled'}];`);
  assert.equal(run(`nativeWeekStart(new Date('2026-10-25T12:00:00')).getDate()`),19);
  assert.equal(run(`nativeScheduleRows(nativeWeekStart(new Date('2026-10-21T12:00:00'))).map(x=>x.id).join(',')`),'monday,sunday');
});
test('property filter restricts the calendar rows',()=>{
  const run=portal();
  run(`state.myAssignments=[{id:'a',title:'Oak',status:'scheduled',start_window:'2026-10-21T12:00:00'},{id:'b',title:'Maple',status:'scheduled',start_window:'2026-10-21T12:00:00'}]; state.scheduleProperty='Maple';`);
  assert.equal(run(`nativeScheduleRows(nativeWeekStart(new Date('2026-10-21T12:00:00'))).map(x=>x.id).join(',')`),'b');
});
test('past jobs never mixes in active work, and search uses property or address',()=>{
  const run=portal({page:'my-jobs',search:'?view=past'});
  run(`state.myAssignments=[{id:'active',title:'Oak',status:'scheduled'},{id:'done',title:'Oak',address:'Durham',status:'completed'},{id:'other',title:'Maple',address:'Raleigh',status:'completed'}];state.filters.myStatus='all';state.filters.search='Durham';`);
  assert.equal(run(`nativePastAssignments().map(x=>x.id).join(',')`),'done');
  assert.match(run(`renderNativePastJobs()`),/Oak/);
  assert.doesNotMatch(run(`renderNativePastJobs()`),/data-start-assignment-id/);
});
test('native and desktop share the app theme',()=>{
  assert.equal(portal()(`applyDashboardTheme(); document.body.dataset.dashboardTheme`),'light');
  assert.equal(portal({surface:'desktop'})(`applyDashboardTheme(); document.body.dataset.dashboardTheme`),'light');
});
test('native view toggles render selected day or a full week without writing job data',()=>{
  const run=portal();
  run(`state.scheduleCursor=new Date('2026-10-19T12:00:00');state.scheduleDay=new Date('2026-10-21T12:00:00');state.myAssignments=[{id:'a',title:'Wednesday home',start_window:'2026-10-21T12:00:00',status:'scheduled'},{id:'b',title:'Friday home',start_window:'2026-10-23T12:00:00',status:'scheduled'}];`);
  assert.match(run(`renderPwaSchedule()`),/Wednesday home/);
  // Property options contain both titles; the schedule rows must contain only Wednesday.
  assert.equal(run(`(renderPwaSchedule().match(/cp-pwa-schedule-card-link/g)||[]).length`),1);
  assert.equal(run(`state.scheduleView='list';(renderPwaSchedule().match(/cp-pwa-schedule-card-link/g)||[]).length`),2);
});


test('job boards split residential and commercial, group selected areas and show zone empty states',()=>{
 const run=portal({page:'job-board'});
 run(`state.jobZones=[{id:'NC:Durham',city:'Durham',state:'NC'},{id:'NC:Raleigh',city:'Raleigh',state:'NC'}];state.selectedZones=['NC:Durham','NC:Raleigh'];state.openAssignments=[{id:'home',title:'Home clean',status:'open',contractor_service_zone:'NC:Durham',contractor_job_category:'residential'},{id:'work',title:'Office clean',status:'open',contractor_service_zone:'NC:Durham',contractor_job_category:'commercial'}];`);
 assert.equal(run(`filteredOpenAssignments().map(j=>j.id).join(',')`),'home');
 assert.match(run(`renderJobBoardList(filteredOpenAssignments())`),/Raleigh, NC/);
 assert.match(run(`renderJobBoardList(filteredOpenAssignments())`),/Our team is working hard to bring more jobs to you/);
 assert.doesNotMatch(run(`renderJobBoardList(filteredOpenAssignments())`),/Office clean/);
 assert.equal(run(`state.filters.boardCategory='commercial';filteredOpenAssignments().map(j=>j.id).join(',')`),'work');
 assert.match(run(`state.selectedZones=[];renderJobBoardList([])`),/Choose your service areas/);
});


test('dashboard reuses verified identity and skips unrelated video, availability and profile requests',async()=>{
 const run=portal({page:'dashboard',bootstrap:{client:{},user:{id:'verified'},profile:{full_name:'Verified'},previewChecked:true}});
 run(`var calls=[]; renderShell=()=>{}; loadMessageThreads=async()=>{calls.push('messages')};loadOpenAssignments=async()=>{calls.push('board')};loadMyAssignments=async()=>{calls.push('mine')};loadVideos=async()=>{throw Error('unneeded videos')};loadAvailability=async()=>{throw Error('unneeded availability')};loadProfile=async()=>{throw Error('duplicate profile')};`);
 await run('loadData()');assert.equal(run('calls.sort().join(",")'),'messages,mine');assert.equal(run('state.user.id'),'verified');assert.equal(run('state.loading'),false);
});
test('documents do not load job boards or history and failed optional reads do not leave a spinner',async()=>{
 const run=portal({page:'documents',bootstrap:{client:{},user:{id:'verified'},profile:{},previewChecked:true}});
 run(`renderShell=()=>{};loadMessageThreads=async()=>{throw Error('offline')};loadOpenAssignments=async()=>{throw Error('unneeded board')};loadMyAssignments=async()=>{throw Error('unneeded jobs')};`);
 await run('loadData()');assert.equal(run('state.loading'),false);assert.equal(run('state.messageError'),false);
});


test('desktop schedule renders before slow board and messages; late reads never repaint forms',async()=>{
 const run=portal({page:'dashboard',surface:'desktop',bootstrap:{client:{},user:{id:'verified'},profile:{},previewChecked:true}});
 run(`var paints=0,finishBoard,finishMessages;renderShell=()=>{paints++};
 loadMyAssignments=async()=>{state.myAssignments=[{id:'mine'}]};
 loadOpenAssignments=()=>new Promise(resolve=>{finishBoard=resolve});
 loadMessageThreads=()=>new Promise(resolve=>{finishMessages=resolve});`);
 await run('loadData()');
 assert.equal(run('state.loading'),false);assert.equal(run('state.myAssignments[0].id'),'mine');
 assert.equal(run('state.boardLoading'),true);assert.match(run('dashboardBoardSummary()'),/Loading available jobs/);
 assert.equal(run('paints'),1);
 await run('finishBoard();state.boardLoad');await run('finishMessages();state.messageLoad');
 assert.equal(run('state.boardLoading'),false);assert.equal(run('paints'),1);
});

test('job board loads independently of assigned job history and slow messages',async()=>{
 const run=portal({page:'job-board',bootstrap:{client:{},user:{id:'verified'},profile:{},previewChecked:true}});
 run(`renderShell=()=>{};loadMessageThreads=()=>new Promise(()=>{});loadMyAssignments=async()=>{throw Error('unneeded history')};loadOpenAssignments=async()=>{state.openAssignments=[{id:'available'}]};`);
 await run('loadData()');assert.equal(run('state.loading'),false);assert.equal(run('state.openAssignments[0].id'),'available');assert.equal(run('state.messageError'),false);
});
