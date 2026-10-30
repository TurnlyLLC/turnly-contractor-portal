CREATE OR REPLACE FUNCTION public.submit_assignment_for_qa(target_assignment_id uuid, checklist_payload jsonb DEFAULT '[]'::jsonb, submitted_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  assignment_row public.assignment_blocks%rowtype;
  qa_id uuid;
  clean_submitted_at timestamptz := coalesce(submitted_at, now());
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select *
  into assignment_row
  from public.assignment_blocks
  where id = target_assignment_id
    and (
      claimed_by = auth.uid()
      or assigned_to = auth.uid()
      or started_by = auth.uid()
      or completed_by = auth.uid()
      or public.current_user_has_role(array['admin'])
    );

  if not found then
    raise exception 'Assignment is not available for QA submission'
      using errcode = '42501';
  end if;

  qa_id := public.ensure_assignment_qa_job(target_assignment_id);

  update public.qa_jobs
  set
    assignment_id = assignment_row.id,
    qa_status = 'in_review',
    service_date = coalesce(assignment_row.start_window::date, assignment_row.recurring_due_at::date, clean_submitted_at::date),
    cleaner_name = nullif(coalesce(assignment_row.claimed_by_name, assignment_row.assigned_to_name, ''), ''),
    job_type = nullif(coalesce(assignment_row.service_type, assignment_row.title, ''), ''),
    checklist_summary = concat_ws(
      ' | ',
      nullif(assignment_row.property_name, ''),
      nullif(assignment_row.title, ''),
      nullif(assignment_row.service_type, ''),
      'Submitted ' || clean_submitted_at::text
    )
  where id = qa_id;

  update public.qa_videos
  set
    qa_job_id = qa_id,
    review_status = case
      when review_status in ('approved', 'rejected', 'needs_rework') then review_status
      else 'pending_review'
    end
  where assignment_id = assignment_row.id
    and (qa_job_id is null or qa_job_id = qa_id);

  update public.assignment_blocks
  set
    status = 'qa_pending',
    visibility = 'closed',
    payment_status = 'pending_qa',
    pay_status = 'pending_qa',
    payout_status = 'qa_review',
    checklist_responses = coalesce(checklist_payload, '[]'::jsonb),
    checklist_completed_at = clean_submitted_at,
    completed_at = clean_submitted_at,
    completed_by = auth.uid(),
    metadata = jsonb_set(
      jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{qa_job_id}',
        to_jsonb(qa_id::text),
        true
      ),
      '{qa_submitted_at}',
      to_jsonb(clean_submitted_at::text),
      true
    ),
    updated_at = now()
  where id = assignment_row.id;

  return qa_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.customer_portal_change(p_id uuid, p_email text, p_uid uuid, p_op text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare b referral_bookings; j assignment_blocks; new_date date; start_time time; end_time time; charge timestamptz;
begin
 select * into b from referral_bookings where id=p_id and assignment_deleted_at is null for update;
 if not found then raise exception 'Booking unavailable'; end if;
 if p_op<>'card' and not ((p_uid is null and p_email is not null and b.email=p_email) or
  (p_uid is not null and exists(select 1 from residential_referral_links where user_id=p_uid and booking_id=p_id))) then
  raise exception 'Booking unavailable';
 end if;
 select * into j from assignment_blocks where id=p_id for update;
 if b.status not in ('requested','review_required','awaiting_card','scheduled','needs_reschedule') or
  coalesce(j.status,'pending') in ('in_progress','qa_pending','completed','cancelled') then raise exception 'Visit no longer editable'; end if;
 if p_op<>'notes' and (b.payment_status not in ('not_collected','card_saved','action_required') or
  (b.status<>'needs_reschedule' and b.charge_at<=now())) then raise exception 'Payment is already due'; end if;
 if p_op='reschedule' then
  new_date:=(p_data->>'service_date')::date; start_time:=(p_data->>'arrival_start')::time; end_time:=(p_data->>'arrival_end')::time;
  if new_date is null or start_time is null or end_time is null or new_date<=(now() at time zone 'America/New_York')::date or end_time<=start_time then raise exception 'Choose a future arrival window'; end if;
  charge:=(new_date+least(start_time,'06:00'::time)) at time zone 'America/New_York';
  update referral_bookings set service_date=new_date,arrival_start=start_time,arrival_end=end_time,charge_at=charge,
   status=case when status='needs_reschedule' then case when stripe_payment_method is null then 'requested' else 'scheduled' end else status end where id=p_id;
  update assignment_blocks set start_window=(new_date+start_time) at time zone 'America/New_York',end_window=(new_date+end_time) at time zone 'America/New_York',
   status='pending',assigned_to=null,claimed_by=null,assigned_to_name=null,claimed_by_name=null,visibility='pending',
   metadata=coalesce(metadata,'{}')||jsonb_build_object('customer_rescheduled_at',now(),'admin_approval_status','pending') where id=p_id;
 elsif p_op='cancel' then
  update referral_bookings set status='cancelled',notes=concat_ws(E'\n',notes,'Cancelled by customer: '||left(coalesce(p_data->>'reason',''),300)) where id=p_id;
  update assignment_blocks set status='cancelled',visibility='closed' where id=p_id;
 elsif p_op='notes' then
  update referral_bookings set notes=left(coalesce(p_data->>'notes',''),1500) where id=p_id;
  update assignment_blocks set special_instructions=left(coalesce(p_data->>'notes',''),1500) where id=p_id;
 elsif p_op='card' then
  if p_data->>'customer' is distinct from b.stripe_customer or coalesce(p_data->>'payment_method','') !~ '^pm_[A-Za-z0-9]+$' then raise exception 'Card mismatch'; end if;
  if b.stripe_payment_method=p_data->>'payment_method' then return jsonb_build_object('ok',true); end if;
  update referral_bookings set stripe_payment_method=p_data->>'payment_method',payment_status='card_saved',
   status=case when status='awaiting_card' then 'scheduled' else status end where id=p_id;
 else raise exception 'Unsupported change'; end if;
 insert into customer_portal_events(booking_id,action,actor,data) values(p_id,p_op,coalesce(p_uid::text,p_email,'stripe'),
  case when p_op='card' then jsonb_build_object('session',p_data->>'session') when p_op='reschedule' then jsonb_build_object('previous_date',b.service_date,'service_date',new_date) else '{}'::jsonb end);
 return jsonb_build_object('ok',true);
end $function$;

