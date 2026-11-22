import { GlassTabBar } from '@/components/glass-tab-bar';
import { Icon, type IconName } from '@/components/icon';
import { Tabs } from 'expo-router';

import { useColors } from '@/lib/theme';


const TABS: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'home', title: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'posts', title: 'Posts', icon: 'images-outline', activeIcon: 'images' },
  { name: 'inbox', title: 'Inbox', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
  { name: 'calendar', title: 'Calendar', icon: 'calendar-outline', activeIcon: 'calendar' },
  { name: 'more', title: 'More', icon: 'grid-outline', activeIcon: 'grid' },
];

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused, size }) => (
              <Icon name={focused ? tab.activeIcon : tab.icon} size={size} color={color as string} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
