const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../client/node_modules/typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const {meterSummary,reportPages,reportError,instructionRow}=require('../client/src/lib/dailyReport.ts');
const row=(meter,rollover=false,kind='deadhead')=>({meter,rollover,kind});
test('lower three digits produce interval, full ending and passenger distance across rollover',()=>{
 assert.deepEqual(meterSummary({startOdometer:'12990',rows:[row('005',true),row('025',false,'passenger')]}),{distances:[15,20],total:35,passenger:20,endOdometer:13025});
 assert.equal(meterSummary({startOdometer:'12990',rows:[row('005')]}).total,null);
 assert.equal(meterSummary({startOdometer:'12500',rows:[row(''),row('530')]}).total,null);
});
test('18 print rows include departure once; row 19 and row 37 continue without data loss',()=>{
 for(const [length,pages] of [[0,1],[17,1],[18,2],[35,2],[36,3],[40,3]]){
  const rows=Array.from({length},(_,id)=>({id}));const result=reportPages(rows);
  assert.equal(result.length,pages);assert.deepEqual(result.flatMap(p=>p.rows),rows);
  assert.equal(result.filter(p=>p.start).length,1);
 }
});
test('instruction import preserves link and planned times without inventing actual times',()=>{
 const doc={id:'instruction1',source:{title:'仕事A'},values:{boardingPlace:'乗車地',alightingPlace:'降車地',boardingAt:'2030-01-01T23:30:00+09:00',alightingAt:'2030-01-02T00:30:00+09:00'}};
 const actual=instructionRow(doc);
 assert.equal(actual.instructionId,doc.id);assert.equal(actual.startAt,'');assert.equal(actual.endAt,'');assert.equal(actual.meter,'');assert.equal(actual.plannedStart,doc.values.boardingAt);
});
test('incomplete mobile notes can save as draft but cannot be submitted',()=>{
 const draft={driverId:1,vehicleId:1,rows:[],startOdometer:'',startAt:'',startPlace:''};
 assert.equal(reportError(draft), '');assert.ok(reportError(draft,true));
});
test('time-only entries reuse the service date across month, year and leap-day boundaries',()=>{
 const {timeOnDay,dayOffset}=require('../client/src/lib/dailyReport.ts');
 assert.equal(timeOnDay('2030-12-31','23:30'),'2030-12-31T23:30');
 assert.equal(timeOnDay('2030-12-31','00:15',1),'2031-01-01T00:15');
 assert.equal(timeOnDay('2028-02-28','01:00',1),'2028-02-29T01:00');
 assert.equal(timeOnDay('2030-01-01','23:30',-1),'2029-12-31T23:30');
 assert.equal(timeOnDay('2030-01-01','',1),'');
 assert.equal(dayOffset('2030-12-31','2031-01-01'),1);
});
