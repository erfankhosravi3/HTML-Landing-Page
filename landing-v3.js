// Landing Page Version 4 - Ultra Simple with Massive Iframe Enhancement
document.addEventListener('DOMContentLoaded', function() {
    console.log('WEE WORLD - Version 4.1 Active - Cache v9999999 - Ultra Aggressive Iframe Enhancement v1.1');
    
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
    
    // IFRAME ENHANCEMENT - Try to inject styles into iframes
    function enhanceIframeContent() {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                // Wait for iframe to load
                iframe.addEventListener('load', function() {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        if (iframeDoc) {
                            // Inject CSS to make content bigger
                            const style = iframeDoc.createElement('style');
                            style.textContent = `
                                @media screen and (max-width: 480px) {
                                    .bio, p.bio, p { font-size: 200px !important; }
                                    .link-card span, a span, span { font-size: 220px !important; }
                                    .link-card i, a i, i { font-size: 240px !important; }
                                    .link-card, a.link-card, a { padding: 150px 180px !important; font-size: 220px !important; }
                                    body { transform: scale(5) !important; transform-origin: top left !important; }
                                    * { font-size: 200px !important; }
                                    html { font-size: 200px !important; }
                                    body { font-size: 200px !important; }
                                }
                            `;
                            iframeDoc.head.appendChild(style);
                            console.log('Iframe styles injected successfully - Version 4.1 v1.1 - Ultra aggressive text enhancement applied');
                        }
                    } catch (e) {
                        console.log('Could not inject styles into iframe (cross-origin):', e.message);
                    }
                });
            } catch (e) {
                console.log('Iframe enhancement failed:', e.message);
            }
        });
    }
    
    // Try to enhance iframes
    enhanceIframeContent();
    
    // Also try periodically in case iframes load later
    setInterval(enhanceIframeContent, 2000);
});
