import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Hash, Phone, Video, Info, Plus, Smile, Paperclip, Lock, ArrowLeft } from "lucide-react";
import { USERS, CHANNELS, MESSAGES, Message, Project } from "@/lib/mockData";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface MessagesViewProps {
    project: Project;
    channelId?: string;
}

export default function MessagesView({ project, channelId }: MessagesViewProps) {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>(MESSAGES);

    // Default to first channel if none selected
    const activeChannelId = channelId || CHANNELS.find(c => c.projectId === project.id)?.id;
    const activeChannel = CHANNELS.find(c => c.id === activeChannelId);
    
    // Check if it's a DM (starts with dm-)
    const isDM = activeChannelId?.startsWith('dm-');
    const dmUser = isDM ? USERS[activeChannelId!.replace('dm-', '')] : null;

    const channelMessages = messages.filter(m => m.channelId === activeChannelId);

    const handleSend = () => {
        if (!input.trim() || !activeChannelId) return;
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

    if (!activeChannel && !isDM) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground h-full bg-background/50">
                <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                    <Hash className="w-8 h-8 opacity-50" />
                </div>
                <p>Select a channel or team member to start messaging</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Chat Header */}
            <header className="h-14 border-b border-border/50 flex items-center justify-between px-6 bg-background/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3">
                    {isDM ? (
                        <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={dmUser?.avatar} />
                                <AvatarFallback>{dmUser?.name[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                                <h3 className="font-semibold text-foreground leading-none">{dmUser?.name}</h3>
                                <span className="text-xs text-muted-foreground capitalize">{dmUser?.status}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            {activeChannel?.type === 'private' ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Hash className="w-4 h-4 text-muted-foreground" />}
                            <h3 className="font-semibold text-foreground">{activeChannel?.name}</h3>
                            <div className="h-4 w-px bg-border mx-2" />
                            <span className="text-xs text-muted-foreground">{activeChannel?.members.length} members</span>
                        </div>
                    )}
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
                <div className="space-y-6 max-w-4xl mx-auto">
                    <div className="pb-8 text-center sm:text-left">
                        {isDM ? (
                            <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
                                <Avatar className="w-16 h-16">
                                    <AvatarImage src={dmUser?.avatar} />
                                    <AvatarFallback>{dmUser?.name[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <h1 className="text-2xl font-bold mb-1">{dmUser?.name}</h1>
                                    <p className="text-muted-foreground">This is the beginning of your direct message history with <span className="font-medium text-foreground">{dmUser?.name}</span>.</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-4 mx-auto sm:mx-0">
                                    <Hash className="w-8 h-8 text-muted-foreground" />
                                </div>
                                <h1 className="text-2xl font-bold mb-2">Welcome to #{activeChannel?.name}!</h1>
                                <p className="text-muted-foreground">This is the start of the <span className="font-medium text-foreground">#{activeChannel?.name}</span> channel in {project.name}.</p>
                            </>
                        )}
                    </div>

                    {channelMessages.map((msg, idx) => {
                        const author = USERS[msg.authorId];
                        const prevMsg = channelMessages[idx - 1];
                        const isSequence = prevMsg && prevMsg.authorId === msg.authorId;

                        return (
                            <div key={msg.id} className={cn("group flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300", isSequence ? "mt-1" : "mt-6")}>
                                {!isSequence ? (
                                    <Avatar className="h-10 w-10 rounded-xl mt-0.5 border border-border/50">
                                        <AvatarImage src={author?.avatar} />
                                        <AvatarFallback>{author?.name[0]}</AvatarFallback>
                                    </Avatar>
                                ) : (
                                    <div className="w-10" /> 
                                )}
                                
                                <div className="flex-1 min-w-0">
                                    {!isSequence && (
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-sm hover:underline cursor-pointer text-foreground">{author?.name}</span>
                                            <span className="text-xs text-muted-foreground">{msg.createdAt}</span>
                                        </div>
                                    )}
                                    <p className="text-foreground/90 text-[15px] leading-relaxed">{msg.content}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 pt-2">
                <div className="max-w-4xl mx-auto relative bg-muted/30 rounded-xl border border-border/60 focus-within:ring-1 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all shadow-sm">
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
                        className="bg-transparent border-none focus-visible:ring-0 px-4 py-3 min-h-[44px] text-base" 
                        placeholder={`Message ${isDM ? dmUser?.name : `#${activeChannel?.name}`}`}
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
                            <Button size="sm" className="h-7 px-4 font-medium" onClick={handleSend}>Send</Button>
                        </div>
                    </div>
                </div>
                <div className="text-center mt-2 text-[10px] text-muted-foreground">
                    <strong>Shift + Enter</strong> for new line
                </div>
            </div>
        </div>
    );
}
