import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { SidebarProvider } from '../../context/SidebarContext';
import AIChatPanel from '../AIChatPanel';

function AppLayoutInner() {
  return (
    <SidebarProvider>
      <div className="flex h-[100dvh] bg-surface">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 md:pb-24">
            <Outlet />
          </main>
          <AIChatPanel />
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function AppLayout() {
  return <AppLayoutInner />;
}
