// Remove the import statement
// Instead, we'll access the summarize prompt from a global variable

// Add a message bridge utility at the top of the file
const ChromeBridge = {
    requestId: 0,
    pendingRequests: {},
    channelName: '',
    
    init: function() {
        // Find the channel name from the container
        const container = document.getElementById('extension-sidepanel-container') || 
                          document.getElementById('yt-ai-toolkit-panel')?.closest('#extension-sidepanel-container');
                          
        if (container) {
            this.channelName = container.getAttribute('data-bridge-channel');
            console.log('Initializing Chrome Bridge with channel:', this.channelName);
            
            // Set up listener for responses
            window.addEventListener('message', (event) => {
                if (event.data && event.data.source === this.channelName) {
                    console.log('Sidepanel received response:', event.data);
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
        if (!this.channelName) {
            const initialized = this.init();
            if (!initialized) {
                console.error('ChromeBridge not initialized and failed to initialize');
                return;
            }
        }
        
        const requestId = ++this.requestId;
        if (callback) {
            this.pendingRequests[requestId] = callback;
        }
        
        // Post message to content script
        window.postMessage({
            target: this.channelName,
            message: message,
            requestId: requestId
        }, '*');
    }
};

// Initialize the bridge when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log("Sidepanel DOM loaded, initializing ChromeBridge and setting up handlers");
    ChromeBridge.init();
    setupButtonHandlers();
});

// We also need to set up the handlers after a delay to ensure the DOM is fully ready
setTimeout(() => {
    ChromeBridge.init();
    setupButtonHandlers();
}, 1000);

// Use MutationObserver to detect when buttons are added to the DOM
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            setupButtonHandlers();
        }
    }
});

// Start observing the document body for DOM changes
observer.observe(document.body, { childList: true, subtree: true });

// Rest of the button handlers setup function (unchanged)
function setupButtonHandlers() {
  console.log("Setting up button handlers");
  
  // Debug existing elements
  console.log("Transcript button exists:", !!document.getElementById('copy-transcript'));
  console.log("AI result button exists:", !!document.getElementById('copy-ai-result'));
  console.log("Summarize button exists:", !!document.getElementById('summarize-transcript'));

  // Handle close button
  const closeButton = document.querySelector('.close-button');
  if (closeButton) {
    closeButton.addEventListener('click', function() {
      console.log("Close button clicked");
      const panel = document.querySelector('.sidepanel');
      const container = panel?.parentElement;
      if (container) {
        container.style.transform = 'translateX(300px)';
        setTimeout(() => container.remove(), 300);
      }
    });
  }

  // Handle copy transcript button
  const copyTranscriptBtn = document.getElementById('copy-transcript');
  if (copyTranscriptBtn && !copyTranscriptBtn._hasClickHandler) {
    copyTranscriptBtn._hasClickHandler = true;
    copyTranscriptBtn.addEventListener('click', function() {
      console.log("Copy transcript button clicked");
      const textArea = document.getElementById('transcript-content-textarea');
      if (textArea) {
        extensionSafeCopy(textArea.value, copyTranscriptBtn);
      }
    });
  }

  // Handle copy AI result button
  const copyAiResultBtn = document.getElementById('copy-ai-result');
  if (copyAiResultBtn && !copyAiResultBtn._hasClickHandler) {
    copyAiResultBtn._hasClickHandler = true;
    copyAiResultBtn.addEventListener('click', function() {
      console.log("Copy AI result button clicked");
      const content = document.getElementById('ai-result-content');
      if (content) {
        // Create text version of the HTML content
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
      console.log("Summarize button clicked");
      const textArea = document.getElementById('transcript-content-textarea');
      if (!textArea || !textArea.value) {
        showMessage('No transcript available to summarize');
        return;
      }

      // Visual feedback
      summarizeBtn.disabled = true;
      summarizeBtn.textContent = 'Summarizing...';
      summarizeBtn.style.backgroundColor = '#cccccc';
      
      const loadingElement = document.getElementById('ai-loading');
      if (loadingElement) loadingElement.style.display = 'block';
      
      // Get the transcript text
      const transcriptText = textArea.value;
      requestSummary(transcriptText, summarizeBtn);
    });
  }
}

// Extension-safe copy function using both execCommand and the Clipboard API
function extensionSafeCopy(text, buttonElement) {
  console.log("Attempting to copy text via ChromeBridge:", text.substring(0, 20) + "...");
  
  // Save original button state
  const originalText = buttonElement.textContent;
  const originalBg = buttonElement.style.backgroundColor;
  
  // First try: Use execCommand approach as before
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
      console.log("Text copied using execCommand");
      return;
    }
  } catch (err) {
    console.error("execCommand copy failed:", err);
  }
  
  // Second try: Use ChromeBridge to request copy via background script
  try {
    ChromeBridge.sendMessage({
      action: 'COPY_TO_CLIPBOARD',
      text: text
    }, response => {
      if (response && response.success) {
        showCopyFeedback(buttonElement, true, originalText, originalBg);
        console.log("Text copied using ChromeBridge");
      } else {
        showCopyFeedback(buttonElement, false, originalText, originalBg);
        console.error("Background script copy failed:", response?.error);
      }
    });
  } catch (err) {
    console.error("ChromeBridge copy failed:", err);
    showCopyFeedback(buttonElement, false, originalText, originalBg);
  }
}

// Show visual feedback for copy operation
function showCopyFeedback(buttonElement, success, originalText, originalBg) {
  if (success) {
    buttonElement.textContent = 'Copied!';
    buttonElement.style.backgroundColor = '#4CAF50'; // Green
  } else {
    buttonElement.textContent = 'Error!';
    buttonElement.style.backgroundColor = '#f44336'; // Red
  }
  
  // Reset after delay
  setTimeout(() => {
    buttonElement.textContent = originalText;
    buttonElement.style.backgroundColor = originalBg;
  }, 2000);
}

// Function to request summary from background script - MODIFIED
function requestSummary(transcriptText, buttonElement) {
  console.log("Requesting summary for transcript - length:", transcriptText.length);
  
  // Show loading state in the results area using DOM manipulation
  const resultsArea = document.getElementById('ai-result-content');
  // Hide the placeholder text when starting a summary
  const placeholderElement = document.getElementById('ai-result-placeholder');
  if (placeholderElement) {
    placeholderElement.style.display = 'none';
  }
  
  if (resultsArea) {
    // Clear existing content safely
    while (resultsArea.firstChild) {
      resultsArea.removeChild(resultsArea.firstChild);
    }
    
    // Create loading message with DOM manipulation
    const loadingElement = document.createElement('em');
    loadingElement.textContent = 'Generating summary with AI...';
    resultsArea.appendChild(loadingElement);
  }
  
  // Show loading indicator
  const loadingElement = document.getElementById('ai-loading');
  if (loadingElement) loadingElement.style.display = 'flex';
  
  // Add more debug info to verify message format
  console.log("Sending message with action: MAKE_API_CALL via ChromeBridge");
  
  // Get the summarize prompt from global variable or use default if not available
  let summarizePrompt = '';
  try {
    summarizePrompt = window.YT_TOOLKIT_PROMPTS?.summarize || 
      `Summarize the following transcript in a clear, concise manner with key points and insights:\n\n`;
  } catch (e) {
    console.warn("Could not access YT_TOOLKIT_PROMPTS, using default prompt", e);
    summarizePrompt = `Summarize the following transcript in a clear, concise manner with key points and insights:\n\n`;
  }
  
  // Use ChromeBridge to send message to background script via content script
  ChromeBridge.sendMessage({
    action: 'MAKE_API_CALL',
    endpoint: 'generateContent',
    payload: {
      model: 'gemini-2.0-flash',
      prompt: `${summarizePrompt}${transcriptText.substring(0, 15000)}` // Limit to avoid token issues
    }
  }, response => {
    console.log("Received summary response via ChromeBridge:", response);
    
    // Hide loading indicators
    buttonElement.disabled = false;
    buttonElement.textContent = 'Summarize';
    buttonElement.style.backgroundColor = '';
    
    const loadingElement = document.getElementById('ai-loading');
    if (loadingElement) loadingElement.style.display = 'none';
    
    if (response && response.success && response.data) {
      console.log("Summary received successfully");
      // Process the successful response
      try {
        // Extract the summary text from the API response
        let summaryText = '';
        
        if (response.data.candidates && response.data.candidates[0]?.content?.parts) {
          summaryText = response.data.candidates[0].content.parts[0].text || '';
          console.log("Extracted summary text:", summaryText.substring(0, 100) + "...");
        }
        
        if (summaryText) {
          renderMarkdownSummary(summaryText);
        } else {
          showMessage('No summary text found in the response');
        }
      } catch (e) {
        console.error("Error processing summary response:", e);
        showMessage('Error processing the summary response: ' + e.message);
      }
    } else {
      // Handle error response
      const errorMsg = response?.error || 'Unknown error occurred';
      showMessage(`Failed to generate summary: ${errorMsg}`);
      console.error('Summary API error:', errorMsg);
    }
  });
}

// Show a message in the results area - Modified to use DOM methods
function showMessage(message) {
  const resultsArea = document.getElementById('ai-result-content');
  const placeholderElement = document.getElementById('ai-result-placeholder');
  
  // Ensure placeholder remains hidden
  if (placeholderElement) {
    placeholderElement.style.display = 'none';
  }
  
  if (resultsArea) {
    // Clear existing content safely
    while (resultsArea.firstChild) {
      resultsArea.removeChild(resultsArea.firstChild);
    }
    
    // Create and append paragraph with text
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    resultsArea.appendChild(paragraph);
  }
}

// Function to display message in summary area - MODIFIED
function showSummaryMessage(message) {
  const summaryContainer = document.getElementById('ai-result-content');
  if (summaryContainer) {
    // Use textContent instead of innerHTML
    summaryContainer.textContent = message;
  }
}

// Render markdown as HTML - MODIFIED
function renderMarkdownSummary(markdownText) {
  const summaryContainer = document.getElementById('ai-result-content');
  const placeholderElement = document.getElementById('ai-result-placeholder');
  
  // Ensure placeholder remains hidden
  if (placeholderElement) {
    placeholderElement.style.display = 'none';
  }
  
  if (!summaryContainer) return;
  
  // Clear existing content first
  while (summaryContainer.firstChild) {
    summaryContainer.removeChild(summaryContainer.firstChild);
  }
  
  // Parse the markdown and create DOM elements directly instead of using innerHTML
  const lines = markdownText.split('\n');
  
  lines.forEach(line => {
    // Handle different markdown elements
    if (line.startsWith('# ')) {
      const h1 = document.createElement('h1');
      h1.textContent = line.substring(2);
      summaryContainer.appendChild(h1);
    } 
    else if (line.startsWith('## ')) {
      const h2 = document.createElement('h2');
      h2.textContent = line.substring(3);
      summaryContainer.appendChild(h2);
    }
    else if (line.startsWith('### ')) {
      const h3 = document.createElement('h3');
      h3.textContent = line.substring(4);
      summaryContainer.appendChild(h3);
    }
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      // Create list items
      let ul = summaryContainer.lastChild;
      if (!ul || ul.tagName !== 'UL') {
        ul = document.createElement('ul');
        summaryContainer.appendChild(ul);
      }
      const li = document.createElement('li');
      li.textContent = line.substring(2);
      ul.appendChild(li);
    }
    else if (line.startsWith('> ')) {
      // Create blockquotes
      const blockquote = document.createElement('blockquote');
      blockquote.textContent = line.substring(2);
      summaryContainer.appendChild(blockquote);
    }
    else if (line.trim() === '') {
      // Empty line becomes paragraph break
      summaryContainer.appendChild(document.createElement('br'));
    }
    else {
      // Regular text becomes paragraph
      const p = document.createElement('p');
      
      // Handle basic inline formatting
      let text = line;
      // Bold
      text = text.replace(/\*\*(.*?)\*\*/g, function(match, p1) {
        const strong = document.createElement('strong');
        strong.textContent = p1;
        p.appendChild(strong);
        return '';
      });
      
      // If there's still text to add after removing formatting markers
      if (text) {
        p.textContent = text;
      }
      
      summaryContainer.appendChild(p);
    }
  });
}

// Listen for custom event to hide loading spinner
window.addEventListener('transcriptLoaded', () => {
  document.getElementById('loading-transcript').style.display = 'none';
});

window.addEventListener('transcriptLoading', () => {
  document.getElementById('loading-transcript').style.display = 'flex'; // Or 'block' if flex not needed
  document.getElementById('transcript-content-textarea').value = ''; // Clear previous transcript
  document.getElementById('ai-result-content').innerHTML = ''; // Clear any AI results too for fresh start

});

// Setup regenerate button
const regenerateBtn = document.getElementById('regenerate-ai-result');
if (regenerateBtn) {
  regenerateBtn.addEventListener('click', () => {
    const transcriptText = document.getElementById('transcript-content-textarea')?.value || '';
    if (transcriptText && transcriptText !== 'Transcript will appear here.') {
      // Re-run the summarize process
      document.getElementById('summarize-transcript')?.click();
    }
  });
}