document.addEventListener('DOMContentLoaded', () => {
    // 1. Interactive Mouse-Move Parallax Orbs
    const card = document.querySelector('.card');
    const orbs = document.querySelectorAll('.orb');

    if (card) {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            orbs.forEach((orb, index) => {
                const factor = (index + 1) * 20; // creates layered parallax depth
                const moveX = x / factor;
                const moveY = y / factor;
                orb.style.transform = `translate(${moveX}px, ${moveY}px)`;
            });
        });

        card.addEventListener('mouseleave', () => {
            orbs.forEach((orb) => {
                orb.style.transform = '';
                orb.style.transition = 'transform 0.5s ease-out';
            });
        });

        card.addEventListener('mouseenter', () => {
            orbs.forEach((orb) => {
                orb.style.transition = 'none';
            });
        });
    }

    // 2. Chat Widget Frontend Logic
    const chatFab = document.getElementById('chat-fab');
    const chatPopup = document.getElementById('chat-popup');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const suggestionChips = document.querySelectorAll('.suggestion-chip');

    // Local host detection for Express API
    const API_URL = 'http://localhost:5000/api/chat';

    // Toggle Chat Window
    if (chatFab && chatPopup) {
        chatFab.addEventListener('click', () => {
            const isHidden = chatPopup.getAttribute('aria-hidden') === 'true';
            chatPopup.setAttribute('aria-hidden', !isHidden);
            chatPopup.classList.toggle('active');
            if (chatPopup.classList.contains('active')) {
                chatInput.focus();
            }
        });
    }

    if (chatCloseBtn && chatPopup) {
        chatCloseBtn.addEventListener('click', () => {
            chatPopup.setAttribute('aria-hidden', 'true');
            chatPopup.classList.remove('active');
        });
    }

    // Handle Send Action
    const sendMessage = async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        // Clear input
        chatInput.value = '';

        // Add user message bubble
        appendMessage(text, 'user');

        // Add typing indicator bubble
        const typingId = showTypingIndicator();

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            removeTypingIndicator(typingId);

            if (!response.ok) {
                throw new Error('Network error');
            }

            const data = await response.json();
            appendMessage(data.response, 'bot');
        } catch (err) {
            console.warn("Could not connect to live backend API. Falling back to local mock responses...", err);
            removeTypingIndicator(typingId);
            
            // Client-side mock fallback so the application works seamlessly in development
            const fallbackReply = generateMockResponse(text);
            appendMessage(fallbackReply, 'bot');
        }
    };

    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendMessage);
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    // Handle Suggestion Chips
    suggestionChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const question = chip.getAttribute('data-question');
            chatInput.value = question;
            sendMessage();
        });
    });

    // Helper: Append Message Bubble to Area
    function appendMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        
        if (sender === 'bot') {
            messageDiv.innerHTML = parseMarkdown(text);
        } else {
            messageDiv.textContent = text;
        }

        chatMessages.appendChild(messageDiv);
        scrollToBottom();
    }

    // Helper: Show Typing Indicator
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.classList.add('message', 'bot');
        typingDiv.id = 'typing-' + Date.now();
        typingDiv.innerHTML = `
            <div class="typing-bubble">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        chatMessages.appendChild(typingDiv);
        scrollToBottom();
        return typingDiv.id;
    }

    // Helper: Remove Typing Indicator
    function removeTypingIndicator(id) {
        const indicator = document.getElementById(id);
        if (indicator) {
            indicator.remove();
        }
    }

    // Helper: Scroll Message Container to Bottom
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Helper: Mini Markdown Parser for bot output
    function parseMarkdown(text) {
        let parsed = text;
        // Bold tags
        parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Bullet points
        parsed = parsed.replace(/^\s*[-*]\s+(.*?)$/gm, '• $1');
        // Pre-formatted code blocks
        parsed = parsed.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        // Inline code blocks
        parsed = parsed.replace(/`(.*?)`/g, '<code>$1</code>');
        // Newlines to breaks
        parsed = parsed.replace(/\n/g, '<br>');
        return parsed;
    }

    // Local/Mock Response Generator
    function generateMockResponse(query) {
        const lower = query.toLowerCase();
        
        if (lower.includes('skill') || lower.includes('stack') || lower.includes('tech') || lower.includes('language')) {
            return `Shivang's core technical stack includes:
**Languages**: Swift 5.10/6, SwiftUI, UIKit, Objective-C.
**Concurrency**: Async/Await, Actors, GCD, Operations.
**Architectures**: VIPER, MVVM-C, Clean Swift.
**Integrations**: Combine, RxSwift, Realm, Core Data, Kotlin Multiplatform (KMP), GraphQL.
**Tools**: Fastlane, GitHub Actions, Xcode Cloud.`;
        }
        
        if (lower.includes('experience') || lower.includes('work') || lower.includes('job') || lower.includes('history') || lower.includes('ascendion') || lower.includes('dmi')) {
            return `Shivang Pandey has 9+ years of professional mobile engineering experience:
- **Senior iOS Developer at Ascendion** (Aug 2024 - Present): Leading features for the loanDepot mobile app.
- **Senior iOS Engineer at DMI** (Mar 2020 - Aug 2024): Developed the LHR London Heathrow Airport app, upGrad, and DSM-5-TR.
- **iOS Developer at Quaeretech** (May 2019 - Feb 2020): Worked on UDYAMI and cashback utility platforms.
- **Earlier Roles**: Built Ethereum wallets and blockchain integrations at DevGenesis, and location beacon trackers at Student Edventures.`;
        }

        if (lower.includes('project') || lower.includes('app') || lower.includes('build') || lower.includes('loandepot') || lower.includes('airport')) {
            return `Key apps Shivang has architected or contributed to:
- **loanDepot Mobile App**: FinTech application supporting secure payment services.
- **LHR Heathrow Airport**: Travel app featuring push notifications and Live Activities.
- **upGrad**: Large-scale EdTech application built using VIPER.
- **DSM-5-TR**: Redesigned healthcare diagnostic reference app.
- **ERC20 Wallet**: Crypto transaction and wallet platform.`;
        }

        if (lower.includes('contact') || lower.includes('email') || lower.includes('phone') || lower.includes('touch') || lower.includes('reach')) {
            return `You can get in touch with Shivang Pandey through:
- **Email**: shivang.pandey.dev@gmail.com
- **LinkedIn**: [linkedin.com/in/shivang-pandey-dev](https://www.linkedin.com/in/shivang-pandey-dev)
- **Phone**: +91-9717779622
- **GitHub**: [github.com/pandeyshivang](https://github.com/pandeyshivang)`;
        }

        if (lower.includes('resume') || lower.includes('cv') || lower.includes('pdf')) {
            return `You can view and download Shivang Pandey's official resume directly at: [https://docs.google.com/document/d/1uXre0GSEdaMbVTZMQM-3qb9vHKEf6NxZ/](https://docs.google.com/document/d/1uXre0GSEdaMbVTZMQM-3qb9vHKEf6NxZ/).`;
        }

        return `I am currently running in demo mode since the backend RAG database and servers are not connected. I can share details on Shivang's **experience**, **skills**, **projects**, **contact** info, or provide his **resume** link!`;
    }
});
