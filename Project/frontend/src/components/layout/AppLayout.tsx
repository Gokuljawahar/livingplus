import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { SidebarProvider } from '../../context/SidebarContext';

function AppLayoutInner() {
  return (
    <SidebarProvider>
      <div className="flex h-[100dvh] bg-[#F8FAFB]">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function AppLayout() {
  return <AppLayoutInner />;
}
