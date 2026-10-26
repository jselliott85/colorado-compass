// Template authoring only. Never connects to or replaces the live Google workbook.
// Run a copy in a directory linked to the approved @oai/artifact-tool runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const root = process.argv[2];
const out = process.argv[3];
if (!root || !out) throw new Error('Usage: node build-workbook.mjs <nutrition-os-dir> <output-dir>');
const schema = JSON.parse(await fs.readFile(path.join(root, 'schema.json'), 'utf8'));
await fs.mkdir(out, { recursive: true });
const wb = Workbook.create();
const names = ['Dashboard', ...Object.keys(schema.tabs)];
const sheets = Object.fromEntries(names.map(name => [name, wb.worksheets.add(name)]));
const end = schema.input_last_row;
const days = schema.summary_days;
const col = n => { let s=''; for(n++; n; n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; };
const set = (s, a, v) => sheets[s].getRange(a).values = [[v]];
const fx = (s, a, v) => sheets[s].getRange(a).formulas = [[v]];
for (const [name, headers] of Object.entries(schema.tabs)) {
  const sh = sheets[name], last = col(headers.length-1);
  sh.getRange(`A1:${last}1`).values = [headers];
  sh.getRange(`A1:${last}1`).format = { fill:'#EEEEEE', font:{name:'Arial',size:11,bold:true}, wrapText:true, rowHeight:44, verticalAlignment:'center' };
  sh.getRange(`A2:${last}12`).format.font = {name:'Arial',size:11};
  sh.getRange(`A:${last}`).format.columnWidthPx = 155;
  sh.getRange('A:A').format.columnWidthPx=220;
  sh.freezePanes.freezeRows(1);
  sh.showGridLines=true;
}
// Configuration only: no personal observations, nutrition targets or sample records.
const settings = [
  ['timezone','America/Denver','Local reporting timezone','approved architecture'],
  ['week_start','Monday','Weekly reporting boundary','approved architecture'],
  ['default_kcal',null,'Optional editable default target; blank means unset','user configurable'],
  ['default_protein_g',null,'Optional editable default target; blank means unset','user configurable'],
  ['default_carbohydrate_g',null,'Optional editable default target; blank means unset','user configurable'],
  ['default_fat_g',null,'Optional editable default target; blank means unset','user configurable'],
  ['dashboard_date',null,'Optional date override; blank uses today in Denver','user configurable'],
  ['summary_start_date',46321,'Calendar scaffold start; extend before coverage ends','foundation date'],
  ['summary_days',days,'Prepared daily rows; extending requires formula extension','template capacity'],
  ['input_last_row',end,'Last included input row; extend formulas and validation before exceeding','template capacity'],
  ['strava_status','disabled','Usage-policy questions unresolved; no ingestion','user instruction'],
  ['garmin_status','not_connected','Subsequent task','user instruction'],
  ['trainingpeaks_status','not_connected','Subsequent task','user instruction'],
  ['schema_version',schema.version,'Headers and logging contract version','foundation'],
  ['native_logging_verified','2026-10-26','Create, write, read, correct, no duplicate; Scout actual ChatGPT','user-reported execution'],
  ['last_confirmed_food_write_utc',null,'Scout updates only after successful row readback','no writes yet']
];
sheets.Settings.getRange(`A2:D${settings.length+1}`).values=settings;
sheets.Settings.getRange('B4:B7').format.numberFormat='0.0';
sheets.Settings.getRange('B8:B9').format.numberFormat='yyyy-mm-dd';
sheets.Settings.getRange('C:C').format.columnWidthPx=430;
sheets.Settings.getRange('B:B').format.columnWidthPx=180;
// ISO UTC timestamps remain text; dates are numeric date-only spreadsheet values.
for (const [name, headers] of Object.entries(schema.tabs)) {
  if (['Settings','Daily summary','Weekly summary'].includes(name)) continue;
  headers.forEach((h,i) => {
    const range=sheets[name].getRange(`${col(i)}2:${col(i)}${end}`);
    if (h==='local_date') range.format.numberFormat='yyyy-mm-dd';
    else if (h.endsWith('_id') || h.endsWith('_utc') || h==='source_id') range.format.numberFormat='@';
    else if (/^(kcal|protein_g|carbohydrate_g|fat_g|weight_kg|body_.*_pct|.*_mass_kg|quantity|.*_s|distance_m|estimated_kcal|average_.*|energy_kj|revision)$/.test(h)) range.format.numberFormat='0.0';
  });
}
sheets['Food log'].getRange('E:E').format.columnWidthPx=300;
// Daily build: source coverage guards preserve missing nutrients as blank, not zero.
const food = c => `'Food log'!$${c}$2:$${c}$${end}`;
const targets = c => `'Daily nutrition targets'!$${c}$2:$${c}$${end}`;
for(let r=2;r<=days+1;r++) {
  fx('Daily summary',`A${r}`,r===2?"='Settings'!B9":`=A${r-1}+1`);
  fx('Daily summary',`B${r}`,`=COUNTIFS(${food('C')},A${r},${food('U')},"active")`);
  for(let i=0;i<4;i++) {
    const src=col(5+i), dst=col(2+i), tar=col(2+i), defaultRow=4+i;
    fx('Daily summary',`${dst}${r}`,`=IF(B${r}=0,"",IF(COUNTIFS(${food('C')},A${r},${food('U')},"active",${food(src)},">=0",${food(src)},"<>")<>B${r},"",SUMIFS(${food(src)},${food('C')},A${r},${food('U')},"active")))`);
    const count=`COUNTIFS(${targets('B')},A${r},${targets('K')},"active")`;
    const vals=`COUNTIFS(${targets('B')},A${r},${targets('K')},"active",${targets(tar)},">=0",${targets(tar)},"<>")`;
    fx('Daily summary',`${col(6+i)}${r}`,`=IF(${count}>1,"Duplicate targets",IF(${count}=1,IF(${vals}=0,"",SUMIFS(${targets(tar)},${targets('B')},A${r},${targets('K')},"active")),IF('Settings'!B${defaultRow}="","",'Settings'!B${defaultRow})))`);
  }
  fx('Daily summary',`K${r}`,`=IF(AND(ISNUMBER(C${r}),ISNUMBER(G${r})),G${r}-C${r},"")`);
  fx('Daily summary',`L${r}`,`=IF(M${r}="complete","Complete",IF(B${r}=0,"No entries","Partial"))`);
  set('Daily summary',`N${r}`,'derived_food_log');
}
sheets['Daily summary'].getRange(`A2:A${days+1}`).format.numberFormat='yyyy-mm-dd';
sheets['Daily summary'].getRange(`C2:K${days+1}`).format.numberFormat='0.0';
const lastDaily=days+1, weeks=Math.ceil((days+6)/7);
for(let r=2;r<=weeks+1;r++) {
  fx('Weekly summary',`A${r}`,r===2?"='Daily summary'!A2-WEEKDAY('Daily summary'!A2,2)+1":`=A${r-1}+7`);
  const dates=`'Daily summary'!$A$2:$A$${lastDaily}`;
  const criteria=`${dates},">="&A${r},${dates},"<"&A${r}+7`;
  fx('Weekly summary',`B${r}`,`=COUNTIFS(${criteria},'Daily summary'!$B$2:$B$${lastDaily},">0")`);
  fx('Weekly summary',`C${r}`,`=COUNTIFS(${criteria},'Daily summary'!$M$2:$M$${lastDaily},"complete")`);
  for(let i=0;i<4;i++) {
    const d=col(2+i), range=`'Daily summary'!$${d}$2:$${d}$${lastDaily}`;
    fx('Weekly summary',`${col(3+i)}${r}`,`=IF(B${r}=0,"",IF(COUNTIFS(${criteria},${range},">=0",${range},"<>")<>B${r},"",SUMIFS(${range},${criteria})/B${r}))`);
  }
  set('Weekly summary',`H${r}`,'derived_daily_summary');
}
sheets['Weekly summary'].getRange(`A2:A${weeks+1}`).format.numberFormat='yyyy-mm-dd';
sheets['Weekly summary'].getRange(`D2:G${weeks+1}`).format.numberFormat='0.0';
const dash=sheets.Dashboard;
dash.showGridLines=false;
dash.getRange('A1:C30').format.font={name:'Arial',size:11};
dash.getRange('A:A').format.columnWidthPx=160;
dash.getRange('B:B').format.columnWidthPx=120;
dash.getRange('C:C').format.columnWidthPx=100;
dash.getRange('A1:C30').format.rowHeight=26;
set('Dashboard','A2','Nutrition OS'); dash.getRange('A2').format.font={name:'Arial',size:16,bold:true};
set('Dashboard','A4','Denver date'); fx('Dashboard','B4',"=IF('Settings'!B8=\"\",TODAY(),'Settings'!B8)"); dash.getRange('B4').format.numberFormat='yyyy-mm-dd';
set('Dashboard','A5','Logging');
const match=`MATCH(B4,'Daily summary'!$A$2:$A$${lastDaily},0)`;
fx('Dashboard','B5',`=IF(COUNTIFS('Daily summary'!$A$2:$A$${lastDaily},B4)=0,"Extend calendar",INDEX('Daily summary'!$L$2:$L$${lastDaily},${match}))`);
dash.getRange('A7:C7').values=[['Nutrient','Logged','Target']];dash.getRange('A7:C7').format.fill='#EEEEEE';dash.getRange('A7:C7').format.font.bold=true;
for(let i=0;i<4;i++) {
  set('Dashboard',`A${8+i}`,['Calories (kcal)','Protein (g)','Carbs (g)','Fat (g)'][i]);
  for(const [dest,src] of [['B',col(2+i)],['C',col(6+i)]]) {
    const ref=`INDEX('Daily summary'!$${src}$2:$${src}$${lastDaily},${match})`;
    fx('Dashboard',`${dest}${8+i}`,`=IF(COUNTIFS('Daily summary'!$A$2:$A$${lastDaily},B4)=0,"",IF(${ref}="","",${ref}))`);
  }
}
dash.getRange('B8:C11').format.numberFormat='0.0';
set('Dashboard','A13','Calories remaining');fx('Dashboard','B13','=IF(AND(ISNUMBER(B8),ISNUMBER(C8)),C8-B8,"")');
set('Dashboard','A15','Targets');set('Dashboard','B15','Settings / dated targets');
set('Dashboard','A17','Strava');fx('Dashboard','B17',"='Settings'!B12");
set('Dashboard','A18','Garmin');fx('Dashboard','B18',"='Settings'!B13");
set('Dashboard','A19','TrainingPeaks');fx('Dashboard','B19',"='Settings'!B14");
set('Dashboard','A21','Last food write');fx('Dashboard','B21',"=IF('Settings'!B17=\"\",\"None yet\",'Settings'!B17)");
set('Dashboard','A23','Blank = unknown / unset');
set('Dashboard','A24','Totals cover logged food only');
set('Dashboard','A25','Complete days need confirmation');
set('Dashboard','A26','Exercise does not change targets');
dash.getRange('A23:C26').format.rowHeight=22;
// Boundary checks use disposable local values, then restore every observation/target.
const putMeal=(row,values)=>sheets['Food log'].getRange(`A${row}:V${row}`).values=[values];
const meal=['synthetic-id','synthetic-op',46321,'test','synthetic',400,30,40,10,null,'date',null,null,'reported','model_estimate','synthetic',null,'2026-10-26T18:00:00Z','2026-10-26T18:00:00Z',1,'active',null];
putMeal(2,meal); wb.recalculate();
assert.equal(sheets['Daily summary'].getRange('C2').values[0][0],400);
assert.equal(sheets['Daily summary'].getRange('G2').values[0][0],'');
meal[5]=450;meal[19]=2;putMeal(2,meal);wb.recalculate();
assert.equal(sheets['Daily summary'].getRange('B2').values[0][0],1);
assert.equal(sheets['Daily summary'].getRange('C2').values[0][0],450);
meal[5]=null;putMeal(2,meal);wb.recalculate();
assert.equal(sheets['Daily summary'].getRange('C2').values[0][0],'');
meal[5]=0;putMeal(2,meal);wb.recalculate();
assert.equal(sheets['Daily summary'].getRange('C2').values[0][0],0);
meal[20]='void';putMeal(2,meal);wb.recalculate();
assert.equal(sheets['Daily summary'].getRange('C2').values[0][0],'');
sheets['Food log'].getRange('A2:V2').clear({applyTo:'contents'});
wb.recalculate();
assert.equal(sheets['Daily summary'].getRange('L2').values[0][0],'No entries');
console.log('Local formula checks: correction, one active row, missing vs zero, void, blank targets passed.');
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!',options:{useRegex:true,maxResults:10},maxChars:1500})).ndjson);
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(path.join(out,'Nutrition OS.xlsx'));
for(const name of names) {
  const preview=await wb.render({sheetName:name,range:name==='Dashboard'?'A1:C27':name==='Settings'?'A1:D17':'A1:F5',scale:1,format:'png'});
  await fs.writeFile(path.join(out,`${name}.png`),new Uint8Array(await preview.arrayBuffer()));
}
await fs.writeFile(path.join(out,'build-checks.json'),JSON.stringify({schema_version:schema.version,tabs:names,local_checks:'passed',input_last_row:end,summary_days:days},null,2));
console.log('Exported template and previews; no personal observations or targets.');
