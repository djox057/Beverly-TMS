/** Match the existing TMS wall-clock timestamp convention, and never choose a
 * load whose last delivery window ends after the next load's pickup. */
export function previousDelivery<T extends {delivery_datetime?:string|null;delivery_end_datetime?:string|null}>(orders:T[],before:string):T|undefined {
  const cutoff=Date.parse(before);
  if(!Number.isFinite(cutoff)) return undefined;
  return orders.filter(o=>{
    const end=Date.parse(o.delivery_end_datetime||o.delivery_datetime||'');
    return Number.isFinite(end)&&end<=cutoff;
  }).sort((a,b)=>Date.parse(b.delivery_end_datetime||b.delivery_datetime||'')-Date.parse(a.delivery_end_datetime||a.delivery_datetime||''))[0];
}
