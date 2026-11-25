import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { H1, P, Screen, Small } from '@/components/ui';
import { C, FORMAT } from '@/lib/theme';

function Choice({ title, desc, colors, onPress }: { title: string; desc: string; colors: [string, string]; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 22, padding: 18, gap: 4 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{title}  →</Text>
        <Text style={{ color: '#fff', opacity: 0.92, fontSize: 14 }}>{desc}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function SignIn({ title, desc, onPress }: { title: string; desc: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ padding: 16, borderRadius: 18, backgroundColor: C.surface2, gap: 2 }}>
      <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>{title}  →</Text>
      <Small>{desc}</Small>
    </Pressable>
  );
}

export default function Start() {
  const go = (as: 'member' | 'coach') => router.push({ pathname: '/phone', params: { as } });
  return (
    <Screen title="Get started">
      <H1>How are you joining?</H1>
      <P muted>Pick one. You can add the other later from your profile.</P>
      <Small bold>NEW TO FITCIRCLE</Small>
      <Choice title="Become a FitCircle member" desc="Join challenges, stake on showing up, win sponsored jackpots." colors={FORMAT.peer.colors} onPress={() => go('member')} />
      <Choice title="Become an instructor" desc="Run paid programmes. Keep 65% of every entry fee." colors={FORMAT.instructor.colors} onPress={() => go('coach')} />
      <View style={{ height: 4 }} />
      <Small bold>ALREADY ON FITCIRCLE</Small>
      <SignIn title="FC Member" desc="Sign in to your challenges" onPress={() => go('member')} />
      <SignIn title="FC Instructor" desc="Sign in to your dashboard" onPress={() => go('coach')} />
    </Screen>
  );
}
