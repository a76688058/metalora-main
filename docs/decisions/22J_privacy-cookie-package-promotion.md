# 22J privacy / cookie package promotion

Status: DONE

#22J: PRODUCTION VERIFIED

Official #22 stage status is recorded in `docs/METALORA_PROJECT_STATE.md` (**CLOSED**). This note remains the #22J promotion evidence; it does not reopen #22.

Decision: Exact tested candidate `metalora-direct-00090-kig` was promoted to production 100% by a TRAFFIC-ONLY update via `scripts/promote-candidate.ps1`. No rebuild. No new revision. No `--to-latest`. Official-host #22J-8 GA/consent smoke PASS. The #22J production package is live and production verified.

Completed:
- Production: `metalora-direct-00090-kig` @100%
- Source: `0bb40e988a019716e748d12874693c247bfc410f`
- Digest: `sha256:d45a463cc1ec05957c4064b4b2b2bc697161462c8823459115fe8607fea619c9`
- Previous production / stable rollback: `metalora-direct-00087-voy`
- Promotion method: traffic-only to existing candidate revision

Official-host GA consent (`https://metalora.art`):
- `accepted`: `gtag.js?id=G-T2FFXETHTZ` loaded; GA4 `page_view` observed; analytics storage granted; ads storage remained denied; supporting evidence `gcs=G101`
- `accepted` → `essential_only`: same SPA session produced no further normal GA measurement after revoke
- `essential_only` + hard reload: no `gtag.js`; no GA measurement traffic; GA loader marker (`data-metalora-ga4`) absent
- Re-accept: GA activated again (`gtag.js` + `page_view`, `gcs=G101`)
- Existing analytics cookies such as `_ga` and `_ga_T2FFXETHTZ` MAY remain after switching to `essential_only`. Cookie deletion was not claimed and was not verified. The verified privacy guarantee is that new analytics collection stops under `essential_only`.

Official production smoke PASS:
- `/api/health` PASS (`{"status":"ok"}`)
- official `metalora.art` app PASS
- Privacy / Cookie **v26.09.19** live
- Footer `쿠키 설정` live
- official robots behavior PASS (`Allow: /` + sitemap; no `X-Robots-Tag` on official HTML)
- official vs run.app noindex split PASS (run.app `X-Robots-Tag: noindex, nofollow`)
- run.app host GA gate PASS (`accepted` on `*.run.app` loads no production `gtag.js` / collect)
- responsive 390 smoke PASS (`overflowX=false`)

LEGAL SPECIALIST FOLLOW-UP: DEFERRED

Unresolved; do not conclude:
- PIPA Art.28-8 applicability
- direct collection characterization
- Art.26 entrustment characterization
- exact Google legal entity if later required
- relevant country/countries if later required
- exact statutory basis if later required

A5 MINOR STATUS: ACCEPTED / NON-BLOCKING

These are not current production blockers and were not fixed in #22J:
1. `aria-modal="true"` without inerting background
2. PolicyModal / cookie-settings Escape stacking nuance
3. Privacy retention skim-read ambiguity
4. initial mobile X labelled close while applying `essential_only`
5. inline Cookie Policy tap target smaller than primary buttons

Pre-existing / non-blocking: login overlay still does not close on Escape.

Do Not Do:
- Do not rebuild or `--to-latest` to “refresh” this promotion
- Do not retag `stable` away from `metalora-direct-00087-voy`
- Do not state Google = Art.26 수탁자
- Do not state Google = Art.28-8 국외이전 수령자
- Do not state that browser-direct GA definitely is, or definitely is not, 국외이전
- Do not state that separate overseas-transfer consent is definitely required
- Do not state that a legal specialist approved current wording
- Do not claim analytics cookies are deleted on revoke
- Do not grant `ad_storage`
- Do not reopen #22 to resolve deferred legal classification

Resume Condition: None for #22J. Legal specialist follow-up remains DEFERRED and separately ticketed if counsel is available.

Resume Procedure: Keep rollback target `metalora-direct-00087-voy`. Official-host GA checks already done for this SHA; do not repeat unless source or consent contract changes.

Ownership: A6

Relevant Files: `scripts/promote-candidate.ps1`, `src/lib/ga4.ts`, `src/components/CookieBanner.tsx`, `src/components/Footer.tsx`, `src/constants/policies.tsx`
