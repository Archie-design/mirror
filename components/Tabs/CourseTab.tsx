'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import QRCode from 'react-qr-code';
import { registerForCourse, getCourseAttendanceList } from '@/app/actions/course';
import { COURSE_INFO, type CourseKey } from '@/lib/courseConfig';
import { type CharacterStats } from '@/types';
import { ChevronLeft, MapPin, Clock, CalendarDays, QrCode, UserCheck } from 'lucide-react';

const Scanner = dynamic(() => import('@/app/class/checkin/Scanner'), { ssr: false });

const STORAGE_KEYS: Record<CourseKey, string> = {
    class_b: 'course_class_b_reg',
    class_c: 'course_class_c_reg',
};

type RegResult = { registrationId: string; userName: string };
type StudentView = 'select' | 'register' | 'qr';
type TabView = 'student' | 'volunteer_login' | 'volunteer_scanner';

interface CourseTabProps {
    userData: CharacterStats;
    volunteerPassword: string;
}

export default function CourseTab({ volunteerPassword }: CourseTabProps) {
    const [tabView, setTabView] = useState<TabView>('student');
    const [studentView, setStudentView] = useState<StudentView>('select');
    const [selectedCourse, setSelectedCourse] = useState<CourseKey | null>(null);

    const [regResults, setRegResults] = useState<Record<CourseKey, RegResult | null>>({
        class_b: null, class_c: null,
    });

    // Registration form state
    const [name, setName] = useState('');
    const [phone3, setPhone3] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    // Volunteer state
    const [volPassword, setVolPassword] = useState('');
    const [volAuthError, setVolAuthError] = useState('');
    const [volCourseKey, setVolCourseKey] = useState<CourseKey>('class_b');
    const [attendanceList, setAttendanceList] = useState<{ userId: string; userName: string; attendedAt: string }[]>([]);

    // Load from localStorage on mount
    useEffect(() => {
        const loaded: Record<CourseKey, RegResult | null> = { class_b: null, class_c: null };
        for (const key of Object.keys(STORAGE_KEYS) as CourseKey[]) {
            try {
                const raw = localStorage.getItem(STORAGE_KEYS[key]);
                if (raw) loaded[key] = JSON.parse(raw);
            } catch { /* ignore */ }
        }
        setRegResults(loaded);
    }, []);

    const handleSelectCourse = (key: CourseKey) => {
        setSelectedCourse(key);
        if (regResults[key]) {
            setStudentView('qr');
        } else {
            setName('');
            setPhone3('');
            setFormError('');
            setStudentView('register');
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCourse) return;
        setSubmitting(true);
        setFormError('');
        const res = await registerForCourse(name, phone3, selectedCourse);
        setSubmitting(false);
        if (!res.success) {
            setFormError(res.error);
            return;
        }
        const result: RegResult = { registrationId: res.registrationId, userName: res.userName };
        setRegResults(prev => ({ ...prev, [selectedCourse]: result }));
        try { localStorage.setItem(STORAGE_KEYS[selectedCourse], JSON.stringify(result)); } catch { /* ignore */ }
        setStudentView('qr');
    };

    const handleVolLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!volunteerPassword) {
            setVolAuthError('管理員尚未設定志工密碼，請聯繫工作人員');
            return;
        }
        if (volPassword !== volunteerPassword) {
            setVolAuthError('密碼錯誤');
            return;
        }
        setVolAuthError('');
        loadAttendance(volCourseKey);
        setTabView('volunteer_scanner');
    };

    const loadAttendance = useCallback(async (key: CourseKey) => {
        const list = await getCourseAttendanceList(key);
        setAttendanceList(list);
    }, []);

    const handleVolCourseChange = (key: CourseKey) => {
        setVolCourseKey(key);
        loadAttendance(key);
    };

    const courseKeys = Object.keys(COURSE_INFO) as CourseKey[];

    // ── Volunteer Scanner View ──────────────────────────────────────────────
    if (tabView === 'volunteer_scanner') {
        const info = COURSE_INFO[volCourseKey];
        return (
            <div className="px-4 pb-8 space-y-5 max-w-lg mx-auto">
                <div className="flex items-center gap-3 pt-4">
                    <button onClick={() => setTabView('student')} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white">
                        <ChevronLeft size={18} />
                    </button>
                    <div>
                        <p className="text-[10px] text-teal-400 font-black uppercase tracking-widest">志工模式</p>
                        <h2 className="text-lg font-black text-white">掃碼報到</h2>
                    </div>
                </div>

                {/* Course selector */}
                <div className="flex gap-2">
                    {courseKeys.map(key => (
                        <button
                            key={key}
                            onClick={() => handleVolCourseChange(key)}
                            className={`flex-1 py-2.5 rounded-2xl text-xs font-black transition-all ${
                                volCourseKey === key
                                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/30'
                                    : 'bg-slate-800 text-slate-400'
                            }`}
                        >
                            {COURSE_INFO[key].name}
                        </button>
                    ))}
                </div>

                <div className="bg-slate-900 border border-slate-700/50 rounded-3xl p-4 space-y-1 text-xs text-slate-400">
                    <p className="font-black text-white">{info.name}</p>
                    <p>{info.dateDisplay}・{info.time}</p>
                    <p>{info.location}</p>
                </div>

                <Scanner courseKey={volCourseKey} onCheckedIn={() => loadAttendance(volCourseKey)} />

                {/* Attendance list */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-teal-400 font-black text-xs uppercase tracking-widest">
                        <UserCheck size={13} /> 已報到（{attendanceList.length} 人）
                    </div>
                    {attendanceList.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-4">尚無報到記錄</p>
                    ) : (
                        <div className="bg-slate-900 border border-slate-700/40 rounded-2xl divide-y divide-slate-800 max-h-60 overflow-y-auto">
                            {attendanceList.map(r => (
                                <div key={r.userId} className="flex justify-between items-center px-4 py-2.5">
                                    <span className="text-sm font-bold text-white">{r.userName}</span>
                                    <span className="text-[10px] text-slate-500">
                                        {new Date(r.attendedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Volunteer Login View ────────────────────────────────────────────────
    if (tabView === 'volunteer_login') {
        return (
            <div className="px-4 pb-8 max-w-sm mx-auto space-y-6 pt-6">
                <div className="flex items-center gap-3">
                    <button onClick={() => setTabView('student')} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white">
                        <ChevronLeft size={18} />
                    </button>
                    <div>
                        <p className="text-[10px] text-teal-400 font-black uppercase tracking-widest">志工專區</p>
                        <h2 className="text-lg font-black text-white">掃碼報到入口</h2>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-700/50 rounded-3xl p-6 space-y-4">
                    <p className="text-xs text-slate-400">請輸入活動志工密碼以開啟掃碼功能。</p>
                    <form onSubmit={handleVolLogin} className="space-y-4">
                        <input
                            type="password"
                            value={volPassword}
                            onChange={e => { setVolPassword(e.target.value); setVolAuthError(''); }}
                            placeholder="志工密碼"
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white text-center font-bold outline-none focus:border-teal-500"
                            autoFocus
                        />
                        {volAuthError && <p className="text-xs text-red-400 text-center font-bold">{volAuthError}</p>}
                        <button
                            type="submit"
                            className="w-full bg-teal-600 py-3 rounded-2xl text-white font-black hover:bg-teal-500 active:scale-95 transition-all shadow-lg"
                        >
                            <QrCode size={14} className="inline mr-2" />進入掃碼模式
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // ── Student QR View ─────────────────────────────────────────────────────
    if (studentView === 'qr' && selectedCourse) {
        const reg = regResults[selectedCourse];
        const info = COURSE_INFO[selectedCourse];
        return (
            <div className="px-4 pb-8 max-w-sm mx-auto space-y-5 pt-4">
                <div className="flex items-center gap-3">
                    <button onClick={() => setStudentView('select')} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white">
                        <ChevronLeft size={18} />
                    </button>
                    <div>
                        <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">報名完成</p>
                        <h2 className="text-lg font-black text-white">{info.name}・入場 QR 碼</h2>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-700/50 rounded-3xl p-6 space-y-4 text-center">
                    <p className="text-sm font-black text-white">{reg?.userName}</p>
                    <div className="flex justify-center">
                        <div className="bg-white p-4 rounded-2xl shadow-xl">
                            {reg?.registrationId && (
                                <QRCode value={reg.registrationId} size={200} />
                            )}
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                        請截圖保存此 QR 碼<br />報到當天出示給志工掃描
                    </p>
                </div>

                <div className="bg-slate-900 border border-slate-700/40 rounded-2xl px-5 py-4 space-y-2 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                        <CalendarDays size={13} className="text-slate-500 shrink-0" />
                        <span>{info.dateDisplay}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Clock size={13} className="text-slate-500 shrink-0" />
                        <span>{info.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-slate-500 shrink-0" />
                        <span>{info.location}</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Registration Form ────────────────────────────────────────────────────
    if (studentView === 'register' && selectedCourse) {
        const info = COURSE_INFO[selectedCourse];
        return (
            <div className="px-4 pb-8 max-w-sm mx-auto space-y-5 pt-4">
                <div className="flex items-center gap-3">
                    <button onClick={() => setStudentView('select')} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white">
                        <ChevronLeft size={18} />
                    </button>
                    <div>
                        <p className="text-[10px] text-amber-400 font-black uppercase tracking-widest">課程報名</p>
                        <h2 className="text-lg font-black text-white">{info.name}</h2>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-700/40 rounded-2xl px-5 py-4 space-y-1.5 text-sm text-slate-300">
                    <div className="flex items-center gap-2"><CalendarDays size={13} className="text-slate-500 shrink-0" /><span>{info.dateDisplay}</span></div>
                    <div className="flex items-center gap-2"><Clock size={13} className="text-slate-500 shrink-0" /><span>{info.time}</span></div>
                    <div className="flex items-center gap-2"><MapPin size={13} className="text-slate-500 shrink-0" /><span>{info.location}</span></div>
                </div>

                <form onSubmit={handleRegister} className="bg-slate-900 border border-slate-700/50 rounded-3xl p-6 space-y-5">
                    <p className="text-xs text-slate-400">請填寫您的姓名及手機號碼末三碼以完成報名。</p>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">姓名</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="請輸入真實姓名"
                                required
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-amber-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">手機末三碼</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={3}
                                value={phone3}
                                onChange={e => setPhone3(e.target.value.replace(/\D/g, ''))}
                                placeholder="例：886"
                                required
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold text-center tracking-widest text-xl outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    {formError && (
                        <div className="bg-red-950/40 border border-red-500/30 rounded-2xl px-4 py-3">
                            <p className="text-xs text-red-400 font-bold text-center">{formError}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting || !name.trim() || phone3.length !== 3}
                        className="w-full bg-amber-600 py-4 rounded-2xl text-white font-black shadow-lg hover:bg-amber-500 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {submitting ? '報名中...' : '確認報名・取得 QR 碼'}
                    </button>
                </form>
            </div>
        );
    }

    // ── Course Selection (Default) ───────────────────────────────────────────
    return (
        <div className="px-4 pb-8 space-y-5 max-w-lg mx-auto pt-4">
            <div>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">2026 大無限開運親證班</p>
                <h2 className="text-xl font-black text-white">課程報名</h2>
            </div>

            <div className="space-y-3">
                {courseKeys.map(key => {
                    const info = COURSE_INFO[key];
                    const reg = regResults[key];
                    const isRegistered = !!reg;

                    return (
                        <div
                            key={key}
                            className={`rounded-3xl border-2 p-5 space-y-3 transition-all ${
                                isRegistered
                                    ? 'bg-gradient-to-br from-emerald-950/60 to-slate-900 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                                    : 'bg-slate-900 border-slate-700/50'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-black text-white text-base">{info.name}</h3>
                                        {isRegistered && (
                                            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-black rounded-lg shrink-0">已報名</span>
                                        )}
                                    </div>
                                    <div className="space-y-1 text-xs text-slate-400">
                                        <div className="flex items-center gap-1.5"><CalendarDays size={11} className="text-slate-500 shrink-0" />{info.dateDisplay}</div>
                                        <div className="flex items-center gap-1.5"><Clock size={11} className="text-slate-500 shrink-0" />{info.time}</div>
                                        <div className="flex items-center gap-1.5"><MapPin size={11} className="text-slate-500 shrink-0" />{info.location}</div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleSelectCourse(key)}
                                className={`w-full py-3 rounded-2xl font-black text-sm transition-all active:scale-95 ${
                                    isRegistered
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/30'
                                        : 'bg-amber-600 text-white hover:bg-amber-500 shadow-lg shadow-amber-900/20'
                                }`}
                            >
                                {isRegistered
                                    ? <><QrCode size={14} className="inline mr-1.5" />查看入場 QR 碼</>
                                    : '立即報名'}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Volunteer entry */}
            <div className="pt-2 text-center">
                <button
                    onClick={() => setTabView('volunteer_login')}
                    className="text-[11px] text-slate-600 hover:text-teal-400 font-bold transition-colors underline underline-offset-2"
                >
                    志工報到入口
                </button>
            </div>
        </div>
    );
}
