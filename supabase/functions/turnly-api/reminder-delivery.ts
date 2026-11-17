import type {Db} from './db.ts';
import type {ReminderRow,DeviceRow} from './push-hub.ts';

/** Retryable delivery with per-phone receipts. Provider acceptance immediately
 * before a crash can still be retried; stable collapse IDs reduce duplicates.
 * Never mark a reminder delivered merely because a worker claimed it. */
export async function dispatchReminders(sql:Db,send:(device:DeviceRow,row:ReminderRow)=>Promise<boolean>,now=Date.now()){
  const lease=crypto.randomUUID();
  const rows=(await sql.exec<ReminderRow & {delivery_attempts:number}>(`WITH due AS (
    SELECT assignment_id,user_id FROM reminders
    WHERE sent=0 AND abandoned_at IS NULL AND due_at <= ? AND next_attempt_at <= ?
      AND (lease_until IS NULL OR lease_until < ?)
    ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 5
  ) UPDATE reminders r SET lease_id=?,lease_until=?,delivery_attempts=r.delivery_attempts+1
    FROM due WHERE r.assignment_id=due.assignment_id AND r.user_id=due.user_id RETURNING r.*`,
    now+30000,now,now,lease,now+120000)).toArray();
  let sent=0;
  await Promise.all(rows.map(async row=>{
    const owner=[row.assignment_id,row.user_id,row.start_at,lease];
    if(row.start_at-now<3600000){
      await sql.exec('UPDATE reminders SET abandoned_at=?,lease_id=NULL,lease_until=NULL WHERE assignment_id=? AND user_id=? AND start_at=? AND lease_id=?',now,...owner);
      return;
    }
    let complete=false;
    try{
      const devices=(await sql.exec<DeviceRow>("SELECT * FROM devices WHERE notify_reminders=1 AND role='contractor' AND user_id=?",row.user_id)).toArray();
      complete=devices.length>0;
      for(const device of devices){
        const delivered=(await sql.exec('SELECT 1 FROM reminder_deliveries WHERE assignment_id=? AND user_id=? AND start_at=? AND token=?',row.assignment_id,row.user_id,row.start_at,device.token)).toArray().length>0;
        if(delivered)continue;
        const current=(await sql.exec('UPDATE reminders SET lease_until=? WHERE assignment_id=? AND user_id=? AND start_at=? AND lease_id=? AND lease_until>? RETURNING 1',Date.now()+120000,...owner,Date.now())).toArray().length>0;
        if(!current){complete=false;break;}
        if(await send(device,row)){
          await sql.exec('INSERT INTO reminder_deliveries(assignment_id,user_id,start_at,token,delivered_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING',row.assignment_id,row.user_id,row.start_at,device.token,Date.now());
          sent++;
        }else complete=false;
      }
    }catch{
      complete=false;
      console.warn('Reminder delivery deferred for retry');
    }
    const retry=now+Math.min(900000,30000*2**Math.min(row.delivery_attempts,5));
    await sql.exec('UPDATE reminders SET sent=?,next_attempt_at=?,lease_id=NULL,lease_until=NULL WHERE assignment_id=? AND user_id=? AND start_at=? AND lease_id=?',complete?1:0,retry,...owner);
  }));
  return {ok:true as const,due:rows.length,sent};
}

