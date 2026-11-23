import type { IconName } from '@/components/icon';

/**
 * The automation steps a person can add and edit, mirroring the web editor
 * (gennit-app/components/automation/automation-types.ts and addComponent in
 * components/automation.tsx): the same types, subtypes, defaults and options.
 */

export type StepType = 'trigger' | 'action' | 'condition' | 'delay' | 'ai_generate' | 'transform' | 'http_request' | 'prompt' | 'upload';

export type StepOption = {
  type: StepType;
  subtype?: string;
  label: string;
  icon: IconName;
  /** Brand logo for the step's platform, when it has one. */
  platform?: string;
  /** A connected app's logo image. */
  logo?: string;
  initialData?: Record<string, unknown>;
};

type Subtype = { id: string; label: string; icon: IconName; platform?: string; toolkit?: string };

export const TRIGGERS: Subtype[] = [
  { id: 'schedule', label: 'Schedule', icon: 'time-outline' },
  { id: 'webhook', label: 'Webhook', icon: 'link-outline' },
  { id: 'manual', label: 'Manual trigger', icon: 'play-outline' },
  { id: 'form_submission', label: 'Form submitted', icon: 'clipboard-outline' },
  { id: 'whatsapp_message', label: 'WhatsApp message', icon: 'logo-whatsapp', platform: 'whatsapp' },
  { id: 'gmail_received', label: 'New email (Gmail)', icon: 'mail-outline', platform: 'gmail' },
  { id: 'outlook_email_received', label: 'New email (Outlook)', icon: 'mail-outline', platform: 'outlook' },
  { id: 'brevo_contact_added', label: 'New contact (Brevo)', icon: 'person-add-outline', platform: 'brevo' },
  { id: 'facebook_comment', label: 'Facebook comment', icon: 'logo-facebook', platform: 'facebook' },
  { id: 'facebook_message', label: 'Facebook message', icon: 'logo-facebook', platform: 'messenger' },
  { id: 'instagram_comment', label: 'Instagram comment', icon: 'logo-instagram', platform: 'instagram' },
  { id: 'instagram_dm', label: 'Instagram DM', icon: 'logo-instagram', platform: 'instagram' },
  { id: 'messenger_message', label: 'Messenger message', icon: 'chatbubble-outline', platform: 'messenger' },
  { id: 'calendar_event', label: 'Calendar event', icon: 'calendar-outline', platform: 'google_calendar' },
  { id: 'x_mention', label: 'X mention', icon: 'logo-x', platform: 'x' },
];

type ActionCategory = 'Messaging' | 'Social' | 'AI generation' | 'Productivity';

export const ACTIONS: (Subtype & { category: ActionCategory })[] = [
  { id: 'send_gmail', label: 'Send Gmail', icon: 'mail-outline', platform: 'gmail', category: 'Messaging' },
  { id: 'send_outlook_email', label: 'Send Outlook email', icon: 'mail-outline', platform: 'outlook', category: 'Messaging' },
  { id: 'send_brevo_email', label: 'Send Brevo email', icon: 'mail-outline', platform: 'brevo', category: 'Messaging' },
  { id: 'whatsapp_reply', label: 'Send WhatsApp message', icon: 'logo-whatsapp', platform: 'whatsapp', category: 'Messaging' },
  { id: 'whatsapp_template', label: 'Send WhatsApp template', icon: 'logo-whatsapp', platform: 'whatsapp', category: 'Messaging' },
  { id: 'messenger_reply', label: 'Send Messenger message', icon: 'chatbubble-outline', platform: 'messenger', category: 'Messaging' },
  { id: 'post_facebook', label: 'Post to Facebook', icon: 'logo-facebook', platform: 'facebook', category: 'Social' },
  { id: 'post_instagram', label: 'Post to Instagram', icon: 'logo-instagram', platform: 'instagram', category: 'Social' },
  { id: 'post_linkedin', label: 'Post to LinkedIn', icon: 'logo-linkedin', platform: 'linkedin', category: 'Social' },
  { id: 'post_x', label: 'Post to X', icon: 'logo-x', platform: 'x', category: 'Social' },
  { id: 'post_tiktok', label: 'Post to TikTok', icon: 'logo-tiktok', platform: 'tiktok', category: 'Social' },
  { id: 'post_youtube', label: 'Upload to YouTube', icon: 'logo-youtube', platform: 'youtube', category: 'Social' },
  { id: 'reply_facebook_comment', label: 'Reply to Facebook comment', icon: 'logo-facebook', platform: 'facebook', category: 'Social' },
  { id: 'reply_instagram_comment', label: 'Reply to Instagram comment', icon: 'logo-instagram', platform: 'instagram', category: 'Social' },
  { id: 'reply_linkedin_comment', label: 'Reply to LinkedIn comment', icon: 'logo-linkedin', platform: 'linkedin', category: 'Social' },
  { id: 'reply_youtube_comment', label: 'Reply to YouTube comment', icon: 'logo-youtube', platform: 'youtube', category: 'Social' },
  { id: 'update_facebook_post', label: 'Update Facebook post', icon: 'logo-facebook', platform: 'facebook', category: 'Social' },
  { id: 'update_youtube_video', label: 'Update YouTube video', icon: 'logo-youtube', platform: 'youtube', category: 'Social' },
  { id: 'update_pinterest_pin', label: 'Update Pinterest pin', icon: 'logo-pinterest', platform: 'pinterest', category: 'Social' },
  { id: 'delete_facebook_post', label: 'Delete Facebook post', icon: 'logo-facebook', platform: 'facebook', category: 'Social' },
  { id: 'delete_linkedin_post', label: 'Delete LinkedIn post', icon: 'logo-linkedin', platform: 'linkedin', category: 'Social' },
  { id: 'delete_youtube_video', label: 'Delete YouTube video', icon: 'logo-youtube', platform: 'youtube', category: 'Social' },
  { id: 'delete_pinterest_pin', label: 'Delete Pinterest pin', icon: 'logo-pinterest', platform: 'pinterest', category: 'Social' },
  { id: 'delete_tweet', label: 'Delete post on X', icon: 'logo-x', platform: 'x', category: 'Social' },
  { id: 'generate_image', label: 'Generate image', icon: 'image-outline', category: 'AI generation' },
  { id: 'generate_video', label: 'Generate video', icon: 'videocam', category: 'AI generation' },
  { id: 'generate_text', label: 'Generate text', icon: 'document-text-outline', category: 'AI generation' },
  { id: 'generate_audio', label: 'Generate audio', icon: 'mic', category: 'AI generation' },
  { id: 'generate_story_video', label: 'Generate story video', icon: 'film-outline', category: 'AI generation' },
  { id: 'add_calendar_event', label: 'Create calendar event', icon: 'calendar-outline', platform: 'google_calendar', category: 'Productivity' },
  { id: 'google_drive_upload', label: 'Upload to Drive', icon: 'cloud-upload-outline', platform: 'google_drive', category: 'Productivity' },
];

const TOOLKIT_FOR: Record<string, string> = { x: 'twitter', google_calendar: 'googlecalendar', google_drive: 'googledrive', messenger: 'facebook' };

/** Which connected account a step needs, as the web stores it on the step. */
function connection(platform?: string) {
  if (!platform) return undefined;
  return { connectionPlatform: platform, connectionToolkit: TOOLKIT_FOR[platform] ?? platform };
}

export const ADD_MENU: { label: string; items: StepOption[] }[] = [
  { label: 'Triggers', items: TRIGGERS.map((item) => ({ type: 'trigger', subtype: item.id, label: item.label, icon: item.icon, platform: item.platform, initialData: connection(item.platform) })) },
  ...(['Messaging', 'Social', 'AI generation', 'Productivity'] as ActionCategory[]).map((category) => ({
    label: category,
    items: ACTIONS.filter((item) => item.category === category).map<StepOption>((item) => ({
      type: 'action',
      subtype: item.id,
      label: item.label,
      icon: item.icon,
      platform: item.platform,
      initialData: connection(item.platform),
    })),
  })),
  {
    label: 'Logic',
    items: [
      { type: 'condition', label: 'If / else', icon: 'git-branch-outline' },
      { type: 'delay', label: 'Delay', icon: 'hourglass-outline' },
    ],
  },
  { label: 'AI', items: [{ type: 'ai_generate', label: 'AI generate', icon: 'ai-enhance' }, { type: 'prompt', label: 'AI instruction', icon: 'sparkles-outline' }] },
  {
    label: 'Data',
    items: [
      { type: 'transform', label: 'Transform', icon: 'swap-horizontal' },
      { type: 'http_request', label: 'HTTP request', icon: 'globe-outline' },
    ],
  },
  { label: 'Assets', items: [{ type: 'upload', label: 'Upload asset', icon: 'cloud-upload-outline' }] },
];

export const SCHEDULE_FREQUENCIES = [
  'Once',
  'Every 5 minutes',
  'Every 10 minutes',
  'Every 15 minutes',
  'Every 30 minutes',
  'Hourly',
  'Daily',
  'Every Monday',
  'Weekly',
  'Monthly',
  'Custom',
];
/** Frequencies that run at a time of day. */
export const CLOCK_FREQUENCIES = ['Daily', 'Every Monday', 'Weekly', 'Monthly'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const CONDITION_OPERATORS = [
  { id: 'equals', label: 'equals' },
  { id: 'not_equals', label: 'does not equal' },
  { id: 'contains', label: 'contains' },
  { id: 'not_contains', label: 'does not contain' },
  { id: 'greater_than', label: 'is greater than' },
  { id: 'less_than', label: 'is less than' },
  { id: 'is_empty', label: 'is empty' },
  { id: 'is_not_empty', label: 'is not empty' },
  { id: 'starts_with', label: 'starts with' },
  { id: 'ends_with', label: 'ends with' },
];

export const DELAY_UNITS = [
  { id: 'seconds', label: 'Seconds' },
  { id: 'minutes', label: 'Minutes' },
  { id: 'hours', label: 'Hours' },
  { id: 'days', label: 'Days' },
];

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const AI_CONTENT_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
];
export const ASPECT_RATIOS = ['auto', '16:9', '9:16', '1:1', '4:3'];
export const DYNAMIC_MODES = [
  { id: 'static', label: 'Same brief each run' },
  { id: 'new_each_run', label: 'New concept each run' },
  { id: 'continue_series', label: 'Continue the series' },
];

export function newStepId(type: string) {
  return `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A new step's data, with the same defaults the web editor gives it. */
export function newStepData(type: StepType, subtype: string | undefined, nodeId: string, initialData: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { title: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '), nodeId };
  switch (type) {
    case 'trigger':
      data.triggerType = subtype || 'schedule';
      data.scheduleFrequency = 'Every Monday';
      if (data.triggerType === 'schedule') {
        data.scheduleClock = '09:00';
        data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      }
      data.filterField = '';
      data.filterValue = '';
      if (subtype === 'composio_event') Object.assign(data, { composioToolkit: '', composioTriggerSlug: '', composioTriggerConfig: {} });
      break;
    case 'action':
      Object.assign(data, { actionType: subtype || 'send_gmail', dynamicMode: 'static', recipientEmail: '', subject: '', messageBody: '', contentText: '', instruction: '' });
      if (subtype === 'composio_action') Object.assign(data, { composioToolkit: '', composioToolSlug: '', composioToolArguments: {} });
      break;
    case 'prompt':
      data.instruction = '';
      break;
    case 'condition':
      Object.assign(data, { field: '', operator: 'equals', value: '' });
      break;
    case 'delay':
      Object.assign(data, { duration: 5, unit: 'minutes' });
      break;
    case 'ai_generate':
      Object.assign(data, { contentType: 'text', prompt: '', model: '', aspectRatio: '16:9', dynamicMode: 'static' });
      break;
    case 'transform':
      Object.assign(data, { mappings: [{ key: '', value: '' }], expression: '' });
      break;
    case 'http_request':
      Object.assign(data, { method: 'GET', url: '', headers: [], body: '' });
      break;
    case 'upload':
      break;
  }
  const label = type === 'trigger' ? TRIGGERS.find((item) => item.id === subtype)?.label : type === 'action' ? ACTIONS.find((item) => item.id === subtype)?.label : undefined;
  if (label) data.title = label;
  return { ...data, ...initialData };
}
