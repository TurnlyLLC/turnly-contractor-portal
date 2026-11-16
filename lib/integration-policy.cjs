const S=require('./residential-server.cjs');
const deletesRecords=name=>/(^|[._])(delete|remove|purge|destroy)([._]|$)/i.test(name||'');
function permitted(name,policy={}){return !policy.deny_record_deletion||!deletesRecords(name);}
function enforce(name,policy){if(!permitted(name,policy))throw S.fail('Record deletion is disabled for this connection.',403);}
function catalog(value,policy){return {...value,actions:Object.fromEntries(Object.entries(value.actions).filter(([name])=>permitted(name,policy))),connection_policy:{record_deletion_allowed:!policy.deny_record_deletion}};}
module.exports={deletesRecords,permitted,enforce,catalog};
