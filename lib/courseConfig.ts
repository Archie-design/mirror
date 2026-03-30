export const COURSE_INFO = {
    class_b: {
        name: '大師電影講座',
        date: '2026-06-23',
        dateDisplay: '2026年6月23日（二）',
        time: '19:00–21:40',
        location: 'Ticc 國際會議中心 201室',
    },
    class_c: {
        name: '殺青酒暨首映會',
        date: '2026-07-25',
        dateDisplay: '2026年7月25日（六）',
        time: '13:00–17:30',
        location: '新莊頤品飯店',
    },
} as const;

export type CourseKey = keyof typeof COURSE_INFO;
