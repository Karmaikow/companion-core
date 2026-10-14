/** Server time and signed event history survive reload, restart and Crystal transfer. */
export function refugeReward(events:Array<{timestamp:string;data:unknown}>,now:number) {
  const times=events.filter(e=>(e.data as {kind?:string})?.kind==='REFUGE_INTERACTION').map(e=>Date.parse(e.timestamp)).filter(Number.isFinite);
  const day=new Date(now).toISOString().slice(0,10);
  const today=times.filter(t=>new Date(t).toISOString().slice(0,10)===day).length;
  const last=Math.max(0,...times),remaining=Math.max(0,5-today);
  const nextAt=today>=5?Date.parse(day+'T00:00:00Z')+86400000:Math.max(now,last+60000);
  return {awarded:remaining>0&&now>=nextAt,remaining,nextAt,bond:0};
}
