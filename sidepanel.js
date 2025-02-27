document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('yt-ai-toolkit-panel');
  document.getElementById('panel-close')?.addEventListener('click', () => {
    panel.parentElement.style.transform = 'translateX(300px)';
    setTimeout(() => panel.parentElement.remove(), 300);
  });
  document.getElementById('panel-minimize')?.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
});
