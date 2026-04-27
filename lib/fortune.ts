import type { CompanionType } from '@/lib/constants';

export const FORTUNE_COMPANIONS = [
    { key: 'career',       dbCol: 'Score_事業運', companion: '事業運' as CompanionType, name: '小草', color: '#27AE60', desc: '事業・工作' },
    { key: 'wealth',       dbCol: 'Score_財富運', companion: '財富運' as CompanionType, name: '小獅', color: '#F39C12', desc: '財富・金錢' },
    { key: 'relationship', dbCol: 'Score_情感運', companion: '情感運' as CompanionType, name: '小鐵', color: '#95A5A6', desc: '情感・人際' },
    { key: 'family',       dbCol: 'Score_家庭運', companion: '家庭運' as CompanionType, name: '翡翠城', color: '#1A6B4A', desc: '家庭・根源' },
    { key: 'health',       dbCol: 'Score_體能運', companion: '體能運' as CompanionType, name: '小桃', color: '#5DADE2', desc: '體能・健康' },
] as const;

export function getLowestFortune(scores: Record<string, number>) {
    return FORTUNE_COMPANIONS.reduce((lowest, f) =>
        scores[f.key] < scores[lowest.key] ? f : lowest
    , FORTUNE_COMPANIONS[0]);
}
