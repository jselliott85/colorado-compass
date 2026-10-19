const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function runtime(worker = false, globals = {}) {
  const context = {Date, JSON, Object, Number, Set, Math, Error, Utilities: {formatDate(d, zone, pattern) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset'}).formatToParts(d).map(v => [v.type, v.value]));
    if (pattern === 'Z') return p.timeZoneName.replace('GMT', '').replace(':', '');
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  }}, ...globals};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/18_NestCore.js'), 'utf8') + (worker ? '\n' + fs.readFileSync(path.join(root, 'nest-worker/Code.js'), 'utf8') : ''), context);
  return context;
}
const t = m => `2026-10-20T00:${String(m).padStart(2, '0')}:00Z`;
const traits = (hvac, connectivity = 'ONLINE') => ({'sdm.devices.traits.ThermostatHvac': {status: hvac}, 'sdm.devices.traits.Connectivity': {status: connectivity}});
const obs = (id, m, raw, kind = 'event', device = 'device1') => ({observation_id: id, timestamp_utc: t(m), device_id: device, kind, traits_json: JSON.stringify(raw), ingested_at_utc: t(30)});
function health(minutes) { return minutes.map(m => ({started_at_utc: t(m), finished_at_utc: t(m), drained: true, status: 'success'})); }
const zones = {device1: 'whole_house'};
test('Nest separates mode, HVAC and fan timer; unsupported fields are missing', () => {
  const c = runtime(), p = c.nestPatch_({'sdm.devices.traits.ThermostatMode': {mode: 'HEAT'}, 'sdm.devices.traits.Fan': {timerMode: 'ON'}});
  assert.equal(p.thermostat_mode, 'HEAT'); assert.equal(p.hvac_status, undefined); assert.equal(p.fan_timer_state, 'ON'); assert.equal(p.fan_timer_expiration_utc, null);
});
test('Nest splits exact boundaries and deduplicates/out-of-order events deterministically', () => {
  const c = runtime(), a = obs('a', 0, traits('HEATING'), 'snapshot'), b = obs('b', 5, traits('OFF')), d = obs('d', 15, traits('COOLING'));
  const rows = c.nestAggregate_([d, b, a, b], health(Array.from({length:31}, (_, i) => i)), zones, t(0), t(30), t(30), true);
  assert.equal(rows[0].heating_minutes, 5); assert.equal(rows[0].off_minutes, 10); assert.equal(rows[0].known_duration_minutes, 15);
  assert.equal(rows[1].cooling_minutes, 15); assert.equal(rows[0].observation_count, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), JSON.parse(JSON.stringify(c.nestAggregate_([a,b,d], health(Array.from({length:31}, (_, i) => i)), zones, t(0), t(30), t(30), true))));
});
test('Nest outage and recovery require a fresh anchor; no silent bridge', () => {
  const c = runtime(), h = health([0,1,2,10,11,12,13,14,15]);
  const rows = c.nestAggregate_([obs('a',0,traits('HEATING'),'snapshot'), obs('b',11,traits('OFF'),'snapshot')], h, zones,t(0),t(15),t(15),true);
  assert.equal(rows[0].heating_minutes, 2); assert.equal(rows[0].off_minutes,4); assert.equal(rows[0].unknown_duration_minutes,9);
});
test('Nest offline connectivity and snapshots-only do not manufacture runtime', () => {
  const c=runtime(), rows=[obs('a',0,traits('HEATING'),'snapshot'),obs('b',4,{'sdm.devices.traits.Connectivity':{status:'OFFLINE'}})];
  const h=health(Array.from({length:16},(_,i)=>i));
  assert.equal(c.nestAggregate_(rows,h,zones,t(0),t(15),t(15),true)[0].heating_minutes,4);
  const polling=c.nestAggregate_(rows,h,zones,t(0),t(15),t(15),false)[0]; assert.equal(polling.heating_minutes,null); assert.equal(polling.unknown_duration_minutes,15);
});
test('Nest leaves pre-start periods unknown, preserves zones and Denver DST offset',()=>{
  const c=runtime(), rows=c.nestAggregate_([obs('a',5,traits('HEATING'),'snapshot'),obs('b',5,traits('OFF'),'snapshot','device2')],health(Array.from({length:16},(_,i)=>i)),{device1:'upstairs',device2:'downstairs'},t(0),t(15),t(15),true);
  assert.equal(rows.length,2); assert.equal(rows.find(r=>r.zone_id==='upstairs').unknown_duration_minutes,5);
  assert.equal(rows.find(r=>r.zone_id==='downstairs').heating_minutes,0);
  assert.equal(c.nestLocal_('2026-11-01T07:30:00Z'),'2026-11-01T01:30:00-06:00');
  assert.equal(c.nestLocal_('2026-11-01T08:30:00Z'),'2026-11-01T01:30:00-07:00');
});
test('Nest conflicting duplicate fails rather than selecting an arbitrary state',()=>{
  const c=runtime();assert.throws(()=>c.nestAggregate_([obs('a',0,traits('HEATING')),obs('a',0,traits('OFF'))],health([0,1]),zones,t(0),t(15),t(15),true),/conflicting duplicate/);
});
test('Nest token refresh is cached and does not disclose server bodies; commands are prohibited',()=>{
  const props={SPREADSHEET_ID:'sheet',NEST_DEVICE_ACCESS_PROJECT_ID:'project',NEST_CLIENT_ID:'client',NEST_CLIENT_SECRET:'secret',NEST_REFRESH_TOKEN:'refresh'};
  let calls=0;
  const c=runtime(true,{PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...props}),setProperties:p=>Object.assign(props,p),setProperty:(k,v)=>{props[k]=v;}})},UrlFetchApp:{fetch:()=>{calls++;return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({access_token:'private-token',expires_in:3600})};}}});
  assert.equal(c.nestToken_(false),'private-token'); assert.equal(c.nestToken_(false),'private-token');assert.equal(calls,1);c.nestToken_(true);assert.equal(calls,2);
  assert.throws(()=>c.nestFetch_('https://smartdevicemanagement.googleapis.com/v1/enterprises/project/devices/id:executeCommand',{}),/prohibited/);
  c.UrlFetchApp.fetch=()=>({getResponseCode:()=>401,getContentText:()=>'{"secret":"must-not-escape"}'});
  assert.throws(()=>c.nestToken_(true), /^Error: Nest HTTP 401$/);
});
test('Nest 401 snapshot reconciliation refreshes credentials once and retries only GET',()=>{
  const props={SPREADSHEET_ID:'sheet',NEST_DEVICE_ACCESS_PROJECT_ID:'project',NEST_CLIENT_ID:'client',NEST_CLIENT_SECRET:'secret',NEST_REFRESH_TOKEN:'refresh',NEST_ACCESS_TOKEN:'old',NEST_ACCESS_EXPIRES_MS:String(Date.now()+3600000)};
  const calls=[];
  const c=runtime(true,{PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...props}),setProperties:p=>Object.assign(props,p),setProperty:(k,v)=>{props[k]=v;}})},UrlFetchApp:{fetch:(url,opt)=>{
    calls.push([url,opt.method]); const first=calls.length===1;return {getResponseCode:()=>first?401:200,getContentText:()=>JSON.stringify(url.endsWith('/token')?{access_token:'renewed',expires_in:3600}:{devices:[]})};
  }}});
  assert.equal(c.nestSnapshot_().devices.length,0);
  assert.deepEqual(calls.map(x=>x[1]),['get','post','get']);
});
test('Nest undrained queue and errors remove continuity, even with unchanged HVAC snapshots',()=>{
  const c=runtime(),h=health([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);h[5].drained=false;h[8].status='error';
  const r=c.nestAggregate_([obs('a',0,traits('HEATING'),'snapshot'),obs('b',6,traits('HEATING'),'snapshot'),obs('c',9,traits('OFF'),'snapshot')],h,zones,t(0),t(15),t(15),true)[0];
  assert.equal(r.heating_minutes,5);assert.equal(r.off_minutes,6);assert.equal(r.unknown_duration_minutes,4);
});
test('Nest simultaneous conflicting HVAC reports preserve unknown time until next anchor',()=>{
 const c=runtime(),r=c.nestAggregate_([obs('a',0,traits('HEATING'),'snapshot'),obs('b',5,traits('OFF')),obs('c',5,traits('COOLING')),obs('d',10,traits('OFF'),'snapshot')],health(Array.from({length:16},(_,i)=>i)),zones,t(0),t(15),t(15),true)[0];
 assert.equal(r.heating_minutes,5);assert.equal(r.off_minutes,5);assert.equal(r.unknown_duration_minutes,5);
});
test('Nest usage meter rolls over by UTC day and flags abnormal consumption without claiming billing',()=>{
 const props={};let row;
 const c=runtime(true,{PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v;}})}});
 c.nestUpsert_=(name,headers,rows)=>{assert.equal(name,'Nest_Usage');row=rows[0];};
 let warning=false;c.nestStatus_=()=>{warning=true;};
 props.NEST_USAGE_CURRENT=JSON.stringify({day:'2000-01-01',archive_bytes:123});
 c.nestUsageAdd_('runs',1);c.nestWriteUsage_();assert.equal(row.runs,1);assert.equal(row.archive_bytes,0);assert.equal(row.status,'normal');
 c.nestUsageAdd_('archive_bytes',10*1024*1024);c.nestWriteUsage_();assert.equal(row.status,'review_usage');assert.equal(warning,true);assert.match(row.scope,/not billable/);
});
test('Nest independent email watchdog sends setup, throttles failures and reports recovery to owner',()=>{
 const props={},sent=[];
 const c=runtime(false,{DriveApp:{getFileById:()=>({getOwner:()=>({getEmail:()=> 'owner@leehilllabs.com'})})},MailApp:{sendEmail:m=>sent.push(m)},aqProperties_:()=>({getProperty:k=>props[k],setProperties:p=>Object.assign(props,p),setProperty:(k,v)=>{props[k]=v;}}),aqConfig_:()=>({spreadsheetId:'private-sheet'})});
 c.aqNestEmailAlert_({status:'success'});c.aqNestEmailAlert_({status:'success'});assert.equal(sent.length,1);
 c.aqNestEmailAlert_({status:'stale'});c.aqNestEmailAlert_({status:'error'});assert.equal(sent.length,2);
 c.aqNestEmailAlert_({status:'success'});assert.equal(sent.length,3);assert.match(sent[2].subject,/recovered/);
 props.NEST_ALERT_EMAIL='other@example.com';c.aqNestEmailAlert_({status:'error'});assert.equal(sent.length,3);
});
test('Archive recovery imports timestamped discovery, deduplicates snapshots and excludes administrative events and unverified times',()=>{
 const {recoverArchive}=require('../scripts/nest_recover_archive.js');
 const d={name:'device1',type:'sdm.devices.types.THERMOSTAT',traits:traits('OFF')};
 const entries=[{file:{id:'a',name:'discovery-2026-10-19T18-36-24.330Z.json.gz'},raw:{devices:[d]}},{file:{id:'b',name:'local.json'},raw:{devices:[d]}},{file:{id:'c',name:'event.json.gz'},raw:{event:{eventId:'administrative',timestamp:t(0)}}}];
 const a=recoverArchive(entries,[],t(30));assert.equal(a.observations.length,1);assert.equal(a.observations[0].timestamp_utc,'2026-10-19T18:36:24.330Z');
 assert.equal(a.audit[1].outcome,'excluded_unverified_time');assert.equal(a.audit[2].outcome,'excluded_no_device_state');
 assert.equal(recoverArchive(entries,a.observations,t(31)).observations.length,0);
});
