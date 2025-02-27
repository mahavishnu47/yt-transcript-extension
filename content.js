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
      try {
        console.log(`Getting transcript for video ${videoId} using UI method`);
        // Look for the transcript button in the YouTube UI
        let transcriptButton = document.querySelector('button.yt-spec-button-shape-next[aria-label="Show transcript"]');

        if (!transcriptButton) {
          // Try alternative selector if the first one fails
          transcriptButton = document.querySelector('.ytd-transcript-button-renderer');
        }

        if (transcriptButton) {
          console.log('Transcript button found, clicking it');
          transcriptButton.click();

          // Wait for transcript to load
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Target the transcript container
          const transcriptEntries = Array.from(document.querySelectorAll('ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer'));

          if (transcriptEntries.length > 0) {
            console.log(`Found ${transcriptEntries.length} transcript segments via UI`);

            const transcriptSegments = transcriptEntries.map(entry => {
              // Get timestamp and text elements
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

            // Close the transcript panel in YouTube UI to avoid cluttering
            const closeButton = document.querySelector('.ytd-transcript-renderer .close-button');
            if (closeButton) closeButton.click();

            // Store and return the transcript data
            if (transcriptSegments.length > 0) {
              transcriptData = transcriptSegments;
              return transcriptSegments;
            }
          }

          console.log("No transcript segments found in UI after clicking button");

          // Always close the transcript panel if it was opened
          const closeButton = document.querySelector('.ytd-transcript-renderer .close-button');
          if (closeButton) closeButton.click();
        } else {
          console.warn("Transcript button not found in YouTube UI");
        }

        // If we get here, we couldn't find a transcript using UI
        console.warn("Couldn't get the transcript, sorry (UI method failed).");
        return []; // Return empty array to indicate failure

      } catch (error) {
        console.error("Error fetching UI transcript:", error);
        console.warn("Couldn't get the transcript, sorry (Error during UI scraping).");
        return []; // Return empty array in case of error
      }
    }

    // Function to inject the side panel into the YouTube page (remains unchanged)
    function injectSidePanel() {
        console.log("injectSidePanel() function CALLED"); // Add this line
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

      // Fetch and inject the HTML from sidepanel.html
      fetch(chrome.runtime.getURL('sidepanel.html'))
        .then(response => response.text())
        .then(html => {
          panelContainer.innerHTML = html;

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
            // Define global functions that sidepanel.js can call
            window.updateApiKeyStatus = function(status) {
              const statusElement = panelContainer.querySelector('#apiKeyStatus');
              if (statusElement) statusElement.textContent = status;
            };

            window.updateVideoInfo = function(info) {
              const infoElement = panelContainer.querySelector('#videoInfo');
              if (infoElement) infoElement.textContent = info;
            };

            window.updateTranscriptText = function(text) {
              const transcriptElement = panelContainer.querySelector('#transcriptText');
              if (transcriptElement) transcriptElement.textContent = text;
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

    // Update side panel with information about the current video (remains unchanged)
    function updateSidePanelInfo(panel) {
      if (!panel) return;

      try {
        // Use the window functions we defined
        if (apiKey) {
          window.updateApiKeyStatus?.('API Key: Valid');
        }

        const videoTitle = document.querySelector('h1.title yt-formatted-string')?.textContent ||
          document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent;

        const channelName = document.querySelector('#owner-name a')?.textContent ||
          document.querySelector('.ytd-channel-name a')?.textContent;

        const videoInfo = `${videoTitle || 'Unknown Title'} | ${channelName || 'Unknown Channel'}`;
        window.updateVideoInfo?.(videoInfo);

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

    // Process AI actions from the side panel (remains unchanged)
    async function processAIAction(action, prompt) {
      if (!apiKey) {
        console.error('No API key available for AI actions');
        return { error: 'API key not set' };
      }
      try {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'MAKE_API_CALL',
            endpoint: 'generateContent',
            payload: {
              prompt: prompt,
              context: transcriptData ? transcriptData.map(segment => segment.text).join(' ') : ''
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
              if (transcript && transcript.length > 0) {
                  sendResponse({ success: !!transcript, transcript });
              } else {
                  sendResponse({ success: false, transcript: [], error: "Couldn't get the transcript, sorry" }); // Send failure response
              }
            });
            return true; // Keep sendResponse async
          }
          break;
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

    // Initialize the content script (remains unchanged)
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
      const port = chrome.runtime.connect({ name: 'yt-transcript-content' });
      port.postMessage({ action: 'CONTENT_SCRIPT_READY', tabId: chrome.runtime.id });
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