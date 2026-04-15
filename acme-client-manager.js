const acme = require('acme-client');
const fs = require('fs');
const path = require('path');

class AcmeClientManager {
    constructor(configPath = './acme-config.json') {
        this.configPath = configPath;
        this.config = this.loadConfig();
        this.client = null;
        this.accountKey = null;
    }

    // Load ACME configuration
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                return JSON.parse(data);
            }
            return this.getDefaultConfig();
        } catch (error) {
            console.error('Error loading ACME config:', error);
            return this.getDefaultConfig();
        }
    }

    // Get default configuration
    getDefaultConfig() {
        return {
            email: '',
            domain: '',
            acmeDirectoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory',
            challengeType: 'http-01',
            accountKeyPath: './acme-account-key.pem',
            certificatePath: './acme-certificate.pem',
            privateKeyPath: './acme-private-key.pem',
            checkIntervalMinutes: 3
        };
    }

    // Save configuration
    saveConfig(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('ACME configuration saved');
            return true;
        } catch (error) {
            console.error('Error saving ACME config:', error);
            return false;
        }
    }

    // Initialize ACME client
    async initializeClient() {
        try {
            // Load or create account key
            if (fs.existsSync(this.config.accountKeyPath)) {
                this.accountKey = fs.readFileSync(this.config.accountKeyPath);
                console.log('Loaded existing ACME account key');
            } else {
                this.accountKey = await acme.crypto.createPrivateKey();
                fs.writeFileSync(this.config.accountKeyPath, this.accountKey);
                console.log('Created new ACME account key');
            }

            // Create ACME client
            this.client = new acme.Client({
                directoryUrl: this.config.acmeDirectoryUrl,
                accountKey: this.accountKey
            });

            console.log('ACME client initialized');
            return true;
        } catch (error) {
            console.error('Error initializing ACME client:', error);
            throw error;
        }
    }

    // Test ACME configuration
    async testConfiguration() {
        try {
            if (!this.config.email || !this.config.domain) {
                throw new Error('Email and domain are required');
            }

            await this.initializeClient();
            
            // Try to get directory
            const directory = await this.client.getDirectory();
            console.log('ACME directory accessible:', directory);

            return {
                success: true,
                message: 'ACME server is accessible and configuration is valid'
            };
        } catch (error) {
            console.error('ACME configuration test failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Create or get ACME account
    async createAccount() {
        try {
            await this.initializeClient();

            const account = await this.client.createAccount({
                termsOfServiceAgreed: true,
                contact: [`mailto:${this.config.email}`]
            });

            console.log('ACME account created/retrieved:', account);
            return account;
        } catch (error) {
            console.error('Error creating ACME account:', error);
            throw error;
        }
    }

    // Obtain certificate
    async obtainCertificate() {
        try {
            console.log('Starting certificate obtainment process...');

            if (!this.config.email || !this.config.domain) {
                throw new Error('Email and domain must be configured');
            }

            await this.initializeClient();

            // Create account if needed
            await this.createAccount();

            // Create private key for certificate
            const [certificateKey, certificateRequest] = await acme.crypto.createCsr({
                commonName: this.config.domain
            });

            // Save private key
            fs.writeFileSync(this.config.privateKeyPath, certificateKey);
            console.log('Certificate private key saved');

            // Create order
            const order = await this.client.createOrder({
                identifiers: [
                    { type: 'dns', value: this.config.domain }
                ]
            });

            console.log('Order created:', order);

            // Get authorizations
            const authorizations = await this.client.getAuthorizations(order);

            // Complete challenges
            for (const authz of authorizations) {
                const challenge = authz.challenges.find(c => c.type === this.config.challengeType);
                
                if (!challenge) {
                    throw new Error(`Challenge type ${this.config.challengeType} not available`);
                }

                const keyAuthorization = await this.client.getChallengeKeyAuthorization(challenge);

                console.log(`Challenge for ${authz.identifier.value}:`);
                console.log(`Type: ${challenge.type}`);
                console.log(`Token: ${challenge.token}`);
                console.log(`Key Authorization: ${keyAuthorization}`);

                if (this.config.challengeType === 'http-01') {
                    // For HTTP-01, create the challenge file
                    const challengePath = path.join(__dirname, 'public', '.well-known', 'acme-challenge');
                    fs.mkdirSync(challengePath, { recursive: true });
                    fs.writeFileSync(
                        path.join(challengePath, challenge.token),
                        keyAuthorization
                    );
                    console.log('HTTP-01 challenge file created');
                }

                // Verify challenge is ready
                await this.client.verifyChallenge(authz, challenge);

                // Complete challenge
                await this.client.completeChallenge(challenge);
                console.log('Challenge completed');

                // Wait for validation
                await this.client.waitForValidStatus(challenge);
                console.log('Challenge validated');
            }

            // Finalize order
            await this.client.finalizeOrder(order, certificateRequest);
            console.log('Order finalized');

            // Get certificate
            const certificate = await this.client.getCertificate(order);
            
            // Save certificate
            fs.writeFileSync(this.config.certificatePath, certificate);
            console.log('Certificate saved to:', this.config.certificatePath);

            return {
                success: true,
                certificate: certificate,
                privateKey: certificateKey
            };
        } catch (error) {
            console.error('Error obtaining certificate:', error);
            throw error;
        }
    }

    // Check if certificate exists and is valid
    certificateExists() {
        return fs.existsSync(this.config.certificatePath) && 
               fs.existsSync(this.config.privateKeyPath);
    }

    // Get certificate info
    getCertificateInfo() {
        try {
            if (!this.certificateExists()) {
                return null;
            }

            const certPem = fs.readFileSync(this.config.certificatePath, 'utf8');
            const cert = acme.crypto.readCertificateInfo(certPem);
            
            return {
                domains: cert.domains,
                notBefore: cert.notBefore,
                notAfter: cert.notAfter,
                issuer: cert.issuer,
                daysRemaining: Math.floor((new Date(cert.notAfter) - new Date()) / (1000 * 60 * 60 * 24))
            };
        } catch (error) {
            console.error('Error reading certificate info:', error);
            return null;
        }
    }

    // Check if certificate needs renewal (less than 30 days remaining)
    needsRenewal() {
        const certInfo = this.getCertificateInfo();
        if (!certInfo) return true;
        
        return certInfo.daysRemaining < 30;
    }

    // Get status
    getStatus() {
        const certInfo = this.getCertificateInfo();
        
        return {
            accountConfigured: this.config.email && this.config.domain,
            certificateObtained: this.certificateExists(),
            certificateInfo: certInfo,
            needsRenewal: this.needsRenewal(),
            lastCheck: new Date().toISOString()
        };
    }
}

module.exports = AcmeClientManager;

// Made with Bob
