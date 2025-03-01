// Background script - Handles extension activation and messaging

// Keep track of active YouTube tabs
const activeTabs = new Set();
// Map to store the last processed video ID for each tab
const lastVideoIds = new Map();

// Listen for when a tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Check if the tab update is complete and the URL is a YouTube video
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
        // Extract the video ID from the URL
        const videoId = new URL(tab.url).searchParams.get('v');

        if (videoId) {
            console.log(`Tab ${tabId} loaded YouTube video: ${videoId}`);

            // Check if the video ID is new or changed
            const previousVideoId = lastVideoIds.get(tabId);
            if (videoId !== previousVideoId) {
                console.log(`Video ID changed or new video for tab ${tabId}. Previous ID: ${previousVideoId}, New ID: ${videoId}`);
                lastVideoIds.set(tabId, videoId); // Update last video ID

                // Add to active tabs
                activeTabs.add(tabId);

                // Attempt to send a message, but handle the case where content script isn't ready
                try {
                    // Send a message to the content script with the video ID
                    chrome.tabs.sendMessage(tabId, {
                        action: 'NEW_VIDEO_LOADED',
                        videoId: videoId
                    }, response => {
                        // Check for error
                        if (chrome.runtime.lastError) {
                            console.log(`Content script not ready yet for tab ${tabId}:`, chrome.runtime.lastError.message);
                            // We'll retry once content script is ready via the runtime.onConnect listener
                        } else if (response && response.success) {
                            console.log(`Message delivered successfully to tab ${tabId}`);
                        }
                    });
                } catch (error) {
                    console.error(`Error sending message to tab ${tabId}:`, error);
                }
            } else {
                console.log(`Video ID is the same for tab ${tabId}, not sending NEW_VIDEO_LOADED message again.`);
            }
        }
    }
});

// Listen for connections from content scripts
chrome.runtime.onConnect.addListener((port) => {
    console.log(`Connection established with ${port.name}`);

    if (port.name === 'yt-transcript-content') {
        // Content script is ready to receive messages
        port.onMessage.addListener((msg) => {
            if (msg.action === 'CONTENT_SCRIPT_READY') {
                const tabId = msg.tabId;
                console.log(`Content script ready in tab ${tabId}`);

                // Check if we need to send the video ID on initial connect
                chrome.tabs.get(tabId, tab => {
                    if (chrome.runtime.lastError) {
                        console.error('Error getting tab:', chrome.runtime.lastError);
                        return;
                    }

                    if (tab.url && tab.url.includes('youtube.com/watch')) {
                        const videoId = new URL(tab.url).searchParams.get('v');
                        if (videoId) {
                            // Check again if video ID is new before sending - avoid redundancy
                            const previousVideoId = lastVideoIds.get(tabId);
                            if (!previousVideoId || videoId !== previousVideoId) {
                                console.log(`Content script connected late, sending NEW_VIDEO_LOADED for videoId: ${videoId}`);
                                lastVideoIds.set(tabId, videoId);
                                port.postMessage({
                                    action: 'NEW_VIDEO_LOADED',
                                    videoId: videoId
                                });
                            } else {
                                console.log(`Content script connected, but videoId is unchanged, no need to resend.`);
                            }
                        }
                    }
                });
            }
        });

        // Handle disconnection
        port.onDisconnect.addListener(() => {
            console.log(`Connection with ${port.name} closed`);
        });
    }
});

// Track tab removal to clean up activeTabs set and lastVideoIds map
chrome.tabs.onRemoved.addListener((tabId) => {
    if (activeTabs.has(tabId)) {
        activeTabs.delete(tabId);
        console.log(`Tab ${tabId} removed from active tabs`);
    }
    if (lastVideoIds.has(tabId)) {
        lastVideoIds.delete(tabId);
        console.log(`Tab ${tabId} video ID history cleared`);
    }
});

// Handle MAKE_API_CALL requests with improved error handling and logging
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background script received message:', request.action);
    
    // Handle API calls
    if (request.action === 'MAKE_API_CALL') {
        console.log('Processing MAKE_API_CALL request for endpoint:', request.endpoint);
        
        // Get stored API key
        chrome.storage.sync.get('apiKey', async (data) => {
            if (!data.apiKey) {
                console.error('API key not found in storage');
                sendResponse({
                    success: false,
                    error: 'API key not found. Please enter your API key in the extension settings.'
                });
                return;
            }

            console.log('API key found in storage, making API call');
            try {
                // Make the API call with the provided data and API key
                const response = await makeLLMApiCall(data.apiKey, request.endpoint, request.payload);
                console.log('API call successful, sending response');
                sendResponse({ success: true, data: response });
            } catch (error) {
                console.error('API call error:', error);
                sendResponse({
                    success: false,
                    error: error.message || 'Failed to make API call'
                });
            }
        });

        // Return true to indicate that the response will be sent asynchronously
        return true;
    }
    
    // Add handler to provide tab ID to content script
    if (request.action === 'GET_TAB_ID') {
        if (sender.tab) {
            sendResponse({tabId: sender.tab.id});
        } else {
            console.error('No tab information in sender');
            sendResponse({error: 'No tab information available'});
        }
        return true;
    }

    // Add this new handler for clipboard operations
    if (request.action === 'COPY_TO_CLIPBOARD') {
        console.log('Processing clipboard copy request');
        
        // Create a temporary textarea element in the background page context
        const textarea = document.createElement('textarea');
        textarea.value = request.text;
        document.body.appendChild(textarea);
        
        try {
            // Select the text and execute the copy command
            textarea.select();
            const success = document.execCommand('copy');
            
            // Remove the temporary element
            document.body.removeChild(textarea);
            
            // Send response back to content script
            sendResponse({ 
                success: success, 
                message: success ? 'Text copied to clipboard' : 'Copy operation failed' 
            });
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            document.body.removeChild(textarea);
            sendResponse({ success: false, error: error.message });
        }
        
        return true; // Keep the message channel open for the async response
    }

    if (request.action === 'PROCESS_AI_ACTION') { // Changed from MAKE_API_CALL to PROCESS_AI_ACTION
        console.log('Processing PROCESS_AI_ACTION request');
        // Get stored API key
        chrome.storage.sync.get('apiKey', async (data) => {
            if (!data.apiKey) {
                console.error('API key not found in storage');
                sendResponse({
                    success: false,
                    error: 'API key not found. Please enter your API key in the extension settings.'
                });
                return;
            }

            console.log('API key found in storage, making API call for action:', request.aiAction);
            try {
                // Make the API call with the provided data and API key, pass model from request
                const response = await makeLLMApiCall(data.apiKey, request.aiAction, request.payload, request.model);
                console.log('API call successful, sending response');
                sendResponse({ success: true, data: response });
            } catch (error) {
                console.error('API call error:', error);
                sendResponse({
                    success: false,
                    error: error.message || 'Failed to make API call'
                });
            }
        });

        // Return true to indicate that the response will be sent asynchronously
        return true;
    }

    // Validate API key (remains unchanged)
    if (request.action === 'VALIDATE_API_KEY') {
        console.log('Processing VALIDATE_API_KEY request');
        console.log('API Key to validate (first 5 chars):', request.apiKey.substring(0, 5) + '...');

        validateApiKey(request.apiKey)
            .then(result => {
                console.log('Validation result:', result);
                sendResponse(result);
            })
            .catch(error => {
                console.error('Validation error:', error);
                sendResponse({ valid: false, error: error.message });
            });

        // Return true to indicate that the response will be sent asynchronously
        return true;
    }
});

// Function to make LLM API calls
async function makeLLMApiCall(apiKey, endpoint, payload) {
    console.log(`Making API call to endpoint: ${endpoint}`);
    
    try {
      // Format the API URL based on the model
      const model = payload.model || 'gemini-2.0-flash';
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      console.log('Requesting URL:', apiUrl);
      
      // Format the request body according to the Gemini API structure
      const requestBody = {
        contents: [{
          parts: [{
            text: payload.prompt
          }]
        }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.4,
          topP: 0.95
        }
      };
      
      console.log('Request payload:', JSON.stringify(requestBody).substring(0, 100) + '...');
      
      // Make the API call
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('Response status:', response.status);
      console.log('Response status text:', response.statusText);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
      }
      
      const responseData = await response.json();
      console.log('Response data preview:', JSON.stringify(responseData).substring(0, 100) + '...');
      return responseData;
    } catch (error) {
      console.error('LLM API call error details:', error);
      throw error;
    }
  }

// Enhanced function to validate API key using REST API instead of the library (remains unchanged)
async function validateApiKey(apiKey) {
    console.log('Starting API key validation using Gemini API...');
    try {
        // Make a simple API call to validate the key
        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: "Respond with 'API key is valid' if you can read this message."
                        }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 20,
                        temperature: 0.1
                    }
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Validation API error response:', errorData);
            return {
                valid: false,
                error: errorData.error?.message || `API request failed with status ${response.status}`
            };
        }

        const data = await response.json();
        console.log('Validation response data:', data);

        // Check if we got a valid response with content
        if (data && data.candidates && data.candidates[0]?.content?.parts?.length > 0) {
            const text = data.candidates[0].content.parts[0].text || "";
            console.log('API key validation successful:', text);
            return {
                valid: true,
                message: "API key is valid! Connection to Google AI API successful."
            };
        } else {
            console.error('Response structure invalid:', data);
            return {
                valid: false,
                error: "Received a response but couldn't verify API key validity."
            };
        }
    } catch (error) {
        console.error('Error validating API key:', error);
        return { valid: false, error: error.message || "Unknown error during API key validation" };
    }
}

// Expose test function using self (since service workers have no window) (remains unchanged)
self.testApiKey = async function(apiKey) {
    console.log('Manual API key test initiated with key:', apiKey ? (apiKey.substring(0, 5) + '...') : 'undefined');
    const result = await validateApiKey(apiKey);
    console.log('Manual test result:', result);
    return result;
};

// Log when background script loads (remains unchanged)
console.log('YouTube Transcript & AI Toolkit background script loaded', new Date().toISOString());