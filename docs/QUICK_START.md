# A shop owner's quick start

## 1. What is Stickonfig?

A reusable sticker-design and file-preparation page. Customers upload artwork, choose a shape and size, see a proof, and generate files for a print shop. It is software you deploy, not an account you sign up for.

## 2. What do I need?

A modern browser, hosting for a static website, and someone comfortable setting up web software. To build it locally, install Node.js 22.13 or newer and download/clone this repository. Your normal website and domain can stay where they are.

## 3. Do I need a developer?

For a basic download-only test, a technically comfortable owner can follow the steps below. For customer orders, storage, checkout, security or a custom website connection, involve your existing web developer. This project does not supply those services.

## 4. How do I deploy it?

In the project folder, run `npm install`, then `npm run dev`. Open the local address displayed. Try `public/samples/constellation.svg`.

For a public page, run `npm run build`. Your developer publishes **only the `dist` folder** to an HTTPS static host, for example at `https://stickers.example.com`. [Deployment settings](DEPLOYMENT.md) cover several host options. Never publish your project directory, environment files or credentials.

## 5. How do I change my logo?

Put your own logo in `public/`, for example `public/shop-logo.svg`. Change `branding.storeName`, `branding.logoUrl` (to `./shop-logo.svg`) and `branding.accentColor` in `stickonfig.config.mjs`. Rebuild and republish. The little sample shape symbols are neutral Stickonfig artwork and can also be replaced.

## 6. How do I change pricing?

Edit the clearly labeled placeholder settings under `pricing` in that same file. A developer can replace the calculation entirely. Also review quantity choices, size limits, material and laminate options. **The included prices are examples, not recommended retail rates.** Test several orders before opening the page to customers.

## 7. How do I connect it to my site?

The easiest approach is a “Design Your Stickers” link to your separate deployment. An iframe is another option. Neither automatically connects a shopping cart. Your developer decides how completed jobs reach your shop and how customers pay.

## 8. Where do submitted files go?

By default, nowhere online. “Generate production files” creates a ZIP and individual download links in the customer's browser. They must download and send the files using your agreed process. Nothing is emailed, uploaded to the project author, or placed in a cart. A developer can connect your own receiving endpoint/storage instead.

## 9. What if I use Wix?

Start with [WIX.md](WIX.md). Keep Wix as your main site and link to a separately hosted configurator. Give this repository to your site manager for deployment and integration. There is no Wix plugin installer.

## 10. Who supports this?

Your own developer/site manager supports your installation. The original author does not provide hosting, installation, configuration, integrations, or production support. Community bug reports are welcome without guaranteed replies. Read [SUPPORT.md](../SUPPORT.md).

Before printing commercially, test sample output in your own RIP, check the material/white-ink process, confirm scale, and inspect cut paths. A green resolution indicator describes source pixel density, not a guarantee that the final output is sharp or production-certified.
