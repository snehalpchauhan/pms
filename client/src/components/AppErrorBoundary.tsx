import React from "react";
import { Button } from "@/components/ui/button";
import { persistWorkspaceState } from "@/lib/workspacePersistence";

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Keep console error for debugging; show a recovery UI instead of a blank screen.
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary] Unhandled render error:", error, info);
  }

  private resetWorkspace() {
    // Clear persisted state that can trap the user on a broken view/tab after refresh.
    persistWorkspaceState({
      view: "tasks",
      taskTab: "board",
      taskId: null,
      taskFilter: null,
      channelId: null,
      projectId: null,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-border/60 bg-card shadow-sm p-6 space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-foreground">Something went wrong</div>
            <div className="text-sm text-muted-foreground">
              The app hit an error and couldn&apos;t render this screen. You can go back, or reset your workspace view.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              Go back
            </Button>
            <Button
              type="button"
              onClick={() => {
                this.resetWorkspace();
                window.location.reload();
              }}
            >
              Reset workspace
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

