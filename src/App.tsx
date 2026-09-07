import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/MainLayout';
import { Dashboard } from './pages/DashboardPage';
import { SpreadsheetPage } from './pages/SpreadsheetPage';
import { CustomerServicePage } from './pages/CustomerServicePage';
import { ScheduledClientPage } from './pages/ScheduledClientPage';
import { NewLeadsPage } from './pages/NewLeadsPage';
import { TodayTasksPage } from './pages/TodayTasksPage';
import { ClientForm } from './components/ClientForm';
import { UserProvider } from './lib/userContext';
import { UserGatekeeper } from './components/UserGatekeeper';

export default function App() {
 return (
 <UserProvider>
 <UserGatekeeper>
 <Routes>
 <Route element={<MainLayout />}>
 <Route path="/"element={<Dashboard />} />
 <Route path="/today"element={<TodayTasksPage />} />
 <Route path="/new"element={<NewLeadsPage />} />
 <Route path="/leads"element={<SpreadsheetPage />} />
 <Route path="/client"element={<ClientForm />} />
 <Route path="/scheduled"element={<CustomerServicePage />} />
 <Route path="/follow-ups"element={<CustomerServicePage />} />
 <Route path="/spreadsheet"element={<SpreadsheetPage />} />
 <Route path="/scheduled-client"element={<ScheduledClientPage />} />
 <Route path="/scheduled-clients"element={<ScheduledClientPage />} />
 <Route path="/schedule-client"element={<ScheduledClientPage />} />
 </Route>
 </Routes>
 </UserGatekeeper>
 </UserProvider>
 );
}

