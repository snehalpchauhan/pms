# Notifications Implementation Checklist (PMS-Vnnovate)

## 1) Data Model

- [ ] Create `notifications` table
  - [ ] `id`
  - [ ] `userId` (recipient)
  - [ ] `type` (event type)
  - [ ] `title`
  - [ ] `message`
  - [ ] `entityType` (`task`/`comment`/`project`/`timecard`/`document`/`credential`)
  - [ ] `entityId`
  - [ ] `projectId` (nullable)
  - [ ] `channelId` (nullable)
  - [ ] `actorUserId`
  - [ ] `priority` (`low`/`normal`/`high`)
  - [ ] `meta` (jsonb)
  - [ ] `readAt` (nullable)
  - [ ] `createdAt`
- [ ] Optional: create `notification_preferences` table
  - [ ] per-event toggles
  - [ ] email in/out
  - [ ] digest frequency

---

## 2) API Endpoints

- [ ] `GET /api/notifications`
- [ ] `GET /api/notifications/unread-count`
- [ ] `PATCH /api/notifications/:id/read`
- [ ] `POST /api/notifications/mark-all-read`
- [ ] Optional: `PATCH /api/notification-preferences`

---

## 3) Recipient Rules

- [ ] Exclude actor from own notification by default
- [ ] Enforce project membership and visibility before delivery
- [ ] Enforce client-safe filtering (clients must not get internal/security notifications)
- [ ] Enforce credential/document visibility rules
- [ ] Respect `notifyClientNewTask` for client-activity staff notifications

---

## 4) Event Map (Core)

### Tasks
- [ ] `task_assigned`
- [ ] `task_unassigned`
- [ ] `task_status_changed`
- [ ] `task_due_date_changed`
- [ ] `task_due_soon`
- [ ] `task_overdue`
- [ ] `task_comment_added`
- [ ] `task_comment_reply`

### Client Activity
- [ ] `client_task_created`
- [ ] `client_task_reopened` (request revision)
- [ ] `client_task_updated` (optional)

### Project & Access
- [ ] `project_member_added`
- [ ] `project_member_removed`
- [ ] `project_owner_transferred`
- [ ] `project_member_permission_changed`

### Documents/Credentials
- [ ] `project_document_uploaded`
- [ ] `project_document_deleted`
- [ ] `project_document_visibility_changed`
- [ ] `project_credential_created`
- [ ] `project_credential_updated`
- [ ] `project_credential_deleted`
- [ ] `project_credential_visibility_changed`
- [ ] `project_credential_revealed` (admin/owner audit stream)

### Timecards
- [ ] `timecard_entry_submitted`
- [ ] `timecard_entry_updated`
- [ ] `timecard_entry_deleted`
- [ ] `timecard_missing_reminder`
- [ ] `timecard_weekly_summary_ready`
- [ ] `timecard_client_visible_update` (optional)

---

## 5) Role/Group Matrix Validation

- [ ] Admin receives security/access and summary notifications
- [ ] Project Owner receives all project operational + client activity + timecard updates
- [ ] Manager/member receives assignment/comment/status/due + opted-in client activity
- [ ] Task assignee receives assignment/status/due/comment/checklist-related notifications
- [ ] Client receives only client-safe task notifications

---

## 6) Realtime + UI

- [ ] Bell badge wired to unread count API
- [ ] Notifications list wired to API (replace mock data)
- [ ] Mark read on click
- [ ] Mark all read action
- [ ] Deep-link navigation from notification to entity page
- [ ] Realtime push for new notifications (websocket event)

---

## 7) Timecard Scheduler Hooks

- [ ] Daily reminder job for missing entries
- [ ] Weekly summary generation + notifications
- [ ] Link with existing timecard email summary recipients

---

## 8) QA Checklist

- [ ] Actor exclusion works
- [ ] Client cannot receive internal events
- [ ] Visibility-protected docs/credentials only notify allowed users
- [ ] Due-soon/overdue logic tested with timezone
- [ ] Read/unread count stays consistent
- [ ] Realtime and refresh states match
- [ ] Notification links open correct page/tab/item

---

## 9) Rollout

- [ ] Add DB migration
- [ ] Backfill strategy (if needed)
- [ ] Feature flag (optional)
- [ ] Monitor notification volume/errors
- [ ] Enable email channel after in-app is stable
