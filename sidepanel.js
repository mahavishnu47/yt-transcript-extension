// Remove import statement; use global prompt variable

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
                        const requestId = event.data.requestId;
                        const callback = this.pendingRequests[requestId];
                        if (callback) {
                            callback(event.data.response);
                            delete this.pendingRequests[requestId];
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
            const requestId = ++this.requestId;
            if (callback) this.pendingRequests[requestId] = callback;
            window.postMessage({
                target: this.channelName,
                message: message,
                requestId: requestId
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
    // Handle minimize button – when clicked, save transcript and remove panel.
    const minimizeBtn = document.getElementById('panel-minimize');
    if (minimizeBtn && !minimizeBtn._hasClickHandler) {
        minimizeBtn._hasClickHandler = true;
        minimizeBtn.addEventListener('click', function() {
            const panel = document.getElementById('extension-sidepanel-container');
            if (!panel) return;
            // Save transcript chat before removal
            const textarea = panel.querySelector('#transcript-content-textarea');
            if (textarea) {
                if (chrome && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ lastTranscript: textarea.value }, () => {
                        console.log("Saved transcript chat upon minimize using chrome.storage.local.");
                    });
                } else {
                    window.localStorage.setItem('lastTranscript', textarea.value);
                    console.log("Saved transcript chat upon minimize using localStorage.");
                }
            }
            // Remove panel from DOM
            panel.remove();
            console.log("Panel minimized (removed).");
        });
    }
    
    // Handle copy transcript button
    const copyTranscriptBtn = document.getElementById('copy-transcript');
    if (copyTranscriptBtn && !copyTranscriptBtn._hasClickHandler) {
        copyTranscriptBtn._hasClickHandler = true;
        copyTranscriptBtn.addEventListener('click', function() {
            const textArea = document.getElementById('transcript-content-textarea');
            if (textArea) extensionSafeCopy(textArea.value, copyTranscriptBtn);
        });
    }
    
    // Handle copy AI result button
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
    
    // Handle summarize transcript button
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
            if (loadingElement) loadingElement.style.display = 'block';
            const transcriptText = textArea.value;
            requestSummary(transcriptText, summarizeBtn);
        });
    }
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

function showCopyFeedback(buttonElement, success, originalText, originalBg) {
    buttonElement.textContent = success ? 'Copied!' : 'Error!';
    buttonElement.style.backgroundColor = success ? '#4CAF50' : '#f44336';
    setTimeout(() => {
        buttonElement.textContent = originalText;
        buttonElement.style.backgroundColor = originalBg;
    }, 2000);
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