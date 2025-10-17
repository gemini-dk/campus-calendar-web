import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type { ComponentType } from 'react';

export type TabId = 'home' | 'calendar' | 'todo' | 'classes';

export type TabDefinition = {
  id: TabId;
  label: string;
  icon: IconDefinition;
  Component: ComponentType;
};
