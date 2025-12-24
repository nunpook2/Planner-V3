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
    ChevronDownIcon
} from './common/Icons';

declare const XLSX: any;

interface DashboardTabProps {
    testers: Tester[];
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
    const checkFields = ['Purpose', 'Priority', 'Remark (Requester)', 'Note to planer', 'Additional Information', 'Description'];
    const allText = checkFields.map(f => String(getTaskValue(task, f)).toLowerCase()).join(' ');
    const normalized = allText.replace(/\s/g, '');
    return {
        isSprint: normalized.includes('sprint') || String(getTaskValue(task, 'Purpose')).toLowerCase().includes('sprint'),
        isUrgent: category === TaskCategory.Urgent || normalized.includes('urgent') || String(getTaskValue(task, 'Priority')).toLowerCase().includes('urgent'),
        isLSP: normalized.includes('lsp'),
        isPoCat: category === TaskCategory.PoCat || normalized.includes('pocat'),
        isManual: task.ManualEntry === true || category === TaskCategory.Manual
    };
};

const DashboardTab: React.FC<DashboardTabProps> = ({ testers }) => {
    const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
    const [prepareTasks, setPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [poolTasks, setPoolTasks] = useState<CategorizedTask[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedShift, setSelectedShift] = useState<'day' | 'night'>('day');
    const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [notification, setNotification] = useState<{message: string, isError: boolean} | null>(null);
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

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
        if (!selectedPersonId && processedPersonnel.length > 0) {
            setSelectedPersonId(processedPersonnel[0].id);
        }
    }, [processedPersonnel, selectedPersonId]);

    const activePerson = processedPersonnel.find(p => p.id === selectedPersonId);

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
        <div className="h-full flex flex-row animate-fade-in overflow-hidden gap-3 p-2 bg-base-100/40 dark:bg-base-950 font-sans text-[10px]">
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
                .full-click-date-input::-webkit-calendar-picker-indicator {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%; margin: 0; padding: 0; opacity: 0; cursor: pointer;
                }
            `}</style>

            <aside className="w-[190px] flex-shrink-0 flex flex-col glass-card rounded-[2rem] shadow-xl overflow-hidden p-3">
                <div className="mb-4 px-1 flex items-center justify-between">
                    <h3 className="text-[9px] font-black text-base-400 uppercase tracking-[0.3em]">Duty Ops</h3>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></div>
                </div>
                <div className="flex-grow overflow-y-auto no-scrollbar space-y-1.5">
                    {processedPersonnel.map(person => {
                        const isActive = selectedPersonId === person.id;
                        const isAssistant = person.role === 'ASST';
                        return (
                            <button key={person.id} onClick={() => setSelectedPersonId(person.id)} className={`w-full group flex items-center gap-2.5 p-2 rounded-[1.2rem] transition-all duration-300 border text-left ${isActive ? 'bg-gradient-to-r from-primary-600 to-indigo-600 border-primary-500 text-white shadow-lg scale-[1.01]' : 'bg-white/40 dark:bg-base-900/40 hover:bg-white dark:hover:bg-base-800 border-transparent hover:border-base-200 dark:hover:border-base-700'}`}>
                                <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-[10px] font-black shadow-inner ${isAssistant ? 'person-avatar assistant' : 'person-avatar'} ${isActive ? 'ring-2 ring-white/50' : 'text-white'}`}>{person.name.substring(0, 2).toUpperCase()}</div>
                                <div className="flex-grow min-w-0">
                                    <span className={`block text-[12px] font-black tracking-tight truncate leading-tight ${isActive ? 'text-white' : 'text-base-800 dark:text-base-200'}`}>{person.name}</span>
                                    <span className={`text-[8px] font-bold uppercase tracking-widest ${isActive ? 'text-white/60' : 'text-base-400'}`}>{person.role}</span>
                                </div>
                                {person.pendingTasks > 0 && <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-black ${isActive ? 'bg-white text-primary-600' : 'bg-red-500 text-white'}`}>{person.pendingTasks}</div>}
                            </button>
                        );
                    })}
                </div>
            </aside>

            <div className="flex-grow flex flex-col min-w-0 bg-white/60 dark:bg-base-900/60 rounded-[2.5rem] border border-white dark:border-base-800 shadow-2xl overflow-hidden relative backdrop-blur-md">
                {!activePerson ? (
                    <div className="flex-grow flex flex-col items-center justify-center opacity-10 text-base-300"><UserGroupIcon className="h-24 w-24 mb-3" /><span className="text-sm font-black uppercase tracking-[0.5em]">Command Required</span></div>
                ) : (
                    <>
                        <div className="px-8 py-3 border-b border-white dark:border-base-800 flex justify-between items-center bg-white/30 dark:bg-base-800/10 backdrop-blur-xl">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black text-white shadow-xl ${activePerson.role === 'ASST' ? 'person-avatar assistant' : 'person-avatar'}`}>{activePerson.name.substring(0, 2).toUpperCase()}</div>
                                <div>
                                    <h2 className="text-xl font-black text-base-900 dark:text-white tracking-tighter leading-none flex items-center gap-2">{activePerson.name}<span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${activePerson.role === 'ASST' ? 'bg-amber-100 text-amber-700' : 'bg-primary-100 text-primary-700'}`}>{activePerson.role === 'ASST' ? 'Assistant' : 'Analyst'}</span></h2>
                                    <p className="text-base-400 font-bold text-[9px] uppercase tracking-[0.3em] mt-1">Mission Log</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleExport} title="Export Summary to Excel" className="p-2.5 bg-white dark:bg-base-800 hover:bg-base-50 dark:hover:bg-primary-900/20 rounded-xl transition-all border border-base-100 dark:border-base-700 shadow-sm"><DownloadIcon className="h-5 w-5 text-base-600"/></button>
                                <button onClick={fetchData} className="p-2.5 bg-white dark:bg-base-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all active:scale-90 border border-base-100 dark:border-base-700 shadow-sm"><RefreshIcon className={`h-5 w-5 text-base-400 ${isFetching ? 'animate-spin text-primary-500' : ''}`}/></button>
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto no-scrollbar p-6">
                            <div className="space-y-4 max-w-5xl mx-auto">
                                {Object.values(activePerson.summary).length === 0 ? (
                                    <div className="py-20 text-center opacity-10 flex flex-col items-center"><BeakerIcon className="h-20 w-20 mb-4" /><span className="text-sm font-black uppercase tracking-[0.5em]">No Missions Recorded</span></div>
                                ) : (
                                    Object.values(activePerson.summary).map((sum: SummaryItemStats, idx: number) => {
                                        const isComplete = sum.done === sum.total;
                                        const hasError = sum.failed > 0 || sum.returned > 0;
                                        return (
                                            <div key={idx} className={`rounded-[1.5rem] border-2 overflow-hidden transition-all duration-300 shadow-md ${isComplete ? 'bg-emerald-50/20 border-emerald-100' : hasError ? 'bg-white dark:bg-base-800 border-red-200' : 'bg-white dark:bg-base-800 border-base-200 dark:border-base-700'}`}>
                                                <div className={`px-6 py-3 border-b-2 flex justify-between items-center ${isComplete ? 'bg-emerald-50/50' : hasError ? 'bg-red-50/50' : 'bg-base-50/50'}`}>
                                                    <div className="min-w-0 pr-4">
                                                        <div className="flex gap-2 mb-1">
                                                            {sum.isSprint && <span className="bg-red-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm">SPRINT</span>}
                                                            {sum.isUrgent && <span className="bg-rose-500 text-white px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm">URGENT</span>}
                                                            {sum.isManual && <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm">MANUAL</span>}
                                                        </div>
                                                        <h3 className="text-[15px] font-black tracking-tight text-base-950 dark:text-white truncate uppercase">{sum.desc}</h3>
                                                    </div>
                                                    <div className="flex items-center gap-4 flex-shrink-0">
                                                        <span className={`text-2xl font-black tracking-tighter ${isComplete ? 'text-emerald-700' : hasError ? 'text-red-700' : 'text-primary-700'}`}>{sum.done}<span className="text-base-300 mx-0.5 font-normal text-lg">/</span>{sum.total}</span>
                                                        <div className="w-16 h-1.5 bg-base-100 dark:bg-base-700 rounded-full overflow-hidden shadow-inner ring-1 ring-black/5"><div className={`h-full transition-all duration-700 ${isComplete ? 'bg-emerald-500' : hasError ? 'bg-red-500' : 'bg-primary-500'}`} style={{width: `${(sum.done/sum.total)*100}%`}}></div></div>
                                                    </div>
                                                </div>
                                                <div className="p-1 space-y-1">
                                                    {sum.samples.map((s, si) => (
                                                        <div key={si} className="flex items-center justify-between px-5 py-2.5 bg-white dark:bg-base-900/40 rounded-[1rem] border border-base-100 dark:border-base-800 hover:bg-primary-50/30 dark:hover:bg-base-800 transition-colors">
                                                            <div className="flex items-center gap-6 flex-grow min-w-0">
                                                                <span className="text-[14px] font-black text-base-950 dark:text-base-100 truncate uppercase min-w-[150px]">{s.name}</span>
                                                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-[10px] font-black flex-shrink-0">x{s.qty}</span>
                                                                <span className="text-[11px] font-extrabold text-base-800 dark:text-base-400 truncate uppercase flex items-center gap-1"><span className="text-primary-600 opacity-60">D:</span> {s.detail}</span>
                                                                {s.reason && <span className="text-[10px] text-red-600 font-black italic truncate ml-auto bg-red-50 px-2 py-0.5 rounded-md border border-red-100">Issue: {s.reason}</span>}
                                                            </div>
                                                            <span className={`text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest flex-shrink-0 ml-6 shadow-sm ${s.status === 'done' ? 'bg-emerald-600 text-white' : s.status === 'failed' ? 'bg-red-600 text-white' : 'bg-base-200 dark:bg-base-700 text-base-600'}`}>{s.status}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <aside className="w-[230px] flex-shrink-0 flex flex-col glass-card rounded-[2.5rem] shadow-2xl p-4 overflow-hidden border-white/50 font-sans">
                <div className="flex-grow overflow-y-auto no-scrollbar space-y-5 pb-4">
                    <div className="space-y-3">
                        <h3 className="text-[9px] font-black text-base-400 uppercase tracking-[0.3em] ml-1">Lifecycle</h3>
                        <div className="flex flex-col gap-2">
                            <label className="relative flex items-center gap-3 p-3 rounded-[1.2rem] bg-white dark:bg-white/5 border border-white dark:border-base-800 cursor-pointer shadow-sm group overflow-hidden transition-all hover:border-primary-300">
                                <CalendarIcon className="h-6 w-6 text-primary-500" />
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-base-400 uppercase leading-none mb-1">Target Date</span>
                                    <span className="text-[13px] font-black text-base-900 dark:text-white tracking-tight">{new Date(selectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                </div>
                                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer z-[100] w-full h-full block full-click-date-input" />
                            </label>
                            <div className="flex p-1 bg-white/50 dark:bg-base-900/50 rounded-[1.2rem] border border-white dark:border-base-800 shadow-inner">
                                <button onClick={() => setSelectedShift('day')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${selectedShift === 'day' ? 'bg-white dark:bg-base-700 text-amber-600 shadow-md ring-1 ring-black/5' : 'text-base-400'}`}><SunIcon className="h-4 w-4" /> Day</button>
                                <button onClick={() => setSelectedShift('night')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${selectedShift === 'night' ? 'bg-white dark:bg-base-700 text-indigo-600 shadow-md ring-1 ring-black/5' : 'text-base-400'}`}><MoonIcon className="h-4 w-4" /> Night</button>
                            </div>
                        </div>
                    </div>

                    {shiftReport && (
                        <div className="space-y-4 pt-2 animate-fade-in">
                            <div className="space-y-3">
                                <h3 className="text-[9px] font-black text-base-400 uppercase tracking-[0.3em] ml-1">Instrument Health</h3>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => handleUpdateReport({ instruments: [{ name: 'Lab Systems', status: shiftReport.instruments[0].status === 'normal' ? 'abnormal' : 'normal' }] })}
                                        className={`w-full p-3 rounded-[1.2rem] border flex items-center justify-between transition-all ${shiftReport.instruments[0].status === 'normal' ? 'bg-emerald-50/40 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700 animate-pulse'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${shiftReport.instruments[0].status === 'normal' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                            <span className="font-black uppercase text-[10px] tracking-widest">Lab Systems</span>
                                        </div>
                                        <span className="text-[9px] font-black uppercase">{shiftReport.instruments[0].status}</span>
                                    </button>
                                    {shiftReport.instruments[0].status === 'abnormal' && (
                                        <textarea 
                                            value={shiftReport.infrastructureNote || ''}
                                            onChange={e => handleUpdateReport({ infrastructureNote: e.target.value })}
                                            placeholder="Describe system issue..."
                                            className="w-full p-3 rounded-[1rem] bg-red-50/50 border border-red-100 text-[10px] font-bold outline-none focus:ring-2 focus:ring-red-200 dark:bg-base-900"
                                            rows={2}
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-[9px] font-black text-base-400 uppercase tracking-[0.3em] ml-1">Waste Level</h3>
                                <div className="grid grid-cols-3 gap-1.5 p-1 bg-white/50 dark:bg-base-900/50 rounded-[1.2rem] border border-white dark:border-base-800">
                                    {(['low', 'medium', 'high'] as const).map(lvl => {
                                        const isActive = shiftReport.wasteLevel === lvl;
                                        let activeColor = 'bg-primary-600';
                                        if (lvl === 'low') activeColor = 'bg-emerald-600';
                                        if (lvl === 'medium') activeColor = 'bg-amber-500';
                                        if (lvl === 'high') activeColor = 'bg-red-600';

                                        return (
                                            <button 
                                                key={lvl}
                                                onClick={() => handleUpdateReport({ wasteLevel: lvl })}
                                                className={`py-2 rounded-lg text-[9px] font-black uppercase transition-all ${isActive ? `${activeColor} text-white shadow-md` : 'text-base-400 hover:text-base-600'}`}
                                            >
                                                {lvl}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-[9px] font-black text-base-400 uppercase tracking-[0.3em] ml-1">Area Hygiene</h3>
                                <div className="flex flex-col gap-2">
                                    <div className="flex p-1 bg-white/50 dark:bg-base-900/50 rounded-[1.2rem] border border-white dark:border-base-800">
                                        {(['good', 'bad'] as const).map(c => (
                                            <button 
                                                key={c}
                                                onClick={() => handleUpdateReport({ cleanliness: c })}
                                                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${shiftReport.cleanliness === c ? (c === 'good' ? 'bg-emerald-600 text-white shadow-md' : 'bg-red-600 text-white shadow-md') : 'text-base-400'}`}
                                            >
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                    <textarea 
                                        value={shiftReport.cleanlinessNote || ''}
                                        onChange={e => handleUpdateReport({ cleanlinessNote: e.target.value })}
                                        placeholder="Notes about area (optional)"
                                        className="w-full p-3 rounded-[1rem] bg-white dark:bg-base-900 border border-base-100 dark:border-base-800 text-[10px] font-bold outline-none focus:ring-2 focus:ring-primary-100"
                                        rows={2}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="pt-3 border-t border-base-100 dark:border-base-800">
                    <button onClick={handleSaveReport} disabled={isSaving} className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 text-white font-black rounded-[1.2rem] shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-[0.1em] text-[12px] active:scale-95 disabled:opacity-50">
                        {isSaving ? 'Syncing...' : <><CheckCircleIcon className="h-5 w-5"/> Sync Summary</>}
                    </button>
                </div>
            </aside>

            {notification && (
                <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 px-10 py-5 rounded-[2.5rem] shadow-2xl z-[200] animate-slide-in-up flex items-center gap-4 border-2 backdrop-blur-3xl ${notification.isError ? 'bg-red-600 border-red-400 text-white' : 'bg-emerald-600 border-emerald-400 text-white'}`}>
                    <CheckCircleIcon className="h-6 w-6"/><span className="font-black text-sm uppercase tracking-widest">{notification.message}</span>
                </div>
            )}
        </div>
    );
};

export default DashboardTab;