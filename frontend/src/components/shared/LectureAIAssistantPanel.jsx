import { useEffect, useMemo, useRef, useState } from 'react';
import { aiAssistantAPI } from '../../services/api';
import { Icons } from './Icons';

const QUICK_ACTIONS = [
  { id: 'explain', label: 'Explain Concept', icon: Icons.Lightbulb, prompt: 'Explain this concept from the lecture in simple terms.' },
  { id: 'summarize', label: 'Summarize Lecture', icon: Icons.FileText, prompt: 'Summarize this lecture.' },
  { id: 'quiz', label: 'Generate Quiz', icon: Icons.HelpCircle, prompt: 'Generate a short quiz from this lecture.' },
  { id: 'notes', label: 'Generate Notes', icon: Icons.Book, prompt: 'Create concise study notes from this lecture.' },
  { id: 'code-help', label: 'Code Help', icon: Icons.Laptop, prompt: 'Help me with code related to this lecture topic.' },
  { id: 'viva', label: 'Viva Questions', icon: Icons.Target, prompt: 'Generate viva questions and model answers from this lecture.' },
  { id: 'important', label: 'Important Questions', icon: Icons.BookOpen, prompt: 'List important exam questions from this lecture.' },
  { id: 'translate', label: 'Translate Explanation', icon: Icons.Globe, prompt: 'Translate this explanation into simple English.' }
];

const formatTime = (date) => {
  if (!date) return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date());
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d.getTime())
    ? new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date())
    : new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(d);
};

export default function LectureAIAssistantPanel({
  lectureTitle,
  lectureId,
  isOpen,
  mobile = false,
  conversationKey
}) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const bottomRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const resolvedLectureIdRef = useRef(null);

  const containerClass = useMemo(() => {
    return 'h-full bg-white flex flex-col';
  }, []);

  // Auto-scroll on new messages, sending state change, or panel open
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, sending, isOpen]);

  // Resolve conversation when panel opens with a valid lectureId
  useEffect(() => {
    let isMounted = true;

    const resolveChat = async () => {
      if (!isOpen || !lectureId) return;

      // Prevent duplicate resolve requests for the same lectureId if already resolved
      if (resolvedLectureIdRef.current === lectureId && conversationId) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await aiAssistantAPI.resolveConversation(lectureId);
        if (!isMounted) return;

        const resolvedConversation = res.data?.conversation;
        const rawMessages = res.data?.messages || [];

        setConversationId(resolvedConversation?._id || null);
        resolvedLectureIdRef.current = lectureId;

        // Map backend messages to UI format
        const formatted = rawMessages.map((msg) => ({
          id: msg._id || `msg-${Math.random()}`,
          role: msg.role === 'assistant' || msg.role === 'model' ? 'ai' : 'user',
          text: msg.content || '',
          time: formatTime(msg.createdAt)
        }));

        setMessages(formatted);
      } catch (err) {
        if (!isMounted) return;
        console.error('[AI Assistant] Failed to resolve conversation:', err);
        const status = err.response?.status;
        let errMsg = 'Failed to connect to AI Assistant. Please try again.';
        if (status === 401) {
          errMsg = 'Session expired. Please sign in to use AI Assistant.';
        } else if (status === 403) {
          errMsg = 'You do not have permission to access this AI Tutor.';
        } else if (status === 404) {
          errMsg = 'Lecture not found.';
        } else if (status === 429) {
          errMsg = 'Rate limit reached. Please wait a moment.';
        } else if (status >= 500) {
          errMsg = 'AI Tutor service is temporarily unavailable.';
        }
        setError(errMsg);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    resolveChat();

    return () => {
      isMounted = false;
    };
  }, [isOpen, lectureId, conversationId]);

  // Quick actions menu outside click handler
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [menuOpen]);

  // Send message to AI Assistant
  const handleSend = async (e) => {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || sending || loading || !conversationId) return;

    const tempUserId = `temp-${Date.now()}`;
    const nowTime = formatTime(new Date());

    // Optimistically display the user's message
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', text: content, time: nowTime }
    ]);
    setDraft('');
    setSending(true);
    setError(null);

    try {
      const res = await aiAssistantAPI.sendMessage(conversationId, {
        content,
        messageType: 'text'
      });

      const aiText =
        res.data?.aiResponse?.text ||
        res.data?.assistantMessage?.content ||
        '';

      const assistantMsgId = res.data?.assistantMessage?._id || `ai-${Date.now()}`;
      const assistantTime = formatTime(res.data?.assistantMessage?.createdAt);
      const realUserMsgId = res.data?.userMessage?._id;

      setMessages((prev) => {
        // Replace temporary user message ID with real DB ID if returned
        const updated = prev.map((m) =>
          m.id === tempUserId && realUserMsgId ? { ...m, id: realUserMsgId } : m
        );
        return [
          ...updated,
          {
            id: assistantMsgId,
            role: 'ai',
            text: aiText,
            time: assistantTime
          }
        ];
      });
    } catch (err) {
      console.error('[AI Assistant] Failed to send message:', err);
      const status = err.response?.status;
      let errMsg = 'Failed to generate AI response. Please try again.';
      if (status === 429) {
        errMsg = 'Rate limit exceeded. Please wait a moment before trying again.';
      } else if (status === 504 || status === 408) {
        errMsg = 'AI Tutor request timed out. Please try again.';
      } else if (status === 401) {
        errMsg = 'Authentication failed. Please sign in again.';
      } else if (status === 403) {
        errMsg = 'Permission denied.';
      } else if (err.response?.data?.message) {
        errMsg = err.response.data.message;
      }
      setError(errMsg);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handlePickAction = (prompt) => {
    setDraft(prompt);
    setMenuOpen(false);
    inputRef.current?.focus();
  };

  return (
    <aside className={`${containerClass} rounded-2xl border border-blue-100 shadow-[0_14px_40px_rgba(37,99,235,0.10)] overflow-hidden`}>
      <div className="px-4 py-4 border-b border-blue-100 bg-gray-50">
        <p className="text-xs uppercase tracking-[0.2em] text-blue-600 font-semibold">AI Assistant</p>
        <p className="text-xs text-muted mt-2">Current Lecture</p>
        <h3 className="text-sm font-semibold text-heading mt-1 truncate">{lectureTitle || 'AI Learning Assistant'}</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Connecting to AI Tutor...</span>
            </div>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="border border-blue-100 rounded-2xl bg-gray-50 p-4 shadow-sm">
            <p className="text-sm text-heading font-semibold">Hello</p>
            <p className="text-sm text-muted mt-1">I'm your AI Learning Assistant.</p>
            <p className="text-sm text-muted">Ask me anything about your studies.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} transition-all duration-300 ease-out`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-3 py-2 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-gray-100 text-heading rounded-bl-md border border-gray-200'
              }`}
            >
              <p className="text-xs font-semibold mb-1 opacity-80">{msg.role === 'user' ? 'You' : 'AI'}</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              <p
                className={`text-[11px] mt-1 ${
                  msg.role === 'user' ? 'text-blue-100' : 'text-muted'
                }`}
              >
                {msg.time}
              </p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start transition-all duration-300 ease-out">
            <div className="max-w-[90%] rounded-2xl rounded-bl-md px-3 py-2 bg-gray-100 text-heading border border-gray-200 shadow-sm">
              <p className="text-xs font-semibold mb-1 opacity-80">AI</p>
              <div className="flex items-center gap-1.5 py-1">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse [animation-delay:200ms]" />
                <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse [animation-delay:400ms]" />
                <span className="text-xs text-muted font-medium ml-1">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 shadow-sm">
            <p className="font-medium">{error}</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-blue-100 bg-gray-50">
        <div className="flex items-end gap-2">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Open quick actions"
              onClick={() => setMenuOpen((prev) => !prev)}
              disabled={sending || loading}
              className="h-10 w-10 rounded-2xl border border-gray-200 bg-white text-blue-600 font-semibold text-xl leading-none hover:bg-blue-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              +
            </button>

            {menuOpen && (
              <div className="absolute bottom-12 left-0 w-64 rounded-2xl border border-blue-100 bg-white shadow-[0_14px_35px_rgba(15,23,42,0.12)] p-2 z-20">
                <p className="text-xs font-semibold text-muted px-2 py-1">Quick Actions</p>
                <div className="mt-1 space-y-1">
                  {QUICK_ACTIONS.map((action) => {
                    const IconComp = action.icon;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => handlePickAction(action.prompt)}
                        className="w-full text-left px-2.5 py-2 rounded-xl text-sm text-heading hover:bg-blue-50 transition-colors flex items-center gap-2"
                      >
                        <IconComp className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            disabled={sending || loading || !conversationId}
            placeholder={
              loading
                ? 'Connecting to AI Tutor...'
                : !conversationId
                ? 'Unavailable'
                : 'Ask anything... (Press Enter to send)'
            }
            className="flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-heading outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-gray-100 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || loading || !draft.trim() || !conversationId}
            className="h-10 px-4 rounded-2xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </aside>
  );
}