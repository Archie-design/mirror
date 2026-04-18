'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback } from 'react';
import { getCourseAttendanceList } from '@/app/actions/course';
import { COURSE_INFO, type CourseKey } from '@/lib/courseConfig';
import { loginAdmin } from '@/app/actions/admin-auth';

// Load Scanner client-side only (uses browser camera APIs)
const Scanner = dynamic(() => import('./Scanner'), { ssr: false });

export default function CheckinPage() {
    const [password, setPassword] = useState('');
    const [authed, setAuthed] = useState(false);
    const [authError, setAuthError] = useState('');
    const [courseKey, setCourseKey] = useState<CourseKey>('class_b');
    const [attendanceList, setAttendanceList] = useState<{ userId: string; userName: string; attendedAt: string }[]>([]);
    const [listLoaded, setListLoaded] = useState(false);

    async function loadList(key: CourseKey) {
        const list = await getCourseAttendanceList(key);
        setAttendanceList(list);
        setListLoaded(true);
    }

    async function handleAuth(e: React.FormEvent) {
        e.preventDefault();
        const res = await loginAdmin(password);
        if (res.success) {
            setAuthed(true);
            setAuthError('');
            loadList(courseKey);
        } else {
            setAuthError('密碼錯誤');
        }
    }

    function handleCourseChange(key: CourseKey) {
        setCourseKey(key);
        setListLoaded(false);
        loadList(key);
    }

    const handleCheckedIn = useCallback(() => {
        loadList(courseKey);
    }, [courseKey]);

    if (!authed) {
        return (
            <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
                <div className="w-full max-w-xs space-y-5">
                    <div className="text-center space-y-1">
                        <p className="text-xs font-black text-amber-400 uppercase tracking-widest">管理員專區</p>
                        <h1 className="text-xl font-black text-white">掃碼報到系統</h1>
                    </div>
                    <form onSubmit={handleAuth} className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-300 block">管理員密碼</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="請輸入密碼"
                                required
                                autoFocus
                                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 min-h-[44px]"
                            />
                        </div>
                        {authError && (
                            <p className="text-xs text-red-400">{authError}</p>
                        )}
                        <button
                            type="submit"
                            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-black rounded-xl py-3 text-sm transition-colors min-h-[44px]"
                        >
                            解鎖
                        </button>
                    </form>
                </div>
            </main>
        );
    }

    const courseInfo = COURSE_INFO[courseKey];

    return (
        <main className="min-h-screen bg-slate-950 px-4 py-8">
            <div className="max-w-lg mx-auto space-y-5">
                {/* Header */}
                <div className="text-center space-y-1">
                    <p className="text-xs font-black text-amber-400 uppercase tracking-widest">管理員・掃碼報到</p>
                    <h1 className="text-xl font-black text-white">親證班報到系統</h1>
                </div>

                {/* Course selector */}
                <div className="flex gap-2">
                    {(['class_b', 'class_c'] as CourseKey[]).map(key => (
                        <button
                            key={key}
                            onClick={() => handleCourseChange(key)}
                            className={`flex-1 py-3 rounded-xl text-sm font-black transition-all min-h-[44px] ${
                                courseKey === key
                                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                                    : 'bg-slate-800 text-slate-400'
                            }`}
                        >
                            {COURSE_INFO[key].name}
                            <span className="block text-[10px] font-normal opacity-70">{COURSE_INFO[key].dateDisplay}</span>
                        </button>
                    ))}
                </div>

                {/* Location reminder */}
                <p className="text-xs text-center text-slate-500">📍 {courseInfo.location}・{courseInfo.time}</p>

                {/* QR Scanner */}
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
                    <Scanner courseKey={courseKey} onCheckedIn={handleCheckedIn} />
                </div>

                {/* Attendance list */}
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-slate-300 uppercase tracking-widest">已報到名單</p>
                        <span className="text-xs font-black text-amber-400">{attendanceList.length} 人</span>
                    </div>
                    {!listLoaded ? (
                        <p className="text-xs text-slate-500 text-center py-2">載入中…</p>
                    ) : attendanceList.length === 0 ? (
                        <p className="text-xs text-slate-600 text-center py-2">尚無報到記錄</p>
                    ) : (
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                            {attendanceList.map((item, i) => (
                                <div key={item.userId} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-600 w-5 text-right">{i + 1}</span>
                                        <span className="text-sm text-white font-medium">{item.userName}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500">
                                        {new Date(item.attendedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
