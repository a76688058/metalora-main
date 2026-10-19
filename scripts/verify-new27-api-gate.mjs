/**
 * NEW27 pre-activation gate. Reads source only. Does not connect to a database.
 */
import fs from "node:fs";
import path from "node:path";
import { reviewRequestBlocked } from "../src/types/reviews.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const reviews = read("supabase/migrations/20261015180000_new27_reviews.sql");
const images = read("supabase/migrations/20261016120000_new27_review_image_server.sql");
const owned = read("supabase/migrations/20261016230000_new27_owned_review_images.sql");
const removal = read("supabase/migrations/20261018170000_new27_remove_owned_review_image.sql");
const routes = read("src/lib/reviewImageRoutes.ts");
const flags = read("src/types/reviews.ts");
const failures = [];

function assert(name, ok) {
  if (!ok) failures.push(name);
  else console.log(`PASS ${name}`);
}

function body(sql, name) {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? "" : sql.slice(start, end);
}

const writeFns = [
  [reviews, "create_review"],
  [reviews, "edit_review"],
  [reviews, "delete_review"],
  [reviews, "attach_review_image"],
  [reviews, "moderate_review"],
  [reviews, "report_review"],
  [images, "prepare_review_image_attach"],
  [removal, "remove_owned_review_image"],
];
const readFns = [
  [reviews, "list_public_reviews"],
  [reviews, "product_review_public_stats"],
  [reviews, "list_my_reviews"],
  [reviews, "list_admin_reviews"],
  [reviews, "list_admin_review_events"],
  [images, "list_owned_review_image_paths"],
  [images, "list_public_review_image_ids"],
  [images, "review_public_image_object_path"],
  [owned, "list_owned_review_images"],
];

for (const [sql, name] of writeFns) {
  const fn = body(sql, name);
  const guardAt = fn.indexOf("PERFORM public.review_api_guard('write')");
  assert(`${name} write gate is first`, guardAt > 0 && guardAt < fn.indexOf("IF coalesce"));
}
for (const [sql, name] of readFns) {
  const fn = body(sql, name);
  const guardAt = fn.indexOf("PERFORM public.review_api_guard('read')");
  assert(`${name} read gate is first`, guardAt > 0 && (fn.indexOf("IF coalesce") < 0 || guardAt < fn.indexOf("IF coalesce")));
}

assert("gate defaults closed", reviews.includes("read_ready boolean NOT NULL DEFAULT false") && reviews.includes("write_ready boolean NOT NULL DEFAULT false") && reviews.includes("VALUES (true, false, false)"));
assert("guard denies unless the boolean is true", body(reviews, "review_api_guard").includes("v_read IS TRUE") && body(reviews, "review_api_guard").includes("review_backend_unavailable"));
assert("activation is service_role only", body(reviews, "set_review_api_activation").includes("review_activation_server_only") && /GRANT EXECUTE ON FUNCTION public\.set_review_api_activation\(boolean, boolean\) TO service_role;/.test(reviews) && /REVOKE ALL ON FUNCTION public\.set_review_api_activation\(boolean, boolean\) FROM anon, authenticated;/.test(reviews));
assert("guard itself is not client-executable", /REVOKE ALL ON FUNCTION public\.review_api_guard\(text\) FROM PUBLIC, anon, authenticated, service_role;/.test(reviews));

const commerce = body(reviews, "set_order_item_commerce_state");
assert("commerce state stays service_role and ungated", commerce.includes("commerce_state_server_only") && !commerce.includes("review_api_guard"));
assert("non-owner delete remains after the gate", body(reviews, "delete_review").indexOf("review_api_guard") < body(reviews, "delete_review").indexOf("review_not_owner"));
assert("non-admin moderation remains after the gate", body(reviews, "moderate_review").indexOf("review_api_guard") < body(reviews, "moderate_review").indexOf("review_moderation_forbidden"));
assert("withdrawal redact stays independent", !body(reviews, "redact_reviews_for_withdrawal").includes("review_api_guard"));
assert("cleanup jobs stay independent", !body(images, "queue_review_image_cleanup").includes("review_api_guard"));

assert("http read stays blocked", reviewRequestBlocked("read") === true);
assert("http write stays blocked", reviewRequestBlocked("write") === true);
assert("readiness constants stay false", /REVIEW_WRITE_API_READY = false/.test(flags) && /REVIEW_READ_API_READY = false/.test(flags));
const postAt = routes.indexOf('app.post("/api/reviews/:reviewId/images"');
const uploadAt = routes.indexOf("uploadReviewImage", postAt);
assert("image upload checks the closed flag first", postAt > 0 && routes.indexOf('denyClosed(res, "write")', postAt) > postAt && routes.indexOf('denyClosed(res, "write")', postAt) < uploadAt);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, gatedWrites: writeFns.length, gatedReads: readFns.length }));
