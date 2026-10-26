// Pure request builder for the new, verified-empty native workbook only.
// No credentials, workbook IDs, live records or network calls are stored here.
export function foundationRequests(schema, sheetProperties) {
  const map = Object.fromEntries(sheetProperties.map(p => [p.title,p]));
  for(const name of ['Dashboard',...Object.keys(schema.tabs)]) {
    if(!map[name]) throw new Error(`Missing tab: ${name}`);
  }
  const requests=[{updateSpreadsheetProperties:{properties:{timeZone:schema.timezone,locale:'en_US',autoRecalc:'ON_CHANGE'},fields:'timeZone,locale,autoRecalc'}}];
  // Ensure the scaffold date is a persisted numeric date after XLSX conversion.
  requests.push({updateCells:{start:{sheetId:map.Settings.sheetId,rowIndex:8,columnIndex:1},rows:[{values:[{userEnteredValue:{numberValue:46321},userEnteredFormat:{numberFormat:{type:'DATE',pattern:'yyyy-mm-dd'}}}]}],fields:'userEnteredValue,userEnteredFormat.numberFormat'}});
  const end=schema.input_last_row;
  const col = n => { let s=''; for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s; };
  const range=(name,startCol,endCol,startRow=1,endRow=end)=>({sheetId:map[name].sheetId,startRowIndex:startRow,endRowIndex:endRow,startColumnIndex:startCol,endColumnIndex:endCol});
  const validate=(r,condition)=>requests.push({setDataValidation:{range:r,rule:{condition,strict:true,showCustomUi:true}}});
  const custom=(r,formula)=>validate(r,{type:'CUSTOM_FORMULA',values:[{userEnteredValue:formula}]});
  const list=(r,values)=>validate(r,{type:'ONE_OF_LIST',values:values.map(v=>({userEnteredValue:v}))});
  for(const [name,headers] of Object.entries(schema.tabs)) {
    if(['Daily summary','Weekly summary','Settings'].includes(name)) continue;
    const props=map[name];
    if(props.gridProperties.rowCount<end) requests.push({updateSheetProperties:{properties:{sheetId:props.sheetId,gridProperties:{rowCount:end}},fields:'gridProperties.rowCount'}});
    requests.push({setBasicFilter:{filter:{range:range(name,0,headers.length,0,end)}}});
    headers.forEach((h,i)=>{
      const c=col(i),r=range(name,i,i+1);
      const numberFormat=h==='local_date'?{type:'DATE',pattern:'yyyy-mm-dd'}:
        h.endsWith('_id')||h.endsWith('_utc')?{type:'TEXT',pattern:'@'}:
        /^(kcal|protein_g|carbohydrate_g|fat_g|weight_kg|body_.*_pct|.*_mass_kg|quantity|.*_s|distance_m|estimated_kcal|average_.*|energy_kj|revision)$/.test(h)?{type:'NUMBER',pattern:h==='revision'?'0':'0.0'}:null;
      if(numberFormat) requests.push({repeatCell:{range:r,cell:{userEnteredFormat:{numberFormat}},fields:'userEnteredFormat.numberFormat'}});
      if(i===0 || h==='operation_id') {
        custom(r,`=OR(${c}2="",COUNTIF($${c}$2:$${c}$${end},${c}2)=1)`);
        requests.push({addConditionalFormatRule:{index:0,rule:{ranges:[r],booleanRule:{condition:{type:'CUSTOM_FORMULA',values:[{userEnteredValue:`=AND(${c}2<>"",COUNTIF($${c}$2:$${c}$${end},${c}2)>1)`}]},format:{backgroundColor:{red:1,green:0.85,blue:0.85}}}}}});
      } else if(h==='status') list(r,name==='Planned workouts'?['active','cancelled','void']:['active','void']);
      else if(h==='time_precision') list(r,['exact','approximate','date']);
      else if(h==='quantity_method') list(r,['weighed','label','reported','photo_estimate','unknown']);
      else if(h==='nutrition_basis') list(r,['label','database','model_estimate','mixed','unknown']);
      else if(h==='revision') custom(r,`=OR(${c}2="",AND(ISNUMBER(${c}2),${c}2=INT(${c}2),${c}2>=1))`);
      else if(h==='local_date') custom(r,`=OR(${c}2="",AND(ISNUMBER(${c}2),${c}2=INT(${c}2)))`);
      else if(/^(kcal|protein_g|carbohydrate_g|fat_g|weight_kg|body_.*_pct|.*_mass_kg|quantity|.*_s|distance_m|estimated_kcal|average_.*|energy_kj)$/.test(h)) validate(r,{type:'NUMBER_GREATER_THAN_EQ',values:[{userEnteredValue:'0'}]});
    });
    requests.push({addProtectedRange:{protectedRange:{range:range(name,0,headers.length,0,1),description:'Schema headers: use logging contract v1.0',warningOnly:true}}});
  }
  // Defaults editable and initially blank. No seeded dropdown rows or observations.
  validate(range('Settings',1,2,3,7),{type:'NUMBER_GREATER_THAN_EQ',values:[{userEnteredValue:'0'}]});
  custom(range('Settings',1,2,7,8),'=OR(B8="",AND(ISNUMBER(B8),B8=INT(B8)))');
  list(range('Daily summary',12,13,1,schema.summary_days+1),['complete']);
  requests.push({addProtectedRange:{protectedRange:{range:{sheetId:map['Daily summary'].sheetId},unprotectedRanges:[range('Daily summary',12,13,1,schema.summary_days+1)],description:'Derived daily formulas; only day_confirmation is input',warningOnly:true}}});
  for(const name of ['Dashboard','Weekly summary']) requests.push({addProtectedRange:{protectedRange:{range:{sheetId:map[name].sheetId},description:'Derived view; edit source tabs or Settings',warningOnly:true}}});
  const d=map.Dashboard.sheetId;
  for(const [start,endRow] of [[3,4],[4,5],[14,15],[16,17],[17,18],[18,19]]) requests.push({mergeCells:{range:{sheetId:d,startRowIndex:start,endRowIndex:endRow,startColumnIndex:1,endColumnIndex:3},mergeType:'MERGE_ALL'}});
  for(let row=22;row<26;row++) requests.push({mergeCells:{range:{sheetId:d,startRowIndex:row,endRowIndex:row+1,startColumnIndex:0,endColumnIndex:3},mergeType:'MERGE_ALL'}});
  requests.push({mergeCells:{range:{sheetId:d,startRowIndex:20,endRowIndex:22,startColumnIndex:1,endColumnIndex:3},mergeType:'MERGE_ALL'}});
  requests.push({updateCells:{start:{sheetId:d,rowIndex:27,columnIndex:0},rows:[{values:[{userEnteredValue:{stringValue:'Food capacity'}},{userEnteredValue:{formulaValue:`=COUNTA('Food log'!A2:A${end})&" / ${end-1}"`}}]}],fields:'userEnteredValue'}});
  requests.push({repeatCell:{range:{sheetId:d,startRowIndex:20,endRowIndex:22,startColumnIndex:1,endColumnIndex:3},cell:{userEnteredFormat:{wrapStrategy:'WRAP'}},fields:'userEnteredFormat.wrapStrategy'}});
  requests.push({repeatCell:{range:range('Settings',2,4,1,17),cell:{userEnteredFormat:{wrapStrategy:'WRAP'}},fields:'userEnteredFormat.wrapStrategy'}});
  requests.push({updateDimensionProperties:{range:{sheetId:map.Settings.sheetId,dimension:'ROWS',startIndex:1,endIndex:17},properties:{pixelSize:38},fields:'pixelSize'}});
  requests.push({updateDimensionProperties:{range:{sheetId:map.Settings.sheetId,dimension:'COLUMNS',startIndex:3,endIndex:4},properties:{pixelSize:220},fields:'pixelSize'}});
  return requests;
}
