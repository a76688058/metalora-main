/**
 * NEW27 static structure check. Reads the migration text only.
 * Does not connect to a database and is not runtime evidence.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sql = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20261015180000_new27_reviews.sql"),
  "utf8",
);
const scratch = fs.readFileSync(
  path.join(root, "scripts", "sql", "verify-new27-reviews.scratch.sql"),
  "utf8",
);
const failures = [];
function assert(name, ok) {
  if (!ok) failures.push(name);
  else console.log(`PASS ${name}`);
}

function functionBody(name) {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? "" : sql.slice(start, end);
}

const tables = [
  "public.order_item_commerce_state",
  "public.reviews",
  "public.review_images",
  "public.review_moderation_events",
];
for (const table of tables) {
  assert(
    `revoke all roles on ${table}`,
    sql.includes(`REVOKE ALL ON TABLE ${table} FROM PUBLIC, anon, authenticated, service_role`),
  );
}
const grantLines = sql.split(/\r?\n/).filter((line) => /^\s*GRANT\b/i.test(line));
assert(
  "no direct table grant",
  grantLines.every((line) => !/\bON TABLE public\.(reviews|review_images|review_moderation_events|order_item_commerce_state)\b/.test(line)),
);
assert("no session GUC writer", !sql.includes("set_config("));
assert("no writer-guc function", !sql.includes("reviews_require_writer"));

const commerce = functionBody("set_order_item_commerce_state");
assert("commerce requires service role", commerce.includes("commerce_state_server_only"));
assert("commerce requires completed order", commerce.includes("v_status = 'COMPLETED'") && commerce.includes("v_completed_at IS NOT NULL") && commerce.includes("v_finalized_at IS NOT NULL"));
assert("commerce locks item order commerce and review", commerce.indexOf("FROM public.order_items") < commerce.indexOf("FROM public.orders") && commerce.indexOf("FROM public.orders") < commerce.indexOf("FROM public.order_item_commerce_state") && commerce.indexOf("order_item_commerce_state") < commerce.indexOf("FROM public.reviews"));
assert("repeated refund does not return before review hide", !commerce.includes("IS NOT DISTINCT FROM p_state THEN\n    RETURN"));
assert("commerce hides non-hidden review", commerce.includes("v_review_status IS DISTINCT FROM 'hidden'"));

const create = functionBody("create_review");
assert("create locks before insert", create.indexOf("FOR UPDATE") < create.indexOf("INSERT INTO public.reviews"));
assert("create maps unique violation", create.includes("WHEN unique_violation THEN") && create.includes("review_entitlement_consumed"));
assert("create rejects missing fulfillment", create.includes("v_commerce IS DISTINCT FROM 'fulfilled'"));

for (const name of ["edit_review", "delete_review", "moderate_review"]) {
  assert(`${name} blocks withdrawn session`, functionBody(name).includes("withdrawn_subject_frozen"));
}
assert("approve requires fulfilled", functionBody("moderate_review").includes("p_action = 'approve' AND v_commerce IS DISTINCT FROM 'fulfilled'"));

const attach = functionBody("attach_review_image");
assert("attach is server only", attach.includes("review_image_server_only"));
assert("attach not granted to authenticated", /REVOKE ALL ON FUNCTION public\.attach_review_image\(uuid, text, text, integer\) FROM anon, authenticated;/.test(sql));
assert("attach granted to service_role", /GRANT EXECUTE ON FUNCTION public\.attach_review_image\(uuid, text, text, integer\) TO service_role;/.test(sql));

const pub = functionBody("list_public_reviews");
assert("public read columns exclude user and order", pub.includes("review.id, review.rating, review.body, review.created_at") && !pub.includes("review.user_id") && !pub.includes("review.order_id"));
assert("public read requires approved and fulfilled", pub.includes("review.status = 'approved'") && pub.includes("review_commerce_is_fulfilled"));
assert("stats use the same public predicate", functionBody("product_review_public_stats").includes("review.status = 'approved'") && functionBody("product_review_public_stats").includes("review_commerce_is_fulfilled"));
assert("admin read is a function", functionBody("list_admin_reviews").includes("profiles_is_current_user_admin"));
assert("admin events omit actor id", !functionBody("list_admin_review_events").includes("event.actor_id"));

assert("scratch opts in", scratch.includes("metalora.review_test_scratch"));
assert("scratch names disposable identity", scratch.includes("disposable-local"));
assert("scratch rejects production and payment-test", scratch.includes("refusing production or payment-test target"));
assert("scratch rolls back", scratch.trimEnd().endsWith("ROLLBACK;"));
assert("scratch asserts privileges", scratch.includes("has_table_privilege") && scratch.includes("has_function_privilege"));
assert("scratch does not claim concurrency pass", scratch.includes("not a concurrency pass") || scratch.includes("does not record a concurrency pass"));
for (const name of [
  "unpaid or incomplete order",
  "missing completed_at",
  "missing payment_finalized_at",
  "missing commerce-state row",
  "duplicate review",
  "non-owner edit",
  "non-admin moderation",
  "refunded review",
  "recreate after deletion",
  "direct table write",
]) {
  assert(`scratch asserts ${name}`, scratch.includes(name));
}

if (failures.length > 0) {
  console.error("FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("STATIC PASS");
console.log("DATABASE EXECUTION: NOT RUN");
