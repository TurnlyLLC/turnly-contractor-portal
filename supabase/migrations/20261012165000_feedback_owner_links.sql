alter table public.resident_feedback_responses
 add column if not exists portal_property_id uuid references public.portal_properties(id) on delete set null,
 add column if not exists customer_id uuid references public.referral_customers(id) on delete set null;
update public.resident_feedback_responses r set portal_property_id=c.portal_property_id
from public.resident_feedback_cards c where c.id=r.card_id and r.portal_property_id is null and r.customer_id is null;
-- Links are written only by the admin-authenticated server. Existing response RLS remains unchanged.
create index if not exists resident_feedback_customer_idx on public.resident_feedback_responses(customer_id) where customer_id is not null;
create index if not exists resident_feedback_property_idx on public.resident_feedback_responses(portal_property_id) where portal_property_id is not null;
