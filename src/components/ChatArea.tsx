// Nomad AI — ChatArea Component
// Main chat interface with message history, streaming, and file attachment

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, StopCircle, Paperclip, Copy, RefreshCw,
  Download, X as XIcon, FileText, Zap, Check
} from 'lucide-react';
import {
  getMessages, sendMessage, stopInference, listenInferenceChunks,
  openFileDialog, processFile, exportChat, saveExportedChat,
  type Message,
} from '../api';
import type { UnlistenFn } from '@tauri-apps/api/event';

interface ChatAreaProps {
  chatId: string;
  currentModel: string;
  installDir: string;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onChatUpdate: () => void;
}

interface StreamingState {
  messageId: string;
  content: string;
  done: boolean;
}

export function ChatArea({
  chatId,
  currentModel,
  addToast,
  onChatUpdate,
}: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const streamingContentRef = useRef('');

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await getMessages(chatId);
      setMessages(msgs);
      setTimeout(scrollToBottom, 100);
    } catch {
      setMessages([]);
    }
  }, [chatId, scrollToBottom]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Set up streaming listener
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listenInferenceChunks((chunk) => {
      if (chunk.done) {
        setStreaming(null);
        setIsStreaming(false);
        streamingContentRef.current = '';
        // Reload messages to get final persisted state
        loadMessages();
        onChatUpdate();
      } else {
        streamingContentRef.current += chunk.token;
        setStreaming({
          messageId: chunk.message_id,
          content: streamingContentRef.current,
          done: false,
        });
        scrollToBottom();
      }
    }).then(fn => {
      unlisten = fn;
      unlistenRef.current = fn;
    });

    return () => {
      unlisten?.();
      unlistenRef.current = null;
    };
  }, [loadMessages, onChatUpdate, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [inputText]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    setInputText('');
    setIsStreaming(true);
    streamingContentRef.current = '';

    // Optimistic update — add user message immediately
    const tempUserMsg: Message = {
      id: 'temp-user-' + Date.now(),
      chat_id: chatId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      file_name: attachedFile?.name,
      file_type: attachedFile ? attachedFile.name.split('.').pop() : undefined,
    };
    const tempAiMsg: Message = {
      id: 'temp-ai-' + Date.now(),
      chat_id: chatId,
      role: 'assistant',
      content: '...',
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg, tempAiMsg]);
    setTimeout(scrollToBottom, 50);

    const fileCtx = attachedFile?.content;
    setAttachedFile(null);

    try {
      await sendMessage(chatId, text, fileCtx);
      // Real messages will come via streaming events
    } catch (e: any) {
      setIsStreaming(false);
      addToast('Failed to send message: ' + String(e), 'error');
      // Remove temp messages
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
    }
  };

  const handleStop = async () => {
    await stopInference();
    setIsStreaming(false);
    setStreaming(null);
    await loadMessages();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileAttach = async () => {
    try {
      const path = await openFileDialog();
      if (!path) return;
      const content = await processFile(path);
      const name = path.split(/[/\\]/).pop() || 'file';
      setAttachedFile({ path, name, content });
      addToast(`File attached: ${name}`, 'success');
    } catch (e: any) {
      addToast('Could not read file: ' + String(e), 'error');
    }
  };

  const handleCopy = async (text: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      addToast('Failed to copy', 'error');
    }
  };

  // Get the current chat title for the header
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const chatTitle = lastUserMsg
    ? lastUserMsg.content.length > 50
      ? lastUserMsg.content.slice(0, 47) + '...'
      : lastUserMsg.content
    : 'New Conversation';

  // Render message content with basic markdown
  const renderContent = (content: string) => {
    // Simple markdown rendering
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code block
      if (line.startsWith('```')) {
        const lang = line.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        elements.push(
          <pre key={i}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        i++;
        continue;
      }

      // Heading
      if (line.startsWith('### ')) {
        elements.push(<h3 key={i}>{line.slice(4)}</h3>);
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={i}>{line.slice(3)}</h2>);
      } else if (line.startsWith('# ')) {
        elements.push(<h1 key={i}>{line.slice(2)}</h1>);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        // Collect list items
        const items: string[] = [line.slice(2)];
        while (i + 1 < lines.length && (lines[i+1].startsWith('- ') || lines[i+1].startsWith('* '))) {
          i++;
          items.push(lines[i].slice(2));
        }
        elements.push(
          <ul key={i}>
            {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
          </ul>
        );
      } else if (line.trim() === '') {
        // Skip empty lines between paragraphs
        if (i > 0 && lines[i-1].trim() !== '') {
          elements.push(<br key={i} />);
        }
      } else {
        elements.push(<p key={i}>{renderInline(line)}</p>);
      }
      i++;
    }

    return <>{elements}</>;
  };

  const renderInline = (text: string) => {
    // Bold **text**
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
    return (
      <>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i}>{part.slice(1, -1)}</code>;
          }
          return part;
        })}
      </>
    );
  };

  // Combine real messages with streaming state
  const displayMessages = messages.map(msg => {
    if (streaming && msg.id === streaming.messageId) {
      return { ...msg, content: streaming.content };
    }
    // Also replace temp AI message while streaming
    if (streaming && msg.id.startsWith('temp-ai-') && isStreaming) {
      return { ...msg, content: streaming.content };
    }
    return msg;
  });

  return (
    <motion.div
      className="main-area"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-header-title">{chatTitle}</div>
        <div className="chat-header-actions">
          <div className={`model-badge ${currentModel}`}>
            <span className="model-dot" />
            {currentModel === 'high-end' ? 'Nomad Pro' : 'Nomad Compact'}
          </div>
          <button
            className="header-action-btn"
            onClick={async () => {
              try {
                const content = await exportChat(chatId, 'md');
                await saveExportedChat(content, 'chat.md');
                addToast('Chat exported', 'success');
              } catch {
                addToast('Export failed', 'error');
              }
            }}
            title="Export chat"
          >
            <Download size={13} />
            Export
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        <div className="messages-inner">
          <AnimatePresence initial={false}>
            {displayMessages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isAI = msg.role === 'assistant';
              const isCurrentlyStreaming = isStreaming && isAI &&
                (msg.id === streaming?.messageId || msg.id.startsWith('temp-ai-'));

              return (
                <motion.div
                  key={msg.id}
                  className="message-group"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0 }}
                >
                  <div className={`message-row ${msg.role}`}>
                    {isAI && (
                      <div className="message-avatar assistant">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="5" r="3" stroke="white" strokeWidth="1.5" fill="none"/>
                          <path d="M2 14 C2 10 14 10 14 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                        </svg>
                      </div>
                    )}

                    <div className={`message-bubble ${msg.role}`}>
                      {msg.file_name && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 11, color: 'var(--text-tertiary)',
                          marginBottom: 8, padding: '4px 8px',
                          background: 'var(--glass-2)', borderRadius: 6,
                          border: '1px solid var(--border-dim)',
                        }}>
                          <FileText size={11} />
                          {msg.file_name}
                        </div>
                      )}
                      {isAI && msg.content === '...' && !isCurrentlyStreaming ? (
                        <div className="typing-indicator">
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                        </div>
                      ) : (
                        <div style={{ userSelect: 'text' }}>
                          {renderContent(msg.content)}
                          {isCurrentlyStreaming && <span className="stream-cursor" />}
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="message-avatar user">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <circle cx="7" cy="4.5" r="2.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" fill="none"/>
                          <path d="M1.5 12 C1.5 8.5 12.5 8.5 12.5 12" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Message actions */}
                  {isAI && msg.content !== '...' && !isCurrentlyStreaming && (
                    <div className="message-actions">
                      <button
                        className="message-action-btn"
                        onClick={() => handleCopy(msg.content, msg.id)}
                        title="Copy"
                      >
                        {copiedId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                        {copiedId === msg.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="composer-wrapper">
        <div className="composer-inner">
          {/* File attachment preview */}
          {attachedFile && (
            <div className="file-preview">
              <FileText size={13} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
              <span className="file-preview-name">{attachedFile.name}</span>
              <button
                className="file-preview-remove"
                onClick={() => setAttachedFile(null)}
                title="Remove file"
              >
                <XIcon size={13} />
              </button>
            </div>
          )}

          <div className="composer-box">
            <textarea
              ref={textareaRef}
              className="composer-textarea"
              placeholder={isStreaming ? 'Nomad AI is thinking...' : 'Message Nomad AI...'}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              rows={1}
              id="message-input"
            />

            <div className="composer-actions">
              <button
                className="composer-icon-btn"
                onClick={handleFileAttach}
                title="Attach file"
                disabled={isStreaming}
                id="attach-file-btn"
              >
                <Paperclip size={16} />
              </button>

              {isStreaming ? (
                <button
                  className="composer-send-btn stop"
                  onClick={handleStop}
                  title="Stop generating"
                >
                  <StopCircle size={16} />
                </button>
              ) : (
                <button
                  className="composer-send-btn"
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  title="Send message"
                  id="send-message-btn"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="composer-hint">
            Nomad AI runs completely offline · Press Enter to send, Shift+Enter for new line
          </div>
        </div>
      </div>
    </motion.div>
  );
}
