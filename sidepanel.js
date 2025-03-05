// Ensure safeHTMLPolicy is only declared once or is scoped properly

// Use a wrapper to avoid global declarations
(function() {
    // Check if policy is already defined before declaring it
    if (!window.safeHTMLPolicy) {
        window.safeHTMLPolicy = (typeof trustedTypes !== 'undefined')
            ? trustedTypes.createPolicy('ytToolkitPolicy', { createHTML: input => input })
            : { createHTML: input => input };
    }

    if (!window.ChromeBridge) {
        window.ChromeBridge = {
            requestId: 0,
            pendingRequests: {},
            channelName: '',
            init: function() {
                const container = document.getElementById('extension-sidepanel-container') || 
                                  document.getElementById('yt-ai-toolkit-panel')?.closest('#extension-sidepanel-container');
                if (container) {
                    this.channelName = container.getAttribute('data-bridge-channel');
                    console.log('Initializing Chrome Bridge with channel:', this.channelName);
                    window.addEventListener('message', (event) => {
                        if (event.data && event.data.source === this.channelName) {
                            const id = event.data.requestId;
                            const cb = this.pendingRequests[id];
                            if (cb) {
                                cb(event.data.response);
                                delete this.pendingRequests[id];
                            }
                        }
                    });
                    return true;
                } else {
                    console.error('Cannot initialize ChromeBridge: container not found');
                    return false;
                }
            },
            sendMessage: function(message, callback) {
                if (!this.channelName && !this.init()) return;
                const id = ++this.requestId;
                if (callback) this.pendingRequests[id] = callback;
                window.postMessage({
                    target: this.channelName,
                    message: message,
                    requestId: id
                }, '*');
            }
        };
    }

    document.addEventListener('DOMContentLoaded', function() {
        console.log("Sidepanel DOM loaded, initializing ChromeBridge and setting up handlers");
        
        // Check if a previous transcript was passed via data attribute and restore it
        const panelContainer = document.getElementById('extension-sidepanel-container');
        if (panelContainer) {
            const lastTranscript = panelContainer.getAttribute('data-last-transcript');
            if (lastTranscript) {
                const textarea = document.getElementById('transcript-content-textarea');
                const loadingElement = document.getElementById('loading-transcript');
                
                if (textarea) {
                    textarea.value = lastTranscript;
                    console.log("Restored previous transcript chat.");
                }
                
                // Explicitly hide the loading indicator for restored transcripts
                if (loadingElement) {
                    loadingElement.style.display = 'none';
                    console.log("Hidden loading spinner for restored transcript");
                }
                
                // Mark transcript as loaded
                panelContainer.setAttribute('data-transcript-loaded', 'true');
            }
        }
        
        // Rest of initialization
        if (!window.ChromeBridge) {
            // Initialize ChromeBridge
        }
        
        // Setup button handlers
        setupButtonHandlers();
        
        // Initialize extended features
        initializeExtendedFeatures();
    });

    // Re-initialize after a delay
    setTimeout(() => {
        ChromeBridge.init();
        setupButtonHandlers();
    }, 1000);

    if (!window.__sidepanelObserver) {
        window.__sidepanelObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.addedNodes.length) {
                    setupButtonHandlers();
                }
            }
        });
        window.__sidepanelObserver.observe(document.body, { childList: true, subtree: true });
    }

    function setupButtonHandlers() {
        console.log("Setting up button handlers");
        const minimizeBtn = document.getElementById('panel-minimize');
        if (minimizeBtn && !minimizeBtn._hasClickHandler) {
            minimizeBtn._hasClickHandler = true;
            minimizeBtn.addEventListener('click', function() {
                const panel = document.getElementById('extension-sidepanel-container');
                if (!panel) return;
                const textarea = panel.querySelector('#transcript-content-textarea');
                if (textarea) {
                    if (chrome && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.set({ lastTranscript: textarea.value }, () => {
                            console.log("Saved transcript upon minimize.");
                        });
                    } else {
                        window.localStorage.setItem('lastTranscript', textarea.value);
                    }
                }
                panel.remove();
            });
        }
        
        const copyTranscriptBtn = document.getElementById('copy-transcript');
        if (copyTranscriptBtn && !copyTranscriptBtn._hasClickHandler) {
            copyTranscriptBtn._hasClickHandler = true;
            copyTranscriptBtn.addEventListener('click', function() {
                const textArea = document.getElementById('transcript-content-textarea');
                if (textArea) extensionSafeCopy(textArea.value, copyTranscriptBtn);
            });
        }
        
        const copyAiResultBtn = document.getElementById('copy-ai-result');
        if (copyAiResultBtn && !copyAiResultBtn._hasClickHandler) {
            copyAiResultBtn._hasClickHandler = true;
            copyAiResultBtn.addEventListener('click', function() {
                const content = document.getElementById('ai-result-content');
                if (content) {
                    const plainText = content.innerText || content.textContent || '';
                    extensionSafeCopy(plainText, copyAiResultBtn);
                }
            });
        }
        
        const summarizeBtn = document.getElementById('summarize-transcript');
        if (summarizeBtn && !summarizeBtn._hasClickHandler) {
            summarizeBtn._hasClickHandler = true;
            summarizeBtn.addEventListener('click', function() {
                const textArea = document.getElementById('transcript-content-textarea');
                if (!textArea || !textArea.value) {
                    showMessage('No transcript available to summarize');
                    return;
                }
                summarizeBtn.disabled = true;
                summarizeBtn.textContent = 'Summarizing...';
                summarizeBtn.style.backgroundColor = '#cccccc';
                const loadingElement = document.getElementById('ai-loading');
                if (loadingElement) loadingElement.style.display = 'flex';
                requestSummary(textArea.value, summarizeBtn);
            });
        }

        const buttons = document.querySelectorAll('.section-actions button');
        buttons.forEach(button => {
            if (button._hasRippleEffect) return;
            button._hasRippleEffect = true;
            
            button.addEventListener('click', function(e) {
                const rect = button.getBoundingClientRect();
                const ripple = document.createElement('div');
                ripple.className = 'ripple';
                ripple.style.left = `${e.clientX - rect.left}px`;
                ripple.style.top = `${e.clientY - rect.top}px`;
                button.appendChild(ripple);
                
                setTimeout(() => ripple.remove(), 1000);
            });
        });
    }

    function extensionSafeCopy(text, buttonElement) {
        const originalText = buttonElement.textContent;
        const originalBg = buttonElement.style.backgroundColor;
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (successful) {
                showCopyFeedback(buttonElement, true, originalText, originalBg);
                return;
            }
        } catch (err) {
            console.error(err);
        }
        try {
            ChromeBridge.sendMessage({ action: 'COPY_TO_CLIPBOARD', text: text }, response => {
                if (response && response.success) {
                    showCopyFeedback(buttonElement, true, originalText, originalBg);
                } else {
                    showCopyFeedback(buttonElement, false, originalText, originalBg);
                }
            });
        } catch (err) {
            showCopyFeedback(buttonElement, false, originalText, originalBg);
        }
    }

    function showCopyFeedback(buttonElement, success) {
        const originalText = buttonElement.textContent;
        const originalClass = buttonElement.className;
        
        // Add visual feedback
        buttonElement.classList.add(success ? 'button-success' : 'button-error');
        buttonElement.textContent = success ? '✓ Copied!' : '× Error';
        
        // Reset after animation
        setTimeout(() => {
            buttonElement.className = originalClass;
            buttonElement.textContent = originalText;
        }, 1500);
    }

    function requestSummary(transcriptText, buttonElement) {
        const resultsArea = document.getElementById('ai-result-content');
        const placeholderElement = document.getElementById('ai-result-placeholder');
        if (placeholderElement) placeholderElement.style.display = 'none';
        if (resultsArea) {
            while (resultsArea.firstChild) { resultsArea.removeChild(resultsArea.firstChild); }
            const loadingElement = document.createElement('em');
            loadingElement.textContent = 'Generating summary with AI...';
            resultsArea.appendChild(loadingElement);
        }
        const loadingElement = document.getElementById('ai-loading');
        if (loadingElement) loadingElement.style.display = 'flex';
        let summarizePrompt = window.YT_TOOLKIT_PROMPTS?.summarize || 
          `Summarize the following transcript in a clear, concise manner with key points and insights:\n\n`;
        ChromeBridge.sendMessage({
            action: 'MAKE_API_CALL',
            endpoint: 'generateContent',
            payload: { model: 'gemini-2.0-flash', prompt: `${summarizePrompt}${transcriptText.substring(0, 15000)}` }
        }, response => {
            buttonElement.disabled = false;
            buttonElement.textContent = 'Summarize';
            buttonElement.style.backgroundColor = '';
            const loadingElement = document.getElementById('ai-loading');
            if (loadingElement) loadingElement.style.display = 'none';
            if (response && response.success && response.data) {
                let summaryText = '';
                if (response.data.candidates && response.data.candidates[0]?.content?.parts) {
                    summaryText = response.data.candidates[0].content.parts[0].text || '';
                }
                summaryText ? renderMarkdownSummary(summaryText) : showMessage('No summary text found');
            } else {
                const errorMsg = response?.error || 'Unknown error occurred';
                showMessage(`Failed to generate summary: ${errorMsg}`);
            }
        });
    }

    function showMessage(message) {
        const resultsArea = document.getElementById('ai-result-content');
        const placeholderElement = document.getElementById('ai-result-placeholder');
        if (placeholderElement) placeholderElement.style.display = 'none';
        if (resultsArea) {
            while (resultsArea.firstChild) { resultsArea.removeChild(resultsArea.firstChild); }
            const paragraph = document.createElement('p');
            paragraph.textContent = message;
            resultsArea.appendChild(paragraph);
        }
    }

    function renderMarkdownSummary(markdownText) {
        const summaryContainer = document.getElementById('ai-result-content');
        const placeholderElement = document.getElementById('ai-result-placeholder');
        if (placeholderElement) placeholderElement.style.display = 'none';
        if (!summaryContainer) return;
        while (summaryContainer.firstChild) { summaryContainer.removeChild(summaryContainer.firstChild); }
        const lines = markdownText.split('\n');
        lines.forEach(line => {
            if (line.startsWith('# ')) {
                const h1 = document.createElement('h1');
                h1.textContent = line.substring(2);
                summaryContainer.appendChild(h1);
            } else if (line.startsWith('## ')) {
                const h2 = document.createElement('h2');
                h2.textContent = line.substring(3);
                summaryContainer.appendChild(h2);
            } else if (line.startsWith('### ')) {
                const h3 = document.createElement('h3');
                h3.textContent = line.substring(4);
                summaryContainer.appendChild(h3);
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
                let ul = summaryContainer.lastChild;
                if (!ul || ul.tagName !== 'UL') {
                    ul = document.createElement('ul');
                    summaryContainer.appendChild(ul);
                }
                const li = document.createElement('li');
                li.textContent = line.substring(2);
                ul.appendChild(li);
            } else if (line.startsWith('> ')) {
                const blockquote = document.createElement('blockquote');
                blockquote.textContent = line.substring(2);
                summaryContainer.appendChild(blockquote);
            } else if (line.trim() === '') {
                summaryContainer.appendChild(document.createElement('br'));
            } else {
                const p = document.createElement('p');
                let text = line;
                text = text.replace(/\*\*(.*?)\*\*/g, (match, p1) => {
                    const strong = document.createElement('strong');
                    strong.textContent = p1;
                    p.appendChild(strong);
                    return '';
                });
                if (text) { p.textContent = text; }
                summaryContainer.appendChild(p);
            }
        });
    }

    window.addEventListener('transcriptLoaded', () => {
        const elem = document.getElementById('loading-transcript');
        if (elem) {
            elem.style.display = 'none';
            console.log("transcriptLoaded event: loading spinner hidden");
        }
    });

    window.addEventListener('transcriptLoading', () => {
        // Check if we already have a transcript loaded from storage
        const panelContainer = document.getElementById('extension-sidepanel-container');
        if (panelContainer && panelContainer.getAttribute('data-transcript-loaded') === 'true') {
            console.log("Transcript already loaded from storage, skipping loading state");
            return;
        }
        
        // Otherwise show the loading state
        const elem = document.getElementById('loading-transcript');
        if (elem) {
            elem.style.display = 'flex';
        }
        const textarea = document.getElementById('transcript-content-textarea');
        if (textarea) {
            textarea.value = '';
        }
        const aiArea = document.getElementById('ai-result-content');
        if (aiArea) {
            aiArea.innerHTML = '';
        }
    });

    if (!window.__regenerateBtnSetup) {
        window.__regenerateBtnSetup = true;
        const btn = document.getElementById('regenerate-ai-result');
        if (btn && !btn._hasClickHandler) {
            btn._hasClickHandler = true;
            btn.addEventListener('click', () => {
                const transcriptText = document.getElementById('transcript-content-textarea')?.value || '';
                if (transcriptText && transcriptText !== 'Transcript will appear here.') {
                    document.getElementById('summarize-transcript')?.click();
                }
            });
        }
    }

    // Fix the corrupted setupTabNavigation function
    (function() {
        // Ensure safeHTMLPolicy is only defined once
        if (!window.safeHTMLPolicy) {
            window.safeHTMLPolicy = (typeof trustedTypes !== 'undefined')
                ? trustedTypes.createPolicy('ytToolkitPolicy', { createHTML: input => input })
                : { createHTML: input => input };
        }

        // Clean implementation of setupTabNavigation
        function setupTabNavigation() {
            const tabs = document.querySelectorAll('.nav-tab, .nav-tab-settings');
            const views = document.querySelectorAll('.panel-view');
            
            // Clean up any existing handlers to prevent duplicates
            tabs.forEach(tab => {
                if (tab._clickHandler) {
                    tab.removeEventListener('click', tab._clickHandler);
                    delete tab._clickHandler;
                }
                
                tab._clickHandler = function() {
                    // Deactivate all tabs and views
                    tabs.forEach(t => t.classList.remove('active'));
                    views.forEach(v => {
                        v.classList.remove('active');
                        v.classList.remove('view-active');
                        // Start fade out
                        v.style.opacity = '0';
                    });
                    
                    // Activate clicked tab
                    this.classList.add('active');
                    
                    // Handle special case for settings tab
                    if (this.id === 'tab-settings') {
                        showSettingsDialog();
                        return;
                    }
                    
                    // Activate corresponding view
                    const viewId = this.getAttribute('data-view');
                    if (!viewId) return;
                    
                    const view = document.getElementById(viewId);
                    if (!view) return;
                    
                    view.classList.add('active');
                    view.classList.add('view-active');
                    
                    // Small delay for smooth transition
                    setTimeout(() => {
                        view.style.opacity = '1';
                    }, 50);
                    
                    // Special handling for chat view
                    if (viewId === 'chat-view') {
                        const chatInput = document.getElementById('chat-input');
                        if (chatInput) chatInput.focus();
                        setTimeout(forceScrollChatToBottom, 100);
                    }
                    
                    // Update footer content
                    updateFooterContent(viewId);
                };
                
                tab.addEventListener('click', tab._clickHandler);
            });
            
            // Initialize settings
            if (typeof initializeSettings === 'function') {
                initializeSettings();
            }
        }

        // Make sure the setupTabNavigation function is global
        window.setupTabNavigation = setupTabNavigation;
        
        // Make sure the updateFooterContent function checks for null elements
        function updateFooterContent(activeViewId) {
            const footerLeft = document.querySelector('.panel-footer .actions-left');
            if (!footerLeft) return;
            
            // Clear current footer content safely
            while (footerLeft.firstChild) {
                footerLeft.removeChild(footerLeft.firstChild);
            }
        }
        
        // Make the function global too
        window.updateFooterContent = updateFooterContent;
        
        // Call setupTabNavigation when DOM is loaded
        document.addEventListener('DOMContentLoaded', setupTabNavigation);
    })();

    // Improved setupTabNavigation to include settings tab
    function setupTabNavigation() {
        const tabs = document.querySelectorAll('.nav-tab, .nav-tab-settings');
        const views = document.querySelectorAll('.panel-view');
        
        // Clean up any existing handlers to prevent duplicates
        tabs.forEach(tab => {
            if (tab._hasClickHandler) return;
            tab._hasClickHandler = true;
            
            tab.addEventListener('click', () => {
                // Deactivate all tabs and views
                tabs.forEach(t => t.classList.remove('active'));
                views.forEach(v => {
                    v.classList.remove('active');
                    v.classList.remove('view-active');
                    // Start fade out
                    v.style.opacity = '0';
                });
                
                // Activate clicked tab
                tab.classList.add('active');
                const viewId = tab.getAttribute('data-view');
                const view = document.getElementById(viewId);
                
                // If it's settings tab, load API key
                if (viewId === 'settings-view') {
                    loadApiKeyToSettingsForm();
                }
                
                if (view) {
                    // Add active class and fade in
                    view.classList.add('active');
                    view.classList.add('view-active');
                    // Small delay for smooth transition
                    setTimeout(() => {
                        view.style.opacity = '1';
                    }, 50);
                    
                    // If switching to chat, focus the input and ensure chat is scrolled
                    if (viewId === 'chat-view') {
                        document.getElementById('chat-input')?.focus();
                        setTimeout(forceScrollChatToBottom, 100);
                    }
                }
                
                // Update footer content visibility
                updateFooterContent(viewId);
            });
        });
        
        // Initial settings setup
        initializeSettings();
    }

    // Function to load API key to settings form
    function loadApiKeyToSettingsForm() {
        const apiKeyInput = document.getElementById('settings-api-key');
        if (!apiKeyInput) return;
        
        if (chrome?.storage?.sync) {
            chrome.storage.sync.get('apiKey', function(data) {
                if (data.apiKey) {
                    apiKeyInput.value = data.apiKey;
                }
            });
        } else {
            // Fallback to localStorage for testing
            const apiKey = localStorage.getItem('apiKey');
            if (apiKey) {
                apiKeyInput.value = apiKey;
            }
        }
    }

    // Initialize settings functionality
    function initializeSettings() {
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        if (saveSettingsBtn && !saveSettingsBtn._hasClickHandler) {
            saveSettingsBtn._hasClickHandler = true;
            saveSettingsBtn.addEventListener('click', saveApiKey);
        }
        
        // Load current API key
        loadApiKeyToSettingsForm();
    }

    // Save API key function
    function saveApiKey() {
        const apiKeyInput = document.getElementById('settings-api-key');
        if (!apiKeyInput) return;
        
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) return;
        
        if (chrome?.storage?.sync) {
            chrome.storage.sync.set({ apiKey: apiKey }, function() {
                showSaveSuccess();
            });
        } else {
            localStorage.setItem('apiKey', apiKey);
            showSaveSuccess();
        }
        
        // Notify content script of API key update
        ChromeBridge.sendMessage({
            action: 'API_KEY_UPDATED', 
            apiKey: apiKey 
        });
    }

    // Show save success message
    function showSaveSuccess() {
        const saveBtn = document.getElementById('save-settings-btn');
        if (!saveBtn) return;
        
        const originalText = saveBtn.textContent;
        const originalBg = saveBtn.style.backgroundColor;
        
        saveBtn.textContent = 'Saved!';
        saveBtn.style.backgroundColor = '#4CAF50';
        
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.backgroundColor = originalBg;
        }, 2000);
    }

    // Improved function to download chat history with better video title retrieval
    function downloadChatHistory() {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        // Get video title from the sidepanel element and use it as filename
        const videoTitle = document.getElementById('video-title')?.textContent?.trim() || 'YouTube-Chat';
        // Sanitize the title for filename use
        const safeTitleForFilename = videoTitle.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-');
        
        // Create text content from chat messages
        let textContent = `Chat History for: ${videoTitle}\n`;
        textContent += `Date: ${new Date().toLocaleDateString()}\n\n`;
        
        // Append each message with sender and timestamp
        const messages = chatMessages.querySelectorAll('.chat-message');
        messages.forEach(message => {
            const sender = message.classList.contains('user') ? 'You' : 'Assistant';
            const messageText = message.querySelector('.message-content').textContent.trim();
            const timestamp = message.querySelector('.timestamp').textContent.trim();
            textContent += `[${timestamp}] ${sender}: ${messageText}\n\n`;
        });
        
        // Create a blob and download link with the safe video title as filename
        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeTitleForFilename}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Update setupTabNavigation to handle view-specific footer content
    function setupTabNavigation() {
        const tabs = document.querySelectorAll('.nav-tab');
        const views = document.querySelectorAll('.panel-view');
        const settingsTab = document.getElementById('tab-settings');
        
        tabs.forEach(tab => {
            if (tab._hasClickHandler) return;
            tab._hasClickHandler = true;
            
            tab.addEventListener('click', () => {
                // Deactivate all tabs and views
                tabs.forEach(t => t.classList.remove('active'));
                views.forEach(v => {
                    v.classList.remove('active');
                    v.classList.remove('view-active'); // Reset view-active class
                    // Start fade out
                    v.style.opacity = '0';
                });
                
                // Activate clicked tab
                tab.classList.add('active');
                const viewId = tab.getAttribute('data-view');
                const view = document.getElementById(viewId);
                view.classList.add('active');
                view.classList.add('view-active'); // Add view-active class for footer content
                
                // Small delay for smooth transition
                setTimeout(() => {
                    view.style.opacity = '1';
                }, 50);
                
                // If switching to chat, focus the input and ensure chat is scrolled
                if (viewId === 'chat-view') {
                    document.getElementById('chat-input').focus();
                    setTimeout(forceScrollChatToBottom, 100); // Ensure scrolled after view change
                }
                
                // Update footer content visibility
                updateFooterContent(viewId);
            });
        });
        
        // Add handler for settings tab
        if (settingsTab && !settingsTab._hasClickHandler) {
            settingsTab._hasClickHandler = true;
            settingsTab.addEventListener('click', () => {
                // Show settings UI or dialog
                showSettingsDialog();
            });
        }
    }

    // Function to handle settings dialog
    function showSettingsDialog() {
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'settings-overlay';
        dialogOverlay.style.position = 'fixed';
        dialogOverlay.style.top = '0';
        dialogOverlay.style.left = '0';
        dialogOverlay.style.right = '0';
        dialogOverlay.style.bottom = '0';
        dialogOverlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        dialogOverlay.style.zIndex = '10001';
        dialogOverlay.style.display = 'flex';
        dialogOverlay.style.justifyContent = 'center';
        dialogOverlay.style.alignItems = 'center';
        
        const dialog = document.createElement('div');
        dialog.className = 'settings-dialog';
        dialog.style.backgroundColor = 'white';
        dialog.style.padding = '20px';
        dialog.style.borderRadius = '8px';
        dialog.style.maxWidth = '80%';
        dialog.style.width = '300px';
        dialog.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        
        // Use the Trusted Types policy for innerHTML assignment
        dialog.innerHTML = window.safeHTMLPolicy.createHTML(`
            <h3 style="margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 10px;">Settings</h3>
            <div style="margin-bottom: 15px;">
                <label for="api-key-input" style="display: block; margin-bottom: 5px;">API Key</label>
                <input type="text" id="api-key-input" style="width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px;" placeholder="Enter your API key">
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
                <button id="cancel-settings" style="background: none; border: 1px solid #ddd; padding: 8px 15px; margin-right: 10px; border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="save-settings" style="background-color: #065fd4; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Save</button>
            </div>
        `);
        
        dialogOverlay.appenZzdChild(dialog);
        document.body.appendChild(dialogOverlay);
        
        // Load current API key
        chrome.storage.sync.get('apiKey', function(data) {
            if (data.apiKey) {
                document.getElementById('api-key-input').value = data.apiKey;
            }
        });
        
        // Add event listeners to buttons
        document.getElementById('cancel-settings').addEventListener('click', () => {
            dialogOverlay.remove();
        });
        
        document.getElementById('save-settings').addEventListener('click', () => {
            const apiKey = document.getElementById('api-key-input').value.trim();
            if (apiKey) {
                // Save API key
                chrome.storage.sync.set({ apiKey: apiKey });
                
                // Notify content script of API key update
                ChromeBridge.sendMessage({ 
                    action: 'API_KEY_UPDATED', 
                    apiKey: apiKey 
                });
            }
            dialogOverlay.remove();
        });
    }

    // Function to update footer content based on active view
    function updateFooterContent(activeViewId) {
        const footerLeft = document.querySelector('.panel-footer .actions-left');
        
        // Clear current footer content
        while (footerLeft.firstChild) {
            footerLeft.removeChild(footerLeft.firstChild);
        }
        
        // Only show download chat button if we're in the chat view - DISABLED
        // No longer adding duplicate button to footer
        /* 
        if (activeViewId === 'chat-view') {
            const downloadButton = document.getElementById('download-chat');
            if (downloadButton) {
                const clone = downloadButton.cloneNode(true);
                clone.id = 'download-chat-footer';
                clone.addEventListener('click', downloadChatHistory);
                footerLeft.appendChild(clone);
            }
        }
        */
    }

    // Enhanced scroll to bottom function that ensures visibility
    function forceScrollChatToBottom() {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        // Force layout recalculation
        void chatMessages.offsetHeight;
        
        // Set scroll position to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Add a backup attempt with a slight delay for any dynamic content
        setTimeout(() => {
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 50);
    }
   
    // Override existing scrollChatToBottom with the enhanced version
    function scrollChatToBottom() {
        forceScrollChatToBottom();
    }

    // Update function so it's more robust for scrolling
    function addMessageToChat(sender, message) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}`;
        
        // Create message content
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.textContent = message;
        
        // Create timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'timestamp';
        
        // Format current time
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        timestamp.textContent = timeString;
        
        // Add elements to message div
        messageDiv.appendChild(messageContent);
        messageDiv.appendChild(timestamp);
        
        // Add to chat container
        chatMessages.appendChild(messageDiv);
            
        // Force scroll to bottom to ensure visibility of new messages
        forceScrollChatToBottom();
    }

    // Modify setupChatInterface to ensure chat is scrollable and setup is complete
    function setupChatInterface() {
        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('chat-send-btn');
        const chatMessages = document.getElementById('chat-messages');
        
        // Define sendMessage function in the proper scope so it's accessible
        window.sendMessage = function() {
            const messageText = chatInput.value.trim();
            if (!messageText) return;
            
            // Add user message to chat
            addMessageToChat('user', messageText);
            
            // Clear and reset input
            chatInput.value = '';
            chatInput.style.height = 'auto';
            sendButton.disabled = true;
            
            // Get transcript content
            const transcriptContent = document.getElementById('transcript-content-textarea').value || '';
            
            // Send to AI and get response
            sendToChatAI(messageText, transcriptContent);
        };
        
        if (chatInput && !chatInput._hasInputHandler) {
            chatInput._hasInputHandler = true;
            
            // Auto-resize input as user types
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = (chatInput.scrollHeight > 120) ? '120px' : `${chatInput.scrollHeight}px`;
                
                // Enable/disable send button based on input
                if (sendButton) {
                    sendButton.disabled = !chatInput.value.trim();
                }
            });
            
            // Handle Enter key (send message on Enter, new line on Shift+Enter)
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (sendButton && !sendButton.disabled) {
                        window.sendMessage();
                    }
                }
            });
        }
        
        if (sendButton && !sendButton._hasClickHandler) {
            sendButton._hasClickHandler = true;
            sendButton.addEventListener('click', window.sendMessage);
            
            // Initially disable send button until input is provided
            sendButton.disabled = !(chatInput && chatInput.value.trim());
        }
        
        // Fix duplicate download button issue
        // Remove any existing download button from the footer
        const existingDownloadBtn = document.getElementById('download-chat-footer');
        if (existingDownloadBtn) {
            existingDownloadBtn.remove();
        }
        
        // Only set up the in-view download button and don't create duplicates
        const downloadChatBtn = document.querySelector('#chat-view .footer-content #download-chat');
        if (downloadChatBtn && !downloadChatBtn._hasClickHandler) {
            downloadChatBtn._hasClickHandler = true;
            downloadChatBtn.addEventListener('click', downloadChatHistory);
        }
        
        // Force initial scroll to bottom
        forceScrollChatToBottom();
    }

    // Enhanced addMessageToChat with automatic scrolling
    function addMessageToChat(sender, message) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}`;
        
        // Create message content
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.textContent = message;
        
        // Create timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'timestamp';
        
        // Format current time
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        timestamp.textContent = timeString;
        
        // Add elements to message div
        messageDiv.appendChild(messageContent);
        messageDiv.appendChild(timestamp);
        
        // Add to chat container
        chatMessages.appendChild(messageDiv);
            
        // Scroll to bottom automatically
        scrollChatToBottom();
    }

    // Helper function to scroll chat to bottom
    function scrollChatToBottom() {
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // Enhanced version of sendToChatAI for better error handling
    function sendToChatAI(userMessage, transcriptContext) {
        // Show loading indicator
        addMessageToChat('assistant', '...');
        const loadingMessageIndex = document.querySelectorAll('.chat-message').length - 1;
        
        // Get the loading message element for later removal
        const loadingMessage = document.querySelectorAll('.chat-message')[loadingMessageIndex];
        
        // System prompt that instructs the AI to use the transcript
        const systemPrompt = "You are an AI assistant who has knowledge of the video transcript. " +
                             "Your goal is to help users understand the content by answering questions " +
                             "based on the transcript. Be concise, helpful, and accurate. If information " +
                             "is not in the transcript, you can say that it's not covered in the video.";
        
        // Create the prompt with context
        const contextPrompt = `${systemPrompt}\n\nTranscript:\n${transcriptContext}\n\nUser: ${userMessage}`;
        
        // Use ChromeBridge to send the API request
        ChromeBridge.sendMessage({
            action: 'MAKE_API_CALL',
            endpoint: 'generateContent',
            payload: { 
                model: 'gemini-2.0-flash',
                prompt: contextPrompt
            }
        }, response => {
            // Remove the loading message if it exists
            if (loadingMessage) {
                loadingMessage.remove();
            }
            
            if (response && response.success && response.data) {
                let aiResponse = '';
                if (response.data.candidates && response.data.candidates[0]?.content?.parts) {
                    aiResponse = response.data.candidates[0].content.parts[0].text || '';
                }
                
                if (aiResponse) {
                    addMessageToChat('assistant', aiResponse);
                } else {
                    addMessageToChat('assistant', "I'm sorry, I couldn't process your request at the moment.");
                }
            } else {
                const errorMsg = response?.error || 'Unknown error occurred';
                addMessageToChat('assistant', `I'm sorry, there was an error: ${errorMsg}`);
            }
            
            // Make sure chat is scrolled to bottom after new messages
            scrollChatToBottom();
        });
    }

    // Add this to your existing setup functions
    function initializeExtendedFeatures() {
        setupTabNavigation();
        setupChatInterface();
    }

    // Call this after ChromeBridge initialization
    setTimeout(initializeExtendedFeatures, 500);

    // Add this after your regular event listeners
    document.addEventListener('DOMContentLoaded', () => {
        // Existing code
        // Initialize extended features
        initializeExtendedFeatures();
    });

    // Call setupTabNavigation when the DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        setupTabNavigation();
        setupChatInterface();
    });

    // Also call after a delay to ensure everything is properly initialized
    setTimeout(() => {
        setupTabNavigation();
        setupChatInterface();
        forceScrollChatToBottom();
    }, 500);
})();