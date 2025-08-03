// Landing Page Version 3 - Ultra Simple (No cross-origin access)
document.addEventListener('DOMContentLoaded', function() {
    console.log('WEE WORLD - Ultra Simple Version Active - Cache v1000001');
    
    // Detect if running in iframe (Google Scripts)
    const isInIframe = window !== window.top;
    if (isInIframe) {
        console.log('WEE WORLD - Running in Google Scripts iframe - applying mobile-responsive sizing');
        
        // Apply iframe-safe styling to match mobile responsive sizes exactly
        document.documentElement.style.width = '100%';
        document.documentElement.style.height = 'auto';
        document.documentElement.style.minHeight = '100vh';
        document.body.style.width = '100%';
        document.body.style.height = 'auto';
        document.body.style.minHeight = '100vh';
        document.body.style.maxWidth = '100%';
        document.body.style.overflowX = 'hidden';
        document.body.style.margin = '0';
        document.body.style.padding = '10px';
        document.body.style.fontSize = '16px';
        document.body.style.background = 'linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%)';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundSize = 'cover';
        
        // Force container to match mobile responsive exactly
        const container = document.querySelector('.container');
        if (container) {
            container.style.width = '100%';
            container.style.maxWidth = '100%';
            container.style.margin = '0';
            container.style.padding = '0';
            container.style.minHeight = 'auto';
            container.style.background = '#ffffff';
            container.style.borderRadius = '20px';
            container.style.boxShadow = '0 15px 30px rgba(0, 0, 0, 0.1)';
            container.style.border = '3px solid rgba(255, 255, 255, 0.3)';
        }
        
        // Fix logo size to match mobile responsive exactly
        const profileImage = document.querySelector('.profile-image');
        if (profileImage) {
            profileImage.style.height = '40vh';
            profileImage.style.minHeight = '140px';
            profileImage.style.display = 'flex';
            profileImage.style.alignItems = 'center';
            profileImage.style.justifyContent = 'center';
            profileImage.style.marginBottom = '0';
            profileImage.style.background = '#ffffff';
        }
        
        const canvas = document.querySelector('#logoCanvas');
        if (canvas) {
            canvas.style.maxWidth = '100%';
            canvas.style.maxHeight = '100%';
            canvas.style.width = 'auto';
            canvas.style.height = 'auto';
            canvas.style.objectFit = 'contain';
            canvas.style.transform = 'scale(1.2)';
        }
        
        // Fix link card sizes to match mobile responsive exactly
        const linkCards = document.querySelectorAll('.link-card');
        linkCards.forEach(card => {
            card.style.padding = '16px 18px';
            card.style.fontSize = '15px';
            card.style.marginBottom = '12px';
            card.style.borderRadius = '12px';
        });
        
        const linkIcons = document.querySelectorAll('.link-card i');
        linkIcons.forEach(icon => {
            icon.style.fontSize = '18px';
            icon.style.marginRight = '12px';
            icon.style.width = '20px';
        });
        
        const linkSpans = document.querySelectorAll('.link-card span');
        linkSpans.forEach(span => {
            span.style.fontSize = '15px';
        });
        
        // Fix text sizes to match mobile responsive exactly
        const company = document.querySelector('.company');
        if (company) {
            company.style.fontSize = '18px';
            company.style.margin = '20px 0 12px 0';
            company.style.padding = '0 15px';
            company.style.fontWeight = '600';
            company.style.textAlign = 'center';
            company.style.color = '#ff6b35';
        }
        
        const bio = document.querySelector('.bio');
        if (bio) {
            bio.style.fontSize = '14px';
            bio.style.lineHeight = '1.5';
            bio.style.padding = '0 20px';
            bio.style.marginBottom = '20px';
            bio.style.maxWidth = '100%';
            bio.style.color = '#64748b';
            bio.style.textAlign = 'center';
        }
        
        // Fix links section to match mobile responsive exactly
        const linksSection = document.querySelector('.links-section');
        if (linksSection) {
            linksSection.style.padding = '0 15px';
            linksSection.style.gap = '12px';
        }
        
        // Fix footer to match mobile responsive exactly
        const footer = document.querySelector('.footer');
        if (footer) {
            footer.style.marginTop = '15px';
            footer.style.padding = '15px 20px';
        }
        
        const footerP = document.querySelector('.footer p');
        if (footerP) {
            footerP.style.fontSize = '11px';
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
    } else {
        console.log('WEE WORLD - Running in regular mode - using original sizes');
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
