import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { FORMAT, type Format } from '@/lib/theme';

const ICON: Record<Format, string> = { peer: '👥', instructor: '🏅', custom75: '📅', fitcircle: '🏆' };
const GO: Record<Format, () => void> = {
  peer: () => router.push('/create/peer'),
  instructor: () => router.push('/browse/instructor'),
  custom75: () => router.push('/create/custom75'),
  fitcircle: () => router.push('/browse/fitcircle'),
};

/** The four challenge formats as big tappable cards. */
export function FormatPicker() {
  return (
    <View style={{ gap: 12 }}>
      {(Object.keys(FORMAT) as Format[]).map((k) => {
        const f = FORMAT[k];
        return (
          <Pressable key={k} accessibilityRole="button" accessibilityLabel={`${f.name}. ${f.blurb}`} onPress={GO[k]}>
            <LinearGradient colors={f.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 22, padding: 18, gap: 6, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', right: -30, bottom: -40, width: 120, height: 120, borderRadius: 60, borderWidth: 14, borderColor: 'rgba(255,255,255,0.18)' }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>{ICON[k]}</Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{f.tag}</Text>
                </View>
              </View>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>{f.name}</Text>
              <Text style={{ color: '#fff', fontSize: 14, opacity: 0.92, maxWidth: 280 }}>{f.blurb}</Text>
            </LinearGradient>
          </Pressable>
        );
      })}
    </View>
  );
}
