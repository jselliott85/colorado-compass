// In-place native Dashboard request builder. No credentials, health values or network.
// Only Dashboard cells/objects are changed; source schemas and records stay intact.
export function dashboardRequests(properties, {inputLastRow=2001, dailyLastRow=367, weeklyLastRow=55}={}) {
  const tabs=Object.fromEntries(properties.map(p=>[p.title,p.sheetId]));
  const id=tabs.Dashboard;
  if(!Number.isInteger(id)) throw new Error('Dashboard metadata required');
  const range=(r1,r2,c1=0,c2=3)=>({sheetId:id,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2});
  const requests=[
    {updateSheetProperties:{properties:{sheetId:id,gridProperties:{hideGridlines:true,rowCount:2001}},fields:'gridProperties.hideGridlines,gridProperties.rowCount'}},
    {unmergeCells:{range:range(0,100,0,26)}},
    {repeatCell:{range:range(0,2001,0,20),cell:{},fields:'userEnteredValue'}},
    {repeatCell:{range:range(0,100),cell:{userEnteredFormat:{backgroundColor:{red:1,green:1,blue:1},textFormat:{fontFamily:'Arial',fontSize:11},verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}},
    {updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:0,endIndex:1},properties:{pixelSize:140},fields:'pixelSize'}},
    {updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:1,endIndex:3},properties:{pixelSize:95},fields:'pixelSize'}},
    {updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:0,endIndex:100},properties:{pixelSize:26},fields:'pixelSize'}},
    {updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:3,endIndex:26},properties:{hiddenByUser:true},fields:'hiddenByUser'}}
  ];
  const cells=new Map();
  const set=(row,col,value,formula=false)=>cells.set(`${row}:${col}`,{row,col,cell:{userEnteredValue:formula?{formulaValue:value}:typeof value==='number'?{numberValue:value}:{stringValue:value}}});
  const text=(r,v)=>set(r,0,v);
  const fx=(r,v,c=1)=>set(r,c,v,true);
  const merge=(r,c1=0,c2=3)=>requests.push({mergeCells:{range:range(r-1,r,c1,c2),mergeType:'MERGE_ALL'}});
  const fmt=(r1,r2,format,c1=0,c2=3)=>requests.push({repeatCell:{range:range(r1-1,r2,c1,c2),cell:{userEnteredFormat:format},fields:Object.keys(format).map(k=>'userEnteredFormat.'+k).join(',')}});
  const repeat=(r1,r2,c,formula)=>requests.push({repeatCell:{range:range(r1-1,r2,c,c+1),cell:{userEnteredValue:{formulaValue:formula}},fields:'userEnteredValue'}});
  const setting=key=>`INDEX('Settings'!$B$2:$B$100,MATCH("${key}",'Settings'!$A$2:$A$100,0))`;
  const ds=c=>`'Daily summary'!$${c}$2:$${c}$${dailyLastRow}`;
  const ws=c=>`'Weekly summary'!$${c}$2:$${c}$${weeklyLastRow}`;
  const body=c=>`'Body metrics'!$${c}$2:$${c}$${inputLastRow}`;
  const dates='$E$2:$E$85', weights='$G$2:$G$85';
  const recent=`${dates},">="&$B$4-6,${dates},"<="&$B$4`;
  const previous=`${dates},">="&$B$4-13,${dates},"<="&$B$4-7`;
  const recentCount=`COUNTIFS(${recent},${weights},">0")`;
  const previousCount=`COUNTIFS(${previous},${weights},">0")`;
  const average=criteria=>`SUMIFS(${weights},${criteria})/COUNTIFS(${criteria},${weights},">0")`;
  // Source helpers: all active measurements retain source order. Only the daily
  // representative is selected for trend math. Equal instants pick first row.
  set(1,13,'source_local_date');set(1,14,'source_utc_order');set(1,15,'source_day_key');
  repeat(2,inputLastRow,13,`=IF(AND('Body metrics'!A2<>"",'Body metrics'!Q2="active",ISNUMBER('Body metrics'!B2)),'Body metrics'!B2,"")`);
  // UTC ISO strings have a sortable YYYYMMDDhhmmss key. This avoids locale date
  // parsing; same-second ties retain the first source row in the daily view.
  repeat(2,inputLastRow,14,`=IF(N2="","",IF('Body metrics'!H2="",0,LEFT('Body metrics'!H2,4)*10000000000+MID('Body metrics'!H2,6,2)*100000000+MID('Body metrics'!H2,9,2)*1000000+MID('Body metrics'!H2,12,2)*10000+MID('Body metrics'!H2,15,2)*100+MID('Body metrics'!H2,18,2)))`);
  repeat(2,inputLastRow,15,'=IF(N2="","",N2&"|"&O2)');
  ['Date','source_row_index','Daily weight (lb)','7-day average (lb)','Body fat (%)','Estimated muscle (lb)'].forEach((v,i)=>set(1,4+i,v));
  repeat(2,85,4,'=$B$4-83+ROW()-2');
  repeat(2,85,5,`=IF(COUNTIFS($N$2:$N$${inputLastRow},E2)=0,"",MATCH(E2&"|"&MAXIFS($O$2:$O$${inputLastRow},$N$2:$N$${inputLastRow},E2),$P$2:$P$${inputLastRow},0))`);
  const metric=(src,convert='')=>`=IF(F2="","",IF(ISNUMBER(INDEX(${body(src)},F2)),INDEX(${body(src)},F2)${convert},""))`;
  repeat(2,85,6,metric('C','/0.45359237'));
  repeat(2,85,7,`=IF(G2="","",${average(`${dates},">="&E2-6,${dates},"<="&E2`)})`);
  repeat(2,85,8,metric('D'));
  repeat(2,85,9,metric('F','/0.45359237'));
  set(1,18,'plan_duration_s');set(2,18,'min_pace_days_per_window');set(2,19,3);
  fx(1,`=IF(COUNTIFS('Planned workouts'!$B$2:$B$${inputLastRow},$B$4,'Planned workouts'!$P$2:$P$${inputLastRow},"active")=0,"",SUMIFS('Planned workouts'!$E$2:$E$${inputLastRow},'Planned workouts'!$B$2:$B$${inputLastRow},$B$4,'Planned workouts'!$P$2:$P$${inputLastRow},"active"))`,19);
  // Narrow visible view. Sources, targets and goal settings are never copied.
  text(2,'Nutrition OS');merge(2);fmt(2,2,{textFormat:{fontFamily:'Arial',fontSize:17,bold:true}});
  text(4,'Today');fx(4,`=IF(${setting('dashboard_date')}="",TODAY(),${setting('dashboard_date')})`);merge(4,1);fmt(4,4,{numberFormat:{type:'DATE',pattern:'ddd, mmm d'}},1);
  text(5,'Logging');fx(5,`=IF(COUNTIFS(${ds('A')},B4)=0,"Outside calendar",INDEX(${ds('L')},MATCH(B4,${ds('A')},0)))`);merge(5,1);
  ['Nutrient','Logged','Target'].forEach((v,c)=>set(7,c,v));
  ['Calories (kcal)','Protein (g)','Carbs (g)','Fat (g)'].forEach((v,i)=>{
    text(8+i,v);
    for(const [dest,src] of [[1,String.fromCharCode(67+i)],[2,String.fromCharCode(71+i)]]) {
      const lookup=`INDEX(${ds(src)},MATCH($B$4,${ds('A')},0))`;
      fx(8+i,`=IF(COUNTIFS(${ds('A')},$B$4)=0,"",IF(${lookup}="","",${lookup}))`,dest);
    }
  });
  text(13,'Calories left');fx(13,'=IF(AND(ISNUMBER(B8),ISNUMBER(C8)),C8-B8,"")');merge(13,1);fmt(13,13,{textFormat:{fontFamily:'Arial',fontSize:17,bold:true}},1);
  text(14,'Energy progress');fx(14,'=IF(AND(ISNUMBER(B8),ISNUMBER(C8),C8>0),REPT("■",MIN(10,INT(B8/C8*10)))&REPT("□",10-MIN(10,INT(B8/C8*10)))&" "&TEXT(B8/C8,"0%"),"")');merge(14,1);
  text(15,'Alcohol calories count in total energy');merge(15);
  text(16,'Blank means unknown or unset');merge(16);
  text(18,'Weight-loss progress');merge(18);
  text(20,'Weighed on');fx(20,`=IF(COUNTIFS($N$2:$N$${inputLastRow},">0",$N$2:$N$${inputLastRow},"<="&$B$4)=0,"",MAXIFS($N$2:$N$${inputLastRow},$N$2:$N$${inputLastRow},"<="&$B$4))`);merge(20,1);fmt(20,20,{numberFormat:{type:'DATE',pattern:'mmm d, yyyy'}},1);
  const latestIndex=`MATCH(B20&"|"&MAXIFS($O$2:$O$${inputLastRow},$N$2:$N$${inputLastRow},B20),$P$2:$P$${inputLastRow},0)`;
  text(19,'Latest weight');fx(19,`=IF(B20="","",IF(ISNUMBER(INDEX(${body('C')},${latestIndex})),INDEX(${body('C')},${latestIndex})/0.45359237,""))`);merge(19,1);fmt(19,19,{numberFormat:{type:'NUMBER',pattern:'0.0" lb"'},textFormat:{fontFamily:'Arial',fontSize:17,bold:true}},1);
  text(21,'7-day average');fx(21,`=IF(${recentCount}=0,"",${average(recent)})`);merge(21,1);fmt(21,21,{numberFormat:{type:'NUMBER',pattern:'0.0" lb"'}},1);
  text(22,'Starting weight');fx(22,`=${setting('starting_weight_lb')}`);merge(22,1);fmt(22,22,{numberFormat:{type:'NUMBER',pattern:'0.0" lb"'}},1);
  text(23,'Goal range');fx(23,`=TEXT(${setting('goal_weight_min_lb')},"0")&"–"&TEXT(${setting('goal_weight_max_lb')},"0")&" lb"`);merge(23,1);
  text(24,'Change vs start');fx(24,'=IF(ISNUMBER(B19),B19-B22,"")');merge(24,1);fmt(24,24,{numberFormat:{type:'NUMBER',pattern:'+0.0" lb";-0.0" lb";0.0" lb"'}},1);
  text(25,'Avg weekly loss');fx(25,`=IF(AND(${recentCount}>=$T$2,${previousCount}>=$T$2),${average(previous)}-(${average(recent)}),"")`);merge(25,1);fmt(25,25,{numberFormat:{type:'NUMBER',pattern:'0.00" lb/wk"'}},1);
  text(26,'Intended pace');fx(26,`=TEXT(${setting('weight_loss_min_lb_per_week')},"0.##")&"–"&TEXT(${setting('weight_loss_max_lb_per_week')},"0.##")&" lb/wk"`);merge(26,1);
  fx(27,`=IF(B20="","Awaiting Garmin measurements",IF($B$4-B20>7,"Last reading "&TEXT(B20,"mmm d")&" · not current","Recent observations: "&${recentCount}&" / 7 days"))`,0);merge(27);
  fx(28,`=IF(COUNT(${weights})=0,"Awaiting Garmin measurements",IF(${recentCount}<$T$2,"More weigh-ins needed for trend","Daily readings + 7-day average"))`,0);merge(28);
  text(40,'Body composition');merge(40);
  const latestMetric=c=>`=IF(COUNT($${c}$2:$${c}$85)=0,"",INDEX($${c}$2:$${c}$85,MATCH(MAXIFS(${dates},$${c}$2:$${c}$85,">=0",$${c}$2:$${c}$85,"<>"),${dates},0)))`;
  text(41,'Latest body fat');fx(41,latestMetric('I'));merge(41,1);fmt(41,41,{numberFormat:{type:'NUMBER',pattern:'0.0"%"'}},1);
  fx(42,'=IF(COUNT(I2:I85)=0,"Body-composition data unavailable","BIA estimate · hydration affects readings")',0);merge(42);
  text(54,'Estimated muscle');fx(54,latestMetric('J'));merge(54,1);fmt(54,54,{numberFormat:{type:'NUMBER',pattern:'0.0" lb"'}},1);
  fx(55,'=IF(COUNT(J2:J85)=0,"Body-composition data unavailable","Garmin estimate · assess multiweek trends")',0);merge(55);
  text(67,'Weekly review');merge(67);
  text(68,'Week of');fx(68,'=$B$4-WEEKDAY($B$4,2)+1');merge(68,1);fmt(68,68,{numberFormat:{type:'DATE',pattern:'mmm d'}},1);
  const weekly=c=>`INDEX(${ws(c)},MATCH(B68,${ws('A')},0))`;
  text(69,'Avg logged kcal');fx(69,`=IF(COUNTIFS(${ws('A')},B68)=0,"",IF(${weekly('D')}="","",${weekly('D')}))`);merge(69,1);
  text(70,'Avg protein (g)');fx(70,`=IF(COUNTIFS(${ws('A')},B68)=0,"",IF(${weekly('E')}="","",${weekly('E')}))`);merge(70,1);
  text(71,'Days complete');fx(71,`=IF(COUNTIFS(${ws('A')},B68)=0,"",${weekly('C')})`);merge(71,1);
  text(72,'Days with entries');fx(72,`=IF(COUNTIFS(${ws('A')},B68)=0,"",${weekly('B')})`);merge(72,1);
  text(73,'7-day wt change');fx(73,'=IF(ISNUMBER(B25),-B25,"")');merge(73,1);fmt(73,73,{numberFormat:{type:'NUMBER',pattern:'+0.00" lb";-0.00" lb";0.00" lb"'}},1);
  text(74,'Pace vs goal');fx(74,`=IF(NOT(ISNUMBER(B25)),"More weigh-ins needed",IF(B25<${setting('weight_loss_min_lb_per_week')},"Below loss range",IF(B25>${setting('weight_loss_max_lb_per_week')},"Above loss range","Within intended range")))`);merge(74,1);
  text(75,'Completed training');fx(75,`=IF(${setting('strava_status')}="disabled","Strava paused","Awaiting validated activity data")`);merge(75,1);
  text(76,'Planned duration');fx(76,'=IF(T1="","No active plan",IF(T1>=3600,INT(T1/3600)&"h"&IF(MOD(T1,3600)>=60," "&INT(MOD(T1,3600)/60)&"m",""),INT(T1/60)&" min"))');merge(76,1);
  text(77,'Plan ≠ completed · targets set by Scout');merge(77);
  text(79,'Weekly food means use logged days only');merge(79);
  text(80,'Weight pace compares two 7-day windows');merge(80);
  text(81,'Needs 3 weigh-in days in each window');merge(81);
  text(82,'Charts show the latest 12 weeks');merge(82);
  for(const row of [7,18,40,67]) fmt(row,row,{backgroundColor:{red:.93,green:.94,blue:.95},textFormat:{fontFamily:'Arial',fontSize:11,bold:true}});
  fmt(8,8,{numberFormat:{type:'NUMBER',pattern:'#,##0'},horizontalAlignment:'RIGHT'},1);
  fmt(9,11,{numberFormat:{type:'NUMBER',pattern:'0.0'},horizontalAlignment:'RIGHT'},1);
  fmt(13,13,{numberFormat:{type:'NUMBER',pattern:'#,##0'}},1);
  fmt(8,8,{textFormat:{fontFamily:'Arial',fontSize:16,bold:true}},1);
  fmt(69,69,{numberFormat:{type:'NUMBER',pattern:'#,##0'}},1);
  fmt(70,70,{numberFormat:{type:'NUMBER',pattern:'0.0'}},1);
  for(const row of [15,16,27,28,42,55,77,79,80,81,82]) fmt(row,row,{textFormat:{fontFamily:'Arial',fontSize:10,foregroundColor:{red:.35,green:.35,blue:.35}}});
  fmt(2,85,{numberFormat:{type:'DATE',pattern:'mmm d'}},4,5);
  fmt(2,85,{numberFormat:{type:'NUMBER',pattern:'0.0'}},6,10);
  for(const {row,col,cell} of cells.values()) requests.push({updateCells:{start:{sheetId:id,rowIndex:row-1,columnIndex:col},rows:[{values:[cell]}],fields:'userEnteredValue'}});
  return requests;
}

export function dashboardChartRequests(sheetId) {
  const source=c=>({sourceRange:{sources:[{sheetId,startRowIndex:0,endRowIndex:85,startColumnIndex:c,endColumnIndex:c+1}]}});
  return [
    {title:'Weight trend (lb)',row:29,series:[6,7],legend:'BOTTOM_LEGEND'},
    {title:'Body fat (%) · estimate',row:43,series:[8],legend:'NO_LEGEND'},
    {title:'Garmin muscle (lb) · estimate',row:56,series:[9],legend:'NO_LEGEND'}
  ].map(({title,row,series,legend})=>({addChart:{chart:{spec:{title,fontName:'Arial',titleTextFormat:{fontSize:12,bold:true},hiddenDimensionStrategy:'SHOW_ALL',basicChart:{chartType:'LINE',legendPosition:legend,headerCount:1,interpolateNulls:false,domains:[{domain:source(4)}],series:series.map((c,i)=>({series:source(c),targetAxis:'LEFT_AXIS',lineStyle:{width:i===0?1:2},pointStyle:{shape:'CIRCLE',size:i===0?3:2},colorStyle:{rgbColor:i===0?{red:.4,green:.45,blue:.5}:{red:.15,green:.4,blue:.65}}}))}},position:{overlayPosition:{anchorCell:{sheetId,rowIndex:row,columnIndex:0},widthPixels:330,heightPixels:220}}}}}));
}
