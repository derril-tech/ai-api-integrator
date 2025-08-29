#!/bin/bash

# AI API Integrator - Performance Testing Script
# This script runs various performance tests using k6

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE_URL=${API_BASE_URL:-"http://localhost:3001"}
RESULTS_DIR="performance/results"
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

# Check if k6 is installed
check_k6() {
    if ! command -v k6 &> /dev/null; then
        log_error "k6 is not installed. Please install k6 from https://k6.io/docs/getting-started/installation/"
        exit 1
    fi
    
    log_info "k6 version: $(k6 version)"
}

# Check if API is running
check_api() {
    log_info "Checking if API is running at $API_BASE_URL..."
    
    if curl -f -s "$API_BASE_URL/health" > /dev/null; then
        log_success "API is running and healthy"
    else
        log_error "API is not running or not healthy at $API_BASE_URL"
        log_info "Please start the API server before running performance tests"
        exit 1
    fi
}

# Setup results directory
setup_results_dir() {
    mkdir -p "$RESULTS_DIR"
    log_info "Results will be saved to $RESULTS_DIR"
}

# Run smoke test
run_smoke_test() {
    log_info "Running smoke test (1 user, 1 minute)..."
    
    k6 run \
        --env API_BASE_URL="$API_BASE_URL" \
        --out json="$RESULTS_DIR/smoke_test_$TIMESTAMP.json" \
        --out influxdb=http://localhost:8086/k6 \
        --tag testType=smoke \
        --tag timestamp="$TIMESTAMP" \
        --scenario smoke \
        performance/k6/load-test.js
    
    if [ $? -eq 0 ]; then
        log_success "Smoke test completed successfully"
    else
        log_error "Smoke test failed"
        return 1
    fi
}

# Run load test
run_load_test() {
    log_info "Running load test (10 users, 10 minutes)..."
    
    k6 run \
        --env API_BASE_URL="$API_BASE_URL" \
        --out json="$RESULTS_DIR/load_test_$TIMESTAMP.json" \
        --out influxdb=http://localhost:8086/k6 \
        --tag testType=load \
        --tag timestamp="$TIMESTAMP" \
        --scenario load \
        performance/k6/load-test.js
    
    if [ $? -eq 0 ]; then
        log_success "Load test completed successfully"
    else
        log_error "Load test failed"
        return 1
    fi
}

# Run stress test
run_stress_test() {
    log_info "Running stress test (up to 200 users)..."
    
    k6 run \
        --env API_BASE_URL="$API_BASE_URL" \
        --out json="$RESULTS_DIR/stress_test_$TIMESTAMP.json" \
        --out influxdb=http://localhost:8086/k6 \
        --tag testType=stress \
        --tag timestamp="$TIMESTAMP" \
        --scenario stress \
        performance/k6/load-test.js
    
    if [ $? -eq 0 ]; then
        log_success "Stress test completed successfully"
    else
        log_warning "Stress test completed with issues (this is expected)"
    fi
}

# Run spike test
run_spike_test() {
    log_info "Running spike test (sudden load spikes)..."
    
    k6 run \
        --env API_BASE_URL="$API_BASE_URL" \
        --out json="$RESULTS_DIR/spike_test_$TIMESTAMP.json" \
        --out influxdb=http://localhost:8086/k6 \
        --tag testType=spike \
        --tag timestamp="$TIMESTAMP" \
        --scenario spike \
        performance/k6/load-test.js
    
    if [ $? -eq 0 ]; then
        log_success "Spike test completed successfully"
    else
        log_warning "Spike test completed with issues (this is expected)"
    fi
}

# Generate performance report
generate_report() {
    log_info "Generating performance report..."
    
    # Create HTML report
    cat > "$RESULTS_DIR/performance_report_$TIMESTAMP.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>AI API Integrator - Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 20px; border-radius: 5px; }
        .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .success { background-color: #d4edda; border-color: #c3e6cb; }
        .warning { background-color: #fff3cd; border-color: #ffeaa7; }
        .error { background-color: #f8d7da; border-color: #f5c6cb; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
        .metric { background-color: #f8f9fa; padding: 10px; border-radius: 3px; }
        .metric-value { font-size: 1.5em; font-weight: bold; color: #007bff; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AI API Integrator - Performance Test Report</h1>
        <p><strong>Timestamp:</strong> $TIMESTAMP</p>
        <p><strong>API URL:</strong> $API_BASE_URL</p>
        <p><strong>Test Duration:</strong> $(date)</p>
    </div>
    
    <div class="test-section">
        <h2>Test Summary</h2>
        <p>Performance tests executed to validate system behavior under various load conditions.</p>
        <ul>
            <li><strong>Smoke Test:</strong> Validates basic functionality with minimal load</li>
            <li><strong>Load Test:</strong> Tests normal expected load conditions</li>
            <li><strong>Stress Test:</strong> Tests system behavior beyond normal capacity</li>
            <li><strong>Spike Test:</strong> Tests system response to sudden load increases</li>
        </ul>
    </div>
    
    <div class="test-section">
        <h2>Key Performance Indicators</h2>
        <div class="metrics">
            <div class="metric">
                <div>Response Time (95th percentile)</div>
                <div class="metric-value">< 2000ms</div>
            </div>
            <div class="metric">
                <div>Error Rate</div>
                <div class="metric-value">< 5%</div>
            </div>
            <div class="metric">
                <div>Throughput</div>
                <div class="metric-value">Variable</div>
            </div>
            <div class="metric">
                <div>Availability</div>
                <div class="metric-value">> 99%</div>
            </div>
        </div>
    </div>
    
    <div class="test-section">
        <h2>Recommendations</h2>
        <ul>
            <li>Monitor response times during peak usage</li>
            <li>Implement caching for frequently accessed data</li>
            <li>Consider horizontal scaling for high-load scenarios</li>
            <li>Set up alerts for error rate thresholds</li>
            <li>Regular performance testing in CI/CD pipeline</li>
        </ul>
    </div>
    
    <div class="test-section">
        <h2>Raw Results</h2>
        <p>Detailed results are available in JSON format:</p>
        <ul>
            <li>Smoke Test: <code>smoke_test_$TIMESTAMP.json</code></li>
            <li>Load Test: <code>load_test_$TIMESTAMP.json</code></li>
            <li>Stress Test: <code>stress_test_$TIMESTAMP.json</code></li>
            <li>Spike Test: <code>spike_test_$TIMESTAMP.json</code></li>
        </ul>
    </div>
</body>
</html>
EOF
    
    log_success "Performance report generated: $RESULTS_DIR/performance_report_$TIMESTAMP.html"
}

# Analyze results
analyze_results() {
    log_info "Analyzing performance test results..."
    
    # Create a simple analysis script
    cat > "$RESULTS_DIR/analyze_results.py" << 'EOF'
import json
import sys
import glob
from datetime import datetime

def analyze_k6_results(file_path):
    """Analyze k6 JSON results file"""
    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()
        
        # Parse k6 JSON output (one JSON object per line)
        metrics = {}
        for line in lines:
            try:
                data = json.loads(line.strip())
                if data.get('type') == 'Point':
                    metric_name = data.get('metric')
                    value = data.get('data', {}).get('value', 0)
                    
                    if metric_name not in metrics:
                        metrics[metric_name] = []
                    metrics[metric_name].append(value)
            except json.JSONDecodeError:
                continue
        
        # Calculate summary statistics
        summary = {}
        for metric, values in metrics.items():
            if values:
                summary[metric] = {
                    'count': len(values),
                    'min': min(values),
                    'max': max(values),
                    'avg': sum(values) / len(values),
                }
        
        return summary
    except Exception as e:
        print(f"Error analyzing {file_path}: {e}")
        return {}

def main():
    results_dir = sys.argv[1] if len(sys.argv) > 1 else 'performance/results'
    
    print("=== Performance Test Analysis ===\n")
    
    # Find all result files
    json_files = glob.glob(f"{results_dir}/*_test_*.json")
    
    for file_path in json_files:
        test_type = file_path.split('/')[-1].split('_test_')[0]
        print(f"## {test_type.upper()} TEST RESULTS")
        
        summary = analyze_k6_results(file_path)
        
        if summary:
            # Key metrics to highlight
            key_metrics = ['http_req_duration', 'http_req_failed', 'http_reqs']
            
            for metric in key_metrics:
                if metric in summary:
                    stats = summary[metric]
                    print(f"  {metric}:")
                    print(f"    Count: {stats['count']}")
                    print(f"    Min: {stats['min']:.2f}")
                    print(f"    Max: {stats['max']:.2f}")
                    print(f"    Avg: {stats['avg']:.2f}")
        else:
            print("  No data available")
        
        print()

if __name__ == "__main__":
    main()
EOF
    
    # Run analysis if Python is available
    if command -v python3 &> /dev/null; then
        python3 "$RESULTS_DIR/analyze_results.py" "$RESULTS_DIR"
    else
        log_warning "Python3 not available, skipping detailed analysis"
    fi
}

# Main script logic
main() {
    local test_type="${1:-all}"
    
    log_info "AI API Integrator Performance Testing"
    log_info "Test type: $test_type"
    log_info "API URL: $API_BASE_URL"
    
    # Check prerequisites
    check_k6
    check_api
    setup_results_dir
    
    # Run tests based on type
    case "$test_type" in
        "smoke")
            run_smoke_test
            ;;
        "load")
            run_load_test
            ;;
        "stress")
            run_stress_test
            ;;
        "spike")
            run_spike_test
            ;;
        "all")
            run_smoke_test
            run_load_test
            run_stress_test
            run_spike_test
            ;;
        *)
            log_error "Unknown test type: $test_type"
            log_info "Available types: smoke, load, stress, spike, all"
            exit 1
            ;;
    esac
    
    # Generate report and analysis
    generate_report
    analyze_results
    
    log_success "Performance testing completed!"
    log_info "Results saved to: $RESULTS_DIR"
}

# Show help
show_help() {
    echo "AI API Integrator Performance Testing"
    echo ""
    echo "Usage: $0 [test_type]"
    echo ""
    echo "Test types:"
    echo "  smoke    Run smoke test (1 user, 1 minute)"
    echo "  load     Run load test (10 users, 10 minutes)"
    echo "  stress   Run stress test (up to 200 users)"
    echo "  spike    Run spike test (sudden load increases)"
    echo "  all      Run all tests (default)"
    echo ""
    echo "Environment variables:"
    echo "  API_BASE_URL    Base URL of the API (default: http://localhost:3001)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Run all tests"
    echo "  $0 smoke              # Run only smoke test"
    echo "  API_BASE_URL=https://staging-api.example.com $0 load"
}

# Handle command line arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# Run main function
main "$@"
