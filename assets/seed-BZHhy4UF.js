var e=`11111111-1111-4111-8111-111111111111`,t=`11111111-1111-4111-8111-222222222222`,n=`11111111-1111-4111-8111-333333333333`,r=[[`المقطم`,`أحمد سمير`,`فني معمل`],[`المقطم`,`منى عادل`,`أخصائي`],[`المقطم`,`كريم حسن`,`مساعد`],[`جسر السويس`,`هدى مصطفى`,`أخصائي`],[`جسر السويس`,`يوسف إبراهيم`,`فني معمل`],[`جسر السويس`,`سارة فتحي`,`استقبال`],[`ترسا`,`محمود عبد الله`,`فني معمل`],[`ترسا`,`نهى رمضان`,`أخصائي`],[`ترسا`,`عمر خالد`,`مساعد`],[`الهرم`,`ريم أشرف`,`أخصائي`],[`الهرم`,`طارق منصور`,`فني معمل`],[`الهرم`,`دينا سعيد`,`استقبال`]],i=r.map((e,t)=>`22222222-2222-4222-8222-${String(t+1).padStart(12,`0`)}`),a=[{id:e,email:`owner@demo.local`,label:`المالك`},{id:t,email:`labmgr@demo.local`,label:`مدير المعمل`},{id:n,email:`brmgr@demo.local`,label:`مدير فرع المقطم`},{id:i[0],email:`emp1@demo.local`,label:`موظف`}],o=e=>e.replace(/'/g,`''`),s=`
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('${e}','owner@demo.local',now(),'{"full_name":"المالك (عرض تجريبي)"}'),
 ('${t}','labmgr@demo.local',now(),'{"full_name":"مدير المعمل (عرض تجريبي)"}'),
 ('${n}','brmgr@demo.local',now(),'{"full_name":"مدير فرع المقطم (عرض تجريبي)"}'),
 ${r.map((e,t)=>`('${i[t]}','emp${t+1}@demo.local',now(),'{"full_name":"${o(e[1])}"}')`).join(`,
 `)};
update profiles set role='super_admin' where id='${e}';
update profiles set role='lab_manager' where id='${t}';
update profiles set role='branch_manager' where id='${n}';
insert into branch_managers(profile_id,branch_id) select '${n}', id from branches where name='المقطم';
update profiles set privacy_acknowledged_at=now();
update branches set lat=30.0, lng=31.25, radius_m=150 where name='المقطم';
update branches set lat=30.05, lng=31.30, radius_m=150 where name='جسر السويس';
update branches set lat=30.02, lng=31.20, radius_m=150 where name='ترسا';
update branches set lat=29.9, lng=31.1, radius_m=150 where name='الهرم';
${r.map((e,t)=>`insert into employees(profile_id,branch_id,job_title,start_date,phone,demo,employee_no) select '${i[t]}', id, '${o(e[2])}', date '2025-0${t%9+1}-01', '0100000${String(1e3+t)}', true, 'EMP-${String(t+1).padStart(3,`0`)}' from branches where name='${o(e[0])}';`).join(`
`)}
-- working days: last 30 days up to today, no Fridays
create temp table days as select d::date as d from generate_series(current_date - 29, current_date, interval '1 day') g(d) where extract(dow from d) <> 5;
create temp table emp as select e.id, e.branch_id, row_number() over (order by e.employee_no) as n from employees e;
insert into shift_assignments(employee_id,work_date,template_id,branch_id,status)
 select e.id, d.d, (select id from shift_templates where code='morning'), e.branch_id, 'approved' from emp e cross join days d;
-- leave: 3 people, 2-3 days each (approved), no attendance on those days
insert into leave_requests(employee_id,branch_id,leave_type,from_date,to_date,reason,status,decided_at)
 select e.id, e.branch_id, 'annual', current_date - 12 - e.n::int, current_date - 10 - e.n::int, 'إجازة اعتيادية', 'approved', now() - interval '15 days' from emp e where e.n in (2,5,9);
-- day facts (deterministic pseudo-random)
create temp table fact as
 select e.id eid, e.branch_id bid, d.d, e.n, abs(hashtext(e.id::text || d.d::text)) % 100 r1, abs(hashtext(d.d::text || e.id::text || 'x')) % 100 r2
 from emp e cross join days d
 where not exists (select 1 from leave_requests l where l.employee_id=e.id and l.status='approved' and d.d between l.from_date and l.to_date);
create temp table plan as select *,
  case when r1 < 5 then 'absent' when r1 < 20 then 'late' when r1 < 22 then 'flag' else 'ok' end as kind from fact
  where not (d = current_date and extract(hour from now()) < 7);
insert into attendance_records(id,employee_id,branch_id,work_date,event_type,device_time,server_time,lat,lng,accuracy_m,distance_m,source,status,flags)
 select gen_random_uuid(), eid, bid, d, 'in',
   d + interval '7 hours' + make_interval(mins => case kind when 'late' then 18 + r2 % 40 else r2 % 9 end),
   d + interval '7 hours' + make_interval(mins => case kind when 'late' then 18 + r2 % 40 else r2 % 9 end),
   (select lat from branches where id=bid), (select lng from branches where id=bid), 8 + r2 % 20,
   case kind when 'flag' then 420 else 5 + r2 % 40 end, case when r2 % 11 = 0 then 'offline' else 'online' end,
   case kind when 'flag' then 'flagged' else 'approved' end,
   case kind when 'flag' then '{outside_radius}'::text[] else '{}'::text[] end
 from plan where kind <> 'absent' and d <= current_date;
insert into attendance_records(id,employee_id,branch_id,work_date,event_type,device_time,server_time,lat,lng,accuracy_m,distance_m,source,status,flags)
 select gen_random_uuid(), eid, bid, d, 'out',
   d + interval '15 hours' + make_interval(mins => (r2 % 40) - 8),
   d + interval '15 hours' + make_interval(mins => (r2 % 40) - 8),
   (select lat from branches where id=bid), (select lng from branches where id=bid), 8 + r2 % 20, 5 + r2 % 40, 'online', 'approved', '{}'::text[]
 from plan where kind <> 'absent' and (d < current_date or extract(hour from now()) >= 16);
insert into attendance_verifications(record_id,gps_result,wifi_result,selfie_present)
 select id, case when 'outside_radius'=any(flags) then 'outside' else 'inside' end, 'unavailable', not ('outside_radius'=any(flags)) from attendance_records on conflict (record_id) do nothing;
-- pending requests for the review screens
insert into leave_requests(employee_id,branch_id,leave_type,from_date,to_date,reason)
 select e.id, e.branch_id, 'annual', current_date + 5, current_date + 7, 'ظرف عائلي' from emp e where e.n in (3,8);
insert into permission_requests(employee_id,branch_id,work_date,from_time,to_time,reason)
 select e.id, e.branch_id, current_date + 2, '13:00', '15:00', 'موعد طبي' from emp e where e.n in (6);
insert into attendance_correction_requests(employee_id,branch_id,work_date,event_type,requested_time,reason,status)
 select e.id, e.branch_id, current_date - 3, 'out', (current_date - 3) + interval '15 hours', 'نسيت تسجيل الانصراف', 'pending' from emp e where e.n in (4,11);
insert into attendance_correction_requests(employee_id,branch_id,work_date,event_type,requested_time,reason,status,decided_at)
 select e.id, e.branch_id, current_date - 6, 'out', (current_date - 6) + interval '15 hours 5 minutes', 'عطل في الموبايل', 'approved', now() - interval '5 days' from emp e where e.n = 7;
update system_settings set value='true'::jsonb where key='branch_change_enabled';
insert into system_settings(key,value,updated_at) values ('late_grace_minutes','10',now()) on conflict (key) do update set value='10';
-- owner-authored note and owner-decided correction: how owner actions appear to managers
insert into attendance_notes(record_id,note,by_profile,by_name)
 select r.id, 'نزل بدري بموافقتي', '${e}', 'المالك (عرض تجريبي)'
 from attendance_records r join employees e on e.id=r.employee_id
 where e.employee_no='EMP-001' and r.event_type='in' order by r.work_date desc limit 1;
insert into attendance_correction_requests(employee_id,branch_id,work_date,event_type,requested_time,reason,status,decided_by,decided_at,decision_note)
 select e.id, e.branch_id, current_date - 2, 'out', (current_date - 2) + interval '19 hours', 'الموظف نسي يسجل الانصراف', 'approved', '${e}', now() - interval '2 days', 'اتأكدت من المدير'
 from employees e where e.employee_no='EMP-002';
`;export{a,e as i,i as n,s as o,t as r,n as t};