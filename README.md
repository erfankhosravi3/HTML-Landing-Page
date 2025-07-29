# Digital Business Card Landing Page

A modern, responsive landing page that serves as your digital business card. Perfect for QR codes and sharing your professional information.

## Features

- ✨ Modern, clean design with smooth animations
- 📱 Fully responsive for all devices
- 🎨 Professional gradient background
- 🔗 Easy-to-customize social media links
- ⚡ Fast loading and optimized
- 🌙 Automatic dark mode support
- 📊 Built-in analytics tracking
- ♿ Accessibility features

## Customization

### 1. Personal Information
Edit the `index.html` file to update your personal information:

```html
<!-- Replace these with your actual information -->
<h1 class="name">Your Name</h1>
<p class="title">Your Title</p>
<p class="company">Your Company</p>
<p class="bio">Brief description about yourself or your business.</p>
```

### 2. Profile Image
Replace the placeholder image with your own:
```html
<img src="your-image-url.jpg" alt="Profile" id="profile-img">
```

### 3. Contact Links
Update the contact links with your actual information:

```html
<!-- Phone -->
<a href="tel:+1234567890" class="link-card phone">
    <i class="fas fa-phone"></i>
    <span>Call Me</span>
</a>

<!-- Email -->
<a href="mailto:your.email@example.com" class="link-card email">
    <i class="fas fa-envelope"></i>
    <span>Email Me</span>
</a>

<!-- Website -->
<a href="https://yourwebsite.com" class="link-card website" target="_blank">
    <i class="fas fa-globe"></i>
    <span>Visit Website</span>
</a>
```

### 4. Social Media Links
Update the social media links with your profiles:

```html
<!-- Instagram -->
<a href="https://instagram.com/yourusername" class="link-card instagram" target="_blank">
    <i class="fab fa-instagram"></i>
    <span>Instagram</span>
</a>

<!-- LinkedIn -->
<a href="https://linkedin.com/in/yourusername" class="link-card linkedin" target="_blank">
    <i class="fab fa-linkedin"></i>
    <span>LinkedIn</span>
</a>

<!-- Add more social platforms as needed -->
```

### 5. Colors and Styling
Customize colors in `styles.css`:

```css
/* Main gradient background */
body {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* Accent colors for different link types */
.phone { border-left: 4px solid #10b981; }
.email { border-left: 4px solid #3b82f6; }
.website { border-left: 4px solid #8b5cf6; }
```

## Deployment Options

### Free Hosting Services

1. **GitHub Pages**
   - Upload files to a GitHub repository
   - Enable GitHub Pages in repository settings
   - Your site will be available at `https://username.github.io/repository-name`

2. **Netlify**
   - Drag and drop the folder to [netlify.com](https://netlify.com)
   - Get a free subdomain like `your-name.netlify.app`

3. **Vercel**
   - Connect your GitHub repository to [vercel.com](https://vercel.com)
   - Automatic deployments on every push

4. **Firebase Hosting**
   - Use Firebase CLI to deploy
   - Free hosting with custom domain support

5. **Surge.sh**
   - Install: `npm install -g surge`
   - Deploy: `surge` in your project folder

### Custom Domain
After deploying, you can add a custom domain for a more professional look.

## QR Code Generation

Once deployed, generate a QR code for your landing page URL using:
- [QR Code Generator](https://www.qr-code-generator.com/)
- [QRCode Monkey](https://www.qrcode-monkey.com/)
- [GoQR.me](https://goqr.me/)

## Analytics Integration

The page includes basic click tracking. To add Google Analytics:

1. Get your Google Analytics tracking ID
2. Add this code to the `<head>` section of `index.html`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_TRACKING_ID');
</script>
```

Replace `GA_TRACKING_ID` with your actual tracking ID.

## File Structure

```
your-business-card/
├── index.html          # Main HTML file
├── styles.css          # CSS styles
├── script.js           # JavaScript functionality
└── README.md           # This file
```

## Browser Support

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile browsers

## Performance

- ⚡ Fast loading (< 2 seconds)
- 📱 Mobile optimized
- 🖼️ Optimized images
- 🎯 Minimal dependencies

## Security

- 🔒 HTTPS ready
- 🛡️ No external dependencies (except CDN fonts/icons)
- 🔐 Safe for public hosting

## Support

For issues or questions:
1. Check the browser console for errors
2. Ensure all file paths are correct
3. Verify your hosting service supports static sites

## License

This project is open source and available under the MIT License.