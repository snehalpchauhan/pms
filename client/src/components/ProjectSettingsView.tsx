import { useEffect, useRef, useState } from "react";
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
import { Trash2, Eye, EyeOff, Copy } from "lucide-react";

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
  visibilityMode: "project_members" | "roles" | "users";
  visibilityRoles: string[];
  visibilityUserIds: number[];
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
const CREDENTIAL_TYPE_OPTIONS = ["logins", "tokens", "database", "other"] as const;

function normalizeCredentialType(raw: unknown): (typeof CREDENTIAL_TYPE_OPTIONS)[number] {
  const t = String(raw ?? "").trim().toLowerCase();
  if ((CREDENTIAL_TYPE_OPTIONS as readonly string[]).includes(t)) {
    return t as (typeof CREDENTIAL_TYPE_OPTIONS)[number];
  }
  return "other";
}

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
  const canManage = currentUserRole === "admin" || isOwner;

  const [notes, setNotes] = useState("");
  const [importantLinksText, setImportantLinksText] = useState("");
  const [repoProvider, setRepoProvider] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [deployNotes, setDeployNotes] = useState("");

  const [docFile, setDocFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docVisibilityMode, setDocVisibilityMode] = useState<"project_members" | "roles" | "users">("project_members");
  const [docVisibilityRoles, setDocVisibilityRoles] = useState<string[]>([]);
  const [docVisibilityUserIds, setDocVisibilityUserIds] = useState<number[]>([]);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [editingDocVisibilityMode, setEditingDocVisibilityMode] = useState<"project_members" | "roles" | "users">("project_members");
  const [editingDocVisibilityRoles, setEditingDocVisibilityRoles] = useState<string[]>([]);
  const [editingDocVisibilityUserIds, setEditingDocVisibilityUserIds] = useState<number[]>([]);
  const [revealedMap, setRevealedMap] = useState<Record<number, { secret: string; password: string }>>({});
  const [editingCredentialId, setEditingCredentialId] = useState<number | null>(null);
  const [credentialFormOpen, setCredentialFormOpen] = useState(false);
  const [credentialName, setCredentialName] = useState("");
  const [credentialType, setCredentialType] = useState<(typeof CREDENTIAL_TYPE_OPTIONS)[number]>("logins");
  const [credentialUrl, setCredentialUrl] = useState("");
  const [credentialUsername, setCredentialUsername] = useState("");
  const [credentialHost, setCredentialHost] = useState("");
  const [credentialPort, setCredentialPort] = useState("");
  const [credentialDatabase, setCredentialDatabase] = useState("");
  const [credentialNotes, setCredentialNotes] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [credentialSecret, setCredentialSecret] = useState("");
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
        visibilityMode: docVisibilityMode,
        visibilityRoles: docVisibilityRoles,
        visibilityUserIds: docVisibilityUserIds,
      });
    },
    onSuccess: async () => {
      setDocFile(null);
      setDocVisibilityMode("project_members");
      setDocVisibilityRoles([]);
      setDocVisibilityUserIds([]);
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
    setCredentialFormOpen(false);
    setCredentialName("");
    setCredentialType("logins");
    setCredentialUrl("");
    setCredentialUsername("");
    setCredentialHost("");
    setCredentialPort("");
    setCredentialDatabase("");
    setCredentialNotes("");
    setCredentialPassword("");
    setCredentialSecret("");
    setVisibilityMode("roles");
    setVisibilityRoles(["admin", "manager"]);
    setVisibilityUserIds([]);
  };

  const beginEditCredential = (row: ProjectCredential) => {
    setCredentialFormOpen(true);
    setEditingCredentialId(row.id);
    setCredentialName(row.name);
    const normalized = String(row.type ?? "").trim().toLowerCase();
    if ((CREDENTIAL_TYPE_OPTIONS as readonly string[]).includes(normalized)) {
      setCredentialType(normalized as (typeof CREDENTIAL_TYPE_OPTIONS)[number]);
    } else {
      setCredentialType("other");
    }
    setCredentialUrl(String(row.metadata?.url ?? ""));
    setCredentialUsername(String(row.metadata?.username ?? ""));
    setCredentialHost(String(row.metadata?.host ?? ""));
    setCredentialPort(row.metadata?.port != null ? String(row.metadata.port) : "");
    setCredentialDatabase(String(row.metadata?.database ?? ""));
    setCredentialNotes(String(row.metadata?.notes ?? ""));
    setCredentialPassword("");
    setCredentialSecret("");
    setVisibilityMode(row.visibilityMode);
    setVisibilityRoles(row.visibilityRoles ?? []);
    setVisibilityUserIds(row.visibilityUserIds ?? []);
  };

  const saveCredentialMutation = useMutation({
    mutationFn: async () => {
      if (!credentialName.trim()) throw new Error("Credential name is required");
      if (!credentialType.trim()) throw new Error("Credential type is required");
      if ((credentialType === "logins" || credentialType === "database") && !credentialPassword.trim() && !editingCredentialId) {
        throw new Error("Password is required for this credential type");
      }
      if (credentialType === "tokens" && !credentialSecret.trim() && !editingCredentialId) {
        throw new Error("Token is required for token credentials");
      }
      if (credentialType === "other" && !credentialNotes.trim()) {
        throw new Error("Please enter details for 'other'");
      }
      const body = {
        name: credentialName.trim(),
        type: credentialType.trim(),
        url: credentialUrl.trim() || undefined,
        username: credentialUsername.trim() || undefined,
        host: credentialHost.trim() || undefined,
        port: credentialPort.trim() ? Number(credentialPort) : undefined,
        database: credentialDatabase.trim() || undefined,
        notes: credentialNotes.trim() || undefined,
        password: credentialPassword.trim() || undefined,
        secret: credentialSecret.trim() || undefined,
        visibilityMode,
        visibilityRoles,
        visibilityUserIds,
      };
      if (editingCredentialId) {
        await apiRequest("PATCH", `/api/projects/${projectId}/credentials/${editingCredentialId}`, body);
      } else {
        if (!credentialPassword.trim() && !credentialSecret.trim()) {
          throw new Error("Provide password and/or secret");
        }
        await apiRequest("POST", `/api/projects/${projectId}/credentials`, {
          ...body,
          password: credentialPassword.trim(),
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

  const revealCredential = async (id: number): Promise<{ secret: string; password: string } | null> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/credentials/${id}/reveal`, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || "Reveal failed");
      }
      const data = (await res.json()) as { secret: string; password: string };
      setRevealedMap((prev) => ({ ...prev, [id]: { secret: data.secret, password: data.password } }));
      return data;
    } catch (e) {
      toast({
        title: "Could not reveal secret",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const copyCredentialSecretField = async (
    cred: ProjectCredential,
    field: "password" | "secret",
    label: string,
  ) => {
    let revealed = revealedMap[cred.id];
    if (!revealed) {
      const loaded = await revealCredential(cred.id);
      if (!loaded) return;
      revealed = loaded;
    }
    await copyToClipboard(label, String(revealed[field] ?? ""));
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

  const copyToClipboard = async (label: string, value: string) => {
    const text = String(value ?? "");
    if (!text.trim()) {
      toast({ title: `${label} is empty` });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const startEditDocumentAccess = (doc: ProjectDocument) => {
    setEditingDocId(doc.id);
    setEditingDocVisibilityMode(doc.visibilityMode);
    setEditingDocVisibilityRoles(doc.visibilityRoles ?? []);
    setEditingDocVisibilityUserIds(doc.visibilityUserIds ?? []);
  };

  const cancelEditDocumentAccess = () => {
    setEditingDocId(null);
    setEditingDocVisibilityMode("project_members");
    setEditingDocVisibilityRoles([]);
    setEditingDocVisibilityUserIds([]);
  };

  const updateDocumentVisibility = async (
    docId: number,
    visibilityMode: "project_members" | "roles" | "users",
    visibilityRoles: string[],
    visibilityUserIds: number[],
  ) => {
    try {
      await apiRequest("PATCH", `/api/projects/${projectId}/documents/${docId}`, {
        visibilityMode,
        visibilityRoles,
        visibilityUserIds,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      toast({ title: "Document access updated" });
    } catch (e) {
      toast({
        title: "Could not update access",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const saveEditingDocumentAccess = async () => {
    if (editingDocId == null) return;
    await updateDocumentVisibility(
      editingDocId,
      editingDocVisibilityMode,
      editingDocVisibilityRoles,
      editingDocVisibilityUserIds,
    );
    cancelEditDocumentAccess();
  };

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
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    disabled={!canManage}
                  />
                  <Button type="button" variant="outline" disabled={!canManage} onClick={() => fileInputRef.current?.click()}>
                    Browse file
                  </Button>
                  <button
                    type="button"
                    className="max-w-sm rounded-md border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40"
                    disabled={!canManage}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {docFile ? docFile.name : "No file selected"}
                  </button>
                  <Button
                    type="button"
                    onClick={() => uploadDocMutation.mutate()}
                    disabled={!canManage || uploadDocMutation.isPending || !docFile}
                  >
                    Upload
                  </Button>
                </div>
                {canManage && (
                  <div className="space-y-2 rounded-md border p-3">
                    <Label className="text-xs text-muted-foreground">New document visibility</Label>
                    <div className="flex flex-wrap gap-2">
                      {VISIBILITY_OPTIONS.map((opt) => (
                        <Button
                          key={`doc-new-${opt.id}`}
                          type="button"
                          variant={docVisibilityMode === opt.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setDocVisibilityMode(opt.id)}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                    {docVisibilityMode === "roles" && (
                      <div className="grid grid-cols-2 gap-2">
                        {ROLE_OPTIONS.map((r) => (
                          <label key={`doc-role-${r}`} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={docVisibilityRoles.includes(r)}
                              onCheckedChange={(checked) =>
                                setDocVisibilityRoles((prev) =>
                                  checked ? Array.from(new Set([...prev, r])) : prev.filter((x) => x !== r),
                                )
                              }
                            />
                            <span className="capitalize">{r}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {docVisibilityMode === "users" && (
                      <div className="max-h-32 overflow-auto rounded border p-2 space-y-1">
                        {members.map((m) => {
                          const id = Number(m.id);
                          return (
                            <label key={`doc-user-${id}`} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={docVisibilityUserIds.includes(id)}
                                onCheckedChange={(checked) =>
                                  setDocVisibilityUserIds((prev) =>
                                    checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id),
                                  )
                                }
                              />
                              <span>{m.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {(docsQuery.data ?? []).map((d) => (
                    <div key={d.id} className="rounded-md border px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                        <a className="truncate text-sm underline" href={d.url ?? "#"} target="_blank" rel="noreferrer">
                          {d.name}
                        </a>
                        {d.size ? <p className="text-xs text-muted-foreground">{d.size}</p> : null}
                        </div>
                        <Badge variant="secondary" className="text-[10px]">{d.visibilityMode}</Badge>
                      </div>
                      {d.visibilityMode === "roles" && d.visibilityRoles.length > 0 ? (
                        <p className="text-xs text-muted-foreground">Roles: {d.visibilityRoles.join(", ")}</p>
                      ) : null}
                      {d.visibilityMode === "users" && d.visibilityUserIds.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Users:{" "}
                          {d.visibilityUserIds
                            .map((uid) => members.find((m) => Number(m.id) === Number(uid))?.name || `User ${uid}`)
                            .join(", ")}
                        </p>
                      ) : null}
                      {canManage ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" type="button" onClick={() => startEditDocumentAccess(d)}>
                            Manage access
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => void deleteDoc(d.id)} title="Delete document">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                      {canManage && editingDocId === d.id && (
                        <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                          <Label className="text-xs text-muted-foreground">Document access</Label>
                          <div className="flex flex-wrap gap-2">
                            {VISIBILITY_OPTIONS.map((opt) => (
                              <Button
                                key={`doc-edit-${d.id}-${opt.id}`}
                                type="button"
                                size="sm"
                                variant={editingDocVisibilityMode === opt.id ? "default" : "outline"}
                                onClick={() => setEditingDocVisibilityMode(opt.id)}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                          {editingDocVisibilityMode === "roles" && (
                            <div className="grid grid-cols-2 gap-2">
                              {ROLE_OPTIONS.map((r) => (
                                <label key={`doc-edit-role-${d.id}-${r}`} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={editingDocVisibilityRoles.includes(r)}
                                    onCheckedChange={(checked) =>
                                      setEditingDocVisibilityRoles((prev) =>
                                        checked ? Array.from(new Set([...prev, r])) : prev.filter((x) => x !== r),
                                      )
                                    }
                                  />
                                  <span className="capitalize">{r}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {editingDocVisibilityMode === "users" && (
                            <div className="max-h-32 overflow-auto rounded border p-2 space-y-1">
                              {members.map((m) => {
                                const uid = Number(m.id);
                                return (
                                  <label key={`doc-edit-user-${d.id}-${uid}`} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                      checked={editingDocVisibilityUserIds.includes(uid)}
                                      onCheckedChange={(checked) =>
                                        setEditingDocVisibilityUserIds((prev) =>
                                          checked ? Array.from(new Set([...prev, uid])) : prev.filter((x) => x !== uid),
                                        )
                                      }
                                    />
                                    <span>{m.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" type="button" onClick={() => void saveEditingDocumentAccess()}>
                              Save access
                            </Button>
                            <Button size="sm" variant="outline" type="button" onClick={cancelEditDocumentAccess}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="credentials">
            <div className="grid gap-4">
              {credentialFormOpen ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>{editingCredentialId ? "Edit Credential" : "New Credential"}</CardTitle>
                      <CardDescription>Secret value is encrypted at rest with visibility controls.</CardDescription>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={resetCredentialForm}>
                      Back to list
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={credentialName} onChange={(e) => setCredentialName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <div className="flex flex-wrap gap-2">
                      {CREDENTIAL_TYPE_OPTIONS.map((t) => (
                        <Button
                          key={t}
                          type="button"
                          size="sm"
                          variant={credentialType === t ? "default" : "outline"}
                          onClick={() => setCredentialType(t)}
                          className="capitalize"
                        >
                          {t}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fill only the fields relevant to this credential. All fields support long values.
                  </p>
                  {(credentialType === "logins" || credentialType === "tokens") && (
                    <div className="space-y-1">
                      <Label>URL</Label>
                      <Input value={credentialUrl} onChange={(e) => setCredentialUrl(e.target.value)} placeholder="https://..." />
                    </div>
                  )}
                  {credentialType === "logins" && (
                    <>
                      <div className="space-y-1">
                        <Label>Username</Label>
                        <Input value={credentialUsername} onChange={(e) => setCredentialUsername(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Password {editingCredentialId ? "(leave blank to keep current)" : ""}</Label>
                        <Input
                          type="password"
                          value={credentialPassword}
                          onChange={(e) => setCredentialPassword(e.target.value)}
                          placeholder="Enter password"
                        />
                      </div>
                    </>
                  )}
                  {credentialType === "tokens" && (
                    <div className="space-y-1">
                      <Label>{editingCredentialId ? "Token (leave blank to keep current)" : "Token"}</Label>
                      <Textarea value={credentialSecret} onChange={(e) => setCredentialSecret(e.target.value)} rows={4} />
                    </div>
                  )}
                  {credentialType === "database" && (
                    <>
                      <div className="space-y-1">
                        <Label>DB Host</Label>
                        <Input value={credentialHost} onChange={(e) => setCredentialHost(e.target.value)} placeholder="db.example.com / server ip" />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>DB Name</Label>
                          <Input value={credentialDatabase} onChange={(e) => setCredentialDatabase(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Port</Label>
                          <Input value={credentialPort} onChange={(e) => setCredentialPort(e.target.value)} placeholder="5432" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>DB Password {editingCredentialId ? "(leave blank to keep current)" : ""}</Label>
                        <Input
                          type="password"
                          value={credentialPassword}
                          onChange={(e) => setCredentialPassword(e.target.value)}
                          placeholder="Enter DB password"
                        />
                      </div>
                    </>
                  )}
                  {credentialType === "other" && (
                    <div className="space-y-1">
                      <Label>Details</Label>
                      <Textarea
                        value={credentialNotes}
                        onChange={(e) => setCredentialNotes(e.target.value)}
                        rows={6}
                        placeholder="Type any credential details/instructions here..."
                      />
                    </div>
                  )}
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
              ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>Stored Credentials</CardTitle>
                      <CardDescription>Only credentials you are allowed to view are listed here.</CardDescription>
                    </div>
                    {canManage ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (credentialFormOpen && editingCredentialId == null) {
                            setCredentialFormOpen(false);
                          } else {
                            setCredentialFormOpen(true);
                            setEditingCredentialId(null);
                            setCredentialName("");
                            setCredentialType("logins");
                            setCredentialUrl("");
                            setCredentialUsername("");
                            setCredentialHost("");
                            setCredentialPort("");
                            setCredentialDatabase("");
                            setCredentialNotes("");
                            setCredentialPassword("");
                            setCredentialSecret("");
                            setVisibilityMode("roles");
                            setVisibilityRoles(["admin", "manager"]);
                            setVisibilityUserIds([]);
                          }
                        }}
                      >
                        {credentialFormOpen && editingCredentialId == null ? "Close" : "Add new credential"}
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(credentialsQuery.data ?? []).map((c) => (
                    <div key={c.id} className="rounded-md border p-3 space-y-2">
                      {(() => {
                        const cardType = normalizeCredentialType(c.type);
                        return (
                          <>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{c.name}</p>
                        <Badge variant="outline" className="capitalize">{cardType}</Badge>
                        <Badge variant="secondary" className="ml-auto text-[10px]">
                          {c.visibilityMode}
                        </Badge>
                      </div>
                      {(cardType === "logins" || cardType === "tokens") && "url" in c.metadata && String(c.metadata.url ?? "").trim() ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-16 shrink-0">URL</span>
                          <span className="font-mono break-all flex-1">{String(c.metadata.url)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            type="button"
                            onClick={() => void copyToClipboard("URL", String(c.metadata.url))}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                      {cardType === "logins" && "username" in c.metadata && String(c.metadata.username ?? "").trim() ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-16 shrink-0">User</span>
                          <span className="font-mono break-all flex-1">{String(c.metadata.username)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            type="button"
                            onClick={() => void copyToClipboard("Username", String(c.metadata.username))}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                      {cardType === "database" && "host" in c.metadata && String(c.metadata.host ?? "").trim() ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-16 shrink-0">DB Host</span>
                          <span className="font-mono break-all flex-1">{String(c.metadata.host)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            type="button"
                            onClick={() => void copyToClipboard("Host", String(c.metadata.host))}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                      {cardType === "database" && "database" in c.metadata && String(c.metadata.database ?? "").trim() ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-16 shrink-0">DB Name</span>
                          <span className="font-mono break-all flex-1">{String(c.metadata.database)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            type="button"
                            onClick={() => void copyToClipboard("DB name", String(c.metadata.database))}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                      {cardType === "database" && "port" in c.metadata && c.metadata.port != null && String(c.metadata.port).trim() ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-16 shrink-0">Port</span>
                          <span className="font-mono break-all flex-1">{String(c.metadata.port)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            type="button"
                            onClick={() => void copyToClipboard("Port", String(c.metadata.port))}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}

                      {(cardType === "other" && "notes" in c.metadata && String(c.metadata.notes ?? "").trim()) ? (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Details</p>
                          <div className="rounded bg-muted/40 px-2 py-1 text-xs whitespace-pre-wrap break-words">
                            {String(c.metadata.notes)}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => void copyToClipboard("Details", String(c.metadata.notes))}
                          >
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy details
                          </Button>
                        </div>
                      ) : null}

                      {(cardType === "logins" || cardType === "database") ? (
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground w-16 shrink-0">Password</p>
                          <div className="flex items-center gap-2 flex-1">
                            <div className="rounded bg-muted/40 px-2 py-1 text-xs font-mono break-all flex-1">
                              {revealedMap[c.id] ? (revealedMap[c.id].password || "(empty)") : c.maskedSecret}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              type="button"
                              onClick={() =>
                                revealedMap[c.id]
                                  ? setRevealedMap((prev) => {
                                      const next = { ...prev };
                                      delete next[c.id];
                                      return next;
                                    })
                                  : void revealCredential(c.id)
                              }
                              title={revealedMap[c.id] ? "Hide password" : "Reveal password"}
                            >
                              {revealedMap[c.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              type="button"
                              onClick={() => void copyCredentialSecretField(c, "password", "Password")}
                              title="Copy password"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {cardType === "tokens" ? (
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground w-16 shrink-0">Token</p>
                          <div className="flex items-center gap-2 flex-1">
                            <div className="rounded bg-muted/40 px-2 py-1 text-xs font-mono break-all flex-1">
                              {revealedMap[c.id] ? (revealedMap[c.id].secret || "(empty)") : c.maskedSecret}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              type="button"
                              onClick={() =>
                                revealedMap[c.id]
                                  ? setRevealedMap((prev) => {
                                      const next = { ...prev };
                                      delete next[c.id];
                                      return next;
                                    })
                                  : void revealCredential(c.id)
                              }
                              title={revealedMap[c.id] ? "Hide token" : "Reveal token"}
                            >
                              {revealedMap[c.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              type="button"
                              onClick={() => void copyCredentialSecretField(c, "secret", "Token")}
                              title="Copy token"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" type="button" onClick={() => beginEditCredential(c)}>
                          Edit
                        </Button>
                        {canManage ? (
                          <Button variant="ghost" size="sm" type="button" onClick={() => void deleteCredential(c.id)}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </CardContent>
              </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

