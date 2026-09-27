# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately through GitHub:

1. Go to the [**Security** tab](https://github.com/YV17labs/TokenShooter/security) of the repository.
2. Click **Report a vulnerability** to open a private advisory.

The report stays between you and the maintainers until a fix is out. If you can, include the browser and its version, the steps to reproduce, and the impact you foresee.

## What the page does

TokenShooter is a static page, with no server and no account. It keeps three display preferences in the browser's local storage (pace, model, sound), and the browser caches the model files it downloads.

Opening the page requests nothing outside the site: the fonts and libraries are bundled with it. Two downloads happen only after the visitor clicks to load the model, or opens a link with `?autostart=1`:

- the model weights, from Hugging Face;
- the ONNX Runtime WebAssembly engine, from the jsDelivr CDN, pinned to the version bundled with the page.

## Supported versions

Fixes land on the `main` branch, which is what the live demo is built from.
