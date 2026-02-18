import { User, UserRole } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Upload, Users, Shield, Plus, MoreHorizontal, Search } from "lucide-react";
import { useState } from "react";

export default function CompanySettingsView() {
    const { users } = useAppData();
    const [companyName, setCompanyName] = useState("Acme Corp");
    const [searchTerm, setSearchTerm] = useState("");

    const filteredUsers = Object.values(users).filter(u => 
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                                            <p className="text-sm text-muted-foreground">Recommended size: 512x512px. <br/>Max file size: 2MB.</p>
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

                        <TabsContent value="users" className="max-w-5xl space-y-6 mt-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="relative w-72">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            placeholder="Search users..." 
                                            className="pl-9 bg-background" 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <Select defaultValue="all">
                                        <SelectTrigger className="w-[140px] bg-background">
                                            <SelectValue placeholder="Role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Roles</SelectItem>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            <SelectItem value="manager">Manager</SelectItem>
                                            <SelectItem value="employee">Employee</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button>
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
                                        {filteredUsers.map(user => (
                                            <div key={user.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/10 transition-colors">
                                                <div className="col-span-5 flex items-center gap-3">
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarImage src={user.avatar} />
                                                        <AvatarFallback>{user.name[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="font-medium text-sm text-foreground">{user.name}</div>
                                                        <div className="text-xs text-muted-foreground">{user.email}</div>
                                                    </div>
                                                </div>
                                                <div className="col-span-3">
                                                    <Badge variant="outline" className={
                                                        user.role === 'admin' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                                        user.role === 'manager' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                        'bg-slate-100 text-slate-700 border-slate-200'
                                                    }>
                                                        {user.role}
                                                    </Badge>
                                                </div>
                                                <div className="col-span-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${
                                                            user.status === 'online' ? 'bg-emerald-500' : 
                                                            user.status === 'busy' ? 'bg-red-500' : 'bg-slate-400'
                                                        }`} />
                                                        <span className="text-xs capitalize">{user.status}</span>
                                                    </div>
                                                </div>
                                                <div className="col-span-2 flex justify-end">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    );
}
