do $$
declare
  r record; i int := 0;
  plan text[] := array[]::text[];
begin
  if (select count(*) from public.bookings) > 0 then raise exception 'bookings exist - not reassigning rooms'; end if;

  update public.settings set
    hotel_name='The Point Boutique Hotel', city='Johor Bahru',
    address='1-1-05, Jalan Titiwangsa 2, Taman Tampoi Indah, 81200 Johor Bahru, Johor, Malaysia',
    phone='+60 7-232 6493', email='thepointhoteljb@gmail.com',
    website='https://thepointboutiquehotel.zoombookdirect.com/', star_rating=3,
    check_in_time='15:00', check_out_time='12:00', rooms_placeholder=true,
    change_reason='Real hotel details from hotel booking site, Google listing, Agoda and Trip.com'
  where id=1;

  -- Re-map the 5 placeholder types onto the real ones (no deletes allowed), add the 6th.
  -- Rates = lowest published direct (non-refundable, room only) price excl. 8% SST, 6 Nov - 5 Dec 2026.
  update public.room_types set code='DDW', name='Deluxe Double Room with Window', base_rate=94.13, rate_floor=94.13, max_pax=2, change_reason='Real room type (was STQ placeholder)' where code='STQ';
  update public.room_types set code='DDN', name='Deluxe Double Room without Window', base_rate=94.13, rate_floor=94.13, max_pax=2, change_reason='Real room type (was DLK placeholder)' where code='DLK';
  update public.room_types set code='DTW', name='Deluxe Twin Room', base_rate=94.13, rate_floor=94.13, max_pax=2, change_reason='Real room type (was TWN placeholder)' where code='TWN';
  update public.room_types set code='FAM', name='Family Room', base_rate=163.70, rate_floor=163.70, max_pax=3, change_reason='Real room type and published rate' where code='FAM';
  update public.room_types set code='SGW', name='Single Room with Window', base_rate=81.85, rate_floor=81.85, max_pax=1, change_reason='Real room type (was STE placeholder)' where code='STE';
  insert into public.room_types(code,name,base_rate,rate_floor,max_pax,change_reason)
    select 'SGN','Single Room without Window',81.85,81.85,1,'Real room type' where not exists (select 1 from public.room_types where code='SGN');

  -- 44 rooms per the hotel's channel manager: DDW 20, DDN 5, DTW 5, FAM 5, SGW 5, SGN 4. Room numbers kept as placeholders.
  plan := array_fill('DDW'::text, array[20]) || array_fill('DDN'::text, array[5]) || array_fill('DTW'::text, array[5])
       || array_fill('FAM'::text, array[5]) || array_fill('SGW'::text, array[5]) || array_fill('SGN'::text, array[4]);
  for r in select id from public.rooms order by floor, number loop
    i := i + 1;
    if i <= 44 then
      update public.rooms set type_id=(select id from public.room_types where code=plan[i]), active=true,
        change_reason='Reassigned to real room type (placeholder number)' where id=r.id;
    else
      update public.rooms set active=false, change_reason='Retired: hotel lists 44 rooms; placeholder room kept for audit' where id=r.id;
    end if;
  end loop;
end $$;
select json_build_object('types',(select json_agg(json_build_object('code',t.code,'name',t.name,'rate',t.base_rate,'floor',t.rate_floor,'pax',t.max_pax,'rooms',(select count(*) from rooms where type_id=t.id and active)) order by t.code) from room_types t),
 'active',(select count(*) from rooms where active),'inactive',(select string_agg(number,',' order by number) from rooms where not active),
 'settings',(select row_to_json(s) from settings s)) r;
