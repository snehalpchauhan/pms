import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, Briefcase, User, LogIn, Lock, Loader2 } from "lucide-react";

const DEMO_ACCOUNTS = [
  {
    role: "Admin",
    username: "admin",
    password: "admin123",
    description: "Full system access & settings",
    icon: Shield,
    color: "from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50",
    iconColor: "text-purple-400",
    testId: "login-admin",
  },
  {
    role: "Manager",
    username: "manager",
    password: "manager123",
    description: "Project & team management",
    icon: Briefcase,
    color: "from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50",
    iconColor: "text-blue-400",
    testId: "login-manager",
  },
  {
    role: "Employee",
    username: "employee",
    password: "employee123",
    description: "Tasks & collaboration",
    icon: User,
    color: "from-green-500/20 to-green-600/10 border-green-500/30 hover:border-green-400/50",
    iconColor: "text-green-400",
    testId: "login-employee",
  },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingRole, setLoadingRole] = useState<string | null>(null);

  const handleLogin = async (user: string, pass: string, role?: string) => {
    setError(null);
    if (role) {
      setLoadingRole(role);
    } else {
      setIsLoading(true);
    }
    try {
      await login(user, pass);
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
      setLoadingRole(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }
    handleLogin(username, password);
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
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Quick Access</p>
            {DEMO_ACCOUNTS.map((account) => {
              const Icon = account.icon;
              const loading = loadingRole === account.role;
              return (
                <button
                  key={account.role}
                  data-testid={account.testId}
                  disabled={!!loadingRole || isLoading}
                  onClick={() => handleLogin(account.username, account.password, account.role)}
                  className={`w-full flex items-center gap-4 p-3.5 rounded-xl border bg-gradient-to-r transition-all duration-200 ${account.color} disabled:opacity-50`}
                >
                  <div className={`w-10 h-10 rounded-lg bg-gray-900/50 flex items-center justify-center ${account.iconColor}`}>
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-white">{account.role}</div>
                    <div className="text-xs text-gray-400">{account.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-500 font-medium uppercase">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

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
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                disabled={isLoading || !!loadingRole}
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
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                disabled={isLoading || !!loadingRole}
              />
            </div>

            <Button
              type="submit"
              data-testid="button-login"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium h-11 shadow-lg shadow-indigo-500/20"
              disabled={isLoading || !!loadingRole}
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
