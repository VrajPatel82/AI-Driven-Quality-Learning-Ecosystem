import { useState, useEffect, useRef, useMemo } from 'react';
import { aiAssistantAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

// Suggested prompts for new conversations with concise academic descriptions
const SUGGESTED_PROMPT_DETAILS = [
  {
    title: 'What should I study today?',
    desc: 'Get focused lecture and lab recommendations'
  },
  {
    title: 'How am I performing?',
    desc: 'Review your progress, quizzes, and attendance'
  },
  {
    title: 'Help me make a study plan.',
    desc: 'Generate a step-by-step revision schedule'
  },
  {
    title: 'Explain a topic I struggled with.',
    desc: 'Ask for structured explanations with examples'
  }
];

// Helper to group conversations by date
const groupConversationsByDate = (conversations = []) => {
  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: []
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - (6 * 86400000);

  conversations.forEach((conv) => {
    const time = new Date(conv.lastMessageAt || conv.updatedAt || conv.createdAt).getTime();
    if (isNaN(time)) {
      groups.older.push(conv);
      return;
    }

    if (time >= todayStart) {
      groups.today.push(conv);
    } else if (time >= yesterdayStart) {
      groups.yesterday.push(conv);
    } else if (time >= weekStart) {
      groups.thisWeek.push(conv);
    } else {
      groups.older.push(conv);
    }
  });

  return groups;
};

// Helper to format timestamps cleanly
const formatTimeLabel = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// Helper to sanitize & get plain source label
const getSourceLabel = (conv) => {
  const type = conv.conversationType || (conv.lecture ? 'lecture' : 'study_assistant');
  switch (type) {
    case 'lecture': return 'Lecture';
    case 'assignment': return 'Assignment';
    case 'quiz': return 'Quiz';
    case 'study_assistant':
    default: return 'Study Assistant';
  }
};

export default function StudentStudyAssistant() {
  const { user } = useAuth();

  // State
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputContent, setInputContent] = useState('');
  const [error, setError] = useState(null);
  const [lastFailedContent, setLastFailedContent] = useState('');
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Fetch student conversations list
  const fetchConversations = async (search = '') => {
    try {
      setLoadingChats(true);
      const res = await aiAssistantAPI.getStudentConversations({ search: search.trim() });
      const convList = res.data?.conversations || [];
      setConversations(convList);
      return convList;
    } catch (err) {
      console.error('[Study Assistant] Failed to load conversations:', err);
      toast.error('Failed to load recent chats');
      return [];
    } finally {
      setLoadingChats(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, []);

  // Handle Search Input Change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchConversations(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load selected conversation history
  const loadConversation = async (conversationId) => {
    if (!conversationId) return;

    setActiveConversationId(conversationId);
    setLoadingMessages(true);
    setError(null);
    setLastFailedContent('');
    setMobileRightOpen(false);

    try {
      const res = await aiAssistantAPI.getHistory(conversationId);
      const loadedConv = res.data?.conversation || null;
      const loadedMessages = res.data?.messages || [];

      setActiveConversation(loadedConv);
      setMessages(
        loadedMessages.map((msg) => ({
          id: msg._id,
          role: msg.role === 'assistant' || msg.role === 'model' ? 'assistant' : 'user',
          content: msg.content,
          createdAt: msg.createdAt
        }))
      );
    } catch (err) {
      console.error('[Study Assistant] Failed to load conversation details:', err);
      setError('Failed to load conversation history. Please try again.');
    } finally {
      setLoadingMessages(false);
    }
  };

  // Create New Study Assistant Chat
  const handleNewChat = async () => {
    setError(null);
    setLastFailedContent('');
    setInputContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setMobileRightOpen(false);

    try {
      const res = await aiAssistantAPI.createStudyAssistantConversation({
        initialTitle: 'New Conversation'
      });
      const newConv = res.data?.conversation;
      if (newConv) {
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv._id);
        setActiveConversation(newConv);
        setMessages([]);
      }
    } catch (err) {
      console.error('[Study Assistant] Failed to create new chat:', err);
      // Fall back to clear screen state for client draft
      setActiveConversationId(null);
      setActiveConversation(null);
      setMessages([]);
    }
  };

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, loadingMessages]);

  // Handle textarea change with dynamic auto-height
  const handleInputChange = (e) => {
    setInputContent(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // Send message
  const handleSend = async (overrideContent) => {
    const textToSend = typeof overrideContent === 'string' ? overrideContent : inputContent;
    const trimmed = textToSend.trim();

    if (!trimmed || sending) return;

    setError(null);
    setLastFailedContent('');
    setInputContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // If no active conversation exists, create a new Study Assistant conversation first
    let targetConvId = activeConversationId;
    if (!targetConvId) {
      try {
        const createRes = await aiAssistantAPI.createStudyAssistantConversation({
          initialTitle: trimmed.slice(0, 40)
        });
        const createdConv = createRes.data?.conversation;
        if (createdConv) {
          targetConvId = createdConv._id;
          setActiveConversationId(createdConv._id);
          setActiveConversation(createdConv);
          setConversations((prev) => [createdConv, ...prev]);
        }
      } catch (err) {
        console.error('[Study Assistant] Failed to initialize conversation on send:', err);
        setError('Failed to start a new chat session. Please try again.');
        setLastFailedContent(trimmed);
        return;
      }
    }

    // Optimistically push user message
    const tempUserMsgId = `temp-user-${Date.now()}`;
    const userMsg = {
      id: tempUserMsgId,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await aiAssistantAPI.sendMessage(targetConvId, {
        content: trimmed,
        messageType: 'text'
      });

      const assistantContent = res.data?.aiResponse?.text || res.data?.assistantMessage?.content || '';
      const assistantMsgId = res.data?.assistantMessage?._id || `ai-${Date.now()}`;
      const assistantCreatedAt = res.data?.assistantMessage?.createdAt || new Date().toISOString();

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: assistantContent,
          createdAt: assistantCreatedAt
        }
      ]);

      // Refresh recent conversations list to reflect title/last message preview
      fetchConversations(searchQuery);
    } catch (err) {
      console.error('[Study Assistant] Failed to send message:', err);
      const status = err.response?.status;
      let errMsg = 'Failed to generate AI response. Please try again.';
      if (status === 429) {
        errMsg = 'Rate limit exceeded. Please wait a moment before trying again.';
      } else if (status === 401) {
        errMsg = 'Session expired. Please sign in again.';
      } else if (err.response?.data?.message) {
        errMsg = err.response.data.message;
      }
      setError(errMsg);
      setLastFailedContent(trimmed);
    } finally {
      setSending(false);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  // Group conversations by date
  const groupedChats = useMemo(() => {
    return groupConversationsByDate(conversations);
  }, [conversations]);

  return (
    <div className="h-[calc(100dvh-95px)] sm:h-[calc(100vh-135px)] lg:h-[calc(100vh-150px)] min-h-[460px] flex flex-col bg-white rounded-2xl border border-[#e6eaf2] overflow-hidden shadow-xs relative">
      {/* PAGE HEADER */}
      <header className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 border-b border-[#e6eaf2] bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-[#0f172a] tracking-tight truncate">
            Study Assistant
          </h1>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
            AI Tutor
          </span>
        </div>

        {/* Mobile toggle button for Recent Chats */}
        <button
          onClick={() => setMobileRightOpen(!mobileRightOpen)}
          className="lg:hidden px-2.5 py-1.5 rounded-lg border border-[#e6eaf2] text-xs font-semibold text-[#475569] hover:bg-slate-50 active:bg-slate-100 flex items-center gap-1.5 transition-colors min-h-[36px] shrink-0"
          aria-label="Toggle recent chats"
        >
          <Icons.MessageSquare className="w-3.5 h-3.5 text-[#2563eb]" />
          <span>Recent Chats</span>
          {conversations.length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb]" />
          )}
        </button>
      </header>

      {/* MAIN TWO-COLUMN BODY */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* CENTER MAIN CHAT AREA */}
        <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-[#f8fafc]">
          {/* Active Conversation Context Header */}
          {activeConversation && (
            <div className="px-3.5 py-2 sm:px-6 sm:py-2.5 border-b border-[#e6eaf2] bg-white flex items-center justify-between shrink-0">
              <div className="min-w-0 flex-1 mr-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[#2563eb] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">
                    {getSourceLabel(activeConversation)}
                  </span>
                  {activeConversation.course?.name && (
                    <>
                      <span className="text-slate-300 shrink-0">•</span>
                      <span className="text-[11px] sm:text-xs text-[#64748b] truncate">{activeConversation.course.name}</span>
                    </>
                  )}
                </div>
                <h2 className="text-xs sm:text-sm font-semibold text-[#0f172a] truncate mt-0.5">
                  {activeConversation.lecture?.title || activeConversation.chatTitle || 'Conversation'}
                </h2>
              </div>
              <button
                onClick={handleNewChat}
                className="text-xs text-[#2563eb] hover:underline font-medium shrink-0 flex items-center gap-1 sm:hidden p-1 min-h-[36px]"
                title="New Chat"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                <span>New</span>
              </button>
            </div>
          )}

          {/* Messages Container */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3.5 sm:px-8 py-4 sm:py-6 space-y-3.5 sm:space-y-5">
            {/* Loading state for messages */}
            {loadingMessages && (
              <div className="flex justify-center items-center py-16 text-xs text-[#64748b] gap-2">
                <div className="w-4 h-4 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
                <span>Loading conversation...</span>
              </div>
            )}

            {/* Welcome State when no conversation or empty conversation */}
            {!loadingMessages && messages.length === 0 && (
              <div className="max-w-xl mx-auto py-4 sm:py-8 px-2 sm:px-4 text-center space-y-5 sm:space-y-7 my-auto">
                <div className="space-y-2.5">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-blue-50 text-[#2563eb] rounded-2xl flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
                    <Icons.MessageSquare className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  
                  <div>
                    <h2 className="text-lg sm:text-2xl font-bold text-[#0f172a] tracking-tight">Study Assistant</h2>
                    <p className="text-xs sm:text-sm text-[#64748b] mt-1 max-w-sm mx-auto leading-relaxed">
                      How can I help you with your studies today?
                    </p>
                  </div>
                </div>

                {/* Suggested Prompts Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-left max-w-xl mx-auto w-full">
                  {SUGGESTED_PROMPT_DETAILS.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(prompt.title)}
                      disabled={sending}
                      className="p-3.5 sm:p-4 rounded-xl border border-[#e2e8f0] bg-white hover:border-[#2563eb] hover:bg-[#eff6ff]/40 active:scale-[0.99] active:bg-[#eff6ff]/60 text-left transition-all group flex flex-col justify-between shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] group-hover:text-[#2563eb] transition-colors leading-snug">
                          {prompt.title}
                        </span>
                        <span className="text-slate-300 group-hover:text-[#2563eb] transition-colors shrink-0 mt-0.5">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </span>
                      </div>
                      <span className="block text-[11px] text-[#64748b] group-hover:text-blue-600/80 mt-1.5 font-normal leading-normal">
                        {prompt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {!loadingMessages &&
              messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'} transition-all`}
                  >
                    <div
                      className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-xs ${
                        isUser
                          ? 'bg-[#2563eb] text-white rounded-br-xs'
                          : 'bg-white text-[#0f172a] border border-[#e2e8f0] rounded-bl-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className={`text-[10.5px] font-semibold uppercase tracking-wider ${isUser ? 'text-blue-100' : 'text-[#64748b]'}`}>
                          {isUser ? 'You' : 'Study Assistant'}
                        </span>
                        {msg.createdAt && (
                          <span className={`text-[10px] ${isUser ? 'text-blue-200' : 'text-[#94a3b8]'}`}>
                            {formatTimeLabel(msg.createdAt)}
                          </span>
                        )}
                      </div>

                      <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text font-sans">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Typing / Sending State Indicator */}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#e2e8f0] rounded-2xl rounded-bl-xs px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-xs max-w-[85%] sm:max-w-[75%]">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b] block mb-1">
                    Study Assistant
                  </span>
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="w-2 h-2 rounded-full bg-[#2563eb] animate-pulse" />
                    <span className="w-2 h-2 rounded-full bg-[#2563eb] animate-pulse [animation-delay:200ms]" />
                    <span className="w-2 h-2 rounded-full bg-[#2563eb] animate-pulse [animation-delay:400ms]" />
                    <span className="text-xs text-[#64748b] font-medium ml-2">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Banner with Retry */}
            {error && (
              <div className="p-3 bg-red-50/90 border border-red-200/80 rounded-xl text-xs text-red-700 flex items-center justify-between gap-2 shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span className="font-medium truncate">{error}</span>
                </div>
                {lastFailedContent && (
                  <button
                    type="button"
                    onClick={() => handleSend(lastFailedContent)}
                    className="px-2.5 py-1 bg-white border border-red-200 rounded-lg text-red-700 font-semibold text-xs hover:bg-red-50 active:bg-red-100 transition-colors shrink-0"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* MESSAGE INPUT SECTION */}
          <div className="p-2.5 sm:p-4 border-t border-[#e6eaf2] bg-white shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-end gap-2 sm:gap-3 max-w-4xl mx-auto"
            >
              <div className="relative flex-1 min-w-0">
                <textarea
                  ref={textareaRef}
                  value={inputContent}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  disabled={sending}
                  aria-label="Message input"
                  placeholder="Ask Study Assistant anything..."
                  className="w-full resize-none rounded-xl border border-[#e2e8f0] bg-slate-50 px-3.5 py-2.5 sm:p-3 text-xs sm:text-sm text-[#0f172a] placeholder:text-slate-400 focus:bg-white focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 outline-none transition-all disabled:opacity-60 max-h-32 min-h-[42px] sm:min-h-[46px]"
                />
              </div>

              <button
                type="submit"
                disabled={sending || !inputContent.trim()}
                aria-label="Send message"
                className="h-[42px] sm:h-[46px] px-3.5 sm:px-5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-[0.98] text-white font-semibold text-xs sm:text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center justify-center gap-1.5 min-w-[42px] sm:min-w-auto shadow-xs"
              >
                {sending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    <span className="hidden sm:inline">Sending...</span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">Send</span>
                    <svg className="w-4 h-4 shrink-0 sm:rotate-0 -rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Mobile backdrop */}
        {mobileRightOpen && (
          <div
            className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden backdrop-blur-[2px] transition-opacity"
            onClick={() => setMobileRightOpen(false)}
          />
        )}

        {/* RIGHT PANEL: RECENT CHATS */}
        <aside
          className={`w-[290px] sm:w-[320px] max-w-[85vw] bg-white border-l border-[#e6eaf2] flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:static fixed inset-y-0 right-0 z-40 shadow-2xl lg:shadow-none ${
            mobileRightOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Recent Chats Top Header */}
          <div className="p-3 sm:p-4 border-b border-[#e6eaf2] space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-xs sm:text-sm text-[#0f172a] uppercase tracking-wider">Recent Chats</h2>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleNewChat}
                  className="flex items-center gap-1 text-xs font-semibold text-[#2563eb] hover:bg-[#eff6ff] active:bg-blue-100 px-2.5 py-1.5 rounded-lg border border-[#dbeafe] transition-colors min-h-[34px]"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  <span>New Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileRightOpen(false)}
                  className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors min-h-[34px] min-w-[34px] flex items-center justify-center"
                  aria-label="Close Recent Chats"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Icons.Search className="w-3.5 h-3.5 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-[#e6eaf2] rounded-lg text-xs text-[#0f172a] placeholder:text-slate-400 focus:bg-white focus:border-[#2563eb] outline-none transition-all"
              />
            </div>
          </div>

          {/* Conversations List Grouped by Date */}
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-3.5">
            {loadingChats && (
              <div className="py-8 text-center text-xs text-[#64748b]">Loading recent chats...</div>
            )}

            {!loadingChats && conversations.length === 0 && (
              <div className="py-8 text-center px-4">
                <p className="text-xs text-[#64748b]">No recent conversations found</p>
              </div>
            )}

            {!loadingChats && (
              <>
                {/* TODAY */}
                {groupedChats.today.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-bold text-[#94a3b8] tracking-wider uppercase px-2 mb-1.5">TODAY</p>
                    <div className="space-y-1">
                      {groupedChats.today.map((conv) => (
                        <ChatItem
                          key={conv._id}
                          conv={conv}
                          isActive={activeConversationId === conv._id}
                          onClick={() => loadConversation(conv._id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* YESTERDAY */}
                {groupedChats.yesterday.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-bold text-[#94a3b8] tracking-wider uppercase px-2 mb-1.5">YESTERDAY</p>
                    <div className="space-y-1">
                      {groupedChats.yesterday.map((conv) => (
                        <ChatItem
                          key={conv._id}
                          conv={conv}
                          isActive={activeConversationId === conv._id}
                          onClick={() => loadConversation(conv._id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* THIS WEEK */}
                {groupedChats.thisWeek.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-bold text-[#94a3b8] tracking-wider uppercase px-2 mb-1.5">PREVIOUS 7 DAYS</p>
                    <div className="space-y-1">
                      {groupedChats.thisWeek.map((conv) => (
                        <ChatItem
                          key={conv._id}
                          conv={conv}
                          isActive={activeConversationId === conv._id}
                          onClick={() => loadConversation(conv._id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* OLDER */}
                {groupedChats.older.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-bold text-[#94a3b8] tracking-wider uppercase px-2 mb-1.5">OLDER</p>
                    <div className="space-y-1">
                      {groupedChats.older.map((conv) => (
                        <ChatItem
                          key={conv._id}
                          conv={conv}
                          isActive={activeConversationId === conv._id}
                          onClick={() => loadConversation(conv._id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// Single Chat Item component in Recent Chats list
function ChatItem({ conv, isActive, onClick }) {
  const title = conv.lecture?.title || conv.chatTitle || 'Conversation';
  const subtitle = conv.lastUserMessagePreview || conv.lastMessagePreview || '';
  const sourceLabel = getSourceLabel(conv);
  const timeStr = formatTimeLabel(conv.lastMessageAt || conv.updatedAt || conv.createdAt);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2.5 sm:p-3 rounded-xl transition-all border min-h-[44px] ${
        isActive
          ? 'bg-[#eff6ff] border-[#bfdbfe]'
          : 'bg-white border-transparent hover:bg-slate-50 active:bg-slate-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <h3 className={`text-xs font-semibold truncate ${isActive ? 'text-[#2563eb]' : 'text-[#0f172a]'}`}>
          {title}
        </h3>
      </div>

      {subtitle && (
        <p className="text-xs text-[#64748b] truncate mb-1 leading-snug font-normal">
          {subtitle}
        </p>
      )}

      <div className="flex items-center justify-between text-[11px] text-[#94a3b8]">
        <span className="font-medium text-[#64748b]">{sourceLabel}</span>
        {timeStr && <span>{timeStr}</span>}
      </div>
    </button>
  );
}
