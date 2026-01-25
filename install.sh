#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Config
INSTALL_DIR="${VIBEMANAGER_DIR:-$HOME/.vibemanager}"
SERVICE_NAME="vibemanager"
PORT="${VIBEMANAGER_PORT:-3131}"
CODE_PORT="${VIBEMANAGER_CODE_PORT:-8083}"
REPO_URL="https://github.com/claraverse-space/VibeManager"

print_banner() {
    echo -e "${CYAN}"
    echo '  _    _____ __          __  ___'
    echo ' | |  / /  _/ /_  ___   /  |/  /___ _____  ____ _____ ____  _____'
    echo ' | | / // // __ \/ _ \ / /|_/ / __ `/ __ \/ __ `/ __ `/ _ \/ ___/'
    echo ' | |/ // // /_/ /  __// /  / / /_/ / / / / /_/ / /_/ /  __/ /'
    echo ' |___/___/_.___/\___//_/  /_/\__,_/_/ /_/\__,_/\__, /\___/_/'
    echo '                                              /____/'
    echo -e "${NC}"
    echo -e "${BOLD}AI Coding Session Manager${NC}"
    echo ""
}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

detect_os() {
    OS="unknown"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if grep -qi microsoft /proc/version 2>/dev/null; then
            OS="wsl"
        else
            OS="linux"
        fi
    fi
    echo $OS
}

detect_arch() {
    ARCH=$(uname -m)
    case $ARCH in
        x86_64) echo "amd64" ;;
        aarch64|arm64) echo "arm64" ;;
        armv7l) echo "armv7" ;;
        *) echo "unknown" ;;
    esac
}

check_command() {
    command -v "$1" &> /dev/null
}

install_node() {
    log_info "Installing Node.js..."

    if check_command node; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            log_success "Node.js v$(node -v) already installed"
            return 0
        fi
    fi

    OS=$(detect_os)
    case $OS in
        macos)
            if check_command brew; then
                brew install node
            else
                log_error "Please install Homebrew first: https://brew.sh"
                exit 1
            fi
            ;;
        linux|wsl)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
    esac
    log_success "Node.js installed"
}

install_docker() {
    log_info "Checking Docker..."

    if check_command docker; then
        log_success "Docker already installed"
        return 0
    fi

    OS=$(detect_os)
    case $OS in
        macos)
            log_error "Please install Docker Desktop for Mac: https://docs.docker.com/desktop/mac/install/"
            exit 1
            ;;
        linux|wsl)
            curl -fsSL https://get.docker.com | sudo sh
            sudo usermod -aG docker $USER
            log_warn "You may need to log out and back in for Docker permissions to take effect"
            ;;
    esac
    log_success "Docker installed"
}

install_dependencies() {
    log_info "Installing system dependencies..."

    OS=$(detect_os)
    case $OS in
        macos)
            brew install tmux git curl
            ;;
        linux|wsl)
            sudo apt-get update
            sudo apt-get install -y tmux git curl build-essential
            ;;
    esac
    log_success "Dependencies installed"
}

clone_or_update_repo() {
    if [ -d "$INSTALL_DIR" ]; then
        log_info "Updating VibeManager..."
        cd "$INSTALL_DIR"
        git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || true
    else
        log_info "Downloading VibeManager..."
        git clone "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
            # If repo doesn't exist, create from current directory
            mkdir -p "$INSTALL_DIR"
            cp -r "$(dirname "$0")"/* "$INSTALL_DIR/" 2>/dev/null || {
                log_error "Failed to install. Please run from VibeManager directory."
                exit 1
            }
        }
    fi
    cd "$INSTALL_DIR"
    log_success "VibeManager downloaded to $INSTALL_DIR"
}

setup_local() {
    log_info "Setting up local installation..."

    install_dependencies
    install_node

    clone_or_update_repo

    cd "$INSTALL_DIR"
    npm install

    # Install Claude Code CLI
    log_info "Installing Claude Code CLI..."
    npm install -g @anthropic-ai/claude-code 2>/dev/null || log_warn "Claude Code CLI install failed (optional)"

    # Install OpenCode if available
    npm install -g opencode 2>/dev/null || log_warn "OpenCode not available (optional)"

    log_success "Local installation complete"
}

setup_docker() {
    log_info "Setting up Docker installation..."

    install_docker
    clone_or_update_repo

    cd "$INSTALL_DIR"

    # Build and start
    docker compose build
    docker compose up -d

    log_success "Docker installation complete"
}

create_systemd_service() {
    log_info "Creating systemd service..."

    sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=VibeManager - AI Coding Session Manager
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) server.js
Restart=on-failure
RestartSec=10
Environment=PORT=$PORT
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable ${SERVICE_NAME}
    sudo systemctl start ${SERVICE_NAME}

    log_success "Systemd service created and started"
}

create_systemd_docker_service() {
    log_info "Creating systemd service for Docker..."

    sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=VibeManager - AI Coding Session Manager (Docker)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable ${SERVICE_NAME}
    sudo systemctl start ${SERVICE_NAME}

    log_success "Docker systemd service created and started"
}

create_launchd_service() {
    log_info "Creating launchd service..."

    PLIST_PATH="$HOME/Library/LaunchAgents/com.vibemanager.plist"
    mkdir -p "$HOME/Library/LaunchAgents"

    cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.vibemanager</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>$INSTALL_DIR/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>$PORT</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/logs/stderr.log</string>
</dict>
</plist>
EOF

    mkdir -p "$INSTALL_DIR/logs"
    launchctl load "$PLIST_PATH"

    log_success "Launchd service created and started"
}

create_launchd_docker_service() {
    log_info "Creating launchd service for Docker..."

    PLIST_PATH="$HOME/Library/LaunchAgents/com.vibemanager.plist"
    mkdir -p "$HOME/Library/LaunchAgents"

    cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.vibemanager</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/docker</string>
        <string>compose</string>
        <string>up</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

    launchctl load "$PLIST_PATH"

    log_success "Docker launchd service created and started"
}

setup_service() {
    OS=$(detect_os)
    MODE=$1  # "local" or "docker"

    case $OS in
        linux|wsl)
            if [ "$MODE" == "docker" ]; then
                create_systemd_docker_service
            else
                create_systemd_service
            fi
            ;;
        macos)
            if [ "$MODE" == "docker" ]; then
                create_launchd_docker_service
            else
                create_launchd_service
            fi
            ;;
    esac
}

print_success() {
    echo ""
    echo -e "${GREEN}${BOLD}Installation Complete!${NC}"
    echo ""
    echo -e "  ${CYAN}VibeManager${NC} is running at: ${BOLD}http://localhost:$PORT${NC}"
    if [ "$1" == "docker" ]; then
        echo -e "  ${CYAN}Code Server${NC} is running at: ${BOLD}http://localhost:$CODE_PORT${NC}"
    fi
    echo ""
    echo -e "  ${BOLD}Commands:${NC}"
    OS=$(detect_os)
    case $OS in
        linux|wsl)
            echo "    sudo systemctl status vibemanager  # Check status"
            echo "    sudo systemctl restart vibemanager # Restart"
            echo "    sudo systemctl stop vibemanager    # Stop"
            echo "    journalctl -u vibemanager -f       # View logs"
            ;;
        macos)
            echo "    launchctl list | grep vibemanager  # Check status"
            echo "    launchctl stop com.vibemanager     # Stop"
            echo "    launchctl start com.vibemanager    # Start"
            ;;
    esac
    echo ""
}

uninstall() {
    log_info "Uninstalling VibeManager..."

    OS=$(detect_os)

    # Stop and remove service
    case $OS in
        linux|wsl)
            sudo systemctl stop ${SERVICE_NAME} 2>/dev/null || true
            sudo systemctl disable ${SERVICE_NAME} 2>/dev/null || true
            sudo rm -f /etc/systemd/system/${SERVICE_NAME}.service
            sudo systemctl daemon-reload
            ;;
        macos)
            launchctl unload "$HOME/Library/LaunchAgents/com.vibemanager.plist" 2>/dev/null || true
            rm -f "$HOME/Library/LaunchAgents/com.vibemanager.plist"
            ;;
    esac

    # Stop Docker containers
    if [ -d "$INSTALL_DIR" ]; then
        cd "$INSTALL_DIR"
        docker compose down 2>/dev/null || true
    fi

    # Remove installation directory
    rm -rf "$INSTALL_DIR"

    log_success "VibeManager uninstalled"
}

# Main
main() {
    print_banner

    OS=$(detect_os)
    ARCH=$(detect_arch)

    log_info "Detected: $OS ($ARCH)"
    echo ""

    # Parse arguments
    case "${1:-}" in
        --docker)
            MODE="docker"
            ;;
        --local)
            MODE="local"
            ;;
        --uninstall)
            uninstall
            exit 0
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --docker      Install with Docker (recommended)"
            echo "  --local       Install locally without Docker"
            echo "  --uninstall   Remove VibeManager"
            echo "  --help        Show this help"
            echo ""
            echo "Environment variables:"
            echo "  VIBEMANAGER_DIR   Installation directory (default: ~/.vibemanager)"
            echo "  VIBEMANAGER_PORT  Web UI port (default: 3131)"
            exit 0
            ;;
        *)
            # Interactive mode
            echo -e "${BOLD}How would you like to install VibeManager?${NC}"
            echo ""
            echo "  1) ${CYAN}Docker${NC} (recommended) - Isolated container with all dependencies"
            echo "  2) ${CYAN}Local${NC}  - Direct installation on your system"
            echo ""
            read -p "Enter choice [1/2]: " choice

            case $choice in
                1|docker|Docker) MODE="docker" ;;
                2|local|Local) MODE="local" ;;
                *)
                    log_error "Invalid choice"
                    exit 1
                    ;;
            esac
            ;;
    esac

    echo ""
    log_info "Installing in ${MODE} mode..."
    echo ""

    if [ "$MODE" == "docker" ]; then
        setup_docker
        setup_service "docker"
        print_success "docker"
    else
        setup_local
        setup_service "local"
        print_success "local"
    fi
}

main "$@"
