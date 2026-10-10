import test from 'node:test';
import assert from 'node:assert/strict';
import { departmentViews, parseReportViews } from '../app/report-preferences.ts';
test('department reports omit costs and keep only department-relevant sections',()=>{
 assert.ok(departmentViews.every(v=>!v.costs));
 assert.deepEqual(departmentViews.find(v=>v.id==='setup').sections,['rooms']);
 assert.equal(departmentViews.find(v=>v.id==='setup').layouts,true);
 assert.deepEqual(departmentViews.find(v=>v.id==='kitchen').sections,['brief','food']);
});
test('saved report views validate optional room filters and reject corrupt browser data',()=>{
 assert.deepEqual(parseReportViews(null),[]);
 assert.equal(parseReportViews([...departmentViews,{...departmentViews[0],sections:['invalid']}]).length,4);
 assert.equal(parseReportViews([{...departmentViews[0],rooms:[]}]).length,1);
 assert.equal(parseReportViews([{...departmentViews[0],costs:'false'}]).length,0);
});
