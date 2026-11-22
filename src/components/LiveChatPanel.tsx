import { useEffect, useRef, useState } from 'react';
import { Send, Pin, Trash2, Flag, BarChart3, Shield, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ChatMessageItem, LivePollItem, UserProfile } from '../types/ott';

interface LiveChatPanelProps {
  roomId: string;
  baseViewers: number;
  user: UserProfile | null;
  onParticipantVoted?: (participant: { id: number; votesCount: number }) => void;
}

const REACTIONS = ['🔥', '❤️', '👏', '😮', '🎬', '⚡'];

export function LiveChatPanel({ roomId, baseViewers, user, onParticipantVoted }: LiveChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [polls, setPolls] = useState<LivePollItem[]>([]);
  const [connectedViewers, setConnectedViewers] = useState(1);
  const [controls, setControls] = useState<{ slowModeSeconds: number; chatDisabled: boolean }>({
    slowModeSeconds: 0,
    chatDisabled: false,
  });
  const [input, setInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; emoji: string }>>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'polls'>('chat');
  const [newPollQuestion, setNewPollQuestion] = useState('');
  const [newPollOptions, setNewPollOptions] = useState('Save Rhea, Save Kabir, Twist Immunity');
  const [votedPollIds, setVotedPollIds] = useState<Set<number>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isModerator = Boolean(user && ['admin', 'moderator', 'broadcaster'].includes(user.role));

  useEffect(() => {
    let cancelled = false;
    apiFetch<{
      messages: ChatMessageItem[];
      polls: LivePollItem[];
      controls: { slowModeSeconds?: number; chatDisabled?: boolean };
      connectedCount: number;
    }>(`/api/live/rooms/${encodeURIComponent(roomId)}/state`)
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages);
        setPolls(res.polls);
        setControls({
          slowModeSeconds: Number(res.controls?.slowModeSeconds || 0),
          chatDisabled: Boolean(res.controls?.chatDisabled),
        });
        setConnectedViewers(Math.max(1, res.connectedCount));
      })
      .catch(() => {});

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'room:join',
          roomId,
          userUid: user?.uid || 'guest-viewer',
          username: user?.username || 'Guest Viewer',
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'presence:update') {
          setConnectedViewers(Math.max(1, Number(data.connectedCount || 1)));
        } else if (data.type === 'chat:message' && data.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev.slice(-80), data.message];
          });
        } else if (data.type === 'chat:pinned' && data.message) {
          setMessages((prev) => prev.map((m) => (m.id === data.message.id ? data.message : m)));
        } else if (data.type === 'chat:deleted' && data.messageId) {
          setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
        } else if (data.type === 'chat:controls' && data.controls) {
          setControls({
            slowModeSeconds: Number(data.controls.slowModeSeconds || 0),
            chatDisabled: Boolean(data.controls.chatDisabled),
          });
        } else if (data.type === 'chat:error') {
          setErrorMsg(String(data.error || 'Message blocked.'));
        } else if (data.type === 'reaction:received') {
          const item = { id: data.id || String(Date.now()), emoji: data.emoji };
          setFloatingReactions((prev) => [...prev.slice(-6), item]);
          window.setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== item.id));
          }, 1800);
        } else if (data.type === 'poll:updated' && data.poll) {
          setPolls((prev) => prev.map((p) => (p.id === data.poll.id ? data.poll : p)));
        } else if (data.type === 'poll:created' && data.poll) {
          setPolls((prev) => (prev.some((p) => p.id === data.poll.id) ? prev : [data.poll, ...prev]));
        } else if (data.type === 'participant:voted' && data.participant && onParticipantVoted) {
          onParticipantVoted(data.participant);
        }
      } catch {
        // Ignore malformed WS frames
      }
    };

    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
    };
  }, [roomId, user?.uid, user?.username, onParticipantVoted]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setErrorMsg('Reconnecting to live chat...');
      return;
    }
    wsRef.current.send(
      JSON.stringify({
        type: 'chat:send',
        roomId,
        username: user?.username || 'Cinema Fan',
        userRole: user?.role || 'user',
        message: trimmed,
      })
    );
    setInput('');
  }

  function sendReaction(emoji: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reaction:send', roomId, emoji }));
    }
  }

  async function votePoll(pollId: number, optionId: string) {
    if (votedPollIds.has(pollId)) return;
    try {
      const res = await apiFetch<{ poll: LivePollItem }>(
        `/api/live/rooms/${encodeURIComponent(roomId)}/polls/${pollId}/vote`,
        { method: 'POST', body: JSON.stringify({ optionId }) }
      );
      setPolls((prev) => prev.map((p) => (p.id === pollId ? res.poll : p)));
      setVotedPollIds((prev) => new Set(prev).add(pollId));
    } catch {
      // Ignore vote error
    }
  }

  async function moderateMessage(action: 'pin' | 'delete', messageId: number, pinned?: boolean) {
    try {
      await apiFetch('/api/admin/chat/moderate', {
        method: 'POST',
        body: JSON.stringify({ roomId, action, messageId, pinned }),
      });
    } catch {
      // Ignore
    }
  }

  async function updateControls(next: Partial<{ slowModeSeconds: number; chatDisabled: boolean }>) {
    try {
      await apiFetch('/api/admin/chat/moderate', {
        method: 'POST',
        body: JSON.stringify({ roomId, action: 'controls', ...next }),
      });
    } catch {
      // Ignore
    }
  }

  async function createPoll(e: React.FormEvent) {
    e.preventDefault();
    const options = newPollOptions.split(',').map((s) => s.trim()).filter(Boolean);
    if (!newPollQuestion.trim() || options.length < 2) return;
    try {
      await apiFetch('/api/admin/polls', {
        method: 'POST',
        body: JSON.stringify({ roomId, question: newPollQuestion, options }),
      });
      setNewPollQuestion('');
    } catch {
      // Ignore
    }
  }

  const pinnedMessage = messages.find((m) => m.isPinned);

  return (
    <div className="flex flex-col h-full min-h-[500px] max-h-[680px] rounded-2xl bg-[#111218] border border-white/[0.08] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              activeTab === 'chat' ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Live Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('polls')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              activeTab === 'polls' ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Polls ({polls.length})
          </button>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-300 tabular-nums">
          <Users className="w-3.5 h-3.5 text-[#E50914]" />
          {(baseViewers + connectedViewers).toLocaleString()}
        </span>
      </div>

      {/* Moderator Controls */}
      {isModerator && activeTab === 'chat' && (
        <div className="px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
          <span className="inline-flex items-center gap-1 text-[#D4AF37] font-medium">
            <Shield className="w-3.5 h-3.5" />
            Mod Controls
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateControls({ slowModeSeconds: controls.slowModeSeconds ? 0 : 5 })}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 cursor-pointer"
            >
              Slow Mode: {controls.slowModeSeconds ? `${controls.slowModeSeconds}s` : 'Off'}
            </button>
            <button
              type="button"
              onClick={() => updateControls({ chatDisabled: !controls.chatDisabled })}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 cursor-pointer"
            >
              {controls.chatDisabled ? 'Enable Chat' : 'Pause Chat'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'chat' ? (
        <>
          {/* Pinned Comment */}
          {pinnedMessage && (
            <div className="px-4 py-2.5 bg-[#1b1512] border-b border-[#D4AF37]/25 text-xs">
              <div className="flex items-center gap-1.5 text-[#D4AF37] font-semibold">
                <Pin className="w-3 h-3" />
                Pinned · {pinnedMessage.username}
              </div>
              <p className="text-zinc-200 mt-0.5">{pinnedMessage.message}</p>
            </div>
          )}

          {/* Message Feed */}
          <div ref={listRef} className="relative flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className="group flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span
                    className={`font-semibold mr-2 ${
                      msg.userRole === 'admin' || msg.userRole === 'moderator'
                        ? 'text-[#D4AF37]'
                        : 'text-zinc-300'
                    }`}
                  >
                    {msg.username}
                  </span>
                  <span className="text-zinc-200 break-words leading-relaxed">{msg.message}</span>
                </div>
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 shrink-0">
                  {isModerator && (
                    <>
                      <button
                        type="button"
                        onClick={() => moderateMessage('pin', msg.id, !msg.isPinned)}
                        aria-label="Pin comment"
                        className="p-1 hover:text-[#D4AF37] cursor-pointer"
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moderateMessage('delete', msg.id)}
                        aria-label="Delete comment"
                        className="p-1 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => apiFetch(`/api/live/messages/${msg.id}/report`, { method: 'POST' }).catch(() => {})}
                    aria-label="Report comment"
                    className="p-1 hover:text-amber-400 cursor-pointer"
                  >
                    <Flag className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* Live Emoji Burst */}
            {floatingReactions.length > 0 && (
              <div className="sticky bottom-2 right-2 flex justify-end gap-1.5 pointer-events-none">
                {floatingReactions.map((r) => (
                  <span key={r.id} className="text-lg animate-bounce">
                    {r.emoji}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Emoji Reaction Strip */}
          <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between gap-1">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => sendReaction(emoji)}
                aria-label={`React with ${emoji}`}
                className="flex-1 py-1.5 rounded-lg hover:bg-white/10 text-base transition-transform active:scale-110 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <form onSubmit={sendChat} className="p-3 border-t border-white/[0.08] space-y-2">
            {errorMsg && <p className="text-[11px] text-amber-400">{errorMsg}</p>}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                disabled={controls.chatDisabled}
                onChange={(e) => setInput(e.target.value)}
                placeholder={controls.chatDisabled ? 'Chat paused by moderators' : 'Say something in live chat...'}
                aria-label="Live chat message"
                className="flex-1 rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#E50914] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={controls.chatDisabled || !input.trim()}
                aria-label="Send chat message"
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#E50914] hover:bg-[#c80812] disabled:opacity-40 text-white shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {polls.map((poll) => {
            const totalVotes = poll.optionsJson.reduce((acc, o) => acc + o.votes, 0) || 1;
            const hasVoted = votedPollIds.has(poll.id);
            return (
              <div key={poll.id} className="rounded-xl bg-[#0a0b0f] border border-white/[0.08] p-4 space-y-3">
                <p className="font-display text-sm font-semibold text-white">{poll.question}</p>
                <div className="space-y-2">
                  {poll.optionsJson.map((opt) => {
                    const pct = Math.round((opt.votes / totalVotes) * 100);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => votePoll(poll.id, opt.id)}
                        disabled={hasVoted}
                        className="relative w-full text-left rounded-lg overflow-hidden bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 px-3 py-2.5 text-xs cursor-pointer disabled:cursor-default"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-[#E50914]/30 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex items-center justify-between gap-2">
                          <span className="font-medium text-white">{opt.label}</span>
                          <span className="font-mono text-zinc-300 tabular-nums">
                            {pct}% ({opt.votes.toLocaleString()})
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-zinc-500 tabular-nums">
                  {totalVotes.toLocaleString()} total votes · {hasVoted ? 'Vote recorded' : 'Tap an option to vote'}
                </p>
              </div>
            );
          })}

          {isModerator && (
            <form onSubmit={createPoll} className="rounded-xl bg-[#0a0b0f] border border-white/10 p-4 space-y-3">
              <p className="text-xs font-semibold text-[#D4AF37]">Launch Live Audience Poll</p>
              <input
                type="text"
                value={newPollQuestion}
                onChange={(e) => setNewPollQuestion(e.target.value)}
                placeholder="Poll question..."
                className="w-full rounded-lg bg-[#121319] border border-white/10 px-3 py-2 text-xs text-white"
              />
              <input
                type="text"
                value={newPollOptions}
                onChange={(e) => setNewPollOptions(e.target.value)}
                placeholder="Options separated by commas"
                className="w-full rounded-lg bg-[#121319] border border-white/10 px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-[#E50914] hover:bg-[#c80812] text-white text-xs font-semibold py-2 cursor-pointer"
              >
                Publish Live Poll
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
