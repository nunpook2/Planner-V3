
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Tester, AssignedTask, RawTask, ShiftReport, DailySchedule, AssignedPrepareTask, CategorizedTask } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { 
    getAssignedTasks, getShiftReport, saveShiftReport, getDailySchedule, getAssignedPrepareTasks, getCategorizedTasks 
} from '../services/dataService';
import { 
    CheckCircleIcon, AlertTriangleIcon, 
    UserGroupIcon, RefreshIcon, 
    BeakerIcon, CalendarIcon,
    SunIcon, MoonIcon, DownloadIcon,
    ChevronDownIcon, ClipboardListIcon, SparklesIcon
} from './common/Icons';

declare const XLSX: any;

interface DashboardTabProps {
    testers: Tester[];
    selectedDate: string;
    onDateChange: (date: string) => void;
    selectedShift: 'day' | 'night';
    onShiftChange: (shift: 'day' | 'night') => void;
}

interface SampleDetail {
    name: string;
    qty: string;
    detail: string;
    status: string;
    reason?: string;
    isManual: boolean;
}

interface SummaryItemStats {
    desc: string; 
    total: number; 
    done: number; 
    failed: number; 
    returned: number;
    isSprint: boolean;
    isUrgent: boolean;
    isLSP: boolean;
    isPoCat: boolean;
    isManual: boolean;
    samples: SampleDetail[];
}

interface PersonStats {
    id: string;
    name: string;
    role: string;
    pendingTasks: number;
    summary: Record<string, SummaryItemStats>;
}

const getTaskValue = (task: RawTask, header: string): string | number => {
    const keys = Object.keys(task);
    const target = header.toLowerCase().trim();
    const matchedKey = keys.find(k => k.toLowerCase().trim() === target);
    return matchedKey ? task[matchedKey] : '';
};

const getSpecialStatus = (task: RawTask, category: TaskCategory) => {
    const allContent = Object.values(task).map(v => String(v).toLowerCase()).join(' ');
    
    return {
        isSprint: allContent.includes('sprint'),
        isUrgent: category === TaskCategory.Urgent || allContent.includes('urgent'),
        isLSP: allContent.includes('lsp'),
        isPoCat: category === TaskCategory.PoCat || allContent.includes('pocat') || allContent.includes('po cat'),
        isManual: task.ManualEntry === true || category === TaskCategory.Manual
    };
};

const DashboardTab: React.FC<DashboardTabProps> = ({ 
    testers, 
    selectedDate, 
    onDateChange, 
    selectedShift, 
    onShiftChange 
}) => {
    const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
    const [prepareTasks, setPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [poolTasks, setPoolTasks] = useState<CategorizedTask[]>([]);
    const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [notification, setNotification] = useState<{message: string, isError: boolean} | null>(null);
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    
    // Accordion State
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const fetchData = useCallback(async () => {
        setIsFetching(true);
        try {
            const [assigned, prepared, pool, report, dailySched] = await Promise.all([
                getAssignedTasks(), 
                getAssignedPrepareTasks(),
                getCategorizedTasks(),
                getShiftReport(selectedDate, selectedShift), 
                getDailySchedule(selectedDate)
            ]);
            
            setAssignedTasks((assigned || []).filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setPrepareTasks((prepared || []).filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setPoolTasks((pool || []).filter(t => t.isReturnedPool === true)); 
            setSchedule(dailySched);
            
            if (report) {
                setShiftReport(report);
            } else {
                setShiftReport({ 
                    id: `${selectedDate}_${selectedShift}`, 
                    date: selectedDate, 
                    shift: selectedShift, 
                    instruments: [{ name: 'Lab Systems', status: 'normal' }], 
                    infrastructureNote: '', 
                    wasteLevel: 'low', 
                    cleanliness: 'good', 
                    cleanlinessNote: '' 
                });
            }
        } catch (e) { 
            console.error("Fetch failed", e);
        } finally {
            setIsFetching(false);
        }
    }, [selectedDate, selectedShift]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const globalStats = useMemo(() => {
        let total = 0;
        let prep = 0;
        let exec = 0;
        let lspCount = 0;
        let sprintCount = 0;
        let urgentCount = 0;
        let pocatCount = 0;

        const processTaskFlags = (t: RawTask, cat: TaskCategory) => {
            const spec = getSpecialStatus(t, cat);
            // Priority Hierarchy Logic: LSP > Sprint > Urgent > PoCat
            if (spec.isLSP) {
                lspCount++;
            } else if (spec.isSprint) {
                sprintCount++;
            } else if (spec.isUrgent) {
                urgentCount++;
            } else if (spec.isPoCat) {
                pocatCount++;
            }
        };

        // Counting for Special Ops flags ONLY from Execution (Test) tasks
        assignedTasks.forEach(group => {
            exec += group.tasks.length;
            group.tasks.forEach(t => processTaskFlags(t, group.category));
        });

        // Preparation tasks only count towards volume total, not special flags per requirement
        prepareTasks.forEach(group => {
            prep += group.tasks.length;
        });

        total = exec + prep;
        return { 
            total, 
            prep, 
            exec, 
            lsp: lspCount, 
            sprint: sprintCount, 
            urgent: urgentCount, 
            pocat: pocatCount, 
            totalSpecial: lspCount + sprintCount + urgentCount + pocatCount 
        };
    }, [assignedTasks, prepareTasks]);

    const processedPersonnel = useMemo(() => {
        const stats: Record<string, PersonStats> = {};
        if (schedule) {
            const activeShiftIds = selectedShift === 'day' 
                ? [...(schedule.dayShiftTesters || []), ...(schedule.dayShiftAssistants || [])]
                : [...(schedule.nightShiftTesters || []), ...(schedule.nightShiftAssistants || [])];

            activeShiftIds.forEach(id => {
                const testerObj = testers.find(t => t.id === id);
                if (testerObj) {
                    stats[testerObj.name] = { 
                        id: testerObj.id, 
                        name: testerObj.name, 
                        role: testerObj.team === 'assistants_4_2' ? 'ASST' : 'ANLST', 
                        pendingTasks: 0, 
                        summary: {} 
                    };
                }
            });
        }

        const addActivity = (targetPerson: string, task: RawTask, cat: TaskCategory, isReady: boolean) => {
            if (!stats[targetPerson]) return; 
            const spec = getSpecialStatus(task, cat);
            const desc = String(getTaskValue(task, 'Description') || 'General Task');
            const status = isReady ? 'done' : (task.status === TaskStatus.NotOK ? 'failed' : (task.isReturned ? 'returned' : 'pending'));
            
            if (status !== 'done') stats[targetPerson].pendingTasks++;

            if (!stats[targetPerson].summary[desc]) {
                stats[targetPerson].summary[desc] = { desc, total: 0, done: 0, failed: 0, returned: 0, ...spec, samples: [] };
            }
            const item = stats[targetPerson].summary[desc];
            item.total++;
            if (status === 'done') item.done++;
            if (status === 'failed') item.failed++;
            if (status === 'returned') item.returned++;
            
            const sampleName = String(getTaskValue(task, 'Sample Name') || 'N/A').trim();
            const qty = String(getTaskValue(task, 'Quantity') || '1').trim();
            const variant = String(getTaskValue(task, 'Variant') || '-').trim();

            item.samples.push({
                name: sampleName,
                qty: qty,
                detail: variant,
                status: status,
                isManual: spec.isManual,
                reason: task.notOkReason || task.returnReason || undefined
            });
        };

        assignedTasks.forEach(g => g.tasks.forEach(t => addActivity(g.testerName, t, g.category, t.status === TaskStatus.Done)));
        prepareTasks.forEach(g => g.tasks.forEach(t => addActivity(g.assistantName, t, g.category, t.preparationStatus === 'Prepared' || t.preparationStatus === 'Ready for Testing')));
        poolTasks.forEach(group => {
            const returnerName = group.returnedBy;
            if (returnerName && stats[returnerName]) {
                group.tasks.forEach(t => addActivity(returnerName, t, group.category, false));
            }
        });

        return Object.values(stats).sort((a, b) => b.pendingTasks - a.pendingTasks);
    }, [assignedTasks, prepareTasks, poolTasks, schedule, testers, selectedShift]);

    useEffect(() => {
        if (selectedPersonId) {
            setExpandedGroups(new Set());
        }
    }, [selectedPersonId]);

    const activePerson = processedPersonnel.find(p => p.id === selectedPersonId);

    const toggleGroup = (desc: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(desc)) next.delete(desc);
            else next.add(desc);
            return next;
        });
    };

    const handleSaveReport = async () => {
        if (!shiftReport) return;
        setIsSaving(true);
        try {
            await saveShiftReport(shiftReport);
            setNotification({ message: "Summary Synchronized.", isError: false });
        } catch (e) {
            setNotification({ message: "Sync Failed", isError: true });
        } finally {
            setIsSaving(false);
            setTimeout(() => setNotification(null), 3000);
        }
    };

    const handleUpdateReport = (updates: Partial<ShiftReport>) => {
        setShiftReport(prev => prev ? { ...prev, ...updates } : null);
    };

    const handleExport = () => {
        const exportData = processedPersonnel.flatMap(person => 
            Object.values(person.summary).flatMap((sum: SummaryItemStats) => 
                sum.samples.map(sample => ({
                    'Staff Name': person.name,
                    'Role': person.role,
                    'Mission Desc': sum.desc,
                    'Sample Name': sample.name,
                    'Qty': sample.qty,
                    'Details': sample.detail,
                    'Status': sample.status,
                    'Issue/Reason': sample.reason || '-'
                }))
            )
        );
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Shift Summary");
        XLSX.writeFile(wb, `ShiftSummary_${selectedDate}_${selectedShift}.xlsx`);
    };

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col animate-fade-in overflow-hidden p-3 bg-base-50/50 dark:bg-base-950 font-sans text-[10px] relative">
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .glass-card {
                    background: rgba(255, 255, 255, 0.85);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                }
                .dark .glass-card {
                    background: rgba(15, 23, 42, 0.7);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
                .person-avatar { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); }
                .person-avatar.assistant { background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); }
                .active-glow { box-shadow: 0 0 20px -5px rgba(99, 102, 241, 0.4); }
                .full-click-date-input::-webkit-calendar-picker-indicator {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%; margin: 0; padding: 0; opacity: 0; cursor: pointer;
                }
                @keyframes glow-issue {
                    0% { box-shadow: 0 0 5px rgba(220, 38, 38, 0.2); }
                    50% { box-shadow: 0 0 15px rgba(220, 38, 38, 0.6); }
                    100% { box-shadow: 0 0 5px rgba(220, 38, 38, 0.2); }
                }
                .issue-badge-premium {
                    animation: glow-issue 1.5s ease-in-out infinite;
                    text-rendering: optimizeLegibility;
                    -webkit-font-smoothing: antialiased;
                }
            `}</style>

            <div className="flex-grow grid grid-cols-12 gap-4 h-full relative overflow-hidden">
                {/* Personnel Sidebar */}
                <aside className="col-span-3 flex flex-col bg-white/40 dark:bg-base-900/40 rounded-[2.5rem] border border-white dark:border-base-800 shadow-sm overflow-hidden h-full backdrop-blur-md">
                    <div className="p-4 border-b border-white dark:border-base-800 bg-white/20 flex justify-between items-center shrink-0">
                        <h3 className="text-[10px] font-black text-base-400 uppercase tracking-[0.4em] ml-1">Duty Ops</h3>
                        <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse shadow-sm"></div>
                    </div>
                    
                    {/* Person List Area */}
                    <div className="flex-grow overflow-y-auto no-scrollbar p-2.5 space-y-1.5 min-h-0">
                        {processedPersonnel.map(person => {
                            const isActive = selectedPersonId === person.id;
                            const isAssistant = person.role === 'ASST';
                            return (
                                <button key={person.id} onClick={() => setSelectedPersonId(person.id)} className={`w-full group flex items-center gap-3 p-3 rounded-[1.3rem] transition-all duration-300 border text-left ${isActive ? 'bg-gradient-to-r from-primary-600 to-indigo-600 border-primary-500 text-white shadow-lg active-glow scale-[1.02]' : 'bg-white/40 dark:bg-base-900/40 hover:bg-white dark:hover:bg-base-800 border-transparent hover:border-base-200 dark:hover:border-base-700'}`}>
                                    <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-[11px] font-black shadow-inner ${isAssistant ? 'person-avatar assistant' : 'person-avatar'} ${isActive ? 'ring-2 ring-white/40' : 'text-white'}`}>{person.name.substring(0, 2).toUpperCase()}</div>
                                    <div className="flex-grow min-w-0">
                                        <span className={`block text-[14px] font-black tracking-tight leading-tight ${isActive ? 'text-white' : 'text-base-800 dark:text-base-100'}`}>
                                            {person.name}
                                        </span>
                                        <span className={`text-[8px] font-bold uppercase tracking-widest mt-1 block ${isActive ? 'text-white/60' : 'text-base-400'}`}>
                                            {isAssistant ? 'Assistant' : 'Analyst'}
                                        </span>
                                    </div>
                                    {person.pendingTasks > 0 && <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-black ${isActive ? 'bg-white text-primary-600 shadow-md' : 'bg-red-500 text-white shadow-sm'}`}>{person.pendingTasks}</div>}
                                </button>
                            );
                        })}
                    </div>

                    {/* NEW: Redesigned Shift Stats Summary Box (Partitions) */}
                    <div className="p-4 bg-white/40 dark:bg-base-950/40 border-t border-white dark:border-base-800 shrink-0 space-y-3">
                        <div className="flex items-center gap-2 mb-1 px-1">
                            <SparklesIcon className="h-3.5 w-3.5 text-primary-500" />
                            <h4 className="text-[9px] font-black text-base-400 uppercase tracking-widest">Shift Performance</h4>
                        </div>
                        
                        <div className="space-y-2">
                            {/* Main Counts Row */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-2.5 bg-white dark:bg-base-900 rounded-xl border border-white dark:border-base-800 shadow-sm flex flex-col items-center justify-center text-center">
                                    <span className="text-[14px] font-black text-slate-900 dark:text-white leading-none tracking-tighter">{globalStats.total}</span>
                                    <span className="text-[6px] font-black text-base-400 uppercase tracking-widest mt-1">Total</span>
                                </div>
                                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900/50 shadow-sm flex flex-col items-center justify-center text-center">
                                    <span className="text-[14px] font-black text-amber-600 dark:text-amber-400 leading-none tracking-tighter">{globalStats.prep}</span>
                                    <span className="text-[6px] font-black text-amber-500/70 uppercase tracking-widest mt-1">Prep</span>
                                </div>
                                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/50 shadow-sm flex flex-col items-center justify-center text-center">
                                    <span className="text-[14px] font-black text-emerald-600 dark:text-emerald-400 leading-none tracking-tighter">{globalStats.exec}</span>
                                    <span className="text-[6px] font-black text-emerald-500/70 uppercase tracking-widest mt-1">Test</span>
                                </div>
                            </div>

                            {/* Redesigned Special Ops Box - 4 Partitions by Priority Hierarchy */}
                            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border-2 border-indigo-100 dark:border-indigo-900/50 p-3 shadow-inner overflow-hidden">
                                <div className="flex justify-between items-center mb-2.5 border-b border-indigo-100/50 dark:border-indigo-900/50 pb-1.5 px-0.5">
                                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Special Missions (Test Only)</span>
                                    <span className="text-[14px] font-black text-indigo-700 dark:text-indigo-400 tracking-tighter">{globalStats.totalSpecial}</span>
                                </div>
                                <div className="space-y-1.5">
                                    {/* 1. LSP - Highest Priority */}
                                    <div className="flex items-center justify-between px-2 py-1.5 bg-white dark:bg-base-900/50 rounded-lg shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                                            <span className="text-[8px] font-black text-base-500 uppercase tracking-widest">LSP Focus</span>
                                        </div>
                                        <span className="text-[12px] font-black text-cyan-600 dark:text-cyan-400 leading-none">{globalStats.lsp}</span>
                                    </div>
                                    {/* 2. Sprint */}
                                    <div className="flex items-center justify-between px-2 py-1.5 bg-white dark:bg-base-900/50 rounded-lg shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                                            <span className="text-[8px] font-black text-base-500 uppercase tracking-widest">Sprint Ops</span>
                                        </div>
                                        <span className="text-[12px] font-black text-rose-600 dark:text-rose-400 leading-none">{globalStats.sprint}</span>
                                    </div>
                                    {/* 3. Urgent */}
                                    <div className="flex items-center justify-between px-2 py-1.5 bg-white dark:bg-base-900/50 rounded-lg shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                                            <span className="text-[8px] font-black text-base-500 uppercase tracking-widest">Urgent List</span>
                                        </div>
                                        <span className="text-[12px] font-black text-orange-600 dark:text-orange-400 leading-none">{globalStats.urgent}</span>
                                    </div>
                                    {/* 4. PoCat - Final Priority */}
                                    <div className="flex items-center justify-between px-2 py-1.5 bg-white dark:bg-base-900/50 rounded-lg shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-violet-500"></div>
                                            <span className="text-[8px] font-black text-base-500 uppercase tracking-widest">PoCat Work</span>
                                        </div>
                                        <span className="text-[12px] font-black text-violet-600 dark:text-violet-400 leading-none">{globalStats.pocat}</span>
                                    </div>
                                </div>
                                <p className="text-[5.5px] font-bold text-indigo-400 uppercase tracking-widest text-center mt-2 opacity-60 italic">
                                    Hierarchy: LSP > Sprint > Urgent > PoCat
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Log Area */}
                <div className="col-span-9 flex flex-col min-w-0 bg-white/60 dark:bg-base-900/60 rounded-[2.5rem] border border-white dark:border-base-800 shadow-2xl overflow-hidden relative backdrop-blur-xl h-full">
                    {!activePerson ? (
                        <div className="flex-grow flex flex-col items-center justify-center opacity-10 text-base-300 py-20"><UserGroupIcon className="h-24 w-24 mb-4" /><span className="text-xl font-black uppercase tracking-[0.5em] text-base-400">Select Personnel</span></div>
                    ) : (
                        <>
                            <div className="px-8 py-4 border-b border-white dark:border-base-800 flex justify-between items-center bg-white/40 dark:bg-base-800/10 backdrop-blur-xl shrink-0 sticky top-0 z-20">
                                <div className="flex items-center gap-5">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-base font-black text-white shadow-xl ${activePerson.role === 'ASST' ? 'person-avatar assistant' : 'person-avatar'}`}>{activePerson.name.substring(0, 2).toUpperCase()}</div>
                                    <div>
                                        <h2 className="text-2xl font-black text-base-900 dark:text-white tracking-tighter leading-none">{activePerson.name}</h2>
                                        <p className="text-[10px] text-base-400 font-bold uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                                            Mission Log Explorer
                                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${activePerson.role === 'ASST' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-primary-100 text-primary-700 border border-primary-200'}`}>
                                                {activePerson.role === 'ASST' ? 'Assistant' : 'Analyst'}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2.5">
                                    <button onClick={handleExport} title="Export Summary to Excel" className="p-2.5 bg-white dark:bg-base-800 hover:bg-base-50 dark:hover:bg-primary-900/20 rounded-xl transition-all border border-base-100 dark:border-base-700 shadow-sm"><DownloadIcon className="h-5 w-5 text-base-500"/></button>
                                    <button onClick={fetchData} className="p-2.5 bg-white dark:bg-base-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all active:scale-90 border border-base-100 dark:border-base-700 shadow-sm"><RefreshIcon className={`h-5 w-5 text-base-400 ${isFetching ? 'animate-spin text-primary-500' : ''}`}/></button>
                                </div>
                            </div>

                            <div className="flex-grow overflow-y-auto no-scrollbar p-8">
                                <div className="space-y-5 max-w-5xl mx-auto">
                                    {Object.values(activePerson.summary).length === 0 ? (
                                        <div className="py-20 text-center opacity-10 flex flex-col items-center"><BeakerIcon className="h-20 w-20 mb-4" /><span className="text-sm font-black uppercase tracking-[0.5em]">No Missions Recorded</span></div>
                                    ) : (
                                        Object.values(activePerson.summary).map((sum: SummaryItemStats, idx: number) => {
                                            const isComplete = sum.done === sum.total;
                                            const hasError = sum.failed > 0 || sum.returned > 0;
                                            const isExpanded = expandedGroups.has(sum.desc);

                                            return (
                                                <div key={idx} className={`rounded-[1.8rem] border-2 overflow-hidden transition-all duration-300 shadow-lg ${isComplete ? 'bg-emerald-50/10 border-emerald-100/50' : hasError ? 'bg-white dark:bg-base-800 border-red-200' : 'bg-white dark:bg-base-800 border-base-200 dark:border-base-700'}`}>
                                                    <button 
                                                        onClick={() => toggleGroup(sum.desc)}
                                                        className={`w-full text-left px-6 py-4 border-b-2 flex justify-between items-start transition-colors ${isComplete ? 'bg-emerald-50/40 hover:bg-emerald-100/40' : hasError ? 'bg-red-50/40 hover:bg-red-100/40' : 'bg-base-50/50 hover:bg-base-100/50'}`}
                                                    >
                                                        <div className="min-w-0 pr-4 flex items-start gap-4">
                                                            <ChevronDownIcon className={`h-5 w-5 mt-1.5 text-base-400 transition-transform duration-300 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                                                            <div>
                                                                <div className="flex flex-wrap gap-2 mb-2 mt-1">
                                                                    {sum.isSprint && <span className="bg-red-600 text-white px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shadow-sm">SPRINT</span>}
                                                                    {sum.isUrgent && <span className="bg-rose-500 text-white px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shadow-sm">URGENT</span>}
                                                                    {sum.isLSP && <span className="bg-cyan-600 text-white px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shadow-sm">LSP</span>}
                                                                    {sum.isPoCat && <span className="bg-violet-600 text-white px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shadow-sm">POCAT</span>}
                                                                    {sum.isManual && <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shadow-sm">MANUAL</span>}
                                                                </div>
                                                                <h3 className={`text-[16px] font-black tracking-tight uppercase whitespace-normal leading-tight transition-colors ${isComplete ? 'text-emerald-900 opacity-60' : 'text-base-950 dark:text-white'}`}>{sum.desc}</h3>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-6 flex-shrink-0 mt-1">
                                                            <div className="flex flex-col items-end">
                                                                <span className={`text-[24px] font-black tracking-tighter leading-none ${isComplete ? 'text-emerald-700' : hasError ? 'text-red-700' : 'text-primary-700'}`}>
                                                                    {sum.done}<span className="text-base-300 mx-1 font-normal text-lg">/</span>{sum.total}
                                                                </span>
                                                                {isComplete && <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mt-1 opacity-80">Mission: OK</span>}
                                                            </div>
                                                            <div className="w-24 h-2 bg-base-100 dark:bg-base-700 rounded-full overflow-hidden shadow-inner ring-1 ring-black/5 hidden sm:block">
                                                                <div className={`h-full transition-all duration-700 ${isComplete ? 'bg-emerald-500' : hasError ? 'bg-red-500' : 'bg-primary-500'}`} style={{width: `${(sum.done/sum.total)*100}%`}}></div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                    
                                                    {isExpanded && (
                                                        <div className="p-2 space-y-1.5 bg-white/30 dark:bg-base-900/20 animate-fade-in">
                                                            {sum.samples.map((s, si) => (
                                                                <div key={si} className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 bg-white dark:bg-base-900/40 rounded-[1.3rem] border border-base-100 dark:border-base-800 hover:bg-primary-50/30 dark:hover:bg-base-800 transition-colors shadow-sm gap-4">
                                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 flex-grow min-w-0 w-full">
                                                                        <span className="text-[14px] font-black text-base-950 dark:text-base-100 uppercase tracking-tight whitespace-normal leading-tight min-w-0 sm:min-w-[180px]">{s.name}</span>
                                                                        <div className="flex items-center gap-3 shrink-0">
                                                                            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl text-[10px] font-black">x{s.qty}</span>
                                                                            <span className="text-[11px] font-extrabold text-base-800 dark:text-base-400 uppercase flex items-center gap-1.5"><span className="text-primary-600 opacity-50 font-black">D:</span> {s.detail}</span>
                                                                        </div>
                                                                        
                                                                        {s.reason && (
                                                                            <div className="flex items-center gap-2.5 px-4 py-2 bg-red-700 text-white rounded-[12px] sm:ml-auto issue-badge-premium border border-red-500 shrink-0 shadow-lg w-full sm:w-auto">
                                                                                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                                                                                <span className="text-[11px] font-black uppercase tracking-tight font-black uppercase tracking-tight leading-none whitespace-normal">
                                                                                    Issue: {s.reason}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <span className={`text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest shadow-sm self-end sm:self-auto ${s.status === 'done' ? 'bg-emerald-600 text-white' : s.status === 'failed' ? 'bg-red-600 text-white' : 'bg-base-200 dark:bg-base-700 text-base-600'}`}>{s.status}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {notification && (
                <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 px-10 py-5 rounded-[2.5rem] shadow-2xl z-[200] animate-slide-in-up flex items-center gap-4 border-2 backdrop-blur-3xl ${notification.isError ? 'bg-red-600 border-red-400 text-white' : 'bg-emerald-600 border-emerald-400 text-white'}`}>
                    <CheckCircleIcon className="h-5 w-5"/><span className="font-black text-sm uppercase tracking-widest">{notification.message}</span>
                </div>
            )}
        </div>
    );
};

export default DashboardTab;
