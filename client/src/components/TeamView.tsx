import { Project } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Mail, MoreHorizontal, Plus, Shield, User, Briefcase, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

interface TeamViewProps {
    project: Project;
    currentUserRole: string;
}

export default function TeamView({ project, currentUserRole }: TeamViewProps) {
    const { users } = useAppData();
    const projectMembers = Object.values(users).filter(u => project.members?.includes(u.id));
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    const canManageTeam = currentUserRole === 'manager';

    const getRoleBadge = (role: string) => {
        switch(role) {
            case 'manager': return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200"><Shield className="w-3 h-3 mr-1" /> Manager</Badge>;
            case 'client': return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200"><User className="w-3 h-3 mr-1" /> Client</Badge>;
            default: return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Briefcase className="w-3 h-3 mr-1" /> Employee</Badge>;
        }
    };

    return (
    <div className="p-8 space-y-8 bg-background/50 h-full overflow-y-auto">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-3xl font-display font-bold text-foreground">Project Team</h2>
                <p className="text-muted-foreground mt-1">Members working on <span className="font-medium text-foreground">{project.name}</span></p>
            </div>
            {canManageTeam && (
                <Button onClick={() => setIsInviteOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Invite Member
                </Button>
            )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projectMembers.map(user => (
                <Card key={user.id} className="hover:shadow-md transition-shadow border-border/60 relative group">
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                        <Avatar className="h-12 w-12 border border-border">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>{user.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <h3 className="font-semibold text-lg">{user.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                {getRoleBadge(user.role)}
                            </div>
                        </div>
                        {canManageTeam && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                <MoreHorizontal className="w-4 h-4" />
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center text-sm text-muted-foreground mb-4">
                            <Mail className="w-4 h-4 mr-2" />
                            {user.email || 'No email'}
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                    user.status === 'online' ? 'bg-emerald-500' : 
                                    user.status === 'busy' ? 'bg-red-500' : 'bg-slate-400'
                                }`} />
                                <span className="text-xs font-medium capitalize">{user.status}</span>
                            </div>
                            
                            {canManageTeam && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
            
            {canManageTeam && (
                <button onClick={() => setIsInviteOpen(true)} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/50 rounded-xl hover:bg-muted/10 transition-colors h-full min-h-[160px] gap-2 group">
                    <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <span className="font-medium text-muted-foreground group-hover:text-primary transition-colors">Add Team Member</span>
                </button>
            )}
        </div>

        {/* Invite Modal Mockup */}
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Invite Team Member</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" placeholder="John Doe" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" placeholder="john@example.com" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="role">Role</Label>
                        <Select defaultValue="employee">
                            <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="employee">Employee</SelectItem>
                                <SelectItem value="client">Client</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => setIsInviteOpen(false)}>Send Invitation</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
