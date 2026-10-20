/** DH is measured from the final delivery, not the end of its appointment window.
 * Read the final stop explicitly because order.delivery_datetime can be the first drop. */
export function previousDelivery<T extends {delivery_datetime?:string|null;delivery_end_datetime?:string|null;pickup_drops?:{type:string;datetime?:string|null;sequence_number:number}[]}>(orders:T[],before:string):T|undefined {
  const cutoff=Date.parse(before);
  if(!Number.isFinite(cutoff)) return undefined;
  const deliveryTime=(order:T)=>{
    const finalDrop=[...(order.pickup_drops||[])].filter(stop=>stop.type==='delivery')
      .sort((a,b)=>b.sequence_number-a.sequence_number)[0];
    return Date.parse(finalDrop?.datetime||order.delivery_datetime||'');
  };
  return orders.filter(order=>Number.isFinite(deliveryTime(order))&&deliveryTime(order)<=cutoff)
    .sort((a,b)=>deliveryTime(b)-deliveryTime(a))[0];
}
