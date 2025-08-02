// Interactive Features and Analytics
document.addEventListener('DOMContentLoaded', function() {
    
    // Canvas logo rendering for better quality
    const canvas = document.getElementById('logoCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
        // Set canvas size to match image dimensions
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw image with high quality settings
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    
    img.src = 'images/LOGOOO.png';
    
    // Click tracking for analytics
    const links = document.querySelectorAll('.link-card');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const linkType = this.classList[1]; // phone, email, website, etc.
            const href = this.getAttribute('href');
            console.log(`Link clicked: ${linkType} - ${href}`);
            
            // Optional: Send analytics data
            if (typeof gtag !== 'undefined') {
                gtag('event', 'click', {
                    'event_category': 'link',
                    'event_label': linkType
                });
            }
        });
    });
    
    // Smooth scroll for anchor links
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
    
    // Parallax effect for background
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const parallax = document.querySelector('body::before');
        if (parallax) {
            const speed = scrolled * 0.5;
            parallax.style.transform = `translateY(${speed}px)`;
        }
    });
    
    // Touch feedback for mobile
    links.forEach(link => {
        link.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.95)';
        });
        
        link.addEventListener('touchend', function() {
            this.style.transform = '';
        });
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            document.body.classList.add('keyboard-navigation');
        }
    });
    
    document.addEventListener('mousedown', function() {
        document.body.classList.remove('keyboard-navigation');
    });
    
    // Page load analytics
    console.log('WEE WORLD Landing Page loaded');
    
    // Optional: Track page views
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
            'page_title': 'WEE WORLD Landing Page',
            'page_location': window.location.href
        });
    }
    
    // Viewport tracking
    let viewportHeight = window.innerHeight;
    let viewportWidth = window.innerWidth;
    
    window.addEventListener('resize', function() {
        viewportHeight = window.innerHeight;
        viewportWidth = window.innerWidth;
        console.log(`Viewport: ${viewportWidth}x${viewportHeight}`);
    });
    
    // Optional: Copy functionality for contact info
    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            console.log('Copied to clipboard:', text);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };
    
    // Optional: Service Worker for offline support
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
    
    // Theme preference detection
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    if (prefersDark.matches) {
        document.body.classList.add('dark-mode');
    }
    
    // Performance monitoring
    window.addEventListener('load', function() {
        setTimeout(function() {
            const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
            console.log('Page load time:', loadTime + 'ms');
        }, 0);
    });
    
    // Error tracking
    window.addEventListener('error', function(e) {
        console.error('Page error:', e.error);
    });
    
    // Optional: Add loading animation
    const container = document.querySelector('.container');
    if (container) {
        container.style.opacity = '0';
        container.style.transform = 'translateY(20px)';
        
        setTimeout(function() {
            container.style.transition = 'all 0.6s ease-out';
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
        }, 100);
    }
});

// Optional: Add intersection observer for animations
if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    });
    
    document.querySelectorAll('.link-card').forEach(card => {
        observer.observe(card);
    });
}