import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import { type User } from "@shared/schema";
import session from "express-session";
import type { Express } from "express";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { ms365FullyConfigured } from "./microsoftAuth";

declare module "express-session" {
  interface SessionData {
    msPkceVerifier?: string;
    msOAuthState?: string;
    msOAuthNonce?: string;
  }
}

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      password: string;
      name: string;
      role: string;
      avatar: string | null;
      status: string | null;
      email: string | null;
      lastSeenAt?: Date | null;
      /** jsonb from DB; runtime is number[] | null */
      projectSidebarOrder?: unknown;
      projectQuickMenuIds?: unknown;
    }
  }
}

export function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export function setupAuth(app: Express) {
  const PgSession = connectPg(session);

  const sessionStore = new PgSession({
    pool: pool,
    tableName: "session",
    createTableIfMissing: true,
  });

  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || "project-management-secret-key-2026",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }
        if (user.password !== password) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || undefined);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: { message: string }) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Login failed" });

      void (async () => {
        try {
          const settings = await storage.getCompanySettings();
          if (ms365FullyConfigured(settings) && (user.role === "employee" || user.role === "manager")) {
            return res.status(403).json({
              message:
                "Microsoft sign-in is required for employees and managers. Use the Sign in with Microsoft button.",
            });
          }
          req.logIn(user, async (loginErr) => {
            if (loginErr) return next(loginErr);
            try {
              await storage.updateUser(user.id, { status: "online", lastSeenAt: new Date() });
            } catch {
              /* non-fatal */
            }
            const fresh = (await storage.getUser(user.id)) ?? user;
            const { password, ...safeUser } = fresh;
            return res.json(safeUser);
          });
        } catch (e) {
          next(e);
        }
      })();
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    const uid = req.user?.id as number | undefined;
    req.logout(async (err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      if (uid != null) {
        try {
          await storage.updateUser(uid, { status: "offline", lastSeenAt: null });
        } catch {
          /* non-fatal */
        }
      }
      res.json({ message: "Logged out" });
    });
  });

  app.post("/api/auth/presence", requireAuth, async (req, res) => {
    const u = req.user as Express.User;
    try {
      await storage.updateUser(u.id, { lastSeenAt: new Date(), status: "online" });
    } catch {
      return res.status(500).json({ message: "Presence update failed" });
    }
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password, ...safeUser } = req.user;
    return res.json(safeUser);
  });
}
