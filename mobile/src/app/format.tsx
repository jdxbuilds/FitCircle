import { router } from 'expo-router';
import { FormatPicker } from '@/components/format-picker';
import { H1, LinkBtn, Note, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** First stop after sign-up: pick how you want to be held accountable. */
export default function FormatScreen() {
  const { me } = useAuth();
  return (
    <Screen title="Choose your format" back={false} right={<LinkBtn label="Skip" onPress={() => router.replace('/home')} />}>
      <H1>How do you want to be held accountable, {me?.firstName ?? 'friend'}?</H1>
      <FormatPicker />
      <Note icon="🔒">Staking is opt-in. Any challenge can run without money.</Note>
      <LinkBtn label="I have an invite code" onPress={() => router.push('/join')} />
    </Screen>
  );
}
