import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Lock, Bell, Mail, Shield, Camera, User } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { getUserInitials } from "@/lib/utils";

export default function UserProfileView() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  const initials = getUserInitials(user.name, user.username);
  const avatarSrc = user.avatar?.trim() || undefined;
  const emailDisplay = user.email?.trim() || "No email on file";
  const roleLabel = user.role;

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden animate-in fade-in duration-300">
      <div className="border-b border-border p-6 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <h1 className="text-3xl font-display font-bold">Account Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your personal profile and preferences.</p>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="profile" className="h-full flex flex-col">
          <div className="px-6 border-b border-border bg-muted/10">
            <TabsList className="bg-transparent h-12 gap-6 p-0">
              <TabsTrigger
                value="profile"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium"
              >
                Profile
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium"
              >
                Security
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full font-medium"
              >
                Notifications
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto bg-muted/5 p-6 md:p-10">
            <TabsContent value="profile" className="max-w-2xl space-y-8 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Your workspace profile as stored for this account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="flex items-center gap-6">
                    <div className="relative group">
                      <Avatar className="w-24 h-24 border-4 border-background shadow-sm">
                        <AvatarImage src={avatarSrc} />
                        <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer pointer-events-none">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-medium">Profile Photo</h3>
                      <p className="text-sm text-muted-foreground">
                        Shown across the app when you comment or appear on the team. An administrator can update your
                        avatar in Company Settings → Users.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Button variant="outline" size="sm" type="button" disabled>
                          <Upload className="w-3 h-3 mr-2" /> Upload
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input value={user.name} readOnly className="bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        Username
                      </Label>
                      <Input value={user.username} readOnly className="bg-muted/50" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <div className="flex">
                      <div className="relative flex-1">
                        <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input value={emailDisplay} readOnly className="pl-9 bg-muted/50" />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Contact your administrator to change your name, username, or email.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Role</Label>
                    <div>
                      <Badge variant="outline" className="capitalize px-3 py-1">
                        <Shield className="w-3 h-3 mr-2 text-primary" />
                        {roleLabel}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/20 px-6 py-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Profile fields are managed by administrators in Company Settings. This page reflects your current
                    sign-in account ({user.username}).
                  </p>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="max-w-2xl space-y-6 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Password</CardTitle>
                  <CardDescription>Change your password to keep your account secure.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Current Password</Label>
                    <Input type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm New Password</Label>
                    <Input type="password" />
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/20 px-6 py-4 border-t border-border flex justify-end">
                  <Button type="button">Update Password</Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Two-Factor Authentication</CardTitle>
                  <CardDescription>Add an extra layer of security to your account.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">Protect your account with 2FA</p>
                    <p className="text-xs text-muted-foreground">
                      We&apos;ll ask for a code when you log in from a new device.
                    </p>
                  </div>
                  <Switch />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="max-w-2xl space-y-6 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Email Notifications</CardTitle>
                  <CardDescription>Choose what updates you want to receive via email.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Task Assignments</Label>
                      <p className="text-xs text-muted-foreground">Receive emails when you&apos;re assigned to a task.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Mentions & Comments</Label>
                      <p className="text-xs text-muted-foreground">
                        Receive emails when someone mentions you or comments on your task.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Project Updates</Label>
                      <p className="text-xs text-muted-foreground">Weekly digest of project activity.</p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/20 px-6 py-4 border-t border-border flex justify-end">
                  <Button variant="outline" type="button">
                    Reset to Defaults
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
