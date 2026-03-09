'use client';

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import { Bot, Send, AlertTriangle, Loader2, User } from 'lucide-react';
import { ChatMessage } from '@/lib/types';

const SUGGESTIONS = [
  'What are the top supply chain risks for generic antibiotics?',
  'Explain FDA Class I vs Class II recall implications',
  'Which API ingredients have high geographic concentration risk?',
  'Summarize recent trends in drug shortage root causes',
];

export default function AnalystPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveContext, setLiveContext] = useState<{
    shortages: Record<string, unknown>[];
    recalls: Record<string, unknown>[];
  }>({ shortages: [], recalls: [] });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prefillHandled = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch live context data for enriching the system prompt
  useEffect(() => {
    async function fetchContext() {
      const [shortageRes, recallRes] = await Promise.allSettled([
        fetch('/api/shortages'),
        fetch('/api/recalls?limit=20&days=90'),
      ]);

      const shortages =
        shortageRes.status === 'fulfilled' && shortageRes.value.ok
          ? (await shortageRes.value.json()).results || []
          : [];
      const recalls =
        recallRes.status === 'fulfilled' && recallRes.value.ok
          ? (await recallRes.value.json()).results || []
          : [];

      setLiveContext({ shortages, recalls });
    }
    fetchContext();
  }, []);

  // Check for prefill from drug detail page
  useEffect(() => {
    if (prefillHandled.current) return;
    const prefill = sessionStorage.getItem('analyst_prefill');
    if (prefill) {
      sessionStorage.removeItem('analyst_prefill');
      prefillHandled.current = true;
      setInput(prefill);
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    setError(null);
    const userMessage: ChatMessage = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    setMessages([...updatedMessages, assistantMessage]);

    try {
      const res = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          currentShortages: liveContext.shortages,
          recentRecalls: liveContext.recalls,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              accumulated += parsed.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  content: accumulated,
                };
                return next;
              });
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      // Remove the empty assistant message on error
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  }, [messages, isStreaming, liveContext.shortages, liveContext.recalls]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="p-4 rounded-full bg-accent-green/10">
              <Bot className="text-accent-green" size={32} />
            </div>
            <div className="text-center">
              <h2 className="font-mono text-lg font-bold text-primary mb-1">
                PharmaView Analyst
              </h2>
              <p className="text-sm text-muted max-w-md">
                Claude-powered pharmaceutical supply chain intelligence.
                Ask about recalls, shortages, manufacturing risks, or regulatory trends.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left text-xs font-mono p-3 rounded border border-terminal-border
                    bg-terminal-panel hover:border-accent-green/50 hover:bg-accent-green/5
                    text-muted hover:text-primary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-6 h-6 rounded bg-accent-green/10 flex items-center justify-center mt-1">
                    <Bot size={14} className="text-accent-green" />
                  </div>
                )}
                <div
                  className={`rounded-lg px-4 py-3 text-sm max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-accent-blue/10 border border-accent-blue/20 text-primary'
                      : 'bg-terminal-panel border border-terminal-border text-primary'
                  }`}
                >
                  {msg.role === 'assistant' && !msg.content && isStreaming ? (
                    <Loader2 size={14} className="animate-spin text-accent-green" />
                  ) : (
                    <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {msg.content}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-6 h-6 rounded bg-accent-blue/10 flex items-center justify-center mt-1">
                    <User size={14} className="text-accent-blue" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 p-3 rounded border border-accent-red/30 bg-accent-red/5 flex items-center gap-2">
          <AlertTriangle size={14} className="text-accent-red flex-shrink-0" />
          <span className="text-xs text-accent-red font-mono">{error}</span>
        </div>
      )}

      <div className="border-t border-terminal-border p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about supply chain risks, recalls, shortages..."
            rows={1}
            className="flex-1 bg-terminal-panel border border-terminal-border rounded-lg px-4 py-3
              text-sm font-mono text-primary placeholder:text-muted/50
              focus:outline-none focus:border-accent-green/50 resize-none"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="px-4 py-3 bg-accent-green/10 border border-accent-green/30 rounded-lg
              text-accent-green hover:bg-accent-green/20 transition-colors
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isStreaming ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
