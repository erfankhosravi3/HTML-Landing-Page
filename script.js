// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    
    // Add click tracking for analytics
    const linkCards = document.querySelectorAll('.link-card');
    
    linkCards.forEach(card => {
        card.addEventListener('click', function(e) {
            // Track link clicks (you can integrate with Google Analytics here)
            const linkType = this.classList[1]; // phone, email, website, etc.
            const linkText = this.querySelector('span').textContent;
            
            console.log(`Link clicked: ${linkText} (${linkType})`);
            
            // Add loading state
            this.classList.add('loading');
            
            // Remove loading state after a short delay
            setTimeout(() => {
                this.classList.remove('loading');
            }, 1000);
        });
    });
    
    // Add smooth scroll behavior for any anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add parallax effect to background (subtle)
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const parallax = document.querySelector('body');
        const speed = scrolled * 0.5;
        
        if (parallax) {
            parallax.style.transform = `translateY(${speed}px)`;
        }
    });
    
    // Add touch feedback for mobile devices
    linkCards.forEach(card => {
        card.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.98)';
        });
        
        card.addEventListener('touchend', function() {
            this.style.transform = '';
        });
    });
    
    // Add keyboard navigation support
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            // Ensure focus is visible
            document.body.classList.add('keyboard-navigation');
        }
    });
    
    // Remove keyboard navigation class when mouse is used
    document.addEventListener('mousedown', function() {
        document.body.classList.remove('keyboard-navigation');
    });
    
    // Add page load analytics
    console.log('Business card page loaded');
    
    // Optional: Add viewport tracking
    let hasBeenViewed = false;
    
    function checkIfViewed() {
        if (!hasBeenViewed && window.innerHeight > 0) {
            hasBeenViewed = true;
            console.log('Business card viewed');
        }
    }
    
    // Check on load and scroll
    window.addEventListener('load', checkIfViewed);
    window.addEventListener('scroll', checkIfViewed);
    
    // Add copy functionality for contact info (optional)
    const profileSection = document.querySelector('.profile-section');
    if (profileSection) {
        profileSection.addEventListener('click', function() {
            // You could add a "copy contact info" feature here
            console.log('Profile section clicked');
        });
    }
    
    // Add service worker registration for offline support (optional)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js')
                .then(function(registration) {
                    console.log('SW registered: ', registration);
                })
                .catch(function(registrationError) {
                    console.log('SW registration failed: ', registrationError);
                });
        });
    }
    
    // Add theme preference detection
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    
    function handleThemeChange(e) {
        if (e.matches) {
            // Dark mode is preferred
            document.body.classList.add('dark-mode');
        } else {
            // Light mode is preferred
            document.body.classList.remove('dark-mode');
        }
    }
    
    prefersDark.addListener(handleThemeChange);
    handleThemeChange(prefersDark);
    
    // Add performance monitoring
    window.addEventListener('load', function() {
        if ('performance' in window) {
            const perfData = performance.getEntriesByType('navigation')[0];
            console.log('Page load time:', perfData.loadEventEnd - perfData.loadEventStart, 'ms');
        }
    });
});

// Add CSS for keyboard navigation
const style = document.createElement('style');
style.textContent = `
    .keyboard-navigation .link-card:focus {
        outline: 2px solid #667eea;
        outline-offset: 2px;
    }
    
    .dark-mode {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    }
    
    .dark-mode .container {
        background: rgba(30, 30, 30, 0.95);
        color: #fff;
    }
    
    .dark-mode .name {
        color: #fff;
    }
    
    .dark-mode .link-card {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
        color: #fff;
    }
`;
document.head.appendChild(style);