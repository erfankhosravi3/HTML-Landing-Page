# Side Hustle Landing Page — Launch Guide

A conversion-focused landing page for starting an online business. It lives in
this `side-hustle/` folder so it doesn't touch the live WEE WORLD page at the
repo root.

**Live URL once pushed:** `https://landingpage.weeworldchildrenhub.com/side-hustle/`
(or `https://<username>.github.io/HTML-Landing-Page/side-hustle/`)

## What's included

- `index.html` — hero, services, how-it-works, testimonials, pricing, FAQ, lead form
- `styles.css` — modern responsive design; change brand colors in the `:root` block
- `script.js` — mobile menu + lead form handling

The page ships as a **digital services business** (landing pages, social media
setup, automation) because it's the fastest side hustle to start with zero
inventory — but every section is a template. Search for `CUSTOMIZE:` comments
in `index.html` to find everything you should personalize.

## Launch checklist

1. **Pick your niche.** Decide what you're actually selling and rewrite the
   hero headline, three service cards, and pricing tiers to match.
2. **Set up lead capture.** Create a free form at [formspree.io](https://formspree.io),
   then replace `YOUR_FORM_ID` in `index.html`. Until then the form opens an
   email draft as a fallback.
3. **Update contact links.** Email and Instagram links are in the contact
   section near the bottom of `index.html`.
4. **Get your first 3 clients.** Offer a discount in exchange for a
   testimonial, then replace the placeholder quotes with real ones.
5. **Accept payments.** Easiest options: [Stripe Payment Links](https://stripe.com/payments/payment-links)
   or PayPal.me — just link them from the pricing buttons.
6. **Add analytics.** Free options: [Google Analytics](https://analytics.google.com)
   or [Plausible](https://plausible.io). Paste the snippet into `<head>`.
7. **Share it.** Put the link in your social bios and generate a QR code at
   [qrcode-monkey.com](https://www.qrcode-monkey.com/).

## Previewing locally

Open `index.html` in a browser, or run a quick server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/side-hustle/
```
