# NEW3-4 — Admin CS management rebuild

Status: **READY FOR NEW3-4 RE-QA**

Date: 2026-10-05

Decision: `/admin/cs` is an operational inquiry queue. It uses live `cs_inquiries` columns only. Customer `InquiryModal` is untouched. Schema is unchanged. No production data migration.

## Actual stored columns

`id`, `user_id`, `title`, `content`, `answer`, `status`, `created_at`.

Not present: name, email, phone, category, `answered_at`, `updated_at`. Those are not displayed or written.

## Stored status → UI classification

| Stored value | Source | UI class | UI label |
|---|---|---|---|
| `pending` | customer insert (`InquiryModal`) | pending | 미답변 |
| `답변대기` | table default | pending | 미답변 |
| `답변완료` | admin answer save | answered | 답변완료 |
| any other / empty | unknown/legacy | unknown | 알 수 없는 상태 |

Unknown rows stay visible in 전체. They are not treated as answered. They are not auto-mutated.

## Searchable fields

`title`, `content`. Applied before count/range. Email/phone are not searched (not on the table). Member username is not a CS column and is not searched.

## Member/author label

Optional display only: one batched `profiles(id, user_custom_id)` lookup for the current page’s `user_id`s. If missing, truncated `user_id`. Lookup failure does not fail the inquiry list.

## Pagination

Page size 25. PostgREST `range` + `count: exact`. Search/status filters apply first. Previous/next. Page resets on search/filter change.

## Async load generation

Latest-request-wins generation on list loads (search/filter/page/retry). Unmount invalidates in-flight loads. Successful answer save updates the open inquiry, invalidates stale list work, and starts one fresh authoritative list reload. Only that newest generation may set `loadState` to ready/error. A failed reload does not undo the saved DB answer; retry remains available. Save failure does not change generation or reload.

## Answer save contract

Writes only `answer` and `status`. Answered stored status is `답변완료` (existing customer/admin contract). No timestamp write (no such column).

- pending (`pending` or `답변대기`): non-empty answer → save `answer` + `status=답변완료`. CTA: 답변 저장.
- answered (`답변완료`): same fields may be updated. Status remains `답변완료`. CTA: 답변 수정 저장.
- unknown: read-only. No answer/status mutation.

Empty/whitespace answers are rejected. Duplicate submit is disabled while saving. Failure keeps the draft and does not show success.

## Detail dialog scroll

Desktop dialog is content-fit (`md:h-auto`) up to `max-h-[calc(100dvh-2rem)]`. It does not force nearly full viewport height for short inquiries. Body owns overflow: `overflow-y-auto`, with an independent desktop cap `md:max-h-[calc(100dvh-8rem)]` so long content scrolls even when the dialog is content-sized. Header stays `shrink-0`. Scrollbar appears only when content overflows. Mobile remains near-full-height (`h-full` / `100dvh`) with `flex-1 min-h-0` body scroll. Answer textarea, notice, and 답변 저장 stay inside the body.

## External notification

**Not implemented.** Alimtalk / 알림톡 / email / SMS claims and copy are removed. Save means DB persist only.

## Do Not Do

- Do not edit `src/components/InquiryModal.tsx` or other preserved WIP.
- Do not change `cs_inquiries` schema.
- Do not migrate live status values in this ticket.
- Do not mutate production during implementation.
- Do not commit / deploy from this ticket.
