import { createContext, useContext, ReactNode, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";

type User = {
  id: number;
  username: string;
  name: string;
  role: string;
  avatar: string | null;
  status: string | null;
  email: string | null;
  lastSeenAt?: string | null;
  /** Numeric project ids in sidebar order (same as visible /api/projects). */
  projectSidebarOrder?: number[] | null;
  /** Subset on collapsed rail; null = all projects. */
  projectQuickMenuIds?: number[] | null;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
  });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  useEffect(() => {
    if (!user) return;
    const ping = () => {
      void (async () => {
        try {
          await apiRequest("POST", "/api/auth/presence");
          await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        } catch {
          /* ignore */
        }
      })();
    };
    ping();
    const t = window.setInterval(ping, 45_000);
    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
