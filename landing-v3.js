// Landing Page Version 3 - Ultra Simple (No cross-origin access)
document.addEventListener('DOMContentLoaded', function() {
    console.log('WEE WORLD - Ultra Simple Version Active - Cache v999999');
    
    // Detect if running in iframe (Google Scripts)
    const isInIframe = window !== window.top;
    if (isInIframe) {
        console.log('WEE WORLD - Running in Google Scripts iframe - applying iframe-safe mode');
        
        // Apply iframe-safe styling for proper display
        document.documentElement.style.width = '100%';
        document.documentElement.style.height = 'auto';
        document.documentElement.style.minHeight = '100vh';
        document.body.style.width = '100%';
        document.body.style.height = 'auto';
        document.body.style.minHeight = '100vh';
        document.body.style.maxWidth = '100%';
        document.body.style.overflowX = 'hidden';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.body.style.fontSize = '16px';
        
        // Force container to be full width and proper height
        const container = document.querySelector('.container');
        if (container) {
            container.style.width = '100%';
            container.style.maxWidth = '100%';
            container.style.margin = '0 auto';
            container.style.padding = '20px';
            container.style.minHeight = '100vh';
        }
        
        // Fix logo size
        const profileImage = document.querySelector('.profile-image');
        if (profileImage) {
            profileImage.style.height = 'auto';
            profileImage.style.minHeight = '120px';
            profileImage.style.maxHeight = '200px';
        }
        
        const canvas = document.querySelector('#logoCanvas');
        if (canvas) {
            canvas.style.maxWidth = '100%';
            canvas.style.height = 'auto';
            canvas.style.maxHeight = '150px';
        }
        
        // Fix link card sizes
        const linkCards = document.querySelectorAll('.link-card');
        linkCards.forEach(card => {
            card.style.padding = '16px 20px';
            card.style.fontSize = '16px';
            card.style.marginBottom = '12px';
        });
        
        const linkIcons = document.querySelectorAll('.link-card i');
        linkIcons.forEach(icon => {
            icon.style.fontSize = '20px';
            icon.style.marginRight = '15px';
        });
        
        const linkSpans = document.querySelectorAll('.link-card span');
        linkSpans.forEach(span => {
            span.style.fontSize = '16px';
        });
        
        // Fix text sizes
        const company = document.querySelector('.company');
        if (company) {
            company.style.fontSize = '20px';
            company.style.margin = '20px 0 15px 0';
        }
        
        const bio = document.querySelector('.bio');
        if (bio) {
            bio.style.fontSize = '16px';
            bio.style.marginBottom = '25px';
        }
        
        // Force mobile viewport in iframe
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no');
        }
        
        // Prevent any cross-origin access attempts
        try {
            if (window.parent && window.parent !== window) {
                console.log('WEE WORLD - Iframe detected, preventing cross-origin access');
            }
        } catch (e) {
            console.log('WEE WORLD - Cross-origin access blocked (expected)');
        }
    }
    
    // Canvas logo rendering
    const canvas = document.getElementById('logoCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        
        img.src = 'images/LOGOOO.png';
    }
    
    // Simple touch feedback
    const links = document.querySelectorAll('.link-card');
    links.forEach(link => {
        link.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.98)';
        }, { passive: true });
        
        link.addEventListener('touchend', function() {
            this.style.transform = 'scale(1)';
        }, { passive: true });
    });
    
    // Simple fade in
    const container = document.querySelector('.container');
    if (container) {
        container.style.opacity = '0';
        setTimeout(function() {
            container.style.transition = 'opacity 0.5s ease';
            container.style.opacity = '1';
        }, 100);
    }
});
