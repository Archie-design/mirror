import type { CourseEvent } from '@/types';

// 當 SystemSettings.CourseEvents 尚未設定時的預設值
export const DEFAULT_COURSE_EVENTS: CourseEvent[] = [
    {
        id: 'class_b',
        name: '大師覺醒講座',
        date: '2026-06-23',
        dateDisplay: '2026年6月23日（二）',
        time: '19:00–21:40',
        location: 'Ticc 國際會議中心 201室',
        enabled: true,
    },
    {
        id: 'class_c',
        name: '畢業典禮暨慶典',
        date: '2026-07-24',
        dateDisplay: '2026年7月24日（五）',
        time: '19:00–21:40',
        location: '新莊頤品飯店',
        enabled: true,
    },
];

// 向下相容：CourseTab 的 localStorage key 規則
export function courseLocalStorageKey(eventId: string): string {
    return `course_${eventId}_reg`;
}
