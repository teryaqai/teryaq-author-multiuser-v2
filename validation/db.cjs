const {PGlite}=require('@electric-sql/pglite'),fs=require('fs'),path=require('path');
const root=require('node:path').resolve(__dirname,'..');
async function setup(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create function public.rls_auto_enable() returns void language sql as $$select$$;
create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'role',auth.role())$$;
grant usage on schema public,auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb default '{}'::jsonb,created_at timestamptz default now(),updated_at timestamptz default now(),unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon,service_role;grant all on all tables in schema storage to authenticated,service_role;
create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
create function storage.filename(text) returns text language sql immutable as $$select (string_to_array($1,'/'))[array_length(string_to_array($1,'/'),1)]$$;
create function storage.extension(text) returns text language sql immutable as $$select split_part($1,'.',-1)$$;`);
for(const name of fs.readdirSync(root+'/supabase/migrations').sort()){
const sql=fs.readFileSync(root+'/supabase/migrations/'+name,'utf8').replace(/create extension if not exists pgcrypto[^;]*;/gi,'');try{await db.exec(sql);console.log('Applied',name);}catch(e){console.error('FAILED',name,e.message,e.code,e.detail);throw e;}}
return db;}
module.exports={setup,root};if(require.main===module)setup().then(db=>db.close()).catch(()=>process.exit(1));
