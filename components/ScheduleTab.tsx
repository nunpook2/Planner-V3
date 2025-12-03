
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Tester, AssignedTask, RawTask, CategorizedTask, AssignedPrepareTask } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { getAssignedTasks, updateAssignedTask, deleteAssignedTask, returnTaskToPool, getAssignedPrepareTasks, markItemAsPrepared, getCategorizedTasks, unassignTaskToPool } from '../services/dataService';
import { CheckCircleIcon, XCircleIcon, ArrowUturnLeftIcon, ChevronDownIcon, RefreshIcon } from './common/Icons';

declare const XLSX: any;

interface ScheduleTabProps {
    testers: Tester[];
    onTasksUpdated: () => void;
}

const ALL_COLUMNS = [
    'Request ID', 'Sample Name', 'Description', 'Variant', 'Due finish', 'Priority', 'Purpose', 'Testing Condition', 'Note to planer', 'SDIDATAID'
];

const formatDate = (dateString: string | number) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getTaskValue = (task: RawTask, header: string): string | number => {
    const lowerCaseHeader = header.toLowerCase().trim();
    const key = Object.keys(task).find(k => k.toLowerCase().trim() === lowerCaseHeader);
    return key ? task[key] : '';
};

const isValidTask = (task: RawTask): boolean => {
    if (task.ManualEntry) return true;
    const desc = String(getTaskValue(task, 'Description') || '').trim();
    const variant = String(getTaskValue(task, 'Variant') || '').trim();
    const sampleName = String(getTaskValue(task, 'Sample Name') || '').trim();
    const garbageValues = ['0', '-', 'n/a', 'nil', 'none', 'nan', 'null'];
    if (garbageValues.includes(desc.toLowerCase())) return false;
    if (!desc && !variant) return false;
    const reqId = String(getTaskValue(task, 'Request ID') || '');
    if (sampleName === reqId) return false;
    return true;
};

const ReasonPromptModal: React.FC<{
    prompt: { action: 'notOk' | 'return'; docId: string; index: number; taskName: string; } | null;
    onClose: () => void;
    onSubmit: (reason: string) => void;
}> = ({ prompt, onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    if (!prompt) return null;
    return (
        <div className="fixed inset-0 bg-base-900/40 backdrop-blur-sm flex justify-center items-center z-50 animate-fade-in">
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 animate-slide-in-up border border-base-200">
                <h3 className="text-xl font-bold">{prompt.action === 'notOk' ? 'Report Issue' : 'Return Task'}</h3>
                <p className="text-sm text-base-500">Why are you flagging <span className="font-semibold text-base-800">{prompt.taskName}</span>?</p>
                <textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full p-3 border rounded-xl bg-base-50 focus:ring-2 focus:ring-primary-500 outline-none transition-all" placeholder="Enter reason..." rows={3}/>
                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-base-500 hover:bg-base-100 font-medium">Cancel</button>
                    <button onClick={() => onSubmit(reason)} disabled={!reason.trim()} className="px-6 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow-md disabled:opacity-50 font-semibold">Submit</button>
                </div>
            </div>
        </div>
    );
};

interface TaskItemDetail { sampleName: string; status: TaskStatus | 'Returned' | 'Prepared' | 'Pending'; remark?: string; requestId: string; category?: TaskCategory; }
interface TaskGroupSummary { description: string; total: number; done: number; items: TaskItemDetail[]; }
interface SummaryPersonData { testerName: string; total: number; done: number; notOk: number; returned: number; taskGroups: TaskGroupSummary[]; }

const SummaryView: React.FC<{ data: SummaryPersonData[] }> = ({ data }) => {
    return (
        <div className="space-y-8">
            <div className="flex flex-wrap justify-center gap-6 p-4 bg-white dark:bg-base-800 rounded-full border border-base-200 shadow-sm max-w-3xl mx-auto">
                <div className="flex items-center gap-2 text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></span> Completed</div>
                <div className="flex items-center gap-2 text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-base-300 shadow-sm"></span> Pending</div>
                <div className="flex items-center gap-2 text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-200"></span> Not OK</div>
                <div className="flex items-center gap-2 text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 shadow-sm shadow-orange-200"></span> Returned</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {data.map((person) => {
                    const progressPercent = person.total > 0 ? (person.done / person.total) * 100 : 0;
                    const notOkPercent = person.total > 0 ? (person.notOk / person.total) * 100 : 0;
                    const returnedPercent = person.total > 0 ? (person.returned / person.total) * 100 : 0;
                    const initials = person.testerName.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();

                    return (
                        <div key={person.testerName} className="bg-white dark:bg-base-800 rounded-2xl border border-base-200 dark:border-base-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                            <div className="p-6 pb-4 border-b border-base-100 flex justify-between items-start bg-gradient-to-br from-white to-base-50">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-white border-2 border-base-100 shadow-sm flex items-center justify-center font-bold text-primary-600 text-lg">{initials}</div>
                                    <div><h3 className="font-bold text-lg text-base-900 leading-tight">{person.testerName}</h3><p className="text-xs font-semibold text-base-400 uppercase tracking-wide mt-1">{person.total} Tasks</p></div>
                                </div>
                                <div className="text-right"><span className="text-3xl font-black text-primary-600">{Math.round(progressPercent)}%</span></div>
                            </div>
                            <div className="h-1.5 w-full flex bg-base-100"><div style={{ width: `${progressPercent}%` }} className="h-full bg-emerald-500"></div><div style={{ width: `${notOkPercent}%` }} className="h-full bg-red-500"></div><div style={{ width: `${returnedPercent}%` }} className="h-full bg-orange-400"></div></div>
                            <div className="p-0 flex-grow overflow-y-auto custom-scrollbar max-h-[400px]">
                                {person.taskGroups.length === 0 ? <div className="p-10 text-center text-base-400 font-medium">All clear! No tasks assigned.</div> : (
                                    <div className="divide-y divide-base-100">
                                        {person.taskGroups.map((group, idx) => {
                                            const hasIssues = group.items.some(i => i.status === TaskStatus.NotOK);
                                            const hasReturns = group.items.some(i => i.status === 'Returned');
                                            const isAllDone = group.items.every(i => i.status === TaskStatus.Done || i.status === 'Prepared');
                                            let bgClass = "bg-white hover:bg-base-50";
                                            let borderClass = "";
                                            if (hasIssues) { bgClass = "bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20"; borderClass = "border-l-4 border-l-red-500"; }
                                            else if (hasReturns) { bgClass = "bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20"; borderClass = "border-l-4 border-l-orange-400"; }
                                            else if (isAllDone) { bgClass = "bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20"; borderClass = "border-l-4 border-l-emerald-500"; }

                                            return (
                                                <details key={idx} className={`group transition-colors ${bgClass} ${borderClass}`}>
                                                    <summary className="p-4 cursor-pointer list-none flex justify-between items-center gap-3">
                                                        <div className="flex-1 min-w-0"><div className={`font-semibold text-sm truncate flex items-center gap-2 ${hasIssues ? 'text-red-700' : hasReturns ? 'text-orange-700' : isAllDone ? 'text-emerald-700' : 'text-base-700'}`}><ChevronDownIcon className="h-4 w-4 text-base-400 group-open:rotate-180 transition-transform flex-shrink-0" />{group.description}</div></div>
                                                        <span className={`text-xs font-bold px-2 py-1 rounded-md ${hasIssues ? 'bg-red-100 text-red-700' : hasReturns ? 'bg-orange-100 text-orange-700' : isAllDone ? 'bg-emerald-100 text-emerald-700' : 'bg-base-100 text-base-600'}`}>{group.done}/{group.total}</span>
                                                    </summary>
                                                    <div className="px-4 pb-4 pt-1 space-y-1 pl-9">
                                                        {group.items.map((item, itemIdx) => {
                                                            let badgeStyle = "bg-base-100 text-base-500", statusText = "Pending";
                                                            if (item.status === TaskStatus.Done || item.status === 'Prepared') { badgeStyle = "bg-emerald-50 text-emerald-600 border border-emerald-100"; statusText = "OK"; }
                                                            else if (item.status === TaskStatus.NotOK) { badgeStyle = "bg-red-50 text-red-600 border border-red-100"; statusText = "Not OK"; }
                                                            else if (item.status === 'Returned') { badgeStyle = "bg-orange-50 text-orange-600 border border-orange-100"; statusText = "Return"; }
                                                            return (
                                                                <div key={itemIdx} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg hover:bg-white/50 transition-colors border border-transparent hover:border-base-200">
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0"><span className="font-medium text-xs text-base-600 truncate" title={item.sampleName}>{item.sampleName}</span>{item.category === TaskCategory.PoCat && <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-status-pocat text-white uppercase tracking-wider">PoCat</span>}</div>
                                                                    <div className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeStyle}`}>{statusText}</span>{item.remark && <span className="text-[10px] text-base-500 italic max-w-[100px] truncate" title={item.remark}>— {item.remark}</span>}</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </details>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const DetailedView: React.FC<{
    data: { testerName: string; testingTasks: AssignedTask[]; prepareTasks: AssignedPrepareTask[]; }[];
    onStatusChange: (docId: string, index: number, status: TaskStatus) => void;
    onReturn: (docId: string, index: number) => void;
    onPlannerUnassign: (docId: string, index: number) => void;
    onMarkPrepared: (prepTask: AssignedPrepareTask, itemIndex: number) => void;
    visibleColumns: Set<string>;
}> = ({ data, onStatusChange, onReturn, onPlannerUnassign, onMarkPrepared, visibleColumns }) => {
    const renderCombinedTable = (assignments: (AssignedTask | AssignedPrepareTask)[], type: 'testing' | 'prepare') => {
        const isPrep = type === 'prepare';
        const allItemsRaw = assignments.flatMap(assignment => assignment.tasks.map((task, index) => ({ task, originalIndex: index, parentDocId: assignment.id, parentAssignment: assignment, requestId: assignment.requestId })));
        
        // --- ROBUST DEDUPLICATION LOGIC ---
        const seenKeys = new Set<string>();
        const allItems = allItemsRaw.filter(item => {
            if (!isValidTask(item.task)) return false;
            const uniqueKey = item.task._id 
                ? item.task._id 
                : `${item.requestId}|${getTaskValue(item.task, 'Sample Name')}|${getTaskValue(item.task, 'Description')}|${getTaskValue(item.task, 'Variant')}`;
            if (seenKeys.has(uniqueKey)) return false;
            seenKeys.add(uniqueKey);
            return true;
        });

        if (allItems.length === 0) return null;
        const activeCols = ALL_COLUMNS.filter(col => visibleColumns.has(col));

        return (
            <div className="overflow-x-auto custom-scrollbar border border-base-200 rounded-lg">
                <table className="min-w-full text-left table-fixed">
                    <thead className="bg-base-50 sticky top-0 z-10">
                        <tr>
                            {!isPrep && <th className="p-2 font-bold uppercase tracking-wider text-xs text-base-500 w-24">Status</th>}
                            {activeCols.map(h => <th key={h} className="p-2 font-bold uppercase tracking-wider text-xs text-base-500 whitespace-nowrap">{h}</th>)}
                            <th className="p-2 font-bold uppercase tracking-wider text-xs text-base-500 text-right w-36">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-base-100">
                        {allItems.map(({ task: item, originalIndex, parentDocId, parentAssignment, requestId }, idx) => (
                            <tr key={`${parentDocId}-${originalIndex}-${idx}`} className="hover:bg-base-50 transition-colors">
                                {!isPrep && <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${item.status === TaskStatus.Done ? 'bg-emerald-100 text-emerald-700' : item.status === TaskStatus.NotOK ? 'bg-red-100 text-red-700' : 'bg-base-100 text-base-500'}`}>{item.status || 'Pending'}</span></td>}
                                {activeCols.map(col => (
                                    <td key={col} className="p-2 text-sm text-base-700 truncate" title={String(getTaskValue(item, col) || '')}>
                                        {col === 'Request ID' ? <div className="flex items-center gap-1"><span className="font-medium">{requestId.replace('RS1-', '')}</span>{parentAssignment.category === TaskCategory.PoCat && <span className="px-1 py-px rounded text-[9px] font-bold bg-status-pocat text-white uppercase tracking-wider">PoCat</span>}</div> : col === 'Due finish' ? formatDate(getTaskValue(item, col)) : getTaskValue(item, col)}
                                    </td>
                                ))}
                                <td className="p-2 text-right whitespace-nowrap">
                                    {isPrep ? (item.preparationStatus === 'Prepared' ? <span className="flex items-center justify-end gap-1 text-emerald-600 font-bold text-xs"><CheckCircleIcon className="h-4 w-4"/> Ready</span> : <button onClick={() => onMarkPrepared(parentAssignment as AssignedPrepareTask, originalIndex)} className="px-2 py-1 text-xs font-bold text-white bg-emerald-500 rounded hover:bg-emerald-600 shadow-sm transition-all">Mark Ready</button>) : (
                                        <div className="flex gap-1 justify-end">
                                            <button onClick={() => onStatusChange(parentDocId, originalIndex, TaskStatus.Done)} className="text-base-300 hover:text-emerald-500 hover:bg-emerald-50 p-1.5 rounded transition-all" title="Mark Done"><CheckCircleIcon className="h-5 w-5"/></button>
                                            <button onClick={() => onStatusChange(parentDocId, originalIndex, TaskStatus.NotOK)} className="text-base-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-all" title="Mark Not OK"><XCircleIcon className="h-5 w-5"/></button>
                                            <button onClick={() => onReturn(parentDocId, originalIndex)} className="text-base-300 hover:text-orange-500 hover:bg-orange-50 p-1.5 rounded transition-all" title="Return Task (With Reason)"><ArrowUturnLeftIcon className="h-5 w-5"/></button>
                                            <button onClick={() => onPlannerUnassign(parentDocId, originalIndex)} className="text-base-300 hover:text-blue-500 hover:bg-blue-50 p-1.5 rounded transition-all" title="Re-plan (Unassign without reason)"><RefreshIcon className="h-5 w-5"/></button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-8">
            {data.map(({ testerName, testingTasks, prepareTasks }) => (
                <details key={testerName} className="bg-white rounded-2xl shadow-sm border border-base-200 overflow-hidden" open>
                    <summary className="p-4 cursor-pointer list-none flex justify-between items-center bg-base-50 hover:bg-base-100 transition-colors">
                        <div className="flex items-center gap-4"><div className="bg-white border border-base-200 p-2 rounded-full text-primary-600 shadow-sm"><ChevronDownIcon className="h-5 w-5 group-open:rotate-180 transition-transform"/></div><h3 className="font-bold text-lg text-base-800">{testerName}</h3></div>
                    </summary>
                    <div className="p-4 border-t border-base-200 space-y-6">
                        {prepareTasks.length > 0 && <div><h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2 bg-amber-50 inline-block px-2 py-0.5 rounded-md border border-amber-100">Preparation Queue</h4>{renderCombinedTable(prepareTasks, 'prepare')}</div>}
                        {testingTasks.length > 0 && <div><h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2 bg-indigo-50 inline-block px-2 py-0.5 rounded-md border border-indigo-100">Testing Queue</h4>{renderCombinedTable(testingTasks, 'testing')}</div>}
                    </div>
                </details>
            ))}
        </div>
    );
};

const ScheduleTab: React.FC<ScheduleTabProps> = ({ testers, onTasksUpdated }) => {
    const [assignedTestingTasks, setAssignedTestingTasks] = useState<AssignedTask[]>([]);
    const [assignedPrepareTasks, setAssignedPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [returnedTasksPool, setReturnedTasksPool] = useState<CategorizedTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
    const [filters, setFilters] = useState({ startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], testerId: 'all', shift: 'all' });
    const [reasonPrompt, setReasonPrompt] = useState<{ action: 'notOk' | 'return'; docId: string; index: number; taskName: string; } | null>(null);
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(['Request ID', 'Sample Name', 'Description', 'Variant']));
    const [isColSelectorOpen, setIsColSelectorOpen] = useState(false);
    const colSelectorRef = useRef<HTMLDivElement>(null);

    useEffect(() => { const h = (e:MouseEvent) => { if(colSelectorRef.current && !colSelectorRef.current.contains(e.target as Node)) setIsColSelectorOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
    const fetchTasks = async () => { setIsLoading(true); setError(null); try { const [t, p, c] = await Promise.all([getAssignedTasks(), getAssignedPrepareTasks(), getCategorizedTasks()]); setAssignedTestingTasks(t); setAssignedPrepareTasks(p); setReturnedTasksPool(c); } catch (e) { setError("Failed to load"); } finally { setIsLoading(false); }};
    useEffect(() => { fetchTasks(); }, []);

    const { filteredTestingTasks, filteredPrepareTasks, filteredReturnedTasks } = useMemo(() => {
        const startDate = new Date(filters.startDate); const endDate = new Date(filters.endDate); endDate.setHours(23, 59, 59, 999);
        const filterTask = (task: any) => { const d = new Date(task.assignedDate); return d >= startDate && d <= endDate && (filters.testerId === 'all' || (task.testerId || task.assistantId) === filters.testerId) && (filters.shift === 'all' || task.shift === filters.shift); };
        
        const returned = returnedTasksPool.filter(task => { 
            if (!task.isReturnedPool && !task.tasks.some(t => t.isReturned)) return false; 
            const d = task.createdAt ? new Date(task.createdAt) : new Date(); 
            if (d < startDate || d > endDate) return false; 
            const r = task.returnedBy || task.tasks.find(t => t.returnedBy)?.returnedBy; 
            if (!r) return false; 
            if (filters.testerId !== 'all' && testers.find(t => t.id === filters.testerId)?.name !== r) return false; 
            // FIXED: Filter returned tasks by shift
            if (filters.shift !== 'all' && task.shift && task.shift !== filters.shift) return false;
            return true; 
        });

        return { filteredTestingTasks: assignedTestingTasks.filter(filterTask), filteredPrepareTasks: assignedPrepareTasks.filter(filterTask), filteredReturnedTasks: returned };
    }, [assignedTestingTasks, assignedPrepareTasks, returnedTasksPool, filters, testers]);

    const summaryData = useMemo(() => {
        const summaryMap = new Map<string, SummaryPersonData>();
        const getPersonSummary = (name: string): SummaryPersonData => { if (!summaryMap.has(name)) summaryMap.set(name, { testerName: name, total: 0, done: 0, notOk: 0, returned: 0, taskGroups: [] }); return summaryMap.get(name)!; };
        const addItemToSummary = (person: SummaryPersonData, desc: string, sampleName: string, status: any, remark?: string, requestId: string = '', category?: TaskCategory) => { person.total++; if (status === TaskStatus.Done || status === 'Prepared') person.done++; if (status === TaskStatus.NotOK) person.notOk++; if (status === 'Returned') person.returned++; let group = person.taskGroups.find(g => g.description === desc); if (!group) { group = { description: desc, total: 0, done: 0, items: [] }; person.taskGroups.push(group); } group.total++; if (status === TaskStatus.Done || status === 'Prepared') group.done++; group.items.push({ sampleName, status, remark, requestId, category }); };
        
        // --- STRICT DEDUPLICATION LOGIC ---
        const seenTestingKeys = new Set<string>();
        const seenPrepareKeys = new Set<string>();

        filteredTestingTasks.forEach(task => task.testerName && task.tasks.forEach(item => {
            if (!isValidTask(item)) return;
            const uniqueKey = item._id ? item._id : `${task.requestId}|${getTaskValue(item, 'Sample Name')}|${getTaskValue(item.task, 'Description')}|${getTaskValue(item.task, 'Variant')}`;
            if (seenTestingKeys.has(uniqueKey)) return; 
            seenTestingKeys.add(uniqueKey);
            addItemToSummary(getPersonSummary(task.testerName), (getTaskValue(item, 'Description') || getTaskValue(item, 'Sample Name') || 'N/A').toString(), (getTaskValue(item, 'Sample Name') || '').toString(), item.status || TaskStatus.Pending, item.notOkReason || undefined, task.requestId, task.category);
        }));

        filteredReturnedTasks.forEach(task => { const r = task.returnedBy || task.tasks.find(t => t.returnedBy)?.returnedBy; if (r) task.tasks.forEach(item => isValidTask(item) && addItemToSummary(getPersonSummary(r), (getTaskValue(item, 'Description') || getTaskValue(item, 'Sample Name') || 'N/A').toString(), (getTaskValue(item, 'Sample Name') || '').toString(), 'Returned', task.returnReason || item.returnReason || 'Returned', task.id, task.category)); });
        
        filteredPrepareTasks.forEach(task => task.assistantName && task.tasks.forEach(item => {
            if (!isValidTask(item)) return;
            const uniqueKey = item._id ? item._id : `${task.requestId}|${getTaskValue(item, 'Sample Name')}|${getTaskValue(item.task, 'Description')}`;
            if (seenPrepareKeys.has(uniqueKey)) return; 
            seenPrepareKeys.add(uniqueKey);
            addItemToSummary(getPersonSummary(task.assistantName), `[Prep] ${getTaskValue(item, 'Description') || getTaskValue(item, 'Sample Name')}`, (getTaskValue(item, 'Sample Name') || '').toString(), item.preparationStatus === 'Prepared' ? 'Prepared' : 'Pending', undefined, task.requestId, task.category);
        }));
        
        return Array.from(summaryMap.values()).sort((a, b) => a.testerName.localeCompare(b.testerName));
    }, [filteredTestingTasks, filteredPrepareTasks, filteredReturnedTasks]);

    const detailedData = useMemo(() => {
        const personMap = new Map<string, any>();
        const getEntry = (name: string) => { if (!personMap.has(name)) personMap.set(name, { testerName: name, testingTasks: [], prepareTasks: [] }); return personMap.get(name); };
        filteredTestingTasks.forEach(t => t.testerName && getEntry(t.testerName).testingTasks.push(t));
        filteredPrepareTasks.forEach(t => t.assistantName && getEntry(t.assistantName).prepareTasks.push(t));
        return Array.from(personMap.values()).sort((a: any, b: any) => a.testerName.localeCompare(b.testerName));
    }, [filteredTestingTasks, filteredPrepareTasks]);

    const handleStatusChange = (docId: string, index: number, status: TaskStatus) => { const task = assignedTestingTasks.find(t => t.id === docId)?.tasks[index]; if (!task) return; if (status === TaskStatus.NotOK) setReasonPrompt({ action: 'notOk', docId, index, taskName: (getTaskValue(task, 'Sample Name') || '') as string }); else { const original = assignedTestingTasks.find(t => t.id === docId); if (original) { const up = [...original.tasks]; up[index] = { ...up[index], status, notOkReason: null }; updateAssignedTask(docId, { tasks: up }).then(fetchTasks); } } };
    const handleReturnTask = (docId: string, index: number) => { const task = assignedTestingTasks.find(t => t.id === docId)?.tasks[index]; if (task) setReasonPrompt({ action: 'return', docId, index, taskName: (getTaskValue(task, 'Sample Name') || '') as string }); };
    
    // Planner Unassign: Returns task to pool WITHOUT marking it as "Returned" (No reason required)
    const handlePlannerUnassign = async (docId: string, index: number) => {
        const original = assignedTestingTasks.find(t => t.id === docId);
        if (!original) return;
        const item = original.tasks[index];
        if (!item) return;

        try {
            // Clean unassign: Add to categorizedTasks without 'isReturned' flags
            const payload: CategorizedTask = { 
                id: original.requestId, 
                tasks: [item], 
                category: original.category,
                // Do NOT set isReturnedPool or returnReason here
            };
            await unassignTaskToPool(payload);

            const rem = original.tasks.filter((_, i) => i !== index);
            if (rem.length === 0) await deleteAssignedTask(docId);
            else await updateAssignedTask(docId, { tasks: rem });
            
            onTasksUpdated();
            await fetchTasks();
        } catch (e) {
            console.error(e);
            alert("Failed to unassign task");
        }
    };

    const handleReasonSubmit = async (reason: string) => { 
        if (!reasonPrompt) return; 
        const { action, docId, index } = reasonPrompt; 
        const original = assignedTestingTasks.find(t => t.id === docId); 
        if (!original) return; 
        setReasonPrompt(null); 
        try { 
            if (action === 'notOk') { 
                const up = [...original.tasks]; 
                up[index] = { ...up[index], status: TaskStatus.NotOK, notOkReason: reason }; 
                await updateAssignedTask(docId, { tasks: up }); 
            } else { 
                const item = original.tasks[index]; 
                const ret = { ...item, status: TaskStatus.Pending, notOkReason: null, isReturned: true, returnReason: reason, returnedBy: original.testerName || 'Unknown' }; 
                
                // FIXED: Pass original assignment shift to the returned task payload
                const pay: CategorizedTask = { 
                    id: original.requestId, 
                    tasks: [ret], 
                    category: original.category, 
                    returnReason: reason, 
                    returnedBy: original.testerName || 'Unknown', 
                    isReturnedPool: true,
                    shift: original.shift 
                }; 
                await returnTaskToPool(pay); 
                
                const rem = original.tasks.filter((_, i) => i !== index); 
                if (rem.length === 0) await deleteAssignedTask(docId); 
                else await updateAssignedTask(docId, { tasks: rem }); 
                onTasksUpdated(); 
            } 
        } catch (e) { 
            console.error(e); 
        } finally { 
            await fetchTasks(); 
        } 
    };
    
    const handleMarkItemAsPrepared = async (prepTask: AssignedPrepareTask, itemIndex: number) => { await markItemAsPrepared(prepTask, itemIndex); await fetchTasks(); onTasksUpdated(); };
    
    const exportToExcel = () => {
        try {
            const flattenedData: any[] = [];
            detailedData.forEach(person => {
                person.testingTasks.forEach((assignment: AssignedTask) => {
                    assignment.tasks.forEach((task, idx) => {
                        if (!isValidTask(task)) return;
                        flattenedData.push({
                            'Type': 'Testing', 'Assigned To': person.testerName, 'Request ID': assignment.requestId.replace('RS1-', ''), 'Sample Name': getTaskValue(task, 'Sample Name'), 'Description': getTaskValue(task, 'Description'), 'Variant': getTaskValue(task, 'Variant'), 'Status': task.status || 'Pending', 'Due Date': formatDate(getTaskValue(task, 'Due finish')), 'Priority': getTaskValue(task, 'Priority'), 'PoCat': assignment.category === TaskCategory.PoCat ? 'Yes' : 'No'
                        });
                    });
                });
                person.prepareTasks.forEach((assignment: AssignedPrepareTask) => {
                    assignment.tasks.forEach((task, idx) => {
                        if (!isValidTask(task)) return;
                        flattenedData.push({
                            'Type': 'Preparation', 'Assigned To': person.testerName, 'Request ID': assignment.requestId.replace('RS1-', ''), 'Sample Name': getTaskValue(task, 'Sample Name'), 'Description': getTaskValue(task, 'Description'), 'Variant': getTaskValue(task, 'Variant'), 'Status': task.preparationStatus || 'Awaiting', 'Due Date': formatDate(getTaskValue(task, 'Due finish')), 'Priority': getTaskValue(task, 'Priority'), 'PoCat': assignment.category === TaskCategory.PoCat ? 'Yes' : 'No'
                        });
                    });
                });
            });
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(flattenedData);
            XLSX.utils.book_append_sheet(wb, ws, "Schedule Export");
            XLSX.writeFile(wb, `Schedule_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (e) { console.error("Export failed", e); alert("Failed to export data. Please try again."); }
    };

    const toggleColumn = (col: string) => setVisibleColumns(p => { const n = new Set(p); n.has(col) ? n.delete(col) : n.add(col); return n; });

    return (
        <div className="flex flex-col h-[calc(100vh-170px)] animate-slide-in-up">
            <ReasonPromptModal prompt={reasonPrompt} onClose={() => setReasonPrompt(null)} onSubmit={handleReasonSubmit} />
            <div className="flex-shrink-0 mb-6 space-y-4">
                <div className="flex justify-between items-center"><div><h2 className="text-2xl font-bold text-base-900">Track Schedule</h2><p className="text-sm text-base-500">Monitor progress</p></div><div className="flex p-1 bg-base-100 rounded-xl border border-base-200"><button onClick={() => setViewMode('summary')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${viewMode === 'summary' ? 'bg-white shadow-sm text-primary-600' : 'text-base-500 hover:text-base-800'}`}>Summary</button><button onClick={() => setViewMode('detailed')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${viewMode === 'detailed' ? 'bg-white shadow-sm text-primary-600' : 'text-base-500 hover:text-base-800'}`}>Detailed</button></div></div>
                <div className="p-5 bg-white rounded-2xl border border-base-200 shadow-sm grid grid-cols-1 lg:grid-cols-5 gap-4 items-end">
                     <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div><label className="text-xs font-bold text-base-400 uppercase">Start Date</label><input type="date" value={filters.startDate} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} className="w-full mt-1 p-2 rounded-xl bg-base-50 border-transparent focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all text-sm"/></div>
                        <div><label className="text-xs font-bold text-base-400 uppercase">End Date</label><input type="date" value={filters.endDate} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} className="w-full mt-1 p-2 rounded-xl bg-base-50 border-transparent focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all text-sm"/></div>
                        <div><label className="text-xs font-bold text-base-400 uppercase">Personnel</label><select value={filters.testerId} onChange={e => setFilters(f => ({ ...f, testerId: e.target.value }))} className="w-full mt-1 p-2 rounded-xl bg-base-50 border-transparent focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all text-sm"><option value="all">All Personnel</option>{testers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                        <div><label className="text-xs font-bold text-base-400 uppercase">Shift</label><select value={filters.shift} onChange={e => setFilters(f => ({ ...f, shift: e.target.value }))} className="w-full mt-1 p-2 rounded-xl bg-base-50 border-transparent focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all text-sm"><option value="all">All Shifts</option><option value="day">Day</option><option value="night">Night</option></select></div>
                     </div>
                     <div className="relative" ref={colSelectorRef}><button onClick={() => setIsColSelectorOpen(!isColSelectorOpen)} className="w-full h-[42px] bg-base-100 hover:bg-base-200 text-base-700 font-bold rounded-xl border border-base-200 transition-colors flex items-center justify-between px-4 text-sm"><span>Columns ({visibleColumns.size})</span><ChevronDownIcon className="h-4 w-4"/></button>{isColSelectorOpen && (<div className="absolute bottom-full left-0 w-56 mb-2 bg-white rounded-xl shadow-xl border border-base-200 z-50 p-2 overflow-hidden animate-fade-in"><div className="text-xs font-bold text-base-400 uppercase px-2 py-1 mb-1">Visible Columns</div>{ALL_COLUMNS.map(col => (<label key={col} className="flex items-center gap-2 p-2 hover:bg-base-50 rounded-lg cursor-pointer transition-colors"><input type="checkbox" checked={visibleColumns.has(col)} onChange={() => toggleColumn(col)} className="rounded text-primary-600 focus:ring-primary-500"/><span className="text-sm text-base-700">{col}</span></label>))}</div>)}</div>
                </div>
                <div className="flex justify-end">
                     <button onClick={exportToExcel} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-transform active:scale-95 flex items-center gap-2"><span>Export Excel</span></button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                 {isLoading ? <div className="p-12 text-center text-base-400 font-medium">Loading schedule...</div> : detailedData.length > 0 || summaryData.length > 0 ? (viewMode === 'summary' ? <SummaryView data={summaryData} /> : <DetailedView data={detailedData} onStatusChange={handleStatusChange} onReturn={handleReturnTask} onPlannerUnassign={handlePlannerUnassign} onMarkPrepared={handleMarkItemAsPrepared} visibleColumns={visibleColumns} />) : <div className="p-12 text-center text-base-400 font-medium">No schedule data found for today.</div>}
            </div>
        </div>
    );
};

export default ScheduleTab;
