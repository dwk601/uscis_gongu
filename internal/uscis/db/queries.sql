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
