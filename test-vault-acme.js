const https = require('https');
const http = require('http');

// Test Vault ACME endpoint directly
async function testVaultAcme() {
    const directoryUrl = 'http://vault:8200/v1/pki/roles/localhost/acme/directory';
    
    console.log('Testing Vault ACME endpoint:', directoryUrl);
    
    return new Promise((resolve, reject) => {
        http.get(directoryUrl, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log('Status Code:', res.statusCode);
                console.log('Headers:', JSON.stringify(res.headers, null, 2));
                console.log('Body:', data);
                
                if (res.statusCode === 200) {
                    const directory = JSON.parse(data);
                    console.log('\n✅ Directory endpoint accessible');
                    console.log('New Nonce URL:', directory.newNonce);
                    
                    // Now try to get a nonce
                    testGetNonce(directory.newNonce);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

function testGetNonce(nonceUrl) {
    console.log('\n--- Testing nonce endpoint with HEAD ---');
    console.log('Nonce URL:', nonceUrl);
    
    const url = new URL(nonceUrl);
    const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'HEAD'
    };
    
    const req = http.request(options, (res) => {
        console.log('Status Code:', res.statusCode);
        console.log('Headers:', JSON.stringify(res.headers, null, 2));
        
        const nonce = res.headers['replay-nonce'];
        if (nonce) {
            console.log('\n✅ Nonce received:', nonce);
        } else {
            console.log('\n❌ No Replay-Nonce header found with HEAD');
            console.log('\n--- Trying GET request instead ---');
            testGetNonceWithGet(nonceUrl);
        }
    });
    
    req.on('error', (error) => {
        console.error('Error getting nonce:', error);
    });
    
    req.end();
}

function testGetNonceWithGet(nonceUrl) {
    const url = new URL(nonceUrl);
    const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET'
    };
    
    const req = http.request(options, (res) => {
        console.log('Status Code:', res.statusCode);
        console.log('Headers:', JSON.stringify(res.headers, null, 2));
        
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log('Body:', body);
            
            const nonce = res.headers['replay-nonce'];
            if (nonce) {
                console.log('\n✅ Nonce received with GET:', nonce);
            } else {
                console.log('\n❌ No Replay-Nonce header found with GET either');
                console.log('\n🔍 This is a Vault ACME implementation issue.');
                console.log('Vault is not returning the required Replay-Nonce header.');
            }
        });
    });
    
    req.on('error', (error) => {
        console.error('Error getting nonce:', error);
    });
    
    req.end();
}

testVaultAcme().catch(console.error);

// Made with Bob
