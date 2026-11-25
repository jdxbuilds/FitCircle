import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/lib/theme';

// ---------- layout ----------

/** A scrolling screen with an optional title bar (with back button) and a footer pinned to the bottom. */
export function Screen(props: {
  title?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tabBar?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bg?: string;
  onScrollEnd?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { title, back = true, right, children, footer, tabBar, refreshing, onRefresh, bg = C.bg, onScrollEnd } = props;
  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      {title !== undefined && (
        <View style={s.topbar}>
          {back ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn}>
              <Text style={{ fontSize: 20, color: C.ink }}>‹</Text>
            </Pressable>
          ) : <View style={{ width: 38 }} />}
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <View style={{ minWidth: 38, alignItems: 'flex-end' }}>{right}</View>
        </View>
      )}
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: title !== undefined ? 6 : 16, gap: 14, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        scrollEventThrottle={100}
        onScroll={onScrollEnd ? (e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 60) onScrollEnd();
        } : undefined}
      >
        {children}
      </ScrollView>
      {footer && <View style={[s.footer, { paddingBottom: tabBar ? 12 : 12 + insets.bottom }]}>{footer}</View>}
      {tabBar}
    </View>
  );
}

export const Row = ({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>
);

export const Card = ({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) => (
  <View style={[s.card, tint ? { backgroundColor: tint } : null, style]}>{children}</View>
);

export function Hero({ colors, children, style }: { colors: [string, string]; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { shadowColor: colors[0] }, style]}>
      <View style={s.heroRing} />
      {children}
    </LinearGradient>
  );
}

// ---------- text ----------

export const H1 = ({ children, color = C.ink }: { children: ReactNode; color?: string }) => <Text style={[s.h1, { color }]}>{children}</Text>;
export const P = ({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) => (
  <Text style={[s.p, muted && { color: C.muted }, style]}>{children}</Text>
);
export const Small = ({ children, color = C.muted, bold }: { children: ReactNode; color?: string; bold?: boolean }) => (
  <Text style={{ fontSize: 13, color, fontWeight: bold ? '700' : '400' }}>{children}</Text>
);
export const Eyebrow = ({ children, color = C.muted }: { children: ReactNode; color?: string }) => (
  <Text style={{ fontSize: 11.5, letterSpacing: 1.2, fontWeight: '800', textTransform: 'uppercase', color }}>{children}</Text>
);
export const Note = ({ children, icon = 'ⓘ' }: { children: ReactNode; icon?: string }) => (
  <Row gap={8} style={{ alignItems: 'flex-start' }}><Text style={{ color: C.muted }}>{icon}</Text><Text style={{ flex: 1, fontSize: 13, color: C.muted, lineHeight: 18 }}>{children}</Text></Row>
);

// ---------- controls ----------

export function Btn(props: {
  label: string;
  onPress?: () => void;
  colors?: [string, string];
  variant?: 'primary' | 'ghost' | 'dark' | 'gold' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  const { label, onPress, colors = ['#191630', '#3A3456'], variant = 'primary', disabled, busy, small } = props;
  const off = disabled || busy;
  const textColor = variant === 'ghost' ? C.ink : variant === 'gold' ? '#1A1300' : '#fff';
  const inner = busy ? <ActivityIndicator color={textColor} /> : <Text style={[s.btnText, { color: textColor }, small && { fontSize: 14 }]}>{label}</Text>;
  const base = [s.btn, small && s.btnSmall, off && { opacity: 0.5 }];
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off }} disabled={off} onPress={onPress} style={({ pressed }) => [pressed && { transform: [{ scale: 0.98 }] }]}>
      {variant === 'primary' ? (
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={base}>{inner}</LinearGradient>
      ) : (
        <View style={[...base, variant === 'ghost' && s.btnGhost, variant === 'dark' && { backgroundColor: C.ink }, variant === 'gold' && { backgroundColor: C.gold }, variant === 'danger' && { backgroundColor: C.bad }]}>{inner}</View>
      )}
    </Pressable>
  );
}

export const LinkBtn = ({ label, onPress, color = C.ink }: { label: string; onPress: () => void; color?: string }) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingVertical: 8, alignSelf: 'center' }}>
    <Text style={{ color, fontWeight: '700', fontSize: 14 }}>{label}</Text>
  </Pressable>
);

export function Field({ label, error, ...input }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted }}>{label}</Text>
      <TextInput placeholderTextColor="#A9A5BF" {...input} style={[s.input, input.editable === false && { opacity: 0.6 }, input.style]} />
      {error ? <Text style={{ color: C.bad, fontSize: 13 }} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

export function Chips<T extends string | number>({ options, value, onChange, color = C.ink, multi }: {
  options: { value: T; label: string }[];
  value: T | T[];
  onChange: (v: T) => void;
  color?: string;
  multi?: boolean;
}) {
  const on = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Pressable key={String(o.value)} accessibilityRole="button" accessibilityState={{ selected: on(o.value) }} onPress={() => onChange(o.value)}
          style={[s.chip, on(o.value) && { backgroundColor: color, borderColor: color }]}>
          <Text style={{ fontWeight: '700', fontSize: 14, color: on(o.value) ? '#fff' : C.ink }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Pill({ label, tone = 'muted' }: { label: string; tone?: 'good' | 'bad' | 'warn' | 'gold' | 'muted' | 'white' }) {
  const map = { good: [C.good, '#E5F6EC'], bad: [C.bad, '#FCE9E9'], warn: [C.warn, '#FFF2DD'], gold: ['#8A5F00', C.goldSoft], muted: [C.muted, C.surface2], white: ['#fff', 'rgba(255,255,255,0.22)'] } as const;
  const [fg, bg] = map[tone];
  return <View style={{ backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' }}><Text style={{ color: fg, fontSize: 12, fontWeight: '800' }}>{label}</Text></View>;
}

const AV = ['#F2481F', '#2B55F5', '#0A9A6B', '#C2338A', '#E08A00', '#6A3DF2', '#0F8FD6'];
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const bg = AV[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function Bar({ value, color, track = C.line, height = 8 }: { value: number; color: string; track?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, height: '100%', backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export const Loading = () => <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={C.ink} /></View>;
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Card tint="#FCE9E9" style={{ gap: 8 }}>
    <Text style={{ color: C.bad, fontWeight: '700' }} accessibilityRole="alert">{message}</Text>
    {onRetry && <LinkBtn label="Try again" onPress={onRetry} color={C.bad} />}
  </Card>
);

const s = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.ink },
  footer: { paddingHorizontal: 20, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.bg },
  card: { backgroundColor: C.surface2, borderRadius: 20, padding: 16 },
  hero: { borderRadius: 26, padding: 20, overflow: 'hidden', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  heroRing: { position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 80, borderWidth: 18, borderColor: 'rgba(255,255,255,0.14)' },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, lineHeight: 32 },
  p: { fontSize: 15, lineHeight: 21, color: C.ink },
  btn: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnSmall: { height: 40, borderRadius: 12, paddingHorizontal: 14 },
  btnGhost: { backgroundColor: C.surface2 },
  btnText: { fontSize: 16, fontWeight: '800' },
  input: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface2, paddingHorizontal: 16, fontSize: 16, color: C.ink },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.bg },
});
