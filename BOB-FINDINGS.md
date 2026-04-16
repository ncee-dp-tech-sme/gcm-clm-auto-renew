# Bob Findings

## Overview

This document consolidates the key findings, changes, fixes, packaging work, and distribution outcomes completed during this work session for the repository.

---

## 1. Documentation Findings and Updates

### README scope updated
The following documentation files were reviewed and updated to align with the actual runtime and repository setup:

- `README.md`
- `DOCKER-README.md`
- `DOCKER-VAULT-README.md`
- `ACME-README.md`
- `VAULT-ACME-README.md`
- `NGINX-README.md`

### Documentation corrections applied
- standardized GitHub repository URL to:
  - `https://github.com/ncee-dp-tech-sme/gcm-clm-auto-renew`
- corrected Docker-related usage/configuration guidance
- standardized UI access instructions to the default HTTPS endpoint:
  - `https://localhost`
- removed or corrected outdated references to non-standard UI HTTPS ports where they no longer matched the actual setup

---

## 2. Git / Repository / Secret Handling Findings

### Git sync findings
- local work had diverged ahead of remote in earlier phases
- GitHub push protection blocked push attempts due to secret-like content in history

### Secret handling findings
- `.env.example` contained content that triggered GitHub secret protection
- history was sanitized and force-pushed successfully after cleanup

### Commit history created during this work
- `95185e7`
  - `Update docs, Vault PKI UI, and nginx reload handling`
- `fc39a09`
  - `Add standalone certificatecheck-only distributables`

---

## 3. Main Application Runtime Findings

### nginx reload root cause findings
Original reload strategies did not work reliably because:

1. `supervisorctl` failed due to missing `[supervisorctl]` section in `supervisord.conf`
2. `nginx -s reload` failed under the previous process/user model
3. Node running as `appuser` did not have sufficient permission to signal the nginx master process
4. nginx PID file location in the runtime container was:
   - `/run/nginx/nginx.pid`
   not:
   - `/var/run/nginx.pid`
   - `/run/nginx.pid`

### nginx reload fixes applied
- removed `user=appuser` from the `nodejs` program in `supervisord.conf`
- updated nginx reload logic in `server-https.js` to use PID-based `SIGHUP`
- updated PID lookup order to include:
  - `/run/nginx/nginx.pid`
  - `/var/run/nginx.pid`
  - `/run/nginx.pid`

### Final runtime result
- nginx reload was confirmed working by the user after the permission and PID path fixes

---

## 4. Vault PKI Configuration Findings

### UI and backend configurability findings
The original Vault PKI configuration flow was too limited for external/alternate Vault usage. The following enhancements were made:

- Vault PKI configuration page now supports another existing Vault server
- Vault token can be entered and persisted safely in backend config
- external Vault settings are editable
- related backend configuration loading and saving paths were updated

### Restore-default support findings
A restore-default flow was designed and implemented:

- backup/default snapshot handling added in backend config manager
- restore-default endpoint added
- restore-default button and client logic added to the Vault config page

### Token and unseal token findings
- root token display existed already
- for development/demo use, unseal token display was also added
- unseal token is sourced from:
  - configured file path
  - init keys JSON
  - environment fallback

Relevant additions in `vault-pki-manager.js`:
- credential path resolution helpers
- file existence helpers
- unseal token retrieval fallback logic

---

## 5. Certificate Monitoring Findings

### Localhost certificate check issue
A certificate check failure was traced to IPv4/IPv6 localhost connection handling.

### Fix applied
`server-https.js` was updated to properly try both:
- `127.0.0.1`
- `::1`

for `localhost` certificate inspection.

### Result
- localhost certificate checking behavior was fixed

---

## 6. Vault PKI Certificate Issuance / Retrieval Findings

### Behavioral issue found
The earlier flow did not clearly distinguish between:
- obtaining a new certificate
- retrieving the latest existing certificate

### Fixes applied
Behavior was separated so that:
- **Obtain** = create a new cert and install it
- **Retrieve** = fetch latest existing cert and install only if newer/applicable

### Related implementation findings
- certificate writing logic was updated so nginx receives the expected installed files
- install flow was aligned with the nginx certificate paths in use

---

## 7. Certificate Comparison UI Findings

### Requirement addressed
A side-by-side comparison of current vs previous certificates was required.

### Changes applied
- comparison UI added
- changed fields are marked with a red `*`
- current and previous certificate details are rendered in two columns

Files involved:
- `public/acme-config.html`
- `public/acme-config.js`
- `public/styles.css`

### Additional implementation note
There were several quoting/escaping issues during JS editing in this area, which were corrected and syntax validation was performed.

---

## 8. Homepage / UX Findings

### UI workflow updates
- `Retrieve & Install Certificate` button moved to the homepage
- placed next to `Check Certificate`
- matched visually and dimensionally with the primary action styling

Files involved:
- `public/index.html`
- `public/app.js`

---

## 9. Docker / Container Findings

### Docker runtime findings
The Docker/Podman setup needed process permission alignment for nginx reload signaling.

### Practical requirement identified
To make nginx reload work:
- Node and nginx must run in the same container under a process model where Node can signal nginx
- the app service must not be forced to an overriding runtime `user`
- `/run/nginx` must exist before nginx starts

### Changes applied
- supervisor process model adjusted to avoid dropping Node to `appuser` for the reload path
- PID lookup updated to actual runtime location

---

## 10. Standalone `certificatecheck-only` App Findings

A new standalone application was created in:

- `certificatecheck-only/`

### Goal
Provide a minimal Node-based certificate checking app that only:
- checks certificates from an HTTPS endpoint
- stores current and previous certificate snapshots
- compares them side by side

### Files created
- `certificatecheck-only/server.js`
- `certificatecheck-only/package.json`
- `certificatecheck-only/package-lock.json`
- `certificatecheck-only/public/index.html`
- `certificatecheck-only/public/app.js`
- `certificatecheck-only/public/styles.css`
- `certificatecheck-only/README.md`

### Standalone app behavior
- serves a minimal web UI
- allows entering/updating an HTTPS target URL
- checks and stores the current certificate
- retains current + previous certificate snapshots
- renders side-by-side comparison with highlighted differences
- supports clearing history
- stores runtime data in:
  - `certificatecheck-only/data/config.json`
  - `certificatecheck-only/data/certificates.json`

### Validation
- `node --check server.js`
- `node --check public/app.js`

both passed during validation

---

## 11. Auto-Open Browser Findings

### Feature added
The standalone app now automatically opens the default browser on startup to:

- `http://localhost:3001`

### Behavior details
- implemented in `certificatecheck-only/server.js`
- platform-specific launch commands are used for:
  - Windows
  - macOS
  - Linux

### Disable mechanism
The behavior can be disabled using:

- `AUTO_OPEN_BROWSER=false`

### Additional packaging-related runtime fix
To better support packaged execution:
- `DATA_DIR` now resolves from `process.cwd()`
- `PUBLIC_DIR` resolves differently when running from a `pkg` build versus normal source execution

This avoids runtime issues when the app is launched from packaged binaries.

---

## 12. Windows Packaging Findings

### Packaging tool availability
Local tool availability was confirmed:
- Node available
- npm available
- `pkg` available via `npx`

### Packaging configuration added
`certificatecheck-only/package.json` was updated with:
- pkg configuration
- build script
- asset bundling for:
  - `public/**/*`

### Windows output created
Built Windows executable:
- `certificatecheck-only/Dist/certificatecheck-only.exe`

### Windows install zip created
A Windows zip package was later created in:

- `certificatecheck-only/install-packages/certificatecheck-only-windows.zip`

Verified contents:
- `certificatecheck-only.exe`
- `README.md`

---

## 13. macOS and Linux Distribution Findings

### Initial issue found
The first macOS/Linux zip packages did not actually contain the binaries.

### Correction applied
The zip packages were rebuilt so the binaries are included inside the platform folders before zipping.

### Final Mac distribution
Artifacts created:
- `certificatecheck-only/Dist/certificatecheck-only-macos`
- `certificatecheck-only/Dist/certificatecheck-only-mac.zip`

Verified zip contents include:
- `certificatecheck-only-macos`
- `start-certificatecheck-only.sh`
- `README.md`
- `public/`
- `data/`

### Final Linux distribution
Artifacts created:
- `certificatecheck-only/Dist/certificatecheck-only-linux`
- `certificatecheck-only/Dist/certificatecheck-only-linux.zip`

Verified zip contents include:
- `certificatecheck-only-linux`
- `start-certificatecheck-only.sh`
- `README.md`
- `public/`
- `data/`

### Install packages folder findings
The install/distribution folder currently includes:
- `certificatecheck-only-linux.zip`
- `certificatecheck-only-mac.zip`
- `certificatecheck-only-windows.zip`

under:
- `certificatecheck-only/install-packages/`

---

## 14. End-User README Findings

A dedicated end-user README was created for the standalone certificate checker:

- `certificatecheck-only/README.md`

### README covers
- what the app does
- what it does not do
- Windows/macOS/Linux startup instructions
- first-use steps
- runtime files created under `data/`
- how browser auto-open works
- how to disable browser auto-open
- port usage
- troubleshooting guidance
- demo recommendations
- security note

---

## 15. Important File-Level Findings

### Main application files modified during the broader work
- `server-https.js`
- `supervisord.conf`
- `vault-pki-manager.js`
- `public/index.html`
- `public/app.js`
- `public/acme-config.html`
- `public/acme-config.js`
- `public/styles.css`
- `public/vault-pki-config.html`
- `public/vault-pki-config.js`

### Standalone app files added
- `certificatecheck-only/server.js`
- `certificatecheck-only/package.json`
- `certificatecheck-only/package-lock.json`
- `certificatecheck-only/public/index.html`
- `certificatecheck-only/public/app.js`
- `certificatecheck-only/public/styles.css`
- `certificatecheck-only/README.md`

---

## 16. Final Artifact Summary

### Main application
- updated docs
- updated Vault PKI config flow
- fixed localhost certificate checking
- implemented certificate comparison UI
- fixed nginx reload behavior
- confirmed nginx reload works

### Standalone certificate checker
Created standalone app with:
- local web UI
- side-by-side comparison
- browser auto-open
- Windows executable
- macOS executable package
- Linux executable package
- install zip files for all three platforms
- end-user README

### Key distribution outputs
- `certificatecheck-only/Dist/certificatecheck-only.exe`
- `certificatecheck-only/Dist/certificatecheck-only-mac.zip`
- `certificatecheck-only/Dist/certificatecheck-only-linux.zip`
- `certificatecheck-only/install-packages/certificatecheck-only-windows.zip`
- `certificatecheck-only/install-packages/certificatecheck-only-mac.zip`
- `certificatecheck-only/install-packages/certificatecheck-only-linux.zip`

---

## 17. Known Constraints / Notes

- macOS and Linux packaged binaries were built as:
  - `node18-macos-x64`
  - `node18-linux-x64`
- runtime compatibility still depends on the destination machine matching the target platform/architecture
- packaged apps still run as a local web server; they are not native desktop GUIs
- browser auto-open depends on platform browser launch support:
  - Windows: `start`
  - macOS: `open`
  - Linux: `xdg-open`

---

## 18. Recommended Next Steps

If needed later, likely next improvements would be:
- commit or tag the latest packaging changes if not yet committed after the final Windows zip addition
- optionally add code signing / notarization workflow for macOS
- optionally add a native installer format:
  - `.msi`
  - `.pkg`
  - `.deb` / `.rpm`
- optionally add auto-port detection if port `3001` is in use
- optionally add an app icon and branded launcher assets