alter table public.recruiting_applications drop constraint recruiting_applications_status_check,
  add constraint recruiting_applications_status_check check (status in (
    'new','shortlisted','reviewing','contacted','interview','onboarding','waitlist','not_selected','withdrawn','hired'
  ));
