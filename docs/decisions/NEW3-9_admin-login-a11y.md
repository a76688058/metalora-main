# NEW3-9 — Admin login accessibility cleanup

Status: **READY FOR NEW3-9 QA**

Date: 2026-10-06

Decision: `/admin/login` keeps the existing email/password flow, errors, loading, submit, and redirect. This ticket only associates labels, sets autocomplete, and exposes error/loading to assistive tech. Auth logic is unchanged.

## Label / input association

- 이메일 → `htmlFor` / `id="admin-login-email"`
- 비밀번호 → `htmlFor` / `id="admin-login-password"`

Visible labels remain. Placeholders are not the only accessible name.

## Autocomplete

- email: `autocomplete="username"`
- password: `autocomplete="current-password"`

`type="email"` and `type="password"` are unchanged. Password managers are not suppressed. Password has `spellCheck={false}`.

## Form semantics

Existing `<form onSubmit={handleLogin}>` is kept. Submit control remains `type="submit"`. `required` is unchanged. `disabled={isLoading}` still blocks duplicate submit. No custom Enter handler was added.

## Error / loading

Login errors use `role="alert"` and `id="admin-login-error"`. Both fields point at it with `aria-describedby` / `aria-invalid` only while an error is shown. The submit button uses `aria-busy` while `로그인 중...` is visible. No extra `aria-live` region.

## Auth logic

Unchanged: `signInWithPassword`, profile `is_admin` check, member-session preservation, `refreshProfile`, toast, `/admin` redirect.

## Visual layout

Unchanged centered `max-w-md` card.

## Do Not Do

- Do not edit preserved WIP, Header, AdminLayout, or member login.
- Do not rewrite auth or admin authorization.
- Do not commit / deploy / mutate production.
