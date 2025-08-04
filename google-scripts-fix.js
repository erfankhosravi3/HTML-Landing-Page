// Google Scripts Fix - Direct Redirect (No iframe)
// Replace the HTML output section in your Google Scripts with this:

function doGet(e) {
  // Handle manual runs from the editor
  if (typeof e === 'undefined') {
    return HtmlService.createHtmlOutput('Test this via the deployed web app URL with ?id= parameter.');
  }

  if (!e.parameter || !e.parameter.id || e.parameter.id.trim() === '') {
    return HtmlService.createHtmlOutput('Invalid or missing ID. Use ?id= with a valid value in the URL.');
  }

  const id = e.parameter.id.trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSh = ss.getSheetByName('QR Codes');
  if (!mainSh) {
    return HtmlService.createHtmlOutput('Main sheet not found.');
  }

  const ID_COL = 5;
  const AFFILIATE_COL = 1;
  const TARGET_URL_COL = 8;

  // Find row by ID
  const idData = mainSh.getRange(2, ID_COL, mainSh.getLastRow() - 1).getValues().map(v => String(v[0]));
  const rowIndex = idData.indexOf(id) + 2;

  if (rowIndex < 2) {
    return HtmlService.createHtmlOutput('ID not found.');
  }

  const affiliate = mainSh.getRange(rowIndex, AFFILIATE_COL).getValue();

  // Get destination URL
  const targetRange = mainSh.getRange(rowIndex, TARGET_URL_COL);
  let dest = targetRange.getValue();

  // Handle HYPERLINK formulas
  const formula = targetRange.getFormula();
  if (formula.startsWith('=HYPERLINK(')) {
    const matches = formula.match(/=HYPERLINK\(\s*"([^"]+)"\s*(?:,\s*"[^"]+")?\s*\)/);
    if (matches && matches[1]) {
      dest = matches[1];
    }
  }

  // Handle rich text hyperlinks
  const richText = targetRange.getRichTextValue();
  if (richText && richText.getLinkUrl()) {
    dest = richText.getLinkUrl();
  }

  if (!dest || dest.trim() === '') {
    return HtmlService.createHtmlOutput('No valid target URL found for this ID.');
  }

  Logger.log('ID: ' + id + ', RowIndex: ' + rowIndex + ', Affiliate: ' + affiliate + ', Dest: ' + dest);

  // Update Scans sheet (tracking still works!)
  let scansSh = ss.getSheetByName('Scans');
  if (!scansSh) {
    scansSh = ss.insertSheet('Scans');
    scansSh.appendRow(['Affiliate', 'Counter / ID', 'Time / Query / Destination']);
  }

  const currentCounterId = scansSh.getRange(rowIndex, 2).getValue() || '0 / ';
  const parts = currentCounterId.split('/');
  const currentCounter = parseInt(parts[0].trim(), 10) || 0;
  const newCounter = currentCounter + 1;
  const counterIdStr = newCounter + ' / ' + id;

  const timeStamp = new Date().toISOString();
  const queryString = e.queryString || '';
  const latestInfo = timeStamp + ' / ' + queryString + ' / ' + dest;

  scansSh.getRange(rowIndex, 2).setValue(counterIdStr);
  scansSh.getRange(rowIndex, 3).setValue(latestInfo);

  // ===== SITE-SPECIFIC FUNCTIONS =====
  
  // Check if this is a WEE WORLD URL
  const isWeeWorldSite = dest.includes('landingpage.weeworldchildrenhub.com');
  
  // Complete WEE WORLD site function - EXACT copy of real landing page
  function getWeeWorldSite() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <meta name="format-detection" content="telephone=yes">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <title>WEE WORLD - Early Childhood Enrichment Hub</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          /* Reset and Base Styles */
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          html {
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
            text-size-adjust: 100%;
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            -khtml-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
          }

          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #87ceeb;
            background: -webkit-linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%);
            background: -moz-linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%);
            background: -o-linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%);
            background: linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%);
            background-attachment: fixed;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            position: relative;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            -webkit-transform: translateZ(0);
            transform: translateZ(0);
          }

          body::before {
            content: '';
            position: absolute;
            top: 10%;
            left: 10%;
            width: 100px;
            height: 100px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            animation: float 6s ease-in-out infinite;
            z-index: -1;
          }

          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
          }

          .container {
            background: #ffffff;
            border-radius: 25px;
            padding: 0;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            border: 3px solid rgba(255, 255, 255, 0.3);
            position: relative;
            overflow: hidden;
            animation: fadeInUp 1s ease-out;
            min-height: 600px;
          }

          .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 6px;
            background: linear-gradient(90deg, #ff6b35, #ffd700, #ff6b35);
            border-radius: 25px 25px 0 0;
            z-index: 1;
          }

          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(30px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .profile-image {
            width: 100%;
            height: 35vh;
            min-height: 200px;
            background: #ffffff;
            border-radius: 20px 20px 0 0;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
            margin-bottom: 0;
          }

          .profile-image canvas {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
            display: block;
          }

          .profile-image img {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
            display: block;
          }

          .profile-image::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(1px);
          }

          .company {
            font-size: 20px;
            font-weight: 600;
            color: #ff6b35;
            margin: 20px 0 12px 0;
            text-shadow: 0 2px 4px rgba(255, 107, 53, 0.2);
            text-align: center;
            width: 100%;
          }

          .bio {
            font-size: 15px;
            line-height: 1.6;
            color: #64748b;
            margin-bottom: 25px;
            max-width: 320px;
            margin-left: auto;
            margin-right: auto;
            padding: 0 10px;
            text-align: center;
          }

          .links-section {
            padding: 0 25px 25px 25px;
            display: flex;
            flex-direction: column;
            gap: 15px;
          }

          .link-card {
            display: flex;
            align-items: center;
            padding: 18px 20px;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%);
            border-radius: 15px;
            text-decoration: none;
            color: #333;
            font-weight: 500;
            transition: all 0.3s ease;
            border: 2px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
            position: relative;
            overflow: hidden;
            -webkit-user-select: auto;
            -moz-user-select: auto;
            -ms-user-select: auto;
            user-select: auto;
            -webkit-touch-callout: default;
            touch-action: manipulation;
          }

          .link-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
            opacity: 0;
            transition: opacity 0.3s ease;
          }

          .link-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
            border-color: rgba(255, 255, 255, 0.5);
          }

          .link-card:hover::before {
            opacity: 1;
          }

          .link-card i {
            font-size: 20px;
            margin-right: 15px;
            width: 24px;
            text-align: center;
            font-weight: 600;
            position: relative;
            z-index: 1;
          }

          .link-card span {
            font-size: 16px;
            position: relative;
            z-index: 1;
          }

          .phone {
            border-left: 5px solid #25d366;
            background: linear-gradient(135deg, #f0f9f0 0%, #e8f5e8 100%);
            -webkit-tap-highlight-color: #25d366;
            cursor: pointer;
          }

          .phone i {
            color: #25d366;
          }

          .email {
            border-left: 5px solid #ea4335;
            background: linear-gradient(135deg, #fff5f5 0%, #ffeaea 100%);
            -webkit-tap-highlight-color: #ea4335;
          }

          .email i {
            color: #ea4335;
          }

                    .address {
            border-left: 5px solid #9c27b0;
            background: linear-gradient(135deg, #f8f0ff 0%, #f0e6ff 100%);
            -webkit-tap-highlight-color: #9c27b0;
          }
          
          .address i {
            color: #9c27b0;
          }

                    .website {
            border-left: 5px solid #ff6b35;
            background: linear-gradient(135deg, #fff8f0 0%, #ffe6d6 100%);
            -webkit-tap-highlight-color: #ff6b35;
          }
          
          .website i {
            color: #ff6b35;
          }

          .instagram {
            border-left: 5px solid #e4405f;
            background: linear-gradient(135deg, #fff0f5 0%, #ffe8f0 100%);
            -webkit-tap-highlight-color: #e4405f;
          }

          .instagram i {
            color: #e4405f;
          }

          .facebook {
            border-left: 5px solid #1877f2;
            background: linear-gradient(135deg, #f0f4ff 0%, #e8f0ff 100%);
            -webkit-tap-highlight-color: #1877f2;
          }

          .facebook i {
            color: #1877f2;
          }

          .footer {
            margin-top: 20px;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid rgba(255, 255, 255, 0.3);
          }

          .footer p {
            font-size: 12px;
            color: #94a3b8;
            margin: 0;
          }

          /* EXACT MOBILE STYLING FROM REAL SITE */
          @media (max-width: 480px) {
            html {
              zoom: 1 !important;
              -webkit-text-size-adjust: none !important;
              -ms-text-size-adjust: none !important;
              text-size-adjust: none !important;
            }
            
            body {
              padding: 10px !important;
              font-size: 16px !important;
              min-height: 100vh !important;
              background: linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%) !important;
              background-attachment: fixed !important;
              background-size: cover !important;
              background-position: center !important;
              background-repeat: no-repeat !important;
              overflow-x: hidden !important;
              overflow-y: auto !important;
              -webkit-overflow-scrolling: touch !important;
              touch-action: manipulation !important;
              -webkit-touch-callout: none !important;
              -webkit-user-select: none !important;
              user-select: none !important;
              -webkit-transform: translateZ(0) !important;
              transform: translateZ(0) !important;
              zoom: 1 !important;
              transform: scale(1) !important;
              transform-origin: 0 0 !important;
              width: 100vw !important;
              min-width: 100vw !important;
              max-width: 100vw !important;
            }
            
            body::before {
              display: none !important;
            }
            
            .container {
              margin: 0 !important;
              border-radius: 20px !important;
              max-width: 100% !important;
              width: 100% !important;
              box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1) !important;
              background: #ffffff !important;
              border: 3px solid rgba(255, 255, 255, 0.3) !important;
              animation: none !important;
              transform: none !important;
              min-height: auto !important;
            }
            
            .profile-image {
              height: 40vh !important;
              min-height: 140px !important;
            }
            
            .company {
              font-size: 18px !important;
              margin: 20px 0 12px 0 !important;
              padding: 0 15px !important;
            }
            
            .bio {
              font-size: 14px !important;
              padding: 0 20px !important;
              margin-bottom: 20px !important;
            }
            
            .links-section {
              padding: 0 15px !important;
              gap: 12px !important;
            }
            
            .link-card {
              padding: 16px 18px !important;
              border-radius: 12px !important;
              font-size: 15px !important;
            }
            
            .link-card i {
              font-size: 18px !important;
              margin-right: 12px !important;
              width: 20px !important;
            }
            
            .link-card span {
              font-size: 15px !important;
            }
            
            .footer {
              margin-top: 20px;
              padding: 20px 15px;
            }
            
            .footer p {
              font-size: 12px;
            }
          }

          @media (max-width: 360px) {
            body {
              padding: 5px;
            }
            
            .container {
              border-radius: 15px;
              margin: 0;
            }
            
            .container::before {
              border-radius: 15px 15px 0 0;
            }
            
            .profile-image {
              height: 30vh;
              min-height: 100px;
            }
            
            .company {
              font-size: 16px;
              margin: 15px 0 10px 0;
            }
            
            .bio {
              font-size: 13px;
              line-height: 1.4;
              padding: 0 15px;
              margin-bottom: 15px;
            }
            
            .links-section {
              padding: 0 10px;
              gap: 10px;
            }
            
            .link-card {
              padding: 14px 16px;
              border-radius: 10px;
            }
            
            .link-card i {
              font-size: 16px;
              margin-right: 10px;
              width: 18px;
            }
            
            .link-card span {
              font-size: 14px;
            }
            
            .footer {
              margin-top: 15px;
              padding: 15px 10px;
            }
            
            .footer p {
              font-size: 11px;
            }
          }

          @media (max-height: 600px) and (orientation: landscape) {
            body {
              padding: 5px;
            }
            
            .container {
              max-height: 95vh;
              overflow-y: auto;
            }
            
            .profile-image {
              height: 25vh;
              min-height: 80px;
            }
            
            .company {
              margin: 15px 0 8px 0;
            }
            
            .bio {
              margin-bottom: 15px;
            }
            
            .links-section {
              gap: 8px;
            }
            
            .link-card {
              padding: 12px 16px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Profile Section -->
          <div class="profile-section">
            <div class="profile-image">
              <img src="https://github.com/erfankhosravi3/weeworld-assets/raw/980c33c32d89ef61a85fd0f2b73743a97296a953/final%202.png" alt="WEE WORLD Logo" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;">
            </div>
            <p class="company">Where Little Dreams Take Flight</p>
            <p class="bio">Welcome to WEE WORLD! We nurture curious minds, spark imaginations, and build confident little learners. Our experienced teachers create a safe, loving environment where every child thrives.</p>
          </div>

          <!-- Contact Links -->
          <div class="links-section">
            <a href="tel:+12029333219" class="link-card phone">
              <i class="fas fa-phone"></i>
              <span>Get A Wee More Info Now!</span>
            </a>
            
            <a href="mailto:hello@weeworldchildrenhub.com" class="link-card email">
              <i class="fas fa-envelope"></i>
              <span>Email Wee!</span>
            </a>

            <a href="https://www.google.com/maps/place/WEE+WORLD+Early+Childhood+Enrichment+Hub/@38.966367,-77.1242977,14z/data=!4m10!1m2!2m1!1s4400+Jenifer+St+NW+Suite+3+%26+250+Washington+DC+20015!3m6!1s0x89b7c9bea27f97f1:0xa9dcc7b3889450f8!8m2!3d38.958625!4d-77.0865747!15sCjQ0NDAwIEplbmlmZXIgU3QgTlcgU3VpdGUgMyAmIDI1MCBXYXNoaW5ndG9uIERDIDIwMDE1WjYiNDQ0MDA gamVuaWZlciBzdCBudyBzdWl0ZSAzICYgMjUwIHdhc2hpbmd0b24gZGMgMjAwMTWSARFjaGlsZF9jYXJlX2FnZW5jeaoBcAoIL20vMHJoNmsQASoHIgMyNTAoADIfEAEiG4daDm63GcIbz6YVfB6p_UVfURyy7dmGvg1G4DI4EAIiNDQ0MDA gamVuaWZlciBzdCBudyBzdWl0ZSAzICYgMjUwIHdhc2hpbmd0b24gZGMgMjAwMTXgAQA!16s%2Fg%2F11xgfywh42?entry=ttu&g_ep=EgoyMDI1MDczMC4wIKXMDSoASAFQAw%3D%3D" class="link-card address" target="_blank">
              <i class="fas fa-map-marker-alt"></i>
              <span>Visit Wee: 4400 Jenifer St NW Suite 3 & 250, Washington, DC 20015</span>
            </a>

            <a href="https://weeworldchildrenhub.com" class="link-card website" target="_blank">
              <i class="fas fa-globe"></i>
              <span>Visit Weebsite!</span>
            </a>

            <a href="https://www.instagram.com/weeworldchildrenhub/?igsh=MXgxaGp2Z2Fsc2lwMw%3D%3D" class="link-card instagram" target="_blank">
              <i class="fab fa-instagram"></i>
              <span>Instagram Wee</span>
            </a>

            <a href="https://www.facebook.com/profile.php?id=61570066343703" class="link-card facebook" target="_blank">
              <i class="fab fa-facebook"></i>
              <span>Facebook Wee</span>
            </a>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p>&copy; 2024 WEE WORLD Early Childhood Enrichment Hub. All rights reserved.</p>
          </div>
        </div>

        <script>
          // Landing Page Version 4 - Complete with all JavaScript features
          document.addEventListener('DOMContentLoaded', function() {
            console.log('WEE WORLD - Version 4 Active - Cache v9999999 - Complete JavaScript Features');
            
            // Logo is now loaded directly from GitHub - no JavaScript needed
            
            // Enhanced touch feedback with haptic-like effects
            const links = document.querySelectorAll('.link-card');
            links.forEach(link => {
              // Touch feedback
              link.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.95)';
                this.style.transition = 'transform 0.1s ease';
                
                // Add ripple effect
                const ripple = document.createElement('div');
                ripple.style.position = 'absolute';
                ripple.style.borderRadius = '50%';
                ripple.style.background = 'rgba(255, 255, 255, 0.6)';
                ripple.style.transform = 'scale(0)';
                ripple.style.animation = 'ripple 0.6s linear';
                ripple.style.left = '50%';
                ripple.style.top = '50%';
                ripple.style.width = '20px';
                ripple.style.height = '20px';
                ripple.style.marginLeft = '-10px';
                ripple.style.marginTop = '-10px';
                ripple.style.pointerEvents = 'none';
                this.appendChild(ripple);
                
                setTimeout(() => {
                  if (ripple.parentNode) {
                    ripple.parentNode.removeChild(ripple);
                  }
                }, 600);
              }, { passive: true });
              
              link.addEventListener('touchend', function() {
                this.style.transform = 'scale(1)';
                this.style.transition = 'transform 0.2s ease';
              }, { passive: true });
              
              // Mouse hover effects
              link.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-3px) scale(1.02)';
                this.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.15)';
              });
              
              link.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0) scale(1)';
                this.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.05)';
              });
            });
            
            // Enhanced fade in with staggered animation
            const container = document.querySelector('.container');
            if (container) {
              container.style.opacity = '0';
              container.style.transform = 'translateY(30px)';
              
              setTimeout(function() {
                container.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
                container.style.opacity = '1';
                container.style.transform = 'translateY(0)';
              }, 200);
            }
            
            // Add ripple animation CSS
            const style = document.createElement('style');
            style.textContent = '@keyframes ripple { to { transform: scale(4); opacity: 0; } }';
            document.head.appendChild(style);
            
            // Add smooth scrolling for better UX
            document.documentElement.style.scrollBehavior = 'smooth';
            
            // Add loading animation for better perceived performance
            const profileImage = document.querySelector('.profile-image');
            if (profileImage) {
              profileImage.style.opacity = '0';
              setTimeout(function() {
                profileImage.style.transition = 'opacity 0.6s ease';
                profileImage.style.opacity = '1';
              }, 400);
            }
            
            console.log('WEE WORLD site detected - complete JavaScript features loaded');
          });
        </script>
      </body>
      </html>
    `;
  }
  
  // Future site-specific functions can be added here
  // function getOtherSite() { ... }
  
  // ===== HTML GENERATION =====
  
  // Generate HTML based on site type
  const html = isWeeWorldSite ? getWeeWorldSite() : `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Redirecting...</title>
      <style>
        body { 
          margin: 0; 
          padding: 20px; 
          font-family: Arial, sans-serif; 
          text-align: center; 
          background: linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%);
          color: #333;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .redirect-box {
          background: white;
          padding: 30px;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          max-width: 400px;
          width: 90%;
        }
        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #3498db;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="redirect-box">
        <h2>Redirecting</h2>
        <p>Redirecting to your destination...</p>
        <div class="spinner"></div>
        <p style="font-size: 14px; color: #666;">If you're not redirected automatically, <a href="${dest}" style="color: #3498db;">click here</a></p>
      </div>
      
      <script>
        // Immediate redirect for non-WEE WORLD sites
        setTimeout(function() {
          window.location.href = "${dest}";
        }, 1000);
      </script>
    </body>
    </html>
  `;

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
} 