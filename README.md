# SSL/TLS Certificate Monitor

A simple web application that monitors SSL/TLS certificates for a configured domain and tracks certificate changes over time. The application displays current and previous certificates side-by-side for easy comparison.

## Features

- 🔒 **Certificate Monitoring**: Fetches and displays detailed SSL/TLS certificate information
- 📊 **Side-by-Side Comparison**: Shows current and previous certificates for easy comparison
- 💾 **Automatic Storage**: Saves certificate history to track changes over time
- 🔄 **Manual & Automatic Checks**: Check certificates on-demand or automatically at intervals
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile devices
- ⚡ **Real-time Updates**: Instant feedback when certificates change

## Certificate Details Displayed

- Subject information (Common Name, Organization, etc.)
- Issuer details
- Validity period (Valid From/To dates)
- Validity status with expiration warnings
- Serial number
- Fingerprints (SHA-1 and SHA-256)
- Subject Alternative Names (SANs)
- Key size
- Fetch timestamp

## Prerequisites

- Node.js (version 14.0.0 or higher)
- npm (comes with Node.js)

## Installation

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure the target URL**
   
   Edit `config.json` to set the domain you want to monitor:
   ```json
   {
     "targetUrl": "https://www.example.com",
     "port": 3000,
     "checkIntervalMinutes": 60
   }
   ```

   Configuration options:
   - `targetUrl`: The HTTPS URL to monitor (required)
   - `port`: Port for the web server (default: 3000)
   - `checkIntervalMinutes`: Automatic check interval in minutes (0 to disable)

## Usage

1. **Start the application**
   ```bash
   npm start
   ```

2. **Open your browser**
   
   Navigate to: `http://localhost:3000`

3. **Check certificates**
   
   - The page will automatically load any previously stored certificates
   - Click "Check Certificate Now" to fetch the current certificate
   - If the certificate has changed, both versions will be displayed side-by-side

## How It Works

### Architecture

```
┌─────────────┐      HTTP      ┌──────────────┐     TLS/SSL    ┌──────────────┐
│   Browser   │ ◄────────────► │ Express      │ ◄────────────► │ Target       │
│  (Frontend) │                │ Server       │                │ Domain       │
└─────────────┘                └──────────────┘                └──────────────┘
                                      │
                                      │ Read/Write
                                      ▼
                               ┌──────────────┐
                               │certificates  │
                               │   .json      │
                               └──────────────┘
```

### Certificate Change Detection

The application compares certificates using:
- Serial number
- SHA-256 fingerprint
- Validity dates

When any of these change, the new certificate is saved and displayed alongside the previous one.

### Data Storage

Certificates are stored in `certificates.json` with the following structure:
```json
{
  "certificates": [
    {
      "subject": { ... },
      "issuer": { ... },
      "validFrom": "...",
      "validTo": "...",
      "serialNumber": "...",
      "fingerprint": "...",
      "fingerprint256": "...",
      "fetchedAt": "..."
    }
  ]
}
```

Only the two most recent certificates are kept (current and previous).

## API Endpoints

### GET `/api/certificates`
Returns all stored certificates.

**Response:**
```json
{
  "success": true,
  "certificates": [...],
  "targetUrl": "https://www.example.com"
}
```

### POST `/api/check-certificate`
Fetches the current certificate and compares it with stored certificates.

**Response:**
```json
{
  "success": true,
  "changed": true,
  "message": "New certificate detected and saved",
  "certificate": {...},
  "certificates": [...]
}
```

### GET `/api/config`
Returns the current configuration.

**Response:**
```json
{
  "targetUrl": "https://www.example.com",
  "checkIntervalMinutes": 60
}
```

## Automatic Certificate Checking

If `checkIntervalMinutes` is set to a value greater than 0 in `config.json`, the application will automatically check the certificate at the specified interval. Changes are logged to the console and saved to the certificates file.

To disable automatic checking, set `checkIntervalMinutes` to 0.

## File Structure

```
certificate-monitor/
├── server.js              # Express server and API endpoints
├── package.json           # Node.js dependencies
├── config.json            # Configuration file
├── certificates.json      # Certificate storage (auto-generated)
├── public/
│   ├── index.html        # Frontend HTML
│   ├── styles.css        # Styling
│   └── app.js            # Frontend JavaScript
└── README.md             # This file
```

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, change the `port` value in `config.json`.

### Certificate Fetch Errors
- Ensure the target URL is accessible from your server
- Check that the URL uses HTTPS (not HTTP)
- Verify the domain has a valid SSL/TLS certificate
- Check your network/firewall settings

### No Certificates Displayed
- Click "Check Certificate Now" to fetch the first certificate
- Check the browser console for errors
- Verify the server is running and accessible

## Security Notes

- The application accepts self-signed certificates (`rejectUnauthorized: false`)
- This is intentional to allow monitoring of development/staging environments
- For production use, consider adding certificate validation options

## Development

To modify the application:

1. **Backend changes**: Edit `server.js`
2. **Frontend changes**: Edit files in the `public/` directory
3. **Styling**: Modify `public/styles.css`
4. **Configuration**: Update `config.json`

Restart the server after making changes to `server.js` or `config.json`.

## License

MIT License - Feel free to use and modify as needed.

## Support

For issues or questions, please check:
- Server console logs for backend errors
- Browser console for frontend errors
- Ensure all dependencies are installed (`npm install`)
- Verify Node.js version is 14.0.0 or higher

## Future Enhancements

Possible improvements:
- Email notifications on certificate changes
- Support for multiple domains
- Certificate expiration alerts
- Export certificate history
- Certificate chain visualization
- Webhook notifications