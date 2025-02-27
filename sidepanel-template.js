// Template for the sidepanel UI that will be injected into YouTube

const createSidePanelTemplate = () => {
  return `
    <div id="yt-ai-toolkit-panel" class="yt-ai-toolkit-sidepanel">
      <div class="panel-header">
        <h3>YouTube Transcript & AI Toolkit</h3>
        <div class="panel-controls">
          <button id="panel-minimize" class="panel-btn" title="Minimize">−</button>
          <button id="panel-close" class="panel-btn" title="Close">×</button>
        </div>
      </div>

      <div class="panel-content">
        <div class="panel-section" id="transcriptSection">
          <h4>Transcript</h4>
          <div id="transcript-container" class="transcript-container">
            <div id="loading-transcript" class="loading-indicator">
              Loading transcript...
              <div class="spinner"></div>
            </div>
            <div id="transcript-content" class="transcript-content"></div>
          </div>
          <div class="section-actions">
            <button id="copy-transcript" class="action-btn">Copy</button>
            <button id="translate-transcript" class="action-btn">Translate</button>
            <button id="summarize-transcript" class="action-btn">Summarize</button>
          </div>
        </div>

        <div class="panel-section" id="aiActionsSection">
          <h4>AI Actions</h4>
          <div class="action-grid">
            <div class="action-item" data-action="summarize">
              <div class="action-icon">📝</div>
              <div class="action-label">Summarize</div>
            </div>
            <div class="action-item" data-action="explain">
              <div class="action-icon">🔍</div>
              <div class="action-label">Explain</div>
            </div>
            <div class="action-item" data-action="quiz">
              <div class="action-icon">❓</div>
              <div class="action-label">Generate Quiz</div>
            </div>
            <div class="action-item" data-action="notes">
              <div class="action-icon">📒</div>
              <div class="action-label">Create Notes</div>
            </div>
          </div>
        </div>

        <div class="panel-section" id="resultSection">
          <h4>AI Results</h4>
          <div id="ai-result-container" class="ai-result-container">
            <div id="ai-result-placeholder" class="placeholder-text">
              Select an action above to generate results
            </div>
            <div id="ai-result-content" class="ai-result-content"></div>
            <div id="ai-loading" class="loading-indicator" style="display: none;">
              Processing with AI...
              <div class="spinner"></div>
            </div>
          </div>
          <div class="section-actions">
            <button id="copy-ai-result" class="action-btn">Copy</button>
            <button id="regenerate-ai-result" class="action-btn">Regenerate</button>
          </div>
        </div>
      </div>

      <div class="panel-footer">
        <div class="status-indicator" id="api-key-status">
          <span class="status-dot active"></span>API Key Valid
        </div>
        <button id="panel-settings" class="panel-btn" title="Settings">⚙️</button>
      </div>
    </div>
  `;
};

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createSidePanelTemplate };
} else {
  // Export to window object for in-browser use
  window.createSidePanelTemplate = createSidePanelTemplate;
}
