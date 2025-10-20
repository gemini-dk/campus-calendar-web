import type { ComponentType, ReactNode } from 'react';

export type TabId = 'home' | 'weekly' | 'calendar' | 'todo' | 'classes';

export type TabDefinition = {
  id: TabId;
  label: string;
  icon: ReactNode;
  Component: ComponentType;
};
