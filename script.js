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
            
            // Ensure phone and email links work properly on mobile
            if (linkType === 'phone' || linkType === 'email') {
                // Let the default behavior handle it
                console.log(`Allowing default behavior for ${linkType} link`);
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