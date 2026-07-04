import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Edit3, ImageIcon, Search,
  LayoutGrid, Clock, Grid3x3, MoreHorizontal, Library,
  Globe, PanelLeftClose, PanelLeft, ChevronDown,
  Mic, AudioLines, ArrowUp
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './index.css';

// ─── Direct fetch SSE streaming (no SDK — avoids baseURL issues) ──────────────
async function* streamCompletion(messages: { role: string; content: string }[]) {
  const response = await fetch('/api/proxy/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'z-ai/glm-5.2',
      messages,
      temperature: 0.85,
      top_p: 1,
      max_tokens: 16384,
      seed: 42,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content;
        if (content) yield content as string;
      } catch { /* skip malformed chunks */ }
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

interface Message { role: 'user' | 'assistant'; content: string; }
interface ChatSession { id: string; title: string; messages: Message[]; updatedAt: number; }

const isMobile = () => window.innerWidth <= 768;
const makeSession = (): ChatSession => ({
  id: Date.now().toString(), title: 'New chat', messages: [], updatedAt: Date.now(),
});

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile());
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── Init ── */
  useEffect(() => {
    const raw = localStorage.getItem('mini-chatgpt-sessions');
    if (raw) {
      try {
        const parsed: ChatSession[] = JSON.parse(raw);
        if (parsed.length) { setSessions(parsed); setActiveId(parsed[0].id); setReady(true); return; }
      } catch { /* ignore */ }
    }
    const s = makeSession();
    setSessions([s]); setActiveId(s.id); setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem('mini-chatgpt-sessions', JSON.stringify(sessions));
  }, [sessions, ready]);

  useEffect(() => {
    const h = () => { if (!isMobile()) setSidebarOpen(true); };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const activeSession = sessions.find(s => s.id === activeId);
  const messages = activeSession?.messages ?? [];

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);
  useEffect(scrollBottom, [messages, scrollBottom]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  };

  const newChat = useCallback(() => {
    const s = makeSession();
    setSessions(p => [s, ...p]);
    setActiveId(s.id);
    if (isMobile()) setSidebarOpen(false);
  }, []);

  const selectChat = (id: string) => {
    setActiveId(id);
    if (isMobile()) setSidebarOpen(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(p => {
      const next = p.filter(s => s.id !== id);
      if (!next.length) { const s = makeSession(); setActiveId(s.id); return [s]; }
      if (activeId === id) setActiveId(next[0].id);
      return next;
    });
  };

  /* ── Send ── */
  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading || !activeId) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsg: Message = { role: 'user', content: msg };
    const withUser: Message[] = [...messages, userMsg];
    const isFirst = messages.length === 0;
    const title = isFirst
      ? msg.slice(0, 32) + (msg.length > 32 ? '…' : '')
      : (activeSession?.title ?? 'Chat');

    // Append user message + placeholder
    setSessions(p => p.map(s =>
      s.id === activeId
        ? { ...s, messages: [...withUser, { role: 'assistant', content: '' }], title, updatedAt: Date.now() }
        : s
    ));
    setLoading(true);

    try {
      let full = '';
      for await (const chunk of streamCompletion(withUser)) {
        full += chunk;
        const captured = full;
        setSessions(p => p.map(s => {
          if (s.id !== activeId) return s;
          const msgs = [...s.messages];
          msgs[msgs.length - 1] = { role: 'assistant', content: captured };
          return { ...s, messages: msgs, updatedAt: Date.now() };
        }));
      }
    } catch (err) {
      console.error(err);
      setSessions(p => p.map(s => {
        if (s.id !== activeId) return s;
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = { role: 'assistant', content: `⚠️ Error: ${(err as Error).message}` };
        return { ...s, messages: msgs };
      }));
    } finally {
      setLoading(false);
    }
  }, [input, loading, activeId, messages, activeSession]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
      e.preventDefault();
      send();
    }
  };

  const isEmptyChat = messages.length === 0;

  return (
    <div className="app-container">
      <div
        className={`sidebar-overlay ${sidebarOpen && isMobile() ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ═══ SIDEBAR ═══ */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button className="sidebar-logo-btn">
            <div className="logo-mark"><img src="/aj.svg" alt="AJ" width={30} height={30} /></div>
            <span>Mini ChatGPT</span>
          </button>
          <button className="icon-btn" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={18} /></button>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-link" onClick={newChat}><Edit3 size={16} /> New chat</button>
          <button className="nav-link"><Search size={16} /> Search chats</button>
          <button className="nav-link"><Library size={16} /> Library</button>
          <button className="nav-link"><LayoutGrid size={16} /> Projects</button>
          <button className="nav-link"><Clock size={16} /> Scheduled</button>
          <button className="nav-link"><Grid3x3 size={16} /> Apps</button>
          <button className="nav-link"><MoreHorizontal size={16} /> More</button>
        </nav>

        <div className="recents-header">Recents</div>
        <div className="chat-list">
          {[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).map(s => (
            <div
              key={s.id}
              className={`chat-item ${activeId === s.id ? 'active' : ''}`}
              onClick={() => selectChat(s.id)}
            >
              <span className="chat-item-title">{s.title}</span>
              <button className="chat-item-del" onClick={e => deleteChat(s.id, e)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <main className="main-content">
        <div className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" onClick={() => setSidebarOpen(v => !v)}><PanelLeft size={18} /></button>
            <button className="model-badge">Mini ChatGPT <ChevronDown size={14} color="var(--text-3)" /></button>
          </div>
          <div className="topbar-right">
            <div className="logo-mark" style={{ width: 32, height: 32, borderRadius: 8 }}>
              <img src="/aj.svg" alt="AJ" width={32} height={32} />
            </div>
          </div>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          {isEmptyChat ? (
            <div className="empty-state">
              <p className="empty-greeting">Ready when you are.</p>
              <div className="input-wrap-empty">
                <div className="composer">
                  <textarea
                    ref={textareaRef}
                    className="composer-textarea"
                    value={input}
                    onChange={e => { setInput(e.target.value); resizeTextarea(); }}
                    onKeyDown={onKeyDown}
                    placeholder="Ask anything…"
                    rows={1}
                    autoFocus={!isMobile()}
                    disabled={loading}
                  />
                  <div className="composer-footer">
                    <div className="composer-actions-left">
                      <button className="composer-btn"><Plus size={18} /></button>
                      <button className="composer-btn"><Mic size={18} /></button>
                    </div>
                    <button className={`send-btn ${input.trim() ? 'active' : ''}`} onClick={() => send()}>
                      {input.trim() ? <ArrowUp size={18} /> : <AudioLines size={17} />}
                    </button>
                  </div>
                </div>
                <div className="suggestions">
                  <button className="sug-btn" onClick={() => send('Create an image for me')}><ImageIcon size={14} /> Create image</button>
                  <button className="sug-btn" onClick={() => send('Help me write something')}><Edit3 size={14} /> Write or edit</button>
                  <button className="sug-btn" onClick={() => send('Look something up for me')}><Globe size={14} /> Look something up</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="messages-wrap">
              {messages.map((msg, i) => (
                <div key={i} className={`msg-row ${msg.role === 'user' ? 'user' : 'bot'}`}>
                  {msg.role === 'user' ? (
                    <div className="user-bubble">{msg.content}</div>
                  ) : (
                    <div className="bot-inner">
                      <div className="bot-avatar"><img src="/aj.svg" alt="AJ" width={28} height={28} /></div>
                      <div className="bot-text">
                        {msg.content === '' && loading && i === messages.length - 1 ? (
                          <div className="typing-dots"><span /><span /><span /></div>
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              // Render p as div to avoid <pre> inside <p> invalid nesting
                              p: ({ node, children, ...props }: any) => <div className="md-p" {...props}>{children}</div>,
                              pre: ({ node, ...props }: any) => <pre {...props} />,
                              code({ node, inline, className, children, ...props }: any) {
                                return inline
                                  ? <code className={className} {...props}>{children}</code>
                                  : <code className={className} {...props}>{children}</code>;
                              },
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {!isEmptyChat && (
          <div className="composer-fixed-wrap">
            <div style={{ width: '100%', maxWidth: '720px' }}>
              <div className="composer">
                <textarea
                  ref={textareaRef}
                  className="composer-textarea"
                  value={input}
                  onChange={e => { setInput(e.target.value); resizeTextarea(); }}
                  onKeyDown={onKeyDown}
                  placeholder="Ask anything…"
                  rows={1}
                  disabled={loading}
                />
                <div className="composer-footer">
                  <div className="composer-actions-left">
                    <button className="composer-btn"><Plus size={18} /></button>
                    <button className="composer-btn"><Mic size={18} /></button>
                  </div>
                  <button className={`send-btn ${input.trim() ? 'active' : ''}`} onClick={() => send()}>
                    {input.trim() ? <ArrowUp size={18} /> : <AudioLines size={17} />}
                  </button>
                </div>
              </div>
            </div>
            <p className="footer-note">Mini ChatGPT can make mistakes. Verify important info.</p>
          </div>
        )}
      </main>
    </div>
  );
}
