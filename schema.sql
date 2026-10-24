-- Run this in Supabase: SQL Editor > New query > paste > Run

create table membership_plan(
  plan_id serial primary key,
  plan_name text not null,
  duration_days int not null check (duration_days > 0),
  price numeric(10,2) not null);

create table member(
  member_id serial primary key,
  name text not null,
  phone text unique not null,
  email text,
  join_date date not null default current_date);

create table trainer(
  trainer_id serial primary key,
  name text not null,
  specialization text,
  phone text);

create table membership(
  membership_id serial primary key,
  member_id int not null references member on delete cascade,
  plan_id int not null references membership_plan,
  start_date date not null,
  end_date date not null,
  check (end_date >= start_date));

create table payment(
  payment_id serial primary key,
  membership_id int not null references membership on delete cascade,
  amount numeric(10,2) not null,
  payment_date date not null default current_date,
  method text not null check (method in ('Cash','Card','UPI')));

create table training_session(
  session_id serial primary key,
  member_id int not null references member on delete cascade,
  trainer_id int not null references trainer,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'Booked' check (status in ('Booked','Completed','Cancelled')),
  check (end_time > start_time));

create table attendance(
  attendance_id serial primary key,
  member_id int not null references member on delete cascade,
  check_in timestamptz not null default now());

-- Booking rules: valid membership on the day + no trainer overlap
create or replace function check_booking() returns trigger as $$
begin
  if new.status = 'Cancelled' then return new; end if;
  if not exists (select 1 from membership
                 where member_id = new.member_id
                   and new.session_date between start_date and end_date) then
    raise exception 'Member has no active membership on %', new.session_date;
  end if;
  if exists (select 1 from training_session
             where trainer_id = new.trainer_id
               and session_date = new.session_date
               and status = 'Booked'
               and session_id is distinct from new.session_id
               and start_time < new.end_time and end_time > new.start_time) then
    raise exception 'Trainer is already booked during that time';
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_check_booking before insert or update on training_session
for each row execute function check_booking();

-- Reporting view: memberships expiring in the next 7 days
create view expiring_soon as
select m.member_id, m.name, m.phone, ms.end_date
from membership ms join member m using (member_id)
where ms.end_date between current_date and current_date + 7;

-- Sample data
insert into membership_plan(plan_name,duration_days,price) values
 ('Monthly',30,1500),('Quarterly',90,4000),('Yearly',365,14000);
insert into trainer(name,specialization,phone) values
 ('Arjun Rao','Strength','9000000001'),('Meera Das','Yoga','9000000002');

-- Mini project: keep Row Level Security off so the browser app can read/write
alter table membership_plan disable row level security;
alter table member disable row level security;
alter table trainer disable row level security;
alter table membership disable row level security;
alter table payment disable row level security;
alter table training_session disable row level security;
alter table attendance disable row level security;
