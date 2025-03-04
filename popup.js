document.addEventListener('DOMContentLoaded', function() {
  // Check if API key already exists - if so, inject sidepanel and close popup
  chrome.storage.sync.get('apiKey', function(data) {
    if (data.apiKey) {
      // API key exists, tell content script to show sidepanel and close popup
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs || !tabs[0] || !tabs[0].url) {
          console.error("No active tab found");
          return;
        }
        
        // First inject content script to make sure it's loaded
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content.js']
        }).then(() => {
          // Now that content script is guaranteed to be loaded, send the message
          chrome.tabs.sendMessage(
            tabs[0].id, 
            {action: 'SHOW_SIDEPANEL', validated: true},
            function(response) {
              if (chrome.runtime.lastError) {
                console.warn("Error showing sidepanel:", chrome.runtime.lastError.message);
                // Keep popup open if there was an error
              } else {
                window.close(); // Close popup on success
              }
            }
          );
        }).catch(err => {
          console.error("Failed to inject content script:", err);
          // Show error in popup
          const status = document.getElementById('api-key-status');
          if (status) {
            status.textContent = "Error: Could not load content script. Please make sure you're on YouTube.";
            status.className = 'status error';
          }
        });
      });
    } else {
      // No API key exists, show the form
      document.getElementById('api-key-form').style.display = 'block';
    }
  });

  console.log('Popup script loaded');
  
  // Elements
  const apiKeyInput = document.getElementById('api-key');
  const saveApiKeyButton = document.getElementById('save-api-key');
  const validateApiKeyButton = document.getElementById('validate-api-key');
  const apiKeyStatus = document.getElementById('api-key-status');
  const toggleTranscript = document.getElementById('toggle-transcript');
  
  // Load saved API key if it exists
  chrome.storage.sync.get('apiKey', function(data) {
    console.log('Retrieved API key from storage:', data.apiKey ? 'Key exists' : 'No key found');
    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
      apiKeyStatus.textContent = 'API key is saved';
      apiKeyStatus.className = 'status success';
    }
  });
  
  // Load transcript panel visibility state
  chrome.storage.sync.get('transcriptPanelVisible', function(data) {
    console.log('Retrieved panel visibility from storage:', data.transcriptPanelVisible);
    if (data.transcriptPanelVisible !== undefined) {
      toggleTranscript.checked = data.transcriptPanelVisible;
    }
  });
  
  // Save API Key
  saveApiKeyButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    console.log('Save API key button clicked, key exists:', !!apiKey);
    
    if (!apiKey) {
      apiKeyStatus.textContent = 'Please enter an API key';
      apiKeyStatus.className = 'status error';
      return;
    }
    
    // Save API key to storage
    chrome.storage.sync.set({ apiKey: apiKey }, function() {
      console.log('API key saved to storage');
      apiKeyStatus.textContent = 'API key saved successfully!';
      apiKeyStatus.className = 'status success';
      
      // Notify content script that API key has been updated
      sendMessageToActiveYouTubeTab({ 
        action: 'API_KEY_UPDATED', 
        apiKey: apiKey 
      });
    });
  });
  
  // Validate API Key with enhanced feedback
  validateApiKeyButton.addEventListener('click', function() {
    console.log('Validate API key button clicked');
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      console.log('No API key provided for validation');
      apiKeyStatus.textContent = 'Please enter an API key';
      apiKeyStatus.className = 'status error';
      return;
    }
    
    console.log('Sending API key validation request, key starts with:', apiKey.substring(0, 5) + '...');
    apiKeyStatus.textContent = 'Validating API key with Google AI...';
    apiKeyStatus.className = 'status';
    
    // Disable button during validation and show spinner
    validateApiKeyButton.disabled = true;
    validateApiKeyButton.innerHTML = '<span class="spinner"></span> Testing...';
    
    // Send message to background script to validate API key
    chrome.runtime.sendMessage(
      { action: 'VALIDATE_API_KEY', apiKey: apiKey },
      function(response) {
        // Check for connection error
        if (chrome.runtime.lastError) {
          console.error('Error sending message to background script:', chrome.runtime.lastError);
          validateApiKeyButton.disabled = false;
          validateApiKeyButton.textContent = 'Test API Key';
          apiKeyStatus.textContent = `Error: ${chrome.runtime.lastError.message}`;
          apiKeyStatus.className = 'status error';
          return;
        }
        
        console.log('Received validation response:', response);
        
        validateApiKeyButton.disabled = false;
        validateApiKeyButton.textContent = 'Test API Key';
        
        if (response && response.valid) {
          console.log('API key validation successful');
          apiKeyStatus.textContent = response.message || 'API key is valid!';
          apiKeyStatus.className = 'status success';
          
          // Auto-save valid API key
          chrome.storage.sync.set({ apiKey: apiKey });
          
          // Notify content script to show side panel
          sendMessageToActiveYouTubeTab({ action: 'SHOW_SIDEPANEL', validated: true });
          
          // Close popup after a brief delay
          setTimeout(() => {
            window.close();
          }, 500);
        } else {
          console.error('API key validation failed:', response ? response.error : 'Unknown error');
          apiKeyStatus.textContent = response && response.error ? response.error : 'Invalid API key';
          apiKeyStatus.className = 'status error';
        }
      }
    );
  });
  
  // Toggle transcript panel
  toggleTranscript.addEventListener('change', function() {
    const isVisible = toggleTranscript.checked;
    console.log('Toggle transcript panel changed to:', isVisible);
    
    // Save state to storage
    chrome.storage.sync.set({ transcriptPanelVisible: isVisible });
    
    // Send message to content script to toggle panel
    sendMessageToActiveYouTubeTab({ 
      action: 'TOGGLE_TRANSCRIPT_PANEL',
      visible: isVisible
    });
  });
  
  // Helper function to send message to active YouTube tab with improved error handling
  function sendMessageToActiveYouTubeTab(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs.length || !tabs[0].url) {
        console.warn("No active tab found");
        const status = document.getElementById('api-key-status');
        if (status) {
          status.textContent = "Error: No active tab found.";
          status.className = 'status error';
        }
        return;
      }
      
      // Check if current tab is YouTube
      if (!tabs[0].url.includes("youtube.com")) {
        console.warn("Not on YouTube; this extension only works on YouTube.com");
        const status = document.getElementById('api-key-status');
        if (status) {
          status.textContent = "Error: This extension only works on YouTube.com";
          status.className = 'status error';
        }
        return;
      }
      
      // Inject the content script before sending messages to ensure it's loaded
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }).then(() => {
        // Now send the message to the injected content script
        chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
          if (chrome.runtime.lastError) {
            console.warn("Message send error:", chrome.runtime.lastError.message);
            const status = document.getElementById('api-key-status');
            if (status) {
              status.textContent = "Error connecting to YouTube page. Try refreshing.";
              status.className = 'status error';
            }
          } else {
            console.log("Received reply:", response);
          }
        });
      }).catch(err => {
        console.error("Failed to inject content script:", err);
        const status = document.getElementById('api-key-status');
        if (status) {
          status.textContent = "Error: Could not load content script.";
          status.className = 'status error';
        }
      });
    });
  }
  
  // Check if current page is YouTube
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs[0]) {
      console.log('No active tab found');
    } else {
      console.log('Active tab URL:', tabs[0].url);
    }
    
    if (!tabs[0] || !tabs[0].url.includes("youtube.com")) {
      console.log('Not on YouTube, showing notice');
      document.body.innerHTML = `
        <h1>YouTube Transcript & AI Toolkit</h1>
        <div class="section">
          <p>Please navigate to a YouTube video to use this extension.</p>
        </div>
      `;
    }
  });
  
  // Add a manual test button for debugging
  const debugContainer = document.createElement('div');
  debugContainer.innerHTML = `
    <div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee;">
      <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Debugging Tools:</div>
      <button id="debug-test-api">Debug API Test</button>
      <div id="debug-output" style="font-family: monospace; font-size: 11px; margin-top: 5px; white-space: pre-wrap; max-height: 100px; overflow-y: auto;"></div>
    </div>
  `;
  document.body.appendChild(debugContainer);
  
  // Add event listener for the debug button
  document.getElementById('debug-test-api').addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    const debugOutput = document.getElementById('debug-output');
    
    debugOutput.textContent = 'Testing API key directly...\n';
    
    // Test using Gemini-1.5-flash model which may have different requirements
    fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: "Hello, this is a test."
          }]
        }]
      })
    })
    .then(response => {
      debugOutput.textContent += `Response status: ${response.status}\n`;
      return response.json();
    })
    .then(data => {
      debugOutput.textContent += `Response data: ${JSON.stringify(data).substring(0, 100)}...\n`;
    })
    .catch(error => {
      debugOutput.textContent += `Error: ${error.message}\n`;
    });
  });

  const testButton = document.getElementById('testConnection');
  testButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'PING' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error sending ping:", chrome.runtime.lastError.message);
        alert("Background connection not available.");
      } else {
        console.log("Background responded:", response);
        alert("Background connection established.");
      }
    });
  });
});
