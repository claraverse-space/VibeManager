#!/bin/bash
# VibeManager Installer Script
# Usage: curl -fsSL https://raw.githubusercontent.com/claraverse-space/VibeManager/master/install.sh | bash
#
# This installer automatically:
# - Installs all dependencies (bun, tmux, git)
# - Downloads pre-built binary or builds from source
# - Configures PATH
# - Just works™

set -e

# Configuration
REPO="claraverse-space/VibeManager"
VERSION="${VIBEMANAGER_VERSION:-latest}"
INSTALL_DIR="${VIBEMANAGER_INSTALL_DIR:-$HOME/.local/bin}"
DATA_DIR="${VIBEMANAGER_DATA_DIR:-$HOME/.local/share/vibemanager}"

# Colors (set up safely)
setup_colors() {
    if [ -t 1 ] && command -v tput &> /dev/null; then
        RED=$(tput setaf 1 2>/dev/null) || RED=""
        GREEN=$(tput setaf 2 2>/dev/null) || GREEN=""
        YELLOW=$(tput setaf 3 2>/dev/null) || YELLOW=""
        BLUE=$(tput setaf 4 2>/dev/null) || BLUE=""
        BOLD=$(tput bold 2>/dev/null) || BOLD=""
        NC=$(tput sgr0 2>/dev/null) || NC=""
    else
        RED="" GREEN="" YELLOW="" BLUE="" BOLD="" NC=""
    fi
}

# Logging
info()    { printf "${BLUE}[INFO]${NC} %s\n" "$1"; }
success() { printf "${GREEN}[OK]${NC} %s\n" "$1"; }
warn()    { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
error()   { printf "${RED}[ERROR]${NC} %s\n" "$1"; exit 1; }
step()    { printf "\n${BOLD}==> %s${NC}\n" "$1"; }

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
    ARCH="$(uname -m)"

    case "$OS" in
        linux|darwin) ;;
        *) error "Unsupported OS: $OS" ;;
    esac

    case "$ARCH" in
        x86_64|amd64) ARCH="x64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *) error "Unsupported architecture: $ARCH" ;;
    esac

    PLATFORM="${OS}-${ARCH}"
}

# Detect package manager
get_pkg_manager() {
    if [ "$OS" = "darwin" ]; then
        echo "brew"
    elif command -v apt-get &>/dev/null; then
        echo "apt"
    elif command -v dnf &>/dev/null; then
        echo "dnf"
    elif command -v yum &>/dev/null; then
        echo "yum"
    elif command -v pacman &>/dev/null; then
        echo "pacman"
    elif command -v apk &>/dev/null; then
        echo "apk"
    elif command -v zypper &>/dev/null; then
        echo "zypper"
    else
        echo "unknown"
    fi
}

# Install package using system package manager
install_pkg() {
    local pkg="$1"
    local mgr
    mgr=$(get_pkg_manager)

    info "Installing $pkg..."

    case "$mgr" in
        brew)
            if ! command -v brew &>/dev/null; then
                info "Installing Homebrew first..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            brew install "$pkg"
            ;;
        apt)
            sudo apt-get update -qq
            sudo apt-get install -y -qq "$pkg"
            ;;
        dnf)
            sudo dnf install -y -q "$pkg"
            ;;
        yum)
            sudo yum install -y -q "$pkg"
            ;;
        pacman)
            sudo pacman -Sy --noconfirm "$pkg"
            ;;
        apk)
            sudo apk add "$pkg"
            ;;
        zypper)
            sudo zypper install -y "$pkg"
            ;;
        *)
            error "Cannot auto-install $pkg. Please install it manually and re-run this script."
            ;;
    esac
}

# Install Bun runtime
install_bun() {
    if command -v bun &>/dev/null; then
        success "Bun already installed: $(bun --version)"
        return 0
    fi

    step "Installing Bun runtime"
    curl -fsSL https://bun.sh/install | bash

    # Add to current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if command -v bun &>/dev/null; then
        success "Bun installed: $(bun --version)"
    else
        error "Failed to install Bun"
    fi
}

# Install tmux
install_tmux() {
    if command -v tmux &>/dev/null; then
        success "tmux already installed: $(tmux -V)"
        return 0
    fi

    step "Installing tmux"
    install_pkg tmux

    if command -v tmux &>/dev/null; then
        success "tmux installed: $(tmux -V)"
    else
        error "Failed to install tmux"
    fi
}

# Install git
install_git() {
    if command -v git &>/dev/null; then
        return 0
    fi

    step "Installing git"
    install_pkg git
}

# Create directories
setup_directories() {
    mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$DATA_DIR/logs"
}

# Try to download pre-built binary
download_binary() {
    local url
    if [ "$VERSION" = "latest" ]; then
        url="https://github.com/${REPO}/releases/latest/download/vibemanager-${PLATFORM}"
    else
        url="https://github.com/${REPO}/releases/download/${VERSION}/vibemanager-${PLATFORM}"
    fi

    info "Checking for pre-built binary..."

    if curl -fsSL -o "$INSTALL_DIR/vibemanager" "$url" 2>/dev/null; then
        chmod +x "$INSTALL_DIR/vibemanager"
        success "Downloaded pre-built binary"
        return 0
    fi

    return 1
}

# Install from source
install_from_source() {
    step "Installing from source"

    install_git
    install_bun

    local src_dir="$DATA_DIR/source"

    if [ -d "$src_dir/.git" ]; then
        info "Updating existing installation..."
        cd "$src_dir"
        git fetch -q origin
        git reset --hard origin/master -q
    else
        info "Downloading source code..."
        rm -rf "$src_dir"
        git clone -q --depth 1 "https://github.com/${REPO}.git" "$src_dir"
        cd "$src_dir"
    fi

    info "Installing dependencies..."
    bun install --frozen-lockfile 2>/dev/null || bun install

    info "Setting up database..."
    bun run db:migrate

    # Create CLI wrapper
    cat > "$INSTALL_DIR/vibemanager" << 'EOF'
#!/bin/bash
cd "$HOME/.local/share/vibemanager/source"
exec bun run cli "$@"
EOF
    chmod +x "$INSTALL_DIR/vibemanager"

    success "Installed from source"
}

# Configure PATH
setup_path() {
    # Already in PATH?
    if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
        return 0
    fi

    step "Configuring PATH"

    local shell_name rc_file
    shell_name=$(basename "$SHELL")

    case "$shell_name" in
        zsh)  rc_file="$HOME/.zshrc" ;;
        fish) rc_file="$HOME/.config/fish/config.fish" ;;
        *)    rc_file="$HOME/.bashrc" ;;
    esac

    # Create file if it doesn't exist
    touch "$rc_file"

    # Check if already added
    if grep -q "/.local/bin" "$rc_file" 2>/dev/null; then
        success "PATH already configured in $rc_file"
    else
        if [ "$shell_name" = "fish" ]; then
            mkdir -p "$(dirname "$rc_file")"
            echo "set -gx PATH \$PATH $INSTALL_DIR" >> "$rc_file"
        else
            echo "" >> "$rc_file"
            echo "# VibeManager" >> "$rc_file"
            echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$rc_file"
        fi
        success "Added to $rc_file"
    fi

    # Export for current session
    export PATH="$PATH:$INSTALL_DIR"
}

# Print success message
print_success() {
    printf "\n"
    printf "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}\n"
    printf "${GREEN}${BOLD}║           VibeManager installed successfully!            ║${NC}\n"
    printf "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}\n"
    printf "\n"
    printf "${BOLD}Get started:${NC}\n"
    printf "\n"
    printf "  ${YELLOW}1.${NC} Restart your terminal (or run: ${BLUE}source ~/.bashrc${NC})\n"
    printf "\n"
    printf "  ${YELLOW}2.${NC} Initialize and start VibeManager:\n"
    printf "     ${GREEN}\$ vibemanager init${NC}\n"
    printf "\n"
    printf "  ${YELLOW}3.${NC} Open in browser:\n"
    printf "     ${BLUE}http://localhost:3131${NC}\n"
    printf "\n"
    printf "${BOLD}Commands:${NC}\n"
    printf "  vibemanager init     Initialize (first-time setup)\n"
    printf "  vibemanager start    Start the server\n"
    printf "  vibemanager stop     Stop the server\n"
    printf "  vibemanager status   Show status and URLs\n"
    printf "\n"
    printf "${BOLD}Remote access:${NC} Use Tailscale, Cloudflare Tunnel, or ngrok\n"
    printf "\n"
    printf "Docs: ${BLUE}https://github.com/${REPO}#readme${NC}\n"
    printf "\n"
}

# Main
main() {
    setup_colors

    printf "\n"
    printf "${BLUE}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}\n"
    printf "${BLUE}${BOLD}║              VibeManager Installer                       ║${NC}\n"
    printf "${BLUE}${BOLD}║        AI-Powered Development Environment                ║${NC}\n"
    printf "${BLUE}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}\n"
    printf "\n"

    detect_platform
    info "Platform: $PLATFORM"

    setup_directories

    # Install dependencies
    step "Checking dependencies"
    install_tmux

    # Install VibeManager (try binary, fallback to source)
    step "Installing VibeManager"
    if ! download_binary; then
        install_from_source
    fi

    setup_path
    print_success
}

main "$@"
