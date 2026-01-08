
import React, { useState, useEffect, useMemo } from 'react';
import type { Tester } from '../types';
import { getDailySchedule, saveDailySchedule, getExistingScheduleDates } from '../services/dataService';
// Added missing RefreshIcon import to resolve compilation error on line 328
import { SunIcon, MoonIcon, UserGroupIcon, CheckCircleIcon, ChevronDownIcon, DownloadIcon, RefreshIcon } from './common/Icons';

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
        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-9 w-9"></div>);
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isSelected = dateStr === selectedDate;
            const hasSchedule = scheduledDates.has(dateStr);
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            days.push(
                <button
                    key={d}
                    onClick={() => onSelectDate(dateStr)}
                    className={`h-9 w-9 rounded-full flex flex-col items-center justify-center text-sm font-bold relative transition-all duration-200
                        ${isSelected ? 'bg-primary-600 text-white shadow-md scale-110' : 'hover:bg-base-100 text-base-600 dark:text-base-300'}
                        ${isToday && !isSelected ? 'ring-2 ring-primary-500 text-primary-600 font-black' : ''}
                    `}
                >
                    {d}
                    {hasSchedule && !isSelected && (
                        <span className="absolute bottom-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                    )}
                </button>
            );
        }
        return days;
    };

    return (
        <div className="bg-white dark:bg-base-800 rounded-3xl shadow-sm border border-base-200 dark:border-base-700 p-6 w-full">
            <div className="flex justify-between items-center mb-6">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-base-100 rounded-full text-base-400 hover:text-primary-600 transition-colors"><ChevronDownIcon className="h-5 w-5 rotate-90" /></button>
                <span className="font-black text-lg text-base-900 dark:text-base-100 tracking-tight">{monthNames[month]} <span className="text-base-400 font-normal">{year}</span></span>
                <button onClick={handleNextMonth} className="p-2 hover:bg-base-100 rounded-full text-base-400 hover:text-primary-600 transition-colors"><ChevronDownIcon className="h-5 w-5 -rotate-90" /></button>
            </div>
            <div className="grid grid-cols-7 text-center mb-3">
                {['S','M','T','W','T','F','S'].map(d => <span key={d} className="text-[11px] font-black text-base-400 uppercase tracking-widest">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-y-2 place-items-center">
                {renderDays()}
            </div>
        </div>
    );
};

const AssignedChip: React.FC<{ 
    tester: Tester; 
    onRemove: () => void; 
    theme: 'amber' | 'indigo' 
}> = ({ tester, onRemove, theme }) => {
    const bgClass = theme === 'amber' ? 'bg-white border-amber-200 text-amber-900' : 'bg-white border-indigo-200 text-indigo-900';
    const iconBg = theme === 'amber' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600';
    const isAssistant = tester.team === 'assistants_4_2';
    
    return (
        <div className={`group flex items-center gap-3 pl-1.5 pr-2 py-2.5 rounded-[1.2rem] border shadow-sm transition-all hover:shadow-md ${bgClass} w-full`}>
            <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-[12px] font-black ${iconBg}`}>
                {getInitials(tester.name)}
            </div>
            <div className="flex-grow min-w-0 flex flex-col leading-tight">
                <span className="text-[14px] font-black truncate" title={tester.name}>{tester.name}</span>
                <span className="text-[11px] font-bold opacity-70 uppercase tracking-wider truncate">{isAssistant ? 'Assistant' : 'Analyst'}</span>
            </div>
            <button onClick={onRemove} className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-red-50 text-base-300 hover:text-red-500 transition-colors">
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
            relative p-4 rounded-[1.3rem] border transition-all duration-300 group
            ${isFullyAssigned 
                ? 'bg-base-50 dark:bg-base-800/50 border-transparent opacity-60 grayscale' 
                : 'bg-white dark:bg-base-800 border-base-200 dark:border-base-700 hover:border-primary-300 dark:hover:border-primary-500 hover:shadow-md'
            }
        `}>
            <div className="flex items-center gap-4">
                <div className={`
                    w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-[13px] shadow-inner
                    ${dayAssigned ? 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700' : 
                      nightAssigned ? 'bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700' : 
                      'bg-gradient-to-br from-base-100 to-base-200 dark:from-base-700 dark:to-base-600 text-base-600 dark:text-base-300'}
                `}>
                    {getInitials(employee.name)}
                </div>
                
                <div className="flex-grow min-w-0">
                    <p className={`font-black text-[15px] truncate leading-tight ${isFullyAssigned ? 'text-base-400' : 'text-base-800 dark:text-base-100'}`} title={employee.name}>
                        {employee.name}
                    </p>
                    <span className="text-[10px] font-bold text-base-400 uppercase tracking-widest mt-1 block">
                        {employee.team === 'assistants_4_2' ? 'Assistant' : 'Analyst'}
                    </span>
                </div>

                {!isFullyAssigned && (
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button 
                            onClick={() => onAdd(employee.id, 'day')} 
                            disabled={dayAssigned || nightAssigned} 
                            className={`p-2 rounded-xl transition-all ${dayAssigned || nightAssigned ? 'hidden' : 'bg-amber-50 text-amber-500 hover:bg-amber-500 hover:text-white shadow-sm'}`} 
                            title="Assign Day Shift"
                        >
                            <SunIcon className="h-5 w-5" />
                        </button>
                        <button 
                            onClick={() => onAdd(employee.id, 'night')} 
                            disabled={dayAssigned || nightAssigned}
                            className={`p-2 rounded-xl transition-all ${dayAssigned || nightAssigned ? 'hidden' : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-500 hover:text-white shadow-sm'}`} 
                            title="Assign Night Shift"
                        >
                            <MoonIcon className="h-5 w-5" />
                        </button>
                    </div>
                )}
                
                {isFullyAssigned && <CheckCircleIcon className="h-5 w-5 text-emerald-500 absolute top-4 right-4" />}
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

    const allPersonnel = useMemo(() => {
        return [...assignedTesters, ...assignedAssistants].sort((a, b) => {
            if (a.team !== b.team) return a.team === 'testers_3_3' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }, [assignedTesters, assignedAssistants]);

    return (
        <div className={`h-full rounded-3xl border-2 ${borderColor} bg-white dark:bg-base-800 shadow-sm flex flex-col overflow-hidden flex-1`}>
            <div className={`p-5 border-b-2 ${borderColor} ${headerBg} flex flex-col gap-3`}>
                <div className="flex items-center justify-between">
                    <div className={`p-2.5 rounded-xl bg-white dark:bg-base-800 shadow-sm ${iconColor}`}>
                        {isDay ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
                    </div>
                    <div className="px-3 py-1 rounded-xl bg-white/80 dark:bg-black/20 border border-white dark:border-white/5 shadow-inner">
                        <span className={`text-[17px] font-black ${iconColor}`}>{allPersonnel.length}</span>
                    </div>
                </div>
                <div>
                    <h3 className={`font-black text-[17px] leading-none ${textColor}`}>{isDay ? 'Day Shift' : 'Night Shift'}</h3>
                    <p className={`text-[11px] font-black uppercase tracking-widest opacity-60 mt-2 ${textColor}`}>{isDay ? '08:00 - 20:00' : '20:00 - 08:00'}</p>
                </div>
            </div>

            <div className="flex-grow p-4 overflow-y-auto no-scrollbar bg-base-50/30 dark:bg-base-900/30">
                <div className="space-y-2.5">
                    {allPersonnel.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-base-300 dark:text-base-600 italic text-sm font-medium">
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

const RosterTab: React.FC<{ testers: Tester[]; onTestersUpdate: () => void; selectedDate: string; onDateChange: (date: string) => void; }> = ({ testers, selectedDate, onDateChange }) => {
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
        <div className="flex flex-col h-[calc(100vh-140px)] animate-slide-in-up p-4">
            <div className="flex-shrink-0 mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-base-955 dark:text-base-50 tracking-tighter">Roster Management</h2>
                    <p className="text-[11px] font-black text-base-400 uppercase tracking-widest mt-1">Plan daily shifts & personnel allocation</p>
                </div>
                <button onClick={handleExport} className="flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-base-800 border-2 border-base-200 dark:border-base-700 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-base-50 transition-all shadow-md active:scale-95">
                    <DownloadIcon className="h-4 w-4" /> Export Roster
                </button>
            </div>
            
            <div className="flex-grow min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-6 overflow-hidden">
                <div className="xl:col-span-3 flex flex-col gap-6 overflow-y-auto no-scrollbar">
                    <CalendarWidget selectedDate={selectedDate} onSelectDate={onDateChange} scheduledDates={scheduledDates} />
                    
                    <div className="bg-white dark:bg-base-800 p-8 rounded-[2rem] shadow-sm border border-base-200 dark:border-base-700">
                        <div className="mb-8">
                            <h3 className="text-[11px] font-black text-base-400 uppercase tracking-[0.2em] mb-2">Target Date</h3>
                            <div className="text-[20px] font-black text-base-900 dark:text-base-100 tracking-tight leading-none">
                                {new Date(selectedDate).toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'})}
                            </div>
                        </div>
                        <button 
                            onClick={handleSave} 
                            disabled={saveStatus!=='idle'} 
                            className={`w-full py-5 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] text-white shadow-xl transition-all transform active:scale-95 flex items-center justify-center gap-3 border-b-4
                                ${saveStatus==='saved' ? 'bg-emerald-600 border-emerald-800' : 'bg-primary-600 border-primary-800 hover:brightness-110'}
                            `}
                        >
                            {saveStatus==='saving' ? <span className="animate-pulse">Syncing...</span> : 
                             saveStatus==='saved' ? <><CheckCircleIcon className="h-6 w-6"/> Saved</> : 'Confirm Allocation'}
                        </button>
                    </div>
                </div>

                <div className="xl:col-span-4 flex flex-col min-h-0">
                    {isLoading ? (
                        <div className="flex-1 flex items-center justify-center bg-white/40 backdrop-blur-md rounded-[2.5rem] border-2 border-dashed border-base-200">
                            <RefreshIcon className="h-10 w-10 animate-spin text-base-300" />
                        </div>
                    ) : (
                        <div className="flex gap-5 h-full">
                            <ShiftBoard shift="day" assignedTesters={getPeople(shiftData.dayT)} assignedAssistants={getPeople(shiftData.dayA)} onRemove={(id,s)=>handleShiftChange(id,s,'remove')} />
                            <ShiftBoard shift="night" assignedTesters={getPeople(shiftData.nightT)} assignedAssistants={getPeople(shiftData.nightA)} onRemove={(id,s)=>handleShiftChange(id,s,'remove')} />
                        </div>
                    )}
                </div>

                <div className="xl:col-span-5 flex gap-5 h-full min-h-0">
                    <div className="flex-1 flex flex-col bg-white/40 dark:bg-base-900/40 rounded-[2.5rem] border border-white dark:border-base-800 shadow-sm backdrop-blur-md overflow-hidden">
                        <div className="p-5 border-b border-white dark:border-base-800 bg-white/20 flex justify-between items-center">
                            <h3 className="text-[11px] font-black text-base-400 uppercase tracking-[0.4em] ml-1">Analysts Pool</h3>
                            <div className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-black text-[12px]">{tTeam.length}</div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                            {tTeam.map(t => <EmployeeCard key={t.id} employee={t} dayAssigned={shiftData.dayT.has(t.id)} nightAssigned={shiftData.nightT.has(t.id)} onAdd={(id,s)=>handleShiftChange(id,s,'add')} />)}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col bg-white/40 dark:bg-base-900/40 rounded-[2.5rem] border border-white dark:border-base-800 shadow-sm backdrop-blur-md overflow-hidden">
                        <div className="p-5 border-b border-white dark:border-base-800 bg-white/20 flex justify-between items-center">
                            <h3 className="text-[11px] font-black text-base-400 uppercase tracking-[0.4em] ml-1">Assistants Pool</h3>
                            <div className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600 font-black text-[12px]">{aTeam.length}</div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                            {aTeam.map(t => <EmployeeCard key={t.id} employee={t} dayAssigned={shiftData.dayA.has(t.id)} nightAssigned={shiftData.nightA.has(t.id)} onAdd={(id,s)=>handleShiftChange(id,s,'add')} />)}
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};

export default RosterTab;
