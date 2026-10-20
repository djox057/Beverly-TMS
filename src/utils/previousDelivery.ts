/** Use the latest preceding booking, including unfinished loads without POD.
 * A delivery after the next pickup is a schedule conflict, not a reason to
 * silently calculate deadhead from an older destination. */
export function previousDelivery<T extends {pickup_datetime?:string|null;delivery_datetime?:string|null;delivery_end_datetime?:string|null;pickup_drops?:{type:string;datetime?:string|null;sequence_number:number}[]}>(orders:T[],before:string):T|undefined {
  const cutoff=Date.parse(before);
  if(!Number.isFinite(cutoff)) return undefined;
  const deliveryTime=(order:T)=>{
    const finalDrop=[...(order.pickup_drops||[])].filter(stop=>stop.type==='delivery')
      .sort((a,b)=>b.sequence_number-a.sequence_number)[0];
    return Date.parse(finalDrop?.datetime||order.delivery_datetime||'');
  };
  const pickupTime=(order:T)=>{
    const firstPickup=[...(order.pickup_drops||[])].filter(stop=>stop.type==='pickup')
      .sort((a,b)=>a.sequence_number-b.sequence_number)[0];
    return Date.parse(firstPickup?.datetime||order.pickup_datetime||'');
  };
  const bookingTime=(order:T)=>Number.isFinite(pickupTime(order)) ? pickupTime(order) : deliveryTime(order);
  return orders.filter(order=>Number.isFinite(bookingTime(order))&&bookingTime(order)<=cutoff)
    .sort((a,b)=>bookingTime(b)-bookingTime(a)||deliveryTime(b)-deliveryTime(a))[0];
}
