// Background script for YouTube Transcript AI Toolkit

let apiKey = '';

// Load API key from storage when extension starts
chrome.storage.sync.get('apiKey', function(data) {
    if (data.apiKey) {
        apiKey = data.apiKey;
        console.log('API key loaded from storage');
    }
});

// Replace the problematic safeTabSendMessage function with a simpler version
function safeTabSendMessage(tabId, message, callback = null) {
  try {
    // Simple direct message, no executeScript
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        console.log(`Tab message error: ${chrome.runtime.lastError.message}`);
        if (callback) callback({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      if (callback) callback(response || { success: true });
    });
  } catch (error) {
    console.error('Tab message exception:', error);
    if (callback) callback({ success: false, error: error.message });
  }
}

// Add this function to store API key in localStorage as a backup
function storeApiKeyInLocalStorage(key) {
    try {
        // First store in chrome.storage for normal operation
        chrome.storage.sync.set({ apiKey: key });
        
        // Also store in localStorage as a backup for direct API mode
        try {
            // We'll send a message to content script to store in localStorage
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs && tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'STORE_BACKUP_API_KEY',
                        apiKey: key
                    });
                }
            });
        } catch (e) {
            console.warn('Could not store backup API key in localStorage:', e);
        }
    } catch (e) {
        console.error('Error storing API key:', e);
    }
}

// Listen for messages from content script or sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        console.log('Background received message:', message.action);
        
        switch (message.action) {
            case 'GET_TAB_ID':
                sendResponse({ tabId: sender.tab?.id });
                break;
                
            case 'MAKE_API_CALL':
                handleApiCall(message.endpoint, message.payload)
                    .then(response => {
                        console.log('API call successful');
                        sendResponse({ success: true, data: response });
                    })
                    .catch(error => {
                        console.error('API call failed:', error);
                        sendResponse({ 
                            success: false, 
                            error: error.message || 'API request failed',
                            details: error.details || {}
                        });
                    });
                return true; // Keep the message channel open for the async response
                
            case 'API_KEY_UPDATED':
                apiKey = message.apiKey;
                // Use the new function to store in both storage and localStorage
                storeApiKeyInLocalStorage(apiKey);
                console.log('API key updated and stored in both storage and localStorage');
                sendResponse({ success: true });
                break;
                
            case 'COPY_TO_CLIPBOARD':
                try {
                    // Use the safer approach to send messages to tabs
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs && tabs.length > 0) {
                            safeTabSendMessage(tabs[0].id, {
                                action: 'PERFORM_COPY', 
                                text: message.text
                            }, sendResponse);
                        } else {
                            sendResponse({success: false, error: "No active tab found"});
                        }
                    });
                } catch(err) {
                    console.error('Copy setup failed:', err);
                    sendResponse({success: false, error: err.message});
                }
                return true;

            case 'VALIDATE_API_KEY':
                validateApiKey(message.apiKey)
                    .then(isValid => {
                        sendResponse({ success: true, isValid });
                        
                        // If valid, also save the API key
                        if (isValid) {
                            apiKey = message.apiKey;
                            // Use the new function to store in both storage and localStorage
                            storeApiKeyInLocalStorage(apiKey);
                            
                            // Notify only YouTube tabs with a safer approach
                            chrome.tabs.query({url: "*://*.youtube.com/watch*"}, function(tabs) {
                                if (!tabs || !tabs.length) return;
                                
                                for (let tab of tabs) {
                                    safeTabSendMessage(tab.id, {
                                        action: 'API_KEY_UPDATED',
                                        apiKey: apiKey
                                    });
                                }
                            });
                        }
                    })
                    .catch(error => {
                        sendResponse({ 
                            success: false, 
                            error: error.message || 'API key validation failed' 
                        });
                    });
                return true; // Keep connection open for async response
                
            default:
                console.log('Unknown message action:', message.action);
                sendResponse({ success: false, error: 'Unknown action' });
        }
        return true; // Keep connection open for all handlers
    } catch (err) {
        console.error('Error handling background message:', err);
        sendResponse({ success: false, error: 'Background error: ' + err.message });
        return false;
    }
});

// Enhance API call function to better handle timeouts and errors for chat
async function handleApiCall(endpoint, payload) {
    console.log(`Making API call to ${endpoint}`, payload);
    
    if (!apiKey) {
        throw new Error('API key not set. Please add your Google AI API key in the extension settings.');
    }
    
    const baseUrl = 'https://generativelanguage.googleapis.com/v1';
    
    // Fix model name if needed - ensure model exists in Google AI API
    let model = payload.model;
    // Handle deprecated or incorrect model names
    if (model === 'gemini-2.0-flash') {
        model = 'gemini-1.5-flash';
    } else if (model === 'gemini-2.0-pro') {
        model = 'gemini-1.5-pro';
    } else if (!model.startsWith('gemini-')) {
        model = 'gemini-1.5-flash'; // Default to a known working model
    }
    
    const url = `${baseUrl}/models/${model}:${endpoint}?key=${apiKey}`;
    
    try {
        console.log(`Sending request to: ${url}`);
        
        // Add timeout to prevent hanging requests - increased to 60s for long transcripts
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
        
        // Make sure safety settings are not too restrictive
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: payload.prompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4096, // Increased max tokens for longer responses
                    topP: 0.95
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }
                ]
            }),
            signal: controller.signal
        });
        
        // Clear timeout since request completed
        clearTimeout(timeoutId);
        
        // Handle non-OK responses
        if (!response.ok) {
            const data = await response.json();
            console.error('API error response:', data);
            
            // Provide more helpful error messages
            if (response.status === 400) {
                throw new Error('Invalid request. The prompt might be too long or contain invalid content.');
            } else if (response.status === 401) {
                throw new Error('API key is invalid or has expired.');
            } else if (response.status === 403) {
                throw new Error('Access denied. Your API key may not have permission to use this model.');
            } else if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please try again in a few minutes.');
            } else {
                throw new Error(data.error?.message || `HTTP error ${response.status}`);
            }
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API request error:', error);
        
        if (error.name === 'AbortError') {
            throw new Error('The request timed out. Your transcript may be too long or the AI service is busy.');
        } else {
            throw error;
        }
    }
}

// Function to validate an API key
async function validateApiKey(key) {
    try {
        console.log('Validating API key...');
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash?key=${key}`
        );
        
        const responseData = await response.json();
        
        if (response.ok) {
            console.log('API key validation successful');
            return true;
        } else {
            console.error('API key validation failed:', responseData.error?.message);
            throw new Error(responseData.error?.message || `HTTP error ${response.status}`);
        }
    } catch (error) {
        console.error('API key validation error:', error);
        throw error;
    }
}

// Enhance the background script to properly check for API key and auto-show sidepanel

// Add a function to check if API key exists and is valid
function checkApiKeyAndNotifyTab(tabId, tabUrl) {
    // Only proceed for YouTube watch URLs
    if (!tabUrl || !tabUrl.includes('youtube.com/watch')) {
        return;
    }
    
    console.log('Checking for API key for YouTube tab:', tabId);
    
    // Check if API key exists in storage
    chrome.storage.sync.get('apiKey', function(data) {
        if (data.apiKey) {
            apiKey = data.apiKey;
            console.log('API key found in storage, validating...');
            
            // Validate the API key
            validateApiKey(data.apiKey)
                .then(isValid => {
                    if (isValid) {
                        console.log('API key is valid, notifying tab to show sidepanel');
                        // Notify tab to show sidepanel with validated API key
                        safeTabSendMessage(tabId, {
                            action: 'API_KEY_UPDATED',
                            apiKey: data.apiKey
                        });
                    } else {
                        console.log('API key validation failed, showing popup');
                        // If invalid, we should prompt for a new key
                        chrome.action.openPopup();
                    }
                })
                .catch(error => {
                    console.error('Error validating API key:', error);
                    // If validation fails for any reason, we should show the popup
                    chrome.action.openPopup();
                });
        } else {
            console.log('No API key found, showing popup');
            // No API key, show popup
            chrome.action.openPopup();
        }
    });
}

// In the chrome.tabs.onUpdated listener, modify to inject content script directly
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only check when the tab has completed loading
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    console.log('YouTube video page loaded:', tab.url);
    
    // Check if API key exists in storage first
    chrome.storage.sync.get('apiKey', function(data) {
      if (data.apiKey) {
        // We have an API key, store it and notify tab
        apiKey = data.apiKey;
        
        // Try sending message directly first
        chrome.tabs.sendMessage(tabId, { action: 'PING' }, function(response) {
          if (chrome.runtime.lastError) {
            console.log('Content script not loaded yet, injecting it...');
            // Content script not ready, inject it
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content.js']
            }).then(() => {
              // Give it time to initialize then send the API key
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, {
                  action: 'API_KEY_UPDATED',
                  apiKey: data.apiKey
                });
              }, 300);
            }).catch(err => {
              console.error('Error injecting content script:', err);
            });
          } else {
            // Content script is ready, send message directly
            chrome.tabs.sendMessage(tabId, {
              action: 'API_KEY_UPDATED',
              apiKey: data.apiKey
            });
          }
        });
      } else {
        // No API key found, show popup
        chrome.action.openPopup();
      }
    });
  }
});

// Add this listener to handle first-time extension clicks
chrome.action.onClicked.addListener((tab) => {
    if (tab.url && tab.url.includes('youtube.com/watch')) {
        // On YouTube video page, check for API key first
        chrome.storage.sync.get('apiKey', function(data) {
            if (data.apiKey) {
                // We have a key, don't show popup, just inject panel
                safeTabSendMessage(tab.id, {
                    action: 'API_KEY_UPDATED',
                    apiKey: data.apiKey
                });
            } else {
                // No API key, show popup
                chrome.action.openPopup();
            }
        });
    } else {
        // Not on a YouTube video page, show popup
        chrome.action.openPopup();
    }
});

// Listen for installation or update events
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    }
});