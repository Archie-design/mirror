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

    const [name, setName] = useState('');
    const [phone3, setPhone3] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const [volPassword, setVolPassword] = useState('');
    const [volAuthError, setVolAuthError] = useState('');
    const [volCourseKey, setVolCourseKey] = useState<CourseKey>('class_b');
    const [attendanceList, setAttendanceList] = useState<{ userId: string; userName: string; attendedAt: string }[]>([]);

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
        if (!res.success) { setFormError(res.error); return; }
        const result: RegResult = { registrationId: res.registrationId, userName: res.userName };
        setRegResults(prev => ({ ...prev, [selectedCourse]: result }));
        try { localStorage.setItem(STORAGE_KEYS[selectedCourse], JSON.stringify(result)); } catch { /* ignore */ }
        setStudentView('qr');
    };

    const handleVolLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!volunteerPassword) { setVolAuthError('管理員尚未設定場務密碼，請聯繫工作人員'); return; }
        if (volPassword !== volunteerPassword) { setVolAuthError('密碼錯誤'); return; }
        setVolAuthError('');
        loadAttendance(volCourseKey);
        setTabView('volunteer_scanner');
    };

    const loadAttendance = useCallback(async (key: CourseKey) => {
        const list = await getCourseAttendanceList(key, volPassword);
        setAttendanceList(list);
    }, [volPassword]);

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
                    <button onClick={() => setTabView('student')} className="p-2 bg-[#1A6B4A] rounded-xl text-white/70 hover:text-white active:scale-95 transition-all">
                        <ChevronLeft size={18} />
                    </button>
                    <div>
                        <p className="text-[10px] text-[#F5C842] font-black uppercase tracking-widest">場務夥伴模式</p>
                        <h2 className="text-lg font-black text-[#1A2A1A]">掃碼報到</h2>
                    </div>
                </div>

                <div className="flex gap-2">
                    {courseKeys.map(key => (
                        <button
                            key={key}
                            onClick={() => handleVolCourseChange(key)}
                            className={`flex-1 py-2.5 rounded-2xl text-xs font-black transition-all ${
                                volCourseKey === key
                                    ? 'bg-[#1A6B4A] text-white shadow-lg'
                                    : 'bg-[#F5FAF7] text-[#5A7A5A] border border-[#B2DFC0]'
                            }`}
                        >
                            {COURSE_INFO[key].name}
                        </button>
                    ))}
                </div>

                <div className="bg-white border border-[#B2DFC0] rounded-3xl p-4 space-y-1 text-xs text-[#5A7A5A]">
                    <p className="font-black text-[#1A2A1A]">{info.name}</p>
                    <p>{info.dateDisplay}・{info.time}</p>
                    <p>{info.location}</p>
                </div>

                <Scanner courseKey={volCourseKey} onCheckedIn={() => loadAttendance(volCourseKey)} volunteerPassword={volPassword} />

                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[#1A6B4A] font-black text-xs uppercase tracking-widest">
                        <UserCheck size={13} /> 已報到（{attendanceList.length} 人）
                    </div>
                    {attendanceList.length === 0 ? (
                        <p className="text-xs text-[#8FAF8F] text-center py-4">尚無報到記錄</p>
                    ) : (
                        <div className="bg-white border border-[#B2DFC0] rounded-2xl divide-y divide-[#D4ECD9] max-h-60 overflow-y-auto">
                            {attendanceList.map(r => (
                                <div key={r.userId} className="flex justify-between items-center px-4 py-2.5">
                                    <span className="text-sm font-bold text-[#1A2A1A]">{r.userName}</span>
                                    <span className="text-[10px] text-[#8FAF8F]">
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
                    <button onClick={() => setTabView('student')} className="p-2 bg-[#F5FAF7] border border-[#B2DFC0] rounded-xl text-[#5A7A5A] hover:text-[#1A6B4A] active:scale-95 transition-all">
                        <ChevronLeft size={18} />
                    </button>
                    <div>
                        <p className="text-[10px] text-[#F5C842] font-black uppercase tracking-widest">場務後台</p>
                        <h2 className="text-lg font-black text-[#1A2A1A]">掃碼報到入口</h2>
                    </div>
                </div>

                <div className="bg-white border-2 border-[#B2DFC0] rounded-3xl p-6 space-y-4">
                    <p className="text-xs text-[#5A7A5A]">請輸入場務夥伴密碼以開啟掃碼功能。</p>
                    <form onSubmit={handleVolLogin} className="space-y-4">
                        <input
                            type="password"
                            value={volPassword}
                            onChange={e => { setVolPassword(e.target.value); setVolAuthError(''); }}
                            placeholder="場務夥伴密碼"
                            className="w-full bg-[#F5FAF7] border-2 border-[#B2DFC0] rounded-2xl p-4 text-[#1A2A1A] text-center font-bold outline-none focus:border-[#1A6B4A] transition-colors"
                            autoFocus
                        />
                        {volAuthError && <p className="text-xs text-[#C0392B] text-center font-bold">{volAuthError}</p>}
                        <button
                            type="submit"
                            className="w-full bg-[#1A6B4A] py-3 rounded-2xl text-white font-black hover:bg-[#155a3c] active:scale-95 transition-all shadow-lg"
                        >
                            <QrCode size={14} className="inline mr-2" />進入場務掃描模式
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
                    <button onClick={() => setStudentView('select')} className="p-2 bg-[#F5FAF7] border border-[#B2DFC0] rounded-xl text-[#5A7A5A] hover:text-[#1A6B4A] active:scale-95 transition-all">
                        <ChevronLeft size={18} />
                    </button>
                    <div>
                        <p className="text-[10px] text-[#F5C842] font-black uppercase tracking-widest">報名完成</p>
                        <h2 className="text-lg font-black text-[#1A2A1A]">{info.name}・入場憑證</h2>
                    </div>
                </div>

                <div className="bg-white border-2 border-[#B2DFC0] rounded-3xl p-6 space-y-4 text-center shadow-md">
                    <p className="text-base font-black text-[#1A2A1A]">{reg?.userName}</p>
                    <div className="flex justify-center">
                        <div className="bg-white p-4 rounded-2xl shadow-lg border-2 border-[#D4ECD9]">
                            {reg?.registrationId && <QRCode value={reg.registrationId} size={200} />}
                        </div>
                    </div>
                    <p className="text-[10px] text-[#8FAF8F] leading-relaxed">
                        請截圖保存此入場憑證<br />場次當天出示給場務夥伴掃描
                    </p>
                </div>

                <div className="bg-[#F5FAF7] border border-[#B2DFC0] rounded-2xl px-5 py-4 space-y-2 text-sm text-[#5A7A5A]">
                    <div className="flex items-center gap-2"><CalendarDays size={13} className="text-[#1A6B4A] shrink-0" /><span>{info.dateDisplay}</span></div>
                    <div className="flex items-center gap-2"><Clock size={13} className="text-[#1A6B4A] shrink-0" /><span>{info.time}</span></div>
                    <div className="flex items-center gap-2"><MapPin size={13} className="text-[#1A6B4A] shrink-0" /><span>{info.location}</span></div>
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
                    <button onClick={() => setStudentView('select')} className="p-2 bg-[#F5FAF7] border border-[#B2DFC0] rounded-xl text-[#5A7A5A] hover:text-[#1A6B4A] active:scale-95 transition-all">
                        <ChevronLeft size={18} />
                    </button>
                    <div>
                        <p className="text-[10px] text-[#1A6B4A] font-black uppercase tracking-widest">慶典報名</p>
                        <h2 className="text-lg font-black text-[#1A2A1A]">{info.name}</h2>
                    </div>
                </div>

                <div className="bg-[#F5FAF7] border border-[#B2DFC0] rounded-2xl px-5 py-4 space-y-1.5 text-sm text-[#5A7A5A]">
                    <div className="flex items-center gap-2"><CalendarDays size={13} className="text-[#1A6B4A] shrink-0" /><span>{info.dateDisplay}</span></div>
                    <div className="flex items-center gap-2"><Clock size={13} className="text-[#1A6B4A] shrink-0" /><span>{info.time}</span></div>
                    <div className="flex items-center gap-2"><MapPin size={13} className="text-[#1A6B4A] shrink-0" /><span>{info.location}</span></div>
                </div>

                <form onSubmit={handleRegister} className="bg-white border-2 border-[#B2DFC0] rounded-3xl p-6 space-y-5 shadow-md">
                    <p className="text-xs text-[#5A7A5A]">請填寫您的姓名及手機號碼末三碼以完成報名。</p>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-[#5A7A5A] uppercase tracking-widest">姓名</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="請輸入真實姓名"
                                required
                                className="w-full bg-[#F5FAF7] border-2 border-[#B2DFC0] rounded-2xl p-4 text-[#1A2A1A] font-bold outline-none focus:border-[#1A6B4A] transition-colors"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-[#5A7A5A] uppercase tracking-widest">手機末三碼</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={3}
                                value={phone3}
                                onChange={e => setPhone3(e.target.value.replace(/\D/g, ''))}
                                placeholder="例：886"
                                required
                                className="w-full bg-[#F5FAF7] border-2 border-[#B2DFC0] rounded-2xl p-4 text-[#1A2A1A] font-bold text-center tracking-widest text-xl outline-none focus:border-[#1A6B4A] transition-colors"
                            />
                        </div>
                    </div>

                    {formError && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                            <p className="text-xs text-[#C0392B] font-bold text-center">{formError}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting || !name.trim() || phone3.length !== 3}
                        className="w-full bg-[#C0392B] py-4 rounded-2xl text-white font-black shadow-lg hover:bg-[#A93226] active:scale-95 transition-all disabled:opacity-50"
                        style={{ boxShadow: '0 4px 16px rgba(192,57,43,0.3)' }}
                    >
                        {submitting ? '報名中…' : '確認報名・取得入場憑證'}
                    </button>
                </form>
            </div>
        );
    }

    // ── Course Selection (Default) ───────────────────────────────────────────
    return (
        <div className="px-4 pb-8 space-y-5 max-w-lg mx-auto pt-4 animate-in fade-in duration-300">
            <div>
                <p className="text-[10px] text-[#8FAF8F] font-black uppercase tracking-widest mb-1">2026 旅程慶典</p>
                <h2 className="font-display text-xl font-black text-[#1A2A1A]">慶典場次報名</h2>
            </div>

            <div className="space-y-3">
                {courseKeys.map(key => {
                    const info = COURSE_INFO[key];
                    const reg = regResults[key];
                    const isRegistered = !!reg;

                    return (
                        <div
                            key={key}
                            className={`rounded-3xl border-2 p-5 space-y-3 transition-all shadow-md ${
                                isRegistered
                                    ? 'bg-gradient-to-br from-[#FFFBEB] to-[#FFFEF5] border-[#F5C842]/60'
                                    : 'bg-white border-[#B2DFC0]'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h3 className="font-black text-[#1A2A1A] text-base">{info.name}</h3>
                                        {isRegistered && (
                                            <span className="text-[10px] px-2 py-0.5 bg-[#F5C842]/25 text-[#8B6914] font-black rounded-lg shrink-0 border border-[#F5C842]/40">已報名</span>
                                        )}
                                    </div>
                                    <div className="space-y-1 text-xs text-[#5A7A5A]">
                                        <div className="flex items-center gap-1.5"><CalendarDays size={11} className="text-[#1A6B4A] shrink-0" />{info.dateDisplay}</div>
                                        <div className="flex items-center gap-1.5"><Clock size={11} className="text-[#1A6B4A] shrink-0" />{info.time}</div>
                                        <div className="flex items-center gap-1.5"><MapPin size={11} className="text-[#1A6B4A] shrink-0" />{info.location}</div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleSelectCourse(key)}
                                className={`w-full py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95 ${
                                    isRegistered
                                        ? 'bg-[#F5C842] text-[#1A2A1A] hover:brightness-105 shadow-md'
                                        : 'bg-[#C0392B] text-white hover:bg-[#A93226] shadow-md'
                                }`}
                                style={isRegistered
                                    ? { boxShadow: '0 4px 12px rgba(245,200,66,0.35)' }
                                    : { boxShadow: '0 4px 12px rgba(192,57,43,0.25)' }
                                }
                            >
                                {isRegistered
                                    ? <><QrCode size={14} className="inline mr-1.5" />查看入場憑證</>
                                    : '立即報名'}
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="pt-2 text-center">
                <button
                    onClick={() => setTabView('volunteer_login')}
                    className="text-[11px] text-[#8FAF8F] hover:text-[#1A6B4A] font-bold transition-colors underline underline-offset-2"
                >
                    場務夥伴入口
                </button>
            </div>
        </div>
    );
}
