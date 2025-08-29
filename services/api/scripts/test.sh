#!/bin/bash

# AI API Integrator - Test Runner Script
# This script runs different types of tests with proper setup and cleanup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_DB_NAME="ai_api_integrator_test_$(date +%s)"
DOCKER_COMPOSE_FILE="docker-compose.test.yml"

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

# Check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Setup test environment
setup_test_env() {
    log_info "Setting up test environment..."
    
    # Create test database
    log_info "Creating test database: $TEST_DB_NAME"
    docker exec postgres-test createdb -U postgres "$TEST_DB_NAME" 2>/dev/null || true
    
    # Set environment variables
    export NODE_ENV=test
    export DATABASE_NAME="$TEST_DB_NAME"
    export LOG_LEVEL=error
    
    log_success "Test environment setup complete"
}

# Cleanup test environment
cleanup_test_env() {
    log_info "Cleaning up test environment..."
    
    # Drop test database
    if [ -n "$TEST_DB_NAME" ]; then
        log_info "Dropping test database: $TEST_DB_NAME"
        docker exec postgres-test dropdb -U postgres "$TEST_DB_NAME" 2>/dev/null || true
    fi
    
    log_success "Test environment cleanup complete"
}

# Start test services
start_test_services() {
    log_info "Starting test services..."
    
    # Check if docker-compose.test.yml exists
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        log_warning "docker-compose.test.yml not found, using default docker-compose.yml"
        DOCKER_COMPOSE_FILE="docker-compose.yml"
    fi
    
    # Start services
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres redis
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 5
    
    # Check PostgreSQL
    until docker exec postgres-test pg_isready -U postgres >/dev/null 2>&1; do
        log_info "Waiting for PostgreSQL..."
        sleep 2
    done
    
    # Check Redis
    until docker exec redis-test redis-cli ping >/dev/null 2>&1; do
        log_info "Waiting for Redis..."
        sleep 2
    done
    
    log_success "Test services are ready"
}

# Stop test services
stop_test_services() {
    log_info "Stopping test services..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down -v
    log_success "Test services stopped"
}

# Run unit tests
run_unit_tests() {
    log_info "Running unit tests..."
    npm run test:unit
    log_success "Unit tests completed"
}

# Run integration tests
run_integration_tests() {
    log_info "Running integration tests..."
    npm run test:integration
    log_success "Integration tests completed"
}

# Run E2E tests
run_e2e_tests() {
    log_info "Running E2E tests..."
    npm run test:e2e
    log_success "E2E tests completed"
}

# Run golden tests
run_golden_tests() {
    log_info "Running golden tests..."
    npm run test:golden
    log_success "Golden tests completed"
}

# Run all tests
run_all_tests() {
    log_info "Running all tests..."
    
    run_unit_tests
    run_integration_tests
    run_e2e_tests
    run_golden_tests
    
    log_success "All tests completed successfully!"
}

# Generate coverage report
generate_coverage() {
    log_info "Generating coverage report..."
    npm run test:coverage
    log_success "Coverage report generated"
}

# Main script logic
main() {
    local test_type="${1:-all}"
    
    log_info "AI API Integrator Test Runner"
    log_info "Test type: $test_type"
    
    # Trap to ensure cleanup on exit
    trap cleanup_test_env EXIT
    
    # Check prerequisites
    check_docker
    
    # Setup
    start_test_services
    setup_test_env
    
    # Run tests based on type
    case "$test_type" in
        "unit")
            run_unit_tests
            ;;
        "integration")
            run_integration_tests
            ;;
        "e2e")
            run_e2e_tests
            ;;
        "golden")
            run_golden_tests
            ;;
        "coverage")
            generate_coverage
            ;;
        "all")
            run_all_tests
            ;;
        *)
            log_error "Unknown test type: $test_type"
            log_info "Available types: unit, integration, e2e, golden, coverage, all"
            exit 1
            ;;
    esac
    
    log_success "Test run completed successfully!"
}

# Show help
show_help() {
    echo "AI API Integrator Test Runner"
    echo ""
    echo "Usage: $0 [test_type]"
    echo ""
    echo "Test types:"
    echo "  unit         Run unit tests only"
    echo "  integration  Run integration tests only"
    echo "  e2e          Run end-to-end tests only"
    echo "  golden       Run golden tests only"
    echo "  coverage     Generate coverage report"
    echo "  all          Run all tests (default)"
    echo ""
    echo "Examples:"
    echo "  $0           # Run all tests"
    echo "  $0 unit      # Run only unit tests"
    echo "  $0 coverage  # Generate coverage report"
}

# Handle command line arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# Run main function
main "$@"
