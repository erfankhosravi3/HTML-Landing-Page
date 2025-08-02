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
    
    // Click tracking for analytics with mobile link handling
    const links = document.querySelectorAll('.link-card');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const linkType = this.classList[1]; // phone, email, website, etc.
            const href = this.getAttribute('href');
            console.log(`Link clicked: ${linkType} - ${href}`);
            
            // Don't prevent default behavior - let all links work naturally
            // This ensures phone, email, and external links work properly
            
            // Optional: Send analytics data (non-blocking)
            setTimeout(() => {
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'click', {
                        'event_category': 'link',
                        'event_label': linkType
                    });
                }
            }, 0);
        });
    });
    
    // Improved touch feedback for mobile with better performance
    links.forEach(link => {
        link.addEventListener('touchstart', function(e) {
            this.style.transition = 'transform 0.1s ease';
            this.style.transform = 'scale(0.98)';
        }, { passive: true });
        
        link.addEventListener('touchend', function(e) {
            this.style.transform = 'scale(1)';
            setTimeout(() => {
                this.style.transition = '';
            }, 100);
        }, { passive: true });
        
        link.addEventListener('touchcancel', function(e) {
            this.style.transform = 'scale(1)';
            this.style.transition = '';
        }, { passive: true });
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
