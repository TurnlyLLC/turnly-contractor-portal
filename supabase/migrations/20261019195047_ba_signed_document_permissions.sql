revoke all on public.ba_documents,public.ba_document_drafts from service_role;
grant select,insert on public.ba_documents to service_role;
grant select,insert,update on public.ba_document_drafts to service_role;
