import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import * as client from "openid-client";
import { storage } from "./storage";
import type { CompanySettings } from "@shared/schema";

const oidcConfigCache = new Map<string, Promise<client.Configuration>>();
let warnedMissingPublicAppUrl = false;

function oidcCacheSecretPart(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 16);
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export function clearMicrosoftOidcCache() {
  oidcConfigCache.clear();
}

export function getPublicAppUrl(req: Request): string {
  const fromEnv = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production" && !warnedMissingPublicAppUrl) {
    warnedMissingPublicAppUrl = true;
    console.warn(
      "[ms365 OAuth] PUBLIC_APP_URL is unset in production; redirect_uri is inferred from proxy headers. Set PUBLIC_APP_URL=https://pms.vnnovate.net (your real host) to avoid Microsoft token errors.",
    );
  }
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0]!.trim();
  const host = (req.get("x-forwarded-host") || req.get("host") || "localhost:5000").split(",")[0]!.trim();
  return `${proto}://${host}`;
}

function normalizeClientSecret(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.replace(/^\uFEFF/, "").trim().replace(/\r/g, "");
  return t || undefined;
}

/** Environment variable wins over database when both are set. */
export function resolveMs365ClientSecret(settings: CompanySettings): string | undefined {
  const env = normalizeClientSecret(process.env.MS365_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET);
  if (env) return env;
  return normalizeClientSecret(settings.ms365ClientSecret ?? undefined);
}

export function ms365ClientSecretFromEnv(): boolean {
  return Boolean((process.env.MS365_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET)?.trim());
}

export function ms365FullyConfigured(settings: CompanySettings): boolean {
  return Boolean(
    settings.ms365Enabled &&
      settings.ms365TenantId?.trim() &&
      settings.ms365ClientId?.trim() &&
      resolveMs365ClientSecret(settings),
  );
}

export function parseAllowedDomains(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function emailAllowedForDomains(email: string, domains: string[]): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domains.includes(domain);
}

function getEmailFromClaims(claims: Record<string, unknown> | undefined): string | null {
  if (!claims) return null;
  const email = claims.email ?? claims.preferred_username ?? claims.upn;
  if (typeof email === "string" && email.includes("@")) return email.trim();
  return null;
}

async function getOidcConfiguration(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<client.Configuration> {
  const usePost = process.env.MS365_TOKEN_AUTH?.toLowerCase() === "post";
  const authTag = usePost ? "post" : "basic";
  const cacheKey = `${tenantId}:${clientId}:${redirectUri}:${oidcCacheSecretPart(clientSecret)}:${authTag}`;
  let pending = oidcConfigCache.get(cacheKey);
  if (!pending) {
    const clientAuth = usePost
      ? client.ClientSecretPost(clientSecret)
      : client.ClientSecretBasic(clientSecret);
    pending = client.discovery(
      new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`),
      clientId,
      { redirect_uris: [redirectUri] },
      clientAuth,
    );
    oidcConfigCache.set(cacheKey, pending);
  }
  return pending;
}

function safeOauthHint(raw: string | undefined): string | undefined {
  if (!raw || !/^[a-z0-9_.-]+$/i.test(raw)) return undefined;
  return raw.slice(0, 80);
}

function loginErrorRedirect(req: Request, code: string, extra?: Record<string, string>) {
  const base = getPublicAppUrl(req).replace(/\/$/, "");
  const u = new URL(`${base}/`);
  u.searchParams.set("microsoft_error", code);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) u.searchParams.set(k, v);
    }
  }
  return u.href;
}

/** Callback URL for openid-client: canonical redirect_uri origin + query from this request (avoids broken req.originalUrl behind some proxies). */
function buildOAuthCallbackUrl(req: Request, redirectUri: string): URL {
  const url = new URL(redirectUri);
  const pathAndQuery = req.url || "";
  const q = pathAndQuery.includes("?") ? pathAndQuery.slice(pathAndQuery.indexOf("?") + 1) : "";
  url.search = q;
  return url;
}

export function registerMicrosoftAuth(app: Express) {
  app.get("/api/auth/login-config", async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getCompanySettings();
      const ms365Enabled = ms365FullyConfigured(settings);
      const domains = parseAllowedDomains(settings.ms365AllowedDomains);
      res.json({
        ms365Enabled,
        showMicrosoftButton: ms365Enabled && domains.length > 0,
      });
    } catch {
      res.json({ ms365Enabled: false, showMicrosoftButton: false });
    }
  });

  app.get("/api/auth/microsoft", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await storage.getCompanySettings();
      if (!settings.ms365Enabled) {
        return res.redirect(302, loginErrorRedirect(req, "disabled"));
      }
      const tenantId = settings.ms365TenantId?.trim();
      const clientId = settings.ms365ClientId?.trim();
      const clientSecret = resolveMs365ClientSecret(settings);
      const domains = parseAllowedDomains(settings.ms365AllowedDomains);
      if (!tenantId || !clientId || !clientSecret) {
        return res.redirect(302, loginErrorRedirect(req, "not_configured"));
      }
      if (domains.length === 0) {
        return res.redirect(302, loginErrorRedirect(req, "no_domains"));
      }

      const redirectUri = `${getPublicAppUrl(req)}/api/auth/microsoft/callback`;
      const config = await getOidcConfiguration(tenantId, clientId, clientSecret, redirectUri);

      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();
      const nonce = client.randomNonce();

      req.session.msPkceVerifier = codeVerifier;
      req.session.msOAuthState = state;
      req.session.msOAuthNonce = nonce;

      const redirectTo = client.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: "openid profile email offline_access",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        nonce,
      });

      await saveSession(req);
      res.redirect(302, redirectTo.href);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/auth/microsoft/callback", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await storage.getCompanySettings();
      if (!settings.ms365Enabled) {
        return res.redirect(302, loginErrorRedirect(req, "disabled"));
      }
      const tenantId = settings.ms365TenantId?.trim();
      const clientId = settings.ms365ClientId?.trim();
      const clientSecret = resolveMs365ClientSecret(settings);
      const domains = parseAllowedDomains(settings.ms365AllowedDomains);
      if (!tenantId || !clientId || !clientSecret || domains.length === 0) {
        return res.redirect(302, loginErrorRedirect(req, "not_configured"));
      }

      const redirectUri = `${getPublicAppUrl(req)}/api/auth/microsoft/callback`;
      const config = await getOidcConfiguration(tenantId, clientId, clientSecret, redirectUri);

      const msAuthError = typeof req.query.error === "string" ? req.query.error : null;
      if (msAuthError) {
        const desc =
          typeof req.query.error_description === "string" ? req.query.error_description : "";
        console.error("[ms365 OAuth] Microsoft returned error:", msAuthError, desc);
        delete req.session.msPkceVerifier;
        delete req.session.msOAuthState;
        delete req.session.msOAuthNonce;
        await saveSession(req);
        return res.redirect(302, loginErrorRedirect(req, "ms_oauth_error"));
      }

      const codeVerifier = req.session.msPkceVerifier;
      const expectedState = req.session.msOAuthState;
      const expectedNonce = req.session.msOAuthNonce;
      delete req.session.msPkceVerifier;
      delete req.session.msOAuthState;
      delete req.session.msOAuthNonce;

      if (!codeVerifier || expectedState === undefined || expectedNonce === undefined) {
        return res.redirect(302, loginErrorRedirect(req, "session_lost"));
      }

      const callbackUrl = buildOAuthCallbackUrl(req, redirectUri);
      if (!callbackUrl.searchParams.get("code") && !callbackUrl.searchParams.get("error")) {
        console.error("[ms365 OAuth] callback has no code or error query param.", {
          reqUrl: req.url,
          originalUrl: req.originalUrl,
          redirectUri,
        });
      }

      let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
      try {
        tokens = await client.authorizationCodeGrant(config, callbackUrl, {
          pkceCodeVerifier: codeVerifier,
          expectedState,
          expectedNonce,
        });
      } catch (err) {
        console.error("[ms365 OAuth] authorizationCodeGrant failed:", err);
        if (err instanceof client.ResponseBodyError) {
          const hint = safeOauthHint(err.error);
          console.error("[ms365 OAuth] token endpoint:", err.error, err.error_description);
          return res.redirect(
            302,
            loginErrorRedirect(req, "oauth_failed", hint ? { ms_oauth_hint: hint } : undefined),
          );
        }
        if (err instanceof client.AuthorizationResponseError) {
          const hint = safeOauthHint(err.error ?? undefined);
          console.error("[ms365 OAuth] authorize callback:", err.error, err.error_description);
          return res.redirect(
            302,
            loginErrorRedirect(req, "oauth_failed", hint ? { ms_oauth_hint: hint } : undefined),
          );
        }
        return res.redirect(302, loginErrorRedirect(req, "oauth_failed"));
      }

      const claims = tokens.claims() as Record<string, unknown> | undefined;
      const email = getEmailFromClaims(claims);
      if (!email) {
        return res.redirect(302, loginErrorRedirect(req, "no_email"));
      }
      if (!emailAllowedForDomains(email, domains)) {
        return res.redirect(302, loginErrorRedirect(req, "domain_not_allowed"));
      }

      const user = await storage.getUserByEmailIgnoreCase(email);
      if (!user) {
        return res.redirect(302, loginErrorRedirect(req, "no_account"));
      }
      if (user.role !== "employee" && user.role !== "manager") {
        return res.redirect(302, loginErrorRedirect(req, "wrong_role"));
      }

      req.login(user, (err) => {
        if (err) return next(err);
        res.redirect(302, `${getPublicAppUrl(req)}/`);
      });
    } catch (err) {
      next(err);
    }
  });
}
