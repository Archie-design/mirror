export function escapeCsv(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

export function formatCsvRows(rows: Array<Array<string | number | null>>): string {
    return rows.map(row => row.map(escapeCsv).join(',')).join('\n');
}
