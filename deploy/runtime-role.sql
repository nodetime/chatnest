-- Dedicated application database only. DBA pre-creates the login/password.
-- psql --no-psqlrc -v app_role=chatnest_app -f deploy/runtime-role.sql
\set ON_ERROR_STOP on
\if :{?app_role}
\else
  \echo RUNTIME_APP_ROLE_REQUIRED
  \quit 1
\endif
SELECT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=:'app_role' AND rolcanlogin
    AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
) AND NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname<>:'app_role' AND pg_catalog.pg_has_role(:'app_role',r.oid,'MEMBER')
) AND NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_settings s WHERE s.context IN ('superuser','superuser-backend') AND pg_catalog.has_parameter_privilege(:'app_role',s.name,'SET')
) AND NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_parameter_acl a WHERE pg_catalog.has_parameter_privilege(:'app_role',a.parname,'ALTER SYSTEM')
) AND NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database() AND pg_catalog.pg_has_role(:'app_role',datdba,'MEMBER')
) AND NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_shdepend d WHERE d.dbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())
    AND d.refclassid='pg_catalog.pg_authid'::pg_catalog.regclass AND d.deptype='o' AND pg_catalog.pg_has_role(:'app_role',d.refobjid,'MEMBER')
) AS runtime_role_independent \gset
\if :runtime_role_independent
\else
  \echo RUNTIME_APP_ROLE_NOT_INDEPENDENT
  \quit 1
\endif
BEGIN;
REVOKE CREATE,TEMPORARY ON DATABASE :"DBNAME" FROM PUBLIC, :"app_role";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM :"app_role";
GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_role";
GRANT USAGE ON SCHEMA public TO :"app_role";
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, :"app_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, :"app_role";
GRANT USAGE ON SCHEMA drizzle TO :"app_role";
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM PUBLIC, :"app_role";
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO :"app_role";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA drizzle FROM PUBLIC, :"app_role";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, :"app_role";
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
COMMIT;
