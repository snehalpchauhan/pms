import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Project } from "@/lib/mockData";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Eye, EyeOff } from "lucide-react";

type ProjectSettingsDto = {
  projectId: number;
  settings: Record<string, any>;
};

type ProjectDocument = {
  id: number;
  projectId: number;
  name: string;
  type: string;
  url?: string | null;
  size?: string | null;
  createdAt?: string | null;
};

type ProjectCredential = {
  id: number;
  projectId: number;
  name: string;
  type: string;
  metadata: Record<string, unknown>;
  visibilityMode: "project_members" | "roles" | "users";
  visibilityRoles: string[];
  visibilityUserIds: number[];
  maskedSecret: string;
};

type Member = { id: number | string; name: string; role: string };

const VISIBILITY_OPTIONS = [
  { id: "project_members", label: "Project members" },
  { id: "roles", label: "Roles" },
  { id: "users", label: "Specific users" },
] as const;

const ROLE_OPTIONS = ["admin", "manager", "employee", "client"] as const;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read file"));
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function ProjectSettingsView({
  project,
  currentUserRole,
}: {
  project: Project;
  currentUserRole: string;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const projectId = Number(project.id);
  const isOwner = project.ownerId != null && String(project.ownerId) === String(user?.id);
  const canManage = currentUserRole === "admin" || currentUserRole === "manager" || isOwner;

  const [notes, setNotes] = useState("");
  const [importantLinksText, setImportantLinksText] = useState("");
  const [repoProvider, setRepoProvider] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [deployNotes, setDeployNotes] = useState("");

  const [docFile, setDocFile] = useState<File | null>(null);
  const [revealedMap, setRevealedMap] = useState<Record<number, string>>({});
  const [editingCredentialId, setEditingCredentialId] = useState<number | null>(null);
  const [credentialName, setCredentialName] = useState("");
  const [credentialType, setCredentialType] = useState("other");
  const [credentialSecret, setCredentialSecret] = useState("");
  const [credentialMetadataText, setCredentialMetadataText] = useState("{}");
  const [visibilityMode, setVisibilityMode] = useState<"project_members" | "roles" | "users">("roles");
  const [visibilityRoles, setVisibilityRoles] = useState<string[]>(["admin", "manager"]);
  const [visibilityUserIds, setVisibilityUserIds] = useState<number[]>([]);

  const settingsQuery = useQuery<ProjectSettingsDto>({
    queryKey: ["/api/projects", projectId, "settings"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    enabled: Number.isInteger(projectId) && projectId > 0,
  });

  const docsQuery = useQuery<ProjectDocument[]>({
    queryKey: ["/api/projects", projectId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/documents`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    enabled: Number.isInteger(projectId) && projectId > 0,
  });

  const credentialsQuery = useQuery<ProjectCredential[]>({
    queryKey: ["/api/projects", projectId, "credentials"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/credentials`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load credentials");
      return res.json();
    },
    enabled: Number.isInteger(projectId) && projectId > 0,
  });

  const membersQuery = useQuery<Member[]>({
    queryKey: ["/api/projects", projectId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load members");
      return res.json();
    },
    enabled: Number.isInteger(projectId) && projectId > 0,
  });

  useEffect(() => {
    const settings = settingsQuery.data?.settings ?? {};
    const general = settings.general ?? {};
    const repo = settings.repository ?? {};
    setNotes(String(general.notes ?? ""));
    setImportantLinksText(Array.isArray(general.importantLinks) ? general.importantLinks.join("\n") : "");
    setRepoProvider(String(repo.provider ?? ""));
    setRepoUrl(String(repo.repoUrl ?? ""));
    setDefaultBranch(String(repo.defaultBranch ?? ""));
    setDeployNotes(String(repo.deployNotes ?? ""));
  }, [settingsQuery.dataUpdatedAt]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/projects/${projectId}/settings`, {
        settings: {
          general: {
            notes: notes.trim(),
            importantLinks: parseLines(importantLinksText),
          },
          repository: {
            provider: repoProvider.trim(),
            repoUrl: repoUrl.trim(),
            defaultBranch: defaultBranch.trim(),
            deployNotes: deployNotes.trim(),
          },
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "settings"] });
      toast({ title: "Project settings saved" });
    },
    onError: (e: unknown) => {
      toast({
        title: "Could not save settings",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: async () => {
      if (!docFile) throw new Error("Choose a file first");
      const fileDataUrl = await fileToDataUrl(docFile);
      await apiRequest("POST", `/api/projects/${projectId}/documents`, {
        fileDataUrl,
        name: docFile.name,
      });
    },
    onSuccess: async () => {
      setDocFile(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      toast({ title: "Document uploaded" });
    },
    onError: (e: unknown) => {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const deleteDoc = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/projects/${projectId}/documents/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      toast({ title: "Document deleted" });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const resetCredentialForm = () => {
    setEditingCredentialId(null);
    setCredentialName("");
    setCredentialType("other");
    setCredentialSecret("");
    setCredentialMetadataText("{}");
    setVisibilityMode("roles");
    setVisibilityRoles(["admin", "manager"]);
    setVisibilityUserIds([]);
  };

  const beginEditCredential = (row: ProjectCredential) => {
    setEditingCredentialId(row.id);
    setCredentialName(row.name);
    setCredentialType(row.type);
    setCredentialSecret("");
    setCredentialMetadataText(JSON.stringify(row.metadata ?? {}, null, 2));
    setVisibilityMode(row.visibilityMode);
    setVisibilityRoles(row.visibilityRoles ?? []);
    setVisibilityUserIds(row.visibilityUserIds ?? []);
  };

  const saveCredentialMutation = useMutation({
    mutationFn: async () => {
      const metadata = credentialMetadataText.trim() ? JSON.parse(credentialMetadataText) : {};
      if (!credentialName.trim()) throw new Error("Credential name is required");
      if (!editingCredentialId && !credentialSecret.trim()) throw new Error("Secret is required");
      const body = {
        name: credentialName.trim(),
        type: credentialType,
        secret: credentialSecret.trim() || undefined,
        metadata,
        visibilityMode,
        visibilityRoles,
        visibilityUserIds,
      };
      if (editingCredentialId) {
        await apiRequest("PATCH", `/api/projects/${projectId}/credentials/${editingCredentialId}`, body);
      } else {
        await apiRequest("POST", `/api/projects/${projectId}/credentials`, {
          ...body,
          secret: credentialSecret.trim(),
        });
      }
    },
    onSuccess: async () => {
      resetCredentialForm();
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "credentials"] });
      toast({ title: "Credential saved" });
    },
    onError: (e: unknown) => {
      toast({
        title: "Could not save credential",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const revealCredential = async (id: number) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/credentials/${id}/reveal`, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || "Reveal failed");
      }
      const data = (await res.json()) as { secret: string };
      setRevealedMap((prev) => ({ ...prev, [id]: data.secret }));
    } catch (e) {
      toast({
        title: "Could not reveal secret",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const deleteCredential = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/projects/${projectId}/credentials/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "credentials"] });
      toast({ title: "Credential deleted" });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const members = membersQuery.data ?? [];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Project Settings</h1>
          <p className="text-sm text-muted-foreground">
            Store project information, repository details, documents, and secure credentials.
          </p>
        </div>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="repository">Repository</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>General</CardTitle>
                <CardDescription>Notes and important links for this project.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Project notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} />
                </div>
                <div className="space-y-1">
                  <Label>Important links (one per line)</Label>
                  <Textarea value={importantLinksText} onChange={(e) => setImportantLinksText(e.target.value)} rows={6} />
                </div>
                <div>
                  <Button
                    type="button"
                    disabled={!canManage || saveSettingsMutation.isPending}
                    onClick={() => saveSettingsMutation.mutate()}
                  >
                    Save settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="repository">
            <Card>
              <CardHeader>
                <CardTitle>Repository</CardTitle>
                <CardDescription>Git provider and deployment context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Provider</Label>
                    <Input value={repoProvider} onChange={(e) => setRepoProvider(e.target.value)} placeholder="GitHub / GitLab" />
                  </div>
                  <div className="space-y-1">
                    <Label>Default branch</Label>
                    <Input value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} placeholder="main" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Repository URL</Label>
                  <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/org/repo" />
                </div>
                <div className="space-y-1">
                  <Label>Deploy notes</Label>
                  <Textarea value={deployNotes} onChange={(e) => setDeployNotes(e.target.value)} rows={5} />
                </div>
                <div>
                  <Button
                    type="button"
                    disabled={!canManage || saveSettingsMutation.isPending}
                    onClick={() => saveSettingsMutation.mutate()}
                  >
                    Save repository info
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>Project-level docs (SOPs, briefs, docs, credentials guides).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="file"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="max-w-sm"
                    disabled={!canManage}
                  />
                  <Button
                    type="button"
                    onClick={() => uploadDocMutation.mutate()}
                    disabled={!canManage || uploadDocMutation.isPending || !docFile}
                  >
                    Upload
                  </Button>
                </div>
                <div className="space-y-2">
                  {(docsQuery.data ?? []).map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <a className="truncate text-sm underline" href={d.url ?? "#"} target="_blank" rel="noreferrer">
                          {d.name}
                        </a>
                        {d.size ? <p className="text-xs text-muted-foreground">{d.size}</p> : null}
                      </div>
                      {canManage ? (
                        <Button variant="ghost" size="icon" onClick={() => void deleteDoc(d.id)} title="Delete document">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="credentials">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{editingCredentialId ? "Edit Credential" : "New Credential"}</CardTitle>
                  <CardDescription>Secret value is encrypted at rest with visibility controls.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={credentialName} onChange={(e) => setCredentialName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Input
                      value={credentialType}
                      onChange={(e) => setCredentialType(e.target.value)}
                      placeholder="api_token / db / ssh / git_pat / other"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{editingCredentialId ? "Secret (leave blank to keep current)" : "Secret"}</Label>
                    <Textarea value={credentialSecret} onChange={(e) => setCredentialSecret(e.target.value)} rows={3} />
                  </div>
                  <div className="space-y-1">
                    <Label>Metadata (JSON)</Label>
                    <Textarea value={credentialMetadataText} onChange={(e) => setCredentialMetadataText(e.target.value)} rows={4} />
                  </div>
                  <div className="space-y-2">
                    <Label>Visibility</Label>
                    <div className="flex flex-wrap gap-2">
                      {VISIBILITY_OPTIONS.map((opt) => (
                        <Button
                          key={opt.id}
                          type="button"
                          variant={visibilityMode === opt.id ? "default" : "outline"}
                          onClick={() => setVisibilityMode(opt.id)}
                          size="sm"
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                    {visibilityMode === "roles" && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {ROLE_OPTIONS.map((r) => (
                          <label key={r} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={visibilityRoles.includes(r)}
                              onCheckedChange={(checked) => {
                                setVisibilityRoles((prev) =>
                                    checked ? Array.from(new Set([...prev, r])) : prev.filter((x) => x !== r),
                                );
                              }}
                            />
                            <span className="capitalize">{r}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {visibilityMode === "users" && (
                      <div className="max-h-40 overflow-auto rounded border p-2 space-y-1">
                        {members.map((m) => {
                          const id = Number(m.id);
                          return (
                            <label key={id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={visibilityUserIds.includes(id)}
                                onCheckedChange={(checked) => {
                                  setVisibilityUserIds((prev) =>
                                    checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id),
                                  );
                                }}
                              />
                              <span>{m.name}</span>
                              <Badge variant="secondary" className="ml-auto text-[10px]">
                                {m.role}
                              </Badge>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => saveCredentialMutation.mutate()}
                      disabled={!canManage || saveCredentialMutation.isPending}
                    >
                      {editingCredentialId ? "Update credential" : "Create credential"}
                    </Button>
                    {editingCredentialId ? (
                      <Button type="button" variant="outline" onClick={resetCredentialForm}>
                        Cancel edit
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Stored Credentials</CardTitle>
                  <CardDescription>Only credentials you are allowed to view are listed here.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(credentialsQuery.data ?? []).map((c) => (
                    <div key={c.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{c.name}</p>
                        <Badge variant="outline">{c.type}</Badge>
                        <Badge variant="secondary" className="ml-auto text-[10px]">
                          {c.visibilityMode}
                        </Badge>
                      </div>
                      <div className="rounded bg-muted/40 px-2 py-1 text-xs font-mono break-all">
                        {revealedMap[c.id] ?? c.maskedSecret}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" type="button" onClick={() => beginEditCredential(c)}>
                          Edit
                        </Button>
                        {revealedMap[c.id] ? (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => setRevealedMap((prev) => ({ ...prev, [c.id]: "" }))}
                          >
                            <EyeOff className="h-4 w-4 mr-1" />
                            Hide
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" type="button" onClick={() => void revealCredential(c.id)}>
                            <Eye className="h-4 w-4 mr-1" />
                            Reveal
                          </Button>
                        )}
                        {canManage ? (
                          <Button variant="ghost" size="sm" type="button" onClick={() => void deleteCredential(c.id)}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

