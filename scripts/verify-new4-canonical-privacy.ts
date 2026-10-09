/**
 * NEW4 canonical-only write contract + Privacy disclosure checks (source-only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from '../src/lib/publicPaymentFreeze.ts';
import { PRIVACY_POLICY_VERSION } from '../src/lib/policyVersions.ts';
import { NOTICE_REVIEW_PENDING } from '../src/components/pdp/ProductInformationNotice.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
let passed = 0;

function assert(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const canonicalSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261010090000_new4_canonical_only_workshop_refs.sql'),
  'utf8',
);
const privacySql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261010091000_new4_privacy_v26_10_10.sql'),
  'utf8',
);
const transitionSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261007100000_new4_4d_path_validation.sql'),
  'utf8',
);
const policies = fs.readFileSync(path.join(root, 'src/constants/policies.tsx'), 'utf8');
const freeze = fs.readFileSync(path.join(root, 'src/lib/publicPaymentFreeze.ts'), 'utf8');
const notice = fs.readFileSync(path.join(root, 'src/components/pdp/ProductInformationNotice.tsx'), 'utf8');
const handoff = fs.readFileSync(path.join(root, 'src/lib/customComposition/durableHandoff.ts'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'src/lib/workshopStorage.ts'), 'utf8');

const canonicalBody = canonicalSql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
assert('canonical migration replaces workshop_ref_is_accepted', /CREATE OR REPLACE FUNCTION public\.workshop_ref_is_accepted\(/.test(canonicalSql));
assert('canonical migration accepts own canonical only',
  /workshop_ref_is_own_canonical\(p_ref, p_expected_kind\)/.test(canonicalSql)
  && !/workshop_ref_is_own_legacy_supabase\(p_ref/.test(canonicalBody));
assert('canonical migration does not drop legacy helper', !/DROP FUNCTION[\s\S]*workshop_ref_is_own_legacy_supabase/.test(canonicalSql));
assert('canonical migration has no data rewrite', !/\b(UPDATE|DELETE|INSERT)\b/i.test(canonicalBody));
assert('canonical migration has no orders JSON CHECK',
  !/\bCHECK\b/.test(canonicalBody) && !/ALTER TABLE/.test(canonicalSql));
assert('canonical grants unchanged',
  /GRANT EXECUTE ON FUNCTION public\.workshop_ref_is_accepted\(text, text\) TO authenticated/.test(canonicalSql)
  && /GRANT EXECUTE ON FUNCTION public\.workshop_ref_is_accepted\(text, text\) TO service_role/.test(canonicalSql)
  && /REVOKE ALL ON FUNCTION public\.workshop_ref_is_accepted\(text, text\) FROM anon/.test(canonicalSql));
assert('historical dual-acceptance migration left in place',
  /workshop_ref_is_own_canonical\(p_ref, p_expected_kind\)\s*OR\s*public\.workshop_ref_is_own_legacy_supabase/.test(transitionSql));
assert('legacy helper retained in historical migration', /FUNCTION public\.workshop_ref_is_own_legacy_supabase/.test(transitionSql));

assert('new uploads persist canonical path from sign-upload', /buildCanonicalWorkshopPath/.test(storage) && /handleSignUpload/.test(storage));
assert('handoff stores server path refs, not public workshop URLs',
  /persistWorkshopCartMedia/.test(handoff) && !/storage\/v1\/object\/public\/workshop/.test(handoff));

assert('privacy version id matches displayed text family', PRIVACY_POLICY_VERSION === 'privacy_v26.10.10');
assert('privacy allowlist SQL matches source version', privacySql.includes("'privacy' THEN 'privacy_v26.10.10'"));
assert('privacy SQL does not rewrite user_agreements rows',
  /ON CONFLICT \(user_id, policy_type, agreement_version\) DO NOTHING/.test(privacySql)
  && !/UPDATE\s+public\.user_agreements/i.test(privacySql));
assert('privacy SQL keeps NEW4-5A workshop-only authenticated path',
  /p_policy_type IS DISTINCT FROM 'workshop_custom'/.test(privacySql));

assert('policy title bumped', /개인정보 처리방침 \(Metalora Legal v26\.10\.10\)/.test(policies));
assert('cookie policy version unchanged', /쿠키 정책 \(Metalora Cookie Policy v26\.10\.07\)/.test(policies));
assert('Supabase no longer stores Workshop images',
  /WORKSHOP 이미지 파일은 여기에 저장하지 않습니다/.test(policies)
  && !/WORKSHOP 이미지 저장/.test(policies));
assert('obsolete CDN cache wording removed',
  !/전송망\(CDN\)/.test(policies)
  && !/약 1시간/.test(policies)
  && !/Supabase 저장소 전송망/.test(policies)
  && !/공개 전 확인 필요/.test(policies));
assert('GCS private Seoul storage present',
  /Google Cloud Storage/.test(policies)
  && /WORKSHOP 원본·미리보기 이미지의 비공개 보관/.test(policies)
  && /보관 위치는 대한민국\(서울\)입니다/.test(policies));
assert('no internal storage identifiers in privacy copy',
  !/metalora-workshop-apne3/.test(policies)
  && !/_Default/.test(policies)
  && !/_Required/.test(policies)
  && !/workshop-media-signer/.test(policies));
assert('application logs Oregon 30 days',
  /미국 \(오리건, Google Cloud us-west1 리전\)/.test(policies)
  && /애플리케이션·서비스 운영 기록은 30일/.test(policies));
assert('required logs global ~400 days not single-region',
  /Google이 요구하는 감사·시스템 기록은 global 위치로 관리되어 특정 단일 리전에 한정되지 않으며 약 400일 보관됩니다/.test(policies));
assert('does not claim all logs are worldwide-stored', !/전 세계에 보관됩니다/.test(policies));
assert('Discord payment-frozen wording preserved',
  /현재 공개 결제는 준비 중이어서, 공개 결제가 시작되기 전에는 주문 승인 알림이 생기지 않습니다/.test(policies));
assert('origin hold unchanged', NOTICE_REVIEW_PENDING === '심의 예정' && /NOTICE_REVIEW_PENDING/.test(notice));
assert('no forbidden origin claims in privacy',
  !/대한민국산|한국산|국내산|Made in Korea|Product of Korea|원산지 대한민국|제조국 대한민국/.test(policies));
assert('payment freeze unchanged', PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true && /PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true/.test(freeze));
assert('leftover-ref caveat present', /그 위치만으로는 이미지를 다시 열 수 없습니다/.test(policies));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
