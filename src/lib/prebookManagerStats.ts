export interface PrebookManager { user_id: string; full_name: string | null }
export interface PrebookStatsLoad {
  prebook: boolean; canceled: boolean; originalBooker: string;
  freightAmount: number | null; loadedMiles: number | null; dhMiles: number | null;
}
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nameKey = (name: string | null) => (name || '').trim().toLowerCase();

export function summarizePrebookManagers(loads: PrebookStatsLoad[], managers: PrebookManager[]) {
  const totals = managers.map(manager => ({id:manager.user_id, name:manager.full_name || 'Unnamed manager', gross:0, miles:0}));
  const other = {id:'unmatched', name:'Other / unmatched bookers', gross:0, miles:0};
  let hasOther = false;
  for (const load of loads) {
    if (!load.prebook || load.canceled) continue;
    const matches = managers.map((manager,index)=>({manager,index})).filter(({manager})=>nameKey(manager.full_name) && nameKey(manager.full_name) === nameKey(load.originalBooker));
    const target = matches.length === 1 ? totals[matches[0].index] : other;
    if (target === other) hasOther = true;
    target.gross += number(load.freightAmount);
    target.miles += number(load.loadedMiles) + number(load.dhMiles);
  }
  return [...totals.sort((a,b)=>b.gross-a.gross || a.name.localeCompare(b.name)), ...(hasOther ? [other] : [])]
    .map(row=>({...row, rpm:row.miles>0 ? row.gross/row.miles : null}));
}
