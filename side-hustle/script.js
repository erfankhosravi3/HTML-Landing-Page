// Mobile menu toggle
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open);
});

// Close mobile menu when a link is clicked
navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
    });
});

// Lead form: submit via Formspree if configured, otherwise fall back to email
const form = document.getElementById('lead-form');
const status = document.getElementById('form-status');
const FALLBACK_EMAIL = 'khosravi.2020a@gmail.com'; // CUSTOMIZE: your email

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);

    // Formspree not set up yet — open an email draft instead
    if (form.action.includes('YOUR_FORM_ID')) {
        const subject = encodeURIComponent('New project inquiry from ' + data.get('name'));
        const body = encodeURIComponent(
            data.get('message') + '\n\nReply to: ' + data.get('email')
        );
        window.location.href = `mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${body}`;
        status.textContent = 'Opening your email app… (Set up Formspree to receive submissions directly.)';
        return;
    }

    status.textContent = 'Sending…';
    try {
        const res = await fetch(form.action, {
            method: 'POST',
            body: data,
            headers: { Accept: 'application/json' },
        });
        if (res.ok) {
            form.reset();
            status.textContent = "✅ Got it! I'll get back to you within 24 hours.";
        } else {
            status.textContent = '⚠️ Something went wrong — please email me directly.';
        }
    } catch {
        status.textContent = '⚠️ Network error — please email me directly.';
    }
});
