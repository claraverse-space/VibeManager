import { useEffect, useState } from 'react';
import { useUIStore } from './stores/uiStore';
import { useAuthStore } from './stores/authStore';
import { useStatusWebSocket } from './hooks/useStatusWebSocket';
import { authApi } from './lib/api';
import Header from './components/layout/Header';
import ViewTabs from './components/layout/ViewTabs';
import MainContent from './components/layout/MainContent';
import StatusBar from './components/layout/StatusBar';
import Setup from './pages/Setup';
import Login from './pages/Login';

function AuthenticatedApp() {
  const { theme } = useUIStore();

  // Connect to status WebSocket
  useStatusWebSocket();

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm_theme', theme);
  }, [theme]);

  return (
    <div className="flex flex-col h-full">
      <Header />
      <ViewTabs />
      <MainContent />
      <StatusBar />
    </div>
  );
}

export default function App() {
  const { theme } = useUIStore();
  const { isAuthenticated, setupRequired, setSetupRequired, setIsLoading, token, logout } = useAuthStore();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Apply theme early
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm_theme', theme);
  }, [theme]);

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('vm_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      useUIStore.getState().setTheme(savedTheme);
    }
  }, []);

  // Check auth status on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        // First check if setup is required
        const { setupRequired: needsSetup } = await authApi.getSetupStatus();
        setSetupRequired(needsSetup);

        // If setup is done and we have a token, verify it's still valid
        if (!needsSetup && token) {
          try {
            await authApi.me();
            // Token is valid, keep user logged in
          } catch {
            // Token is invalid, log out
            logout();
          }
        }
      } catch (error) {
        console.error('Failed to check auth status:', error);
      } finally {
        setIsLoading(false);
        setIsCheckingAuth(false);
      }
    }

    checkAuth();
  }, []);

  // Show loading state while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-text-dim">Loading...</div>
      </div>
    );
  }

  // Show setup page if no users exist
  if (setupRequired) {
    return <Setup />;
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  // Show main app
  return <AuthenticatedApp />;
}
