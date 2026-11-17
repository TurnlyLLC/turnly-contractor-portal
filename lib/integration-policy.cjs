const S=require('./residential-server.cjs');
const deletesRecords=name=>/(^|[._])(delete|remove|purge|destroy)([._]|$)/i.test(name||'');
function permitted(name,policy={}){return !policy.deny_record_deletion||!deletesRecords(name);}
function enforce(name,policy){if(!permitted(name,policy))throw S.fail('Record deletion is disabled for this connection.',403);}
function catalog(value,policy){return {...value,actions:Object.fromEntries(Object.entries(value.actions).filter(([name])=>permitted(name,policy))),connection_policy:{record_deletion_allowed:!policy.deny_record_deletion}};}
function enforceData(data,policy={}){if(!policy.deny_record_deletion||!data||typeof data!=='object')return;for(const [k,v] of Object.entries(data)){if(/^(deleted_at|deleted_by|is_deleted|deleted)$/.test(k)||(/(^|_)status$/.test(k)&&typeof v==='string'&&/^(deleted|deletion_pending|deletion_requested|removed|purged|destroyed)$/i.test(v)))throw S.fail('Record deletion is disabled for this connection.',403);if(v&&typeof v==='object')enforceData(v,policy);}}
module.exports={enforceData,deletesRecords,permitted,enforce,catalog};
