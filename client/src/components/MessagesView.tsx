import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Hash, Search, Phone, Video, Info, Plus, Smile, Paperclip, Lock } from "lucide-react";
import { USERS, CHANNELS, MESSAGES, Message, Channel } from "@/lib/mockData";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function MessagesView() {
    const [activeChannelId, setActiveChannelId] = useState("general");
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>(MESSAGES);

    const activeChannel = CHANNELS.find(c => c.id === activeChannelId);
    const channelMessages = messages.filter(m => m.channelId === activeChannelId);

    const handleSend = () => {
        if (!input.trim()) return;
        const newMsg: Message = {
            id: `new-${Date.now()}`,
            channelId: activeChannelId,
            authorId: "u1", // Current user
            content: input,
            createdAt: "Just now"
        };
        setMessages([...messages, newMsg]);
        setInput("");
    };

    return (
        <div className="flex h-full bg-background">
            {/* Channel List */}
            <div className="w-64 border-r border-border bg-muted/10 flex flex-col">
                <div className="p-4 border-b border-border/50">
                    <h2 className="font-display font-semibold px-2 mb-4">Messages</h2>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Jump to..." className="pl-9 bg-background/50 border-border/50 h-9" />
                    </div>
                </div>
                
                <ScrollArea className="flex-1 px-3 py-4">
                    <div className="space-y-6">
                         <div>
                            <div className="flex items-center justify-between px-2 mb-2 group">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</h3>
                                <Plus className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer hover:text-foreground" />
                            </div>
                            <div className="space-y-0.5">
                                {CHANNELS.map(channel => (
                                    <Button
                                        key={channel.id}
                                        variant="ghost"
                                        className={cn(
                                            "w-full justify-start h-8 px-2 font-normal",
                                            activeChannelId === channel.id ? "bg-sidebar-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                                        )}
                                        onClick={() => setActiveChannelId(channel.id)}
                                    >
                                        {channel.type === 'private' ? <Lock className="w-3.5 h-3.5 mr-2 opacity-70" /> : <Hash className="w-3.5 h-3.5 mr-2 opacity-70" />}
                                        <span className="truncate">{channel.name}</span>
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between px-2 mb-2 group">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direct Messages</h3>
                                <Plus className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer hover:text-foreground" />
                            </div>
                            <div className="space-y-0.5">
                                {Object.values(USERS).map(user => (
                                    <Button
                                        key={user.id}
                                        variant="ghost"
                                        className="w-full justify-start h-9 px-2 font-normal text-muted-foreground hover:text-foreground"
                                    >
                                        <div className="relative mr-2">
                                            <Avatar className="h-5 w-5">
                                                <AvatarImage src={user.avatar} />
                                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                                            </Avatar>
                                            <span className={cn(
                                                "absolute bottom-0 right-0 w-2 h-2 rounded-full border border-background",
                                                user.status === 'online' ? "bg-green-500" : 
                                                user.status === 'busy' ? "bg-red-500" : "bg-slate-400"
                                            )} />
                                        </div>
                                        <span className="truncate">{user.name}</span>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Chat Header */}
                <header className="h-14 border-b border-border/50 flex items-center justify-between px-6 bg-background/50 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-2">
                        {activeChannel?.type === 'private' ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Hash className="w-4 h-4 text-muted-foreground" />}
                        <h3 className="font-semibold text-foreground">{activeChannel?.name}</h3>
                         <div className="h-4 w-px bg-border mx-2" />
                         <span className="text-xs text-muted-foreground">{activeChannel?.members.length} members</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                            <Phone className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                            <Video className="w-4 h-4" />
                        </Button>
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                            <Info className="w-4 h-4" />
                        </Button>
                    </div>
                </header>

                {/* Messages */}
                <ScrollArea className="flex-1 p-6">
                    <div className="space-y-6">
                        {/* Welcome Message */}
                        <div className="pb-8">
                             <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-4">
                                <Hash className="w-8 h-8 text-muted-foreground" />
                             </div>
                             <h1 className="text-2xl font-bold mb-2">Welcome to #{activeChannel?.name}!</h1>
                             <p className="text-muted-foreground">This is the start of the <span className="font-medium text-foreground">#{activeChannel?.name}</span> channel.</p>
                        </div>

                        {channelMessages.map((msg, idx) => {
                            const author = USERS[msg.authorId];
                            const prevMsg = channelMessages[idx - 1];
                            const isSequence = prevMsg && prevMsg.authorId === msg.authorId;

                            return (
                                <div key={msg.id} className={cn("group flex gap-4", isSequence ? "mt-1" : "mt-6")}>
                                    {!isSequence ? (
                                        <Avatar className="h-9 w-9 rounded-md mt-0.5">
                                            <AvatarImage src={author?.avatar} />
                                            <AvatarFallback>{author?.name[0]}</AvatarFallback>
                                        </Avatar>
                                    ) : (
                                        <div className="w-9" /> // Spacer
                                    )}
                                    
                                    <div className="flex-1 min-w-0">
                                        {!isSequence && (
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-sm hover:underline cursor-pointer">{author?.name}</span>
                                                <span className="text-xs text-muted-foreground">{msg.createdAt}</span>
                                            </div>
                                        )}
                                        <p className="text-foreground/90 text-sm leading-relaxed">{msg.content}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="p-4 pt-2">
                    <div className="relative bg-muted/30 rounded-xl border border-border/60 focus-within:ring-1 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
                        <div className="flex items-center gap-1 p-2 border-b border-border/30">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                <span className="font-bold text-xs">B</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                <span className="italic text-xs font-serif">I</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                <span className="line-through text-xs">S</span>
                            </Button>
                            <div className="h-4 w-px bg-border/50 mx-1" />
                             <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                <Paperclip className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        <Input 
                            className="bg-transparent border-none focus-visible:ring-0 px-4 py-3 min-h-[44px]" 
                            placeholder={`Message #${activeChannel?.name}`}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        />
                        <div className="flex justify-between items-center p-2 pt-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <Plus className="w-4 h-4" />
                            </Button>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                    <Smile className="w-4 h-4" />
                                </Button>
                                <Button size="sm" className="h-7 px-3" onClick={handleSend}>Send</Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
