import type { Express, Request, Response, NextFunction } from "express";
import * as client from "openid-client";
import { storage } from "./storage";
import type { CompanySettings } from "@shared/schema";

const oidcConfigCache = new Map<string, Promise<client.Configuration>>();

export function clearMicrosoftOidcCache() {
  oidcConfigCache.clear();
}

export function getPublicAppUrl(req: Request): string {
  const fromEnv = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0]!.trim();
  const host = (req.get("x-forwarded-host") || req.get("host") || "localhost:5000").split(",")[0]!.trim();
  return `${proto}://${host}`;
}

/** Environment variable wins over database when both are set. */
export function resolveMs365ClientSecret(settings: CompanySettings): string | undefined {
  const env = process.env.MS365_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;
  if (env?.trim()) return env.trim();
  return settings.ms365ClientSecret?.trim() || undefined;
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
  const cacheKey = `${tenantId}:${clientId}:${redirectUri}`;
  let pending = oidcConfigCache.get(cacheKey);
  if (!pending) {
    pending = client.discovery(
      new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`),
      clientId,
      { redirect_uris: [redirectUri] },
      client.ClientSecretPost(clientSecret),
    );
    oidcConfigCache.set(cacheKey, pending);
  }
  return pending;
}

function loginErrorRedirect(req: Request, code: string) {
  const base = getPublicAppUrl(req);
  return `${base}/?microsoft_error=${encodeURIComponent(code)}`;
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

      const codeVerifier = req.session.msPkceVerifier;
      const expectedState = req.session.msOAuthState;
      const expectedNonce = req.session.msOAuthNonce;
      delete req.session.msPkceVerifier;
      delete req.session.msOAuthState;
      delete req.session.msOAuthNonce;

      if (!codeVerifier || expectedState === undefined || expectedNonce === undefined) {
        return res.redirect(302, loginErrorRedirect(req, "session_lost"));
      }

      const callbackUrl = new URL(req.originalUrl, `${getPublicAppUrl(req)}/`);

      let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
      try {
        tokens = await client.authorizationCodeGrant(config, callbackUrl, {
          pkceCodeVerifier: codeVerifier,
          expectedState,
          expectedNonce,
        });
      } catch {
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
