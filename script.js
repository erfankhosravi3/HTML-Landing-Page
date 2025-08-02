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
    
    // Click tracking for analytics with Google Scripts handling
    const links = document.querySelectorAll('.link-card');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const linkType = this.classList[1]; // phone, email, website, etc.
            const href = this.getAttribute('href');
            console.log(`Link clicked: ${linkType} - ${href}`);
            
            // Handle Google Scripts links with device detection override
            if (href && href.includes('script.google.com')) {
                e.preventDefault();
                
                // Show loading state
                const originalText = this.querySelector('span').textContent;
                this.querySelector('span').textContent = 'Opening...';
                this.style.opacity = '0.7';
                
                // Store original user agent and viewport
                const originalUserAgent = navigator.userAgent;
                const originalViewport = document.querySelector('meta[name="viewport"]');
                
                // Override user agent to desktop
                const desktopUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                
                // Temporarily override user agent
                Object.defineProperty(navigator, 'userAgent', {
                    value: desktopUserAgent,
                    writable: false,
                    configurable: true
                });
                
                // Create a new window with desktop user agent
                const newWindow = window.open(href, '_blank', 'noopener,noreferrer,width=1200,height=800,scrollbars=yes,resizable=yes');
                
                // If popup was blocked, try direct navigation with desktop user agent
                if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
                    console.log('Popup blocked, using direct navigation with desktop user agent');
                    
                    // Create a temporary iframe to trigger the request with desktop user agent
                    const tempIframe = document.createElement('iframe');
                    tempIframe.style.display = 'none';
                    tempIframe.src = href;
                    document.body.appendChild(tempIframe);
                    
                    // Remove iframe after a short delay
                    setTimeout(() => {
                        document.body.removeChild(tempIframe);
                    }, 1000);
                }
                
                // Restore original user agent after a delay
                setTimeout(() => {
                    Object.defineProperty(navigator, 'userAgent', {
                        value: originalUserAgent,
                        writable: false,
                        configurable: true
                    });
                    
                    // Restore original state
                    this.querySelector('span').textContent = originalText;
                    this.style.opacity = '1';
                }, 3000);
            }
            
            // Optional: Send analytics data
            if (typeof gtag !== 'undefined') {
                gtag('event', 'click', {
                    'event_category': 'link',
                    'event_label': linkType
                });
            }
        });
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
    
    // Page load analytics
    console.log('WEE WORLD Landing Page loaded');
    
    // Optional: Track page views
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
            'page_title': 'WEE WORLD Landing Page',
            'page_location': window.location.href
        });
    }
    
    // Add loading animation
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