export const OZ_TIERS = [
    { level: 4, minScore: 240000, src: '/icons/oz-4-mirror.png',  label: '合・鏡中自照' },
    { level: 3, minScore: 180000, src: '/icons/oz-3-wizard.png',  label: '轉・大法師顯靈' },
    { level: 2, minScore:  90000, src: '/icons/oz-2-journey.png', label: '承・旅伴同行' },
    { level: 1, minScore:      0, src: '/icons/oz-1-start.png',   label: '起・踏上旅程' },
] as const;

export type OzTier = typeof OZ_TIERS[number];

export function getOzTier(score: number): OzTier {
    return OZ_TIERS.find(t => score >= t.minScore) ?? OZ_TIERS[3];
}
