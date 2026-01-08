
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Tester, AssignedTask, RawTask, CategorizedTask, AssignedPrepareTask } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { 
    getAssignedTasks, updateAssignedTask, deleteAssignedTask, 
    getAssignedPrepareTasks, markItemAsPrepared, 
    addCategorizedTask, unassignTaskToPool, updateAssignedPrepareTask,
    resetItemPreparation,
    deleteAssignedPrepareTask
} from '../services/dataService';
import { 
    CheckCircleIcon, XCircleIcon, ArrowUturnLeftIcon, 
    RefreshIcon, AlertTriangleIcon, BeakerIcon, 
    ClipboardListIcon, CalendarIcon, UserGroupIcon, DownloadIcon,
    ChatBubbleLeftEllipsisIcon
} from './common/Icons';

declare const XLSX: any;

const LocalModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (inputValue?: string) => void;
    title: string;
    message: string;
    showInput?: boolean;
    isTextArea?: boolean;
    inputPlaceholder?: string;
    confirmText?: string;
    confirmColor?: string;
    icon?: React.ReactNode;
}> = ({ 
    isOpen, onClose, onConfirm, title, message, showInput, 
    isTextArea, inputPlaceholder, confirmText = "Confirm", 
    confirmColor = "bg-primary-600", icon 
}) => {
    const [val, setVal] = useState('');
    
    useEffect(() => { 
        if (isOpen) {
            setVal(showInput && typeof message === 'string' && message !== 'N/A' ? message : ''); 
        }
    }, [isOpen, showInput, message]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/80 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-800 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] p-8 w-full max-w-lg m-4 space-y-6 animate-slide-in-up border border-white/20 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${confirmColor.includes('red') || confirmColor.includes('orange') ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        {icon || <ChatBubbleLeftEllipsisIcon className="h-6 w-6" />}
                    </div>
                    <h3 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tighter">{title}</h3>
                </div>

                {!isTextArea && <p className="text-sm font-medium text-base-600 dark:text-base-300 leading-relaxed whitespace-pre-wrap px-1">{message}</p>}
                
                {showInput && (
                    <div className="relative group">
                        {isTextArea ? (
                            <textarea 
                                autoFocus 
                                value={val} 
                                onChange={e => setVal(e.target.value)} 
                                placeholder={inputPlaceholder} 
                                rows={5}
                                className="w-full p-5 bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none dark:text-white font-bold text-[15px] resize-none transition-all"
                            />
                        ) : (
                            <input 
                                autoFocus 
                                type="text" 
                                value={val} 
                                onChange={e => setVal(e.target.value)} 
                                placeholder={inputPlaceholder} 
                                className="w-full p-4 bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white font-bold text-sm transition-all" 
                                onKeyDown={e => { if (e.key === 'Enter' && val.trim()) onConfirm(val); }} 
                            />
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-4 pt-2">
                    <button onClick={onClose} className="px-6 py-3 text-[11px] font-black text-base-400 hover:text-base-800 dark:hover:text-white uppercase tracking-widest transition-colors">Close</button>
                    {showInput && (
                        <button 
                            onClick={() => onConfirm(val)} 
                            className={`px-8 py-3.5 text-[11px] font-black text-white rounded-2xl shadow-xl transition-all uppercase tracking-widest ${confirmColor} hover:brightness-110`}
                        >
                            {confirmText}
                        </button>
                    )}
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

// Fix for line 108: Define missing ScheduleTabProps interface
interface ScheduleTabProps {
    testers: Tester[];
    onTasksUpdated: () => void;
    selectedDate: string;
    onDateChange: (date: string) => void;
    selectedShift: 'day' | 'night';
    onShiftChange: (shift: 'day' | 'night') => void;
}

const ScheduleTab: React.FC<ScheduleTabProps> = ({ 
    testers, 
    onTasksUpdated, 
    selectedDate, 
    onDateChange, 
    selectedShift, 
    onShiftChange 
}) => {
    const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
    const [prepareTasks, setPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [activePersonId, setActivePersonId] = useState<string>('');
    const [notification, setNotification] = useState<{message: string, isError: boolean} | null>(null);

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean; title: string; message: string; showInput?: boolean; isTextArea?: boolean; inputPlaceholder?: string; confirmText?: string; confirmColor?: string; icon?: React.ReactNode; onConfirm: (val?: string) => void;
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

    const handleUpdateNote = async (type: 'exec' | 'prep', group: any, itemIndex: number, note: string) => {
        const updatedItems = [...group.tasks];
        updatedItems[itemIndex] = { ...updatedItems[itemIndex], plannerNote: note.trim() || null };
        if (type === 'exec') {
            await updateAssignedTask(group.id, { tasks: updatedItems });
        } else {
            await updateAssignedPrepareTask(group.id, { tasks: updatedItems });
        }
        fetchData();
        setModalConfig(p => ({ ...p, isOpen: false }));
        setNotification({ message: "Instruction Updated", isError: false });
    };

    const handleUpdateRemark = async (type: 'exec' | 'prep', group: any, itemIndex: number, remark: string) => {
        const updatedItems = [...group.tasks];
        updatedItems[itemIndex] = { ...updatedItems[itemIndex], analystRemark: remark.trim() || null };
        if (type === 'exec') {
            await updateAssignedTask(group.id, { tasks: updatedItems });
        } else {
            await updateAssignedPrepareTask(group.id, { tasks: updatedItems });
        }
        fetchData();
        setModalConfig(p => ({ ...p, isOpen: false }));
        setNotification({ message: "Analyst Note Recorded", isError: false });
    };

    const handleNoteClick = (type: 'exec' | 'prep', group: any, itemIndex: number) => {
        const currentNote = group.tasks[itemIndex].plannerNote || '';
        setModalConfig({
            isOpen: true, 
            title: "Planner Mission Briefing", 
            message: currentNote, 
            showInput: true, 
            isTextArea: true,
            inputPlaceholder: "Enter detailed instructions or special remarks for the Analyst here...", 
            confirmText: "Save Mission", 
            confirmColor: "bg-indigo-600",
            onConfirm: (note) => handleUpdateNote(type, group, itemIndex, note || '')
        });
    };

    const handleRemarkClick = (type: 'exec' | 'prep', group: any, itemIndex: number) => {
        const currentRemark = group.tasks[itemIndex].analystRemark || '';
        setModalConfig({
            isOpen: true, 
            title: "Analyst Shift Remark", 
            message: currentRemark, 
            showInput: true, 
            isTextArea: true,
            inputPlaceholder: "Record observations, samples issues, or work completion details here...", 
            confirmText: "Save Note", 
            confirmColor: "bg-emerald-600",
            icon: <ClipboardListIcon className="h-6 w-6 text-emerald-600" />,
            onConfirm: (remark) => handleUpdateRemark(type, group, itemIndex, remark || '')
        });
    };

    const handleViewQualityIssue = (reason: string) => {
        setModalConfig({
            isOpen: true,
            title: "Quality Issue Details",
            message: reason,
            showInput: false,
            confirmColor: "bg-red-600",
            icon: <AlertTriangleIcon className="h-6 w-6" />,
            onConfirm: () => setModalConfig(p => ({ ...p, isOpen: false }))
        });
    };

    const handleNotOkClick = (group: AssignedTask, itemIndex: number) => {
        setModalConfig({
            isOpen: true, title: "Report Quality Issue", message: "Why is this task Not OK?", showInput: true, inputPlaceholder: "Reason...", confirmText: "Mark Not OK", confirmColor: "bg-red-600",
            onConfirm: async (reason) => {
                if (!reason) return;
                await handleUpdateStatus(group, itemIndex, TaskStatus.NotOK, reason);
                setModalConfig(p => ({ ...p, isOpen: false }));
            }
        });
    };

    const handleMarkPrepared = async (group: AssignedPrepareTask, itemIndex: number) => {
        await markItemAsPrepared(group, itemIndex);
        fetchData();
    };

    const handleResetPrep = async (group: AssignedPrepareTask, itemIndex: number) => {
        await resetItemPreparation(group, itemIndex);
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

    const handlePrepReturn = async (group: AssignedPrepareTask, itemIndex: number) => {
        setModalConfig({
            isOpen: true, 
            title: "Abort Preparation", 
            message: "คุณต้องการคืนรายการงานเตรียมชิ้นนี้กลับไปที่คิว (Pool) เพื่อจัดสรรใหม่ใช่หรือไม่?", 
            showInput: true, 
            inputPlaceholder: "ระบุเหตุผลการคืนงานเตรียม...", 
            confirmText: "คืนงานรายชิ้น", 
            confirmColor: "bg-orange-600",
            onConfirm: async (reason) => {
                if (!reason) return;
                const item = { ...group.tasks[itemIndex] };
                
                // คืนงานแบบราย Item โดยล้างสถานะ Ready และใส่ flag คืนงาน
                await addCategorizedTask({ 
                    id: group.requestId, 
                    category: group.category, 
                    tasks: [{ 
                        ...item, 
                        isReturned: true, 
                        returnReason: `Preparation: ${reason}`, 
                        returnedBy: group.assistantName, 
                        preparationStatus: null // ล้างสถานะให้กลับไปรอเตรียมใหม่
                    }], 
                    isReturnedPool: true, 
                    createdAt: new Date().toISOString(), 
                    shift: group.shift, 
                    returnedBy: group.assistantName, 
                    returnReason: reason 
                } as any);

                // ลบออกจากกลุ่มงานเตรียมเดิม
                const remaining = group.tasks.filter((_, idx) => idx !== itemIndex);
                if (remaining.length > 0) await updateAssignedPrepareTask(group.id, { tasks: remaining });
                else await deleteAssignedPrepareTask(group.id);
                
                fetchData(); 
                onTasksUpdated(); 
                setModalConfig(p => ({ ...p, isOpen: false }));
                setNotification({ message: "Item returned to pool", isError: false });
            }
        });
    };

    const handleTesterReturn = async (group: AssignedTask, itemIndex: number) => {
        setModalConfig({
            isOpen: true, title: "Abort Mission", message: "Why return this task to the pool?", showInput: true, inputPlaceholder: "Reason...", confirmText: "Abort", confirmColor: "bg-orange-600",
            onConfirm: async (reason) => {
                if (!reason) return;
                const item = group.tasks[itemIndex];
                await addCategorizedTask({ id: group.requestId, category: group.category, tasks: [{ ...item, isReturned: true, returnReason: `Testing: ${reason}`, returnedBy: group.testerName }], isReturnedPool: true, createdAt: new Date().toISOString(), shift: group.shift, returnedBy: group.testerName, returnReason: reason, returnedDate: group.assignedDate } as any);
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
                'Status': task.status || 'Pending',
                'Planner Note': task.plannerNote || '',
                'Analyst Remark': task.analystRemark || ''
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
                'Status': task.preparationStatus || 'Awaiting',
                'Planner Note': task.plannerNote || '',
                'Analyst Remark': task.analystRemark || ''
            }))
        );
        const allData = [...executionData, ...prepData];

        const formatLimsDate = (dateStr: string) => {
            if (!dateStr) return '';
            const [y, m, d] = dateStr.split('-');
            return `${parseInt(d)}/${parseInt(m)}/${y}`;
        };

        const integrationHeaderA1 = [["Count of Variant"]];
        const integrationHeadersRow2 = ["SDIDATAID", "Assign Analyst", "Assign Start date", "Total"];
        
        const integrationRows = [
            ...assignedTasks.flatMap(group => 
                group.tasks.map(task => [
                    getTaskValue(task, 'SDIDATAID') || '',
                    group.testerName,
                    formatLimsDate(group.assignedDate),
                    1
                ])
            ),
            ...prepareTasks.flatMap(group => 
                group.tasks.map(task => [
                    getTaskValue(task, 'SDIDATAID') || '',
                    group.assistantName,
                    formatLimsDate(group.assignedDate),
                    1
                ])
            )
        ];

        const integrationAOA = [
            ...integrationHeaderA1,
            integrationHeadersRow2,
            ...integrationRows
        ];

        const ws1 = XLSX.utils.json_to_sheet(allData);
        const ws2 = XLSX.utils.aoa_to_sheet(integrationAOA);
        
        ws2['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 8 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws1, "Shift Assignments");
        XLSX.utils.book_append_sheet(wb, ws2, "LIMS_Integration");
        
        XLSX.writeFile(wb, `ShiftAssignments_${selectedDate}_${selectedShift}.xlsx`);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-3 p-3 overflow-hidden">
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
                
                @keyframes red-ring-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.3); transform: scale(1); }
                    70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); transform: scale(1.05); }
                    100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); transform: scale(1); }
                }

                .luxury-red-pulse {
                    animation: red-ring-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            `}</style>
            
            <LocalModal 
                isOpen={modalConfig.isOpen} 
                onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} 
                onConfirm={modalConfig.onConfirm} 
                title={modalConfig.title} 
                message={modalConfig.message} 
                showInput={modalConfig.showInput} 
                isTextArea={modalConfig.isTextArea} 
                inputPlaceholder={modalConfig.inputPlaceholder} 
                confirmText={modalConfig.confirmText} 
                confirmColor={modalConfig.confirmColor} 
                icon={modalConfig.icon}
            />

            {notification && (
                <div className={`fixed bottom-10 right-10 z-[110] px-6 py-4 rounded-2xl shadow-2xl animate-slide-in-up flex items-center gap-3 font-black text-xs uppercase tracking-widest ${notification.isError ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                    <CheckCircleIcon className="h-5 w-5" />
                    {notification.message}
                </div>
            )}

            <div className="flex-grow grid grid-cols-12 gap-4 h-full relative overflow-hidden">
                <div className="col-span-3 bg-white/40 dark:bg-base-900/40 rounded-[2rem] border border-white dark:border-base-800 shadow-sm flex flex-col overflow-hidden backdrop-blur-md h-full">
                    <div className="p-4 border-b border-white dark:border-base-800 bg-white/20 flex justify-between items-center shrink-0">
                        <h3 className="text-[10px] font-black text-base-400 uppercase tracking-[0.4em] ml-1">Duty Roster</h3>
                        <button onClick={handleExport} title="Export Detailed Log" className="p-2 bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 rounded-xl hover:bg-base-50 transition-colors shadow-sm">
                            <DownloadIcon className="h-4 w-4 text-base-500" />
                        </button>
                    </div>
                    <div className="flex-grow overflow-y-auto no-scrollbar p-2.5 space-y-1.5">
                        {testers.filter(t => assignedTasks.some(at => at.testerId === t.id) || prepareTasks.some(pt => pt.assistantId === t.id)).map(tester => {
                            const isActive = activePersonId === tester.id;
                            const isAssistant = tester.team === 'assistants_4_2';
                            const count = assignedTasks.filter(at => at.testerId === tester.id).reduce((acc, g) => acc + g.tasks.length, 0) + prepareTasks.filter(pt => pt.assistantId === tester.id).reduce((acc, g) => acc + g.tasks.length, 0);
                            return (
                                <button key={tester.id} onClick={() => setActivePersonId(tester.id)} className={`w-full group flex items-center gap-3 p-3 rounded-[1.3rem] transition-all duration-300 border text-left ${isActive ? 'bg-gradient-to-r from-primary-600 to-indigo-600 border-primary-500 text-white shadow-lg active-glow scale-[1.02]' : 'bg-white/40 dark:bg-base-900/40 hover:bg-white dark:hover:bg-base-800 border-transparent hover:border-base-200 dark:hover:border-base-700'}`}>
                                    <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-[11px] font-black shadow-inner ${isAssistant ? 'person-avatar assistant' : 'person-avatar'} ${isActive ? 'ring-2 ring-white/40' : 'text-white'}`}>{tester.name.substring(0, 2).toUpperCase()}</div>
                                    <div className="flex-grow min-w-0"><span className={`block text-[14px] font-black tracking-tight truncate leading-none ${isActive ? 'text-white' : 'text-base-800 dark:text-base-100'}`}>{tester.name}</span><span className={`text-[8px] font-bold uppercase tracking-widest mt-1 ${isActive ? 'text-white/60' : 'text-base-400'}`}>{isAssistant ? 'Assistant' : 'Analyst'}</span></div>
                                    {count > 0 && <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black ${isActive ? 'bg-white text-primary-600 shadow-md' : 'bg-primary-50 text-white'}`}>{count}</div>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="col-span-9 bg-white/60 dark:bg-base-900/60 rounded-[2rem] border border-white dark:border-base-800 shadow-2xl flex flex-col overflow-hidden relative backdrop-blur-xl h-full">
                    <div className="px-8 py-4 border-b border-white dark:border-base-800 flex justify-between items-center bg-white/40 dark:bg-base-800/10 shrink-0 sticky top-0 z-10 backdrop-blur-md">
                        <div className="flex items-center gap-5">
                            {activePerson ? (
                                <>
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-base font-black text-white shadow-xl ${activePerson.team === 'assistants_4_2' ? 'person-avatar assistant' : 'person-avatar'}`}>
                                        {activePerson.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-base-900 dark:text-white tracking-tighter leading-none">{activePerson.name}</h2>
                                        <p className="text-[10px] text-base-400 font-bold uppercase tracking-[0.3em] mt-1.5">Operational Tasks Control</p>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-3 text-base-300 italic font-bold text-sm tracking-widest uppercase">
                                    <UserGroupIcon className="h-5 w-5" /> Select Personnel
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2.5 bg-white/60 dark:bg-base-800/60 p-2 rounded-2xl border border-white dark:border-base-700 shadow-inner relative"><input type="date" value={selectedDate} onChange={e => onDateChange(e.target.value)} className="bg-transparent border-none text-[12px] font-black focus:ring-0 cursor-pointer p-1 min-w-[140px] dark:text-white" /><select value={selectedShift} onChange={e => onShiftChange(e.target.value as any)} className="bg-transparent border-none text-[10px] font-black focus:ring-0 cursor-pointer p-1 uppercase dark:text-white tracking-widest"><option value="day">Day Shift</option><option value="night">Night Shift</option></select></div>
                    </div>

                    <div className="flex-grow overflow-y-auto no-scrollbar p-8 space-y-8">
                        {!activePerson ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-10 text-center py-20"><BeakerIcon className="h-24 w-24 mb-4 text-base-300" /><p className="text-xl font-black uppercase tracking-[0.5em] text-base-400">Select Personnel to Track</p></div>
                        ) : (
                            <>
                                {groupedPrepTasks.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2.5 ml-1"><div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-md"></div><h4 className="text-[11px] font-black text-amber-600 uppercase tracking-[0.2em]">Preparation Mission Group</h4></div>
                                        {groupedPrepTasks.map(group => (
                                            <div key={group.requestId} className="bg-amber-50/20 dark:bg-amber-900/10 rounded-[1.8rem] border-2 border-amber-100 dark:border-amber-900/30 overflow-hidden shadow-sm">
                                                <div className="px-6 py-3 bg-amber-900/90 text-white border-b border-amber-800 flex justify-between items-center backdrop-blur-sm"><span className="text-[11px] font-black uppercase tracking-[0.2em]">SEQ: {group.requestId}</span></div>
                                                <div className="p-3 space-y-2">
                                                    {group.items.map((item, idx) => {
                                                        const isPrepared = item.task.preparationStatus === 'Prepared' || item.task.preparationStatus === 'Ready for Testing';
                                                        const hasPlannerNote = !!item.task.plannerNote;
                                                        const hasAnalystRemark = !!item.task.analystRemark;
                                                        const desc = String(getTaskValue(item.task, 'Description') || 'General Task').trim();
                                                        const qty = String(getTaskValue(item.task, 'Quantity') || '1').trim();
                                                        const sampleName = String(getTaskValue(item.task, 'Sample Name') || '').trim();

                                                        return (
                                                            <div key={idx} className={`flex items-center justify-between p-4 rounded-[1.2rem] border transition-all ${isPrepared ? 'bg-emerald-50/20 border-emerald-100' : 'bg-white dark:bg-base-800/80 border-amber-100 dark:border-amber-900/20 shadow-sm'}`}>
                                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                                    <button 
                                                                        onClick={() => handleNoteClick('prep', item.sourceGroup, item.index)}
                                                                        className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-lg border-2 ${hasPlannerNote ? 'bg-red-600 border-red-400 text-white luxury-red-pulse' : 'bg-base-50 dark:bg-base-950 border-base-100 dark:border-base-800 text-base-300 hover:text-base-600 hover:border-indigo-300'}`}
                                                                        title={hasPlannerNote ? "Read Mission Instruction" : "Add Mission Briefing"}
                                                                    >
                                                                        <ChatBubbleLeftEllipsisIcon className="h-5 w-5" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleRemarkClick('prep', item.sourceGroup, item.index)}
                                                                        className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all shadow-lg border-2 ${hasAnalystRemark ? 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-500/20' : 'bg-base-50 dark:bg-base-950 border-base-100 dark:border-base-800 text-base-300 hover:text-emerald-600 hover:border-emerald-300'}`}
                                                                        title="Add/Edit Shift Observations"
                                                                    >
                                                                        <ClipboardListIcon className="h-5 w-5" />
                                                                    </button>
                                                                </div>
                                                                <div className="flex-grow min-w-0 flex flex-row items-center gap-5 ml-4">
                                                                    <div className={`flex-grow font-black uppercase leading-tight line-clamp-2 ${isPrepared ? 'text-emerald-800 opacity-60' : 'text-base-950 dark:text-base-100'} text-[16px]`}>
                                                                        {desc}
                                                                    </div>
                                                                    <div className="flex flex-shrink-0 items-center gap-3">
                                                                        <div className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-[12px] font-black text-amber-800 border border-amber-200">x{qty}</div>
                                                                        {sampleName && sampleName !== 'N/A' && <div className="px-3 py-1 bg-base-100 dark:bg-base-700/50 rounded-xl text-[12px] font-black text-base-800 dark:text-base-200 border border-base-200 dark:border-base-600 uppercase whitespace-normal leading-tight">S: {sampleName}</div>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-row items-center gap-2 flex-shrink-0 ml-5 flex">
                                                                    {isPrepared ? (
                                                                        <button onClick={() => handleResetPrep(item.sourceGroup, item.index)} className="px-4 py-2 bg-base-100 dark:bg-base-800 text-[10px] font-black uppercase text-base-700 dark:text-base-300 rounded-xl transition-all flex items-center gap-2 border-2 border-base-200 shadow-sm hover:bg-white">
                                                                            <RefreshIcon className="h-4 w-4" /> Reset
                                                                        </button>
                                                                    ) : (
                                                                        <button onClick={() => handleMarkPrepared(item.sourceGroup, item.index)} className="px-6 py-2.5 bg-amber-500 text-white font-black rounded-[1.2rem] shadow-xl uppercase text-[10px] tracking-widest hover:bg-amber-600 hover:scale-105 transition-all active:scale-95 border-b-4 border-amber-700">Mark Ready</button>
                                                                    )}
                                                                    <button 
                                                                        onClick={() => handlePrepReturn(item.sourceGroup, item.index)} 
                                                                        className="p-2.5 bg-white dark:bg-base-800 text-orange-600 dark:text-orange-400 border-2 border-orange-100 dark:border-orange-900/50 rounded-xl shadow-sm hover:bg-orange-50 transition-all"
                                                                        title="Return Preparation Item to Pool"
                                                                    >
                                                                        <ArrowUturnLeftIcon className="h-5 w-5" />
                                                                    </button>
                                                                </div>
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
                                        <div className="flex items-center gap-2.5 ml-1"><div className="w-2.5 h-2.5 rounded-full bg-primary-500 shadow-md animate-pulse"></div><h4 className="text-[11px] font-black text-primary-600 uppercase tracking-[0.2em]">Active Execution Mission</h4></div>
                                        {groupedPersonTasks.map(group => (
                                            <div key={group.requestId} className="bg-white/60 dark:bg-base-955/40 rounded-[2rem] border-2 border-base-200 dark:border-base-800 overflow-hidden shadow-lg">
                                                <div className="px-6 py-3.5 bg-base-900 text-white border-b border-indigo-900/50 flex justify-between items-center"><span className="text-[11px] font-black uppercase tracking-[0.2em]">SEQ: {group.requestId}</span></div>
                                                <div className="p-3 space-y-2.5">
                                                    {group.items.map((item, idx) => {
                                                        const isDone = item.task.status === TaskStatus.Done;
                                                        const isNotOk = item.task.status === TaskStatus.NotOK;
                                                        const isActioned = isDone || isNotOk;
                                                        const hasPlannerNote = !!item.task.plannerNote;
                                                        const hasAnalystRemark = !!item.task.analystRemark;
                                                        
                                                        const desc = String(getTaskValue(item.task, 'Description') || 'General Task').trim();
                                                        const qty = String(getTaskValue(item.task, 'Quantity') || '1').trim();
                                                        const sampleName = String(getTaskValue(item.task, 'Sample Name') || '').trim();

                                                        return (
                                                            <div key={idx} className={`p-4 rounded-[1.3rem] border-2 transition-all duration-500 flex items-center justify-between gap-4 ${isDone ? 'bg-emerald-50/40 border-emerald-100 shadow-sm' : isNotOk ? 'bg-red-50/40 border-red-100 shadow-sm' : 'bg-white dark:bg-base-900 border-base-100 dark:border-base-700 shadow-md hover:border-primary-300'}`}>
                                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                                    <button 
                                                                        onClick={() => handleNoteClick('exec', item.sourceGroup, item.index)}
                                                                        className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-lg border-2 ${hasPlannerNote ? 'bg-red-600 border-red-400 text-white luxury-red-pulse' : 'bg-base-50 dark:bg-base-950 border-base-100 dark:border-base-800 text-base-300 hover:text-base-600 hover:border-indigo-300'}`}
                                                                        title={hasPlannerNote ? "Read Mission Instruction" : "Add Mission Briefing"}
                                                                    >
                                                                        <ChatBubbleLeftEllipsisIcon className="h-5 w-5" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleRemarkClick('exec', item.sourceGroup, item.index)}
                                                                        className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all shadow-lg border-2 ${hasAnalystRemark ? 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-500/20' : 'bg-base-50 dark:bg-base-950 border-base-100 dark:border-base-800 text-base-300 hover:text-emerald-600 hover:border-emerald-300'}`}
                                                                        title="Add/Edit Shift Observations"
                                                                    >
                                                                        <ClipboardListIcon className="h-5 w-5" />
                                                                    </button>
                                                                </div>
                                                                <div className="flex-grow min-w-0 flex flex-row items-center gap-5 ml-4">
                                                                    <div className={`flex-grow font-black uppercase leading-tight line-clamp-2 ${isDone ? 'text-emerald-800 opacity-60' : isNotOk ? 'text-red-800 opacity-60' : 'text-base-950 dark:text-base-100'} text-[16px]`}>
                                                                        {desc}
                                                                    </div>
                                                                    <div className="flex flex-shrink-0 items-center gap-3">
                                                                        <div className={`px-2.5 py-1 rounded-xl text-[12px] font-black border flex-shrink-0 ${isDone ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : isNotOk ? 'bg-red-100 border-red-200 text-red-700' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>x{qty}</div>
                                                                        {sampleName && sampleName !== 'N/A' && <div className={`px-3 py-1 rounded-xl text-[12px] font-black border uppercase whitespace-normal leading-tight flex-shrink-0 ${isDone ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700/50' : isNotOk ? 'bg-red-50/50 border-red-200 text-red-700/50' : 'bg-indigo-100/30 border-indigo-100 text-indigo-950 dark:text-indigo-200'}`}>S: {sampleName}</div>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-row items-center gap-2 flex-shrink-0 ml-5">
                                                                    {!isActioned ? (
                                                                        <div className="flex gap-2">
                                                                            <button onClick={() => handleUpdateStatus(item.sourceGroup, item.index, TaskStatus.Done)} className="px-6 py-2.5 bg-emerald-600 text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[11px] hover:bg-emerald-700 hover:scale-105 transition-all active:scale-95 border-b-4 border-emerald-800">DONE</button>
                                                                            <button onClick={() => handleNotOkClick(item.sourceGroup, item.index)} className="px-6 py-2.5 bg-red-600 text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-[11px] hover:bg-red-700 hover:scale-105 transition-all active:scale-95 border-b-4 border-red-800">NOT OK</button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center gap-2">
                                                                            <button onClick={() => handleUpdateStatus(item.sourceGroup, item.index, TaskStatus.Pending)} className="px-4 py-2 bg-base-100 dark:bg-base-800 text-[10px] font-black uppercase text-base-700 dark:text-base-300 rounded-xl transition-all flex items-center gap-2.5 border-2 border-base-200 dark:border-base-700 shadow-sm hover:bg-white dark:hover:bg-base-700">
                                                                                <RefreshIcon className="h-4 w-4" /> Reset Status
                                                                            </button>
                                                                            {isNotOk && item.task.notOkReason && (
                                                                                <button 
                                                                                    onClick={() => handleViewQualityIssue(item.task.notOkReason!)}
                                                                                    className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center luxury-red-pulse shadow-lg border border-red-400"
                                                                                    title="Click to view Quality Issue Detail"
                                                                                >
                                                                                    <AlertTriangleIcon className="h-5 w-5" />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    
                                                                    <div className="flex gap-2">
                                                                        <button 
                                                                            onClick={() => handleCorrectionReturn(item.sourceGroup, item.index)} 
                                                                            className="p-2.5 bg-white dark:bg-base-800 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-100 dark:border-indigo-900/50 rounded-xl shadow-sm hover:bg-indigo-50 transition-all flex items-center justify-center shadow-indigo-100"
                                                                            title="Return from Planner"
                                                                        >
                                                                            <ArrowUturnLeftIcon className="h-5 w-5" />
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleTesterReturn(item.sourceGroup, item.index)} 
                                                                            className="p-2.5 bg-white dark:bg-base-800 text-orange-600 dark:text-orange-400 border-2 border-orange-100 dark:border-orange-900/50 rounded-xl shadow-sm hover:bg-orange-50 transition-all flex items-center justify-center shadow-orange-100"
                                                                            title="Return from Tester"
                                                                        >
                                                                            <AlertTriangleIcon className="h-5 w-5" />
                                                                        </button>
                                                                    </div>
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
