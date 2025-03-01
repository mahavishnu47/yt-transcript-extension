(function() {
    // Prevent re-injection if the script runs multiple times
    if (window.hasRunYTTranscriptContent) return;
    window.hasRunYTTranscriptContent = true;

    // Declare variables only within this isolated scope
    let currentVideoId = null;
    let transcriptData = null;
    let isPanelOpen = false;
    let apiKey = null;

    // Load API key from storage when script initializes
    chrome.storage.sync.get('apiKey', function(data) {
        if (data.apiKey) {
            console.log('API key retrieved from storage');
            apiKey = data.apiKey;
        }
    });

    // Get transcript for a YouTube video with UI-based scraping only
    async function getTranscript(videoId) {
        // Show the loading spinner
        const panel = document.getElementById('extension-sidepanel-container');
        if (panel) {
            const loadingElement = panel.querySelector('#loading-transcript');
            if (loadingElement) {
                loadingElement.style.display = 'flex';
            }
        }
        
        try {
            console.log(`Getting transcript for video ${videoId} using UI method`);
            // Look for the transcript button in the YouTube UI
            let transcriptButton = document.querySelector('button.yt-spec-button-shape-next[aria-label="Show transcript"]');
            if (!transcriptButton) {
                transcriptButton = document.querySelector('.ytd-transcript-button-renderer'); // Fallback selector
            }

            if (transcriptButton) {
                console.log('Transcript button found, clicking it');
                transcriptButton.click();
                console.log('Transcript button clicked (initial click to open)');

                // Wait for transcript to load - INCREASED TIMEOUT
                await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3000ms
                console.log("Timeout finished, looking for transcript entries"); // DEBUG

                // Target the transcript container
                const transcriptEntries = Array.from(document.querySelectorAll('ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer'));
                console.log(`Number of transcript entries found: ${transcriptEntries.length}`);

                if (transcriptEntries.length > 0) {
                    console.log(`Found ${transcriptEntries.length} transcript segments via UI`);

                    const transcriptSegments = transcriptEntries.map(entry => {
                        const timeEl = entry.querySelector('.segment-timestamp');
                        const textEl = entry.querySelector('.segment-text');

                        if (timeEl && textEl) {
                            return {
                                time: timeEl.textContent.trim(),
                                text: textEl.textContent.trim()
                            };
                        }
                        return null;
                    }).filter(Boolean);

                    // Close the transcript panel using toggle button (primary method)
                    await attemptCloseTranscriptPanel(transcriptButton);

                    // Store and return the transcript data
                    if (transcriptSegments.length > 0) {
                        transcriptData = transcriptSegments;
                        
                        // Update the transcript in the sidepanel with processed transcript
                        const fullText = transcriptSegments.map(segment => segment.text).join(' ');
                        updateSidepanelTranscript(fullText);
                        
                        return transcriptSegments;
                    }
                } else {
                    console.log("No transcript segments found in UI after clicking button"); // DEBUG
                }


                // Always close the transcript panel (using toggle button as fallback)
                await attemptCloseTranscriptPanel(transcriptButton, true); // Force close as fallback


            } else {
                console.warn("Transcript button not found in YouTube UI");
            }

            // If we get here, we couldn't find a transcript using UI
            console.warn("Couldn't get the transcript, sorry (UI method failed).");
            updateSidepanelTranscript("Transcript not available for this video.");
            return []; // Return empty array to indicate failure

        } catch (error) {
            console.error("Error fetching UI transcript:", error);
            updateSidepanelTranscript("Error loading transcript.");
            return []; // Return empty array in case of error
        } finally {
            // Always hide the loading spinner
            if (panel) {
                const loadingElement = panel.querySelector('#loading-transcript');
                if (loadingElement) {
                    loadingElement.style.display = 'none';
                }
            }
            // Indicate transcript loading finished (even if failed) - important to hide spinner
            window.dispatchEvent(new CustomEvent('transcriptLoaded'));
            console.log("Dispatching 'transcriptLoaded' event - spinner should stop"); // DEBUG
        }
    }

    // Helper function to update transcript in sidepanel
    function updateSidepanelTranscript(text) {
        const panel = document.getElementById('extension-sidepanel-container');
        if (panel) {
            const textareaElement = panel.querySelector('#transcript-content-textarea');
            if (textareaElement) {
                textareaElement.value = text;
            }
            
            // Explicitly hide the loading spinner
            const loadingElement = panel.querySelector('#loading-transcript');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
        }
    }

    // Helper function to attempt closing the transcript panel, primarily by toggling the transcript button (unchanged)
    async function attemptCloseTranscriptPanel(transcriptButton, forceCloseFallback = false) {
        let attempts = 3; // Number of retry attempts
        let delay = 500;  // Delay between attempts in milliseconds
        let closed = false;

        // First, try toggling the transcript button
        console.log("Attempting to close transcript panel by toggling transcript button");
        if (transcriptButton) {
            transcriptButton.click(); // Toggle button to close
            console.log("Transcript button toggled to close panel (attempt 1).");
            closed = true; // Assume success for now, as button toggle should work
        } else {
             console.warn("Transcript button not found for toggle-close attempt.");
        }


        if (!closed && forceCloseFallback) {
            console.warn("Transcript button toggle failed or button not found, attempting forced close via close button (fallback).");
            for (let i = 0; i < attempts; i++) {
                const closeButton = document.querySelector('.ytd-transcript-renderer .close-button');
                if (closeButton) {
                    console.log(`Close button found on fallback attempt ${i+1}, clicking.`);
                    closeButton.click();
                    closed = true;
                    break; // Exit loop if button is found and clicked
                } else {
                    console.warn(`Close button NOT found on fallback attempt ${i+1}. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay)); // Wait before retry
                }
            }
        }


        if (!closed && forceCloseFallback) {
            console.warn("Forced close via close button also failed after retries.");
        }
    }


    // Function to inject the side panel into the YouTube page (remains unchanged)
    function injectSidePanel() {
        if (document.getElementById('extension-sidepanel-container')) {
            console.log('Side panel already exists');
            return;
        }

        console.log('Injecting side panel');

        // Create a div container instead of iframe to have better control
        const panelContainer = document.createElement('div');
        panelContainer.id = 'extension-sidepanel-container';
        panelContainer.style.position = 'fixed';
        panelContainer.style.top = '0';
        panelContainer.style.right = '0';
        panelContainer.style.width = '300px';
        panelContainer.style.height = '100vh';
        panelContainer.style.border = 'none';
        panelContainer.style.zIndex = '10000';
        panelContainer.style.backgroundColor = '#ffffff';
        panelContainer.style.boxShadow = '-5px 0 15px rgba(0,0,0,0.2)';
        panelContainer.style.transition = 'transform 0.3s ease-in-out';
        panelContainer.style.transform = 'translateX(300px)'; // Start off-screen
        panelContainer.style.overflow = 'auto';
        document.body.appendChild(panelContainer);

        // Fetch and inject the HTML from sidepanel.html (remains unchanged)
        fetch(chrome.runtime.getURL('sidepanel.html'))
            .then(response => response.text())
            .then(html => {
                panelContainer.innerHTML = html;

                // Set up a message bridge before adding the script
                setupMessageBridge(panelContainer);

                // Now add the script manually
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('sidepanel.js');
                document.head.appendChild(script);

                // Show panel with animation
                setTimeout(() => {
                    panelContainer.style.transform = 'translateX(0)';
                }, 100);

                // Setup communication with the main content script
                script.onload = function() {
                    // Define global functions that sidepanel.js can call (remains unchanged)
                    window.updateApiKeyStatus = function(status) {
                        const statusElement = panelContainer.querySelector('#api-key-status .status-dot');
                        if (statusElement) {
                            statusElement.classList.toggle('active', status === 'API Key: Valid');
                            statusElement.title = status;
                        }
                    };

                    window.updateVideoInfo = function(info) { // New function to update video info
                        const titleElement = panelContainer.querySelector('#video-title');
                        const channelElement = panelContainer.querySelector('#channel-name');
                        if (titleElement) titleElement.textContent = info.title;
                        if (channelElement) channelElement.textContent = info.channel;
                    };

                    window.updateTranscriptText = function(text) {
                        const transcriptElement = panelContainer.querySelector('#transcript-content-textarea'); // Updated selector to textarea
                        if (transcriptElement) transcriptElement.value = text; // Use .value for textarea
                    };

                    // Update panel with info
                    setTimeout(() => {
                        updateSidePanelInfo(panelContainer);
                    }, 500);
                };
            })
            .catch(error => {
                console.error('Error loading side panel HTML:', error);
                panelContainer.remove();
            });

        isPanelOpen = true;
    }

    // Add this new function to set up the message bridge
    function setupMessageBridge(panelContainer) {
        // Create a unique channel name based on timestamp for communication
        const channelName = 'yt-transcript-bridge-' + Date.now();
        
        // Add this channel name to the container as an attribute
        panelContainer.setAttribute('data-bridge-channel', channelName);
        
        // Listen for messages from the panel via a custom event
        window.addEventListener('message', function(event) {
            // Check that the message is from our panel script
            if (event.data && event.data.target === channelName) {
                console.log('Content script received message from sidepanel:', event.data);
                
                // Forward the message to the extension background
                chrome.runtime.sendMessage(event.data.message, function(response) {
                    // Send the response back to the panel script
                    window.postMessage({
                        source: channelName,
                        response: response,
                        requestId: event.data.requestId
                    }, '*');
                });
            }
        });
    }

    // Update side panel with information about the current video (remains unchanged)
    function updateSidePanelInfo(panel) {
        if (!panel) return;

        try {
            // Use the window functions we defined (remains unchanged)
            if (apiKey) {
                window.updateApiKeyStatus?.('API Key: Valid');
            }

            const videoTitleElement = document.querySelector('h1.title.yt-formatted-string') || document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string');
            const channelNameElement = document.querySelector('#owner-name a') || document.querySelector('.ytd-channel-name a');


            const videoTitle = videoTitleElement?.textContent || 'Unknown Title';
            const channelName = channelNameElement?.textContent || 'Unknown Channel';
            window.updateVideoInfo?.({ title: videoTitle, channel: channelName }); // Update video info in sidepanel


            if (transcriptData && transcriptData.length > 0) {
                let fullText = transcriptData.map(segment => segment.text).join(' ');
                window.updateTranscriptText?.(fullText);
            } else {
                getTranscript(currentVideoId).then(transcript => {
                    if (transcript && transcript.length > 0) {
                        let fullText = transcript.map(segment => segment.text).join(' ');
                        window.updateTranscriptText?.(fullText);
                    } else {
                        window.updateTranscriptText?.("Couldn't get the transcript, sorry"); // Update panel to show sorry message
                    }
                });
            }
        } catch (error) {
            console.error('Error updating side panel info:', error);
        }
    }


    // Toggle the transcript panel (remains unchanged)
    function toggleTranscriptPanel(visible) {
        const panel = document.getElementById('extension-sidepanel-container');

        if (visible && !panel) {
            injectSidePanel();
        } else if (!visible && panel) {
            panel.style.transform = 'translateX(300px)';
            setTimeout(() => {
                panel.remove();
            }, 300);
            isPanelOpen = false;
        } else if (panel) {
            if (isPanelOpen) {
                panel.style.transform = 'translateX(300px)';
                setTimeout(() => {
                    panel.remove();
                }, 300);
                isPanelOpen = false;
            } else {
                panel.style.transform = 'translateX(0)';
                isPanelOpen = true;
            }
        }
    }

    // Process AI actions from the side panel
    async function processAIAction(action, prompt, model) {
        if (!apiKey) {
            console.error('No API key available for AI actions');
            return { error: 'API key not set' };
        }
        
        try {
            // Get the transcript text to use as context
            let transcriptText = '';
            if (transcriptData && transcriptData.length > 0) {
                transcriptText = transcriptData.map(segment => segment.text).join(' ');
            }
            
            // Set up default prompt if not provided
            let effectivePrompt = prompt || "Summarize this transcript";
            
            // Include some transcript context in the prompt itself
            const maxContextLength = 10000; // Limit context length to avoid token limits
            const truncatedTranscript = transcriptText.length > maxContextLength ? 
                transcriptText.substring(0, maxContextLength) + "..." : 
                transcriptText;
            
            // Include transcript in the prompt
            const fullPrompt = `${effectivePrompt}\n\nTranscript:\n${truncatedTranscript}`;
            
            // Send request to background script for API call
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'MAKE_API_CALL',
                    endpoint: 'generateContent',
                    payload: {
                        model: model || 'gemini-1.5-flash', // Default model if not specified
                        prompt: fullPrompt
                    }
                }, response => {
                    if (chrome.runtime.lastError) {
                        console.error('Error sending message:', chrome.runtime.lastError);
                        resolve({ error: chrome.runtime.lastError.message });
                        return;
                    }
                    resolve(response);
                });
            });
        } catch (error) {
            console.error('Error processing AI action:', error);
            return { error: error.message };
        }
    }

    // Listen for messages from popup or background script (remains unchanged)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Content script received message:', message.action);
        switch (message.action) {
            case 'NEW_VIDEO_LOADED':
                currentVideoId = message.videoId;
                console.log('New video detected:', currentVideoId);
                setTimeout(() => {
                    getTranscript(currentVideoId);
                }, 2000);
                sendResponse({ success: true });
                break;
            case 'SHOW_SIDEPANEL':
                if (message.validated) {
                    injectSidePanel();
                    sendResponse({ success: true });
                }
                break;
            case 'TOGGLE_TRANSCRIPT_PANEL':
                toggleTranscriptPanel(message.visible);
                sendResponse({ success: true });
                break;
            case 'API_KEY_UPDATED':
                apiKey = message.apiKey;
                console.log('API key updated');
                const panel = document.getElementById('extension-sidepanel-container');
                if (panel) {
                    updateSidePanelInfo(panel);
                }
                sendResponse({ success: true });
                break;
            case 'GET_TRANSCRIPT':
                if (transcriptData) {
                    sendResponse({ success: true, transcript: transcriptData });
                } else {
                    getTranscript(currentVideoId).then(transcript => {
                        sendResponse({ success: !!transcript, transcript });
                    });
                    return true;
                }
            case 'PROCESS_AI_ACTION':
                processAIAction(message.aiAction, message.prompt).then(result => {
                    sendResponse(result);
                });
                return true;
            default:
                console.log('Unknown message action:', message.action);
                sendResponse({ success: false, error: 'Unknown action' });
        }
        return true;
    });

    // Listen for YouTube navigation events (SPA navigation) (remains unchanged)
    function setupNavigationListener() {
        let lastUrl = location.href;
        function checkURLChange() {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                onURLChange();
            }
        }
        const titleObserver = new MutationObserver(checkURLChange);
        if (document.querySelector('title')) {
            titleObserver.observe(document.querySelector('title'), { subtree: true, childList: true });
        }
        setInterval(checkURLChange, 1000);
    }

    // Handle URL changes in YouTube SPA (remains unchanged)
    function onURLChange() {
        console.log('URL changed:', location.href);
        if (location.href.includes('youtube.com/watch')) {
            const params = new URLSearchParams(location.search);
            const videoId = params.get('v');
            if (videoId && videoId !== currentVideoId) {
                currentVideoId = videoId;
                console.log('New video detected via URL change:', videoId);
                transcriptData = null;
                setTimeout(() => {
                    getTranscript(currentVideoId);
                }, 2000);
                const panel = document.getElementById('extension-sidepanel-container');
                if (panel) {
                    setTimeout(() => {
                        updateSidePanelInfo(panel);
                    }, 2500);
                }
            }
        }
    }

    // Initialize the content script
    function initializeContentScript() {
        if (location.href.includes('youtube.com/watch')) {
            const params = new URLSearchParams(location.search);
            currentVideoId = params.get('v');
            console.log('Initialized with video ID:', currentVideoId);
            setTimeout(() => {
                getTranscript(currentVideoId);
            }, 2000);
            // Call side panel injection after a delay to allow DOM load
            setTimeout(() => {
                injectSidePanel();
            }, 2500);
        }
        setupNavigationListener();
        
        // Connect to background script
        const port = chrome.runtime.connect({ name: 'yt-transcript-content' });
        
        // Use chrome.runtime.sendMessage to get tab ID first
        chrome.runtime.sendMessage({action: 'GET_TAB_ID'}, function(response) {
            if (response && response.tabId) {
                // Now send message with correct tab ID
                port.postMessage({ 
                    action: 'CONTENT_SCRIPT_READY', 
                    tabId: response.tabId 
                });
            }
        });

        chrome.storage.sync.get('transcriptPanelVisible', function(data) {
            if (data.transcriptPanelVisible) {
                setTimeout(() => {
                    toggleTranscriptPanel(true);
                }, 3000);
            }
        });
    }

    // Start the content script (remains unchanged)
    initializeContentScript();
})();