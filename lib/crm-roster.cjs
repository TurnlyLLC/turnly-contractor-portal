const C=require('./crm-sales.cjs');
const inRoster=(p,archived=false)=>!!p.sales_member_deleted_at===archived;
async function members(db,archived=false){return (await C.all(db,'profiles','id,full_name,role,status,sales_member_deleted_at',q=>q.in('role',['admin','sales','sales_team']))).filter(p=>inRoster(p,archived));}
async function requireMember(db,id,archived=false){const people=await members(db,archived);if(!people.some(p=>p.id===id))throw Object.assign(Error(archived?'Choose a member from Archives.':'This member is no longer in the current roster. Open Archives to review retained records.'),{status:409});}
module.exports={members,inRoster,requireMember};
