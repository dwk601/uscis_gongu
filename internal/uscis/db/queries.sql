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
