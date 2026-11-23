import { Icon } from '@/components/icon';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Page } from '@/components/kit';
import { useAuth } from '@/features/auth/auth-context';
import { createChatProject, projectKey, startAgentRun } from '@/features/chat/chat-api';
import { Composer, type SendInput } from '@/features/chat/composer';
import { updateRun } from '@/features/chat/use-chat-live';
import { currentOrganization } from '@/features/orgs/orgs-api';
import { radius, space, useColors } from '@/lib/theme';

/** Starting points from the web chat, which fill the box rather than send. */
const IDEAS = [
  // { icon: 'logo-instagram', text: 'Create a viral Instagram carousel' },
  // { icon: 'megaphone-outline', text: 'Generate scroll-stopping Facebook ads' },
  // { icon: 'logo-youtube', text: 'Design a clickable YouTube thumbnail' },
  { icon: 'calendar-outline', text: 'Plan next week’s posts across my channels' },
  { icon: 'mail-outline', text: 'Summarize my unread emails and draft replies' },
  { icon: 'git-network-outline', text: 'Automate a welcome message for new leads' },
  // { icon: 'film-outline', text: 'Generate an engaging video ad' },
  { icon: 'search-outline', text: 'Research my top 3 competitors' },
] as const;

export default function NewChatScreen() {
  const params = useLocalSearchParams<{ prompt?: string; category?: string; reference?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const org = currentOrganization(user);
  const [draft, setDraft] = useState(params.prompt ?? '');
  // A community design opened with "Make my version" goes with the first message as the reference.
  const [reference, setReference] = useState<string | null>(params.reference ?? null);

  const start = async ({ prompt, text, attachedFiles, agentModelId, useBrandIdentity }: SendInput) => {
    if (!user) return;
    const project = await createChatProject({
      prompt: text,
      userId: user._id,
      userName: org?.businessName || user.username || 'Your brand',
      category: params.category === 'automation' ? 'automation' : 'auto',
      useBrandIdentity,
    });
    queryClient.setQueryData(projectKey(project._id), project);
    // The same request id the web uses for a new chat's first message, so a retry can't start it twice.
    const runId = await startAgentRun({ projectId: project._id, prompt, requestId: `initial:${project._id}`, attachedFiles, useBrandIdentity, agentModelId });
    updateRun(queryClient, project._id, runId, (run) => ({ ...run, prompt, attachedFiles, status: 'running' }), prompt);
    queryClient.invalidateQueries({ queryKey: ['history'] });
    router.replace({ pathname: '/chat/[id]', params: { id: project._id } });
  };

  const greeting = user?.username ? `Hi ${user.username.split(/\s+/)[0]}` : 'Hi there';

  return (
    <Page
      title='New chat'
      back={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      actions={<IconButton icon='time-outline' label='All chats' onPress={() => router.push('/history')} />}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps='handled' contentContainerStyle={{ padding: space.page, gap: space.xl }}>
          <View style={{ gap: space.xs }}>
            <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: colors.text }}>{greeting}</Text>
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
              Genit’s agents create, automate and run your business tasks{org?.businessName ? ` for ${org.businessName}` : ''}. What should we do?
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {IDEAS.map((idea) => (
              <Pressable
                key={idea.text}
                accessibilityRole='button'
                accessibilityHint='Puts this in the message box'
                onPress={() => setDraft(idea.text)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: space.md,
                  paddingVertical: 9,
                  borderRadius: radius.full,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfacePressed : colors.background,
                })}
              >
                <Icon name={idea.icon} size={15} color={colors.textMuted} />
                <Text style={{ fontSize: 13.5, color: colors.text }}>{idea.text}</Text>
              </Pressable>
            ))}
          </View>

        </ScrollView>
        <View style={{ paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: Math.max(insets.bottom, space.md) }}>
          <Composer
            value={draft}
            onChangeText={setDraft}
            onSend={start}
            autoFocus={!!params.prompt || !!params.reference}
            placeholder={reference ? 'Describe your version…' : undefined}
            inspiration={reference}
            onRemoveInspiration={() => setReference(null)}
          />
        </View>
      </KeyboardAvoidingView>
    </Page>
  );
}
