#!/bin/bash
# VibeManager Installer Script
# Usage: curl -fsSL https://raw.githubusercontent.com/claraverse-space/VibeManager/master/install.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO="claraverse-space/VibeManager"
VERSION="${VIBEMANAGER_VERSION:-latest}"
INSTALL_DIR="${VIBEMANAGER_INSTALL_DIR:-$HOME/.local/bin}"
DATA_DIR="${VIBEMANAGER_DATA_DIR:-$HOME/.local/share/vibemanager}"

# Logging functions
info() {
    printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

success() {
    printf "${GREEN}[OK]${NC} %s\n" "$1"
}

warn() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1"
    exit 1
}

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux)
            OS="linux"
            ;;
        Darwin)
            OS="darwin"
            ;;
        *)
            error "Unsupported operating system: $OS"
            ;;
    esac

    case "$ARCH" in
        x86_64|amd64)
            ARCH="x64"
            ;;
        arm64|aarch64)
            ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $ARCH"
            ;;
    esac

    PLATFORM="${OS}-${ARCH}"
    info "Detected platform: $PLATFORM"
}

# Check for required dependencies
check_dependencies() {
    info "Checking dependencies..."

    # Check for bun
    if ! command -v bun &> /dev/null; then
        warn "Bun is not installed"
        echo ""
        echo "Bun is required to run VibeManager. Install it with:"
        echo "  curl -fsSL https://bun.sh/install | bash"
        echo ""
        read -p "Would you like to install Bun now? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            info "Installing Bun..."
            curl -fsSL https://bun.sh/install | bash
            # Source the updated profile
            export BUN_INSTALL="$HOME/.bun"
            export PATH="$BUN_INSTALL/bin:$PATH"
            success "Bun installed successfully"
        else
            error "Bun is required. Please install it and try again."
        fi
    else
        success "Bun is installed: $(bun --version)"
    fi

    # Check for tmux
    if ! command -v tmux &> /dev/null; then
        warn "tmux is not installed"
        echo ""
        echo "tmux is required for terminal session management."
        echo ""
        if [[ "$OS" == "linux" ]]; then
            echo "Install with:"
            echo "  Ubuntu/Debian: sudo apt install tmux"
            echo "  Fedora: sudo dnf install tmux"
            echo "  Arch: sudo pacman -S tmux"
        elif [[ "$OS" == "darwin" ]]; then
            echo "Install with: brew install tmux"
        fi
        echo ""
        error "Please install tmux and try again."
    else
        success "tmux is installed: $(tmux -V)"
    fi

    # Optional: Check for code-server
    if command -v code-server &> /dev/null; then
        success "code-server is installed (optional): $(code-server --version | head -1)"
    else
        info "code-server not found (optional - for integrated code editing)"
    fi
}

# Create directories
setup_directories() {
    info "Setting up directories..."

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Create data directory
    mkdir -p "$DATA_DIR"
    mkdir -p "$DATA_DIR/logs"

    success "Directories created"
}

# Download and install binary
install_binary() {
    info "Installing VibeManager..."

    # For now, install from source using bun
    # In production, this would download pre-built binaries

    TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT

    # Clone or download the repository
    if [ "$VERSION" = "latest" ]; then
        DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/vibemanager-${PLATFORM}"
    else
        DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/vibemanager-${PLATFORM}"
    fi

    info "Downloading from: $DOWNLOAD_URL"

    # Try to download binary, fall back to source install
    if curl -fsSL -o "$TEMP_DIR/vibemanager" "$DOWNLOAD_URL" 2>/dev/null; then
        chmod +x "$TEMP_DIR/vibemanager"
        mv "$TEMP_DIR/vibemanager" "$INSTALL_DIR/vibemanager"
        success "Binary installed to $INSTALL_DIR/vibemanager"
    else
        warn "Pre-built binary not available, installing from source..."
        install_from_source
    fi
}

# Install from source (fallback)
install_from_source() {
    info "Installing from source..."

    # Clone repository
    CLONE_DIR="$DATA_DIR/source"

    if [ -d "$CLONE_DIR" ]; then
        info "Updating existing source..."
        cd "$CLONE_DIR"
        git pull --quiet
    else
        info "Cloning repository..."
        git clone --quiet "https://github.com/${REPO}.git" "$CLONE_DIR"
        cd "$CLONE_DIR"
    fi

    # Install dependencies
    info "Installing dependencies..."
    bun install --silent

    # Run database migrations
    info "Running database migrations..."
    bun run db:migrate

    # Create a wrapper script
    cat > "$INSTALL_DIR/vibemanager" << EOF
#!/bin/bash
cd "$CLONE_DIR"
exec bun run cli "\$@"
EOF
    chmod +x "$INSTALL_DIR/vibemanager"

    success "Installed from source"
}

# Update PATH if needed
update_path() {
    # Check if install dir is in PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        warn "$INSTALL_DIR is not in your PATH"

        # Detect shell and profile file
        SHELL_NAME=$(basename "$SHELL")
        case "$SHELL_NAME" in
            bash)
                PROFILE="$HOME/.bashrc"
                ;;
            zsh)
                PROFILE="$HOME/.zshrc"
                ;;
            fish)
                PROFILE="$HOME/.config/fish/config.fish"
                ;;
            *)
                PROFILE="$HOME/.profile"
                ;;
        esac

        echo ""
        echo "Add the following line to your $PROFILE:"
        echo ""
        if [ "$SHELL_NAME" = "fish" ]; then
            echo "  set -gx PATH \$PATH $INSTALL_DIR"
        else
            echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
        fi
        echo ""
        echo "Then run: source $PROFILE"
        echo ""

        read -p "Would you like to add this automatically? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if [ "$SHELL_NAME" = "fish" ]; then
                echo "set -gx PATH \$PATH $INSTALL_DIR" >> "$PROFILE"
            else
                echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$PROFILE"
            fi
            success "Added to $PROFILE"
            info "Run 'source $PROFILE' or restart your terminal"
        fi
    fi
}

# Print completion message
print_completion() {
    printf "\n"
    printf "${GREEN}============================================${NC}\n"
    printf "${GREEN}  VibeManager installed successfully!${NC}\n"
    printf "${GREEN}============================================${NC}\n"
    printf "\n"
    printf "Get started:\n"
    printf "\n"
    printf "  1. Initialize VibeManager:\n"
    printf "     ${BLUE}vibemanager init${NC}\n"
    printf "\n"
    printf "  2. Start the server:\n"
    printf "     ${BLUE}vibemanager start${NC}\n"
    printf "\n"
    printf "  3. Check status:\n"
    printf "     ${BLUE}vibemanager status${NC}\n"
    printf "\n"
    printf "For remote access, use Tailscale, Cloudflare Tunnel,\n"
    printf "ngrok, or any tunneling service of your choice.\n"
    printf "\n"
    printf "Documentation: https://github.com/%s#readme\n" "${REPO}"
    printf "\n"
}

# Main installation flow
main() {
    printf "\n"
    printf "${BLUE}╔════════════════════════════════════════════╗${NC}\n"
    printf "${BLUE}║       VibeManager Installer                ║${NC}\n"
    printf "${BLUE}║   AI-Powered Development Environment       ║${NC}\n"
    printf "${BLUE}╚════════════════════════════════════════════╝${NC}\n"
    printf "\n"

    detect_platform
    check_dependencies
    setup_directories
    install_binary
    update_path
    print_completion
}

# Run main
main "$@"
