import { router } from 'expo-router';
import { FormatPicker } from '@/components/format-picker';
import { TabBar } from '@/components/tab-bar';
import { Btn, H1, Note, P, Screen } from '@/components/ui';

/** "Join" tab: start or join any of the four formats. */
export default function Discover() {
  return (
    <Screen title="Start or join" back={false} tabBar={<TabBar />}>
      <H1>Find your circle</H1>
      <P muted>Start a group with friends, train with a verified coach, build your own 75, or join an open FitCircle Challenge.</P>
      <Btn label="Join with an invite code" variant="ghost" onPress={() => router.push('/join')} />
      <FormatPicker />
      <Note icon="🔒">Staking is opt-in. Any challenge can run without money.</Note>
    </Screen>
  );
}
