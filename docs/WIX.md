# Using Stickonfig with Wix or another DIY website

You do not need to replace your main website. Stickonfig is a separate piece of software that your developer or site manager deploys. It is not a Wix app and the original author does not install/configure it for individual stores.

## Option 1 — link to a standalone builder (recommended)

Keep your main site on Wix. Have your developer deploy Stickonfig at a separate address, such as `https://stickers.example.com`. Then add a regular Wix button/link:

```text
Your Wix website → “Design Your Stickers” → your standalone Stickonfig page
```

This avoids many iframe sizing and download restrictions. Your developer can help with the subdomain, hosting and how completed files reach you. It does not automatically connect Wix checkout.

## Option 2 — embed in an iframe

After separately deploying the app, your site manager can adapt this in the platform's HTML/embed feature:

```html
<iframe
  title="Design your stickers"
  src="https://stickers.example.com"
  width="100%"
  height="1200"
  style="border:0"
></iframe>
```

Replace the example domain with your actual deployment. [A complete example](../examples/iframe/index.html) includes an “open in a new tab” fallback.

### Things to check together

- **Height:** the configurator becomes long on mobile. Fixed height can produce nested scrolling. Test a sufficiently tall frame or let a developer implement origin-checked resize messages. No automatic cross-origin resizing is built in.
- **Restrictions:** the host page must permit scripts, uploads, WebAssembly and downloads inside its frame. Your app's response headers must allow embedding by your site's origin. Do not blindly remove security headers from an existing site.
- **Downloads:** some embedded/mobile browsers restrict generated-file downloads. Keep a prominent standalone link as a fallback.
- **Submission/checkout:** choose either local downloads with a clear file-delivery process, or a developer-built order integration. Nothing automatically adds to Wix's cart, charges a customer or emails files.
- **Authentication:** third-party cookies can be blocked. A same-origin proxy or token/session workflow may be needed for an authenticated receiving API. Never paste private credentials into iframe URLs or public configuration.
- **Mobile:** test file picking, dragging, zooming, resizing, the DPI dialog and file downloads on actual customer devices.

Different Wix configurations, editors, mobile layouts and subscription features can behave differently. This repository cannot promise identical embedding behavior everywhere. Linking is the simplest fallback.

The same broad choices apply to Squarespace, WordPress, Shopify and other hosted platforms. For custom integration see the [developer guide](DEVELOPER_GUIDE.md); for support boundaries see [SUPPORT.md](../SUPPORT.md).
