/**
 * CONTENT SCRIPT
 * 
 * This script is INJECTED into every webpage you visit.
 * It runs in the PAGE's context, so it can access document.body, etc.
 * 
 * Key responsibilities:
 * 1. Extract page content (title, main text, keywords)
 * 2. Track user engagement (scrolling, time on page)
 * 3. Send this data to background script when requested
 */

import type { TabContent } from '../types/messages';

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

/**
 * Extract meaningful content from the current page
 * We try to get the "main" content, not navigation/ads/footers
 */
function extractPageContent(): TabContent {
    // Get meta description (often a good summary)
    const metaDescription = document.querySelector('meta[name="description"]')
        ?.getAttribute('content') || '';

    // Get meta keywords if available
    const metaKeywords = document.querySelector('meta[name="keywords"]')
        ?.getAttribute('content') || '';
    const keywords = metaKeywords.split(',').map(k => k.trim()).filter(Boolean);

    // Try to find the main content area
    // Most sites use <main>, <article>, or common class names
    const mainContent =
        (document.querySelector('main') as HTMLElement | null)?.innerText ||
        (document.querySelector('article') as HTMLElement | null)?.innerText ||
        (document.querySelector('[role="main"]') as HTMLElement | null)?.innerText ||
        (document.querySelector('.content') as HTMLElement | null)?.innerText ||
        (document.querySelector('#content') as HTMLElement | null)?.innerText ||
        document.body?.innerText ||
        '';
    // Clean up the text: remove extra whitespace, limit length
    const cleanedText = mainContent
        .replace(/\s+/g, ' ')           // Collapse whitespace
        .replace(/\n+/g, '\n')          // Collapse newlines
        .trim()
        .slice(0, 5000);                // Limit to 5000 chars for embedding

    // Combine description + main content for richer context
    const fullText = metaDescription
        ? `${metaDescription}\n\n${cleanedText}`
        : cleanedText;

    return {
        tabId: 0,  // Will be set by background script
        url: window.location.href,
        title: document.title,
        text: fullText.slice(0, 5000),  // Ensure max length
        keywords,
    };
}

// ============================================================================
// ENGAGEMENT TRACKING (Optional but useful for importance scoring)
// ============================================================================

let scrollDepth = 0;
let timeOnPage = Date.now();

// Track how far user has scrolled
window.addEventListener('scroll', () => {
    const scrollPercent = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100;
    scrollDepth = Math.max(scrollDepth, Math.round(scrollPercent));
});

// ============================================================================
// MESSAGE HANDLING - Respond to background script requests
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTRACT_CONTENT') {
        const content = extractPageContent();

        // Add engagement data
        const response = {
            ...content,
            engagement: {
                scrollDepth,
                timeOnPage: Date.now() - timeOnPage,
            },
        };

        sendResponse(response);
    }

    return true; // Keep channel open for async response
});

// Log that content script loaded (helpful for debugging)
console.log('[Chronicle] Content script loaded on:', window.location.href);