# Supabase branded email templates

The current templates are in `supabase/email-templates`:

- `confirm-signup.html`
- `reset-password.html`
- `password-changed.html`

In Supabase Authentication email settings, paste the matching template and subject. The templates use the public image URL `https://sporty.codes/assets/logo-email.png`; keep the temporary Render URL during staging, then confirm the image after the production domain is connected.

Never place a service-role key or SMTP password inside an email template.
