// This file is loaded as a web accessible resource to provide the Google AI library to content scripts
// The script tag is added to the page by the content script

// This is just a wrapper to load the CDN script
(function() {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@google/generative-ai@latest/dist/index.min.js';
  script.onload = function() {
    console.log('Google AI library loaded successfully');
    // Notify any listeners that might be waiting
    document.dispatchEvent(new Event('googleai-loaded'));
  };
  script.onerror = function(e) {
    console.error('Error loading Google AI library:', e);
  };
  document.head.appendChild(script);
})();
