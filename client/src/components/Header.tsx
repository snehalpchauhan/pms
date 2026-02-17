import { Sidebar, Header } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderProps {
    title: string;
    view: string;
    currentUserRole: string;
    onRoleChange: (role: string) => void;
}

export function Header({ title, view, currentUserRole, onRoleChange }: HeaderProps) {
    const viewName = view === 'tasks' ? 'Tasks' : view.charAt(0).toUpperCase() + view.slice(1);
    
  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10 px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
          <div className="flex flex-col">
             <h1 className="text-sm font-medium text-muted-foreground">{title}</h1>
             <h2 className="text-lg font-display font-bold text-foreground tracking-tight leading-none">{viewName}</h2>
          </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Role Switcher for Demo */}
        <div className="flex items-center gap-2 mr-4 bg-muted/50 p-1 rounded-lg border border-border/50">
            <span className="text-xs font-medium px-2 text-muted-foreground">View as:</span>
            {(['admin', 'manager', 'employee', 'client'] as const).map(role => (
                <button
                    key={role}
                    onClick={() => onRoleChange(role)}
                    className={cn(
                        "text-[10px] uppercase font-bold px-2 py-1 rounded-md transition-all",
                        currentUserRole === role 
                            ? "bg-primary text-primary-foreground shadow-sm" 
                            : "hover:bg-background text-muted-foreground"
                    )}
                >
                    {role}
                </button>
            ))}
        </div>
        {/* Rest of the header code stays same in parent component if passed down or we just use this updated version */}
      </div>
    </header>
  );
}
