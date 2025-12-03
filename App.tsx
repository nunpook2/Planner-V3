
import React, { useState, useEffect, useCallback } from 'react';
import ImportTab from './components/ImportTab';
import TasksTab from './components/TasksTab';
import RosterTab from './components/RosterTab';
import ScheduleTab from './components/ScheduleTab';
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
        <span className="mt-4 text-lg font-medium text-base-500 tracking-wide">Loading Workspace...</span>
    </div>
);

const ErrorModal = ({ children, onRetry }: { children?: React.ReactNode; onRetry: () => void; }) => (
    <div className="fixed inset-0 bg-base-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" aria-modal="true" role="dialog">
        <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-8 w-full max-w-lg m-4 space-y-6 transform transition-all animate-slide-in-up border border-base-200 dark:border-base-700">
            <div className="flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center shadow-inner">
                    <AlertTriangleIcon className="h-8 w-8 text-red-500" />
                </div>
                <h2 className="text-2xl font-bold text-base-900 dark:text-base-100">Connection Issue</h2>
            </div>
            <div className="text-base-600 dark:text-base-300 text-center leading-relaxed px-4">
                {children}
            </div>
            <div className="pt-2 flex justify-center">
                <button 
                    onClick={onRetry} 
                    className="px-8 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-primary-100 transition-all duration-200"
                >
                    Try Again
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
            if (error.code === 'permission-denied') {
                setError(
                    <>
                        Failed to access the database. <br/>
                        Please ensure your <strong>Firestore Security Rules</strong> allow read access to the <code>analysts</code> collection.
                        <br/><br/>
                        <a href="https://firebase.google.com/docs/firestore/security/get-started" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 underline font-medium">
                            View Documentation
                        </a>
                    </>
                );
            } else {
                setError("An unexpected error occurred. Please check your network connection.");
            }
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
            case 'settings': return <SettingsTab testers={testers} onRefreshTesters={fetchTesters} onTasksUpdated={triggerTaskRefresh} />;
            default: return <ImportTab onTasksUpdated={triggerTaskRefresh} />;
        }
    };
    
    const TabButton = ({ tabName, label, icon }: { tabName: string; label: string; icon: React.ReactNode }) => (
        <button
            onClick={() => setActiveTab(tabName)}
            className={`
                group flex flex-col lg:flex-row items-center lg:justify-start gap-3 px-4 py-3 rounded-xl transition-all duration-200 w-full
                ${activeTab === tabName
                    ? 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-200'
                    : 'text-base-500 hover:bg-white hover:text-base-800 hover:shadow-sm'
                }
            `}
        >
            <div className={`
                p-2 rounded-lg transition-colors flex-shrink-0
                ${activeTab === tabName ? 'bg-primary-100 text-primary-600' : 'bg-base-100 group-hover:bg-base-50 text-base-400 group-hover:text-base-600'}
            `}>
                {icon}
            </div>
            <span className="font-medium text-sm hidden lg:block">{label}</span>
        </button>
    );

    return (
        <div className="min-h-screen bg-base-50 dark:bg-base-900 font-sans text-base-800 dark:text-base-200 flex flex-col">
            {error ? <ErrorModal onRetry={fetchTesters}>{error}</ErrorModal> : null}
            
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-40 bg-white/80 dark:bg-base-800/80 backdrop-blur-md border-b border-base-200 dark:border-base-700 shadow-sm">
                <div className="w-[98%] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-primary-500 to-primary-600 p-2 rounded-lg shadow-md shadow-primary-200">
                            <BeakerIcon className="h-6 w-6 text-white"/>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-base-900 dark:text-white leading-none">
                                Planner V2
                            </h1>
                            <p className="text-xs text-base-500 font-medium">Lab Operations</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:block text-right">
                            <p className="text-sm font-semibold text-base-800 dark:text-base-200">Admin User</p>
                            <p className="text-xs text-base-500">Laboratory Manager</p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold border-2 border-white shadow-sm">
                            AU
                        </div>
                    </div>
                </div>
            </header>
            
            <div className="flex-1 w-[98%] mx-auto px-2 py-6">
                <div className="flex flex-col lg:flex-row gap-6 h-full">
                    {/* Sidebar Navigation - Fixed Compact Width (w-56) */}
                    <aside className="hidden lg:block w-56 flex-shrink-0 sticky top-24 self-start">
                        <nav className="space-y-2">
                            <TabButton tabName="import" label="Import Data" icon={<UploadIcon className="h-5 w-5"/>} />
                            <TabButton tabName="tasks" label="Assign Tasks" icon={<ClipboardListIcon className="h-5 w-5"/>} />
                            <TabButton tabName="schedule" label="Track Schedule" icon={<CalendarIcon className="h-5 w-5"/>} />
                            <div className="h-px bg-base-200 dark:bg-base-700 my-4 mx-2"></div>
                            <TabButton tabName="roster" label="Roster & Shifts" icon={<DatabaseIcon className="h-5 w-5"/>} />
                            <TabButton tabName="settings" label="Settings" icon={<CogIcon className="h-5 w-5"/>} />
                        </nav>
                    </aside>

                    {/* Mobile Navigation */}
                    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-base-200 p-2 z-50 flex justify-around shadow-lg pb-safe">
                        <TabButton tabName="import" label="Import" icon={<UploadIcon className="h-5 w-5"/>} />
                        <TabButton tabName="tasks" label="Tasks" icon={<ClipboardListIcon className="h-5 w-5"/>} />
                        <TabButton tabName="schedule" label="Track" icon={<CalendarIcon className="h-5 w-5"/>} />
                        <TabButton tabName="roster" label="Roster" icon={<DatabaseIcon className="h-5 w-5"/>} />
                        <TabButton tabName="settings" label="Settings" icon={<CogIcon className="h-5 w-5"/>} />
                    </div>

                    {/* Main Content Area */}
                    <main className="flex-1 min-w-0 min-h-[calc(100vh-8rem)]">
                        <div className="bg-white dark:bg-base-800 rounded-2xl shadow-sm border border-base-200 dark:border-base-700 p-6 sm:p-8 h-full animate-fade-in relative overflow-hidden">
                           <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-primary-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
                           {isLoading ? <LoadingSpinner /> : renderTabContent()}
                       </div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default App;
