import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_SETTINGS_TAB_EVENT } from "@/lib/companySettingsNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Upload, Plus, MoreHorizontal, Search, Trash2, UserCog, LogIn, Kanban } from "lucide-react";
import {
    WORKFLOW_COLUMN_PRESETS,
    DEFAULT_TASK_CLIENT_REOPEN_STATUS,
    DEFAULT_TASK_MARK_COMPLETE_STATUS,
    type WorkflowColumnId,
} from "@shared/workflowColumns";

type UserRole = "admin" | "manager" | "employee" | "client";

const ROLE_COLORS: Record<UserRole, string> = {
    admin: "bg-purple-100 text-purple-700 border-purple-200",
    manager: "bg-blue-100 text-blue-700 border-blue-200",
    employee: "bg-slate-100 text-slate-700 border-slate-200",
    client: "bg-amber-100 text-amber-700 border-amber-200",
};

const ALL_ROLES: UserRole[] = ["admin", "manager", "employee", "client"];

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const SETTINGS_TABS = ["general", "login", "users", "billing"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function settingsTabFromHash(): SettingsTab {
    if (typeof window === "undefined") return "general";
    const h = window.location.hash.replace(/^#/, "");
    return SETTINGS_TABS.includes(h as SettingsTab) ? (h as SettingsTab) : "general";
}

type CompanySettingsDto = {
    companyName: string;
    workspaceSlug: string;
    logoUrl: string | null;
    ms365Enabled: boolean;
    ms365TenantId: string;
    ms365ClientId: string;
    ms365AllowedDomains: string;
    ms365ClientSecretConfigured: boolean;
    ms365ClientSecretFromEnv: boolean;
    taskMarkCompleteStatus: WorkflowColumnId;
    taskClientReopenStatus: WorkflowColumnId;
};

export default function CompanySettingsView() {
    const { usersArray, refetchUsers } = useAppData();
    const { user: currentUser } = useAuth();
    const { toast } = useToast();
    const logoInputRef = useRef<HTMLInputElement>(null);

    const isAdmin = currentUser?.role === "admin";

    const { data: companyData, isLoading: companyLoading } = useQuery<CompanySettingsDto>({
        queryKey: ["/api/company-settings"],
    });

    const [companyName, setCompanyName] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState<string>("all");

    const [showAddDialog, setShowAddDialog] = useState(false);
    const [addForm, setAddForm] = useState({ name: "", email: "", username: "", password: "", role: "employee" as UserRole });
    const [addError, setAddError] = useState("");
    const [addLoading, setAddLoading] = useState(false);

    const [editRoleUser, setEditRoleUser] = useState<{ id: string; name: string; role: UserRole } | null>(null);
    const [editRole, setEditRole] = useState<UserRole>("employee");
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState("");

    const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    const [workspaceSlug, setWorkspaceSlug] = useState("");
    const [pendingLogoDataUrl, setPendingLogoDataUrl] = useState<string | null>(null);
    const [logoRemoved, setLogoRemoved] = useState(false);

    const [ms365Enabled, setMs365Enabled] = useState(false);
    const [ms365TenantId, setMs365TenantId] = useState("");
    const [ms365ClientId, setMs365ClientId] = useState("");
    const [ms365AllowedDomains, setMs365AllowedDomains] = useState("");
    const [ms365ClientSecretDraft, setMs365ClientSecretDraft] = useState("");
    const [removeStoredMs365Secret, setRemoveStoredMs365Secret] = useState(false);

    const [taskMarkCompleteStatus, setTaskMarkCompleteStatus] =
        useState<WorkflowColumnId>(DEFAULT_TASK_MARK_COMPLETE_STATUS);
    const [taskClientReopenStatus, setTaskClientReopenStatus] =
        useState<WorkflowColumnId>(DEFAULT_TASK_CLIENT_REOPEN_STATUS);

    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>(settingsTabFromHash);

    const syncSettingsTabToUrl = useCallback((v: SettingsTab) => {
        setActiveSettingsTab(v);
        const base = window.location.pathname + window.location.search;
        window.history.replaceState(null, "", v === "general" ? base : `${base}#${v}`);
    }, []);

    useEffect(() => {
        const onHash = () => setActiveSettingsTab(settingsTabFromHash());
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
    }, []);

    useEffect(() => {
        const onNav = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail as SettingsTab;
            if (!SETTINGS_TABS.includes(detail)) return;
            syncSettingsTabToUrl(detail);
        };
        window.addEventListener(COMPANY_SETTINGS_TAB_EVENT, onNav);
        return () => window.removeEventListener(COMPANY_SETTINGS_TAB_EVENT, onNav);
    }, [syncSettingsTabToUrl]);

    const handleSettingsTabChange = (value: string) => {
        const v = value as SettingsTab;
        syncSettingsTabToUrl(v);
        window.dispatchEvent(new CustomEvent(COMPANY_SETTINGS_TAB_EVENT, { detail: v }));
    };

    useEffect(() => {
        if (!companyData) return;
        setCompanyName(companyData.companyName);
        setWorkspaceSlug(companyData.workspaceSlug);
        setPendingLogoDataUrl(null);
        setLogoRemoved(false);
        setMs365Enabled(companyData.ms365Enabled ?? false);
        setMs365TenantId(companyData.ms365TenantId ?? "");
        setMs365ClientId(companyData.ms365ClientId ?? "");
        setMs365AllowedDomains(companyData.ms365AllowedDomains ?? "");
        setTaskMarkCompleteStatus(companyData.taskMarkCompleteStatus ?? DEFAULT_TASK_MARK_COMPLETE_STATUS);
        setTaskClientReopenStatus(companyData.taskClientReopenStatus ?? DEFAULT_TASK_CLIENT_REOPEN_STATUS);
    }, [companyData]);

    const displayLogoSrc =
        pendingLogoDataUrl ??
        (!logoRemoved && companyData?.logoUrl ? companyData.logoUrl : null);

    const saveCompanyMutation = useMutation({
        mutationFn: async () => {
            const body: Record<string, unknown> = {
                companyName: companyName.trim(),
                workspaceSlug: workspaceSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""),
                ms365Enabled,
                ms365TenantId: ms365TenantId.trim(),
                ms365ClientId: ms365ClientId.trim(),
                ms365AllowedDomains: ms365AllowedDomains.trim(),
                taskMarkCompleteStatus,
                taskClientReopenStatus,
            };
            if (removeStoredMs365Secret) {
                body.ms365ClientSecret = null;
            } else if (ms365ClientSecretDraft.trim()) {
                body.ms365ClientSecret = ms365ClientSecretDraft.trim();
            }
            if (pendingLogoDataUrl) body.logoDataUrl = pendingLogoDataUrl;
            else if (logoRemoved) body.logoDataUrl = null;
            await apiRequest("PATCH", "/api/company-settings", body);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
            setPendingLogoDataUrl(null);
            setLogoRemoved(false);
            setMs365ClientSecretDraft("");
            setRemoveStoredMs365Secret(false);
            toast({ title: "Company settings saved" });
        },
        onError: (err: unknown) => {
            toast({
                title: "Could not save",
                description: parseApiError(err),
                variant: "destructive",
            });
        },
    });

    function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
            toast({ title: "Use PNG, JPEG, or WebP", variant: "destructive" });
            return;
        }
        if (file.size > MAX_LOGO_BYTES) {
            toast({ title: "Max file size is 2MB", variant: "destructive" });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                setPendingLogoDataUrl(reader.result);
                setLogoRemoved(false);
            }
        };
        reader.readAsDataURL(file);
    }

    const filteredUsers = usersArray.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (u.email || "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === "all" || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    function parseApiError(err: unknown): string {
        const msg = err instanceof Error ? err.message : String(err);
        const body = msg.replace(/^\d+:\s*/, "");
        try { return JSON.parse(body).message || body; } catch { return body; }
    }

    async function handleAddUser() {
        setAddError("");
        if (!addForm.name.trim() || !addForm.email.trim() || !addForm.username.trim() || !addForm.password.trim()) {
            setAddError("Name, email, username, and password are required.");
            return;
        }
        setAddLoading(true);
        try {
            await apiRequest("POST", "/api/users", addForm);
            refetchUsers();
            setShowAddDialog(false);
            setAddForm({ name: "", email: "", username: "", password: "", role: "employee" });
        } catch (err) {
            setAddError(parseApiError(err));
        } finally {
            setAddLoading(false);
        }
    }

    async function handleEditRole() {
        if (!editRoleUser) return;
        setEditError("");
        setEditLoading(true);
        try {
            await apiRequest("PATCH", `/api/users/${editRoleUser.id}`, { role: editRole });
            refetchUsers();
            setEditRoleUser(null);
        } catch (err) {
            setEditError(parseApiError(err));
        } finally {
            setEditLoading(false);
        }
    }

    async function handleDeleteUser() {
        if (!deleteUserId) return;
        setDeleteError("");
        setDeleteLoading(true);
        try {
            await apiRequest("DELETE", `/api/users/${deleteUserId}`);
            refetchUsers();
            setDeleteUserId(null);
        } catch (err) {
            setDeleteError(parseApiError(err));
        } finally {
            setDeleteLoading(false);
        }
    }

    const deleteUserName = usersArray.find(u => u.id === deleteUserId)?.name ?? "";

    const hostPrefix =
        typeof window !== "undefined" ? `${window.location.host}/` : "";

    const msRedirectUri =
        typeof window !== "undefined"
            ? `${window.location.origin}/api/auth/microsoft/callback`
            : "";

    return (
        <div className="h-full bg-background flex flex-col overflow-hidden animate-in fade-in duration-300">
            <div className="border-b border-border p-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-10">
                <h1 className="text-3xl font-display font-bold">Company Settings</h1>
                <p className="text-muted-foreground mt-1">Manage general settings, users, and permissions.</p>
            </div>

            <div className="flex-1 overflow-hidden">
                <Tabs value={activeSettingsTab} onValueChange={handleSettingsTabChange} className="h-full flex flex-col">
                    <div className="px-6 border-b border-border bg-muted/10">
                        <TabsList className="bg-transparent h-12 gap-6 p-0">
                            <TabsTrigger value="general" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium">General</TabsTrigger>
                            <TabsTrigger value="login" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium gap-1.5 inline-flex items-center">
                                <LogIn className="h-3.5 w-3.5 opacity-70" />
                                Login options
                            </TabsTrigger>
                            <TabsTrigger value="users" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium">User Management</TabsTrigger>
                            <TabsTrigger value="billing" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium">Billing</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-muted/5 p-6 md:p-10">

                        {/* General Tab */}
                        <TabsContent value="general" className="max-w-2xl space-y-8 mt-0">
                            <div className="flex justify-end">
                                <Button
                                    type="button"
                                    disabled={!isAdmin || companyLoading || saveCompanyMutation.isPending}
                                    onClick={() => saveCompanyMutation.mutate()}
                                >
                                    {saveCompanyMutation.isPending ? "Saving…" : "Save changes"}
                                </Button>
                            </div>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Company Profile</CardTitle>
                                    <CardDescription>Update your company logo and details.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {!isAdmin && (
                                        <p className="text-sm text-muted-foreground rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                                            Only administrators can edit company profile. You can still manage users if your role allows it.
                                        </p>
                                    )}
                                    <input
                                        ref={logoInputRef}
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        className="sr-only"
                                        onChange={handleLogoFileChange}
                                        disabled={!isAdmin || companyLoading}
                                    />
                                    <div className="flex items-center gap-6">
                                        <button
                                            type="button"
                                            disabled={!isAdmin || companyLoading}
                                            onClick={() => logoInputRef.current?.click()}
                                            className="w-24 h-24 rounded-xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-primary hover:bg-primary/10 cursor-pointer transition-colors overflow-hidden shrink-0 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {displayLogoSrc ? (
                                                <img
                                                    src={displayLogoSrc}
                                                    alt="Company logo"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <>
                                                    <Building2 className="w-8 h-8 mb-1" />
                                                    <span className="text-[10px] font-medium uppercase px-1 text-center leading-tight">
                                                        Upload Logo
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                        <div className="space-y-1 min-w-0">
                                            <h3 className="font-medium">Company Logo</h3>
                                            <p className="text-sm text-muted-foreground">
                                                PNG, JPEG, or WebP. Recommended 512×512px. Max 2MB.
                                            </p>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={!isAdmin || companyLoading}
                                                    onClick={() => logoInputRef.current?.click()}
                                                >
                                                    <Upload className="w-3 h-3 mr-2" /> Upload
                                                </Button>
                                                {(displayLogoSrc || companyData?.logoUrl) && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-muted-foreground"
                                                        disabled={!isAdmin || companyLoading}
                                                        onClick={() => {
                                                            setPendingLogoDataUrl(null);
                                                            setLogoRemoved(true);
                                                        }}
                                                    >
                                                        Remove logo
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Company Name</Label>
                                        <Input
                                            value={companyName}
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            disabled={!isAdmin || companyLoading}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Workspace URL slug</Label>
                                        <div className="flex items-center">
                                            <span className="bg-muted px-3 py-2 border border-r-0 border-border rounded-l-md text-sm text-muted-foreground whitespace-nowrap shrink-0 max-w-[50%] truncate" title={hostPrefix}>
                                                {hostPrefix}
                                            </span>
                                            <Input
                                                value={workspaceSlug}
                                                onChange={(e) =>
                                                    setWorkspaceSlug(
                                                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                                                    )
                                                }
                                                placeholder="acme-corp"
                                                className="rounded-l-none"
                                                disabled={!isAdmin || companyLoading}
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Lowercase letters, numbers, and hyphens only. Display name for your workspace link.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Kanban className="w-5 h-5 text-muted-foreground" />
                                        Task workflow
                                    </CardTitle>
                                    <CardDescription>
                                        Choose where tasks move using the <strong>standard</strong> board columns only (To
                                        Do, In Progress, Review, Done). Custom columns you add per project are not listed
                                        here so routing stays valid if those columns are removed. The app matches these
                                        settings to each project&apos;s board by column id when possible.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {!isAdmin && (
                                        <p className="text-sm text-muted-foreground rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                                            Only administrators can edit task workflow settings.
                                        </p>
                                    )}
                                    <div className="space-y-2">
                                        <Label>When staff marks a task complete</Label>
                                        <Select
                                            value={taskMarkCompleteStatus}
                                            onValueChange={(v) => setTaskMarkCompleteStatus(v as WorkflowColumnId)}
                                            disabled={!isAdmin || companyLoading}
                                        >
                                            <SelectTrigger className="max-w-md">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {WORKFLOW_COLUMN_PRESETS.map((col) => (
                                                    <SelectItem key={col.id} value={col.id}>
                                                        {col.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            Default: <strong>Done</strong>. Tasks move to this standard column (or the
                                            closest match on the project board).
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>When a customer requests revision / reopens from review</Label>
                                        <Select
                                            value={taskClientReopenStatus}
                                            onValueChange={(v) => setTaskClientReopenStatus(v as WorkflowColumnId)}
                                            disabled={!isAdmin || companyLoading}
                                        >
                                            <SelectTrigger className="max-w-md">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {WORKFLOW_COLUMN_PRESETS.map((col) => (
                                                    <SelectItem key={col.id} value={col.id}>
                                                        {col.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            Default: <strong>In Progress</strong>. Applies when a client uses Request
                                            revision from the review column.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Login options (Microsoft 365) */}
                        <TabsContent value="login" className="max-w-2xl space-y-8 mt-0">
                            <div className="flex justify-end">
                                <Button
                                    type="button"
                                    disabled={!isAdmin || companyLoading || saveCompanyMutation.isPending}
                                    onClick={() => saveCompanyMutation.mutate()}
                                >
                                    {saveCompanyMutation.isPending ? "Saving…" : "Save changes"}
                                </Button>
                            </div>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Microsoft 365 sign-in</CardTitle>
                                    <CardDescription>
                                        Require employees and managers to sign in with Microsoft when enabled. Clients and
                                        admins always use username and password. You can store the client secret below, or
                                        set <code className="text-xs bg-muted px-1 rounded">MS365_CLIENT_SECRET</code> on the
                                        server (environment overrides the database).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {!isAdmin && (
                                        <p className="text-sm text-muted-foreground border border-border/60 bg-muted/30 rounded-md px-3 py-2">
                                            Only administrators can change Microsoft 365 settings.
                                        </p>
                                    )}
                                    {companyData?.ms365ClientSecretFromEnv && (
                                        <p className="text-sm rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100 px-3 py-2">
                                            <strong>Environment secret active:</strong>{" "}
                                            <code className="text-xs">MS365_CLIENT_SECRET</code> or{" "}
                                            <code className="text-xs">AZURE_CLIENT_SECRET</code> is set on the server and takes
                                            precedence over any secret saved here.
                                        </p>
                                    )}
                                    {companyData?.ms365ClientSecretConfigured && !companyData?.ms365ClientSecretFromEnv && (
                                        <p className="text-sm text-muted-foreground border border-border/60 bg-muted/30 rounded-md px-3 py-2">
                                            A client secret is saved in the database. Enter a new value below to replace it, or
                                            check &quot;Remove stored secret&quot; and save.
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-4 py-3">
                                        <div>
                                            <Label htmlFor="ms365-enabled" className="text-base font-medium">
                                                Enable Microsoft 365 for employees and managers
                                            </Label>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                When off, everyone signs in with username and password. When on, staff need a
                                                configured secret and allowed domains below.
                                            </p>
                                        </div>
                                        <Switch
                                            id="ms365-enabled"
                                            checked={ms365Enabled}
                                            onCheckedChange={setMs365Enabled}
                                            disabled={!isAdmin || companyLoading}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Directory (tenant) ID</Label>
                                        <Input
                                            value={ms365TenantId}
                                            onChange={(e) => setMs365TenantId(e.target.value)}
                                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                            disabled={!isAdmin || companyLoading}
                                            className="font-mono text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Application (client) ID</Label>
                                        <Input
                                            value={ms365ClientId}
                                            onChange={(e) => setMs365ClientId(e.target.value)}
                                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                            disabled={!isAdmin || companyLoading}
                                            className="font-mono text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Client secret</Label>
                                        <Input
                                            type="password"
                                            autoComplete="new-password"
                                            value={ms365ClientSecretDraft}
                                            onChange={(e) => {
                                                setMs365ClientSecretDraft(e.target.value);
                                                if (e.target.value) setRemoveStoredMs365Secret(false);
                                            }}
                                            placeholder={
                                                companyData?.ms365ClientSecretConfigured
                                                    ? "Enter new secret to replace stored value"
                                                    : "Paste client secret from Entra (Certificates & secrets)"
                                            }
                                            disabled={!isAdmin || companyLoading || removeStoredMs365Secret}
                                            className="font-mono text-sm"
                                        />
                                        <div className="flex items-center gap-2 pt-1">
                                            <Checkbox
                                                id="remove-ms365-secret"
                                                checked={removeStoredMs365Secret}
                                                onCheckedChange={(c) => {
                                                    const on = c === true;
                                                    setRemoveStoredMs365Secret(on);
                                                    if (on) setMs365ClientSecretDraft("");
                                                }}
                                                disabled={!isAdmin || companyLoading || !companyData?.ms365ClientSecretConfigured}
                                            />
                                            <label
                                                htmlFor="remove-ms365-secret"
                                                className="text-sm text-muted-foreground cursor-pointer leading-none peer-disabled:cursor-not-allowed"
                                            >
                                                Remove stored secret from database
                                            </label>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Stored in the database like other settings—restrict admin access and backups. Leave
                                            blank when saving to keep the current stored secret unchanged.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Allowed email domains</Label>
                                        <Input
                                            value={ms365AllowedDomains}
                                            onChange={(e) => setMs365AllowedDomains(e.target.value)}
                                            placeholder="vnnovate.com"
                                            disabled={!isAdmin || companyLoading}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Comma-separated hostnames only the Microsoft account must match (e.g.{" "}
                                            <span className="font-mono">vnnovate.com</span>). Users must already exist in User
                                            Management with the same work email.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Redirect URI (register in Azure)</Label>
                                        <Input readOnly value={msRedirectUri} className="font-mono text-xs bg-muted/50" />
                                        <p className="text-xs text-muted-foreground">
                                            In Entra ID → App registration → Authentication, add this Web redirect URI. Set{" "}
                                            <code className="bg-muted px-1 rounded">PUBLIC_APP_URL</code> on the server to this
                                            site&apos;s origin if redirects fail behind a proxy.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* User Management Tab */}
                        <TabsContent value="users" className="max-w-5xl space-y-6 mt-0">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 flex-1">
                                    <div className="relative w-72">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            data-testid="input-user-search"
                                            placeholder="Search users..."
                                            className="pl-9 bg-background"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                                        <SelectTrigger className="w-[150px] bg-background" data-testid="select-role-filter">
                                            <SelectValue placeholder="All Roles" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Roles</SelectItem>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            <SelectItem value="manager">Manager</SelectItem>
                                            <SelectItem value="employee">Employee</SelectItem>
                                            <SelectItem value="client">Client</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button data-testid="button-add-user" onClick={() => { setAddError(""); setShowAddDialog(true); }}>
                                    <Plus className="w-4 h-4 mr-2" /> Add User
                                </Button>
                            </div>

                            <Card>
                                <CardContent className="p-0">
                                    <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        <div className="col-span-5 pl-2">User</div>
                                        <div className="col-span-3">Role</div>
                                        <div className="col-span-2">Status</div>
                                        <div className="col-span-2 text-right pr-2">Actions</div>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {filteredUsers.length === 0 && (
                                            <div className="p-8 text-center text-muted-foreground text-sm">No users match your filters.</div>
                                        )}
                                        {filteredUsers.map(user => (
                                            <div key={user.id} data-testid={`row-user-${user.id}`} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/10 transition-colors">
                                                <div className="col-span-5 flex items-center gap-3">
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarImage src={user.avatar} />
                                                        <AvatarFallback>{user.name[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="font-medium text-sm text-foreground">{user.name}</div>
                                                        <div className="text-xs text-muted-foreground">{user.email || <span className="italic opacity-60">no email</span>}</div>
                                                    </div>
                                                </div>
                                                <div className="col-span-3">
                                                    <Badge variant="outline" className={ROLE_COLORS[user.role as UserRole] || ROLE_COLORS.employee}>
                                                        {user.role}
                                                    </Badge>
                                                </div>
                                                <div className="col-span-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${user.status === 'online' ? 'bg-emerald-500' : user.status === 'busy' ? 'bg-red-500' : 'bg-slate-400'}`} />
                                                        <span className="text-xs capitalize">{user.status}</span>
                                                    </div>
                                                </div>
                                                <div className="col-span-2 flex justify-end">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button data-testid={`button-user-actions-${user.id}`} variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreHorizontal className="w-4 h-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                data-testid={`menu-edit-role-${user.id}`}
                                                                disabled={user.id === String(currentUser?.id)}
                                                                onClick={() => {
                                                                    setEditError("");
                                                                    setEditRoleUser({ id: user.id, name: user.name, role: user.role as UserRole });
                                                                    setEditRole(user.role as UserRole);
                                                                }}
                                                            >
                                                                <UserCog className="w-4 h-4 mr-2" /> Edit Role
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                data-testid={`menu-delete-user-${user.id}`}
                                                                disabled={user.id === String(currentUser?.id)}
                                                                className="text-destructive focus:text-destructive"
                                                                onClick={() => setDeleteUserId(user.id)}
                                                            >
                                                                <Trash2 className="w-4 h-4 mr-2" /> Remove User
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Billing Tab */}
                        <TabsContent value="billing" className="max-w-2xl space-y-6 mt-0">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Billing</CardTitle>
                                    <CardDescription>Manage your subscription and billing details.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">Billing management coming soon.</p>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            {/* Add User Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add New User</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="add-name">Full Name <span className="text-destructive">*</span></Label>
                            <Input
                                id="add-name"
                                data-testid="input-add-name"
                                placeholder="Jane Doe"
                                value={addForm.name}
                                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="add-email">Email <span className="text-destructive">*</span></Label>
                            <Input
                                id="add-email"
                                data-testid="input-add-email"
                                type="email"
                                placeholder="jane@example.com"
                                value={addForm.email}
                                onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="add-username">Username <span className="text-destructive">*</span></Label>
                            <Input
                                id="add-username"
                                data-testid="input-add-username"
                                placeholder="janedoe"
                                value={addForm.username}
                                onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="add-password">Password <span className="text-destructive">*</span></Label>
                            <Input
                                id="add-password"
                                data-testid="input-add-password"
                                type="password"
                                placeholder="••••••••"
                                value={addForm.password}
                                onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Role <span className="text-destructive">*</span></Label>
                            <Select value={addForm.role} onValueChange={(v) => setAddForm(f => ({ ...f, role: v as UserRole }))}>
                                <SelectTrigger data-testid="select-add-role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ALL_ROLES.map(r => (
                                        <SelectItem key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {addError && <p className="text-sm text-destructive">{addError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={addLoading}>Cancel</Button>
                        <Button data-testid="button-confirm-add-user" onClick={handleAddUser} disabled={addLoading}>
                            {addLoading ? "Creating..." : "Create User"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Role Dialog */}
            <Dialog open={!!editRoleUser} onOpenChange={(open) => { if (!open) setEditRoleUser(null); }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Edit Role — {editRoleUser?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>New Role</Label>
                            <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                                <SelectTrigger data-testid="select-edit-role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ALL_ROLES.map(r => (
                                        <SelectItem key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {editError && <p className="text-sm text-destructive">{editError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditRoleUser(null)} disabled={editLoading}>Cancel</Button>
                        <Button data-testid="button-confirm-edit-role" onClick={handleEditRole} disabled={editLoading}>
                            {editLoading ? "Saving..." : "Save Role"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteUserId} onOpenChange={(open) => { if (!open) { setDeleteUserId(null); setDeleteError(""); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove {deleteUserName}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove <strong>{deleteUserName}</strong> from the system. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteError && <p className="text-sm text-destructive px-1">{deleteError}</p>}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            data-testid="button-confirm-delete-user"
                            onClick={handleDeleteUser}
                            disabled={deleteLoading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteLoading ? "Removing..." : "Remove User"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
