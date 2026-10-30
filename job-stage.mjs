export function jobStage(booking) {
 if(['cancelled','canceled'].includes(booking?.status))return -1;
 if(booking?.status==='completed')return 3;
 const status=booking?.job?.status;
 if(['qa_pending','completed','complete','done','closed'].includes(status))return 3;
 if(status==='in_progress')return 2;
 if(status==='en_route')return 1;
 if(['claimed','scheduled'].includes(status))return 0;
 return -1;
}
export function jobStatusLabel(booking) {
 const stage=jobStage(booking);
 if(stage>=0)return ['Cleaner assigned','Cleaner en route','Cleaning','Complete'][stage];
 return {requested:'Request received',review_required:'Under review',awaiting_card:'Save a card to finish',needs_reschedule:'New date needed',cancelled:'Cancelled',canceled:'Cancelled'}[booking?.status]||'Cleaning scheduled';
}
