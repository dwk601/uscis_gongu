CREATE VIEW public.immihelp_timeline AS
SELECT '221g-tracker'::text AS tracker, 'F1'::text AS category, 'Thirty'::text AS office,
       '2024-01-01'::date AS start_date, (CASE WHEN n=30 THEN '2024-01-21' ELSE '2024-01-11' END)::date AS decision_date,
       '2026-09-27 00:00:00+00'::timestamptz AS first_seen_at, '2024-01-06 00:00:00+00'::timestamptz AS updated_at, false AS pending
FROM generate_series(1,30) n
UNION ALL SELECT '221g-tracker','F1','Pending','2024-01-01',NULL,'2026-09-27 00:00+00','2024-01-06 00:00+00',true FROM generate_series(1,10)
UNION ALL SELECT '221g-tracker','F1','Small','2024-01-01','2024-01-11','2026-09-27 00:00+00',NULL,false FROM generate_series(1,29)
UNION ALL SELECT '221g-tracker','F1','Pending','2024-01-01',NULL,'2026-09-27 00:00+00','2024-01-11 00:00+00',true
UNION ALL SELECT '221g-tracker','F1','Small','2024-01-01',NULL,'2026-09-27 00:00+00','2024-01-06 00:00+00',true
UNION ALL SELECT '221g-tracker','F1','Tiny','2024-01-01',NULL,'2026-09-27 00:00+00','2024-01-06 00:00+00',true FROM generate_series(1,29)
UNION ALL SELECT '221g-tracker','F1','Mumbai','2024-01-01',NULL,'2026-09-27 00:00+00',NULL,NULL
UNION ALL SELECT '221g-tracker','F1','Pending','2024-01-01',NULL,'2024-02-01 00:00+00','2024-01-31 00:00+00',true
UNION ALL SELECT '221g-tracker','F1','Pending','2024-01-01',NULL,'2024-01-08 00:00+00','2024-02-01 00:00+00',true
UNION ALL SELECT '221g-tracker','F1','Pending','2024-01-01',NULL,'2024-02-01 00:00+00','2023-12-01 00:00+00',true
UNION ALL SELECT '221g-tracker','F1','Pending','2024-01-01',NULL,'2024-02-01 00:00+00',NULL,true
UNION ALL SELECT '221g-tracker','F1','Pending','2024-01-01','2023-12-31','2024-02-01 00:00+00',NULL,false
UNION ALL SELECT '221g-tracker','F1','Pending','2024-01-01',NULL,'2023-12-31 00:00+00','2024-01-02 00:00+00',true
UNION ALL SELECT 'other-tracker','F1','Other','2024-01-01','2024-01-11','2024-02-01 00:00+00',NULL,false
UNION ALL SELECT '221g-tracker','H1B','Other','2024-01-01','2024-01-11','2024-02-01 00:00+00',NULL,false;

CREATE VIEW public.dol_lca_pay_stats AS
SELECT 2025::int AS fiscal_year, 'SOFTWARE ENGINEER'::text AS title_key, 'Software Engineer'::text AS job_title, 1::int AS title_rank,
       s.state AS worksite_state, s.cases::int, 70000::float8 AS p10, 80000::float8 AS p25, 100000::float8 AS p50, 120000::float8 AS p75, 140000::float8 AS p90,
       '2024-11-01'::date AS first_received, '2025-08-01'::date AS last_received
FROM (VALUES (NULL::text,100),('CA',60),('NY',40)) s(state,cases)
UNION ALL SELECT 2025,'ANALYST','Analyst',2,NULL,40,1,2,3,4,5,'2024-10-01','2025-09-30'
UNION ALL SELECT 2026,'ENGINEER','Engineer',1,NULL,30,1,2,3,4,5,'2025-10-01','2026-01-01';

CREATE VIEW public.h1b_employer AS
SELECT 2025::int AS fiscal_year, ('Employer ' || lpad(n::text,2,'0'))::text AS employer_name, n::int AS initial_approvals,
       1::int AS initial_denials, 2::int AS continuing_approvals, 'secret'::text AS tax_id_last4 FROM generate_series(1,25) n
UNION ALL SELECT 2025,'Employer 01',100,2,3,'secret'
UNION ALL SELECT 2025,'A Employer',25,1,2,'secret'
UNION ALL SELECT 2024,'Older Employer',1000,1,2,'secret';

CREATE VIEW public.student_post_week AS
SELECT ('2024-01-01'::date + n*7)::date AS week_start, topic::text,
       CASE WHEN n=13 THEN NULL WHEN topic='sevis' THEN CASE WHEN n=12 THEN 25 ELSE n+1 END WHEN topic='cpt' THEN n % 2 WHEN topic='policy' THEN 3 ELSE n+2 END::int AS posts,
       (n<>13) AS covered
FROM generate_series(0,14) n CROSS JOIN (VALUES ('all'),('sevis'),('cpt'),('policy')) t(topic);
