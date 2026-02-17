import { USERS } from "@/lib/mockData";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Mail, MoreHorizontal, Plus } from "lucide-react";

export default function TeamView() {
  return (
    <div className="p-8 space-y-8 bg-background/50 h-full overflow-y-auto">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-3xl font-display font-bold text-foreground">Team Members</h2>
                <p className="text-muted-foreground mt-1">Manage who has access to this workspace.</p>
            </div>
            <Button>
                <Plus className="w-4 h-4 mr-2" />
                Invite Member
            </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.values(USERS).map(user => (
                <Card key={user.id} className="hover:shadow-md transition-shadow border-border/60">
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                        <Avatar className="h-12 w-12 border border-border">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>{user.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <h3 className="font-semibold text-lg">{user.name}</h3>
                            <p className="text-sm text-muted-foreground">{user.role}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center text-sm text-muted-foreground mb-4">
                            <Mail className="w-4 h-4 mr-2" />
                            {user.email || 'No email'}
                        </div>
                        <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${
                                 user.status === 'online' ? 'bg-emerald-500' : 
                                 user.status === 'busy' ? 'bg-red-500' : 'bg-slate-400'
                             }`} />
                             <span className="text-xs font-medium capitalize">{user.status}</span>
                        </div>
                    </CardContent>
                </Card>
            ))}
            
            <button className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/50 rounded-xl hover:bg-muted/10 transition-colors h-full min-h-[160px] gap-2 group">
                 <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                 </div>
                 <span className="font-medium text-muted-foreground group-hover:text-primary transition-colors">Invite New Member</span>
            </button>
        </div>
    </div>
  );
}
