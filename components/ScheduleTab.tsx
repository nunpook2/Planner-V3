import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Tester, AssignedTask, RawTask, CategorizedTask, AssignedPrepareTask } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { 
    getAssignedTasks, updateAssignedTask, deleteAssignedTask, 
    getAssignedPrepareTasks, markItemAsPrepared, 
    addCategorizedTask, unassignTaskToPool
} from '../services/dataService';
import { 
    CheckCircleIcon, XCircleIcon, ArrowUturnLeftIcon, 
    RefreshIcon, AlertTriangleIcon, BeakerIcon, 
    ClipboardListIcon, CalendarIcon, UserGroupIcon, DownloadIcon
} from './common/Icons';

declare const XLSX: any;

interface ScheduleTabProps {
    testers: Tester[];
    onTasksUpdated: () => void;
}

const LocalModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (inputValue?: string) => void;
    title: string;
    message: string;
    showInput?: boolean;
    inputPlaceholder?: string;
    confirmText?: string;
    confirmColor?: string;
}> = ({ isOpen, onClose, onConfirm, title, message, showInput, inputPlaceholder, confirmText = "Confirm", confirmColor = "bg-primary-600" }) => {
    const [val, setVal] = useState('');
    useEffect(() => { if (isOpen) setVal(''); }, [isOpen]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-800 rounded-[2rem] shadow-2xl p-6 w-full max-w-md m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-black text-base-900 dark:text-base-100 tracking-tighter">{title}</h3>
                <p className="text-xs font-medium text-base-600 dark:text-base-300 leading-relaxed">{message}</p>
                {showInput && (
                    <input autoFocus type="text" value={val} onChange={e => setVal(e.target.value)} placeholder={inputPlaceholder} className="w-full p-3 bg-base-50 dark:bg-base-950 border border-base-200 dark:border-base-800 rounded-xl focus:ring-4 focus:ring-primary-500/10 outline-none dark:text-white font-bold text-sm" onKeyDown={e => { if (e.key === 'Enter' && val.trim()) onConfirm(val); }} />
                )}
                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-black text-base-400 hover:text-base-800 uppercase tracking-widest">Cancel</button>
                    <button onClick={() => onConfirm(showInput ? val : undefined)} disabled={showInput && !val.trim()} className={`px-6 py-2 text-xs font-black text-white rounded-xl shadow-lg transition-all disabled:opacity-50 uppercase tracking-widest ${confirmColor}`}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
};

const getTaskValue = (task: RawTask, header: string): any => {
    const keys = Object.keys(task);
    const target = header.toLowerCase().trim();
    const matchedKey = keys.find(k => k.toLowerCase().trim() === target);
    return matchedKey ? task[matchedKey] : '';
};

const ScheduleTab: React.FC<ScheduleTabProps> = ({ testers, onTasksUpdated }) => {
    const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
    const [prepareTasks, setPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedShift, setSelectedShift] = useState<'day' | 'night'>('day');
    const [activePersonId, setActivePersonId] = useState<string>('');
    const [notification, setNotification] = useState<{message: string, isError: boolean} | null>(null);

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean; title: string; message: string; showInput?: boolean; inputPlaceholder?: string; confirmText?: string; confirmColor?: string; onConfirm: (val?: string) => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const fetchData = async () => {
        try {
            const [assigned, prepared] = await Promise.all([ getAssignedTasks(), getAssignedPrepareTasks() ]);
            setAssignedTasks(assigned.filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
            setPrepareTasks(prepared.filter(t => t.assignedDate === selectedDate && t.shift === selectedShift));
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchData(); }, [selectedDate, selectedShift, activePersonId]);
    useEffect(() => { if (notification) { const t = setTimeout(() => setNotification(null), 3000); return () => clearTimeout(t); } }, [notification]);

    const activePerson = testers.find(t => t.id === activePersonId);
    const personTasks = assignedTasks.filter(t => t.testerId === activePersonId);
    const personPrepTasks = prepareTasks.filter(t => t.assistantId === activePersonId);

    const groupedPersonTasks = useMemo(() => {
        const groups: Record<string, { requestId: string, category: TaskCategory, items: { task: RawTask, sourceGroup: AssignedTask, index: number }[] }> = {};
        personTasks.forEach(group => {
            const effectiveId = group.category === TaskCategory.Manual ? 'AD-HOC-TASKS' : group.requestId;
            const displayId = group.category === TaskCategory.Manual ? 'MANUAL TASKS' : group.requestId;
            if (!groups[effectiveId]) groups[effectiveId] = { requestId: displayId, category: group.category, items: [] };
            group.tasks.forEach((task, idx) => groups[effectiveId].items.push({ task, sourceGroup: group, index: idx }));
        });
        return Object.values(groups).sort((a, b) => a.requestId.localeCompare(b.requestId));
    }, [personTasks]);

    const groupedPrepTasks = useMemo(() => {
        const groups: Record<string, { requestId: string, items: { task: RawTask, sourceGroup: AssignedPrepareTask, index: number }[] }> = {};
        personPrepTasks.forEach(group => {
            const effectiveId = group.category === TaskCategory.Manual ? 'MANUAL-PREP' : group.requestId;
            const displayId = group.category === TaskCategory.Manual ? 'MANUAL PREP' : group.requestId;
            if (!groups[effectiveId]) groups[effectiveId] = { requestId: displayId, items: [] };
            group.tasks.forEach((task, idx) => groups[effectiveId].items.push({ task, sourceGroup: group, index: idx }));
        });
        return Object.values(groups).sort((a, b) => a.requestId.localeCompare(b.requestId));
    }, [personPrepTasks]);

    const handleUpdateStatus = async (group: AssignedTask, itemIndex: number, newStatus: TaskStatus, reason: string | null = null) => {
        const updatedItems = [...group.tasks];
        updatedItems[itemIndex] = { ...updatedItems[itemIndex], status: newStatus, notOkReason: reason };
        await updateAssignedTask(group.id, { tasks: updatedItems });
        fetchData();
    };

    const handleMarkPrepared = async (group: AssignedPrepareTask, itemIndex: number) => {
        await markItemAsPrepared(group, itemIndex);
        fetchData();
    };

    const handleCorrectionReturn = async (group: AssignedTask, itemIndex: number) => {
        const item = group.tasks[itemIndex];
        const categorizedTask: CategorizedTask = { id: group.requestId, category: group.category, tasks: [item], docId: group.id };
        await unassignTaskToPool(categorizedTask);
        const remaining = group.tasks.filter((_, idx) => idx !== itemIndex);
        if (remaining.length > 0) await updateAssignedTask(group.id, { tasks: remaining });
        else await deleteAssignedTask(group.id);
        fetchData(); onTasksUpdated();
    };

    const handleTesterReturn = async (group: AssignedTask, itemIndex: number) => {
        setModalConfig({
            isOpen: true, title: "Report Issue", message: "Why abort?", showInput: true, inputPlaceholder: "Reason...", confirmText: "Report", confirmColor: "bg-red-600",
            onConfirm: async (reason) => {
                if (!reason) return;
                const item = group.tasks[itemIndex];
                await addCategorizedTask({ id: group.requestId, category: group.category, tasks: [{ ...item, isReturned: true, returnReason: reason, returnedBy: group.testerName }], isReturnedPool: true, createdAt: new Date().toISOString(), shift: group.shift, returnedBy: group.testerName, returnReason: reason, returnedDate: group.assignedDate } as any);
                const remaining = group.tasks.filter((_, idx) => idx !== itemIndex);
                if (remaining.length > 0) await updateAssignedTask(group.id, { tasks: remaining });
                else await deleteAssignedTask(group.id);
                fetchData(); onTasksUpdated(); setModalConfig(p => ({ ...p, isOpen: false }));
            }
        });
    };

    const handleExport = () => {
        const executionData = assignedTasks.flatMap(group => 
            group.tasks.map(task => ({
                'Type': 'Execution',
                'Personnel': group.testerName,
                'Request ID': group.requestId,
                'Description': getTaskValue(task, 'Description'),
                'Quantity': getTaskValue(task, 'Quantity'),
                'Sample Name': getTaskValue(task, 'Sample Name'),
                'Variant': getTaskValue(task, 'Variant'),
                'Status': task.status || 'Pending'
            }))
        );
        const prepData = prepareTasks.flatMap(group => 
            group.tasks.map(task => ({
                'Type': 'Preparation',
                'Personnel': group.assistantName,
                'Request ID': group.requestId,
                'Description': getTaskValue(task, 'Description'),
                'Quantity': getTaskValue(task, 'Quantity'),
                'Sample Name': getTaskValue(task, 'Sample Name'),
                'Variant': getTaskValue(task, 'Variant'),
                'Status': task.preparationStatus || 'Awaiting'
            }))
        );
        const allData = [...executionData, ...prepData];
        const ws = XLSX.utils.json_to_sheet(allData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Shift Assignments");
        XLSX.writeFile(wb, `ShiftAssignments_${selectedDate}_${selectedShift}.xlsx`);
    };

    return (
        <div className="flex flex-col h-full space-y-3 p-3">
            <style>{`
                .person-avatar { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); }
                .person-avatar.assistant { background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); }
                .active-glow { box-shadow: 0 0 20px -5px rgba(99, 102, 241, 0.4); }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .line-clamp-2 {
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;  
                    overflow: hidden;
                }
            `}</style>
            <LocalModal isOpen={modalConfig.isOpen} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} onConfirm={modalConfig.onConfirm} title={modalConfig.title} message={modalConfig.message} showInput={modalConfig.showInput} inputPlaceholder={modalConfig.inputPlaceholder} confirmText={modalConfig.confirmText} confirmColor={modalConfig.confirmColor} />

            <div className="flex-grow grid grid-cols-12 gap-4 min-h-0">
                <div className="col-span-3 bg-white/40 dark:bg-base-900/40 rounded-[2rem] border border-white dark:border-base-800 shadow-sm flex flex-col overflow-hidden backdrop-blur-md">
                    <div className="p-4 border-b border-white dark:border-base-800 bg-white/20 flex justify-between items-center">
                        <h3 className="text-[10px] font-black text-base-400 uppercase tracking-[0.4em] ml-1">Staff List</h3>
                        <button onClick={handleExport} title="Export All Assignments" className="p-1.5 bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 rounded-lg hover:bg-base-50 transition-colors">
                            <DownloadIcon className="h-4 w-4 text-base-500" />
                        </button>
                    </div>
                    <div className="flex-grow overflow-y-auto no-scrollbar p-2 space-y-1.5">
                        {testers.filter(t => assignedTasks.some(at => at.testerId === t.id) || prepareTasks.some(pt => pt.assistantId === t.id)).map(tester => {
                            const isActive = activePersonId === tester.id;
                            const isAssistant = tester.team === 'assistants_4_2';
                            const count = assignedTasks.filter(at => at.testerId === tester.id).reduce((acc, g) => acc + g.tasks.length, 0) + prepareTasks.filter(pt => pt.assistantId === tester.id).reduce((acc, g) => acc + g.tasks.length, 0);
                            return (
                                <button key={tester.id} onClick={() => setActivePersonId(tester.id)} className={`w-full group flex items-center gap-3 p-2.5 rounded-[1.2rem] transition-all duration-300 border text-left ${isActive ? 'bg-gradient-to-r from-primary-600 to-indigo-600 border-primary-500 text-white shadow-lg active-glow scale-[1.01]' : 'bg-white/40 dark:bg-base-900/40 hover:bg-white dark:hover:bg-base-800 border-transparent'}`}>
                                    <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-[10px] font-black shadow-inner ${isAssistant ? 'person-avatar assistant' : 'person-avatar'} ${isActive ? 'ring-2 ring-white/30' : 'text-white'}`}>{tester.name.substring(0, 2).toUpperCase()}</div>
                                    <div className="flex-grow min-w-0"><span className={`block text-[13px] font-black tracking-tight truncate ${isActive ? 'text-white' : 'text-base-800 dark:text-base-100'}`}>{tester.name}</span><span className={`text-[8px] font-bold uppercase tracking-widest ${isActive ? 'text-white/60' : 'text-base-400'}`}>{isAssistant ? 'Asst' : 'Anlst'}</span></div>
                                    {count > 0 && <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black ${isActive ? 'bg-white text-primary-600' : 'bg-primary-500 text-white'}`}>{count}</div>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="col-span-9 bg-white/60 dark:bg-base-900/60 rounded-[2rem] border border-white dark:border-base-800 shadow-2xl flex flex-col overflow-hidden relative backdrop-blur-xl">
                    <div className="px-6 py-3 border-b border-white dark:border-base-800 flex justify-between items-center bg-white/30 dark:bg-base-800/10">
                        <div className="flex items-center gap-4">{activePerson && <><div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black text-white shadow-xl ${activePerson.team === 'assistants_4_2' ? 'person-avatar assistant' : 'person-avatar'}`}>{activePerson.name.substring(0, 2).toUpperCase()}</div><h2 className="text-xl font-black text-base-900 dark:text-white tracking-tighter">{activePerson.name}</h2></>}</div>
                        <div className="flex gap-2 bg-white/50 dark:bg-base-800/50 p-1.5 rounded-2xl border border-white dark:border-base-700 shadow-inner relative"><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-transparent border-none text-[12px] font-black focus:ring-0 cursor-pointer p-1 min-w-[130px] dark:text-white" /><select value={selectedShift} onChange={e => setSelectedShift(e.target.value as any)} className="bg-transparent border-none text-[10px] font-black focus:ring-0 cursor-pointer p-1 uppercase dark:text-white"><option value="day">Day</option><option value="night">Night</option></select></div>
                    </div>

                    <div className="flex-grow overflow-y-auto no-scrollbar p-6 space-y-6">
                        {!activePerson ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-10 py-20 text-center"><BeakerIcon className="h-20 w-20 mb-4" /><p className="text-lg font-black uppercase tracking-[0.4em]">Select Personnel</p></div>
                        ) : (
                            <>
                                {groupedPrepTasks.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 ml-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div><h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Preparation Duty</h4></div>
                                        {groupedPrepTasks.map(group => (
                                            <div key={group.requestId} className="bg-amber-50/20 dark:bg-amber-900/10 rounded-[1.5rem] border-2 border-amber-100 dark:border-amber-900/30 overflow-hidden shadow-sm">
                                                <div className="px-6 py-2.5 bg-amber-900 text-white border-b-2 border-amber-800 flex justify-between items-center"><span className="text-[12px] font-black uppercase tracking-widest">SEQUENCE: {group.requestId}</span></div>
                                                <div className="p-2 space-y-1.5">
                                                    {group.items.map((item, idx) => {
                                                        const desc = String(getTaskValue(item.task, 'Description') || 'Task').trim();
                                                        const qty = String(getTaskValue(item.task, 'Quantity') || '1').trim();
                                                        const variant = String(getTaskValue(item.task, 'Variant') || '').trim();
                                                        const sampleName = String(getTaskValue(item.task, 'Sample Name') || '').trim();
                                                        const isLong = desc.length > 50;
                                                        
                                                        return (
                                                            <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-base-800/60 rounded-[1rem] border border-amber-100 dark:border-amber-900/20 shadow-sm">
                                                                <div className="flex-grow min-w-0 flex flex-row items-center gap-4">
                                                                    <div className={`flex-grow font-black uppercase leading-[1.2] line-clamp-2 text-base-950 dark:text-base-100 ${isLong ? 'text-[12px]' : 'text-[14px]'}`}>
                                                                        {desc}
                                                                    </div>
                                                                    <div className="flex flex-shrink-0 items-center gap-2">
                                                                        <div className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-[10px] font-black text-amber-800 border border-amber-200 flex-shrink-0">x{qty}</div>
                                                                        {sampleName && sampleName !== 'N/A' && <div className="px-2 py-0.5 bg-base-100 dark:bg-base-700/50 rounded-lg text-[10px] font-black text-base-800 dark:text-base-200 border border-base-200 dark:border-base-600 uppercase truncate max-w-[200px]">S: {sampleName}</div>}
                                                                        {variant && <div className="text-[10px] font-black text-amber-600 dark:text-amber-400 italic uppercase flex-shrink-0">D: {variant}</div>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-shrink-0 ml-4">{item.task.preparationStatus === 'Prepared' || item.task.preparationStatus === 'Ready for Testing' ? <div className="text-emerald-700 font-black text-[10px] uppercase tracking-widest px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-lg shadow-sm">Ready</div> : <button onClick={() => handleMarkPrepared(item.sourceGroup, item.index)} className="px-6 py-1.5 bg-amber-500 text-white font-black rounded-xl shadow-lg uppercase text-[9px] tracking-widest hover:bg-amber-600 transition-all active:scale-95">Mark Prepared</button>}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {groupedPersonTasks.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 ml-1"><div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></div><h4 className="text-[10px] font-black text-primary-600 uppercase tracking-widest">Active Execution</h4></div>
                                        {groupedPersonTasks.map(group => (
                                            <div key={group.requestId} className="bg-white/60 dark:bg-base-950/40 rounded-[1.5rem] border-2 border-base-200 dark:border-base-800 overflow-hidden shadow-md">
                                                <div className="px-6 py-2.5 bg-base-900 text-white border-b-2 border-base-800 flex justify-between items-center"><span className="text-[12px] font-black uppercase tracking-widest">SEQUENCE: {group.requestId}</span></div>
                                                <div className="p-2 space-y-2">
                                                    {group.items.map((item, idx) => {
                                                        const isDone = item.task.status === TaskStatus.Done;
                                                        const desc = String(getTaskValue(item.task, 'Description') || 'Task').trim();
                                                        const qty = String(getTaskValue(item.task, 'Quantity') || '1').trim();
                                                        const variant = String(getTaskValue(item.task, 'Variant') || '').trim();
                                                        const sampleName = String(getTaskValue(item.task, 'Sample Name') || '').trim();
                                                        const isLong = desc.length > 50;

                                                        return (
                                                            <div key={idx} className={`p-3.5 rounded-[1.2rem] border-2 transition-all duration-300 flex items-center justify-between gap-4 ${isDone ? 'bg-emerald-50/40 border-emerald-100 shadow-sm' : 'bg-white dark:bg-base-900 border-base-100 dark:border-base-700 shadow-lg hover:border-primary-200'}`}>
                                                                <div className="flex-grow min-w-0 flex flex-row items-center gap-4">
                                                                    <div className={`flex-grow font-black uppercase leading-[1.2] line-clamp-2 ${isDone ? 'text-emerald-800 opacity-60' : 'text-base-950 dark:text-base-100'} ${isLong ? 'text-[12px]' : 'text-[14px]'}`}>
                                                                        {desc}
                                                                    </div>
                                                                    <div className="flex flex-shrink-0 items-center gap-2">
                                                                        <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black border flex-shrink-0 ${isDone ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>x{qty}</div>
                                                                        {sampleName && sampleName !== 'N/A' && <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase truncate max-w-[220px] flex-shrink-0 ${isDone ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700/50' : 'bg-indigo-100/30 border-indigo-100 text-indigo-950 dark:text-indigo-200'}`}>S: {sampleName}</div>}
                                                                        {variant && <div className={`text-[10px] font-black uppercase italic flex-shrink-0 ${isDone ? 'text-emerald-600/40' : 'text-primary-600 dark:text-primary-400 opacity-90'}`}>D: {variant}</div>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-row items-center gap-2 flex-shrink-0 ml-4">
                                                                    {!isDone ? <button onClick={() => handleUpdateStatus(item.sourceGroup, item.index, TaskStatus.Done)} className="px-6 sm:px-8 py-2 bg-emerald-600 text-white font-black rounded-xl shadow-lg uppercase tracking-widest text-[10px] hover:bg-emerald-700 hover:shadow-emerald-200 transition-all active:scale-95">Verify</button> : <button onClick={() => handleUpdateStatus(item.sourceGroup, item.index, TaskStatus.Pending)} className="px-3 sm:px-4 py-1.5 bg-base-100 dark:bg-base-800 text-[9px] font-black uppercase text-base-700 dark:text-base-300 rounded-xl transition-all flex items-center gap-2 border border-base-200 dark:border-base-700 shadow-sm"><RefreshIcon className="h-3 w-3" /> Reset</button>}
                                                                    <div className="flex gap-1.5 ml-1 sm:ml-2"><button onClick={() => handleCorrectionReturn(item.sourceGroup, item.index)} className="p-2 bg-white dark:bg-base-800 text-base-400 hover:text-primary-600 hover:border-primary-400 rounded-xl border-2 border-base-100 dark:border-base-700 transition-all shadow-sm"><ArrowUturnLeftIcon className="h-4 w-4" /></button><button onClick={() => handleTesterReturn(item.sourceGroup, item.index)} className="p-2 bg-white dark:bg-base-800 text-base-400 hover:text-rose-600 hover:border-rose-400 rounded-xl border-2 border-base-100 dark:border-base-700 transition-all shadow-sm"><AlertTriangleIcon className="h-4 w-4" /></button></div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleTab;