/**
 * 電話號碼標準化 (Standardization)
 * 解決 9 碼與 10 碼手機比對失敗問題，所有 UserID 比對前須執行：
 * 1. 移除所有非數字字元。
 * 2. 若長度為 10 且開頭為 '0'，則移除該 '0'。
 * 3. 統一以「9 碼字串」作為比對鍵值。
 */
export const standardizePhone = (phone: string): string => {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length === 10 && digitsOnly.startsWith('0')) {
        return digitsOnly.substring(1);
    }
    return digitsOnly;
};
