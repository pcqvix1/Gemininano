/**
 * Local AI Core - Gemini Nano
 * Adaptado da extensão Chrome para funcionar como site web
 */

class LocalAICore {
    constructor() {
        this.session = null;
        this.isProcessing = false;
        this.isInitialized = false;
        this.abortController = null;
        this.sessionParameters = { temperature: 0.7, topK: 40 };

        // Callbacks
        this.onStreamingUpdate = null;
        this.onProcessingComplete = null;
        this.onError = null;
        this.onStatusChange = null;
    }

    /**
     * Check Chrome version
     */
    getChromeVersion() {
        const userAgent = navigator.userAgent;
        const match = userAgent.match(/Chrome\/(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }

    /**
     * Get the available AI interface (standard or legacy)
     */
    getAIInterface() {
        if (typeof window !== 'undefined' && window.ai && window.ai.languageModel) {
            return window.ai.languageModel;
        }
        if (typeof LanguageModel !== 'undefined') {
            return LanguageModel;
        }
        return null;
    }

    /**
     * Check if browser supports Gemini Nano
     */
    async checkAvailability() {
        // Check Chrome version
        const chromeVersion = this.getChromeVersion();
        if (chromeVersion < 127) {
            return {
                available: false,
                status: 'unsupported',
                error: `Chrome 127+ é necessário (atual: ${chromeVersion})`
            };
        }

        const aiInterface = this.getAIInterface();

        // Check if LanguageModel API exists
        if (!aiInterface) {
            return {
                available: false,
                status: 'no-api',
                error: 'A API LanguageModel não está disponível. Habilite as flags experimental-prompt-api-for-gemini-nano e optimization-guide-on-device-model.'
            };
        }

        try {
            let availability = 'no';
            
            // Support for both capabilities() (newer) and availability() (older)
            if (aiInterface.capabilities) {
                const caps = await aiInterface.capabilities();
                availability = caps.available;
            } else if (aiInterface.availability) {
                // Legacy check with params
                availability = await aiInterface.availability({
                    expectedOutputs: [{ type: "text", languages: ["en"] }]
                });
            }

            if (availability === 'readily' || availability === 'available') {
                return { available: true, status: 'ready' };
            } else if (availability === 'after-download' || availability === 'downloading') {
                return {
                    available: false,
                    status: 'downloading',
                    error: 'O modelo está sendo baixado...'
                };
            } else if (availability === 'downloadable') {
                return {
                    available: false,
                    status: 'downloadable',
                    error: 'O modelo precisa ser baixado.'
                };
            } else {
                return {
                    available: false,
                    status: availability,
                    error: `Gemini Nano não disponível: ${availability}`
                };
            }
        } catch (error) {
            return {
                available: false,
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Initialize the AI session
     */
    async initialize() {
        if (this.isInitialized && this.session) {
            console.log('LocalAICore: Reutilizando sessão existente');
            return { success: true, status: 'ready' };
        }

        this.updateStatus('Verificando disponibilidade...');

        const availability = await this.checkAvailability();
        if (!availability.available) {
            return { success: false, ...availability };
        }

        try {
            this.updateStatus('Criando sessão da IA...');
            await this.createSession();
            this.isInitialized = true;
            this.updateStatus('IA pronta');
            return { success: true, status: 'ready' };
        } catch (error) {
            console.error('LocalAICore: Falha na inicialização:', error);
            return { success: false, status: 'error', error: error.message };
        }
    }

    /**
     * Create a new AI session
     */
    async createSession(initialPrompts = null) {
        if (this.session && this.session.destroy) {
            console.log('LocalAICore: Destruindo sessão anterior');
            this.session.destroy();
        }

        console.log('LocalAICore: Criando nova sessão...');
        const startTime = performance.now();

        const createOptions = {
            ...this.sessionParameters,
        };
        
        // Add legacy parameters if needed
        if (typeof LanguageModel !== 'undefined' && (!window.ai || !window.ai.languageModel)) {
             createOptions.expectedOutputs = [{ type: "text", languages: ["en"] }];
        }

        if (initialPrompts && Array.isArray(initialPrompts) && initialPrompts.length > 0) {
            createOptions.initialPrompts = initialPrompts;
        }

        if (typeof window !== 'undefined' && window.ai && window.ai.languageModel) {
            this.session = await window.ai.languageModel.create(createOptions);
        } else {
            this.session = await LanguageModel.create(createOptions);
        }

        const creationTime = performance.now() - startTime;
        console.log(`LocalAICore: Sessão criada em ${Math.round(creationTime)}ms`);

        return true;
    }

    /**
     * Process text with the AI
     */
    async processText(text, action = 'ask', metadata = {}) {
        if (!this.session) {
            throw new Error('Sessão da IA não disponível');
        }

        if (this.isProcessing) {
            throw new Error('Já processando outra requisição');
        }

        this.isProcessing = true;
        const startTime = performance.now();

        try {
            // Send text directly without any modifications
            const prompt = text;

            console.log(`LocalAICore: Processando mensagem...`);

            // Create AbortController
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            // Notify start
            if (this.onStreamingUpdate) {
                this.onStreamingUpdate('', true, action, metadata, text);
            }

            let result = '';
            let firstTokenTime = null;
            let streamingStarted = false;

            // Use streaming if available
            if (this.session.promptStreaming) {
                console.log('LocalAICore: Usando streaming API');
                try {
                    const stream = this.session.promptStreaming(prompt, { signal });

                    for await (const chunk of stream) {
                        if (chunk) {
                            if (!streamingStarted) {
                                firstTokenTime = performance.now();
                                const timeToFirst = firstTokenTime - startTime;
                                console.log(`LocalAICore: Primeiro token em ${Math.round(timeToFirst)}ms`);
                                streamingStarted = true;
                            }

                            result += chunk;

                            if (this.onStreamingUpdate) {
                                this.onStreamingUpdate(chunk, false, action, metadata, text);
                            }
                        }
                    }
                } catch (streamError) {
                    if (streamError.name === 'AbortError') {
                        console.log('LocalAICore: Streaming parado pelo usuário');
                        this.isProcessing = false;
                        this.abortController = null;
                        return {
                            success: false,
                            result: result || 'Parado pelo usuário',
                            aborted: true
                        };
                    }

                    // Fallback to regular prompt
                    console.log('LocalAICore: Fallback para prompt regular');
                    result = await this.session.prompt(prompt, { signal });

                    if (this.onStreamingUpdate) {
                        this.onStreamingUpdate(result, false, action, metadata, text);
                    }
                }
            } else {
                console.log('LocalAICore: Streaming não disponível, usando prompt regular');
                result = await this.session.prompt(prompt, { signal });

                if (this.onStreamingUpdate) {
                    this.onStreamingUpdate(result, false, action, metadata, text);
                }
            }

            const totalTime = performance.now() - startTime;
            console.log(`LocalAICore: Tempo total: ${Math.round(totalTime)}ms`);

            if (this.onProcessingComplete) {
                this.onProcessingComplete(result, action, metadata, text);
            }

            return {
                success: true,
                result: result,
                action: action,
                metrics: {
                    totalTime: Math.round(totalTime),
                    timeToFirstToken: firstTokenTime ? Math.round(firstTokenTime - startTime) : null
                }
            };

        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, result: '', aborted: true };
            }

            console.error(`LocalAICore: ${action} falhou:`, error);

            // Handle session destroyed
            if (error.message && (error.message.includes('destroyed') || error.message.includes('quota'))) {
                console.log('LocalAICore: Recriando sessão...');
                this.isInitialized = false;
                await this.createSession();
                this.isInitialized = true;
                return await this.processText(text, action, metadata);
            }

            if (this.onError) {
                this.onError(error.message);
            }

            throw error;
        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    /**
     * Stop current processing
     */
    stopProcessing() {
        if (this.abortController) {
            console.log('LocalAICore: Parando requisição...');
            this.abortController.abort();
            this.abortController = null;
            this.isProcessing = false;
            return true;
        }
        return false;
    }

    /**
     * Update status callback
     */
    updateStatus(status) {
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
    }

    /**
     * Set callbacks
     */
    setStreamingCallback(callback) {
        this.onStreamingUpdate = callback;
    }

    setCompletionCallback(callback) {
        this.onProcessingComplete = callback;
    }

    setErrorCallback(callback) {
        this.onError = callback;
    }

    setStatusCallback(callback) {
        this.onStatusChange = callback;
    }

    /**
     * Check if ready
     */
    isReady() {
        return this.isInitialized && !!this.session && !this.isProcessing;
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.session && this.session.destroy) {
            this.session.destroy();
        }
        this.session = null;
        this.isProcessing = false;
        this.isInitialized = false;
    }
}

// Export for use
window.LocalAICore = LocalAICore;


