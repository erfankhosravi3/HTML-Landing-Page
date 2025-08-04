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
  
  // Complete WEE WORLD site function - all styling and functionality together
  function getWeeWorldSite() {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>WEE WORLD - Early Childhood Enrichment Hub</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%);
            min-height: 100vh;
            padding: 20px;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 30px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            position: relative;
            backdrop-filter: blur(10px);
            border: 3px solid rgba(255, 255, 255, 0.3);
            min-height: 80vh;
            animation: fadeInUp 0.8s ease-out;
          }
          
          .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 8px;
            background: linear-gradient(90deg, #ff6b35, #ffd700, #ff6b35);
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
          }
          
          .phone i {
            color: #25d366;
          }
          
          .email {
            border-left: 5px solid #ea4335;
            background: linear-gradient(135deg, #fff5f5 0%, #ffeaea 100%);
          }
          
          .email i {
            color: #ea4335;
          }
          
          .address {
            border-left: 5px solid #4285f4;
            background: linear-gradient(135deg, #f0f4ff 0%, #e8f0ff 100%);
          }
          
          .address i {
            color: #4285f4;
          }
          
          .website {
            border-left: 5px solid #34a853;
            background: linear-gradient(135deg, #f0fff0 0%, #e8ffe8 100%);
          }
          
          .website i {
            color: #34a853;
          }
          
          .instagram {
            border-left: 5px solid #e4405f;
            background: linear-gradient(135deg, #fff0f5 0%, #ffe8f0 100%);
          }
          
          .instagram i {
            color: #e4405f;
          }
          
          .facebook {
            border-left: 5px solid #1877f2;
            background: linear-gradient(135deg, #f0f4ff 0%, #e8f0ff 100%);
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
          
          /* WEE WORLD MOBILE ENHANCEMENT - Massive text for mobile only */
          @media (max-width: 480px) {
            body {
              padding: 10px;
            }
            
            .container {
              margin: 0;
              border-radius: 20px;
              max-width: 100%;
              width: 100%;
            }
            
            .profile-image {
              height: 40vh;
              min-height: 140px;
            }
            
            .company {
              font-size: 60px !important;
              margin: 20px 0 12px 0;
              padding: 0 15px;
            }
            
            .bio {
              font-size: 50px !important;
              line-height: 1.5;
              padding: 0 20px;
              margin-bottom: 20px;
              max-width: 100%;
            }
            
            .links-section {
              padding: 0 15px;
              gap: 20px;
            }
            
            .link-card {
              padding: 40px 50px !important;
              border-radius: 20px;
              font-size: 50px !important;
            }
            
            .link-card i {
              font-size: 60px !important;
              margin-right: 30px;
              width: 60px;
            }
            
            .link-card span {
              font-size: 50px !important;
            }
            
            .footer {
              margin-top: 30px;
              padding: 30px 20px;
            }
            
            .footer p {
              font-size: 30px;
            }
          }
          
          @media (max-width: 360px) {
            .company {
              font-size: 50px !important;
            }
            
            .bio {
              font-size: 40px !important;
            }
            
            .link-card {
              padding: 30px 40px !important;
              font-size: 40px !important;
            }
            
            .link-card i {
              font-size: 50px !important;
              margin-right: 25px;
              width: 50px;
            }
            
            .link-card span {
              font-size: 40px !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Profile Section -->
          <div class="profile-section">
            <div class="profile-image">
              <canvas id="logoCanvas" width="300" height="150"></canvas>
              <img src="images/LOGOOO.png" alt="WEE WORLD Logo" onerror="this.src='images/logo.jpg'" style="display: none;">
            </div>
            <p class="company">Where Little Dreams Take Flight</p>
            <p class="bio">Welcome to WEE WORLD! We nurture curious minds, spark imaginations, and build confident little learners. Our experienced teachers create a safe, loving environment where every child thrives.</p>
          </div>

          <!-- Contact Links -->
          <div class="links-section">
            <a href="tel:+12029333219" class="link-card phone">
              <i class="fas fa-phone"></i>
              <span>Get A Wee More Info!</span>
            </a>
            
            <a href="mailto:hello@weeworldchildrenhub.com" class="link-card email">
              <i class="fas fa-envelope"></i>
              <span>Email Wee!</span>
            </a>

            <a href="https://maps.google.com/?q=4400+Jenifer+St+NW+Suite+3+%26+250+Washington+DC+20015" class="link-card address" target="_blank">
              <i class="fas fa-map-marker-alt"></i>
              <span>Visit Wee!: 4400 Jenifer St NW Suite 3 & 250, Washington, DC 20015</span>
            </a>

            <a href="https://weeworldchildrenhub.com" class="link-card website" target="_blank">
              <i class="fas fa-globe"></i>
              <span>Visit Website</span>
            </a>

            <a href="https://www.instagram.com/weeworldchildrenhub/?igsh=MXgxaGp2Z2Fsc2lwMw%3D%3D" class="link-card instagram" target="_blank">
              <i class="fab fa-instagram"></i>
              <span>Instagram Wee!</span>
            </a>

            <a href="https://www.facebook.com/profile.php?id=61570066343703" class="link-card facebook" target="_blank">
              <i class="fab fa-facebook"></i>
              <span>Facebook Wee!</span>
            </a>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p>&copy; 2024 WEE WORLD Early Childhood Enrichment Hub. All rights reserved.</p>
          </div>
        </div>

        <script>
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
          
          console.log('WEE WORLD site detected - applying massive text enhancement');
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