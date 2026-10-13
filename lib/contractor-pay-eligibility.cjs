// Payment flags on a recurring series do not establish completion of a visit.
const completedStatuses=['completed','complete','done'];
function isCompletedForPayout(row={}){
 return completedStatuses.includes(String(row.status||'').trim().toLowerCase().replace(/[\s-]+/g,'_'));
}
module.exports={completedStatuses,isCompletedForPayout};
