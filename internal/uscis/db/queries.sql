-- name: CaseEstimates :many
SELECT e.form, e.category, e.filing_year, e.is_default_cohort, e.official_description,
 e.official_median_months, e.official_period, e.official_previous_median_months,
 e.official_previous_period, e.latest_reporting_period, e.official_trend, e.as_of_date,
 e.official_reason, e.official_source, e.official_population, e.p25_days, e.p50_days,
 e.p75_days, e.eligible_count, e.completed_count, e.censored_count, e.excluded_count,
 e.visa_types, e.community_as_of_date, e.community_refreshed_at, e.community_reason,
 e.p25_reason, e.p75_reason, e.community_source, e.community_method, e.community_population,
 CASE WHEN e.is_default_cohort THEN (SELECT json_build_object('eligibleReports', coalesce(sum(s.eligible_count), 0),
   'years', coalesce(json_agg(DISTINCT s.filing_year ORDER BY s.filing_year) FILTER (WHERE s.filing_year IS NOT NULL AND s.eligible_count > 0), '[]'::json))
  FROM public.case_community_stats s WHERE s.form = $1) END::json AS summary,
 CASE WHEN e.is_default_cohort THEN (SELECT coalesce(json_agg(json_build_object('source', r.source, 'latestStatus', r.latest_run_status,
   'latestAttemptStartedAt', r.latest_run_started_at, 'latestAttemptFinishedAt', r.latest_run_finished_at,
   'lastSuccessAt', r.last_successful_run_finished_at, 'lastDataAt', r.last_recorded_data_run_finished_at,
   'lastDataStatus', r.last_recorded_data_run_status, 'latestAttemptFailed', r.latest_run_status = 'failed') ORDER BY r.source), '[]'::json)
  FROM public.source_refresh_status r WHERE r.source IN ('uscis_quarterly', 'visajourney')) END::json AS freshness
FROM public.case_estimate_current e WHERE e.form = $1 AND e.official_description = $2
ORDER BY e.filing_year;

-- name: Visa221g :many
SELECT office, start_date, decision_date, first_seen_at, updated_at, pending
FROM public.immihelp_timeline
WHERE tracker = '221g-tracker' AND category = 'F1' AND start_date IS NOT NULL;

-- name: PayCatalog :many
SELECT fiscal_year, title_key, job_title, title_rank, cases, first_received, last_received
FROM public.dol_lca_pay_stats WHERE worksite_state IS NULL
ORDER BY fiscal_year DESC, title_rank, title_key;

-- name: PayTitle :many
SELECT fiscal_year, title_key, job_title, worksite_state, cases, p10, p25, p50, p75, p90
FROM public.dol_lca_pay_stats WHERE fiscal_year = $1 AND title_key = $2
ORDER BY cases DESC, worksite_state;

-- name: StudentWeeks :many
SELECT week_start, topic, posts, covered FROM public.student_post_week
ORDER BY week_start, topic;

-- name: EmployerYears :many
SELECT DISTINCT fiscal_year FROM public.h1b_employer
WHERE fiscal_year IS NOT NULL ORDER BY fiscal_year DESC;

-- name: Employers :many
SELECT employer_name, sum(initial_approvals)::bigint AS initial_approvals,
       sum(initial_denials)::bigint AS initial_denials,
       sum(continuing_approvals)::bigint AS continuing_approvals
FROM public.h1b_employer
WHERE fiscal_year = $1 AND employer_name IS NOT NULL
GROUP BY employer_name ORDER BY initial_approvals DESC, employer_name ASC LIMIT 20;

-- name: Forms :many
SELECT fiscal_year, quarter, quarter_start, category, form, description, received, approved, denied, completed, pending, processing_months, source_file
FROM public.uscis_form_quarter
ORDER BY form, description, fiscal_year, quarter;

-- name: Community :many
SELECT stage, visa_type, filing_year, sample_size, completed_count, pending_count, pending_share, p10_days, p50_days, p90_days
FROM public.visajourney_timeline_stats
WHERE stage IN ('aos', 'ead', 'ap', 'lift', 'n400', 'k1')
ORDER BY stage, visa_type, filing_year;

-- name: Bulletin :many
SELECT bulletin_month, chart, category_group, category_code, country_code, cutoff_date, is_current, is_unavailable, country_label
FROM public.visa_bulletin_series
ORDER BY category_group, category_code, chart, country_code, bulletin_month;

-- name: RedditTimelines :many
SELECT case_type, premium, filed_month, approved_reports, p10_days, p50_days, p90_days, form, quarter_start, processing_months FROM public.reddit_timeline_vs_uscis_quarter ORDER BY form, case_type, premium NULLS FIRST, filed_month;

-- name: RedditDiscussion :many
SELECT DISTINCT month, topic, posts, comments FROM public.reddit_green_card_month_vs_bulletin ORDER BY month, topic, posts, comments;

-- name: RedditH1bTalk :many
SELECT month, h1b_posts, h1b_comments, lottery_posts, lottery_comments, lca_cases, lca_certified FROM public.reddit_h1b_month_vs_lca ORDER BY month;

-- name: RedditCoverage :one
SELECT min(day)::date AS first_day, max(day)::date AS last_day FROM public.reddit_activity_day;
