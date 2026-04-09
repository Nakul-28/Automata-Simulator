// Theme Switcher
// Manages light/dark theme toggling with localStorage persistence

const THEME_STORAGE_KEY = 'automata-theme';
const LIGHT_EMOJI = '◐';
const DARK_EMOJI = '◑';

// Initialize theme on page load
function initTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Determine which theme to use
    let theme = savedTheme || (prefersDark ? 'dark' : 'light');
    
    // Apply the theme immediately
    applyTheme(theme);
}

// Apply theme to document
function applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === 'dark') {
        html.setAttribute('data-theme', 'dark');
    } else {
        html.removeAttribute('data-theme');
    }
    
    // Update button appearance
    updateToggleButton(theme);
    
    // Save preference
    localStorage.setItem(THEME_STORAGE_KEY, theme);
}

// Update toggle button appearance
function updateToggleButton(theme) {
    const button = document.getElementById('theme-toggle');
    if (button) {
        button.textContent = theme === 'dark' ? DARK_EMOJI : LIGHT_EMOJI;
        button.title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
    }
}

// Toggle theme
function toggleTheme() {
    const html = document.documentElement;
    const isDarkMode = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDarkMode ? 'light' : 'dark';
    
    applyTheme(newTheme);
}

// Initialize immediately (before other scripts run)
initTheme();

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('theme-toggle');
    
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleTheme);
    }
});
