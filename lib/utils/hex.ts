export const axialToPixel = (q: number, r: number, size: number): { x: number, y: number } => ({
    x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
    y: size * (1.5 * r)
});

export const getHexPointsStr = (cx: number, cy: number, r: number): string => {
    let points = "";
    for (let i = 0; i < 6; i++) {
        const angle_rad = (Math.PI / 180) * (60 * i - 30);
        points += `${cx + r * Math.cos(angle_rad)},${cy + r * Math.sin(angle_rad)} `;
    }
    return points;
};

export const getHexRegion = (radius: number): { q: number, r: number }[] => {
    const results: { q: number, r: number }[] = [];
    for (let q = -radius; q <= radius; q++) {
        for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
            results.push({ q, r });
        }
    }
    return results;
};

export const getHexDist = (q1: number, r1: number, q2: number, r2: number): number => {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
};
