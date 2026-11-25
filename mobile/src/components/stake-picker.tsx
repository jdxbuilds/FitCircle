import { Pressable, Text, View } from 'react-native';
import { C, STAKES, num } from '@/lib/theme';
import { Note } from './ui';

/** Stake amounts (or none). People under 18 can only run without stakes. */
export function StakePicker({ value, onChange, canStake, color = C.ink }: {
  value: number | null;
  onChange: (v: number | null) => void;
  canStake: boolean;
  color?: string;
}) {
  if (!canStake) return <Note icon="🛡">Staked challenges are for ages 18 and up. This one runs without money: pride is the stake.</Note>;
  const opt = (v: number | null, label: string, sub?: string) => {
    const on = value === v;
    return (
      <Pressable key={String(v)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(v)}
        style={{ width: '31%', paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', borderColor: on ? color : C.line, backgroundColor: on ? color : C.bg }}>
        <Text style={{ fontWeight: '800', fontSize: 16, color: on ? '#fff' : C.ink }}>{label}</Text>
        {sub && <Text style={{ fontSize: 11, color: on ? '#fff' : C.muted }}>{sub}</Text>}
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
      {STAKES.map((a) => opt(a, num(a), 'KES'))}
      {opt(null, 'No stake', 'pride only')}
    </View>
  );
}
