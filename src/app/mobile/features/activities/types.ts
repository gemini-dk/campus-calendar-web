'use client';

export type ActivityType = 'assignment' | 'memo';

export type ActivityStatus = 'pending' | 'done';

export type Activity = {
  id: string;
  title: string;
  notes: string;
  type: ActivityType;
  status: ActivityStatus;
  dueDate: string | null;
  classId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ActivityFormState = {
  title: string;
  notes: string;
  classId: string;
  dueDate: string;
  isCompleted: boolean;
};

export function createDefaultFormState(): ActivityFormState {
  return {
    title: '',
    notes: '',
    classId: '',
    dueDate: '',
    isCompleted: false,
  } satisfies ActivityFormState;
}

export function createFormStateFromActivity(activity: Activity): ActivityFormState {
  return {
    title: activity.title,
    notes: activity.notes,
    classId: activity.classId ?? '',
    dueDate: activity.dueDate ?? '',
    isCompleted: activity.status === 'done',
  } satisfies ActivityFormState;
}
