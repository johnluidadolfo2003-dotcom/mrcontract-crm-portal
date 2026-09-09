import React, { Suspense, lazy } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/MainLayout';
import { UserProvider } from './lib/userContext';
import { UserGatekeeper } from './components/UserGatekeeper';

const Dashboard = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.Dashboard })));
const SpreadsheetPage = lazy(() => import('./pages/SpreadsheetPage').then((m) => ({ default: m.SpreadsheetPage })));
const CustomerServicePage = lazy(() => import('./pages/CustomerServicePage').then((m) => ({ default: m.CustomerServicePage })));
const ScheduledClientPage = lazy(() => import('./pages/ScheduledClientPage').then((m) => ({ default: m.ScheduledClientPage })));
const NewLeadsPage = lazy(() => import('./pages/NewLeadsPage').then((m) => ({ default: m.NewLeadsPage })));
const TodayTasksPage = lazy(() => import('./pages/TodayTasksPage').then((m) => ({ default: m.TodayTasksPage })));
const AngiEmailActivityPage = lazy(() => import('./pages/AngiEmailActivityPage').then((m) => ({ default: m.AngiEmailActivityPage })));
const ClientForm = lazy(() => import('./components/ClientForm').then((m) => ({ default: m.ClientForm })));

const PageLoader = () => <div className="flex min-h-[40vh] items-center justify-center" role="status"><div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-[#FF5500]"/><span className="sr-only">Loading page</span></div>;

export default function App() {
 return (
 <UserProvider>
 <UserGatekeeper>
 <Suspense fallback={<PageLoader />}>
 <Routes>
 <Route element={<MainLayout />}>
 <Route path="/"element={<Dashboard />} />
 <Route path="/today"element={<TodayTasksPage />} />
 <Route path="/new"element={<NewLeadsPage />} />
 <Route path="/leads"element={<SpreadsheetPage />} />
 <Route path="/client"element={<ClientForm />} />
 <Route path="/scheduled" element={<Navigate to="/follow-ups" replace />} />
 <Route path="/follow-ups"element={<CustomerServicePage />} />
 <Route path="/spreadsheet" element={<Navigate to="/leads" replace />} />
 <Route path="/scheduled-client" element={<Navigate to="/scheduled-clients" replace />} />
 <Route path="/scheduled-clients"element={<ScheduledClientPage />} />
 <Route path="/schedule-client" element={<Navigate to="/scheduled-clients" replace />} />
 <Route path="/angi-email-activity" element={<Navigate to="/angi-activity" replace />} />
 <Route path="/angi-activity" element={<AngiEmailActivityPage />} />
 <Route path="*" element={<Navigate to="/" replace />} />
 </Route>
 </Routes>
 </Suspense>
 </UserGatekeeper>
 </UserProvider>
 );
}
