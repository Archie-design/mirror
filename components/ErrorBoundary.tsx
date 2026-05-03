'use client';

import React from 'react';

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        if (typeof window !== 'undefined' && typeof console !== 'undefined') {
            console.error('[ErrorBoundary]', error, info.componentStack);
        }
    }

    handleReload = () => {
        if (typeof window !== 'undefined') window.location.reload();
    };

    handleHome = () => {
        if (typeof window !== 'undefined') window.location.href = '/';
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="min-h-screen bg-[#16213E] flex items-center justify-center p-6">
                <div className="w-full max-w-md bg-[#1B2A4A] border border-red-500/30 rounded-3xl p-6 text-center space-y-4">
                    <div className="text-5xl">⚠️</div>
                    <h1 className="text-xl font-black text-[#F5C842]">畫面遇到錯誤</h1>
                    <p className="text-sm text-gray-300">
                        系統發生未預期的錯誤。打卡資料已即時保存於資料庫，請嘗試重新整理。
                    </p>
                    {this.state.error?.message && (
                        <pre className="text-xs text-red-300 bg-black/30 rounded-lg p-3 overflow-auto max-h-32 text-left">
                            {this.state.error.message}
                        </pre>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={this.handleReload}
                            className="flex-1 py-3 bg-[#F5C842] text-[#16213E] font-black rounded-2xl active:opacity-80"
                        >
                            重新整理
                        </button>
                        <button
                            onClick={this.handleHome}
                            className="flex-1 py-3 bg-[#253A5C] text-white font-bold rounded-2xl active:opacity-80"
                        >
                            回首頁
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
