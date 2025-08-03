// Landing Page Version 3 - Ultra Simple (No cross-origin access)
document.addEventListener('DOMContentLoaded', function() {
    console.log('WEE WORLD - Ultra Simple Version Active - Cache v999999');
    
    // Detect if running in iframe (Google Scripts)
    const isInIframe = window !== window.top;
    if (isInIframe) {
        console.log('WEE WORLD - Running in Google Scripts iframe - applying iframe-safe mode');
        
        // Apply iframe-safe styling for exact regular version appearance
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
        document.body.style.fontSize = '18px';
        document.body.style.background = 'linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%)';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundSize = 'cover';
        
        // Force container to look exactly like regular version
        const container = document.querySelector('.container');
        if (container) {
            container.style.width = '90%';
            container.style.maxWidth = '500px';
            container.style.margin = '20px auto';
            container.style.padding = '30px';
            container.style.minHeight = 'auto';
            container.style.background = 'rgba(255, 255, 255, 0.95)';
            container.style.borderRadius = '25px';
            container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.1)';
        }
        
        // Fix logo size - make it much bigger like regular version
        const profileImage = document.querySelector('.profile-image');
        if (profileImage) {
            profileImage.style.height = 'auto';
            profileImage.style.minHeight = '250px';
            profileImage.style.maxHeight = '300px';
            profileImage.style.display = 'flex';
            profileImage.style.alignItems = 'center';
            profileImage.style.justifyContent = 'center';
            profileImage.style.marginBottom = '20px';
        }
        
        const canvas = document.querySelector('#logoCanvas');
        if (canvas) {
            canvas.style.maxWidth = '100%';
            canvas.style.height = 'auto';
            canvas.style.maxHeight = '250px';
            canvas.style.width = 'auto';
        }
        
        // Fix link card sizes - make them much bigger like regular version
        const linkCards = document.querySelectorAll('.link-card');
        linkCards.forEach(card => {
            card.style.padding = '22px 25px';
            card.style.fontSize = '20px';
            card.style.marginBottom = '18px';
            card.style.borderRadius = '15px';
        });
        
        const linkIcons = document.querySelectorAll('.link-card i');
        linkIcons.forEach(icon => {
            icon.style.fontSize = '24px';
            icon.style.marginRight = '20px';
        });
        
        const linkSpans = document.querySelectorAll('.link-card span');
        linkSpans.forEach(span => {
            span.style.fontSize = '20px';
        });
        
        // Fix text sizes - make them much bigger like regular version
        const company = document.querySelector('.company');
        if (company) {
            company.style.fontSize = '28px';
            company.style.margin = '30px 0 25px 0';
            company.style.fontWeight = '600';
            company.style.textAlign = 'center';
        }
        
        const bio = document.querySelector('.bio');
        if (bio) {
            bio.style.fontSize = '20px';
            bio.style.marginBottom = '35px';
            bio.style.lineHeight = '1.6';
            bio.style.textAlign = 'center';
        }
        
        // Fix footer
        const footer = document.querySelector('.footer');
        if (footer) {
            footer.style.marginTop = '30px';
            footer.style.fontSize = '16px';
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
