import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, useColorScheme, View } from 'react-native';

import { space } from '@/lib/theme';

import { Drawer } from './drawer';
import { useInDrawer } from './drawer-context';
import { SelectField } from './kit';
import { Button } from './ui';

type Mode = 'date' | 'datetime' | 'time';

function label(value: Date | null, mode: Mode) {
  if (!value) return '';
  if (mode === 'date') return value.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  if (mode === 'time') return value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return value.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * A date (and optionally time) input. iOS picks in a drawer; Android uses the
 * system pickers, which are its native way to choose a date.
 */
export function DateField({
  label: fieldLabel,
  value,
  onChange,
  mode = 'datetime',
  minimumDate,
  error,
  placeholder = 'Choose a date',
}: {
  label?: string;
  value: Date | null;
  onChange: (value: Date) => void;
  mode?: Mode;
  minimumDate?: Date;
  error?: string;
  placeholder?: string;
}) {
  const scheme = useColorScheme();
  // Inside a drawer, a second drawer would dismiss the first (and this field with it),
  // so the picker opens in place under the field instead.
  const inDrawer = useInDrawer();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? new Date());

  const openPicker = () => {
    const start = value ?? minimumDate ?? new Date();
    if (Platform.OS === 'android') {
      // Android has no combined picker: ask for the date, then the time.
      DateTimePickerAndroid.open({
        value: start,
        mode: mode === 'time' ? 'time' : 'date',
        minimumDate,
        onChange: (event, picked) => {
          if (event.type !== 'set' || !picked) return;
          if (mode !== 'datetime') return onChange(picked);
          DateTimePickerAndroid.open({
            value: picked,
            mode: 'time',
            onChange: (timeEvent, time) => {
              if (timeEvent.type === 'set' && time) onChange(time);
            },
          });
        },
      });
      return;
    }
    setDraft(start);
    setOpen((current) => (inDrawer ? !current : true));
  };

  if (Platform.OS === 'ios' && inDrawer) {
    return (
      <View style={{ gap: space.sm }}>
        <SelectField label={fieldLabel} value={label(value, mode)} placeholder={placeholder} onPress={openPicker} error={error} />
        {open ? (
          <View style={{ alignItems: 'center' }}>
            <DateTimePicker
              value={value ?? draft}
              mode={mode}
              display={mode === 'date' ? 'inline' : 'spinner'}
              minimumDate={minimumDate}
              themeVariant={scheme === 'dark' ? 'dark' : 'light'}
              onChange={(_, picked) => {
                if (!picked) return;
                onChange(picked);
                // A date pick is complete; time and date-time spinners stay open to adjust.
                if (mode === 'date') setOpen(false);
              }}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <SelectField label={fieldLabel} value={label(value, mode)} placeholder={placeholder} onPress={openPicker} error={error} />
      {Platform.OS === 'ios' ? (
        <Drawer
          visible={open}
          onClose={() => setOpen(false)}
          title={fieldLabel ?? 'Choose a date'}
          footer={
            <Button
              title='Done'
              onPress={() => {
                onChange(draft);
                setOpen(false);
              }}
            />
          }
        >
          <View style={{ alignItems: 'center', paddingBottom: space.sm }}>
            <DateTimePicker
              value={draft}
              mode={mode}
              display={mode === 'date' ? 'inline' : 'spinner'}
              minimumDate={minimumDate}
              themeVariant={scheme === 'dark' ? 'dark' : 'light'}
              onChange={(_, picked) => picked && setDraft(picked)}
            />
          </View>
        </Drawer>
      ) : null}
    </>
  );
}
