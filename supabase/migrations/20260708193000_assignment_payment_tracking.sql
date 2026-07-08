alter table public.assignment_blocks
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists pay_status text,
  add column if not exists payout_status text,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references auth.users(id) on delete set null,
  add column if not exists paid_amount numeric(12, 2),
  add column if not exists paid_notes text,
  add column if not exists paid_out boolean not null default false;

create index if not exists assignment_blocks_payment_status_idx
  on public.assignment_blocks (payment_status);

create index if not exists assignment_blocks_paid_at_idx
  on public.assignment_blocks (paid_at);

create index if not exists assignment_blocks_paid_by_idx
  on public.assignment_blocks (paid_by);
