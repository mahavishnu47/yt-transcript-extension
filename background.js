// Background script - Handles extension activation and messaging

// Keep track of active YouTube tabs
const activeTabs = new Set();

// Listen for when a tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the tab update is complete and the URL is a YouTube video
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    // Extract the video ID from the URL
    const videoId = new URL(tab.url).searchParams.get('v');
    
    if (videoId) {
      console.log(`Tab ${tabId} loaded YouTube video: ${videoId}`);
      
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
        console.log(`Content script ready in tab ${msg.tabId}`);
        
        // Check if we need to send the video ID
        chrome.tabs.get(msg.tabId, tab => {
          if (chrome.runtime.lastError) {
            console.error('Error getting tab:', chrome.runtime.lastError);
            return;
          }
          
          if (tab.url && tab.url.includes('youtube.com/watch')) {
            const videoId = new URL(tab.url).searchParams.get('v');
            if (videoId) {
              port.postMessage({
                action: 'NEW_VIDEO_LOADED',
                videoId: videoId
              });
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

// Track tab removal to clean up activeTabs set
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTabs.has(tabId)) {
    activeTabs.delete(tabId);
    console.log(`Tab ${tabId} removed from active tabs`);
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request.action);
  
  // Handle API calls that might need background script privileges
  if (request.action === 'MAKE_API_CALL') {
    console.log('Processing MAKE_API_CALL request');
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
  
  // Validate API key
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
  console.log('API Key (first 5 chars):', apiKey.substring(0, 5) + '...');
  
  try {
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
    console.log('Requesting URL:', apiUrl);
    
    const requestBody = {
      contents: [{
        parts: [{
          text: payload.prompt
        }]
      }]
    };
    console.log('Request payload:', JSON.stringify(requestBody).substring(0, 100) + '...');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
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

// Enhanced function to validate API key using REST API instead of the library
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

// Expose test function using self (since service workers have no window)
self.testApiKey = async function(apiKey) {
  console.log('Manual API key test initiated with key:', apiKey ? (apiKey.substring(0, 5) + '...') : 'undefined');
  const result = await validateApiKey(apiKey);
  console.log('Manual test result:', result);
  return result;
};

// Log when background script loads
console.log('YouTube Transcript & AI Toolkit background script loaded', new Date().toISOString());
