-- Optional home layout shared by a flyer batch, never inferred from community totals.
alter table public.resident_feedback_batches
  add column bedrooms integer check (bedrooms between 0 and 30),
  add column bathrooms numeric check (bathrooms between 1 and 30 and mod(bathrooms, 0.5) = 0),
  add column square_feet integer check (square_feet between 100 and 100000);

create function public.create_resident_feedback_batch_with_home(
  p_batch_id uuid, p_property_id uuid, p_property_code text, p_start_number integer,
  p_token_hashes text[], p_created_by uuid, p_bedrooms integer default null,
  p_bathrooms numeric default null, p_square_feet integer default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  result := public.create_resident_feedback_batch(p_batch_id, p_property_id, p_property_code, p_start_number, p_token_hashes, p_created_by);
  update public.resident_feedback_batches set bedrooms=p_bedrooms, bathrooms=p_bathrooms, square_feet=p_square_feet where id=p_batch_id;
  return result;
end;
$$;
revoke all on function public.create_resident_feedback_batch_with_home(uuid,uuid,text,integer,text[],uuid,integer,numeric,integer) from public,anon,authenticated;
grant execute on function public.create_resident_feedback_batch_with_home(uuid,uuid,text,integer,text[],uuid,integer,numeric,integer) to service_role;

-- Only the server can resolve a high-entropy QR token. Return home-size defaults,
-- not unit addresses, contact details, access notes, or any internal property fields.
create function public.get_resident_feedback_quote_context(p_token text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('property_name',c.property_name,'property_code',c.property_code,'card_number',c.card_number,
    'bedrooms',b.bedrooms,'bathrooms',b.bathrooms,'square_feet',b.square_feet)
  from public.resident_feedback_cards c join public.resident_feedback_batches b on b.id=c.batch_id
  where p_token ~ '^[a-f0-9]{64}$' and c.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and c.disabled_at is null;
$$;
revoke all on function public.get_resident_feedback_quote_context(text) from public,anon,authenticated;
grant execute on function public.get_resident_feedback_quote_context(text) to service_role;
notify pgrst, 'reload schema';
