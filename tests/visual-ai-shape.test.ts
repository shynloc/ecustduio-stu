import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAIScenes} from '../shared/visual-edit.js';
test('AI 把步骤内容写进表格时仍生成可见条目，避免导出静止的逐项 GIF',()=>{
 const [s]=normalizeAIScenes([{id:'x',title:'时间线',text:'两次机会',layout:'steps',motion:'steps',items:[],table:{headers:['场次','时间'],rows:[['第一次','2026年12月13日'],['第二次','拟于2027年3月，另行通知']]}}]);
 assert.deepEqual(s.items,['第一次 · 2026年12月13日','第二次 · 拟于2027年3月，另行通知']);assert.equal(s.motion,'steps');
});
test('不显示条目的版式不使用无效逐项动效；已有手工条目不被替换',()=>{
 const scenes=normalizeAIScenes([{id:'x',title:'封面',text:'正文',layout:'title',motion:'steps'},{id:'y',title:'流程',text:'正文',layout:'steps',motion:'steps',items:['保留我的编辑']}]);
 assert.equal(scenes[0].motion,'reveal');assert.deepEqual(scenes[1].items,['保留我的编辑']);
});
