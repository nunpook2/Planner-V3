
import React, { useState, useEffect, useRef } from 'react';
import type { Tester, TestMapping } from '../types';
import { 
    addTester, deleteTester, updateTester, runCleanup, clearAllTaskData, getTestMappings, addTestMapping, updateTestMapping, deleteTestMapping 
} from '../services/dataService';
import { TrashIcon, UploadIcon, PencilIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, PlusIcon, DragHandleIcon } from './common/Icons';

declare const XLSX: any;

// --- SHARED UI COMPONENTS ---

const ConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    confirmColor?: string;
    isProcessing?: boolean;
}> = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", confirmColor = "bg-primary-600", isProcessing }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-md m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-base-900 dark:text-base-100">{title}</h3>
                <div className="text-base-600 dark:text-base-300">{message}</div>
                <div className="flex justify-end gap-3 pt-4">
                    <button 
                        onClick={onClose} 
                        disabled={isProcessing}
                        className="px-5 py-2 text-sm font-semibold text-base-600 hover:bg-base-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onConfirm} 
                        disabled={isProcessing}
                        className={`px-5 py-2 text-sm font-bold text-white rounded-lg shadow-md hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 ${confirmColor}`}
                    >
                        {isProcessing ? 'Processing...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

const Toast: React.FC<{ message: string; isError?: boolean; onDismiss: () => void }> = ({ message, isError, onDismiss }) => {
    useEffect(() => { const t = setTimeout(onDismiss, 3000); return () => clearTimeout(t); }, [onDismiss]);
    return (
        <div className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl text-white font-medium flex items-center gap-3 animate-slide-in-up z-[70] ${isError ? 'bg-red-500' : 'bg-emerald-500'}`}>
            {isError ? <AlertTriangleIcon className="h-5 w-5"/> : <CheckCircleIcon className="h-5 w-5"/>}
            {message}
        </div>
    );
};

// --- SUB-COMPONENTS ---

const TesterManager: React.FC<{ testers: Tester[]; onRefreshTesters: () => void; setNotification: (n: any) => void }> = ({ testers, onRefreshTesters, setNotification }) => {
    const [newTesterName, setNewTesterName] = useState('');
    const [selectedTeam, setSelectedTeam] = useState<'testers_3_3' | 'assistants_4_2'>('testers_3_3');
    
    // Edit State
    const [editingTesterId, setEditingTesterId] = useState<string | null>(null);
    const [tempName, setTempName] = useState('');
    const [tempTeam, setTempTeam] = useState<'testers_3_3' | 'assistants_4_2' | ''>('');
    
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const handleAdd = async () => {
        if (!newTesterName.trim()) return;
        try {
            const t = await addTester(newTesterName);
            await updateTester(t.id, { team: selectedTeam });
            setNewTesterName('');
            onRefreshTesters();
            setNotification({ message: "Personnel added successfully." });
        } catch (e) { setNotification({ message: "Failed to add personnel.", isError: true }); }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteTester(deleteId);
            onRefreshTesters();
            setNotification({ message: "Personnel removed." });
        } catch (e) { setNotification({ message: "Failed to remove personnel.", isError: true }); }
        setDeleteId(null);
    };

    const startEdit = (t: Tester) => { 
        setEditingTesterId(t.id); 
        setTempName(t.name);
        setTempTeam(t.team || '');
    };
    
    const saveEdit = async (id: string) => { 
        try {
            await updateTester(id, { name: tempName, team: tempTeam || null } as any); 
            setEditingTesterId(null); 
            onRefreshTesters();
            setNotification({ message: "Updated successfully." });
        } catch (e) {
            setNotification({ message: "Update failed.", isError: true });
        }
    };

    const groups = [
        { 
            title: "Testers (3 Days / 3 Nights)", 
            data: testers.filter(t => t.team === 'testers_3_3'),
            headerClass: "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800"
        },
        { 
            title: "Assistants (4 Days / 2 Off)", 
            data: testers.filter(t => t.team === 'assistants_4_2'),
            headerClass: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 border-amber-100 dark:border-amber-800"
        },
        { 
            title: "Unassigned / Legacy", 
            data: testers.filter(t => !t.team || (t.team !== 'testers_3_3' && t.team !== 'assistants_4_2')),
            headerClass: "bg-base-100 dark:bg-base-700 text-base-600 dark:text-base-300 border-base-200 dark:border-base-600"
        }
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ConfirmationModal 
                isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete}
                title="Remove Personnel" message="Are you sure you want to remove this person? This cannot be undone."
                confirmText="Remove" confirmColor="bg-red-600"
            />
            
            {/* ADD FORM */}
            <div className="bg-white dark:bg-base-800 p-6 rounded-2xl shadow-sm border border-base-200 dark:border-base-700 h-fit sticky top-4">
                <h3 className="font-bold text-lg text-base-900 dark:text-base-100 mb-4">Add Personnel</h3>
                <div className="space-y-4">
                    <div>
                         <label className="text-xs font-bold text-base-400 uppercase">Full Name</label>
                         <input type="text" value={newTesterName} onChange={e => setNewTesterName(e.target.value)} className="w-full p-3 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all dark:text-white" placeholder="e.g. John Doe"/>
                    </div>
                    <div>
                         <label className="text-xs font-bold text-base-400 uppercase">Team</label>
                         <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value as any)} className="w-full p-3 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all dark:text-white">
                            <option value="testers_3_3">Testers (3 days / 3 nights)</option>
                            <option value="assistants_4_2">Assistants (4 days / 2 off)</option>
                        </select>
                    </div>
                    <button onClick={handleAdd} disabled={!newTesterName.trim()} className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50">Add Person</button>
                </div>
            </div>

            {/* LISTS */}
            <div className="space-y-6">
                {groups.map(group => (
                    <div key={group.title} className="bg-white dark:bg-base-800 rounded-2xl shadow-sm border border-base-200 dark:border-base-700 overflow-hidden">
                        <div className={`px-5 py-3 border-b ${group.headerClass} flex justify-between items-center`}>
                            <h4 className="font-bold text-sm uppercase tracking-wide">{group.title}</h4>
                            <span className="text-xs font-bold bg-white/50 px-2 py-0.5 rounded-full">{group.data.length}</span>
                        </div>
                        <ul className="divide-y divide-base-100 dark:divide-base-700">
                            {group.data.map(t => (
                                <li key={t.id} className="p-3 flex justify-between items-center hover:bg-base-50 dark:hover:bg-base-700/50 transition-colors group">
                                    {editingTesterId === t.id ? (
                                        <div className="flex flex-col sm:flex-row gap-2 flex-grow mr-2 w-full">
                                            <input 
                                                type="text" 
                                                value={tempName} 
                                                onChange={e=>setTempName(e.target.value)} 
                                                className="flex-grow p-2 text-sm border rounded-lg dark:bg-base-900 dark:border-base-600 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                                            />
                                            <select 
                                                value={tempTeam} 
                                                onChange={e => setTempTeam(e.target.value as any)} 
                                                className="p-2 text-sm border rounded-lg dark:bg-base-900 dark:border-base-600 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                                            >
                                                <option value="">Unassigned</option>
                                                <option value="testers_3_3">Tester</option>
                                                <option value="assistants_4_2">Assistant</option>
                                            </select>
                                            <div className="flex items-center gap-1">
                                                <button onClick={()=>saveEdit(t.id)} className="bg-emerald-100 text-emerald-600 hover:bg-emerald-200 p-2 rounded-lg transition-colors"><CheckCircleIcon className="h-4 w-4"/></button>
                                                <button onClick={()=>setEditingTesterId(null)} className="bg-base-100 text-base-500 hover:bg-base-200 p-2 rounded-lg transition-colors"><XCircleIcon className="h-4 w-4"/></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-base-100 dark:bg-base-700 flex items-center justify-center text-xs font-bold text-base-500 dark:text-base-400 border border-base-200 dark:border-base-600">
                                                    {t.name.substring(0,2).toUpperCase()}
                                                </div>
                                                <span className="font-medium text-base-700 dark:text-base-200">{t.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => startEdit(t)} className="p-2 text-base-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><PencilIcon/></button>
                                                <button onClick={() => setDeleteId(t.id)} className="p-2 text-base-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><TrashIcon/></button>
                                            </div>
                                        </>
                                    )}
                                </li>
                            ))}
                            {group.data.length === 0 && <li className="p-6 text-center text-sm text-base-400 italic bg-base-50/50">No personnel in this group.</li>}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

const GroupOrderManager: React.FC<{ onTasksUpdated: () => void; setNotification: (n: any) => void }> = ({ onTasksUpdated, setNotification }) => {
    const [mappings, setMappings] = useState<TestMapping[]>([]);
    const [groups, setGroups] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const draggedGroupIndex = useRef<number | null>(null);
    const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);

    const fetchData = async () => {
        try {
            const f = await getTestMappings();
            setMappings(f);
            const u = Array.from(new Set(f.map(m => m.headerGroup).filter(Boolean)));
            const groupMinOrders: Record<string, number> = {};
            f.forEach(m => { if (m.headerGroup) { const c = groupMinOrders[m.headerGroup] ?? Infinity; const mOrder = m.order ?? Infinity; if (mOrder < c) groupMinOrders[m.headerGroup] = mOrder; } });
            setGroups(u.sort((a, b) => (groupMinOrders[a] ?? Infinity) - (groupMinOrders[b] ?? Infinity)));
        } catch (e) {}
    };
    
    useEffect(() => { fetchData() }, []);

    const handleDrop = (e: React.DragEvent, t: number) => {
        e.preventDefault(); setDragOverGroupIndex(null);
        const s = draggedGroupIndex.current; draggedGroupIndex.current = null;
        if (s === null || s === t) return;
        setGroups(p => { const r = [...p]; const [rm] = r.splice(s, 1); r.splice(t, 0, rm); return r; });
    };

    const handleSaveOrder = async () => {
        setIsSaving(true);
        try {
            const ups = [];
            const map = new Map<string, number>(groups.map((g, i) => [g, i]));
            for (const m of mappings) {
                 if (m.headerGroup && map.has(m.headerGroup)) {
                     const idx = map.get(m.headerGroup);
                     if (idx !== undefined && m.id) ups.push(updateTestMapping(m.id, { order: idx * 10000 }));
                 }
            }
            await Promise.all(ups);
            await fetchData();
            onTasksUpdated();
            setNotification({ message: "Column order updated!" });
        } catch (e) { setNotification({ message: "Failed to update order.", isError: true }); } finally { setIsSaving(false); }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white dark:bg-base-800 p-6 rounded-2xl shadow-sm border border-base-200 dark:border-base-700">
                <h3 className="font-bold text-lg text-base-900 dark:text-base-100 mb-2">Column Group Order</h3>
                <p className="text-sm text-base-500 mb-6">Drag and drop to reorder grid columns.</p>
                <div className="space-y-2">
                    {groups.map((group, index) => (
                        <div key={group} draggable onDragStart={e => { draggedGroupIndex.current = index; e.dataTransfer.effectAllowed = 'move'; }} onDragOver={e => { e.preventDefault(); if(index !== draggedGroupIndex.current) setDragOverGroupIndex(index); }} onDrop={e => handleDrop(e, index)} onDragLeave={()=>setDragOverGroupIndex(null)} className={`p-4 bg-base-50 dark:bg-base-900 rounded-xl border border-base-200 dark:border-base-700 cursor-move flex items-center justify-between hover:border-primary-300 dark:hover:border-primary-500 transition-all ${dragOverGroupIndex === index ? 'border-primary-500 ring-2 ring-primary-100 dark:ring-primary-900' : ''}`}>
                            <div className="flex items-center gap-4">
                                <span className="w-8 h-8 rounded-full bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 flex items-center justify-center font-mono text-xs text-base-400">{index + 1}</span>
                                <span className="font-bold text-base-700 dark:text-base-200">{group}</span>
                            </div>
                            <div className="text-base-400"><DragHandleIcon className="h-5 w-5"/></div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end pt-6 mt-6 border-t border-base-100 dark:border-base-700">
                    <button onClick={handleSaveOrder} disabled={isSaving} className="px-6 py-2 bg-primary-600 text-white font-bold rounded-lg shadow-md hover:bg-primary-700 disabled:opacity-50">{isSaving ? 'Saving...' : 'Save New Order'}</button>
                </div>
            </div>
        </div>
    );
};

// New Mapping Editor Modal
const MappingEditModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    mapping: Partial<TestMapping>;
    onSave: (m: Partial<TestMapping>) => void;
}> = ({ isOpen, onClose, mapping, onSave }) => {
    const [data, setData] = useState(mapping);
    useEffect(() => setData(mapping), [mapping]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-[70] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-base-900 dark:text-base-100">{mapping.id ? 'Edit Mapping' : 'Add New Mapping'}</h3>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold text-base-400 uppercase">Group</label>
                        <input type="text" value={data.headerGroup || ''} onChange={e => setData({...data, headerGroup: e.target.value})} className="w-full p-2.5 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" placeholder="e.g. Density"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-base-400 uppercase">Sub-Header</label>
                        <input type="text" value={data.headerSub || ''} onChange={e => setData({...data, headerSub: e.target.value})} className="w-full p-2.5 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" placeholder="e.g. 100"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-base-400 uppercase">Description</label>
                        <input type="text" value={data.description || ''} onChange={e => setData({...data, description: e.target.value})} className="w-full p-2.5 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-base-400 uppercase">Variant</label>
                        <input type="text" value={data.variant || ''} onChange={e => setData({...data, variant: e.target.value})} className="w-full p-2.5 mt-1 bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"/>
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-base-600 hover:bg-base-100 rounded-lg">Cancel</button>
                    <button onClick={() => onSave(data)} className="px-5 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg shadow-md hover:bg-primary-700">Save</button>
                </div>
            </div>
        </div>
    );
};

const MappingManager: React.FC<{ setNotification: (n: any) => void }> = ({ setNotification }) => {
    const [mappings, setMappings] = useState<TestMapping[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentMapping, setCurrentMapping] = useState<Partial<TestMapping>>({});

    const draggedMappingIndex = useRef<number | null>(null);
    const [dragOverMappingIndex, setDragOverMappingIndex] = useState<number | null>(null);

    const fetchData = async () => { try { setMappings(await getTestMappings()); } catch(e){} };
    useEffect(() => { fetchData(); }, []);

    const handleUpload = async () => {
        if (!file) return;
        setIsProcessing(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const wb = XLSX.read(e.target?.result, { type: 'binary' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                if (rawData.length === 0) throw new Error("File is empty");

                let headerRowIndex = 0;
                let maxMatchCount = 0;
                const targetKeywords = ['description', 'variant', 'group', 'header', 'category', 'test name'];

                for (let i = 0; i < Math.min(rawData.length, 20); i++) {
                    const row = rawData[i];
                    let matchCount = 0;
                    row.forEach((cell: any) => {
                        if (cell && typeof cell === 'string') {
                            const val = cell.toLowerCase();
                            if (targetKeywords.some(kw => val.includes(kw))) matchCount++;
                        }
                    });
                    if (matchCount > maxMatchCount) {
                        maxMatchCount = matchCount;
                        headerRowIndex = i;
                    }
                }

                const headerRow = rawData[headerRowIndex];
                const colMap: Record<string, number> = {};
                
                headerRow.forEach((cell: any, index: number) => {
                    if (typeof cell === 'string') {
                        const cleanHeader = cell.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (['description', 'desc', 'testname'].includes(cleanHeader)) colMap['desc'] = index;
                        if (['variant', 'var', 'method', 'condition'].includes(cleanHeader)) colMap['variant'] = index;
                        if (['headergroup', 'headergroup', 'group', 'testgroup', 'category'].includes(cleanHeader)) colMap['group'] = index;
                        if (['headersub', 'headersub', 'sub', 'subheader', 'column'].includes(cleanHeader)) colMap['sub'] = index;
                        if (['order', 'sort', 'sequence'].includes(cleanHeader)) colMap['order'] = index;
                    }
                });

                const currentMappings = await getTestMappings();
                let updatedCount = 0;
                let addedCount = 0;

                for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                    const row = rawData[i];
                    const getValue = (key: string) => (colMap[key] !== undefined && row[colMap[key]] !== undefined) ? String(row[colMap[key]]).trim() : '';
                    
                    const desc = getValue('desc');
                    const variant = getValue('variant');
                    const headerGroup = getValue('group') || 'Other';
                    const headerSub = getValue('sub') || 'Misc';
                    const order = Number(getValue('order')) || 0;

                    if (!desc && !variant) continue;

                    const existingMatch = currentMappings.find(
                        m => m.description.trim() === desc && m.variant.trim() === variant
                    );

                    if (existingMatch) {
                        await updateTestMapping(existingMatch.id, { headerGroup, headerSub, order });
                        updatedCount++;
                    } else {
                        await addTestMapping({ id: '', description: desc, variant: variant, headerGroup, headerSub, order });
                        addedCount++;
                    }
                }
                
                await fetchData();
                setNotification({ message: `Import Complete: Added ${addedCount}, Updated ${updatedCount}` });
            } catch (err) {
                console.error(err);
                setNotification({ message: "Failed to import mappings.", isError: true });
            } finally {
                setIsProcessing(false);
                setFile(null);
            }
        };
        reader.readAsBinaryString(file);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        await deleteTestMapping(deleteId);
        fetchData();
        setNotification({ message: "Mapping deleted" });
        setDeleteId(null);
    };

    const openAddModal = () => { setCurrentMapping({}); setIsEditModalOpen(true); };
    const openEditModal = (m: TestMapping) => { setCurrentMapping(m); setIsEditModalOpen(true); };

    const handleSaveMapping = async (m: Partial<TestMapping>) => {
        if (!m.headerGroup || !m.headerSub) { setNotification({ message: "Group and Sub-Header are required", isError: true }); return; }
        try {
            if (m.id) { await updateTestMapping(m.id, m); setNotification({ message: "Mapping updated" }); } 
            else { await addTestMapping({ ...m, order: mappings.length, id: '' } as any); setNotification({ message: "New mapping added" }); }
            setIsEditModalOpen(false); fetchData();
        } catch(e) { setNotification({ message: "Failed to save mapping", isError: true }); }
    };

    const handleDragStart = (e: React.DragEvent, index: number) => { draggedMappingIndex.current = index; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); if (draggedMappingIndex.current === index) return; setDragOverMappingIndex(index); };
    const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault(); setDragOverMappingIndex(null);
        const sourceIndex = draggedMappingIndex.current; draggedMappingIndex.current = null;
        if (sourceIndex === null || sourceIndex === targetIndex) return;
        const newMappings = [...mappings];
        const [movedItem] = newMappings.splice(sourceIndex, 1);
        newMappings.splice(targetIndex, 0, movedItem);
        setMappings(newMappings);
        try { const updates = newMappings.map((m, idx) => updateTestMapping(m.id, { order: idx })); await Promise.all(updates); setNotification({ message: "Order updated" }); } catch (err) { setNotification({ message: "Failed to update order", isError: true }); fetchData(); }
    };

    return (
        <div className="space-y-6">
            <ConfirmationModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} title="Delete Mapping" message="Are you sure?" confirmText="Delete" confirmColor="bg-red-600"/>
            <MappingEditModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} mapping={currentMapping} onSave={handleSaveMapping} />
            
            <div className="bg-white dark:bg-base-800 p-6 rounded-2xl shadow-sm border border-base-200 dark:border-base-700 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div><h3 className="font-bold text-lg text-base-900 dark:text-base-100">Test Mappings</h3><p className="text-sm text-base-500">Manage Excel to Grid logic. Drag to reorder.</p></div>
                <div className="flex gap-2 items-center flex-wrap justify-end">
                    <input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm dark:text-base-300 w-48" disabled={isProcessing}/>
                    <button onClick={handleUpload} disabled={!file || isProcessing} className="px-4 py-2 bg-base-100 dark:bg-base-700 text-base-700 dark:text-base-200 rounded-lg font-bold disabled:opacity-50 flex items-center gap-2 hover:bg-base-200 dark:hover:bg-base-600">
                        {isProcessing ? <span className="animate-spin h-4 w-4 border-2 border-base-500 border-t-transparent rounded-full"></span> : <UploadIcon className="h-4 w-4"/>} Import Excel
                    </button>
                    <button onClick={openAddModal} className="px-4 py-2 bg-primary-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-primary-700 shadow-md"><PlusIcon className="h-4 w-4"/> Add Mapping</button>
                </div>
            </div>
            
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-sm border border-base-200 dark:border-base-700 overflow-hidden max-h-[600px] overflow-y-auto custom-scrollbar">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-base-50 dark:bg-base-700 sticky top-0 border-b dark:border-base-600 z-10">
                        <tr><th className="p-3 font-semibold dark:text-base-200 w-12 text-center"></th><th className="p-3 font-semibold dark:text-base-200">Group</th><th className="p-3 font-semibold dark:text-base-200">Sub-Header</th><th className="p-3 font-semibold dark:text-base-200">Description</th><th className="p-3 font-semibold dark:text-base-200">Variant</th><th className="p-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-base-100 dark:divide-base-700">
                        {mappings.map((m, index) => (
                            <tr key={m.id} draggable onDragStart={(e) => handleDragStart(e, index)} onDragOver={(e) => handleDragOver(e, index)} onDrop={(e) => handleDrop(e, index)} onDragEnd={() => setDragOverMappingIndex(null)} className={`hover:bg-base-50 dark:hover:bg-base-700/50 group cursor-move transition-colors ${dragOverMappingIndex === index ? 'border-t-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                                <td className="p-2 text-center text-base-400"><DragHandleIcon className="h-4 w-4 mx-auto"/></td>
                                <td className="p-3 font-bold text-primary-700 dark:text-primary-400">{m.headerGroup}</td>
                                <td className="p-3 font-medium dark:text-base-300">{m.headerSub}</td>
                                <td className="p-3 text-base-500 dark:text-base-400 truncate max-w-[200px]">{m.description || <span className="text-base-300 italic">*Any*</span>}</td>
                                <td className="p-3 text-base-500 dark:text-base-400 truncate max-w-[200px]">{m.variant || <span className="text-base-300 italic">*Any*</span>}</td>
                                <td className="p-3 text-right"><div className="flex justify-end gap-1"><button onClick={() => openEditModal(m)} className="p-2 text-base-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><PencilIcon className="h-4 w-4"/></button><button onClick={() => setDeleteId(m.id)} className="p-2 text-base-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><TrashIcon className="h-4 w-4"/></button></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const SettingsTab: React.FC<{ testers: Tester[]; onRefreshTesters: () => void; onTasksUpdated: () => void; }> = (props) => {
    const [activeSubTab, setActiveSubTab] = useState<'team' | 'mappings' | 'columns' | 'danger'>('team');
    const [notification, setNotification] = useState<{ message: string; isError?: boolean } | null>(null);
    const [showCleanupModal, setShowCleanupModal] = useState(false);
    const [showWipeModal, setShowWipeModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const tabs = [{ id: 'team', label: 'Team Management' }, { id: 'mappings', label: 'Test Mappings' }, { id: 'columns', label: 'Column Order' }, { id: 'danger', label: 'Danger Zone', danger: true }];

    const handleCleanupConfirm = async () => { setIsProcessing(true); try { const res = await runCleanup(); setNotification({ message: `Deleted ${res.deleted} empty tasks.` }); props.onTasksUpdated(); } catch (e: any) { setNotification({ message: e.message, isError: true }); } finally { setIsProcessing(false); setShowCleanupModal(false); } };
    const handleWipeConfirm = async () => { setIsProcessing(true); try { await clearAllTaskData(); setNotification({ message: "All data wiped successfully." }); props.onTasksUpdated(); } catch (e: any) { setNotification({ message: e.message, isError: true }); } finally { setIsProcessing(false); setShowWipeModal(false); } };

    return (
        <div className="space-y-8 animate-slide-in-up">
            {notification && <Toast message={notification.message} isError={notification.isError} onDismiss={() => setNotification(null)} />}
            <ConfirmationModal isOpen={showCleanupModal} onClose={() => setShowCleanupModal(false)} onConfirm={handleCleanupConfirm} title="Cleanup Empty Tasks" message="This will remove request containers that have no items. This is safe to run properly." confirmText="Run Cleanup" isProcessing={isProcessing}/>
            <ConfirmationModal isOpen={showWipeModal} onClose={() => setShowWipeModal(false)} onConfirm={handleWipeConfirm} title="Wipe All Data" message={<span className="text-red-600 font-bold">WARNING: This will permanently delete ALL tasks, assignments, and history. This cannot be undone.</span>} confirmText="Wipe Everything" confirmColor="bg-red-600" isProcessing={isProcessing}/>

            <div><h2 className="text-2xl font-bold text-base-900 dark:text-base-100">Settings</h2><p className="text-base-500">Configure your workspace</p></div>
            <div className="flex p-1 bg-base-100 dark:bg-base-800 rounded-xl w-fit border border-base-200 dark:border-base-700">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveSubTab(tab.id as any)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${activeSubTab === tab.id ? 'bg-white dark:bg-base-700 text-base-900 dark:text-white shadow-sm ring-1 ring-black/5' : `text-base-500 hover:text-base-700 dark:hover:text-base-300 ${tab.danger ? 'hover:text-red-600' : ''}`}`}>{tab.label}</button>
                ))}
            </div>

            <div className="min-h-[400px]">
                {activeSubTab === 'team' && <TesterManager testers={props.testers} onRefreshTesters={props.onRefreshTesters} setNotification={setNotification} />}
                {activeSubTab === 'mappings' && <MappingManager setNotification={setNotification} />}
                {activeSubTab === 'columns' && <GroupOrderManager onTasksUpdated={props.onTasksUpdated} setNotification={setNotification} />}
                {activeSubTab === 'danger' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-8">
                        <div className="bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-full flex items-center justify-center mb-4"><CheckCircleIcon className="h-6 w-6"/></div>
                            <h3 className="font-bold text-lg text-base-900 dark:text-base-100 mb-2">Cleanup Empty Tasks</h3>
                            <p className="text-sm text-base-500 mb-6 flex-grow">Removes empty request shells. Safe to run.</p>
                            <button onClick={() => setShowCleanupModal(true)} className="px-6 py-2.5 bg-white dark:bg-base-700 text-base-700 dark:text-base-200 border border-base-300 dark:border-base-600 rounded-xl font-bold hover:bg-base-50 dark:hover:bg-base-600 transition-all w-full">Run Cleanup</button>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mb-4"><TrashIcon className="h-6 w-6"/></div>
                            <h3 className="font-bold text-lg text-red-900 dark:text-red-400 mb-2">Wipe All Data</h3>
                            <p className="text-sm text-red-700 dark:text-red-300 mb-6 flex-grow"><strong>Warning:</strong> Permanently deletes all data.</p>
                            <button onClick={() => setShowWipeModal(true)} className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg transition-all w-full">Wipe Everything</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettingsTab;
