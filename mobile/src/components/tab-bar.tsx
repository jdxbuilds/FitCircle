import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/lib/theme';

const TABS = [
  { href: '/home', label: 'Home', icon: '⌂' },
  { href: '/discover', label: 'Join', icon: '＋' },
  { href: '/jackpot', label: 'Jackpot', icon: '🏆' },
  { href: '/alerts', label: 'Alerts', icon: '🔔' },
  { href: '/profile', label: 'Me', icon: '☺' },
] as const;

/** Bottom navigation for the member side of the app. */
export function TabBar({ unread = 0 }: { unread?: number }) {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 10) }]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = path === t.href;
        return (
          <Pressable key={t.href} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}
            onPress={() => !on && router.replace(t.href)} style={s.tab}>
            <View>
              <Text style={[s.icon, { opacity: on ? 1 : 0.55 }]}>{t.icon}</Text>
              {t.href === '/alerts' && unread > 0 && <View style={s.badge}><Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text></View>}
            </View>
            <Text style={[s.label, on && { color: C.ink }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.bg, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  icon: { fontSize: 20, textAlign: 'center' },
  label: { fontSize: 11, fontWeight: '700', color: C.muted },
  badge: { position: 'absolute', right: -10, top: -4, backgroundColor: C.bad, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
