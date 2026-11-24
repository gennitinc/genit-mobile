import { useState } from 'react';
import { Text, View } from 'react-native';
import { Drawer } from '@/components/drawer';
import { Banner, Button, Field } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { space, useColors } from '@/lib/theme';

export function ReportButton({ kind, contentId, label = 'Report content' }: { kind: 'ai' | 'community' | 'support'; contentId: string; label?: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    if (!details.trim()) { setError('Please describe the problem.'); return; }
    setBusy(true); setError('');
    try {
      await api('safety/reports', { body: { kind, contentId, reason: kind === 'support' ? 'Support request' : 'Inappropriate or unsafe content', details } });
      setSent(true);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };
  return <>
    <Button small variant='ghost' title={label} onPress={() => { setSent(false); setError(''); setOpen(true); }} />
    <Drawer visible={open} onClose={() => setOpen(false)} title={label} footer={<Button title={sent ? 'Done' : 'Send report'} loading={busy} onPress={sent ? () => setOpen(false) : send} />}>
      <View style={{ gap: space.md }}>
        {sent ? <Text style={{ color: colors.text }}>Your report has been received for review. Thank you.</Text> : <>
          <Text style={{ color: colors.textMuted }}>Tell us what is wrong. The content reference and your account contact details will be sent to Genit’s support team.</Text>
          <Field label='Details' multiline maxLength={4000} value={details} onChangeText={setDetails} placeholder='Describe the issue…' />
          <Banner message={error} />
        </>}
      </View>
    </Drawer>
  </>;
}
