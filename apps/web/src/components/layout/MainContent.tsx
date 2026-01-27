import { useUIStore } from '../../stores/uiStore';
import Dashboard from '../../pages/Dashboard';
import TerminalView from '../terminal/TerminalView';
import CodeView from '../preview/CodeView';
import PreviewPane from '../preview/PreviewPane';
import SplitView from './SplitView';

export default function MainContent() {
  const { viewMode } = useUIStore();

  return (
    <main className="flex-1 flex flex-col overflow-hidden" data-view={viewMode}>
      {viewMode === 'dashboard' && <Dashboard />}
      {viewMode === 'terminal' && <TerminalView />}
      {viewMode === 'code' && <CodeView />}
      {viewMode === 'preview' && <PreviewPane />}
      {viewMode === 'split' && <SplitView />}
    </main>
  );
}
