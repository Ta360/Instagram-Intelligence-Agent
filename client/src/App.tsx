import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppStateProvider } from "@/hooks/appState";
import { ChartColorsProvider } from "@/theme/chartTheme";
import { AuthGate } from "@/components/auth/Auth";
import {
  AnalyticsPage,
  CalendarPage,
  DashboardPage,
  HistoryPage,
  MediaPage,
  NotFoundPage,
  ProfilePage,
  SavedPage,
  SearchPage,
  SettingsPage,
  StatusPage,
} from "@/pages/Pages";

export default function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <ChartColorsProvider>
          <AppStateProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="profile/:username" element={<ProfilePage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="media" element={<MediaPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="saved" element={<SavedPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="status" element={<StatusPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </AppStateProvider>
        </ChartColorsProvider>
      </BrowserRouter>
    </AuthGate>
  );
}
