## 1. DB 與型別基礎

- [x] 1.1 新增 migration 檔案 `supabase/migrations/202505030001_add_is_admin_column.sql`（ALTER TABLE CharacterStats ADD COLUMN IsAdmin BOOLEAN NOT NULL DEFAULT false + index）
- [x] 1.2 在 `types/index.ts` 的 `CharacterStats` interface 中加入 `IsAdmin?: boolean`

## 2. 共用 Token 模組

- [x] 2.1 新增 `lib/admin-token.ts`，導出 `ADMIN_COOKIE`、`ADMIN_TTL_SECONDS`、`computeAdminToken()`
- [x] 2.2 修改 `app/actions/admin-auth.ts`：移除本地常數與 `adminToken()`，改從 `lib/admin-token.ts` import，行為不變

## 3. LINE OAuth 擴充

- [x] 3.1 修改 `app/api/auth/line/route.ts`：加入 `action === 'admin_login'` 分支（用 `signPayload({ action: 'admin_login', nonce }, 600)` 產生 state）
- [x] 3.2 修改 `app/api/auth/line/callback/route.ts`：
  - 更新 `LineState` 型別加入 `'admin_login'`
  - 加入 `else if (parsed.action === 'admin_login')` branch：查 `CharacterStats` IsAdmin，設 `admin_session` cookie，redirect `/?admin_auth=1` 或 `/?admin_auth=error&reason=...`

## 4. Server Action 擴充

- [x] 4.1 修改 `app/actions/admin.ts` 的 `listAllMembers()`：SELECT 加入 `IsAdmin` 欄位
- [x] 4.2 在 `app/actions/admin.ts` 新增 `setMemberAdminStatus(targetUserId, isAdmin)`：驗 session、檢查 LineUserId（isAdmin=true 時）、UPDATE IsAdmin、寫 AdminActivityLog

## 5. AdminDashboard UI

- [x] 5.1 修改 `components/Admin/AdminDashboard.tsx` 的 `MemberRow` interface：加 `IsAdmin?: boolean`
- [x] 5.2 修改登入表單（`!adminAuth` 分支）：加「以 LINE 帳號登入」`<a>` 按鈕（href=`/api/auth/line?action=admin_login`）；密碼 form 改為收合在「緊急備用入口」toggle 後（新增 `showFallback` state）
- [x] 5.3 在 Tab I 成員 row 加入「管理員」badge（IsAdmin=true 時顯示）
- [x] 5.4 在 Tab I 成員 row 加入管理員 toggle 按鈕（ShieldCheck icon）與確認 dialog（含未綁定 LINE 警告）
- [x] 5.5 在 AdminDashboard import 中加入 `setMemberAdminStatus`

## 6. page.tsx callback 處理

- [x] 6.1 修改 `app/page.tsx` init useEffect：在 line_auth / line_error 判斷前插入 `admin_auth` param 處理（`admin_auth=1` → `setView('admin')`；`admin_auth=error` → `setModalMessage` 顯示對應錯誤）

## 7. 驗收

- [x] 7.1 `npx tsc --noEmit` 零錯誤
- [ ] 7.2 手動在 Supabase dashboard 將一位已綁定 LINE 的學員 IsAdmin 設為 true，用 LINE 登入後台成功（需部署後手動驗收）
- [ ] 7.3 IsAdmin=false 的帳號登入後看到「無管理員權限」錯誤（需部署後手動驗收）
- [ ] 7.4 密碼備用入口點擊「緊急備用入口」後展開，正確密碼可登入（需部署後手動驗收）
- [ ] 7.5 Tab I 管理員 badge 正確顯示；授予/撤銷操作後 AdminActivityLog 有紀錄（需部署後手動驗收）
- [ ] 7.6 未綁定 LINE 的學員被設為管理員時 server 拒絕，UI 顯示錯誤（需部署後手動驗收）
