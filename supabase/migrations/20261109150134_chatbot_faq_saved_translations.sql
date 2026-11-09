alter table public.chatbot_faq add column translations jsonb not null default '{}'::jsonb check (jsonb_typeof(translations) = 'object' and octet_length(translations::text) <= 20000);
