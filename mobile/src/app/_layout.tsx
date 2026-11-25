import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';

/** Holds every screen until the saved session has loaded, so deep links never call the API signed out. */
function WhenReady({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  return ready ? <>{children}</> : <Loading />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <WhenReady>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }} />
      </WhenReady>
    </AuthProvider>
  );
}
