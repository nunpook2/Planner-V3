
import React, { useState, useEffect, useCallback } from 'react';
import ImportTab from './components/ImportTab';
import TasksTab from './components/TasksTab';
import RosterTab from './components/RosterTab';
import ScheduleTab from './components/ScheduleTab';
import DashboardTab from './components/DashboardTab';
import SettingsTab from './components/SettingsTab';
import { getTesters } from './services/dataService';
import type { Tester } from './types';
import { DatabaseIcon, UploadIcon, ClipboardListIcon, CalendarIcon, CogIcon, BeakerIcon } from './components/common/Icons';

const AlertTriangleIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const LoadingSpinner = () => (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in">
        <div className="relative">
            <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-white dark:bg-base-900 rounded-full"></div>
            </div>
        </div>
        <span className="mt-4 text-lg font-black text-base-400 tracking-[0.2em] uppercase">Initializing...</span>
    </div>
);

const ErrorModal = ({ children, onRetry }: { children?: React.ReactNode; onRetry: () => void; }) => (
    <div className="fixed inset-0 bg-base-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" aria-modal="true" role="dialog">
        <div className="bg-white dark:bg-base-800 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-lg m-4 space-y-6 transform transition-all animate-slide-in-up border border-base-200 dark:border-base-700">
            <div className="flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center shadow-inner">
                    <AlertTriangleIcon className="h-8 w-8 text-red-500" />
                </div>
                <h2 className="text-2xl font-black text-base-900 dark:text-base-100 uppercase tracking-tighter">Connection Lost</h2>
            </div>
            <div className="text-base-600 dark:text-base-300 text-center leading-relaxed px-4 font-medium">
                {children}
            </div>
            <div className="pt-2 flex justify-center">
                <button 
                    onClick={onRetry} 
                    className="px-10 py-4 bg-primary-600 text-white font-black rounded-2xl hover:bg-primary-700 shadow-xl shadow-primary-500/20 transition-all uppercase tracking-widest text-xs active:scale-95"
                >
                    Restore Session
                </button>
            </div>
        </div>
    </div>
);

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState('import');
    const [testers, setTesters] = useState<Tester[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<React.ReactNode | null>(null);
    const [taskRefreshKey, setTaskRefreshKey] = useState(0);

    const triggerTaskRefresh = useCallback(() => {
        setTaskRefreshKey(prevKey => prevKey + 1);
    }, []);

    const fetchTesters = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const fetchedTesters = await getTesters();
            setTesters(fetchedTesters);
        } catch (error: any) {
            console.error("Error fetching testers: ", error);
            setError("An unexpected error occurred. Please check your network connection.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTesters();
    }, [fetchTesters]);

    const renderTabContent = () => {
        if (error) return null;

        switch (activeTab) {
            case 'import': return <ImportTab onTasksUpdated={triggerTaskRefresh} />;
            case 'tasks': return <TasksTab testers={testers} refreshKey={taskRefreshKey} />;
            case 'roster': return <RosterTab testers={testers} onTestersUpdate={fetchTesters} />;
            case 'schedule': return <ScheduleTab testers={testers} onTasksUpdated={triggerTaskRefresh} />;
            case 'dashboard': return <DashboardTab testers={testers} />;
            case 'settings': return <SettingsTab testers={testers} onRefreshTesters={fetchTesters} onTasksUpdated={triggerTaskRefresh} />;
            default: return <ImportTab onTasksUpdated={triggerTaskRefresh} />;
        }
    };
    
    const TabButton = ({ tabName, label, icon }: { tabName: string; label: string; icon: React.ReactNode }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                onClick={() => setActiveTab(tabName)}
                className={`
                    relative group flex flex-col lg:flex-row items-center lg:justify-start gap-4 px-5 py-4 rounded-[1.5rem] transition-all duration-500 w-full overflow-hidden
                    ${isActive
                        ? 'bg-gradient-to-r from-primary-600/10 to-transparent text-primary-700 dark:text-primary-400 shadow-[inset_0_0_15px_rgba(99,102,241,0.05)]'
                        : 'text-base-400 hover:text-base-900 dark:hover:text-base-100'
                    }
                `}
            >
                {/* Active Indicator Bar */}
                {isActive && (
                    <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-gradient-to-b from-primary-400 to-primary-700 rounded-r-full animate-fade-in"></div>
                )}
                
                <div className={`
                    p-2.5 rounded-xl transition-all duration-300 flex-shrink-0
                    ${isActive 
                        ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-500/20 scale-110' 
                        : 'bg-white dark:bg-base-800 border border-base-100 dark:border-base-700 text-base-400 group-hover:scale-110 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20 group-hover:text-primary-500'
                    }
                `}>
                    {icon}
                </div>
                <span className={`font-black text-[13px] uppercase tracking-widest hidden lg:block transition-all ${isActive ? 'translate-x-1' : 'opacity-80'}`}>{label}</span>
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-base-50/50 dark:bg-base-950 font-sans text-base-800 dark:text-base-200 flex flex-col">
            {error ? <ErrorModal onRetry={fetchTesters}>{error}</ErrorModal> : null}
            
            <header className="sticky top-0 z-40 bg-white/40 dark:bg-base-900/40 backdrop-blur-xl border-b border-white dark:border-base-800">
                <div className="w-[96%] mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-gradient-to-br from-primary-600 to-primary-800 p-2.5 rounded-2xl shadow-xl shadow-primary-500/30">
                            <BeakerIcon className="h-6 w-6 text-white"/>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tighter text-base-900 dark:text-white leading-none">
                                Planner V2
                            </h1>
                            <p className="text-[10px] text-base-400 font-black uppercase tracking-[0.3em] mt-1.5">Lab Intelligence System</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-white/50 dark:bg-base-800/50 p-1.5 pr-5 rounded-3xl border border-white dark:border-base-700 shadow-sm">
                        <div className="h-11 w-11 rounded-[1.1rem] bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-sm shadow-lg border-2 border-white dark:border-base-800">
                            AU
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-sm font-black text-base-900 dark:text-base-100 tracking-tight">Admin User</p>
                            <p className="text-[10px] text-base-400 font-bold uppercase tracking-widest">Master Planner</p>
                        </div>
                    </div>
                </div>
            </header>
            
            <div className="flex-1 w-[96%] mx-auto px-2 py-8">
                <div className="flex flex-col lg:flex-row gap-8 h-full">
                    {/* PREMIUM SIDEBAR NAVIGATION */}
                    <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-28 self-start bg-white/30 dark:bg-base-900/30 backdrop-blur-md rounded-[2.5rem] p-4 border border-white dark:border-base-800 shadow-sm">
                        <nav className="space-y-1.5">
                            <TabButton tabName="import" label="Import Data" icon={<UploadIcon className="h-5 w-5"/>} />
                            <TabButton tabName="tasks" label="Assign Tasks" icon={<ClipboardListIcon className="h-5 w-5"/>} />
                            <div className="h-px bg-gradient-to-r from-transparent via-base-200 dark:via-base-800 to-transparent my-4 mx-4"></div>
                            <TabButton tabName="schedule" label="Shift Tracking" icon={<CalendarIcon className="h-5 w-5"/>} />
                            <TabButton tabName="dashboard" label="Shift Summary" icon={<BeakerIcon className="h-5 w-5"/>} />
                            <div className="h-px bg-gradient-to-r from-transparent via-base-200 dark:via-base-800 to-transparent my-4 mx-4"></div>
                            <TabButton tabName="roster" label="Roster & Shifts" icon={<DatabaseIcon className="h-5 w-5"/>} />
                            <TabButton tabName="settings" label="Settings" icon={<CogIcon className="h-5 w-5"/>} />
                        </nav>
                        
                        {/* Sidebar Footer Insight */}
                        <div className="mt-8 p-5 bg-gradient-to-br from-primary-600 to-primary-800 rounded-[1.8rem] text-white shadow-xl shadow-primary-500/20">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">System Status</p>
                            <div className="flex items-center gap-2 mt-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                                <span className="text-xs font-black tracking-tight">Cloud Synchronized</span>
                            </div>
                        </div>
                    </aside>

                    {/* MOBILE TAB BAR */}
                    <div className="lg:hidden fixed bottom-6 left-6 right-6 bg-white/80 dark:bg-base-900/80 backdrop-blur-2xl border border-white dark:border-base-800 rounded-[2.5rem] p-3 z-50 flex justify-around shadow-2xl">
                        <TabButton tabName="import" label="" icon={<UploadIcon className="h-5 w-5"/>} />
                        <TabButton tabName="tasks" label="" icon={<ClipboardListIcon className="h-5 w-5"/>} />
                        <TabButton tabName="schedule" label="" icon={<CalendarIcon className="h-5 w-5"/>} />
                        <TabButton tabName="dashboard" label="" icon={<BeakerIcon className="h-5 w-5"/>} />
                        <TabButton tabName="roster" label="" icon={<DatabaseIcon className="h-5 w-5"/>} />
                    </div>

                    <main className="flex-1 min-w-0 min-h-[calc(100vh-10rem)]">
                        <div className="bg-white/60 dark:bg-base-900/60 rounded-[3rem] border border-white dark:border-base-800 p-1 h-full shadow-2xl overflow-hidden relative">
                           {isLoading ? <LoadingSpinner /> : renderTabContent()}
                       </div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default App;
