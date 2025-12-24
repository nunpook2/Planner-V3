import React, { useState, useEffect, useMemo } from 'react';
import type { Tester } from '../types';
import { getDailySchedule, saveDailySchedule, getExistingScheduleDates } from '../services/dataService';
import { SunIcon, MoonIcon, UserGroupIcon, CheckCircleIcon, ChevronDownIcon, DownloadIcon } from './common/Icons';

declare const XLSX: any;

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

// --- COMPONENTS ---

const CalendarWidget: React.FC<{
    selectedDate: string;
    onSelectDate: (date: string) => void;
    scheduledDates: Set<string>;
}> = ({ selectedDate, onSelectDate, scheduledDates }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));
    
    useEffect(() => {
        setCurrentMonth(new Date(selectedDate));
    }, [selectedDate]);

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const handlePrevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
    const handleNextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

    const renderDays = () => {
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isSelected = dateStr === selectedDate;
            const hasSchedule = scheduledDates.has(dateStr);
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            days.push(
                <button
                    key={d}
                    onClick={() => onSelectDate(dateStr)}
                    className={`h-8 w-8 rounded-full flex flex-col items-center justify-center text-xs font-medium relative transition-all duration-200
                        ${isSelected ? 'bg-primary-600 text-white shadow-md scale-110' : 'hover:bg-base-100 text-base-600 dark:text-base-300'}
                        ${isToday && !isSelected ? 'ring-1 ring-primary-500 text-primary-600 font-bold' : ''}
                    `}
                >
                    {d}
                    {hasSchedule && !isSelected && (
                        <span className="absolute bottom-1.5 w-1 h-1 bg-emerald-500 rounded-full"></span>
                    )}
                </button>
            );
        }
        return days;
    };

    return (
        <div className="bg-white dark:bg-base-800 rounded-3xl shadow-sm border border-base-200 dark:border-base-700 p-5 w-full">
            <div className="flex justify-between items-center mb-6">
                <button onClick={handlePrevMonth} className="p-1 hover:bg-base-100 rounded-full text-base-400 hover:text-primary-600 transition-colors"><ChevronDownIcon className="h-5 w-5 rotate-90" /></button>
                <span className="font-bold text-base text-base-800 dark:text-base-100 tracking-tight">{monthNames[month]} <span className="text-base-400 font-normal">{year}</span></span>
                <button onClick={handleNextMonth} className="p-1 hover:bg-base-100 rounded-full text-base-400 hover:text-primary-600 transition-colors"><ChevronDownIcon className="h-5 w-5 -rotate-90" /></button>
            </div>
            <div className="grid grid-cols-7 text-center mb-2">
                {['S','M','T','W','T','F','S'].map(d => <span key={d} className="text-[10px] font-bold text-base-400 uppercase tracking-widest">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-y-2 place-items-center">
                {renderDays()}
            </div>
            <div className="mt-6 pt-4 border-t border-dashed border-base-200 dark:border-base-700 flex justify-center">
                <div className="flex items-center gap-2 text-[10px] text-base-400 uppercase font-bold tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Planned
                    <span className="w-2 h-2 rounded-full bg-base-300 ml-3"></span> Empty
                </div>
            </div>
        </div>
    );
};

// Component defined outside to prevent re-creation
const AssignedChip: React.FC<{ 
    tester: Tester; 
    onRemove: () => void; 
    theme: 'amber' | 'indigo' 
}> = ({ tester, onRemove, theme }) => {
    const bgClass = theme === 'amber' ? 'bg-white border-amber-200 text-amber-900' : 'bg-white border-indigo-200 text-indigo-900';
    const iconBg = theme === 'amber' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600';
    const isAssistant = tester.team === 'assistants_4_2';
    
    return (
        <div className={`group flex items-center gap-2 pl-1 pr-2 py-1.5 rounded-xl border shadow-sm transition-all hover:shadow-md ${bgClass} w-full`}>
            <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${iconBg}`}>
                {getInitials(tester.name)}
            </div>
            <div className="flex-grow min-w-0 flex flex-col leading-tight">
                <span className="text-xs font-bold truncate" title={tester.name}>{tester.name}</span>
                <span className="text-[9px] opacity-70 truncate">{isAssistant ? 'Assistant' : 'Tester'}</span>
            </div>
            <button onClick={onRemove} className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-red-100 text-base-300 hover:text-red-500 transition-colors">
                ✕
            </button>
        </div>
    );
};

const EmployeeCard: React.FC<{ 
    employee: Tester; 
    dayAssigned: boolean; 
    nightAssigned: boolean; 
    onAdd: (id: string, shift: 'day' | 'night') => void; 
}> = ({ employee, dayAssigned, nightAssigned, onAdd }) => {
    const isFullyAssigned = dayAssigned && nightAssigned;
    const isAssignedAny = dayAssigned || nightAssigned;

    return (
        <div className={`
            relative p-3 rounded-2xl border transition-all duration-300 group
            ${isFullyAssigned 
                ? 'bg-base-50 dark:bg-base-800/50 border-transparent opacity-60 grayscale' 
                : 'bg-white dark:bg-base-800 border-base-200 dark:border-base-700 hover:border-primary-300 dark:hover:border-primary-500 hover:shadow-md hover:-translate-y-0.5'
            }
        `}>
            <div className="flex items-center gap-3">
                <div className={`
                    w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs shadow-inner
                    ${dayAssigned ? 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700' : 
                      nightAssigned ? 'bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700' : 
                      'bg-gradient-to-br from-base-100 to-base-200 dark:from-base-700 dark:to-base-600 text-base-600 dark:text-base-300'}
                `}>
                    {getInitials(employee.name)}
                </div>
                
                <div className="flex-grow min-w-0">
                    <p className={`font-semibold text-xs truncate leading-tight ${isFullyAssigned ? 'text-base-400' : 'text-base-800 dark:text-base-100'}`} title={employee.name}>
                        {employee.name}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                         {isAssignedAny && !isFullyAssigned && <span className="text-[9px] font-bold text-emerald-500">Assigned</span>}
                    </div>
                </div>

                {!isFullyAssigned && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button 
                            onClick={() => onAdd(employee.id, 'day')} 
                            disabled={dayAssigned || nightAssigned} 
                            className={`p-1.5 rounded-lg transition-all ${dayAssigned || nightAssigned ? 'hidden' : 'bg-amber-50 text-amber-500 hover:bg-amber-500 hover:text-white shadow-sm'}`} 
                            title="Assign Day Shift"
                        >
                            <SunIcon className="h-4 w-4" />
                        </button>
                        <button 
                            onClick={() => onAdd(employee.id, 'night')} 
                            disabled={dayAssigned || nightAssigned}
                            className={`p-1.5 rounded-lg transition-all ${dayAssigned || nightAssigned ? 'hidden' : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-500 hover:text-white shadow-sm'}`} 
                            title="Assign Night Shift"
                        >
                            <MoonIcon className="h-4 w-4" />
                        </button>
                    </div>
                )}
                
                {isFullyAssigned && <CheckCircleIcon className="h-4 w-4 text-emerald-500 absolute top-3 right-3" />}
            </div>
        </div>
    );
};

const ShiftBoard: React.FC<{ 
    shift: 'day' | 'night'; 
    assignedTesters: Tester[]; 
    assignedAssistants: Tester[]; 
    onRemove: (id: string, shift: 'day' | 'night') => void; 
}> = ({ shift, assignedTesters, assignedAssistants, onRemove }) => {
    const isDay = shift === 'day';
    const theme = isDay ? 'amber' : 'indigo';
    
    const headerBg = isDay ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20' : 'bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20';
    const borderColor = isDay ? 'border-amber-100 dark:border-amber-900/30' : 'border-indigo-100 dark:border-indigo-900/30';
    const textColor = isDay ? 'text-amber-900 dark:text-amber-100' : 'text-indigo-900 dark:text-indigo-100';
    const iconColor = isDay ? 'text-amber-500' : 'text-indigo-500';

    // Combine and Sort Personnel
    const allPersonnel = useMemo(() => {
        return [...assignedTesters, ...assignedAssistants].sort((a, b) => {
            // Sort by Role first (Testers then Assistants), then by Name
            if (a.team !== b.team) return a.team === 'testers_3_3' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }, [assignedTesters, assignedAssistants]);

    return (
        <div className={`h-full rounded-3xl border ${borderColor} bg-white dark:bg-base-800 shadow-sm flex flex-col overflow-hidden transition-all hover:shadow-md flex-1`}>
            {/* Header */}
            <div className={`p-4 border-b ${borderColor} ${headerBg} flex flex-col gap-2`}>
                <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-xl bg-white dark:bg-base-800 shadow-sm ${iconColor}`}>
                        {isDay ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
                    </div>
                    <div className={`px-2 py-1 rounded-lg bg-white/60 dark:bg-black/20 border border-white/50 dark:border-white/5 backdrop-blur-sm`}>
                        <span className={`text-lg font-black ${iconColor}`}>{allPersonnel.length}</span>
                    </div>
                </div>
                <div>
                    <h3 className={`font-bold text-base leading-none ${textColor}`}>{isDay ? 'Day Shift' : 'Night Shift'}</h3>
                    <p className={`text-[10px] font-bold uppercase tracking-wider opacity-60 mt-0.5 ${textColor}`}>{isDay ? '08:00 - 20:00' : '20:00 - 08:00'}</p>
                </div>
            </div>

            {/* Content - Unified List */}
            <div className={`flex-grow p-3 overflow-y-auto custom-scrollbar bg-base-50/50 dark:bg-base-900/30`}>
                <div className="space-y-2">
                    {allPersonnel.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-base-300 dark:text-base-600 italic text-xs">
                            <span>No staff assigned</span>
                        </div>
                    ) : (
                        allPersonnel.map(p => (
                            <AssignedChip key={p.id} tester={p} theme={theme} onRemove={() => onRemove(p.id, shift)} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

const RosterTab: React.FC<{ testers: Tester[]; onTestersUpdate: () => void; }> = ({ testers }) => {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [scheduledDates, setScheduledDates] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [shiftData, setShiftData] = useState<{ dayT: Set<string>; nightT: Set<string>; dayA: Set<string>; nightA: Set<string> }>({ dayT: new Set(), nightT: new Set(), dayA: new Set(), nightA: new Set() });

    useEffect(() => {
        const fetchSchedule = async () => { 
            setIsLoading(true); 
            try { 
                const [s, dates] = await Promise.all([
                    getDailySchedule(selectedDate),
                    getExistingScheduleDates()
                ]);
                setShiftData(s ? { dayT: new Set(s.dayShiftTesters), nightT: new Set(s.nightShiftTesters), dayA: new Set(s.dayShiftAssistants), nightA: new Set(s.nightShiftAssistants) } : { dayT: new Set(), nightT: new Set(), dayA: new Set(), nightA: new Set() }); 
                setScheduledDates(new Set(dates));
            } catch(e){} 
            finally { setIsLoading(false); } 
        };
        fetchSchedule();
    }, [selectedDate]);

    const handleShiftChange = (id: string, shift: 'day'|'night', action: 'add'|'remove') => {
        const emp = testers.find(t=>t.id===id); if(!emp) return;
        const key = shift==='day'?(emp.team==='testers_3_3'?'dayT':'dayA'):(emp.team==='testers_3_3'?'nightT':'nightA');
        
        // Exclusive Logic: Remove from other shift if adding
        if (action === 'add') {
            const otherKey = shift === 'day' ? (emp.team==='testers_3_3'?'nightT':'nightA') : (emp.team==='testers_3_3'?'dayT':'dayA');
            setShiftData(prev => {
                const nextKeySet = new Set(prev[key]).add(id);
                const nextOtherSet = new Set(prev[otherKey]);
                nextOtherSet.delete(id);
                return { ...prev, [key]: nextKeySet, [otherKey]: nextOtherSet };
            });
        } else {
            setShiftData(prev => { 
                const next = new Set(prev[key]); 
                next.delete(id); 
                return { ...prev, [key]: next }; 
            });
        }
    };

    const handleSave = async () => { 
        setSaveStatus('saving'); 
        await saveDailySchedule(selectedDate, { dayShiftTesters: [...shiftData.dayT], nightShiftTesters: [...shiftData.nightT], dayShiftAssistants: [...shiftData.dayA], nightShiftAssistants: [...shiftData.nightA] }); 
        setSaveStatus('saved'); 
        setScheduledDates(prev => new Set(prev).add(selectedDate));
        setTimeout(()=>setSaveStatus('idle'),2000); 
    };

    const handleExport = () => {
        const dayStaff = [...getPeople(shiftData.dayT), ...getPeople(shiftData.dayA)].map(p => ({ Shift: 'Day', Name: p.name, Role: p.team === 'testers_3_3' ? 'Tester' : 'Assistant' }));
        const nightStaff = [...getPeople(shiftData.nightT), ...getPeople(shiftData.nightA)].map(p => ({ Shift: 'Night', Name: p.name, Role: p.team === 'testers_3_3' ? 'Tester' : 'Assistant' }));
        const ws = XLSX.utils.json_to_sheet([...dayStaff, ...nightStaff]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Roster");
        XLSX.writeFile(wb, `Roster_${selectedDate}.xlsx`);
    };

    const { tTeam, aTeam } = useMemo(() => ({ tTeam: testers.filter(t=>t.team==='testers_3_3'), aTeam: testers.filter(t=>t.team==='assistants_4_2') }), [testers]);
    const getPeople = (ids: Set<string>) => [...ids].map(id=>testers.find(t=>t.id===id)!).filter(Boolean);

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] animate-slide-in-up">
            <div className="flex-shrink-0 mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-2xl font-bold text-base-900 dark:text-base-100">Roster Management</h2>
                    <p className="text-sm text-base-500">Plan daily shifts & personnel allocation</p>
                </div>
                <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-base-50 transition-all shadow-sm">
                    <DownloadIcon className="h-4 w-4" /> Export Roster
                </button>
            </div>
            
            <div className="flex-grow min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* LEFT: Calendar & Actions (3 Cols) */}
                <div className="xl:col-span-3 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
                    <CalendarWidget selectedDate={selectedDate} onSelectDate={setSelectedDate} scheduledDates={scheduledDates} />
                    
                    <div className="bg-white dark:bg-base-800 p-6 rounded-3xl shadow-sm border border-base-200 dark:border-base-700">
                        <div className="mb-6">
                            <h3 className="text-xs font-bold text-base-400 uppercase tracking-widest mb-1">Editing Schedule For</h3>
                            <div className="text-xl font-bold text-base-800 dark:text-base-100">
                                {new Date(selectedDate).toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'})}
                            </div>
                        </div>
                        <button 
                            onClick={handleSave} 
                            disabled={saveStatus!=='idle'} 
                            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2
                                ${saveStatus==='saved' ? 'bg-emerald-500 shadow-emerald-200' : 'bg-primary-600 hover:bg-primary-700 shadow-primary-200 hover:-translate-y-1'}
                            `}
                        >
                            {saveStatus==='saving' ? <span className="animate-pulse">Saving...</span> : 
                             saveStatus==='saved' ? <><CheckCircleIcon className="h-5 w-5"/> Saved</> : 'Save Changes'}
                        </button>
                    </div>
                </div>

                {/* MIDDLE: Shift Boards (Day & Night) - REDUCED to 4 Cols */}
                <div className="xl:col-span-4 flex flex-col min-h-0">
                    {isLoading ? (
                        <div className="flex-1 flex items-center justify-center bg-white dark:bg-base-800 rounded-3xl border border-base-200 dark:border-base-700">
                            <div className="text-center space-y-3">
                                <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full mx-auto"></div>
                                <p className="text-base-400 font-medium">Loading schedule...</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-4 h-full">
                            <ShiftBoard shift="day" assignedTesters={getPeople(shiftData.dayT)} assignedAssistants={getPeople(shiftData.dayA)} onRemove={(id,s)=>handleShiftChange(id,s,'remove')} />
                            <ShiftBoard shift="night" assignedTesters={getPeople(shiftData.nightT)} assignedAssistants={getPeople(shiftData.nightA)} onRemove={(id,s)=>handleShiftChange(id,s,'remove')} />
                        </div>
                    )}
                </div>

                {/* RIGHT: Staff Pools (Testers & Assistants) - INCREASED to 5 Cols */}
                <div className="xl:col-span-5 flex gap-4 h-full min-h-0">
                    {/* Testers Pool */}
                    <div className="flex-1 flex flex-col bg-white dark:bg-base-800 rounded-3xl shadow-sm border border-base-200 dark:border-base-700 overflow-hidden">
                        <div className="p-4 border-b border-base-100 dark:border-base-700 bg-base-50/50 dark:bg-base-700/30 flex justify-between items-center">
                            <h3 className="font-bold text-sm text-base-800 dark:text-base-200 flex items-center gap-2">
                                <UserGroupIcon className="h-4 w-4 text-primary-500"/> Testers
                            </h3>
                            <span className="text-[10px] font-bold bg-base-200 dark:bg-base-600 px-2 py-0.5 rounded text-base-600 dark:text-base-300">{tTeam.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            {tTeam.map(t => <EmployeeCard key={t.id} employee={t} dayAssigned={shiftData.dayT.has(t.id)} nightAssigned={shiftData.nightT.has(t.id)} onAdd={(id,s)=>handleShiftChange(id,s,'add')} />)}
                        </div>
                    </div>

                    {/* Assistants Pool */}
                    <div className="flex-1 flex flex-col bg-white dark:bg-base-800 rounded-3xl shadow-sm border border-base-200 dark:border-base-700 overflow-hidden">
                        <div className="p-4 border-b border-base-100 dark:border-base-700 bg-base-50/50 dark:bg-base-700/30 flex justify-between items-center">
                            <h3 className="font-bold text-sm text-base-800 dark:text-base-200 flex items-center gap-2">
                                <UserGroupIcon className="h-4 w-4 text-primary-500"/> Assistants
                            </h3>
                            <span className="text-[10px] font-bold bg-base-200 dark:bg-base-600 px-2 py-0.5 rounded text-base-600 dark:text-base-300">{aTeam.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            {aTeam.map(t => <EmployeeCard key={t.id} employee={t} dayAssigned={shiftData.dayA.has(t.id)} nightAssigned={shiftData.nightA.has(t.id)} onAdd={(id,s)=>handleShiftChange(id,s,'add')} />)}
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};

export default RosterTab;
