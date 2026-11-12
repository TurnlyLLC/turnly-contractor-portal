// Drafts indicate progress, never a signature, review decision, or completion.
async function attach(db, profileId, file) {
 const result = await db.from('contractor_onboarding_drafts')
  .select('item_id,revision,updated_at').eq('profile_id', profileId);
 if (result.error) throw Object.assign(new Error('Saved progress is unavailable. Please refresh.'), {status:503});
 const drafts = new Map((result.data || []).filter(d => d.revision > 0).map(d => [d.item_id,d]));
 return {...file,items:(file.items || []).map(item => {
  const draft = drafts.get(item.id);
  return draft && ['form','sign'].includes(item.kind) && item.state === 'todo' && !item.waived
   ? {...item,state:'in_progress',draftSavedAt:draft.updated_at} : item;
 })};
}
module.exports={attach};
