import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Eyebrow, P } from '@/components/ui';
import { C, FORMAT } from '@/lib/theme';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={['#FFE7DD', '#FFFFFF']} style={{ flex: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, paddingHorizontal: 24, justifyContent: 'space-between' }}>
      <View style={s.orbit} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <LinearGradient colors={FORMAT.peer.colors} style={[s.o, { transform: [{ translateX: -44 }, { translateY: -26 }] }]} />
        <LinearGradient colors={FORMAT.instructor.colors} style={[s.o, { transform: [{ translateX: 44 }, { translateY: -26 }] }]} />
        <LinearGradient colors={FORMAT.custom75.colors} style={[s.o, { transform: [{ translateX: -44 }, { translateY: 48 }] }]} />
        <LinearGradient colors={FORMAT.fitcircle.colors} style={[s.o, { transform: [{ translateX: 44 }, { translateY: 48 }] }]} />
      </View>
      <View style={{ gap: 12 }}>
        <Eyebrow color={FORMAT.peer.colors[0]}>Fitness · Accountability · Community</Eyebrow>
        <Text style={s.big} accessibilityRole="header">Welcome to FitCircle.</Text>
        <Text style={[s.big, { color: FORMAT.peer.colors[0] }]}>A better you starts with you.</Text>
        <P muted>Join a circle of people who show up for each other. Set your goal, prove every session, and win when you keep going.</P>
      </View>
      <View style={{ gap: 10 }}>
        <Btn label="Get started  →" colors={FORMAT.peer.colors} onPress={() => router.push('/start')} />
        <Btn label="I have an invite code" variant="ghost" onPress={() => router.push({ pathname: '/phone', params: { as: 'member', then: 'join' } })} />
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  orbit: { height: 220, alignItems: 'center', justifyContent: 'center' },
  o: { position: 'absolute', width: 96, height: 96, borderRadius: 48, opacity: 0.92 },
  big: { fontSize: 36, fontWeight: '800', letterSpacing: -1, lineHeight: 40, color: C.ink },
});
