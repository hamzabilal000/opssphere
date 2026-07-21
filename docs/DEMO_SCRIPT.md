# OpsSphere demo script

A guided walkthrough hitting one representative feature from each build day, in an order that flows
as a single story rather than a disconnected feature list. Takes about 15-20 minutes end to end.
Assumes `pnpm docker:up` and `pnpm dev` are already running (see the README).

Two browser windows are worth having open from the start - a normal window and a private/incognito
one - for the real-time and multi-account moments called out below.

## Part 1 - Getting in the door (Days 1-3)

1. Open http://localhost:5173 - the registration page. Register a new account (any email works;
   Mailpit at http://localhost:8025 catches the verification email since there's no real SMTP in
   development).
2. Open the Mailpit inbox, click the verification email, click the link. **Day 2**: email
   verification, hashed one-time tokens.
3. Log in. **Day 3**: this session is now backed by a 15-minute access token and a 30-day refresh
   token - visit Sessions in the sidebar to see this device listed, with a "revoke" option for any
   OTHER session (not this one).

## Part 2 - An organization, roles, and people (Days 4-5, 15)

4. Create an organization from the Overview page. **Day 4**: this is a fully isolated tenant - no
   other organization's data is visible from here, ever.
5. Open the organization's Roles panel. Point out that Owner/Member are system roles with editable
   PERMISSIONS (not names) - toggle a permission on Member and back off. **Day 5 + the post-Day-11
   role-editing fix**.
6. Invite a second email address (use a real one you can check, or another Mailpit-catchable
   address). Accept it in the private/incognito window. **Day 15**: if you invite an email that
   ALREADY has an OpsSphere account (try inviting the account you registered in step 1 into a SECOND
   organization), the acceptance page skips the password step entirely and just asks you to confirm
   you're logged in as the right account.

## Part 3 - Real project work (Days 6-9, 14)

7. Create a Project inside the organization. **Day 7**.
8. Open its Board and add 3-4 tasks. **Day 8**: drag a card between columns - notice it's blocked
   with a clear error if you try to mark a task "Done" while it still has an open subtask.
9. Drag a card and drop it directly ON another card in the same column (not into the empty space
   below). **Day 14**: it lands in that exact slot, not just at the end of the column - the
   surrounding cards shift to make room.
10. Open a task, add a comment mentioning the second account by exact email
    (`@person@example.com`). With BOTH browser windows open on the same board, watch it appear live
    in the other window with no refresh. **Day 9**.

## Part 4 - The features under the main board (Days 10-12)

11. Add a dependency between two tasks and try marking the dependent one "Done" first - blocked,
    same as the subtask rule. Add a checklist item and toggle it. **Day 11**.
12. Open the Risk Register from the project's header, add a risk, and watch its score compute
    automatically from likelihood x impact. **Day 11**.
13. Upload a real file to a task (not just a link) - open the MinIO console
    (http://localhost:9001) and find it sitting in the bucket. **Day 12**.
14. Open Tickets from the sidebar (organization-level, not tied to any one project) and file one as
    the second account. **Day 10**.

## Part 5 - Things you don't see happening (Day 13, 16)

15. Leave the tab open and idle for over 15 minutes, then click around again - no forced re-login.
    **Day 13**: the access token silently refreshed in the background using the 30-day refresh
    token.
16. (Optional, needs a terminal) Fire 20+ rapid failed login attempts at the same account and watch
    the 21st get rejected with a `RATE_LIMITED` response instead of the usual "wrong password."
    **Day 16**.

## Part 6 - Staying in the loop (Day 17)

17. With both windows open (different accounts), have one account mention or assign a task to the
    other. Watch the bell icon in the OTHER window's Topbar light up with an unread badge, live, with
    no refresh. Click it - it marks read and jumps straight to the board. **Day 17**.
18. Press Cmd+K (Mac) or Ctrl+K (everyone else) anywhere in the app, type a few letters of the
    organization or project name, press Enter. **Day 17**.

## Wrapping up

That's every day's headline feature touched at least once, in an order that tells a coherent story:
sign up → build a team → build a project → do the actual work → get notified about it → do it all
again without logging back in every 15 minutes. See `docs/PROJECT_HANDOFF.md` for the technical
detail behind any of these, and `docs/learning-notes/` for a plain-language explanation of exactly
how each one works.
