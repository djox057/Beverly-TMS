import { expect, it } from 'vitest';
import { summarizePrebookManagers, type PrebookStatsLoad } from './prebookManagerStats';
const managers=[{user_id:'a',full_name:'Manager A'},{user_id:'b',full_name:'Manager B'}];
const load=(patch:Partial<PrebookStatsLoad>={}):PrebookStatsLoad=>({prebook:true,canceled:false,originalBooker:'Manager A',freightAmount:2000,loadedMiles:900,dhMiles:100,...patch});
it('totals gross and loaded plus DH miles, then computes weighted RPM',()=>{
  const rows=summarizePrebookManagers([load(),load({freightAmount:1000,loadedMiles:100,dhMiles:100})],managers);
  expect(rows[0]).toEqual({id:'a',name:'Manager A',gross:3000,miles:1200,rpm:2.5});
});
it('excludes canceled and recovery loads and keeps managers separate',()=>{
  const rows=summarizePrebookManagers([load({canceled:true}),load({prebook:false}),load({originalBooker:'Manager B'})],managers);
  expect(rows.find(row=>row.id==='a')).toMatchObject({gross:0,miles:0,rpm:null});
  expect(rows.find(row=>row.id==='b')).toMatchObject({gross:2000,miles:1000,rpm:2});
});
it('matches the original booker case-insensitively and handles missing miles',()=>{
  const rows=summarizePrebookManagers([load({originalBooker:'  manager a ',loadedMiles:null,dhMiles:null})],managers);
  expect(rows[0]).toMatchObject({id:'a',gross:2000,miles:0,rpm:null});
});
it('keeps unmatched or ambiguous booking names visible without double counting',()=>{
  const rows=summarizePrebookManagers([load({originalBooker:'Former manager'}),load()], [...managers,{user_id:'duplicate',full_name:'Manager A'}]);
  expect(rows.find(row=>row.id==='unmatched')).toMatchObject({gross:4000,miles:2000,rpm:2});
  expect(rows.filter(row=>row.id!=='unmatched').every(row=>row.gross===0)).toBe(true);
});
