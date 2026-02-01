"use client";

import { useState } from "react";
import {
  BookOpen,
  Zap,
  MessageSquare,
  Music,
  Wrench,
  Send,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const commandCategories = [
  {
    name: "Music",
    icon: Music,
    commands: [
      { name: "/play <query>", description: "Play a song or add it to the queue" },
      { name: "/skip", description: "Skip the current track" },
      { name: "/pause", description: "Pause or resume playback" },
      { name: "/stop", description: "Stop playback and clear the queue" },
      { name: "/queue", description: "View the current queue" },
      { name: "/nowplaying", description: "Show the currently playing track" },
      { name: "/volume <level>", description: "Set the playback volume" },
      { name: "/seek <position>", description: "Seek to a position in the current track" },
      { name: "/shuffle", description: "Shuffle the queue" },
      { name: "/repeat <mode>", description: "Set repeat mode (off, track, queue)" },
      { name: "/playlist", description: "Manage saved playlists" },
      { name: "/stats", description: "View listening statistics" },
    ],
  },
  {
    name: "Utility",
    icon: Wrench,
    commands: [
      { name: "/help", description: "Show all available commands" },
      { name: "/feedback <message>", description: "Send feedback to the developers" },
    ],
  },
];

const howItWorksSteps = [
  {
    step: 1,
    title: "Add Beatbox",
    description: "Invite the bot to your Discord server",
  },
  {
    step: 2,
    title: "Join a Voice Channel",
    description: "Join any voice channel in your server",
  },
  {
    step: 3,
    title: "Use /play",
    description: "Search for a song or paste a link",
  },
  {
    step: 4,
    title: "Control from Dashboard",
    description: "Use this dashboard to manage playback",
  },
];

export default function HelpPage() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    setSending(true);
    setStatus(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });

      if (res.ok) {
        setStatus({ type: "success", text: "Feedback sent! Thank you." });
        setMessage("");
      } else {
        const data = await res.json();
        setStatus({
          type: "error",
          text: data.error ?? "Failed to send feedback. Please try again.",
        });
      }
    } catch {
      setStatus({
        type: "error",
        text: "Failed to send feedback. Please try again.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <h1 className="mb-8 text-3xl font-bold">Help</h1>

      {/* Commands Section */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Commands</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {commandCategories.map((category) => (
            <div
              key={category.name}
              className="rounded-xl border bg-card p-5"
            >
              <div className="mb-3 flex items-center gap-2">
                <category.icon className="h-4 w-4 text-primary" />
                <h3 className="font-medium">{category.name}</h3>
              </div>
              <ul className="space-y-2">
                {category.commands.map((cmd) => (
                  <li key={cmd.name} className="text-sm">
                    <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">
                      {cmd.name}
                    </code>
                    <span className="ml-2 text-muted-foreground">
                      {cmd.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">How It Works</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorksSteps.map((step) => (
            <div
              key={step.step}
              className="rounded-xl border bg-card p-5"
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {step.step}
              </div>
              <h3 className="font-medium">{step.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Feedback Form Section */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Send Feedback</h2>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <p className="mb-4 text-sm text-muted-foreground">
            Have a suggestion or found a bug? Let us know!
          </p>

          <form onSubmit={handleSubmitFeedback}>
            <div className="relative">
              <textarea
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setStatus(null);
                }}
                placeholder="Your feedback..."
                required
                maxLength={1000}
                rows={4}
                className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary"
              />
              <span className="absolute bottom-3 right-3 text-xs text-muted-foreground">
                {message.length}/1000
              </span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className={cn(
                  "flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
                )}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Sending..." : "Send Feedback"}
              </button>

              {status && (
                <p
                  className={cn(
                    "text-sm",
                    status.type === "success"
                      ? "text-green-500"
                      : "text-red-500"
                  )}
                >
                  {status.text}
                </p>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
