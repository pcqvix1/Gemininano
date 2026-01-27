/**
 * Gemini Nano Chat App
 * Interface de chat para IA local
 */

class GeminiNanoApp {
    constructor() {
        this.aiCore = new LocalAICore();
        this.conversations = [];
        this.currentConversation = [];
        this.currentTheme = 'dark';

        this.init();
    }

    async init() {
        this.initElements();
        this.initEventListeners();
        this.loadTheme();
        this.loadConversations();
        await this.initializeAI();
    }

    initElements() {
        // Sidebar
        this.sidebar = document.getElementById('sidebar');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.conversationsList = document.getElementById('conversationsList');
        this.clearHistoryBtn = document.getElementById('clearHistoryBtn');
        this.themeToggleBtn = document.getElementById('themeToggleBtn');
        this.themeText = document.getElementById('themeText');
        this.themeIcon = document.getElementById('themeIcon');

        // Main
        this.chatContainer = document.getElementById('chatContainer');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.messages = document.getElementById('messages');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');

        // Status
        this.aiStatusOverlay = document.getElementById('aiStatusOverlay');
        this.aiStatusText = document.getElementById('aiStatusText');

        // Track current conversation ID
        this.currentConversationId = null;
    }

    initEventListeners() {
        // New chat
        this.newChatBtn.addEventListener('click', () => this.newConversation());

        // Clear history
        this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());

        // Theme toggle
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());

        // Send message
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Enter to send
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => this.resizeTextarea());
    }

    async initializeAI() {
        this.showStatus('Inicializando Gemini Nano...');

        // Set callbacks
        this.aiCore.setStatusCallback((status) => this.showStatus(status));
        this.aiCore.setStreamingCallback((chunk, isStart, action, metadata, original) => {
            this.handleStreaming(chunk, isStart, action, metadata, original);
        });
        this.aiCore.setCompletionCallback((result, action, metadata, original) => {
            this.handleCompletion(result, action, metadata, original);
        });
        this.aiCore.setErrorCallback((error) => {
            this.showError(error);
        });

        const result = await this.aiCore.initialize();

        if (result.success) {
            this.hideStatus();
        } else {
            this.showStatus(result.error || 'Erro ao inicializar IA');

            // Keep overlay visible with error message
            if (result.status === 'downloadable') {
                this.aiStatusText.innerHTML = `
                    <p>${result.error}</p>
                    <p style="font-size: 12px; margin-top: 8px;">
                        Abra chrome://flags e habilite:<br>
                        • optimization-guide-on-device-model<br>
                        • prompt-api-for-gemini-nano
                    </p>
                `;
            }
        }
    }

    showStatus(text) {
        this.aiStatusText.textContent = text;
        this.aiStatusOverlay.classList.remove('hidden');
    }

    hideStatus() {
        this.aiStatusOverlay.classList.add('hidden');
    }

    showError(error) {
        console.error('AI Error:', error);
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        this.updateThemeUI();
        localStorage.setItem('theme', this.currentTheme);
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.currentTheme = savedTheme;
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        this.updateThemeUI();
    }

    updateThemeUI() {
        if (this.currentTheme === 'dark') {
            this.themeText.textContent = 'Modo Claro';
            this.themeIcon.innerHTML = `
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            `;
        } else {
            this.themeText.textContent = 'Modo Escuro';
            this.themeIcon.innerHTML = `
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            `;
        }
    }

    resizeTextarea() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 150) + 'px';
    }

    async sendMessage() {
        const text = this.messageInput.value.trim();
        if (!text || this.aiCore.isProcessing) return;

        // Hide welcome screen
        this.welcomeScreen.classList.add('hidden');

        // Add user message
        this.addMessage(text, 'user');
        this.currentConversation.push({ role: 'user', content: text });

        // Ensure we have a conversation ID
        if (this.currentConversationId === null) {
            this.saveCurrentConversation();
        }
        const conversationId = this.currentConversationId;
        this.processingConversationId = conversationId;

        // Clear input
        this.messageInput.value = '';
        this.resizeTextarea();

        // Disable send button
        this.sendBtn.disabled = true;

        try {
            // Add AI message placeholder with typing indicator
            const aiMessageEl = this.addMessage('', 'ai', true);

            // Process with AI
            await this.aiCore.processText(text, 'ask', { conversationId });

        } catch (error) {
            console.error('Error sending message:', error);
            // Only show error in UI if it's the active conversation
            if (this.currentConversationId === conversationId) {
                this.addMessage('Desculpe, ocorreu um erro ao processar sua mensagem.', 'ai');
            }
        } finally {
            this.sendBtn.disabled = false;
            if (this.processingConversationId === conversationId) {
                this.processingConversationId = null;
            }
        }
    }

    addMessage(content, role, isTyping = false) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${role}`;

        const avatarSvg = role === 'user'
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
               </svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                <line x1="15" y1="9" x2="15.01" y2="9"></line>
               </svg>`;

        messageEl.innerHTML = `
            <div class="message-avatar">${avatarSvg}</div>
            <div class="message-content">
                ${isTyping ? '<div class="typing-indicator"><span></span><span></span><span></span></div>' : this.formatMessage(content)}
            </div>
        `;

        this.messages.appendChild(messageEl);
        this.scrollToBottom();

        return messageEl;
    }

    formatMessage(content) {
        // Basic markdown-like formatting
        return content
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/^• /gm, '• ');
    }

    handleStreaming(chunk, isStart, action, metadata, original) {
        // Always track the response content, regardless of active view
        if (isStart) {
            this.processingResponse = '';
        } else {
            this.processingResponse = (this.processingResponse || '') + chunk;
        }

        // Only update UI if we are looking at the correct conversation
        if (this.currentConversationId !== metadata.conversationId) return;

        let lastMessage = this.messages.lastElementChild;
        
        // If we just switched back and there's no message element yet, or it's not the AI one
        if (!lastMessage || !lastMessage.classList.contains('ai')) {
            // We might need to add the placeholder if it's missing (e.g. after reload/switch)
            if (this.processingResponse) {
                this.addMessage('', 'ai');
                lastMessage = this.messages.lastElementChild;
            } else {
                return;
            }
        }

        const contentEl = lastMessage.querySelector('.message-content');

        if (isStart) {
            contentEl.innerHTML = '<span class="cursor-blinking"></span>';
        } else {
            contentEl.innerHTML = this.formatMessage(this.processingResponse) + '<span class="cursor-blinking"></span>';
            this.scrollToBottom();
        }
    }

    handleCompletion(result, action, metadata, original) {
        const convId = metadata.conversationId;
        
        // Update the conversation in storage
        const convIndex = this.conversations.findIndex(c => c.id === convId);
        if (convIndex !== -1) {
            this.conversations[convIndex].messages.push({ role: 'assistant', content: result });
            this.saveConversations();
        }

        // If we are looking at this conversation, finalize the UI
        if (this.currentConversationId === convId) {
            const lastMessage = this.messages.lastElementChild;
            if (lastMessage && lastMessage.classList.contains('ai')) {
                const contentEl = lastMessage.querySelector('.message-content');
                contentEl.innerHTML = this.formatMessage(result); // Remove cursor
            }
            
            // Also update the current working copy
            // Check if it's already added (avoid duplicates if logic is complex)
            // But usually we just push to conversations array. 
            // The currentConversation array is a copy used for display logic, 
            // but we should sync it.
            this.currentConversation.push({ role: 'assistant', content: result });
        }

        this.processingResponse = '';
    }

    scrollToBottom() {
        this.messages.scrollTop = this.messages.scrollHeight;
    }

    newConversation() {
        // Save current conversation if not empty AND it's a new conversation (not already saved)
        if (this.currentConversation.length > 0 && this.currentConversationId === null) {
            this.saveCurrentConversation();
        }

        // Reset for new conversation
        this.currentConversation = [];
        this.currentConversationId = null;
        this.messages.innerHTML = '';
        this.welcomeScreen.classList.remove('hidden');

        // Update sidebar to show no conversation selected
        this.renderConversationsList();
    }

    saveCurrentConversation() {
        if (this.currentConversation.length === 0) return;

        // Check if this conversation already exists
        if (this.currentConversationId !== null) {
            // Update existing conversation
            const existingIndex = this.conversations.findIndex(c => c.id === this.currentConversationId);
            if (existingIndex !== -1) {
                this.conversations[existingIndex].messages = [...this.currentConversation];
                this.saveConversations();
                return;
            }
        }

        // Create new conversation
        const title = this.currentConversation[0]?.content?.substring(0, 30) || 'Nova Conversa';
        const conversation = {
            id: Date.now(),
            title: title + (title.length >= 30 ? '...' : ''),
            messages: [...this.currentConversation],
            timestamp: new Date().toISOString()
        };

        this.currentConversationId = conversation.id;
        this.conversations.unshift(conversation);
        this.saveConversations();
        this.renderConversationsList();
    }

    loadConversations() {
        try {
            const saved = localStorage.getItem('conversations');
            this.conversations = saved ? JSON.parse(saved) : [];
        } catch (e) {
            this.conversations = [];
        }
        this.renderConversationsList();
    }

    saveConversations() {
        localStorage.setItem('conversations', JSON.stringify(this.conversations));
    }

    renderConversationsList() {
        this.conversationsList.innerHTML = '';

        // Always show "Nova Conversa" as first item if we're in a new conversation
        if (this.currentConversationId === null && this.currentConversation.length === 0) {
            const newConvEl = document.createElement('div');
            newConvEl.className = 'conversation-item active';
            newConvEl.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Nova Conversa</span>
            `;
            this.conversationsList.appendChild(newConvEl);
        }

        // Show saved conversations
        this.conversations.forEach((conv) => {
            const el = document.createElement('div');
            const isActive = conv.id === this.currentConversationId;
            el.className = `conversation-item ${isActive ? 'active' : ''}`;
            el.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>${conv.title}</span>
            `;
            el.addEventListener('click', () => this.loadConversation(conv));
            this.conversationsList.appendChild(el);
        });
    }

    loadConversation(conversation) {
        // Set current conversation ID to track which one is active
        this.currentConversationId = conversation.id;
        this.currentConversation = [...conversation.messages];
        this.messages.innerHTML = '';
        this.welcomeScreen.classList.add('hidden');

        conversation.messages.forEach(msg => {
            this.addMessage(msg.content, msg.role === 'user' ? 'user' : 'ai');
        });

        // If this conversation is currently processing, restore the partial response
        if (this.processingConversationId === conversation.id && this.processingResponse) {
            const aiMessageEl = this.addMessage('', 'ai');
            const contentEl = aiMessageEl.querySelector('.message-content');
            contentEl.innerHTML = this.formatMessage(this.processingResponse) + '<span class="cursor-blinking"></span>';
            this.scrollToBottom();
        }

        // Update sidebar to highlight correct conversation
        this.renderConversationsList();
    }

    clearHistory() {
        if (confirm('Tem certeza que deseja limpar todas as conversas?')) {
            this.conversations = [];
            this.currentConversation = [];
            this.messages.innerHTML = '';
            this.welcomeScreen.classList.remove('hidden');
            this.saveConversations();
            this.renderConversationsList();
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GeminiNanoApp();
});
