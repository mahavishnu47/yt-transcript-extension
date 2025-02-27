// Instead of trying to import from npm, we'll create a wrapper for the Google Generative AI library
// that will be loaded from a CDN

// This file will expose the library loaded from the script tag in the manifest's web_accessible_resources
let GoogleGenerativeAI;

// Initialize with the CDN-loaded version
function initGoogleAI() {
  // Check if it's already been loaded by a script tag
  if (window.GoogleGenerativeAI) {
    GoogleGenerativeAI = window.GoogleGenerativeAI;
    return true;
  }
  return false;
}

// Try to initialize (may be called later if script loads asynchronously)
initGoogleAI();

export { GoogleGenerativeAI };
