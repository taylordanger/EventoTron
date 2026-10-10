import test from 'node:test';
import assert from 'node:assert/strict';
import { templateTasks, templateFood } from '../app/template-planning.ts';
test('templates seed distinct unchecked tasks with stable IDs',()=>{
 const template={id:'concert',checklist:['Open doors',' Open doors ','Check lights','']};
 assert.deepEqual(templateTasks(template),[{id:'template:concert:0',title:'Open doors',done:false},{id:'template:concert:1',title:'Check lights',done:false}]);
 assert.deepEqual(templateTasks(),[]);
});
test('food templates seed notes and deduplicated additional shopping, not recipes or guessed quantities',()=>{
 const template={category:'food',summary:'Kitchen close',checklist:['Wash dishes'],preset:{food:{notes:'Artist snacks',shoppingItems:['Napkins',' Napkins ','Coffee']}}};
 assert.deepEqual(templateFood(template),{hospitalityNotes:'Artist snacks',shoppingExtras:['Napkins','Coffee']});
 assert.equal(templateFood({category:'food',summary:'Kitchen close',checklist:['Wash dishes']}).hospitalityNotes,'Kitchen close\nWash dishes');
 assert.deepEqual(templateFood(),{hospitalityNotes:'',shoppingExtras:[]});
});
