const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),plain=v=>JSON.parse(JSON.stringify(v));
const source=fs.readFileSync(path.join(root,'src/18_NestCore.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'nest-worker/Code.js'),'utf8');
const usageHeaders=['date_utc','updated_at_utc','runs','pull_requests','messages_received','snapshot_requests','delivery_proxy_bytes','archive_bytes','archive_files','runtime_minutes','status','scope'];
function fixture(options={}) {
 let now=Date.parse(options.start||'2026-10-20T12:01:00Z'),uuid=0,releases=0,opens=0,flushes=0;
 const calls=[],tables={},props={SPREADSHEET_ID:'mock-sheet',NEST_DEVICE_ACCESS_PROJECT_ID:'mock-project',NEST_CLIENT_ID:'mock-client',NEST_CLIENT_SECRET:'mock-secret',NEST_REFRESH_TOKEN:'mock-refresh',NEST_ENABLED:'true',NEST_ZONES_JSON:'{"device1":"whole_house"}',NEST_RAW_FOLDER_ID:'mock-folder',NEST_SUBSCRIPTION:'projects/mock-project/subscriptions/mock-sub',NEST_COLLECTION_START_UTC:'2026-10-20T11:45:00Z',NEST_LAST_SNAPSHOT_MS:String(now),...options.props};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const tick=()=>{now+=options.tick||1;};
 function sheet(name,data=[]) {
  const s={data:data.map(r=>r.slice()),frozen:1,getLastRow(){return this.data.length;},getLastColumn(){return Math.max(0,...this.data.map(r=>r.length));},getMaxRows(){return 10000;},getMaxColumns(){return 50;},getFrozenRows(){return this.frozen;},setFrozenRows(n){this.frozen=n;},insertRowsAfter(){},insertColumnsAfter(){},
   getRange(row,col,n=1,m=1){return {
    getValues(){tick();calls.push({op:'read',name,row,col,n,m});if(options.beforeRead)options.beforeRead({name,row,col,n,m,s});return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>s.data[row+i-1]?.[col+j-1]??''));},
    getDisplayValues(){return this.getValues().map(r=>r.map(v=>v instanceof Date?v.toISOString().slice(0,10):String(v)));},
    setValues(values){tick();if(options.beforeWrite)options.beforeWrite({name,row,col,n,m,values,s});calls.push({op:'write',name,row,col,n,m,values:plain(values)});values.forEach((r,i)=>{if(!s.data[row+i-1])s.data[row+i-1]=[];r.forEach((v,j)=>s.data[row+i-1][col+j-1]=v);});return this;},setNumberFormat(){return this;},
    clearContent(){for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(s.data[row+i-1])s.data[row+i-1][col+j-1]='';while(s.data.at(-1)?.every(v=>v===''))s.data.pop();},
    sort(){calls.push({op:'sort',name});const part=s.data.slice(row-1,row-1+n).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));s.data.splice(row-1,n,...part);}
   };}
  };tables[name]=s;return s;
 }
 const book={getSheetByName:n=>tables[n]||null,insertSheet:n=>sheet(n)};
 const c={Date:Clock,JSON,Object,Number,Set,Math,Error,Utilities:{getUuid:()=>`mock-run-${++uuid}`,base64Decode:s=>s,newBlob:v=>({getDataAsString:()=>v})},
  PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...props}),getProperty:k=>props[k]??null,setProperty:(k,v)=>{tick();props[k]=v;},setProperties:p=>{tick();Object.assign(props,p);},deleteProperty:k=>{tick();if(options.deleteFailure){options.deleteFailure=false;throw Error('mock deletion failure');}delete props[k];}})},
  LockService:{getScriptLock:()=>({tryLock:()=>{tick();return options.lock!==false;},releaseLock:()=>{releases++;tick();}})},
  SpreadsheetApp:{openById:()=>{opens++;tick();return book;},flush:()=>{flushes++;tick();if(options.flushFailure===flushes)throw Error('PRIVATE UNTRUSTED DETAIL');}}
 };
 vm.createContext(c);vm.runInContext(source,c);c.nestLocal_=s=>s;let pulls=0;
 c.nestPubsub_=(action)=>{tick();calls.push({op:action});if(action==='pull'){pulls++;return options.event&&pulls===1?{receivedMessages:[{ackId:'mock-ack',message:{messageId:'mock-message',data:JSON.stringify({eventId:'mock-event',timestamp:'2026-10-20T12:00:30Z',resourceUpdate:{name:'device1',traits:{'sdm.devices.traits.Temperature':{ambientTemperatureCelsius:18}}}})}}]}:{};}return {};};
 c.nestSnapshot_=()=>{tick();return {devices:[{name:'device1',type:'sdm.devices.types.THERMOSTAT',traits:{'sdm.devices.traits.ThermostatHvac':{status:'OFF'},'sdm.devices.traits.Connectivity':{status:'ONLINE'}}}]};};
 c.nestArchive_=(name,payload)=>{tick();calls.push({op:'archive',name,payload:plain(payload)});};
 return {c,props,calls,tables,sheet,options,advance:ms=>{now+=ms;},get releases(){return releases;},get opens(){return opens;},get now(){return now;}};
}
function rows(f,name){const s=f.tables[name];return s?s.data.slice(1).map(r=>Object.fromEntries(s.data[0].map((h,i)=>[h,r[i]??'']))):[];}
function pending(f){return Object.entries(f.props).filter(([k])=>k.startsWith('NEST_PENDING_')).map(([,v])=>JSON.parse(v));}
test('unchanged upserts preserve ingestion; changed adjacent rows batch and identical retry writes nothing',()=>{
 const f=fixture(),h=['key','value','ingested_at_utc'];f.sheet('Mock',[h,['a',1,'original'],['b',2,'original'],['c',3,'original']]);
 const input=[{key:'a',value:1,ingested_at_utc:'new'},{key:'b',value:20,ingested_at_utc:'new'},{key:'c',value:30,ingested_at_utc:'new'}];f.c.nestUpsert_('Mock',h,input);
 const w=f.calls.filter(x=>x.op==='write');assert.equal(w.length,1);assert.equal(w[0].row,3);assert.equal(w[0].n,2);assert.equal(f.tables.Mock.data[1][2],'original');f.calls.length=0;f.c.nestUpsert_('Mock',h,input.map(r=>({...r,ingested_at_utc:'later'})));assert.equal(f.calls.filter(x=>x.op==='write').length,0);
});
test('Master writes changed Nest cells only, batches affected spans and preserves historical/unrelated values',()=>{
 const f=fixture();f.sheet('Master_15min',[['timestamp_utc','other','nest_present','nest_zone_count','nest_zones_json'],['old','untouched','old-presence','old-count','old-json'],['a','keep-a','','',''],['b','keep-b','','',''],['c','keep-c','','','']]);
 const bins=['a','b'].map(timestamp_utc=>({timestamp_utc,zone_id:'whole_house',known_duration_minutes:0,unknown_duration_minutes:15}));f.c.nestPatchMaster_(bins);const w=f.calls.filter(x=>x.op==='write');assert.equal(w.length,1);assert.deepEqual([w[0].row,w[0].col,w[0].n,w[0].m],[3,3,2,3]);assert.equal(f.tables.Master_15min.data[2][1],'keep-a');assert.equal(f.tables.Master_15min.data[1][4],'old-json');f.calls.length=0;f.c.nestPatchMaster_(bins);assert.equal(f.calls.filter(x=>x.op==='write').length,0);
});
test('Master key movement before selective write is detected',()=>{
 let reads=0;const f=fixture({beforeRead:({name,col,row,s})=>{if(name==='Master_15min'&&col===1&&row===2&&++reads===2)s.data[1][0]='moved';}});f.sheet('Master_15min',[['timestamp_utc','nest_present','nest_zone_count','nest_zones_json'],['a','','','']]);assert.throws(()=>f.c.nestPatchMaster_([{timestamp_utc:'a',zone_id:'whole_house'}]),/concurrently/);assert.equal(f.calls.filter(x=>x.op==='write').length,0);
});
test('Date-valued daily keys retain existing duplicates without appending another',()=>{
 const f=fixture(),day=new f.c.Date('2026-10-19T06:00:00Z');f.sheet('Nest_Usage',[usageHeaders,[day,'early',1],[day,'late',314]]);const original=f.tables.Nest_Usage.data[1].slice();f.c.nestUpsert_('Nest_Usage',usageHeaders,[{date_utc:'2026-10-19',updated_at_utc:'latest',runs:315}]);assert.equal(f.tables.Nest_Usage.data.length,3);assert.deepEqual(f.tables.Nest_Usage.data[1],original);assert.equal(f.tables.Nest_Usage.data[2][2],315);
});
test('warning changes usage only and extends headers without rewriting existing columns',()=>{
 const f=fixture({props:{NEST_USAGE_CURRENT:JSON.stringify({day:'2026-10-20',runtime_ms:181*60000})}});f.sheet('Nest_Usage',[usageHeaders]);f.c.nestStatus_=()=>assert.fail('usage cannot write health');f.c.nestWriteUsage_();assert.equal(rows(f,'Nest_Usage')[0].status,'review_usage');assert.equal(f.tables.Nest_Usage.data[0].length,19);
});
test('UTC midnight splits elapsed time; outcomes count by start day and termination duration stays unknown',()=>{
 const f=fixture(),t=plain(f.c.nestAttemptTotals_([{started_at_utc:'2026-10-19T23:59:50Z',elapsed_ms:20000,counted:true,outcome:'success'},{started_at_utc:'2026-10-20T00:01:00Z',elapsed_ms:null,counted:true,outcome:'unfinished'}]));assert.equal(t['2026-10-19'].elapsed_ms,10000);assert.equal(t['2026-10-20'].elapsed_ms,10000);assert.equal(t['2026-10-19'].successful_runs,1);assert.equal(t['2026-10-20'].unfinished_runs,1);
 f.advance(Date.parse('2026-10-20T23:59:59Z')-f.now);f.c.nestUsageAdd_('archive_bytes',100);f.advance(2000);f.c.nestUsageAdd_('archive_bytes',200);assert.equal(JSON.parse(f.props['NEST_USAGE_DAY_2026-10-20']).archive_bytes,100);assert.equal(JSON.parse(f.props['NEST_USAGE_DAY_2026-10-21']).archive_bytes,200);
});
test('disabled and busy outcomes use unique deferred records with no sheet traffic or shared counter mutation',()=>{
 for(const options of [{lock:false},{props:{NEST_ENABLED:'false'}}]){const f=fixture(options);assert.equal(f.c.runNestCollection().status,options.lock===false?'busy':'disabled');assert.equal(pending(f).length,1);assert.equal(pending(f)[0].counted,false);assert.equal(f.opens,0);assert.equal(f.releases,0);assert.ok(pending(f)[0].elapsed_ms>0);}
});
test('normal collection archives and persists before ack; completes after required writes and caches book handles',()=>{
 const f=fixture({event:true});assert.equal(f.c.runNestCollection().status,'success');assert.equal(f.opens,1);assert.equal(f.releases,1);const ops=f.calls;assert.ok(ops.findIndex(x=>x.op==='archive'&&x.name==='event-mock-message')<ops.findIndex(x=>x.op==='acknowledge'));assert.ok(ops.findIndex(x=>x.op==='write'&&x.name==='Nest_Observations'&&x.row===2)<ops.findIndex(x=>x.op==='acknowledge'));assert.equal(rows(f,'Nest_Run_Attempts')[0].outcome,'success');assert.equal(pending(f)[0].outcome,'success');assert.equal(rows(f,'Source_Status')[0].consecutive_failures,0);assert.ok(ops.findLastIndex(x=>x.op==='write'&&x.name==='Nest_Run_Attempts')>ops.findIndex(x=>x.op==='write'&&x.name==='Nest_Usage'&&x.row===2));f.advance(60000);f.c.runNestCollection();assert.equal(rows(f,'Nest_Usage')[0].attempts,1);assert.equal(rows(f,'Nest_Usage')[0].successful_runs,1);assert.ok(rows(f,'Nest_Usage')[0].runtime_minutes>0);
});
test('failure after checkpoint reports error once; warning cannot replace it or disclose arbitrary exception details',()=>{
 let fail=true;const f=fixture({props:{NEST_USAGE_CURRENT:JSON.stringify({day:'2026-10-20',runtime_ms:181*60000})},beforeWrite:({name,row})=>{if(fail&&name==='Nest_Usage'&&row===2){fail=false;throw Error('PRIVATE DETAIL');}}});assert.equal(f.c.runNestCollection().status,'error');assert.equal(rows(f,'Nest_Run_Attempts')[0].outcome,'error');assert.equal(rows(f,'Nest_Run_Attempts')[0].stage,'monitoring');assert.equal(rows(f,'Source_Status')[0].status,'error');assert.equal(rows(f,'Source_Status')[0].consecutive_failures,1);assert.equal(rows(f,'Nest_Collection_Health')[0].status,'error');assert.doesNotMatch(JSON.stringify(f.tables),/PRIVATE DETAIL/);
});
test('ledger failure never acknowledges archived raw events',()=>{
 const f=fixture({event:true,beforeWrite:({name,row})=>{if(name==='Nest_Observations'&&row===2)throw Error('ledger failure');}});assert.equal(f.c.runNestCollection().status,'error');assert.ok(f.calls.some(x=>x.op==='archive'));assert.equal(f.calls.some(x=>x.op==='acknowledge'),false);assert.equal(f.releases,1);
});
test('final completion flush failure remains a failed attempt',()=>{
 const f=fixture({flushFailure:4});assert.equal(f.c.runNestCollection().status,'error');assert.equal(pending(f)[0].outcome,'error');assert.equal(rows(f,'Nest_Run_Attempts')[0].outcome,'error');
});
test('retry after pending deletion failure cannot double-count an invocation',()=>{
 const f=fixture();f.props.NEST_PENDING_old=JSON.stringify({run_id:'old',started_at_utc:'2026-10-20T12:00:00Z',outcome:'success',counted:true,elapsed_ms:1000,completed_at_utc:'2026-10-20T12:00:01Z'});f.options.deleteFailure=true;assert.throws(()=>f.c.nestDrainAttempts_('current'),/deletion/);f.c.nestDrainAttempts_('current');assert.equal(rows(f,'Nest_Run_Attempts').length,1);f.c.nestWriteUsage_();assert.equal(rows(f,'Nest_Usage')[0].attempts,1);
});
test('abandoned counted record becomes unfinished, but a concurrent lock waiter is left alone',()=>{
 const f=fixture();f.props.NEST_PENDING_old=JSON.stringify({run_id:'old',started_at_utc:'2026-10-20T12:00:00Z',outcome:'running',counted:true});f.props.NEST_PENDING_waiting=JSON.stringify({run_id:'waiting',started_at_utc:'2026-10-20T12:00:59Z',outcome:'running',counted:false});f.c.nestDrainAttempts_('current');assert.equal(rows(f,'Nest_Run_Attempts')[0].outcome,'unfinished');assert.equal(rows(f,'Nest_Run_Attempts')[0].elapsed_ms,'');assert.ok(f.props.NEST_PENDING_waiting);f.c.nestWriteUsage_();assert.equal(rows(f,'Nest_Usage')[0].unfinished_runs,1);
});
test('old whole-day compaction preserves totals across repeated processing while bounding the attempt ledger',()=>{
 const f=fixture();f.props.NEST_PENDING_old=JSON.stringify({run_id:'old',started_at_utc:'2026-10-10T12:00:00Z',outcome:'success',counted:true,elapsed_ms:1000,completed_at_utc:'2026-10-10T12:00:01Z'});f.c.nestDrainAttempts_('current');f.c.nestWriteUsage_();assert.equal(rows(f,'Nest_Usage').find(r=>r.date_utc==='2026-10-10').successful_runs,1);assert.equal(rows(f,'Nest_Run_Attempts').length,0);f.c.nestWriteUsage_();assert.equal(rows(f,'Nest_Usage').find(r=>r.date_utc==='2026-10-10').successful_runs,1);
});
test('successful warning run keeps healthy status and writes it only once',()=>{
 const f=fixture({props:{NEST_USAGE_CURRENT:JSON.stringify({day:'2026-10-20',runtime_ms:181*60000})}});assert.equal(f.c.runNestCollection().status,'success');assert.equal(rows(f,'Nest_Usage')[0].status,'review_usage');assert.equal(rows(f,'Source_Status')[0].status,'success');assert.equal(rows(f,'Source_Status')[0].consecutive_failures,0);assert.equal(f.calls.filter(x=>x.op==='write'&&x.name==='Source_Status'&&x.row===2).length,1);
});
test('historical fixture retains 2756 keys, four source gaps and explicit unsupported runtime through live upserts',()=>{
 const f=fixture(),headers=vm.runInContext('NEST_HEADERS',f.c),gaps=new Set([12,13,14,15].map(d=>`2026-10-${d}T23:45:00Z`)),data=[];
 for(let t=Date.parse('2026-09-20T06:00:00Z');t<Date.parse('2026-10-19T00:00:00Z');t+=900000){const utc=new Date(t).toISOString().replace('.000Z','Z');if(!gaps.has(utc)){const r={bin_zone_key:utc+'|whole_house',timestamp_utc:utc,zone_id:'whole_house',heating_minutes:null,cooling_minutes:null,known_duration_minutes:0,unknown_duration_minutes:15,duration_basis:'takeout_anomalous_interval_unknown',ingested_at_utc:'original'};data.push(headers.map(k=>r[k]??''));}}
 assert.equal(data.length,2756);f.sheet('Nest_15min',[headers,...data]);const before=JSON.stringify(f.tables.Nest_15min.data);f.c.nestUpsert_('Nest_15min',headers,[{bin_zone_key:'2026-10-20T12:00:00Z|whole_house',timestamp_utc:'2026-10-20T12:00:00Z',zone_id:'whole_house',heating_minutes:null,known_duration_minutes:0,unknown_duration_minutes:15,ingested_at_utc:'new'}]);assert.equal(JSON.stringify(f.tables.Nest_15min.data.slice(0,2757)),before);for(const gap of gaps)assert.equal(rows(f,'Nest_15min').some(r=>r.timestamp_utc===gap),false);
});
test('midnight spill remains accounted when old attempt rows are compacted',()=>{
 const f=fixture();f.props.NEST_PENDING_old=JSON.stringify({run_id:'cross',started_at_utc:'2026-10-16T23:59:50Z',completed_at_utc:'2026-10-17T00:00:10Z',outcome:'success',counted:true,elapsed_ms:20000});f.c.nestDrainAttempts_('current');f.c.nestWriteUsage_();f.c.nestWriteUsage_();assert.equal(rows(f,'Nest_Usage').find(r=>r.date_utc==='2026-10-17').runtime_minutes,10000/60000);assert.equal(rows(f,'Nest_Run_Attempts').length,1);
});
test('conflicting duplicate input or stored observation is rejected',()=>{
 const f=fixture();assert.throws(()=>f.c.nestUpsert_('Mock',['key','value'],[{key:'a',value:1},{key:'a',value:2}]),/conflicting input/);f.sheet('Nest_Observations',[['observation_id','traits_json','ingested_at_utc'],['a','first','original']]);assert.throws(()=>f.c.nestUpsert_('Nest_Observations',['observation_id','traits_json','ingested_at_utc'],[{observation_id:'a',traits_json:'second',ingested_at_utc:'new'}]),/conflicting stored/);
});
test('watchdog detects unfinished attempt despite a recent early success timestamp',()=>{
 const f=fixture(),sh=['source','last_attempt_utc','last_success_utc','status','consecutive_failures'];f.sheet('Source_Status',[sh,['nest','2026-10-20T12:00:59Z','2026-10-20T12:00:59Z','success',0]]);const ah=vm.runInContext('NEST_ATTEMPT_HEADERS',f.c),a={run_id:'abandoned',started_at_utc:'2026-10-20T11:50:00Z',outcome:'running',counted:true};f.sheet('Nest_Run_Attempts',[ah,ah.map(k=>a[k]??'')]);let updated;f.c.AQ_SHEETS={STATUS:'Source_Status'};f.c.AQ_STATUS_HEADERS=sh;f.c.aqSpreadsheet_=()=>({getSheetByName:n=>f.tables[n]});f.c.aqObjectRows_=(h,rs)=>rs.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));f.c.aqUpdateSourceStatus_=r=>{updated={...r};};f.c.aqNestEmailAlert_=()=>{};f.c.aqRefreshNestStatus_();assert.equal(updated.status,'stale');assert.match(updated.message,/end-to-end/);
});
test('bounded pending buffer reports incomplete telemetry rather than filling Properties indefinitely',()=>{
 const f=fixture({lock:false});for(let i=0;i<512;i++)f.props['NEST_PENDING_old-'+i]=JSON.stringify({run_id:'old-'+i,started_at_utc:'2026-10-20T12:00:00Z',outcome:'busy',counted:false});assert.equal(f.c.runNestCollection().status,'busy');assert.equal(pending(f).length,512);assert.match(f.props['NEST_TELEMETRY_GAP_2026-10-20'],/incomplete/);
});
test('flush failure before acknowledgment never acknowledges a buffered normalized write',()=>{
 const f=fixture({event:true,flushFailure:2});assert.equal(f.c.runNestCollection().status,'error');assert.equal(f.calls.some(x=>x.op==='acknowledge'),false);
});
test('execution-local worker row cache is coherent after append/update and avoids full-sheet sorts',()=>{
 const f=fixture(),h=['run_id','status'];f.sheet('Nest_Collection_Health',[h,['z','success']]);vm.runInContext('nestExecution_ = {sheets: {}, rows: {}}',f.c);const read=f.c.nestRead_('Nest_Collection_Health',h);read[0].status='mutated-copy';f.c.nestUpsert_('Nest_Collection_Health',h,[{run_id:'a',status:'checkpoint'}]);f.c.nestUpsert_('Nest_Collection_Health',h,[{run_id:'a',status:'success'}]);assert.deepEqual(plain(f.c.nestRead_('Nest_Collection_Health',h)),[{run_id:'z',status:'success'},{run_id:'a',status:'success'}]);assert.equal(f.tables.Nest_Collection_Health.data[2][1],'success');assert.equal(f.calls.filter(x=>x.op==='sort').length,0);assert.equal(f.calls.filter(x=>x.op==='read'&&x.name==='Nest_Collection_Health'&&x.row===2).length,1);
});
test('diagnostic codes preserve HTTP/quota class without persisting arbitrary error text',()=>{
 const f=fixture();assert.equal(f.c.nestErrorCode_(Error('Nest HTTP 401')),'http_401');assert.equal(f.c.nestErrorCode_(Error('Service using too much computer time for one day.')),'platform_runtime_quota');assert.equal(f.c.nestErrorCode_(Error('PRIVATE TOKEN')),'processing_failed');
});
test('health batches defer the current checkpoint and retain previous finalized success for archive recovery',()=>{
 const f=fixture();f.c.runNestCollection();const first=pending(f)[0].run_id;f.advance(15*60000);f.c.runNestCollection();const batches=f.calls.filter(x=>x.op==='archive'&&x.name.startsWith('health-batch-'));assert.equal(batches.length,1);assert.equal(batches[0].payload.length,1);assert.equal(batches[0].payload[0].run_id,first);assert.equal(batches[0].payload[0].status,'success');
});
