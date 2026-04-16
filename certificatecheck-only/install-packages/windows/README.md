# Certificate Check Only

Certificate Check Only is a small local demonstration app that starts a web server, opens your browser automatically, and lets you compare the current and previous TLS certificate from the same HTTPS host side by side.

## What this app does

- Starts a local web app on `http://localhost:3001`
- Opens your default browser automatically
- Lets you enter an HTTPS URL such as `https://example.com`
- Fetches the current TLS certificate from that host
- Stores the latest two certificate snapshots
- Shows the current and previous certificate side by side
- Highlights changed fields with a red `*`

## What this app does not do

- It does not install certificates
- It does not modify nginx, Vault, Docker, or your operating system
- It does not need internet access except to reach the HTTPS host you want to inspect

## Quick start

### Windows
Run:

- `certificatecheck-only.exe`

The app will:
1. start the local server
2. open your browser automatically
3. open the UI at `http://localhost:3001`

### macOS
1. unzip `certificatecheck-only-mac.zip`
2. open Terminal in the extracted folder
3. run:

- `./start-certificatecheck-only.sh`

### Linux
1. unzip `certificatecheck-only-linux.zip`
2. open a terminal in the extracted folder
3. run:

- `./start-certificatecheck-only.sh`

## First use

1. Wait for the browser to open automatically
2. Enter the target HTTPS URL
3. Click **Update URL**
4. Click **Check Certificate**
5. Change the target certificate on the remote system if needed
6. Click **Check Certificate** again
7. Review the side-by-side comparison

## Files created during use

The application writes runtime data into the `data/` folder:

- `data/config.json`
- `data/certificates.json`

These files store:
- the last configured target URL
- the current and previous certificate snapshots

## Browser auto-open behavior

By default, the app tries to open your default browser automatically after startup.

If you do **not** want that behavior, you can disable it before launch:

### macOS / Linux
- `AUTO_OPEN_BROWSER=false ./start-certificatecheck-only.sh`

### Windows
Run from Command Prompt:
- `set AUTO_OPEN_BROWSER=false && certificatecheck-only.exe`

## Ports

The app uses:

- `http://localhost:3001`

Make sure local port `3001` is available.

## Troubleshooting

### Browser did not open automatically
Open your browser manually and go to:

- `http://localhost:3001`

### Port 3001 is already in use
Stop the other program using port `3001`, then start this app again.

### The certificate check fails
Check that:
- the URL starts with `https://`
- the remote host is reachable
- the remote host presents a TLS certificate on the selected port

### Linux browser does not open automatically
Some Linux environments require `xdg-open` to be available.  
If the browser does not open, start it manually and browse to:

- `http://localhost:3001`

## Distribution contents

The distribution packages include:
- the standalone app executable for the target platform
- the `public/` UI assets if required by packaging/runtime
- the `README.md`
- a startup shell script for macOS and Linux packages

## Demo recommendation

For demonstrations:
1. start the app
2. show the target URL field
3. run one initial certificate check
4. change the remote certificate
5. run the check again
6. show the side-by-side comparison and changed markers

## Security note

This tool is intended for demonstration and inspection use. It connects to the target TLS endpoint and reads certificate metadata, but it does not verify trust chains for administration purposes and does not make system changes.