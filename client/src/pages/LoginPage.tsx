import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LogIn, Lock, Loader2 } from "lucide-react";

const MICROSOFT_ERROR_MESSAGES: Record<string, string> = {
  disabled: "Microsoft sign-in is turned off. Use username and password.",
  not_configured: "Microsoft sign-in is not fully configured yet. Use username and password or contact an administrator.",
  no_domains: "Allowed email domains are not set. An administrator must add domains in Company Settings.",
  session_lost: "Sign-in session expired. Please try Microsoft sign-in again.",
  oauth_failed: "Microsoft sign-in was cancelled or failed. Try again.",
  no_email: "Microsoft did not return an email address for your account.",
  domain_not_allowed: "Your Microsoft account is not from an allowed organization domain.",
  no_account: "No workspace user matches this Microsoft email. Ask an administrator to add you with this email.",
  wrong_role: "Microsoft sign-in here is only for employees and managers. Use username and password for other accounts.",
};

type LoginConfig = {
  ms365Enabled: boolean;
  showMicrosoftButton: boolean;
};

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loginConfig, setLoginConfig] = useState<LoginConfig>({
    ms365Enabled: false,
    showMicrosoftButton: false,
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/login-config")
      .then((r) => r.json())
      .then((data: LoginConfig) => {
        setLoginConfig({
          ms365Enabled: Boolean(data.ms365Enabled),
          showMicrosoftButton: Boolean(data.showMicrosoftButton),
        });
      })
      .catch(() => {
        setLoginConfig({ ms365Enabled: false, showMicrosoftButton: false });
      })
      .finally(() => setConfigLoaded(true));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("microsoft_error");
    if (!code) return;
    setError(MICROSOFT_ERROR_MESSAGES[code] ?? "Microsoft sign-in failed.");
    const url = new URL(window.location.href);
    url.searchParams.delete("microsoft_error");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }
    setIsLoading(true);
    try {
      await login(username, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const body = msg.replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(body) as { message?: string };
        setError(parsed.message || msg);
      } catch {
        setError(msg || "Login failed. Please check your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-4">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay" />

      <Card className="w-full max-w-md relative z-10 bg-gray-900/80 border-gray-800 backdrop-blur-xl shadow-2xl">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight" data-testid="text-app-title">
              ProjectHub
            </h1>
          </div>
          <p className="text-sm text-gray-400 mt-1">Sign in to your workspace</p>
        </CardHeader>

        <CardContent className="space-y-6 px-6 pb-8">
          {configLoaded && loginConfig.showMicrosoftButton && (
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 bg-white text-gray-900 border-gray-200 hover:bg-gray-100 font-medium"
                onClick={() => {
                  window.location.href = "/api/auth/microsoft";
                }}
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 21 21" aria-hidden>
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                Sign in with Microsoft
              </Button>
              <p className="text-xs text-center text-gray-500">
                Employees and managers use Microsoft when enabled. Clients (and local admin access) use the form below.
              </p>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-gray-900/80 px-2 text-gray-500">Or continue with password</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" data-testid="text-login-error">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300 text-sm">
                Username
              </Label>
              <Input
                id="username"
                data-testid="input-username"
                placeholder="admin@vnnovate.com"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300 text-sm">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                data-testid="input-password"
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              data-testid="button-login"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium h-11 shadow-lg shadow-indigo-500/20"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <LogIn className="w-4 h-4 mr-2" />
              )}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
