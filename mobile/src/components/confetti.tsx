import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const COLORS = ['#F5A800', '#F2481F', '#2B55F5', '#0A9A6B', '#7A3DF2', '#D6338F', '#FFFFFF'];

/**
 * A burst of confetti over the whole screen. Change `fire` (e.g. a counter) to launch another burst.
 * Skipped when the phone's "reduce motion" setting is on.
 */
export function Confetti({ fire, count = 90 }: { fire: number; count?: number }) {
  const [reduce, setReduce] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const { width, height } = Dimensions.get('window');
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 160,
        delay: Math.random() * 0.25,
        size: 6 + Math.random() * 7,
        spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
        color: COLORS[i % COLORS.length],
      })),
    // a fresh set of pieces for each burst
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fire, count, width],
  );

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);

  useEffect(() => {
    if (!fire || reduce) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fire, reduce, progress]);

  if (!fire || reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const t = progress.interpolate({ inputRange: [p.delay, 1], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: -20,
              width: p.size,
              height: p.size * 0.5,
              borderRadius: 1,
              backgroundColor: p.color,
              opacity: t.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
