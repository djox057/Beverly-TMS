-- Projects can have broad default table grants; keep chatbot tables authenticated-only.
revoke all on public.chatbot_access,public.chatbot_faq,public.chatbot_document_reviews,public.chatbot_request_limits from public,anon;
