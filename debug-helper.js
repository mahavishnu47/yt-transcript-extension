/**
 * Debug Helper Tool for YouTube Transcript AI Toolkit
 * 
 * This script helps monitor extension operations and message passing
 * to identify issues in the communication between components.
 */

// Create a logger for the extension
const ytTranscriptLogger = {
  // Log levels
  levels: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  },
  
  // Current log level
  currentLevel: 0, // DEBUG
  
  // Enable storage of logs for retrieval
  logHistory: [],
  maxLogHistory: 100,
  
  // Add timestamp to logs
  timestamp() {
    return new Date().toISOString();
  },
  
  // Main log function
  log(level, component, message, data) {
    if (level >= this.currentLevel) {
      const levelName = Object.keys(this.levels).find(k => this.levels[k] === level);
      const logMessage = `${this.timestamp()} [${levelName}] [${component}] ${message}`;
      
      // Store in history
      this.logHistory.push({
        timestamp: this.timestamp(),
        level: levelName,
        component,
        message,
        data
      });
      
      // Trim history if needed
      if (this.logHistory.length > this.maxLogHistory) {
        this.logHistory.shift();
      }
      
      // Console output with appropriate styling
      switch (level) {
        case this.levels.DEBUG:
          console.debug(logMessage, data || '');
          break;
        case this.levels.INFO:
          console.info(logMessage, data || '');
          break;
        case this.levels.WARN:
          console.warn(logMessage, data || '');
          break;
        case this.levels.ERROR:
          console.error(logMessage, data || '');
          break;
      }
    }
  },
  
  // Helper methods for different log levels
  debug(component, message, data) {
    this.log(this.levels.DEBUG, component, message, data);
  },
  
  info(component, message, data) {
    this.log(this.levels.INFO, component, message, data);
  },
  
  warn(component, message, data) {
    this.log(this.levels.WARN, component, message, data);
  },
  
  error(component, message, data) {
    this.log(this.levels.ERROR, component, message, data);
  },
  
  // Communication monitoring
  monitorMessages() {
    // For content scripts
    const originalSendMessage = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = function(message, responseCallback) {
      ytTranscriptLogger.debug('MESSAGE_OUT', 'Sending message', message);
      return originalSendMessage.apply(chrome.runtime, [message, function(response) {
        ytTranscriptLogger.debug('MESSAGE_IN', 'Received response', response);
        if (responseCallback) responseCallback(response);
      }]);
    };
  },
  
  // Get logs for debugging
  getLogs() {
    return this.logHistory;
  }
};

// Start monitoring if in a content script context
if (typeof chrome !== 'undefined' && chrome.runtime) {
  ytTranscriptLogger.info('DEBUG_HELPER', 'Debug helper initialized');
  ytTranscriptLogger.monitorMessages();
}

// Make available globally
window.ytTranscriptLogger = ytTranscriptLogger;
