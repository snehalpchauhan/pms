# TaskFlow - Project Management Application

## Overview

TaskFlow is a full-stack project management tool built for developers and clients. It provides Kanban boards, task management with checklists and attachments, team collaboration with messaging channels, calendar views, time tracking with timecards, and role-based access control (admin, manager, employee, client). The app uses a monorepo structure with a React frontend and Express backend, backed by PostgreSQL.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
The project follows a three-directory monorepo pattern:
- `client/` — React SPA (Single Page Application)
- `server/` — Express API server
- `shared/` — Shared types and database schema (used by both client and server)

### Frontend Architecture
- **Framework**: React with TypeScript (no SSR, `rsc: false`)
- **Styling**: Tailwind CSS v4 with CSS variables for theming, using the `@tailwindcss/vite` plugin
- **UI Components**: shadcn/ui (new-york style) with Radix UI primitives. Components live in `client/src/components/ui/`. The shadcn config aliases `@/` to `client/src/`.
- **State Management**: TanStack React Query for server state; React Context for auth (`useAuth`) and shared app data (`useAppData`)
- **Drag & Drop**: `@dnd-kit/core` and `@dnd-kit/sortable` for Kanban board interactions
- **Routing**: No client-side router — the app uses a view-switching state pattern (`currentView` state in `App.tsx`) rather than URL-based routing
- **Fonts**: Inter (UI), Space Grotesk (headers), JetBrains Mono (code/technical elements) loaded from Google Fonts

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript, executed via `tsx` in development
- **API Pattern**: RESTful JSON API under `/api/` prefix. All routes require authentication via `requireAuth` middleware.
- **Authentication**: Passport.js with Local Strategy, session-based auth stored in PostgreSQL via `connect-pg-simple`. Sessions last 30 days.
- **Build**: Vite builds the client; esbuild bundles the server. The build script (`script/build.ts`) bundles select server dependencies to reduce cold start times.

### Database
- **Database**: PostgreSQL (required, uses `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `drizzle-kit` for migrations
- **Schema location**: `shared/schema.ts` — defines all tables including users, projects, project_members, tasks, task_assignees, checklist_items, attachments, comments, channels, channel_members, messages
- **Schema push**: Use `npm run db:push` (runs `drizzle-kit push`) to sync schema to database
- **Key tables and relationships**:
  - `users` — roles: admin, manager, employee, client. Passwords stored in plaintext (demo/seed data only).
  - `projects` — has JSONB `columns` field for Kanban column configuration
  - `tasks` — belongs to project, has status/priority/tags/dates, JSONB `recurrence` field
  - `projectMembers`, `taskAssignees`, `channelMembers` — many-to-many join tables with composite primary keys
  - `channels` — messaging channels tied to projects
  - `messages` — belongs to channel and user
  - `checklistItems`, `attachments`, `comments` — belong to tasks
  - `session` — auto-created by connect-pg-simple for session storage

### Storage Layer
- `server/storage.ts` defines an `IStorage` interface and a `DatabaseStorage` class that implements all data access methods using Drizzle ORM queries
- All database operations go through this storage abstraction

### Seeding
- `server/seed.ts` auto-seeds the database on first run (when no users exist) with demo users (admin/manager/employee), sample projects, tasks, channels, and messages

### Development vs Production
- **Development**: Vite dev server with HMR proxied through Express (`server/vite.ts`). Run with `npm run dev`.
- **Production**: Client built to `dist/public/`, server bundled to `dist/index.cjs`. Static files served by Express (`server/static.ts`). Run with `npm run build && npm start`.

### Path Aliases
- `@/` → `client/src/` (for frontend imports)
- `@shared/` → `shared/` (for shared schema/types)
- `@assets/` → `attached_assets/` (for static assets)

## External Dependencies

### Required Services
- **PostgreSQL**: Required. Connection via `DATABASE_URL` environment variable. Used for all data storage and session management.

### Key NPM Dependencies
- **Server**: express, passport, passport-local, express-session, connect-pg-simple, drizzle-orm, pg, zod, date-fns
- **Client**: react, @tanstack/react-query, @dnd-kit/core, @dnd-kit/sortable, react-day-picker, date-fns, cmdk, embla-carousel-react, recharts
- **Shared**: drizzle-orm, drizzle-zod, zod
- **Build tools**: vite, esbuild, tsx, drizzle-kit, tailwindcss

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `SESSION_SECRET` — Session encryption key (optional, has a default fallback)