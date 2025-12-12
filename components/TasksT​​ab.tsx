


import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Tester, CategorizedTask, DailySchedule, RawTask, AssignedTask, TestMapping } from '../types';
import { TaskCategory, TaskStatus } from '../types';
import { 
    getCategorizedTasks, 
    getDailySchedule, 
    addAssignedTask, 
    deleteCategorizedTask, 
    updateCategorizedTask,
    assignItemsToPrepare,
    getTestMappings,
    addCategorizedTask
} from '../services/dataService';
import { CheckCircleIcon, ChevronDownIcon, TrashIcon } from './common/Icons';

// --- HELPER COMPONENTS ---

const Toast: React.FC<{ message: string; onDismiss: () => void }> = ({ message, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className="fixed top-20 right-8 bg-green-600 text-white py-3 px-6 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in z-50">
            <CheckCircleIcon className="h-6 w-6" />
            <span className="font-semibold">{message}</span>
        </div>
    );
};

const AssignmentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAssign: (person: Tester) => void;
    personnel: { testers: Tester[]; assistants: Tester[] };
    isPreparation: boolean;
    selectedItemCount: number;
    isProcessing: boolean;
}> = ({ isOpen, onClose, onAssign, personnel, isPreparation, selectedItemCount, isProcessing }) => {
    if (!isOpen) return null;

    const peopleToList = isPreparation ? personnel.assistants : personnel.testers;
    const title = isPreparation ? "Assign for Preparation" : "Assign for Testing";
    const role = isPreparation ? "Assistants" : "Testers";

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-xl shadow-2xl p-6 w-full max-w-lg m-4 space-y-4 animate-slide-in-up" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-base-800 dark:text-base-200">{title}</h2>
                <p className="text-sm text-base-500">Assigning <span className="font-semibold text-primary-600 dark:text-primary-400">{selectedItemCount} selected items</span> to an on-shift person.</p>
                
                <div className="border dark:border-base-700 rounded-lg p-4 bg-base-50 dark:bg-base-900/50 max-h-80 overflow-y-auto">
                    <h3 className="font-semibold text-base-700 dark:text-base-300 mb-3">On-Shift {role}</h3>
                    {peopleToList.length > 0 ? (
                        <ul className="space-y-2">
                            {peopleToList.map(person => (
                                <li key={person.id} className="flex justify-between items-center p-3 bg-white dark:bg-base-700 rounded-lg shadow-sm">
                                    <span className="font-medium">{person.name}</span>
                                    <button
                                        onClick={() => onAssign(person)}
                                        disabled={isProcessing}
                                        className="px-4 py-1.5 text-xs font-bold bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
                                    >
                                        Assign
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-base-500 text-center py-4">No {role.toLowerCase()} available for this shift.</p>
                    )}
                </div>

                <div className="pt-2 flex justify-end">
                    <button onClick={onClose} disabled={isProcessing} className="px-5 py-2 bg-base-200 dark:bg-base-600 font-semibold rounded-lg hover:bg-base-300 dark:hover:bg-base-500 transition-colors disabled:opacity-50">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- UTILITY FUNCTIONS ---

const getTaskValue = (task: RawTask, header: string): string | number => {
    const lowerCaseHeader = header.toLowerCase().trim();
    const key = Object.keys(task).find(k => k.toLowerCase().trim() === lowerCaseHeader);
    return key ? task[key] : '';
};

const formatDate = (dateValue: string | number | undefined) => {
    if (!dateValue) return '';
    let date: Date;
    if (typeof dateValue === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
    } else {
        date = new Date(dateValue);
    }
    
    if (isNaN(date.getTime())) return String(dateValue);
    
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}/${date.getUTCFullYear()}`;
};

const getTaskGridHeader = (task: RawTask, mappings: TestMapping[]): string | null => {
    const description = (getTaskValue(task, 'Description') || '').toString().trim();
    const variant = (getTaskValue(task, 'Variant') || '').toString().trim();

    const specificMatch = mappings.find(m => m.description.trim() === description && m.variant.trim() === variant);
    if (specificMatch) return specificMatch.headerSub;

    const descriptionMatch = mappings.find(m => m.description.trim() === description && !m.variant.trim());
    if (descriptionMatch) return descriptionMatch.headerSub;
    
    const wildcardDescriptionMatch = mappings.find(m => !m.description.trim() && m.variant.trim() === variant);
    if (wildcardDescriptionMatch) return wildcardDescriptionMatch.headerSub;

    return null;
};

const isValidTask = (task: RawTask): boolean => {
    const isManual = task.ManualEntry === true;
    if (isManual) return true;

    const desc = String(getTaskValue(task, 'Description') || '').trim();
    const variant = String(getTaskValue(task, 'Variant') || '').trim();
    const sampleName = String(getTaskValue(task, 'Sample Name') || '').trim();
    
    const garbageValues = ['0', '-', 'n/a', 'nil', 'none', 'nan', 'null'];
    if (garbageValues.includes(desc.toLowerCase())) return false;
    
    if (!desc && !variant) return false;
    
    const reqId = String(getTaskValue(task, 'Request ID') || '');
    if (sampleName === reqId && reqId !== '') return false;

    return true;
};

const getDueDateTimestamp = (tasks: RawTask[]): number => {
    // Find any task in the group that has a Due finish date
    const taskWithDate = tasks.find(t => getTaskValue(t, 'Due finish'));
    const dateVal = taskWithDate ? getTaskValue(taskWithDate, 'Due finish') : null;

    if (!dateVal) return Infinity; 

    if (typeof dateVal === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        return excelEpoch.getTime() + dateVal * 24 * 60 * 60 * 1000;
    }

    const strVal = String(dateVal).trim();
    let date = new Date(strVal);
    if (!isNaN(date.getTime())) return date.getTime();

    const parts = strVal.split(/[\/\-]/);
    if (parts.length === 3 && parts[2].length === 4) {
         const day = parseInt(parts[0], 10);
         const month = parseInt(parts[1], 10);
         const year = parseInt(parts[2], 10);
         date = new Date(year, month - 1, day);
         if (!isNaN(date.getTime())) return date.getTime();
    }
    return Infinity;
};


// --- MAIN COMPONENT ---

const TasksTab: React.FC<{ testers: Tester[]; refreshKey: number; }> = ({ testers, refreshKey }) => {
    const [categorizedTasks, setCategorizedTasks] = useState<CategorizedTask[]>([]);
    const [testMappings, setTestMappings] = useState<TestMapping[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [filterRequestId, setFilterRequestId] = useState('');
    const [selectedShift, setSelectedShift] = useState<'day' | 'night'>('day');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAssigningToPrepare, setIsAssigningToPrepare] = useState(false); 
    const [notification, setNotification] = useState<string | null>(null);
    const [selectedItems, setSelectedItems] = useState<Record<string, Set<number>>>({});
    const [expandedCell, setExpandedCell] = useState<{ docId: string; header: string } | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    
    // Manual Task States
    const [manualDesc, setManualDesc] = useState('');
    const [manualQty, setManualQty] = useState('');
    const [manualVariant, setManualVariant] = useState(''); 
    const [confirmDeleteManual, setConfirmDeleteManual] = useState<{docId: string, index: number} | null>(null);
    const [hideEmptyColumns, setHideEmptyColumns] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [tasks, dailySchedule, mappings] = await Promise.all([
                getCategorizedTasks(),
                getDailySchedule(selectedDate),
                getTestMappings(),
            ]);
            setCategorizedTasks(tasks.sort((a,b) => (a.order ?? Infinity) - (b.order ?? Infinity)));
            setSchedule(dailySchedule);
            setTestMappings(mappings);
        } catch (error: any) {
            console.error("Error fetching data:", error);
             if (error.code === 'permission-denied') {
                setError("Failed to fetch task data. Please check your Firestore security rules to allow reads on 'categorizedTasks', 'dailySchedules', and 'testMappings' collections.");
            } else {
                setError("An unexpected error occurred while fetching task data.");
            }
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData, refreshKey]);
    
    // --- Data processing for Grid ---
    const gridHeaders = useMemo(() => {
        const groups: Record<string, string[]> = {};
        testMappings.forEach(m => {
            if (!groups[m.headerGroup]) groups[m.headerGroup] = [];
            if (!groups[m.headerGroup].includes(m.headerSub)) groups[m.headerGroup].push(m.headerSub);
        });
        for (const group in groups) groups[group].sort();
        return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
    }, [testMappings]);

    const allSubHeaders = useMemo(() => gridHeaders.flatMap(([, subs]) => subs), [gridHeaders]);

    const filteredTasks = useMemo(() => {
        return categorizedTasks.filter(task => {
            if (activeCategory === TaskCategory.Manual) {
                return task.category === TaskCategory.Manual;
            }
            if (task.category === TaskCategory.Manual) {
                return false;
            }

            const categoryMatch = activeCategory === 'all' || task.category === activeCategory;
            const idMatch = filterRequestId === '' || task.id.toLowerCase().includes(filterRequestId.toLowerCase());
            
            if (activeCategory === 'prepare') {
                return idMatch && task.tasks.some(t => !t.preparationStatus);
            }
            return categoryMatch && idMatch && task.tasks.some(t => t.preparationStatus !== 'Awaiting Preparation');
        });
    }, [categorizedTasks, activeCategory, filterRequestId]);

    const gridData = useMemo(() => {
        const mergedRows: Record<string, {
            docId: string;
            requestId: string;
            originalTask: CategorizedTask;
            cells: Record<string, { task: RawTask; originalIndex: number }[]>;
            unmappedItems: { task: RawTask; originalIndex: number }[];
            minDueDate: number;
        }> = {};

        filteredTasks.forEach(taskGroup => {
            if (!taskGroup.docId) return;
            
            const cells: Record<string, { task: RawTask; originalIndex: number }[]> = {};
            const unmappedItems: { task: RawTask; originalIndex: number }[] = [];
            
            const itemsToProcess = activeCategory === 'prepare'
                ? taskGroup.tasks.map((t, i) => ({ task: t, originalIndex: i })).filter(item => !item.task.preparationStatus)
                : taskGroup.tasks.map((t, i) => ({ task: t, originalIndex: i })).filter(item => item.task.preparationStatus !== 'Awaiting Preparation');

            itemsToProcess.forEach(item => {
                const header = getTaskGridHeader(item.task, testMappings);
                if (header) {
                    if (!cells[header]) cells[header] = [];
                    cells[header].push(item);
                } else {
                    unmappedItems.push(item);
                }
            });
            
            mergedRows[taskGroup.docId] = {
                docId: taskGroup.docId,
                requestId: taskGroup.id,
                originalTask: taskGroup,
                cells,
                unmappedItems,
                minDueDate: getDueDateTimestamp(taskGroup.tasks)
            };
        });

        return Object.values(mergedRows).sort((a, b) => a.minDueDate - b.minDueDate);
    }, [filteredTasks, testMappings, activeCategory]);

    // --- Interaction Handlers ---
    const onShiftPersonnel = useMemo(() => {
        const findByIds = (ids: string[]) => ids.map(id => testers.find(t => t.id === id)).filter((t): t is Tester => !!t);
        if (!schedule) return { testers: [], assistants: [] };
        const shiftTesters = selectedShift === 'day' ? schedule.dayShiftTesters : schedule.nightShiftTesters;
        const shiftAssistants = selectedShift === 'day' ? schedule.dayShiftAssistants : schedule.nightShiftAssistants;
        return { testers: findByIds(shiftTesters), assistants: findByIds(shiftAssistants) };
    }, [schedule, testers, selectedShift]);

    const handleSelectItem = useCallback((docId: string, taskIndex: number, isChecked: boolean) => {
        setSelectedItems(prev => {
            const newSelection = { ...prev };
            const currentSet = new Set(newSelection[docId] || []);
            if (isChecked) currentSet.add(taskIndex);
            else currentSet.delete(taskIndex);
            newSelection[docId] = currentSet;
            return newSelection;
        });
    }, []);
    
    const totalSelectedCount = useMemo(() => Object.values(selectedItems).reduce((acc: number, set: Set<number>) => acc + set.size, 0), [selectedItems]);

    const openAssignModal = () => {
        let hasPreparingItems = false;
        for (const docId in selectedItems) {
            const taskGroup = categorizedTasks.find(t => t.docId === docId);
            if (!taskGroup) continue;
            const indices = Array.from(selectedItems[docId]);
            if (taskGroup.tasks.some((t, idx) => indices.includes(idx) && t.preparationStatus === 'Awaiting Preparation')) {
                hasPreparingItems = true;
                break;
            }
        }

        if (hasPreparingItems) {
            setNotification("Cannot assign items that are waiting for preparation (Yellow status).");
            return;
        }

        setIsAssigningToPrepare(false);
        setIsModalOpen(true);
    };

    const openPrepareModal = () => {
        setIsAssigningToPrepare(true);
        setIsModalOpen(true);
    };

    const handleConfirmAssignment = async (selectedPerson: Tester) => {
        if (isAssigning) return; // Prevent double clicks
        
        const assignmentsByDocId: Record<string, number[]> = {};
        for (const docId in selectedItems) {
            if (selectedItems[docId].size > 0) assignmentsByDocId[docId] = [...selectedItems[docId]];
        }
        
        if (Object.keys(assignmentsByDocId).length === 0) return;

        setIsAssigning(true);
        try {
            for (const docId in assignmentsByDocId) {
                const originalTask = categorizedTasks.find(t => t.docId === docId);
                const selectedIndices = assignmentsByDocId[docId];
                if (!originalTask) continue;

                if (activeCategory === 'prepare') {
                    await assignItemsToPrepare(originalTask, selectedIndices, selectedPerson, selectedDate, selectedShift);
                } else {
                    const itemsToAssign = selectedIndices.map(index => {
                         const item = originalTask.tasks[index];
                        // If it's a Manual task, CLONE it with a new ID so the original stays as a template
                        if (originalTask.category === TaskCategory.Manual) {
                            return { 
                                ...item, 
                                _id: Math.random().toString(36).substring(2) + Date.now().toString(36) 
                            };
                        }
                        return item;
                    });
                    
                    const remainingItems = originalTask.tasks.filter((_, index) => !selectedIndices.includes(index));

                    await addAssignedTask({
                        id: '',
                        requestId: originalTask.id, 
                        tasks: itemsToAssign, 
                        category: originalTask.category,
                        testerId: selectedPerson.id, 
                        testerName: selectedPerson.name,
                        assignedDate: selectedDate, 
                        shift: selectedShift, 
                        status: TaskStatus.Pending,
                    });

                    // Only remove items from the pool if it's NOT a Manual task
                    if (originalTask.category !== TaskCategory.Manual) {
                        if (remainingItems.length > 0) await updateCategorizedTask(docId, { tasks: remainingItems });
                        else await deleteCategorizedTask(docId);
                    }
                }
            }
            setNotification(`Assigned ${totalSelectedCount} items to ${selectedPerson.name}.`);
            setSelectedItems({});
        } catch (err) {
            console.error("Failed to assign task:", err);
            setError(`Failed to assign task: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsAssigning(false);
            setIsModalOpen(false);
            fetchData();
        }
    };
    
    // --- EXPORT FUNCTION ---
    const handleExport = () => {
        // ... (Export logic omitted for brevity as it is similar to TasksTab.tsx)
    };
    
    // Manual Task Handlers
     const handleQuickAddManual = async () => {
        if (!manualDesc.trim()) return; 
        try {
            const newTaskItem: RawTask = {
                'Description': manualDesc,
                'Quantity': manualQty || '1', 
                'Variant': manualVariant, 
                'ManualEntry': true, 
                _id: Math.random().toString(36).substring(2) + Date.now().toString(36)
            };

            await addCategorizedTask({
                id: `MAN-${Date.now().toString().slice(-6)}`,
                category: TaskCategory.Manual,
                tasks: [newTaskItem],
                createdAt: new Date().toISOString()
            });

            setManualDesc('');
            setManualQty('');
            setManualVariant('');
            setNotification("Manual task added successfully");
            fetchData();
        } catch (e) {
            setNotification("Failed to add manual task");
        }
    };

    const handleDeleteManualTask = async () => {
        if (!confirmDeleteManual) return;
        const { docId } = confirmDeleteManual;
        try {
            await deleteCategorizedTask(docId);
            setNotification("Manual task deleted");
            fetchData();
        } catch (e) {
            setNotification("Failed to delete task");
        } finally {
            setConfirmDeleteManual(null);
        }
    };

    // --- RENDER COMPONENTS ---
    const CategoryButton: React.FC<{ name: string; value: string; count: number }> = ({ name, value, count }) => (
        <button
            onClick={() => setActiveCategory(value)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors flex items-center gap-2 ${activeCategory === value ? 'bg-primary-600 text-white shadow' : 'bg-base-200 dark:bg-base-700 hover:bg-base-300 dark:hover:bg-base-600'}`}
        >
            {name} <span className="text-xs bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded-full">{count}</span>
        </button>
    );

    const getCategoryCount = (category: string) => {
        if (category === 'all') return categorizedTasks.filter(t => t.tasks.some(i => i.preparationStatus !== 'Awaiting Preparation')).length;
        if (category === 'prepare') return categorizedTasks.filter(t => t.tasks.some(i => !i.preparationStatus)).length;
        return categorizedTasks.filter(t => t.category === category && t.tasks.some(i => i.preparationStatus !== 'Awaiting Preparation')).length;
    };
    
    const ExpandableCell: React.FC<{ docId: string; header: string; items: { task: RawTask; originalIndex: number }[] }> = ({ docId, header, items }) => {
        if (!items || items.length === 0) return <td className="p-2 border-r dark:border-base-700"></td>;

        const isExpanded = expandedCell?.docId === docId && expandedCell?.header === header;
        const allItemIndices = items.map(item => item.originalIndex);
        const selectedForThisCell = new Set([...(selectedItems[docId] || [])].filter(idx => allItemIndices.includes(idx)));
        const numSelected = selectedForThisCell.size;
        const areAllSelected = allItemIndices.length > 0 && numSelected === allItemIndices.length;

        return (
            <td className={`p-0 border-r dark:border-base-700 align-top transition-all ${isExpanded ? 'bg-base-50 dark:bg-base-900/50' : ''}`}>
                <div className="p-2 text-center cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/30" onClick={() => setExpandedCell(isExpanded ? null : { docId, header })}>
                    <span className={`font-semibold ${numSelected > 0 ? 'text-primary-600 dark:text-primary-400' : 'text-base-700 dark:text-base-300'}`}>{numSelected > 0 ? `${numSelected} / ${items.length}` : items.length}</span>
                    <span className="text-xs text-base-500"> item{items.length > 1 ? 's' : ''}</span>
                </div>
                {isExpanded && (
                    <div className="p-2 border-t dark:border-base-600 bg-white dark:bg-base-800 animate-fade-in max-h-60 overflow-y-auto">
                        <table className="min-w-full text-xs">
                           <thead><tr>
                                <th className="p-1 w-8"><input type="checkbox" className="h-4 w-4 rounded text-primary-600" checked={areAllSelected} onChange={e => { const current = new Set(selectedItems[docId] || []); if (e.target.checked) allItemIndices.forEach(idx => current.add(idx)); else allItemIndices.forEach(idx => current.delete(idx)); setSelectedItems(p => ({ ...p, [docId]: current })); }}/></th>
                                <th className="p-1 text-left font-semibold">Sample</th><th className="p-1 text-left font-semibold">Due</th>
                           </tr></thead>
                           <tbody>{items.map(({ task, originalIndex }) => (
                                <tr key={originalIndex}>
                                    <td className="p-1 text-center"><input type="checkbox" className="h-4 w-4 rounded text-primary-600" checked={selectedItems[docId]?.has(originalIndex) || false} onChange={e => handleSelectItem(docId, originalIndex, e.target.checked)}/></td>
                                    <td className="p-1 truncate" title={getTaskValue(task, 'Sample Name') as string}>{getTaskValue(task, 'Sample Name')}</td><td className="p-1 whitespace-nowrap">{formatDate(getTaskValue(task, 'Due finish'))}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}
            </td>
        );
    };

    return (
        <div className="space-y-4 animate-slide-in-up h-full flex flex-col">
            {notification && <Toast message={notification} onDismiss={() => setNotification(null)} />}
            <AssignmentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAssign={handleConfirmAssignment} personnel={onShiftPersonnel} isPreparation={activeCategory === 'prepare'} selectedItemCount={totalSelectedCount} isProcessing={isAssigning} />
            
            <div className="flex-shrink-0 space-y-4">
                <h2 className="text-2xl font-bold">Assign Tasks</h2>
                {/* ... (Header and filters UI same as TasksTab.tsx) ... */}
                 <div className="p-4 bg-base-100 dark:bg-base-900/50 rounded-lg border dark:border-base-700 space-y-4">
                    <div className="flex flex-wrap items-center gap-2"><CategoryButton name="All" value="all" count={getCategoryCount('all')}/><CategoryButton name="Urgent" value={TaskCategory.Urgent} count={getCategoryCount(TaskCategory.Urgent)}/><CategoryButton name="Normal" value={TaskCategory.Normal} count={getCategoryCount(TaskCategory.Normal)}/><CategoryButton name="PoCat" value={TaskCategory.PoCat} count={getCategoryCount(TaskCategory.PoCat)}/><CategoryButton name="Prepare" value="prepare" count={getCategoryCount('prepare')}/></div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t dark:border-base-700 pt-4"><input type="text" placeholder="Filter by Request ID..." value={filterRequestId} onChange={e => setFilterRequestId(e.target.value)} className="md:col-span-2 p-2 rounded-lg bg-white dark:bg-base-700 border"/><div><label className="text-xs font-semibold text-base-500">Date</label><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full mt-1 p-2 rounded-lg bg-white dark:bg-base-700 border"/></div><div><label className="text-xs font-semibold text-base-500">Shift</label><select value={selectedShift} onChange={e => setSelectedShift(e.target.value as 'day'|'night')} className="w-full mt-1 p-2 rounded-lg bg-white dark:bg-base-700 border"><option value="day">Day</option><option value="night">Night</option></select></div></div>
                </div>
                <div className="p-2 bg-base-100 dark:bg-base-900/50 rounded-lg border dark:border-base-700 flex justify-between items-center sticky top-0 z-10">
                    <h3 className="font-semibold text-base-700 dark:text-base-300">Total Selected: <span className="text-primary-600 dark:text-primary-400 font-bold">{totalSelectedCount} items</span></h3>
                    <div className="flex gap-2">
                         <button onClick={openPrepareModal} disabled={totalSelectedCount === 0} className="px-4 py-2 text-sm font-semibold bg-amber-400 text-amber-900 rounded-md hover:bg-amber-500 hover:text-white transition-colors shadow-sm disabled:opacity-50">Send to Prepare</button>
                         <button onClick={openAssignModal} disabled={totalSelectedCount === 0} className="px-4 py-2 text-sm font-semibold bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors shadow-sm disabled:bg-base-400 disabled:cursor-not-allowed">Assign Selected</button>
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-auto border dark:border-base-700 rounded-lg">
                {isLoading ? (<div className="text-center p-8">Loading tasks...</div>) :
                 error ? (<div className="p-8 text-center text-red-600">{error}</div>) : 
                 activeCategory === TaskCategory.Manual ? (
                     <div className="p-4">
                        {/* Manual Task UI */}
                         <div className="mb-4 p-4 border rounded bg-base-50">
                             <h3>Quick Add Manual Task</h3>
                             <div className="flex gap-2 mt-2">
                                <input placeholder="Description" value={manualDesc} onChange={e=>setManualDesc(e.target.value)} className="border p-1 flex-grow"/>
                                <input placeholder="Qty" value={manualQty} onChange={e=>setManualQty(e.target.value)} className="border p-1 w-20"/>
                                <button onClick={handleQuickAddManual} className="bg-primary-600 text-white px-3 py-1 rounded">Add</button>
                             </div>
                         </div>
                         <table className="min-w-full text-sm">
                             <thead><tr><th>Select</th><th>Desc</th><th>Qty</th><th>Action</th></tr></thead>
                             <tbody>
                                 {categorizedTasks.filter(t => t.category === TaskCategory.Manual).map(g => (
                                     <tr key={g.docId}>
                                         <td><input type="checkbox" checked={selectedItems[g.docId!]?.has(0)} onChange={e => handleSelectItem(g.docId!, 0, e.target.checked)}/></td>
                                         <td>{getTaskValue(g.tasks[0], 'Description')}</td>
                                         <td>{getTaskValue(g.tasks[0], 'Quantity')}</td>
                                         <td><button onClick={()=>setConfirmDeleteManual({docId:g.docId!, index:0})}><TrashIcon className="h-4 w-4 text-red-500"/></button></td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                 ) : 
                 gridData.length === 0 ? (<div className="p-8 text-center text-base-500">No tasks to assign for the selected filters.</div>) : (
                    <table className="min-w-full text-sm text-left table-fixed">
                        <thead className="bg-base-100 dark:bg-base-800 sticky top-0 z-10">
                            <tr>
                                <th rowSpan={2} className="p-2 font-semibold border-b border-r dark:border-base-700 w-48">Request ID</th>
                                {gridHeaders.map(([group, subs]) => (<th key={group} colSpan={subs.length} className="p-2 font-semibold text-center border-b border-r dark:border-base-700">{group}</th>))}
                                <th rowSpan={2} className="p-2 font-semibold border-b dark:border-base-700 w-40">Unmapped</th>
                            </tr>
                            <tr>
                                {allSubHeaders.map(sub => (<th key={sub} className="p-2 font-semibold text-center border-b border-r dark:border-base-700 w-28">{sub}</th>))}
                            </tr>
                        </thead>
                        <tbody>
                            {gridData.map(row => (
                                <tr key={row.docId} className="border-b dark:border-base-700 last:border-b-0 hover:bg-base-50/50 dark:hover:bg-base-700/20">
                                    <td className="p-2 font-semibold border-r dark:border-base-700 truncate" title={row.requestId}>{row.requestId}</td>
                                    {allSubHeaders.map(header => (<ExpandableCell key={header} docId={row.docId} header={header} items={row.cells[header] || []}/>))}
                                    <ExpandableCell docId={row.docId} header="unmapped" items={row.unmappedItems || []} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 )}
            </div>
        </div>
    );
};

export default TasksTab;
