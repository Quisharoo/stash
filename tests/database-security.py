"""Exercise the production migrations against a temporary, socket-only PostgreSQL cluster."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
USER_A = "00000000-0000-0000-0000-000000000001"
USER_B = "00000000-0000-0000-0000-000000000002"

def run(*args):
    return subprocess.run(args, text=True, capture_output=True, check=True)

with tempfile.TemporaryDirectory(prefix="stash-security-") as temporary:
    base = Path(temporary)
    data = base / "data"
    run("initdb", "-D", str(data), "-U", "postgres", "-A", "trust", "--no-locale")
    run("pg_ctl", "-D", str(data), "-l", str(base / "server.log"),
        "-o", f"-k {base} -c listen_addresses=''", "-w", "start")
    try:
        def sql(query, role=None, user=None, denied=False):
            prefix = f"set role {role};" if role else ""
            if user:
                prefix += f"select set_config('request.jwt.claim.sub', '{user}', false);"
            result = subprocess.run(["psql", "-h", str(base), "-U", "postgres", "-d", "postgres",
                "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
                input=prefix + query, text=True, capture_output=True)
            if denied:
                assert result.returncode != 0, "unauthorized operation succeeded"
                assert "permission denied" in result.stderr or "row-level security" in result.stderr, result.stderr
                return
            assert result.returncode == 0, result.stderr
            return result.stdout.strip().splitlines()[-1:]

        sql("""
            create role anon;
            create role authenticated;
            create role service_role bypassrls;
            create schema auth;
            create table auth.users(id uuid primary key);
            create function auth.uid() returns uuid language sql stable as
              $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
            grant usage on schema auth, public to anon, authenticated, service_role;
            grant execute on function auth.uid() to anon, authenticated, service_role;
        """)
        for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            sql(migration.read_text())
        # Reapplying the final migration must preserve the same access contract.
        sql((ROOT / "supabase/migrations/20261113000000_require_authenticated_ownership.sql").read_text())
        sql(f"insert into auth.users values ('{USER_A}'), ('{USER_B}');")
        for user in [USER_A, USER_B]:
            for table in ["folders", "tags"]:
                sql(f"insert into {table}(id, user_id, name) values ('{user}', '{user}', 'Private item');")
            sql(f"insert into saves(id, user_id, folder_id, title) values ('{user}', '{user}', '{user}', 'Private article');")
            sql(f"insert into user_preferences(user_id, digest_email) values ('{user}', 'synthetic@example.test');")
            sql(f"insert into save_tags(save_id, tag_id) values ('{user}', '{user}');")
            sql(f"insert into integrations(user_id, provider, access_token) values ('{user}', 'test', 'synthetic-token');")

        tables = ["saves", "folders", "tags", "save_tags", "user_preferences"]
        for table in tables + ["integrations"]:
            sql(f"select * from {table}", role="anon", denied=True)
        for user, other in [(USER_A, USER_B), (USER_B, USER_A)]:
            for table in tables:
                assert sql(f"select count(*) from {table}", role="authenticated", user=user) == ["1"]
            sql("select * from integrations", role="authenticated", user=user, denied=True)
            sql(f"insert into saves(user_id, title) values ('{other}', 'Injected')", role="authenticated", user=user, denied=True)
            sql(f"insert into saves(user_id, folder_id, title) values ('{user}', '{other}', 'Injected')", role="authenticated", user=user, denied=True)
            sql(f"insert into save_tags(save_id, tag_id) values ('{user}', '{other}')", role="authenticated", user=user, denied=True)
            sql(f"update saves set user_id='{other}' where id='{user}'", role="authenticated", user=user, denied=True)
            assert sql(f"with changed as (update saves set title='Injected' where id='{other}' returning *) select count(*) from changed", role="authenticated", user=user) == ["0"]
            assert sql(f"with removed as (delete from saves where id='{other}' returning *) select count(*) from removed", role="authenticated", user=user) == ["0"]
            assert sql(f"with changed as (update saves set title='Own edit' where id='{user}' returning *) select count(*) from changed", role="authenticated", user=user) == ["1"]
            assert sql(f"with inserted as (insert into saves(user_id,title) values ('{user}','Own new save') returning *) select count(*) from inserted", role="authenticated", user=user) == ["1"]
            assert sql(f"with removed as (delete from saves where user_id='{user}' and title='Own new save' returning *) select count(*) from removed", role="authenticated", user=user) == ["1"]
        assert sql("select count(*) from integrations", role="service_role") == ["2"]
        print("PASS: full migration chain, repeat migration, anonymous denial, per-user reads/writes, cross-owner relations, server-only tokens")
    finally:
        run("pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop")
