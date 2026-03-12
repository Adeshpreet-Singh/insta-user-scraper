'use client';

import React, { useState, useRef } from 'react';
interface InstagramProfile {
    _id?: string;
    username: string;
    fullName?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
    biography?: string;
    url: string;
    profilePicUrl?: string;
    businessCategoryName?: string | null;
    verified?: boolean;
    contacted?: boolean;
    status: 'new' | 'for design reference' | 'can contact' | 'contacted';
    externalUrl?: string;
    externalUrls?: { title?: string; url: string }[];
    updatedAt?: string | Date;
    aiAnalysis?: {
        category?: string;
        painPoints?: string[];
        coldCallOpener?: string;
        conversationHooks?: string[];
        objectionHandlers?: { objection: string; response: string }[];
        analyzedAt?: string | Date;
    };
}




import { useEffect } from 'react';



interface DataTableProps {
    data: InstagramProfile[];
}

// Helper to check if a lead actually has meaningful AI analysis data
const hasAnalysis = (analysis: any): boolean => {
    if (!analysis) return false;
    // Require at least coldCallOpener or painPoints with real items
    // category alone is not enough (old broken analyses only saved category)
    return !!(
        analysis.coldCallOpener ||
        (analysis.painPoints && analysis.painPoints.length > 0)
    );
};

// Helper to extract emails and phone numbers from text
const extractLeads = (text: string = '') => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

    const emails = text.match(emailRegex) || [];
    const phones = text.match(phoneRegex) || [];

    return { emails, phones };
};

export default function DataTable({ data: initialData }: DataTableProps) {
    const [localData, setLocalData] = useState<InstagramProfile[]>(initialData);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [followerRange, setFollowerRange] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');

    const [sortConfig, setSortConfig] = useState<{ key: keyof InstagramProfile; direction: 'asc' | 'desc' }>({
        key: 'followersCount',
        direction: 'desc'
    });
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; ids: string[] }>({ isOpen: false, ids: [] });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Ref to prevent duplicate API requests on double-clicks
    const activeRequests = useRef<Set<string>>(new Set());

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalLeads, setTotalLeads] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // AI Analysis state
    const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
    const [analysisModal, setAnalysisModal] = useState<{
        isOpen: boolean;
        leadId?: string;
        data?: any;
        error?: string;
    }>({ isOpen: false });

    // Stable fetch function
    const fetchLeads = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: '20',
                search: searchTerm,
                category: categoryFilter,
                range: followerRange,
                status: statusFilter,
                sortKey: sortConfig.key as string,
                sortDir: sortConfig.direction
            });

            const res = await fetch(`/api/leads?${params.toString()}`);
            const data = await res.json();
            if (data.leads) {
                setLocalData(data.leads);
                setTotalPages(data.totalPages);
                setTotalLeads(data.total);
            }
        } catch (error) {
            console.error('Failed to fetch leads:', error);
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, searchTerm, categoryFilter, followerRange, statusFilter, sortConfig]);



    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);



    const handleStatusUpdate = async (id: string, newStatus: InstagramProfile['status']) => {
        if (!id) return;

        // Optimistic UI update
        const leadIndex = localData.findIndex(l => l._id === id);
        if (leadIndex === -1) return;

        const oldData = [...localData];
        const newData = [...localData];
        newData[leadIndex] = { ...newData[leadIndex], status: newStatus };
        setLocalData(newData);

        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    status: newStatus,
                    // Auto-sync contacted boolean for compatibility
                    contacted: newStatus === 'contacted'
                })
            });
            if (!res.ok) throw new Error(`Update failed with status ${res.status}`);
        } catch (error) {
            console.error('Failed to update lead status:', error);
            setLocalData(oldData);
            fetchLeads(); // Revert/Sync on error
        }
    };





    const handleAnalyze = async (id: string) => {
        if (!id) return;

        // Prevent duplicate requests
        if (activeRequests.current.has(id)) return;
        activeRequests.current.add(id);

        setAnalyzingIds(prev => new Set(prev).add(id));
        
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Analysis failed with status ${res.status}`);
            }

            const updatedLead = await res.json();

            // Update local state with the new analysis
            setLocalData(prevData => prevData.map(lead => 
                lead._id === id ? { ...lead, aiAnalysis: updatedLead.aiAnalysis } : lead
            ));
            
            // Show result in popup
            setAnalysisModal({ isOpen: true, leadId: id, data: updatedLead.aiAnalysis });

        } catch (error: any) {
            console.error('Failed to analyze lead:', error);
            setAnalysisModal({ isOpen: true, error: error.message });
        } finally {
            activeRequests.current.delete(id);
            setAnalyzingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };


    const handleDeleteLead = (id?: string) => {
        if (!id) return;
        setDeleteModal({ isOpen: true, ids: [id] });
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        setDeleteModal({ isOpen: true, ids: Array.from(selectedIds) });
    };

    const executeDeletion = async () => {
        const idsToDelete = deleteModal.ids;
        if (idsToDelete.length === 0) return;

        setDeleteModal({ isOpen: false, ids: [] });

        // Optimistic UI update
        const oldData = [...localData];
        const oldSelected = new Set(selectedIds);

        setLocalData(localData.filter(l => !idsToDelete.includes(l._id as string)));
        setSelectedIds(prev => {
            const next = new Set(prev);
            idsToDelete.forEach(id => next.delete(id));
            return next;
        });

        try {
            const res = await fetch(`/api/leads?id=${idsToDelete.join(',')}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Delete failed with status ${res.status}`);
            }

            fetchLeads();
        } catch (error: any) {
            console.error('Failed deletion:', error);
            setLocalData(oldData);
            setSelectedIds(oldSelected);
            setAnalysisModal({ isOpen: true, error: `Failed to delete items: ${error.message}` });
        }
    };




    const toggleSelectAll = () => {
        if (selectedIds.size === localData.length && localData.length > 0) {
            setSelectedIds(new Set());
        } else {
            const newSelected = new Set(localData.map(l => l._id).filter(id => !!id) as string[]);
            setSelectedIds(newSelected);
        }
    };

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };




    // Get unique categories for filter
    const categories = ['All', ...new Set(localData.map(p => p.businessCategoryName).filter(Boolean))] as string[];

    // Simplified sorting handler
    const handleSort = (key: keyof InstagramProfile) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
        setCurrentPage(1); // Reset to first page on sort
    };


    const downloadCSV = () => {
        const headers = ['Username', 'Full Name', 'Followers', 'Category', 'Emails', 'Phones', 'URL'];
        const csvContent = [
            headers.join(','),
            ...localData.map(p => { // Use localData as it's the current page's data
                const { emails, phones } = extractLeads(p.biography);
                return [
                    p.username,
                    `"${p.fullName || ''}"`,
                    p.followersCount || 0,
                    `"${p.businessCategoryName || 'N/A'}"`,
                    `"${emails.join('; ')}"`,
                    `"${phones.join('; ')}"`,
                    p.url
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="w-full space-y-6">
            {/* Filters and Actions */}
            <div className="flex flex-col gap-6 p-4 sm:p-8 bg-slate-900/50">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative group">
                            <input
                                type="text"
                                placeholder="Search usernames, names or bios..."
                                className="w-full sm:w-80 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-600"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                            <div className="absolute right-3 top-3.5 text-slate-600 group-focus-within:text-indigo-400 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>

                        {selectedIds.size > 0 && (
                            <button
                                onClick={handleBulkDelete}
                                className="px-4 py-3 bg-rose-600/10 border border-rose-600/20 text-rose-500 rounded-xl text-sm font-black hover:bg-rose-600 hover:text-white transition-all flex items-center gap-2 animate-in fade-in slide-in-from-left-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete {selectedIds.size} Selected
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Impact Category</label>
                            <select
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                                value={categoryFilter}
                                onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
                            >
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Follower Range</label>
                            <select
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                                value={followerRange}
                                onChange={(e) => { setFollowerRange(e.target.value); setCurrentPage(1); }}
                            >
                                <option value="All">All Sizes</option>
                                <option value="0-1k">Micro (&lt;1k)</option>
                                <option value="1k-10k">Growing (1k-10k)</option>
                                <option value="10k-100k">Influencer (10k-100k)</option>
                                <option value="100k+">Authority (100k+)</option>
                            </select>
                        </div>

                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Status Filter</label>
                            <select
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                            >
                                <option value="All">All Leads</option>
                                <option value="new">New Leads</option>
                                <option value="for design reference">Design Refs</option>
                                <option value="can contact">Potential</option>
                                <option value="contacted">Contacted</option>
                            </select>

                        </div>

                    </div>
                </div>


                <div className="flex items-center gap-4 justify-end">
                    <div className="text-right">
                        <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">Leads Found</div>
                        <div className="text-2xl font-black text-indigo-400">{totalLeads.toLocaleString('en-US')}</div>
                    </div>

                    <button
                        onClick={downloadCSV}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export CSV
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-y-auto scrollbar-hide">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-20">
                        <tr className="bg-slate-800 border-b border-slate-700 shadow-sm text-[10px] sm:text-xs">
                            <th className="px-3 sm:px-4 py-4 text-left w-10">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500/50 transition-all cursor-pointer"
                                    checked={localData.length > 0 && selectedIds.size === localData.length}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider text-left">
                                <button
                                    onClick={() => handleSort('username')}
                                    className="flex items-center gap-1"
                                >
                                    User Profile {sortConfig.key === 'username' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider text-left">Pipeline</th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider text-right cursor-pointer hover:text-white" onClick={() => handleSort('followersCount')}>
                                Stats {sortConfig.key === 'followersCount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider cursor-pointer hover:text-white" onClick={() => handleSort('businessCategoryName')}>
                                Niche {sortConfig.key === 'businessCategoryName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider text-left">Updated</th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider">Contacts</th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider">Action</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-800">
                        {localData.map((profile, idx) => {

                            const { emails, phones } = extractLeads(profile.biography);

                            // Collect unique links
                            const allLinks = new Map<string, string>();
                            if (profile.externalUrls) profile.externalUrls.forEach(l => l.url && allLinks.set(l.url, l.title || 'Link'));
                            if (profile.externalUrl && !allLinks.has(profile.externalUrl)) allLinks.set(profile.externalUrl, 'Web');
                            const linkEntries = Array.from(allLinks.entries());
                            const isAnalyzing = analyzingIds.has(profile._id as string);

                            return (
                                <React.Fragment key={profile._id || idx}>
                                <tr className="group border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors duration-300">
                                    <td className="px-3 sm:px-4 py-5">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500/50 transition-all cursor-pointer"
                                            checked={selectedIds.has(profile._id || '')}
                                            onChange={() => toggleSelect(profile._id || '')}
                                        />
                                    </td>
                                    <td className="px-3 sm:px-4 py-5">

                                        <div className="flex items-center gap-4">
                                            <img
                                                src={profile.profilePicUrl ? `/api/proxy?url=${encodeURIComponent(profile.profilePicUrl)}` : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                                                alt={profile.username}
                                                referrerPolicy="no-referrer"
                                                className="w-12 h-12 rounded-2xl border-2 border-slate-700 group-hover:border-indigo-500 transition-all object-cover shadow-lg"
                                                onError={(e) => { (e.target as HTMLImageElement).src = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'; }}
                                            />


                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5">
                                                    <a href={profile.url} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-100 hover:text-indigo-400 transition-colors text-base">
                                                        @{profile.username}
                                                    </a>
                                                    {profile.verified && <span className="text-blue-400"><svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.4-1.4 2.7 2.7 5.9-5.9 1.4 1.4-7.3 7.3z" /></svg></span>}
                                                </div>
                                                <div className="text-sm text-slate-400 font-medium">{profile.fullName}</div>
                                                <p className="text-xs text-slate-500 line-clamp-1 mt-1 italic max-w-xs">{profile.biography}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 sm:px-4 py-5 text-right whitespace-nowrap">
                                        <select
                                            value={profile.status || 'new'}
                                            onChange={(e) => handleStatusUpdate(profile._id!, e.target.value as any)}
                                            className={`
                                                text-[10px] font-black py-1.5 px-3 rounded-lg border appearance-none cursor-pointer transition-all uppercase tracking-tighter outline-none
                                                ${profile.status === 'contacted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                    profile.status === 'can contact' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                        profile.status === 'for design reference' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                            'bg-slate-800 text-slate-400 border-slate-700'}
                                                hover:brightness-110 active:scale-95
                                            `}
                                        >
                                            <option value="new">New</option>
                                            <option value="for design reference">Ref</option>
                                            <option value="can contact">Contact</option>
                                            <option value="contacted">Done</option>
                                        </select>
                                    </td>


                                    <td className="px-3 sm:px-4 py-5 text-right">

                                        <div className="text-slate-100 font-bold text-lg leading-tight">
                                            {profile.followersCount?.toLocaleString('en-US') || 0}
                                        </div>

                                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">
                                            {profile.postsCount || 0} Posts
                                        </div>
                                    </td>
                                    <td className="px-2 sm:px-3 py-5 max-w-[120px]">
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 whitespace-normal line-clamp-2 text-center inline-block">
                                            {profile.businessCategoryName || 'General'}
                                        </span>
                                    </td>
                                    <td className="px-3 sm:px-4 py-5 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                        {profile.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : 'N/A'}
                                    </td>


                                    <td className="px-3 sm:px-4 py-5">
                                        <div className="space-y-2">
                                            {(emails.length > 0 || phones.length > 0) ? (
                                                <>
                                                    {emails.map((e, i) => (
                                                        <div key={i} className="flex items-center gap-2.5 text-sm text-emerald-400 font-bold bg-emerald-400/10 px-3 py-1 rounded-lg border border-emerald-400/20">
                                                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                            {e}
                                                        </div>
                                                    ))}
                                                    {phones.map((p, i) => (
                                                        <div key={i} className="flex items-center gap-2.5 text-sm text-blue-400 font-bold bg-blue-400/10 px-3 py-1 rounded-lg border border-blue-400/20">
                                                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                                            {p}
                                                        </div>
                                                    ))}
                                                </>
                                            ) : (
                                                <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">No contact info</span>
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-3 sm:px-4 py-5">
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-wrap gap-2 max-w-[150px] flex-1">
                                                {linkEntries.length > 0 ? (
                                                    linkEntries.map(([url, title], lIdx) => (
                                                        <a
                                                            key={lIdx}
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[10px] font-black text-indigo-400 hover:text-white uppercase px-2 py-1 rounded bg-indigo-400/5 border border-indigo-400/10 transition-all hover:bg-indigo-600"
                                                            title={url}
                                                        >
                                                            {title || 'Visit'}
                                                        </a>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-slate-700 italic">Static Profile</span>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => handleDeleteLead(profile._id)}
                                                className="p-1.5 rounded-lg text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-90"
                                                title="Remove Entry"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    if (hasAnalysis(profile.aiAnalysis)) {
                                                        setAnalysisModal({ isOpen: true, leadId: profile._id as string, data: profile.aiAnalysis });
                                                    } else {
                                                        handleAnalyze(profile._id as string);
                                                    }
                                                }}
                                                disabled={isAnalyzing}
                                                className={`p-1.5 rounded-lg transition-all active:scale-90 flex items-center gap-1 ${
                                                    hasAnalysis(profile.aiAnalysis) 
                                                    ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10' 
                                                    : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                                                } ${isAnalyzing ? 'opacity-50 cursor-wait' : ''}`}
                                                title={hasAnalysis(profile.aiAnalysis) ? "View Analysis" : "Analyze Lead"}
                                            >
                                                {isAnalyzing ? (
                                                     <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                ) : hasAnalysis(profile.aiAnalysis) ? (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                    </svg>
                                                )}
                                            </button>


                                        </div>
                                    </td>

                                </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
                {localData.length === 0 && !isLoading && (
                    <div className="p-20 text-center text-slate-500 font-bold">
                        No leads found matching your criteria. Try widening your search!
                    </div>
                )}
                {isLoading && (
                    <div className="p-20 text-center text-indigo-400 font-bold animate-pulse">
                        Loading fresh leads...
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <div className="text-sm text-slate-500 font-medium">
                    Page <span className="text-slate-200">{currentPage}</span> of <span className="text-slate-200">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1 || isLoading}
                        className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages || isLoading}
                        className="px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* Analysis & Error Modal */}
            {analysisModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setAnalysisModal({ isOpen: false })} />
                    <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
                        {analysisModal.error ? (
                            <div className="text-center">
                                <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                                    <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-black text-slate-100 mb-2">Error</h3>
                                <p className="text-rose-400 mb-8">{analysisModal.error}</p>
                                <button onClick={() => setAnalysisModal({ isOpen: false })} className="px-6 py-3 bg-slate-800 text-white rounded-xl text-sm font-black hover:bg-slate-700 transition-all">Close</button>
                            </div>
                        ) : analysisModal.data ? (
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <h3 className="text-2xl font-black text-slate-100 flex items-center gap-3">
                                        <span className="bg-indigo-500/20 text-indigo-400 p-2 rounded-xl">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                        </span>
                                        Cold Call Kit
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        {analysisModal.data.category && (
                                            <span className="text-xs font-bold uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-full">
                                                {analysisModal.data.category}
                                            </span>
                                        )}
                                        <button onClick={() => setAnalysisModal({ isOpen: false })} className="text-slate-500 hover:text-white transition-colors">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Pain Points */}
                                {analysisModal.data.painPoints?.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-black tracking-widest text-rose-400 mb-3 flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                            Pain Points ({analysisModal.data.painPoints.length})
                                        </h4>
                                        <div className="space-y-2">
                                            {analysisModal.data.painPoints.map((point: string, i: number) => (
                                                <div key={i} className="flex items-start gap-3 bg-rose-500/5 border border-rose-500/15 rounded-xl p-3">
                                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                                                    <p className="text-sm text-slate-300 leading-relaxed">{point}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Cold Call Opener */}
                                {analysisModal.data.coldCallOpener && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-black tracking-widest text-blue-400 mb-3 flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                                            Cold Call Opener
                                        </h4>
                                        <div className="relative group">
                                            <p className="text-sm text-slate-200 bg-blue-500/5 border border-blue-500/15 rounded-xl p-4 italic leading-relaxed pr-24">{analysisModal.data.coldCallOpener}</p>
                                            <button
                                                onClick={(e) => {
                                                    navigator.clipboard.writeText(analysisModal.data?.coldCallOpener || '');
                                                    const btn = e.currentTarget;
                                                    const orig = btn.innerText;
                                                    btn.innerText = 'Copied!';
                                                    setTimeout(() => { btn.innerText = orig; }, 2000);
                                                }}
                                                className="absolute top-3 right-3 text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-md transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                                            >Copy</button>
                                        </div>
                                    </div>
                                )}

                                {/* Conversation Hooks */}
                                {analysisModal.data.conversationHooks?.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-black tracking-widest text-emerald-400 mb-3 flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Conversation Hooks — Ask These
                                        </h4>
                                        <div className="space-y-2">
                                            {analysisModal.data.conversationHooks.map((hook: string, i: number) => (
                                                <div key={i} className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 group/hook">
                                                    <span className="flex-shrink-0 text-emerald-500 mt-0.5">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                    </span>
                                                    <p className="text-sm text-slate-300 leading-relaxed flex-1">{hook}</p>
                                                    <button
                                                        onClick={() => navigator.clipboard.writeText(hook)}
                                                        className="flex-shrink-0 opacity-0 group-hover/hook:opacity-100 transition-opacity text-slate-500 hover:text-emerald-400"
                                                        title="Copy this question"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Objection Handlers */}
                                {analysisModal.data.objectionHandlers?.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-black tracking-widest text-amber-400 mb-3 flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                            Objection Handlers
                                        </h4>
                                        <div className="space-y-3">
                                            {analysisModal.data.objectionHandlers.map((item: { objection: string; response: string }, i: number) => (
                                                <div key={i} className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 space-y-2">
                                                    <p className="text-xs font-black text-amber-400 uppercase tracking-wider">❝ {item.objection}</p>
                                                    <p className="text-sm text-slate-300 leading-relaxed">{item.response}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDeleteModal({ isOpen: false, ids: [] })} />
                    <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                            <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-black text-slate-100 text-center mb-2">Confirm Deletion</h3>
                        <p className="text-slate-400 text-center mb-8">
                            Are you sure you want to permanently remove {deleteModal.ids.length === 1 ? 'this entry' : `${deleteModal.ids.length} selected entries`}? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteModal({ isOpen: false, ids: [] })}
                                className="flex-1 px-6 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-700 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeDeletion}
                                className="flex-1 px-6 py-3 bg-rose-600 text-white rounded-xl text-sm font-black hover:bg-rose-500 transition-all"
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

