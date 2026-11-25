import { Redirect } from 'expo-router';
import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Decides where the app opens: welcome for new people, the instructor dashboard for verified coaches, home otherwise. */
export default function Index() {
  const { ready, me } = useAuth();
  if (!ready) return <Loading />;
  if (!me) return <Redirect href="/welcome" />;
  if (me.instructor) return <Redirect href="/coach" />;
  return <Redirect href="/home" />;
}
