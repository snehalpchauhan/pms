import { useState } from "react";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
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
import { Building2, Upload, Plus, MoreHorizontal, Search, Trash2, UserCog } from "lucide-react";

type UserRole = "admin" | "manager" | "employee" | "client";

const ROLE_COLORS: Record<UserRole, string> = {
    admin: "bg-purple-100 text-purple-700 border-purple-200",
    manager: "bg-blue-100 text-blue-700 border-blue-200",
    employee: "bg-slate-100 text-slate-700 border-slate-200",
    client: "bg-amber-100 text-amber-700 border-amber-200",
};

const ALL_ROLES: UserRole[] = ["admin", "manager", "employee", "client"];

export default function CompanySettingsView() {
    const { usersArray, refetchUsers } = useAppData();
    const { user: currentUser } = useAuth();

    const [companyName, setCompanyName] = useState("Acme Corp");
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

    return (
        <div className="h-full bg-background flex flex-col overflow-hidden animate-in fade-in duration-300">
            <div className="border-b border-border p-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-10">
                <h1 className="text-3xl font-display font-bold">Company Settings</h1>
                <p className="text-muted-foreground mt-1">Manage general settings, users, and permissions.</p>
            </div>

            <div className="flex-1 overflow-hidden">
                <Tabs defaultValue="general" className="h-full flex flex-col">
                    <div className="px-6 border-b border-border bg-muted/10">
                        <TabsList className="bg-transparent h-12 gap-6 p-0">
                            <TabsTrigger value="general" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium">General</TabsTrigger>
                            <TabsTrigger value="users" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium">User Management</TabsTrigger>
                            <TabsTrigger value="billing" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium">Billing</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-muted/5 p-6 md:p-10">

                        {/* General Tab */}
                        <TabsContent value="general" className="max-w-2xl space-y-8 mt-0">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Company Profile</CardTitle>
                                    <CardDescription>Update your company logo and details.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex items-center gap-6">
                                        <div className="w-24 h-24 bg-primary/10 rounded-xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-primary hover:bg-primary/20 cursor-pointer transition-colors group">
                                            <Building2 className="w-8 h-8 mb-1 group-hover:scale-110 transition-transform" />
                                            <span className="text-[10px] font-medium uppercase">Upload Logo</span>
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="font-medium">Company Logo</h3>
                                            <p className="text-sm text-muted-foreground">Recommended size: 512x512px. <br />Max file size: 2MB.</p>
                                            <Button variant="outline" size="sm" className="mt-2">
                                                <Upload className="w-3 h-3 mr-2" /> Upload
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Company Name</Label>
                                        <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Workspace URL</Label>
                                        <div className="flex items-center">
                                            <span className="bg-muted px-3 py-2 border border-r-0 border-border rounded-l-md text-sm text-muted-foreground">taskflow.app/</span>
                                            <Input defaultValue="acme-corp" className="rounded-l-none" />
                                        </div>
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
