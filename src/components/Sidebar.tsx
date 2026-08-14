// Nomad AI — Sidebar Component
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, MessageSquare, Settings, Trash2,
  Edit2, Download, MoreHorizontal, Bot, Cpu, Check, X as XIcon
} from 'lucide-react';
import {
  getChats, createChat, deleteChat, renameChat,
  searchChats, exportChat, saveExportedChat,
  type Chat,
} from '../api';

interface SidebarProps {
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: (chatId: string) => void;
  onOpenSettings: () => void;
  currentModel: string;
  refreshTrigger: number;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function Sidebar({
  activeChatId,
  onSelectChat,
  onNewChat,
  onOpenSettings,
  currentModel,
  refreshTrigger,
  addToast,
}: SidebarProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Chat[] | null>(null);
  const [contextMenu, setContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const loadChats = useCallback(async () => {
    try {
      const data = await getChats();
      setChats(data);
    } catch {
      // If backend not available, show empty state
      setChats([]);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats, refreshTrigger]);

  useEffect(() => {
    if (renamingId) {
      setTimeout(() => renameRef.current?.focus(), 50);
    }
  }, [renamingId]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchChats(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 300);
  };

  const handleNewChat = async () => {
    try {
      const chat = await createChat('New Chat');
      await loadChats();
      onNewChat(chat.id);
    } catch (e) {
      addToast('Failed to create chat', 'error');
    }
  };

  const handleDelete = async (chatId: string) => {
    try {
      await deleteChat(chatId);
      await loadChats();
      if (activeChatId === chatId) {
        onSelectChat('');
      }
      addToast('Chat deleted', 'success');
    } catch {
      addToast('Failed to delete chat', 'error');
    }
    setContextMenu(null);
  };

  const startRename = (chat: Chat) => {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
    setContextMenu(null);
  };

  const submitRename = async (chatId: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await renameChat(chatId, renameValue.trim());
      await loadChats();
    } catch {
      addToast('Failed to rename chat', 'error');
    }
    setRenamingId(null);
  };

  const handleExport = async (chatId: string, format: 'txt' | 'md' | 'json') => {
    try {
      const content = await exportChat(chatId, format);
      const chat = chats.find(c => c.id === chatId);
      const filename = `${(chat?.title || 'chat').replace(/[^a-z0-9]/gi, '_')}.${format}`;
      await saveExportedChat(content, filename);
      addToast('Chat exported successfully', 'success');
    } catch {
      addToast('Failed to export chat', 'error');
    }
    setContextMenu(null);
  };

  const displayedChats = searchResults ?? chats;

  // Group chats by date
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  function getGroup(dateStr: string) {
    const d = new Date(dateStr);
    if (d.toDateString() === today) return 'Today';
    if (d.toDateString() === yesterday) return 'Yesterday';
    if (now.getTime() - d.getTime() < 7 * 86400000) return 'This Week';
    return 'Older';
  }

  const groups = displayedChats.reduce<Record<string, Chat[]>>((acc, chat) => {
    const g = getGroup(chat.updated_at);
    if (!acc[g]) acc[g] = [];
    acc[g].push(chat);
    return acc;
  }, {});

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Older'];

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    if (d.toDateString() === today) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return (
    <div className="sidebar" onClick={() => contextMenu && setContextMenu(null)}>
      <div className="sidebar-header">
        <button className="new-chat-btn" onClick={handleNewChat} id="new-chat-button">
          <Plus size={14} className="icon" />
          New Chat
        </button>
      </div>

      <div className="search-container">
        <div className="search-wrapper">
          <Search size={13} className="search-icon" />
          <input
            className="search-input"
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            id="search-chats-input"
          />
        </div>
      </div>

      <div className="chat-list-section">
        {displayedChats.length === 0 ? (
          <div className="empty-state">
            <MessageSquare size={28} className="empty-state-icon" />
            <p className="empty-state-text">
              {searchQuery ? 'No chats found' : 'No conversations yet.\nStart a new chat!'}
            </p>
          </div>
        ) : (
          groupOrder.map(group => {
            const groupChats = groups[group];
            if (!groupChats?.length) return null;
            return (
              <div key={group}>
                <div className="section-label">{group}</div>
                {groupChats.map(chat => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === activeChatId}
                    isRenaming={renamingId === chat.id}
                    renameValue={renameValue}
                    renameRef={renameRef}
                    onSelect={() => onSelectChat(chat.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ chatId: chat.id, x: e.clientX, y: e.clientY });
                    }}
                    onStartRename={() => startRename(chat)}
                    onDelete={() => handleDelete(chat.id)}
                    onRenameChange={setRenameValue}
                    onRenameSubmit={() => submitRename(chat.id)}
                    onRenameCancel={() => setRenamingId(null)}
                    dateLabel={formatDate(chat.updated_at)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-footer">
        {/* Model indicator */}
        <div style={{ padding: '4px 4px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`model-badge ${currentModel}`} style={{ flex: 1 }}>
            <span className="model-dot" />
            {currentModel === 'high-end' ? 'Nomad Pro' : 'Nomad Compact'}
          </span>
        </div>
        <button className="sidebar-footer-btn" onClick={onOpenSettings} id="open-settings-btn">
          <Settings size={15} className="icon" />
          Settings
        </button>
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            className="dropdown"
            style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
          >
            <button
              className="dropdown-item"
              onClick={() => startRename(chats.find(c => c.id === contextMenu.chatId)!)}
            >
              <Edit2 size={13} />
              Rename
            </button>
            <div className="dropdown-divider" />
            <button
              className="dropdown-item"
              onClick={() => handleExport(contextMenu.chatId, 'md')}
            >
              <Download size={13} />
              Export as Markdown
            </button>
            <button
              className="dropdown-item"
              onClick={() => handleExport(contextMenu.chatId, 'txt')}
            >
              <Download size={13} />
              Export as Text
            </button>
            <button
              className="dropdown-item"
              onClick={() => handleExport(contextMenu.chatId, 'json')}
            >
              <Download size={13} />
              Export as JSON
            </button>
            <div className="dropdown-divider" />
            <button
              className="dropdown-item danger"
              onClick={() => handleDelete(contextMenu.chatId)}
            >
              <Trash2 size={13} />
              Delete Chat
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameRef: React.RefObject<HTMLInputElement>;
  dateLabel: string;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onStartRename: () => void;
  onDelete: () => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}

function ChatItem({
  chat, isActive, isRenaming, renameValue, renameRef,
  dateLabel, onSelect, onContextMenu, onStartRename,
  onDelete, onRenameChange, onRenameSubmit, onRenameCancel,
}: ChatItemProps) {
  return (
    <motion.div
      className={`chat-item ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
    >
      <MessageSquare size={13} className="chat-item-icon" />
      <div className="chat-item-content">
        {isRenaming ? (
          <input
            ref={renameRef}
            className="rename-input"
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onBlur={onRenameSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') onRenameSubmit();
              if (e.key === 'Escape') onRenameCancel();
              e.stopPropagation();
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <>
            <div className="chat-item-title">{chat.title}</div>
            <div className="chat-item-date">{dateLabel} · {chat.message_count} msgs</div>
          </>
        )}
      </div>
      {!isRenaming && (
        <div className="chat-item-actions" onClick={e => e.stopPropagation()}>
          <button className="chat-action-btn" onClick={onStartRename} title="Rename">
            <Edit2 size={11} />
          </button>
          <button className="chat-action-btn delete" onClick={onDelete} title="Delete">
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </motion.div>
  );
}
