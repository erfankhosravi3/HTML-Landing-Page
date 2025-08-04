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

  // Check if this is a WEE WORLD URL and apply site-specific styling
  const isWeeWorldSite = dest.includes('weeworldchildrenhub.com') || dest.includes('landingpage.weeworldchildrenhub.com');
  
  // Site-specific styling function for WEE WORLD
  function getWeeWorldStyling() {
    return `
      <style>
        /* WEE WORLD SPECIFIC - Massive mobile text enhancement */
        @media (max-width: 480px) {
          iframe {
            transform: scale(5) !important;
            transform-origin: top left !important;
            width: 20% !important;
            height: 20% !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            position: relative !important;
            z-index: 9999 !important;
          }
          
          iframe * {
            font-size: 200px !important;
            line-height: 1.2 !important;
          }
          
          iframe p {
            font-size: 200px !important;
            margin: 20px 0 !important;
            padding: 20px !important;
          }
          
          iframe span {
            font-size: 220px !important;
            display: inline-block !important;
            padding: 10px !important;
          }
          
          iframe i {
            font-size: 240px !important;
            margin-right: 30px !important;
          }
          
          iframe a {
            padding: 50px 60px !important;
            margin: 20px 0 !important;
            border-radius: 30px !important;
            font-size: 220px !important;
            display: block !important;
            text-decoration: none !important;
          }
          
          iframe body,
          iframe html {
            font-size: 200px !important;
            zoom: 5 !important;
            -webkit-text-size-adjust: none !important;
          }
        }
      </style>
    `;
  }
  
  // GENERAL REDIRECT - Apply site-specific styling if needed
  const html = `
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
      ${isWeeWorldSite ? getWeeWorldStyling() : ''}
    </head>
    <body>
      <div class="redirect-box">
        <h2>${isWeeWorldSite ? 'WEE WORLD' : 'Redirecting'}</h2>
        <p>${isWeeWorldSite ? 'Loading WEE WORLD experience...' : 'Redirecting to your destination...'}</p>
        <div class="spinner"></div>
        <p style="font-size: 14px; color: #666;">If you're not redirected automatically, <a href="${dest}" style="color: #3498db;">click here</a></p>
      </div>
      
      <script>
        // Immediate redirect with site-specific enhancement
        setTimeout(function() {
          window.location.href = "${dest}";
        }, 1000);
        
        ${isWeeWorldSite ? `
        // WEE WORLD specific enhancement
        console.log('WEE WORLD site detected - applying massive text enhancement');
        ` : ''}
      </script>
    </body>
    </html>
  `;

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
} 