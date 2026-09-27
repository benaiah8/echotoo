/**
 * Static checks for the RSVP write-retirement migration and rollback.
 * Does not connect to production or insert RSVP rows.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function sqlStatements(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

const FORWARD =
  "supabase/migrations/20261012120000_rsvp_responses_write_retirement.sql";
const ROLLBACK =
  "review-artifacts/rsvp_responses_write_retirement/ROLLBACK_restore_authenticated_writes_and_notify_rsvp.sql";
const ORIGINAL =
  "review-artifacts/rsvp_responses_write_retirement/ORIGINAL_notify_rsvp.pg_get_functiondef.sql";

const forbiddenDml = [
  "DELETE FROM",
  "TRUNCATE",
  "DROP TABLE",
  "DROP COLUMN",
  "DROP TRIGGER",
  "DROP POLICY",
  "DROP FUNCTION",
  "ALTER TABLE",
  "CREATE POLICY",
];

describe("RSVP backend write retirement SQL (local artifacts only)", () => {
  const forward = read(FORWARD);
  const rollback = read(ROLLBACK);
  const original = read(ORIGINAL);

  it("forward revokes only authenticated writes and preserves SELECT", () => {
    expect(forward).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.rsvp_responses FROM authenticated;",
    );
    expect(forward).not.toMatch(/REVOKE\s+SELECT/i);
    expect(forward).not.toMatch(/FROM anon/i);
    expect(forward).not.toMatch(/FROM service_role/i);
    expect(forward).not.toMatch(/FROM postgres/i);
    expect(forward).not.toMatch(/FROM PUBLIC/i);
  });

  it("forward replaces notify_rsvp with a no-op that returns NEW", () => {
    expect(forward).toContain("CREATE OR REPLACE FUNCTION public.notify_rsvp()");
    expect(forward).toContain("SECURITY DEFINER");
    expect(forward).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(forward).toMatch(/BEGIN\s+RETURN NEW;\s+END;/);
    const statements = sqlStatements(forward);
    expect(statements).not.toContain("create_notification");
    expect(statements).not.toContain("create_invite_status_notification");
    expect(statements).not.toContain("trigger_notify_rsvp");
  });

  it("forward does not mutate data, RLS, invites, capacity, or unused rsvps", () => {
    const statements = sqlStatements(forward).toUpperCase();
    for (const token of forbiddenDml) {
      expect(statements).not.toContain(token);
    }
    expect(forward).not.toContain("rsvp_capacity");
    expect(forward).not.toContain("public.rsvps");
    expect(forward).not.toContain("get_feed_with_related_data");
    expect(forward).not.toContain("social_opportunities");
  });

  it("rollback restores verified authenticated write grants only", () => {
    expect(rollback).toContain(
      "GRANT INSERT, UPDATE, DELETE ON public.rsvp_responses TO authenticated;",
    );
    expect(rollback).not.toMatch(/GRANT .* TO anon/i);
    expect(rollback).not.toMatch(/GRANT SELECT/i);
  });

  it("rollback embeds the complete original production notify_rsvp body", () => {
    expect(original).toContain("CREATE OR REPLACE FUNCTION public.notify_rsvp()");
    expect(original).toContain("PERFORM create_notification(");
    expect(original).toContain("jsonb_build_object('rsvp_status', NEW.status)");
    expect(original).toContain("IF NEW.status = 'going' THEN");
    expect(rollback).toContain(original);
    expect(rollback).not.toMatch(/BEGIN\s+RETURN NEW;\s+END;/);
  });
});
