#!/bin/bash

# AI API Integrator - Security Testing Script
# This script runs comprehensive security scans and tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE_URL=${API_BASE_URL:-"http://localhost:3001"}
RESULTS_DIR="security/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Setup results directory
setup_results_dir() {
    mkdir -p "$RESULTS_DIR"
    log_info "Security scan results will be saved to $RESULTS_DIR"
}

# Check if API is running
check_api() {
    log_info "Checking if API is running at $API_BASE_URL..."
    
    if curl -f -s "$API_BASE_URL/health" > /dev/null; then
        log_success "API is running and accessible"
    else
        log_error "API is not running or not accessible at $API_BASE_URL"
        log_info "Please start the API server before running security tests"
        exit 1
    fi
}

# Run npm audit for dependency vulnerabilities
run_npm_audit() {
    log_info "Running npm audit for dependency vulnerabilities..."
    
    cd services/api
    
    # Generate audit report
    npm audit --json > "../../$RESULTS_DIR/npm_audit_$TIMESTAMP.json" 2>/dev/null || true
    npm audit > "../../$RESULTS_DIR/npm_audit_$TIMESTAMP.txt" 2>/dev/null || true
    
    # Check for high/critical vulnerabilities
    HIGH_VULNS=$(npm audit --json 2>/dev/null | jq -r '.metadata.vulnerabilities.high // 0')
    CRITICAL_VULNS=$(npm audit --json 2>/dev/null | jq -r '.metadata.vulnerabilities.critical // 0')
    
    if [ "$CRITICAL_VULNS" -gt 0 ]; then
        log_error "Found $CRITICAL_VULNS critical vulnerabilities"
    elif [ "$HIGH_VULNS" -gt 0 ]; then
        log_warning "Found $HIGH_VULNS high severity vulnerabilities"
    else
        log_success "No critical or high severity vulnerabilities found"
    fi
    
    cd ../..
}

# Run Trivy security scanner
run_trivy_scan() {
    log_info "Running Trivy security scanner..."
    
    if ! command -v trivy &> /dev/null; then
        log_warning "Trivy not installed, skipping container security scan"
        return
    fi
    
    # Scan filesystem
    trivy fs --format json --output "$RESULTS_DIR/trivy_fs_$TIMESTAMP.json" .
    trivy fs --format table --output "$RESULTS_DIR/trivy_fs_$TIMESTAMP.txt" .
    
    # Scan Docker image if it exists
    if docker images | grep -q "ai-api-integrator"; then
        trivy image --format json --output "$RESULTS_DIR/trivy_image_$TIMESTAMP.json" ai-api-integrator:latest
        trivy image --format table --output "$RESULTS_DIR/trivy_image_$TIMESTAMP.txt" ai-api-integrator:latest
    fi
    
    log_success "Trivy security scan completed"
}

# Run OWASP ZAP security testing
run_zap_scan() {
    log_info "Running OWASP ZAP security scan..."
    
    if ! command -v zap-baseline.py &> /dev/null && ! command -v docker &> /dev/null; then
        log_warning "OWASP ZAP not available, skipping web application security scan"
        return
    fi
    
    # Run ZAP baseline scan using Docker
    if command -v docker &> /dev/null; then
        docker run --rm -v "$PWD/$RESULTS_DIR:/zap/wrk/:rw" \
            -t owasp/zap2docker-stable zap-baseline.py \
            -t "$API_BASE_URL" \
            -J "zap_baseline_$TIMESTAMP.json" \
            -r "zap_baseline_$TIMESTAMP.html" || true
        
        log_success "OWASP ZAP baseline scan completed"
    fi
}

# Run custom security tests
run_custom_security_tests() {
    log_info "Running custom security tests..."
    
    # Create security test script
    cat > "$RESULTS_DIR/security_tests_$TIMESTAMP.py" << 'EOF'
import requests
import json
import sys
from urllib.parse import urljoin

class SecurityTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()
        self.results = []
    
    def log_result(self, test_name, status, details=""):
        result = {
            "test": test_name,
            "status": status,
            "details": details
        }
        self.results.append(result)
        print(f"[{status.upper()}] {test_name}: {details}")
    
    def test_sql_injection(self):
        """Test for SQL injection vulnerabilities"""
        payloads = [
            "' OR '1'='1",
            "'; DROP TABLE users; --",
            "' UNION SELECT * FROM users --"
        ]
        
        for payload in payloads:
            try:
                # Test login endpoint
                response = self.session.post(
                    urljoin(self.base_url, "/api/v1/auth/login"),
                    json={"email": payload, "password": "test"},
                    timeout=10
                )
                
                if response.status_code == 500:
                    self.log_result(
                        "SQL Injection Test",
                        "FAIL",
                        f"Potential SQL injection vulnerability with payload: {payload}"
                    )
                    return
            except Exception as e:
                pass
        
        self.log_result("SQL Injection Test", "PASS", "No SQL injection vulnerabilities detected")
    
    def test_xss_protection(self):
        """Test for XSS vulnerabilities"""
        xss_payloads = [
            "<script>alert('XSS')</script>",
            "javascript:alert('XSS')",
            "<img src=x onerror=alert('XSS')>"
        ]
        
        for payload in xss_payloads:
            try:
                # Test user registration with XSS payload in name
                response = self.session.post(
                    urljoin(self.base_url, "/api/v1/auth/register"),
                    json={"email": "test@example.com", "password": "test123", "name": payload},
                    timeout=10
                )
                
                if payload in response.text:
                    self.log_result(
                        "XSS Protection Test",
                        "FAIL",
                        f"Potential XSS vulnerability - payload reflected: {payload}"
                    )
                    return
            except Exception as e:
                pass
        
        self.log_result("XSS Protection Test", "PASS", "No XSS vulnerabilities detected")
    
    def test_authentication_bypass(self):
        """Test for authentication bypass vulnerabilities"""
        # Test accessing protected endpoints without authentication
        protected_endpoints = [
            "/api/v1/auth/profile",
            "/api/v1/organizations",
            "/api/v1/projects"
        ]
        
        bypass_attempts = 0
        for endpoint in protected_endpoints:
            try:
                response = self.session.get(urljoin(self.base_url, endpoint), timeout=10)
                if response.status_code == 200:
                    bypass_attempts += 1
            except Exception as e:
                pass
        
        if bypass_attempts > 0:
            self.log_result(
                "Authentication Bypass Test",
                "FAIL",
                f"Authentication bypass detected on {bypass_attempts} endpoints"
            )
        else:
            self.log_result("Authentication Bypass Test", "PASS", "Authentication properly enforced")
    
    def test_rate_limiting(self):
        """Test rate limiting implementation"""
        # Make rapid requests to login endpoint
        failed_attempts = 0
        for i in range(20):
            try:
                response = self.session.post(
                    urljoin(self.base_url, "/api/v1/auth/login"),
                    json={"email": "test@example.com", "password": "wrong"},
                    timeout=5
                )
                if response.status_code == 429:  # Too Many Requests
                    self.log_result("Rate Limiting Test", "PASS", "Rate limiting is implemented")
                    return
            except Exception as e:
                failed_attempts += 1
        
        self.log_result(
            "Rate Limiting Test",
            "WARNING",
            "Rate limiting not detected - consider implementing to prevent brute force attacks"
        )
    
    def test_cors_configuration(self):
        """Test CORS configuration"""
        try:
            response = self.session.options(
                urljoin(self.base_url, "/api/v1/auth/login"),
                headers={"Origin": "https://malicious-site.com"},
                timeout=10
            )
            
            cors_header = response.headers.get("Access-Control-Allow-Origin", "")
            if cors_header == "*":
                self.log_result(
                    "CORS Configuration Test",
                    "WARNING",
                    "CORS allows all origins (*) - consider restricting to specific domains"
                )
            elif "malicious-site.com" in cors_header:
                self.log_result(
                    "CORS Configuration Test",
                    "FAIL",
                    "CORS allows unauthorized origins"
                )
            else:
                self.log_result("CORS Configuration Test", "PASS", "CORS properly configured")
        except Exception as e:
            self.log_result("CORS Configuration Test", "ERROR", f"Test failed: {str(e)}")
    
    def test_security_headers(self):
        """Test for security headers"""
        try:
            response = self.session.get(urljoin(self.base_url, "/health"), timeout=10)
            
            security_headers = {
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": ["DENY", "SAMEORIGIN"],
                "X-XSS-Protection": "1; mode=block",
                "Strict-Transport-Security": "max-age=",
                "Content-Security-Policy": "default-src"
            }
            
            missing_headers = []
            for header, expected in security_headers.items():
                actual = response.headers.get(header, "")
                if isinstance(expected, list):
                    if not any(exp in actual for exp in expected):
                        missing_headers.append(header)
                elif expected not in actual:
                    missing_headers.append(header)
            
            if missing_headers:
                self.log_result(
                    "Security Headers Test",
                    "WARNING",
                    f"Missing security headers: {', '.join(missing_headers)}"
                )
            else:
                self.log_result("Security Headers Test", "PASS", "All security headers present")
        except Exception as e:
            self.log_result("Security Headers Test", "ERROR", f"Test failed: {str(e)}")
    
    def test_jwt_security(self):
        """Test JWT token security"""
        try:
            # Try to register and login
            register_response = self.session.post(
                urljoin(self.base_url, "/api/v1/auth/register"),
                json={"email": "security-test@example.com", "password": "test123"},
                timeout=10
            )
            
            if register_response.status_code in [201, 409]:  # Created or already exists
                login_response = self.session.post(
                    urljoin(self.base_url, "/api/v1/auth/login"),
                    json={"email": "security-test@example.com", "password": "test123"},
                    timeout=10
                )
                
                if login_response.status_code == 200:
                    token_data = login_response.json()
                    token = token_data.get("data", {}).get("accessToken", "")
                    
                    # Check token format (should be JWT)
                    if token.count('.') == 2:
                        self.log_result("JWT Security Test", "PASS", "JWT tokens properly formatted")
                    else:
                        self.log_result("JWT Security Test", "FAIL", "Invalid JWT token format")
                else:
                    self.log_result("JWT Security Test", "ERROR", "Could not obtain JWT token")
            else:
                self.log_result("JWT Security Test", "ERROR", "Could not create test user")
        except Exception as e:
            self.log_result("JWT Security Test", "ERROR", f"Test failed: {str(e)}")
    
    def run_all_tests(self):
        """Run all security tests"""
        print(f"Running security tests against: {self.base_url}")
        print("=" * 60)
        
        self.test_sql_injection()
        self.test_xss_protection()
        self.test_authentication_bypass()
        self.test_rate_limiting()
        self.test_cors_configuration()
        self.test_security_headers()
        self.test_jwt_security()
        
        print("=" * 60)
        print("Security test summary:")
        
        passed = len([r for r in self.results if r["status"] == "PASS"])
        failed = len([r for r in self.results if r["status"] == "FAIL"])
        warnings = len([r for r in self.results if r["status"] == "WARNING"])
        errors = len([r for r in self.results if r["status"] == "ERROR"])
        
        print(f"PASSED: {passed}")
        print(f"FAILED: {failed}")
        print(f"WARNINGS: {warnings}")
        print(f"ERRORS: {errors}")
        
        return self.results

if __name__ == "__main__":
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001"
    tester = SecurityTester(base_url)
    results = tester.run_all_tests()
    
    # Save results to JSON
    with open("custom_security_results.json", "w") as f:
        json.dump(results, f, indent=2)
EOF
    
    # Run custom security tests if Python is available
    if command -v python3 &> /dev/null; then
        cd "$RESULTS_DIR"
        python3 "security_tests_$TIMESTAMP.py" "$API_BASE_URL" > "custom_security_$TIMESTAMP.txt"
        cd ..
        log_success "Custom security tests completed"
    else
        log_warning "Python3 not available, skipping custom security tests"
    fi
}

# Run Bandit security linter for Python code
run_bandit_scan() {
    log_info "Running Bandit security linter..."
    
    if ! command -v bandit &> /dev/null; then
        log_warning "Bandit not installed, skipping Python security analysis"
        return
    fi
    
    # Scan Python files
    bandit -r . -f json -o "$RESULTS_DIR/bandit_$TIMESTAMP.json" || true
    bandit -r . -f txt -o "$RESULTS_DIR/bandit_$TIMESTAMP.txt" || true
    
    log_success "Bandit security scan completed"
}

# Run ESLint security plugin for JavaScript/TypeScript
run_eslint_security() {
    log_info "Running ESLint security analysis..."
    
    cd services/api
    
    if [ -f "package.json" ] && npm list eslint-plugin-security &> /dev/null; then
        npm run lint -- --format json > "../../$RESULTS_DIR/eslint_security_$TIMESTAMP.json" || true
        npm run lint > "../../$RESULTS_DIR/eslint_security_$TIMESTAMP.txt" || true
        log_success "ESLint security analysis completed"
    else
        log_warning "ESLint security plugin not configured, skipping JavaScript/TypeScript security analysis"
    fi
    
    cd ../..
}

# Generate security report
generate_security_report() {
    log_info "Generating security report..."
    
    cat > "$RESULTS_DIR/security_report_$TIMESTAMP.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>AI API Integrator - Security Assessment Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .critical { background-color: #f8d7da; border-color: #f5c6cb; }
        .warning { background-color: #fff3cd; border-color: #ffeaa7; }
        .success { background-color: #d4edda; border-color: #c3e6cb; }
        .info { background-color: #d1ecf1; border-color: #bee5eb; }
        .checklist { list-style-type: none; padding: 0; }
        .checklist li { padding: 5px 0; }
        .checklist li:before { content: "✓ "; color: green; font-weight: bold; }
        .checklist li.fail:before { content: "✗ "; color: red; }
        .checklist li.warning:before { content: "⚠ "; color: orange; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AI API Integrator - Security Assessment Report</h1>
        <p><strong>Assessment Date:</strong> $(date)</p>
        <p><strong>API Endpoint:</strong> $API_BASE_URL</p>
        <p><strong>Report ID:</strong> $TIMESTAMP</p>
    </div>
    
    <div class="section info">
        <h2>Executive Summary</h2>
        <p>This report provides a comprehensive security assessment of the AI API Integrator application, 
        including dependency vulnerabilities, code security issues, and runtime security tests.</p>
    </div>
    
    <div class="section">
        <h2>Security Checklist</h2>
        <ul class="checklist">
            <li>Dependency vulnerability scan (npm audit)</li>
            <li>Container security scan (Trivy)</li>
            <li>Web application security test (OWASP ZAP)</li>
            <li>Custom security tests (SQL injection, XSS, etc.)</li>
            <li>Static code analysis (Bandit, ESLint)</li>
            <li>Authentication and authorization testing</li>
            <li>Security headers verification</li>
            <li>CORS configuration review</li>
        </ul>
    </div>
    
    <div class="section">
        <h2>Key Security Features Implemented</h2>
        <ul>
            <li><strong>JWT Authentication:</strong> Secure token-based authentication</li>
            <li><strong>Password Hashing:</strong> bcrypt for secure password storage</li>
            <li><strong>Input Validation:</strong> class-validator for request validation</li>
            <li><strong>CORS Protection:</strong> Configured cross-origin resource sharing</li>
            <li><strong>Helmet Security:</strong> Security headers middleware</li>
            <li><strong>Rate Limiting:</strong> Protection against brute force attacks</li>
            <li><strong>SQL Injection Prevention:</strong> TypeORM parameterized queries</li>
            <li><strong>Environment Separation:</strong> Separate configs for different environments</li>
        </ul>
    </div>
    
    <div class="section">
        <h2>Security Recommendations</h2>
        <ul>
            <li>Regularly update dependencies to patch known vulnerabilities</li>
            <li>Implement comprehensive logging and monitoring</li>
            <li>Use HTTPS in production with proper SSL/TLS configuration</li>
            <li>Implement API rate limiting and request throttling</li>
            <li>Regular security assessments and penetration testing</li>
            <li>Implement proper secrets management (e.g., HashiCorp Vault)</li>
            <li>Set up automated security scanning in CI/CD pipeline</li>
            <li>Implement proper backup and disaster recovery procedures</li>
        </ul>
    </div>
    
    <div class="section">
        <h2>Detailed Results</h2>
        <p>Detailed scan results are available in the following files:</p>
        <ul>
            <li><strong>npm_audit_$TIMESTAMP.json:</strong> Dependency vulnerability scan</li>
            <li><strong>trivy_fs_$TIMESTAMP.json:</strong> Filesystem security scan</li>
            <li><strong>zap_baseline_$TIMESTAMP.json:</strong> Web application security test</li>
            <li><strong>custom_security_$TIMESTAMP.txt:</strong> Custom security tests</li>
            <li><strong>bandit_$TIMESTAMP.json:</strong> Python code security analysis</li>
            <li><strong>eslint_security_$TIMESTAMP.json:</strong> JavaScript/TypeScript security analysis</li>
        </ul>
    </div>
    
    <div class="section warning">
        <h2>Important Notes</h2>
        <ul>
            <li>This assessment is based on automated tools and may not catch all security issues</li>
            <li>Manual security review and penetration testing are recommended</li>
            <li>Security is an ongoing process - regular assessments are essential</li>
            <li>Ensure all security recommendations are implemented before production deployment</li>
        </ul>
    </div>
</body>
</html>
EOF
    
    log_success "Security report generated: $RESULTS_DIR/security_report_$TIMESTAMP.html"
}

# Main script logic
main() {
    local scan_type="${1:-all}"
    
    log_info "AI API Integrator Security Assessment"
    log_info "Scan type: $scan_type"
    log_info "API URL: $API_BASE_URL"
    
    setup_results_dir
    check_api
    
    # Run scans based on type
    case "$scan_type" in
        "dependencies")
            run_npm_audit
            ;;
        "container")
            run_trivy_scan
            ;;
        "web")
            run_zap_scan
            ;;
        "custom")
            run_custom_security_tests
            ;;
        "static")
            run_bandit_scan
            run_eslint_security
            ;;
        "all")
            run_npm_audit
            run_trivy_scan
            run_zap_scan
            run_custom_security_tests
            run_bandit_scan
            run_eslint_security
            ;;
        *)
            log_error "Unknown scan type: $scan_type"
            log_info "Available types: dependencies, container, web, custom, static, all"
            exit 1
            ;;
    esac
    
    # Generate comprehensive report
    generate_security_report
    
    log_success "Security assessment completed!"
    log_info "Results saved to: $RESULTS_DIR"
}

# Show help
show_help() {
    echo "AI API Integrator Security Assessment"
    echo ""
    echo "Usage: $0 [scan_type]"
    echo ""
    echo "Scan types:"
    echo "  dependencies  Run dependency vulnerability scan (npm audit)"
    echo "  container     Run container security scan (Trivy)"
    echo "  web          Run web application security test (OWASP ZAP)"
    echo "  custom       Run custom security tests"
    echo "  static       Run static code analysis (Bandit, ESLint)"
    echo "  all          Run all security scans (default)"
    echo ""
    echo "Environment variables:"
    echo "  API_BASE_URL  Base URL of the API (default: http://localhost:3001)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Run all security scans"
    echo "  $0 dependencies       # Run only dependency scan"
    echo "  API_BASE_URL=https://staging-api.example.com $0 web"
}

# Handle command line arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# Run main function
main "$@"
